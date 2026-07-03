import { Router } from "express";
import { prisma } from "../database/client.js";
import { requireAuth, type AuthRequest } from "../auth/security.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth());

const taskInclude = {
  teacher: { select: { id: true, name: true } },
  student: { select: { id: true, name: true, email: true } }
} as const;

tasksRouter.get("/", async (request: AuthRequest, response) => {
  const auth = request.auth!;
  const where = auth.role === "teacher"
    ? { teacherId: auth.id }
    : auth.role === "student"
      ? { studentId: auth.id }
      : {};
  const tasks = await prisma.learningTask.findMany({
    where,
    include: taskInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });
  response.json(tasks);
});

tasksRouter.post("/", requireAuth(["teacher"]), async (request: AuthRequest, response) => {
  const { title, detail, studentId, dueDate } = request.body as {
    title?: string;
    detail?: string;
    studentId?: string;
    dueDate?: string;
  };
  if (!title?.trim() || !studentId) {
    return response.status(400).json({ message: "请填写任务名称并选择学生" });
  }
  const allowedStudent = await prisma.user.findFirst({
    where: {
      id: studentId,
      role: "student",
      studentProfile: { group: { teacherId: request.auth!.id } }
    },
    select: { id: true }
  });
  if (!allowedStudent) return response.status(403).json({ message: "只能给已分配给你的学生布置任务" });

  const task = await prisma.learningTask.create({
    data: {
      title: title.trim(),
      detail: detail?.trim() || null,
      studentId,
      teacherId: request.auth!.id,
      dueDate: dueDate ? new Date(dueDate) : null
    },
    include: taskInclude
  });
  await prisma.adminAuditLog.create({
    data: {
      actorId: request.auth!.id,
      action: "CREATE_LEARNING_TASK",
      targetType: "LearningTask",
      targetId: task.id,
      payload: { studentId, title: task.title }
    }
  });
  response.status(201).json(task);
});

tasksRouter.patch("/:id/status", requireAuth(["teacher"]), async (request: AuthRequest, response) => {
  const status = request.body.status as "pending" | "completed" | undefined;
  if (!status || !["pending", "completed"].includes(status)) {
    return response.status(400).json({ message: "任务状态不合法" });
  }
  const existing = await prisma.learningTask.findFirst({
    where: { id: String(request.params.id), teacherId: request.auth!.id },
    select: { id: true }
  });
  if (!existing) return response.status(404).json({ message: "任务不存在或无权操作" });

  const task = await prisma.learningTask.update({
    where: { id: existing.id },
    data: {
      status,
      completedAt: status === "completed" ? new Date() : null
    },
    include: taskInclude
  });
  await prisma.adminAuditLog.create({
    data: {
      actorId: request.auth!.id,
      action: status === "completed" ? "COMPLETE_LEARNING_TASK" : "REOPEN_LEARNING_TASK",
      targetType: "LearningTask",
      targetId: task.id,
      payload: { studentId: task.studentId }
    }
  });
  response.json(task);
});
