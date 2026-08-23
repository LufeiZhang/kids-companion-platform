import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { Prisma } from "@prisma/client";
import {
  MESSAGE_ACTIONS,
  type ClassroomPraisePayload,
  type PomodoroPayload,
  type SignalAck,
  type SignalMessage
} from "@companion/types";
import { prisma } from "../database/client.js";
import { verifyToken, type AuthUser } from "../auth/security.js";
import { generateClassSessionReports } from "../classes/reporting.js";

type Ack = (ack: SignalAck) => void;
type AuthedSocket = Socket & { data: { user: AuthUser; currentRoom?: string } };

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function isSignalMessage(value: unknown): value is SignalMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<SignalMessage>;
  if (!message.msg_id || !message.msg_type || !message.action || !message.room_id || !message.from_uid) return false;
  const actions = MESSAGE_ACTIONS[message.msg_type];
  return Boolean(actions && (actions as readonly string[]).includes(message.action));
}

function pomodoroPayloadFromRoom(room: {
  pomodoroStatus: string | null;
  pomodoroDurationSeconds: number | null;
  pomodoroStartedAt: Date | null;
  pomodoroEndsAt: Date | null;
  pomodoroRemainingSeconds: number | null;
  pomodoroLabel: string | null;
}): PomodoroPayload | null {
  if (!room.pomodoroStatus || room.pomodoroStatus === "stopped") return null;
  return {
    status: room.pomodoroStatus as PomodoroPayload["status"],
    durationSeconds: room.pomodoroDurationSeconds ?? 0,
    startedAt: room.pomodoroStartedAt?.getTime(),
    endsAt: room.pomodoroEndsAt?.getTime(),
    remainingSeconds: room.pomodoroRemainingSeconds ?? undefined,
    label: room.pomodoroLabel ?? undefined
  };
}

async function getRoomAccess(roomId: string, user: AuthUser) {
  const room = await prisma.classRoom.findUnique({
    where: { id: roomId },
    include: { students: true }
  });
  if (!room) return { room: null, allowed: false, isTeacher: false, isStudent: false };
  const isTeacher = user.role === "teacher" && room.teacherId === user.id;
  const isStudent = user.role === "student" && room.students.some(({ studentId }) => studentId === user.id);
  return { room, allowed: user.role === "admin" || isTeacher || isStudent, isTeacher, isStudent };
}

async function saveSignal(message: SignalMessage, ackStatus: string) {
  // SDP and ICE can contain network metadata. Keep only an event marker in logs.
  const payload = message.msg_type === "RTC_SIGNAL"
    ? json({ rtc_event: message.action })
    : json(message.payload);
  await prisma.signalLog.upsert({
    where: { msgId: message.msg_id },
    update: { ackStatus },
    create: {
      msgId: message.msg_id,
      roomId: message.room_id,
      fromUserId: message.from_uid,
      targetUserId: message.target_uid,
      msgType: message.msg_type,
      action: message.action,
      payload,
      ackStatus
    }
  });
}

export function createSocketGateway(httpServer: HttpServer, origins: string[]) {
  const allowAnyOrigin = origins.includes("*");
  const io = new Server(httpServer, {
    cors: {
      origin: allowAnyOrigin ? "*" : origins,
      credentials: !allowAnyOrigin
    }
  });

  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth.token ?? "");
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthedSocket;

    socket.on("signal", async (candidate: unknown, ack: Ack = () => undefined) => {
      let message: SignalMessage | null = null;
      try {
        if (!isSignalMessage(candidate)) {
          return ack({ ok: false, msg_id: "unknown", error: "信令格式或 action 不合法" });
        }
        message = candidate;
        if (message.from_uid !== socket.data.user.id) {
          return ack({ ok: false, msg_id: message.msg_id, error: "from_uid 与登录身份不一致" });
        }

        const access = await getRoomAccess(message.room_id, socket.data.user);
        if (!access.room || !access.allowed) {
          return ack({ ok: false, msg_id: message.msg_id, error: "无权访问该课堂" });
        }

        const teacherOnly = ["WHITEBOARD_EVENT", "COURSEWARE_CONTROL", "TEACHER_CONTROL", "CLASSROOM_PRAISE", "POMODORO_CONTROL"].includes(message.msg_type)
          || (message.msg_type === "ROOM_EVENT" && ["ROOM_STARTED", "ROOM_ENDED"].includes(message.action));
        if (teacherOnly && !access.isTeacher) {
          return ack({ ok: false, msg_id: message.msg_id, error: "此操作仅限本课堂教师" });
        }
        if (message.msg_type === "STUDENT_STATUS" && !access.isStudent) {
          return ack({ ok: false, msg_id: message.msg_id, error: "状态只能由课堂学生上报" });
        }
        if (message.msg_type === "STUDENT_INTERACTION" && !access.isStudent) {
          return ack({ ok: false, msg_id: message.msg_id, error: "课堂互动只能由学生发起" });
        }
        const participantIds = [
          access.room.teacherId,
          ...access.room.students.map(({ studentId }) => studentId)
        ];
        if (message.target_uid && (!participantIds.includes(message.target_uid) || message.target_uid === socket.data.user.id)) {
          return ack({ ok: false, msg_id: message.msg_id, error: "目标用户不在本课堂" });
        }
        if (message.msg_type === "RTC_SIGNAL" && !message.target_uid) {
          return ack({ ok: false, msg_id: message.msg_id, error: "音视频信令必须指定目标用户" });
        }
        if (message.msg_type === "RTC_SIGNAL" && !access.isTeacher && !access.isStudent) {
          return ack({ ok: false, msg_id: message.msg_id, error: "只有课堂教师和学生可以发起音视频" });
        }
        if (message.msg_type === "STUDENT_INTERACTION" && message.target_uid !== access.room.teacherId) {
          return ack({ ok: false, msg_id: message.msg_id, error: "学生互动只能发送给本课堂教师" });
        }
        if (message.msg_type === "CLASSROOM_PRAISE" && message.target_uid) {
          return ack({ ok: false, msg_id: message.msg_id, error: "公开表扬会广播给全课堂，不需要指定目标用户" });
        }
        if (message.msg_type === "POMODORO_CONTROL" && message.target_uid) {
          return ack({ ok: false, msg_id: message.msg_id, error: "番茄钟由教师控制并广播给全课堂，不需要指定目标用户" });
        }

        if (message.msg_type === "ROOM_EVENT" && message.action === "JOIN_ROOM") {
          await socket.join(message.room_id);
          socket.data.currentRoom = message.room_id;
          if (access.isStudent) {
            await prisma.classRoomStudent.update({
              where: { roomId_studentId: { roomId: message.room_id, studentId: socket.data.user.id } },
              data: { joinedAt: new Date() }
            });
          }
          if (access.room.coursewareId) {
            const courseware = await prisma.courseware.findUnique({ where: { id: access.room.coursewareId } });
            if (courseware) {
              socket.emit("signal", {
                msg_id: crypto.randomUUID(),
                msg_type: "COURSEWARE_CONTROL",
                action: "OPEN_COURSEWARE",
                room_id: message.room_id,
                from_uid: access.room.teacherId,
                target_uid: socket.data.user.id,
                timestamp: Date.now(),
                payload: {
                  courseware_id: courseware.id,
                  file_url: courseware.fileUrl,
                  file_type: courseware.type,
                  page: access.room.currentPage
                }
              } satisfies SignalMessage);
            }
          }
          const activePomodoro = pomodoroPayloadFromRoom(access.room);
          if (activePomodoro) {
            socket.emit("signal", {
              msg_id: crypto.randomUUID(),
              msg_type: "POMODORO_CONTROL",
              action: activePomodoro.status === "paused" ? "PAUSE_POMODORO" : activePomodoro.status === "completed" ? "FINISH_POMODORO" : "START_POMODORO",
              room_id: message.room_id,
              from_uid: access.room.teacherId,
              target_uid: socket.data.user.id,
              timestamp: Date.now(),
              payload: activePomodoro
            } satisfies SignalMessage<PomodoroPayload>);
          }
        }

        if (message.msg_type === "WHITEBOARD_EVENT") {
          await prisma.whiteboardEvent.create({
            data: {
              roomId: message.room_id,
              userId: socket.data.user.id,
              eventType: message.action,
              payload: json(message.payload)
            }
          });
        }

        if (message.msg_type === "COURSEWARE_CONTROL") {
          const payload = message.payload as { courseware_id?: string; page?: number };
          await prisma.classRoom.update({
            where: { id: message.room_id },
            data: {
              coursewareId: payload.courseware_id,
              currentPage: payload.page ?? access.room.currentPage
            }
          });
        }

        if (message.msg_type === "TEACHER_CONTROL" && message.action === "GRANT_REWARD") {
          const payload = message.payload as { reward_type?: string; message?: string };
          if (!message.target_uid) throw new Error("奖励必须指定学生");
          await prisma.rewardLog.create({
            data: {
              roomId: message.room_id,
              teacherId: socket.data.user.id,
              studentId: message.target_uid,
              rewardType: payload.reward_type ?? "red_flower",
              message: payload.message
            }
          });
        }

        if (message.msg_type === "CLASSROOM_PRAISE" && message.action === "TASK_COMPLETED_PRAISE") {
          const payload = message.payload as unknown as ClassroomPraisePayload;
          if (!payload.student_id) throw new Error("公开表扬必须指定学生");
          const praisedStudentInRoom = access.room.students.some(({ studentId }) => studentId === payload.student_id);
          if (!praisedStudentInRoom) throw new Error("只能表扬本课堂内的学生");
          if (payload.task_id) {
            const task = await prisma.learningTask.findFirst({
              where: {
                id: payload.task_id,
                teacherId: socket.data.user.id,
                studentId: payload.student_id
              },
              select: { id: true }
            });
            if (!task) throw new Error("任务不存在或不属于该学生");
          }
          await prisma.rewardLog.create({
            data: {
              roomId: message.room_id,
              teacherId: socket.data.user.id,
              studentId: payload.student_id,
              rewardType: "task_praise",
              message: payload.message
            }
          });
        }

        if (message.msg_type === "POMODORO_CONTROL") {
          const payload = message.payload as unknown as PomodoroPayload;
          await prisma.classRoom.update({
            where: { id: message.room_id },
            data: {
              pomodoroStatus: payload.status,
              pomodoroDurationSeconds: payload.durationSeconds,
              pomodoroStartedAt: payload.startedAt ? new Date(payload.startedAt) : null,
              pomodoroEndsAt: payload.endsAt ? new Date(payload.endsAt) : null,
              pomodoroRemainingSeconds: payload.remainingSeconds ?? null,
              pomodoroLabel: payload.label ?? null
            }
          });
        }

        if (message.msg_type === "ROOM_EVENT" && message.action === "ROOM_STARTED") {
          await prisma.classRoom.update({
            where: { id: message.room_id },
            data: { status: "active", startedAt: access.room.startedAt ?? new Date() }
          });
        }
        if (message.msg_type === "ROOM_EVENT" && message.action === "ROOM_ENDED") {
          await prisma.classRoom.update({
            where: { id: message.room_id },
            data: {
              status: "ended",
              endedAt: new Date(),
              pomodoroStatus: "stopped",
              pomodoroRemainingSeconds: 0
            }
          });
          await generateClassSessionReports(message.room_id).catch(() => undefined);
        }

        await saveSignal(message, "ACKED");
        if (message.msg_type === "CLASSROOM_PRAISE") {
          io.to(message.room_id).emit("signal", message);
        } else if (message.target_uid) {
          for (const client of await io.in(message.room_id).fetchSockets()) {
            if (client.data.user?.id === message.target_uid) client.emit("signal", message);
          }
        } else {
          socket.to(message.room_id).emit("signal", message);
        }
        ack({ ok: true, msg_id: message.msg_id });

        if (message.msg_type === "ROOM_EVENT" && message.action === "LEAVE_ROOM") {
          await socket.leave(message.room_id);
          socket.data.currentRoom = undefined;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "信令处理失败";
        if (message) await saveSignal(message, `FAILED: ${errorMessage}`).catch(() => undefined);
        ack({ ok: false, msg_id: message?.msg_id ?? "unknown", error: errorMessage });
      }
    });

    socket.on("disconnect", async () => {
      const roomId = socket.data.currentRoom;
      if (!roomId) return;
      const offline: SignalMessage = {
        msg_id: crypto.randomUUID(),
        msg_type: "ROOM_EVENT",
        action: "USER_OFFLINE",
        room_id: roomId,
        from_uid: socket.data.user.id,
        timestamp: Date.now(),
        payload: { reason: "socket_disconnected" }
      };
      socket.to(roomId).emit("signal", offline);
      await saveSignal(offline, "SERVER_GENERATED").catch(() => undefined);
    });
  });

  return io;
}
