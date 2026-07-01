import { Router } from "express";
import { prisma } from "../database/client.js";
import { requireAuth, type AuthRequest } from "../auth/security.js";

export const groupsRouter = Router();
groupsRouter.use(requireAuth(["admin", "teacher"]));

groupsRouter.get("/", async (request: AuthRequest, response) => {
  const groups = await prisma.studentGroup.findMany({
    where: request.auth!.role === "teacher" ? { teacherId: request.auth!.id } : undefined,
    include: {
      teacher: { select: { id: true, name: true } },
      students: { include: { user: { select: { id: true, name: true, email: true } } } }
    }
  });
  response.json(groups);
});

groupsRouter.post("/", requireAuth(["admin"]), async (request: AuthRequest, response) => {
  const { name, teacherId, description } = request.body as { name?: string; teacherId?: string; description?: string };
  if (!name || !teacherId) return response.status(400).json({ message: "请填写分组名称并选择教师" });
  const group = await prisma.studentGroup.create({ data: { name, teacherId, description } });
  await prisma.adminAuditLog.create({
    data: { actorId: request.auth!.id, action: "CREATE_GROUP", targetType: "StudentGroup", targetId: group.id }
  });
  response.status(201).json(group);
});
