import { Router } from "express";
import { prisma } from "../database/client.js";
import { hashPassword, requireAuth, type AuthRequest } from "../auth/security.js";
import type { UserRole } from "@companion/types";

export const usersRouter = Router();
usersRouter.use(requireAuth());

const studentAccessForTeacher = (teacherId: string) => ({
  OR: [
    { group: { teacherId } },
    { groupMemberships: { some: { group: { teacherId } } } }
  ]
});

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
        studentProfile: studentAccessForTeacher(request.auth!.id)
      }
    : role ? { role } : undefined;
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, phone: true, role: true, avatar: true, createdAt: true,
      studentProfile: {
        include: {
          group: true,
          groupMemberships: {
            include: {
              group: { include: { teacher: { select: { id: true, name: true } } } }
            },
            orderBy: { createdAt: "asc" }
          }
        }
      },
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
  const body = request.body as { groupId?: string | null; groupIds?: string[] };
  const groupIds = [...new Set(
    Array.isArray(body.groupIds)
      ? body.groupIds.filter((groupId): groupId is string => typeof groupId === "string" && Boolean(groupId))
      : typeof body.groupId === "string" && body.groupId
        ? [body.groupId]
        : []
  )];
  if (groupIds.length) {
    const count = await prisma.studentGroup.count({ where: { id: { in: groupIds } } });
    if (count !== groupIds.length) return response.status(400).json({ message: "分组不存在" });
  }
  const profile = await prisma.studentProfile.findUnique({ where: { userId: String(request.params.id) } });
  if (!profile) return response.status(404).json({ message: "学生资料不存在" });
  const updated = await prisma.$transaction(async (tx) => {
    const studentProfile = await tx.studentProfile.update({
      where: { id: profile.id },
      data: { groupId: groupIds[0] ?? null }
    });
    await tx.studentGroupMember.deleteMany({ where: { studentProfileId: profile.id } });
    if (groupIds.length) {
      await tx.studentGroupMember.createMany({
        data: groupIds.map((groupId) => ({ groupId, studentProfileId: profile.id })),
        skipDuplicates: true
      });
    }
    return studentProfile;
  });
  await prisma.adminAuditLog.create({
    data: { actorId: request.auth!.id, action: "ASSIGN_GROUPS", targetType: "StudentProfile", targetId: profile.id, payload: { groupIds } }
  });
  response.json(updated);
});
