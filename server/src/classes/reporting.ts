import { Prisma } from "@prisma/client";
import { prisma } from "../database/client.js";

type SummaryInput = {
  roomTitle: string;
  studentName: string;
  durationMinutes: number;
  leftPageCount: number;
  rewardCount: number;
  completedTaskCount: number;
  handRaiseCount: number;
  feedbackCount: number;
  earlyFinishCount: number;
  idleCount: number;
  focusScore: number;
  focusScoreReason: string[];
  taskTitles: string[];
  teacherNotes?: string | null;
};

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function payloadObject(payload: Prisma.JsonValue): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function buildTemplateSummary(input: SummaryInput) {
  const taskText = input.taskTitles.length
    ? input.taskTitles.join("、")
    : "课堂任务与白板互动";
  const attentionText = input.leftPageCount === 0 && input.idleCount === 0
    ? "本节课页面保持稳定，未发现明显离开页面或长时间无操作记录。"
    : `本节课记录到 ${input.leftPageCount} 次页面离开、${input.idleCount} 次长时间无操作提醒，建议后续继续观察。`;
  const performanceText = input.completedTaskCount > 0
    ? `${input.studentName} 本节课完成 ${input.completedTaskCount} 个课堂任务，收到 ${input.rewardCount} 次正向激励，并有 ${input.handRaiseCount + input.feedbackCount + input.earlyFinishCount} 次主动反馈。`
    : `${input.studentName} 本节课收到 ${input.rewardCount} 次正向激励，有 ${input.handRaiseCount + input.feedbackCount + input.earlyFinishCount} 次互动反馈，任务完成情况建议老师课后补充确认。`;
  const notes = input.teacherNotes?.trim();
  return {
    provider: "template_mvp" as const,
    generatedAt: new Date().toISOString(),
    learningContent: `本节课围绕「${input.roomTitle}」开展，主要包含 ${taskText}。`,
    studentPerformance: notes ? `${performanceText} 教师备注：${notes}` : performanceText,
    attention: attentionText,
    reviewPoints: input.taskTitles.length
      ? input.taskTitles.map((title) => `复习任务：${title}`)
      : ["请老师补充本节课重点知识点，便于后续 AI 复习。"],
    nextLessonSuggestion: input.focusScore >= 80
      ? "下节课可以适当提高任务挑战度，并继续保留及时表扬。"
      : "下节课建议拆小任务、缩短单段专注时间，并增加更频繁的正向反馈。",
    parentSummary: `${input.studentName} 今天完成了一节 ${input.durationMinutes || "短时"} 分钟的伴学课，专注评分 ${input.focusScore} 分。课堂中老师已记录学习表现，建议家长以鼓励为主，帮助孩子保持稳定节奏。`,
    focusScoreReason: input.focusScoreReason,
    teacherNotes: notes || null,
    futureAiEnabled: false
  };
}

function scoreFocus(input: {
  onTime: boolean;
  leftPageCount: number;
  completedTaskCount: number;
  handRaiseCount: number;
  feedbackCount: number;
  earlyFinishCount: number;
  idleCount: number;
}) {
  let score = 60;
  const reasons: string[] = [];
  if (input.onTime) {
    score += 15;
    reasons.push("准时进入课堂 +15");
  } else {
    score -= 10;
    reasons.push("未记录到准时进入课堂 -10");
  }
  const leavePenalty = Math.min(25, input.leftPageCount * 8);
  if (leavePenalty) {
    score -= leavePenalty;
    reasons.push(`页面切出 ${input.leftPageCount} 次 -${leavePenalty}`);
  } else {
    reasons.push("未记录到页面切出 +0");
  }
  if (input.completedTaskCount > 0) {
    score += 15;
    reasons.push("完成课堂任务 +15");
  }
  if (input.handRaiseCount + input.feedbackCount + input.earlyFinishCount > 0) {
    score += 10;
    reasons.push("有举手或反馈 +10");
  }
  if (input.idleCount >= 2) {
    score -= 15;
    reasons.push("多次长时间无操作 -15");
  }
  return { score: clamp(score, 0, 100), reasons };
}

export async function generateClassSessionReports(roomId: string) {
  const room = await prisma.classRoom.findUnique({
    where: { id: roomId },
    include: {
      teacher: { select: { id: true, name: true } },
      students: {
        include: {
          student: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });
  if (!room) throw new Error("课堂不存在");
  const startedAt = room.startedAt ?? room.createdAt;
  const endedAt = room.endedAt ?? new Date();
  const durationMinutes = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
  const [signals, rewards, completedTasks, existingReports] = await Promise.all([
    prisma.signalLog.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    prisma.rewardLog.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    prisma.learningTask.findMany({
      where: {
        teacherId: room.teacherId,
        studentId: { in: room.students.map(({ studentId }) => studentId) },
        status: "completed",
        completedAt: { gte: startedAt, lte: endedAt }
      },
      select: { id: true, title: true, studentId: true }
    }),
    prisma.classSessionReport.findMany({ where: { roomId } })
  ]);
  const existingByStudent = new Map(existingReports.map((report) => [report.studentId, report]));

  const reports = [];
  for (const membership of room.students) {
    const student = membership.student;
    const studentSignals = signals.filter(({ fromUserId }) => fromUserId === student.id);
    const praiseSignals = signals.filter((signal) => {
      if (signal.msgType !== "CLASSROOM_PRAISE" || signal.action !== "TASK_COMPLETED_PRAISE") return false;
      return payloadObject(signal.payload).student_id === student.id;
    });
    const studentRewards = rewards.filter(({ studentId }) => studentId === student.id);
    const taskTitles = [
      ...new Set([
        ...praiseSignals
          .map((signal) => payloadObject(signal.payload).task_title)
          .filter((value): value is string => typeof value === "string" && Boolean(value)),
        ...completedTasks
          .filter((task) => task.studentId === student.id)
          .map((task) => task.title)
      ])
    ];
    const completedTaskCount = Math.max(
      completedTasks.filter((task) => task.studentId === student.id).length,
      taskTitles.length
    );
    const leftPageCount = studentSignals.filter(({ msgType, action }) => msgType === "STUDENT_STATUS" && action === "PAGE_HIDDEN").length;
    const idleCount = studentSignals.filter(({ msgType, action }) => msgType === "STUDENT_STATUS" && action === "IDLE").length;
    const handRaiseCount = studentSignals.filter(({ msgType, action }) => msgType === "STUDENT_INTERACTION" && action === "RAISE_HAND").length;
    const feedbackCount = studentSignals.filter(({ msgType, action }) => msgType === "STUDENT_INTERACTION" && action === "SEND_EMOJI").length;
    const earlyFinishCount = studentSignals.filter(({ msgType, action }) => msgType === "STUDENT_INTERACTION" && action === "POMODORO_FINISHED_EARLY").length;
    const onTime = Boolean(membership.joinedAt && membership.joinedAt.getTime() - startedAt.getTime() <= 5 * 60 * 1000);
    const focus = scoreFocus({ onTime, leftPageCount, completedTaskCount, handRaiseCount, feedbackCount, earlyFinishCount, idleCount });
    const teacherNotes = existingByStudent.get(student.id)?.teacherNotes ?? null;
    const aiSummary = buildTemplateSummary({
      roomTitle: room.title,
      studentName: student.name,
      durationMinutes,
      leftPageCount,
      rewardCount: studentRewards.length,
      completedTaskCount,
      handRaiseCount,
      feedbackCount,
      earlyFinishCount,
      idleCount,
      focusScore: focus.score,
      focusScoreReason: focus.reasons,
      taskTitles,
      teacherNotes
    });
    reports.push(await prisma.classSessionReport.upsert({
      where: { roomId_studentId: { roomId, studentId: student.id } },
      update: {
        teacherId: room.teacherId,
        startedAt,
        endedAt,
        joinedAt: membership.joinedAt,
        durationMinutes,
        onTime,
        leftPage: leftPageCount > 0,
        leftPageCount,
        rewardCount: studentRewards.length,
        completedTaskCount,
        handRaiseCount,
        feedbackCount,
        earlyFinishCount,
        idleCount,
        focusScore: focus.score,
        aiSummary: json(aiSummary),
        parentSummary: aiSummary.parentSummary
      },
      create: {
        roomId,
        teacherId: room.teacherId,
        studentId: student.id,
        startedAt,
        endedAt,
        joinedAt: membership.joinedAt,
        durationMinutes,
        onTime,
        leftPage: leftPageCount > 0,
        leftPageCount,
        rewardCount: studentRewards.length,
        completedTaskCount,
        handRaiseCount,
        feedbackCount,
        earlyFinishCount,
        idleCount,
        focusScore: focus.score,
        aiSummary: json(aiSummary),
        parentSummary: aiSummary.parentSummary
      },
      include: {
        student: { select: { id: true, name: true, email: true } },
        room: { select: { id: true, title: true } }
      }
    }));
  }
  return reports;
}

export async function updateReportTeacherNotes(reportId: string, teacherNotes: string | null) {
  const report = await prisma.classSessionReport.findUnique({
    where: { id: reportId },
    include: {
      student: { select: { name: true } },
      room: { select: { title: true } }
    }
  });
  if (!report) throw new Error("课后记录不存在");
  const existingSummary = payloadObject(report.aiSummary);
  const focusScoreReason = Array.isArray(existingSummary.focusScoreReason)
    ? existingSummary.focusScoreReason.filter((item): item is string => typeof item === "string")
    : [];
  const aiSummary = buildTemplateSummary({
    roomTitle: report.room.title,
    studentName: report.student.name,
    durationMinutes: report.durationMinutes,
    leftPageCount: report.leftPageCount,
    rewardCount: report.rewardCount,
    completedTaskCount: report.completedTaskCount,
    handRaiseCount: report.handRaiseCount,
    feedbackCount: report.feedbackCount,
    earlyFinishCount: report.earlyFinishCount,
    idleCount: report.idleCount,
    focusScore: report.focusScore,
    focusScoreReason,
    taskTitles: [],
    teacherNotes
  });
  return prisma.classSessionReport.update({
    where: { id: reportId },
    data: {
      teacherNotes,
      aiSummary: json(aiSummary),
      parentSummary: aiSummary.parentSummary
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
      room: { select: { id: true, title: true } }
    }
  });
}
