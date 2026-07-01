import { Router } from "express";
import { prisma } from "../database/client.js";
import { hashPassword, requireAuth, type AuthRequest } from "../auth/security.js";
import type { UserRole } from "@companion/types";

export const usersRouter = Router();
usersRouter.use(requireAuth());

usersRouter.get("/me", async (request: AuthRequest, response) => {
  const user = await prisma.user.findUnique({ where: { id: request.auth!.id } });
  if (!user) return response.status(404).json({ message: "用户不存在" });
  response.json({ id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar });
});

usersRouter.get("/", async (request: AuthRequest, response) => {
  const role = request.query.role as UserRole | undefined;
  if (request.auth!.role === "student") return response.status(403).json({ message: "无权查看用户列表" });
  const where = request.auth!.role === "teacher"
    ? {
        role: "student" as const,
        studentProfile: { group: { teacherId: request.auth!.id } }
      }
    : role ? { role } : undefined;
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, phone: true, role: true, avatar: true, createdAt: true,
      studentProfile: { include: { group: true } },
      teacherProfile: true
    },
    orderBy: { createdAt: "desc" }
  });
  response.json(users);
});

usersRouter.post("/", requireAuth(["admin"]), async (request: AuthRequest, response) => {
  const { name, email, password, role } = request.body as {
    name?: string; email?: string; password?: string; role?: UserRole;
  };
  if (!name || !email || !password || !role || !["student", "teacher", "admin"].includes(role)) {
    return response.status(400).json({ message: "用户资料不完整" });
  }
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      role,
      studentProfile: role === "student" ? { create: {} } : undefined,
      teacherProfile: role === "teacher" ? { create: { subjects: [] } } : undefined
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  await prisma.adminAuditLog.create({
    data: { actorId: request.auth!.id, action: "CREATE_USER", targetType: "User", targetId: user.id, payload: { role } }
  });
  response.status(201).json(user);
});

usersRouter.patch("/:id/group", requireAuth(["admin"]), async (request: AuthRequest, response) => {
  const groupId = request.body.groupId as string | null;
  const profile = await prisma.studentProfile.update({
    where: { userId: String(request.params.id) },
    data: { groupId }
  });
  await prisma.adminAuditLog.create({
    data: { actorId: request.auth!.id, action: "ASSIGN_GROUP", targetType: "StudentProfile", targetId: profile.id, payload: { groupId } }
  });
  response.json(profile);
});
