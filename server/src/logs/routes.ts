import { Router } from "express";
import { prisma } from "../database/client.js";
import { requireAuth, type AuthRequest } from "../auth/security.js";

export const logsRouter = Router();
logsRouter.use(requireAuth(["admin", "teacher"]));

logsRouter.get("/signals", async (request: AuthRequest, response) => {
  const roomWhere = request.auth!.role === "teacher" ? { room: { teacherId: request.auth!.id } } : {};
  response.json(await prisma.signalLog.findMany({
    where: roomWhere,
    include: {
      fromUser: { select: { name: true } },
      targetUser: { select: { name: true } },
      room: { select: { title: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  }));
});

logsRouter.get("/rewards", async (request: AuthRequest, response) => {
  response.json(await prisma.rewardLog.findMany({
    where: request.auth!.role === "teacher" ? { teacherId: request.auth!.id } : undefined,
    include: {
      teacher: { select: { name: true } },
      student: { select: { name: true } },
      room: { select: { title: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  }));
});

logsRouter.get("/audit", requireAuth(["admin"]), async (_request, response) => {
  response.json(await prisma.adminAuditLog.findMany({
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  }));
});
