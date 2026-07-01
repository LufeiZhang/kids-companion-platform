import { Router } from "express";
import { prisma } from "../database/client.js";
import { signToken, verifyPassword } from "./security.js";
import type { UserRole } from "@companion/types";

export const authRouter = Router();

authRouter.post("/login", async (request, response) => {
  const { email, password, role } = request.body as {
    email?: string;
    password?: string;
    role?: UserRole;
  };
  if (!email || !password || !role) {
    return response.status(400).json({ message: "请输入邮箱、密码并选择角色" });
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.role !== role || !(await verifyPassword(password, user.passwordHash))) {
    return response.status(401).json({ message: "账号、密码或角色不正确" });
  }
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar };
  response.json({ token: signToken(safeUser), user: safeUser });
});

authRouter.get("/me", async (request, response) => {
  response.status(405).json({ message: "请使用带鉴权的 /api/users/me" });
});
