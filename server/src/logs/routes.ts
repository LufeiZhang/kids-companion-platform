import { Router } from "express";
import { prisma } from "../database/client.js";
import { requireAuth, type AuthRequest } from "../auth/security.js";
import { rewardLogWhereForAuth, signalLogWhereForAuth } from "../auth/scopes.js";

export const logsRouter = Router();
logsRouter.use(requireAuth(["admin", "teacher"]));

logsRouter.get("/signals", async (request: AuthRequest, response) => {
  response.json(await prisma.signalLog.findMany({
    where: signalLogWhereForAuth(request.auth!),
    include: {
      fromUser: { select: { name: true } },
      targetUser: { select: { name: true } },
      room: { select: { id: true, title: true, teacherId: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  }));
});

logsRouter.get("/rewards", async (request: AuthRequest, response) => {
  response.json(await prisma.rewardLog.findMany({
    where: rewardLogWhereForAuth(request.auth!),
    include: {
      teacher: { select: { id: true, name: true } },
      student: { select: { id: true, name: true } },
      room: { select: { id: true, title: true, teacherId: true } }
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

logsRouter.get("/ai", requireAuth(["admin"]), async (_request, response) => {
  response.json(await prisma.aiInteractionLog.findMany({
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  }));
});
