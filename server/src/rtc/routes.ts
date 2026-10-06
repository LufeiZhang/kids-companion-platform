import { Router } from "express";
import TLSSigAPIv2 from "tls-sig-api-v2";
import type { TrtcTokenResponse } from "@companion/types";
import { requireAuth, type AuthRequest } from "../auth/security.js";
import { prisma } from "../database/client.js";

export const rtcRouter = Router();
rtcRouter.use(requireAuth());

const trtcUserIdPattern = /^[A-Za-z0-9_-]{1,32}$/;
const trtcRoomIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

function assertTrtcCompatibleId(value: string, label: string, pattern: RegExp) {
  if (!pattern.test(value)) {
    throw new Error(`${label} 含有腾讯 TRTC 不支持的字符，请使用 1-64 位英文、数字、下划线或短横线`);
  }
}

rtcRouter.get("/trtc-token", async (request: AuthRequest, response) => {
  try {
    const roomId = String(request.query.roomId ?? "");
    if (!roomId) return response.status(400).json({ message: "缺少 roomId" });

    const sdkAppId = Number(process.env.TRTC_SDK_APP_ID);
    const secretKey = process.env.TRTC_SECRET_KEY;
    if (!sdkAppId || !secretKey) {
      return response.status(503).json({
        message: "未配置腾讯 TRTC。请在服务端环境变量中设置 TRTC_SDK_APP_ID 和 TRTC_SECRET_KEY"
      });
    }

    const room = await prisma.classRoom.findUnique({
      where: { id: roomId },
      include: { students: true }
    });
    if (!room) return response.status(404).json({ message: "课堂不存在" });

    const auth = request.auth!;
    const isTeacher = auth.role === "teacher" && room.teacherId === auth.id;
    const isStudent = auth.role === "student" && room.students.some(({ studentId }) => studentId === auth.id);
    if (auth.role !== "admin" && !isTeacher && !isStudent) {
      return response.status(403).json({ message: "无权进入该课堂音视频房间" });
    }

    assertTrtcCompatibleId(auth.id, "当前用户 ID", trtcUserIdPattern);
    assertTrtcCompatibleId(room.id, "课堂房间 ID", trtcRoomIdPattern);

    const expireSeconds = Number(process.env.TRTC_SIG_EXPIRE_SECONDS ?? 86400);
    const api = new TLSSigAPIv2.Api(sdkAppId, secretKey);
    const userSig = api.genSig(auth.id, expireSeconds);
    const payload: TrtcTokenResponse = {
      provider: "trtc",
      sdkAppId,
      userId: auth.id,
      userSig,
      roomId: room.id,
      strRoomId: room.id,
      expireSeconds,
      expiresAt: new Date(Date.now() + expireSeconds * 1000).toISOString()
    };

    response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRTC Token 生成失败";
    response.status(400).json({ message });
  }
});
