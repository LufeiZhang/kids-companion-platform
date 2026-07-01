import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@companion/types";

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  email: string;
}

export interface AuthRequest extends Request {
  auth?: AuthUser;
}

const secret = process.env.JWT_SECRET ?? "development-only-secret";

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export const signToken = (user: AuthUser) => jwt.sign(user, secret, { expiresIn: "12h" });
export const verifyToken = (token: string) => jwt.verify(token, secret) as AuthUser;

export function requireAuth(roles?: UserRole[]) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    try {
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (!token) return response.status(401).json({ message: "请先登录" });
      const auth = verifyToken(token);
      if (roles && !roles.includes(auth.role)) {
        return response.status(403).json({ message: "当前账号无权执行此操作" });
      }
      request.auth = auth;
      next();
    } catch {
      response.status(401).json({ message: "登录已失效，请重新登录" });
    }
  };
}
