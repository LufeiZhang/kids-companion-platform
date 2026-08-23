import { Router } from "express";
import { prisma } from "../database/client.js";
import { requireAuth, type AuthRequest } from "../auth/security.js";

export const classesRouter = Router();
classesRouter.use(requireAuth());

const roomInclude = {
  teacher: { select: { id: true, name: true, email: true, role: true } },
  students: { include: { student: { select: { id: true, name: true, email: true, role: true, avatar: true } } } }
} as const;

const studentAccessForTeacher = (teacherId: string) => ({
  OR: [
    { group: { teacherId } },
    { groupMemberships: { some: { group: { teacherId } } } }
  ]
});

async function attachCourseware<T extends { coursewareId: string | null }>(room: T | null) {
  if (!room) return null;
  const courseware = room.coursewareId
    ? await prisma.courseware.findUnique({ where: { id: room.coursewareId } })
    : null;
  return { ...room, courseware };
}

async function attachCoursewareList<T extends { coursewareId: string | null }>(rooms: T[]) {
  const coursewareIds = [...new Set(rooms.map(({ coursewareId }) => coursewareId).filter(Boolean))] as string[];
  if (!coursewareIds.length) return rooms.map((room) => ({ ...room, courseware: null }));
  const courseware = await prisma.courseware.findMany({ where: { id: { in: coursewareIds } } });
  const coursewareById = new Map(courseware.map((item) => [item.id, item]));
  return rooms.map((room) => ({
    ...room,
    courseware: room.coursewareId ? coursewareById.get(room.coursewareId) ?? null : null
  }));
}

classesRouter.get("/", async (request: AuthRequest, response) => {
  const auth = request.auth!;
  const where = auth.role === "teacher"
    ? { teacherId: auth.id }
    : auth.role === "student"
      ? { students: { some: { studentId: auth.id } } }
      : {};
  const rooms = await prisma.classRoom.findMany({
    where,
    include: roomInclude,
    orderBy: { createdAt: "desc" }
  });
  response.json(await attachCoursewareList(rooms));
});

classesRouter.post("/", requireAuth(["teacher"]), async (request: AuthRequest, response) => {
  const { title, studentIds } = request.body as { title?: string; studentIds?: string[] };
  const uniqueStudentIds = [...new Set((studentIds ?? []).filter((studentId): studentId is string => typeof studentId === "string" && Boolean(studentId)))];
  if (!title || !uniqueStudentIds.length) return response.status(400).json({ message: "请选择至少一名学生" });
  const allowedStudents = await prisma.user.count({
    where: {
      id: { in: uniqueStudentIds },
      role: "student",
      studentProfile: studentAccessForTeacher(request.auth!.id)
    }
  });
  if (allowedStudents !== uniqueStudentIds.length) {
    return response.status(403).json({ message: "只能邀请分配给你的学生" });
  }
  const room = await prisma.classRoom.create({
    data: {
      title,
      teacherId: request.auth!.id,
      students: { create: uniqueStudentIds.map((studentId) => ({ studentId })) }
    },
    include: roomInclude
  });
  response.status(201).json(await attachCourseware(room));
});

classesRouter.get("/:id", async (request: AuthRequest, response) => {
  const roomId = String(request.params.id);
  const room = await prisma.classRoom.findUnique({ where: { id: roomId }, include: roomInclude });
  if (!room) return response.status(404).json({ message: "课堂不存在" });
  const allowed = request.auth!.role === "admin"
    || room.teacherId === request.auth!.id
    || room.students.some(({ studentId }) => studentId === request.auth!.id);
  if (!allowed) return response.status(403).json({ message: "你未被授权进入该课堂" });
  response.json(await attachCourseware(room));
});

classesRouter.post("/:id/start", requireAuth(["teacher"]), async (request: AuthRequest, response) => {
  const roomId = String(request.params.id);
  const result = await prisma.classRoom.updateMany({
    where: { id: roomId, teacherId: request.auth!.id, status: { not: "ended" } },
    data: { status: "active", startedAt: new Date() }
  });
  if (!result.count) return response.status(403).json({ message: "无法开启此课堂" });
  response.json(await attachCourseware(await prisma.classRoom.findUnique({ where: { id: roomId }, include: roomInclude })));
});

classesRouter.post("/:id/end", requireAuth(["teacher"]), async (request: AuthRequest, response) => {
  const roomId = String(request.params.id);
  const result = await prisma.classRoom.updateMany({
    where: { id: roomId, teacherId: request.auth!.id },
    data: { status: "ended", endedAt: new Date() }
  });
  if (!result.count) return response.status(403).json({ message: "无法结束此课堂" });
  response.json({ ok: true });
});
