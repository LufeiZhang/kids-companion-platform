import { Router } from "express";
import type { AiPracticeMode, AiPracticeRequest, AiPracticeResponse } from "@companion/types";
import { requireAuth, type AuthRequest } from "../auth/security.js";
import { prisma } from "../database/client.js";
import { generateAiPracticeReply, hasAiSummaryProvider } from "./provider.js";

export const aiRouter = Router();

const practiceModes = new Set<AiPracticeMode>([
  "vocabulary",
  "mental_math",
  "picture_retell",
  "mistake_review",
  "question"
]);

function payloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function containsBlockedContent(message: string) {
  return [
    /手机号|电话|微信|住址|地址|身份证|银行卡|密码|家长联系方式|联系我|私聊|线下见面|加我/i,
    /phone|address|wechat|password|private chat|meet offline|bank card|id card/i,
    /自杀|轻生|伤害自己|杀人|色情|裸聊|成人内容|毒品|赌博/i,
    /suicide|self[-\s]?harm|kill|porn|sex|drug|gambling/i
  ].some((pattern) => pattern.test(message));
}

function fallbackReply(mode: AiPracticeMode, language: "zh" | "en", reason: string): AiPracticeResponse {
  const english = language === "en";
  return {
    provider: "template_mvp",
    generatedAt: new Date().toISOString(),
    model: null,
    mode,
    answer: english
      ? "The AI practice helper is not available right now. You can write one vocabulary word, one math problem, or one sentence from your storybook, and ask your teacher to practice it with you."
      : "AI 陪练现在暂时不可用。你可以先写下一个单词、一道口算题，或者一句绘本内容，请老师陪你一起练习。",
    encouragement: english
      ? "You already did the right thing by asking. Keep going step by step."
      : "你愿意主动提问已经很好了，我们一步一步来。",
    followUpQuestion: english
      ? "Would you like to try a short practice question first?"
      : "要不要先试一道简单练习？",
    safetyNote: "",
    fallbackReason: reason
  };
}

function safetyReply(mode: AiPracticeMode, language: "zh" | "en"): AiPracticeResponse {
  const english = language === "en";
  return {
    provider: "template_mvp",
    generatedAt: new Date().toISOString(),
    model: null,
    mode,
    answer: english
      ? "I cannot help with that request. Please do not share private contact details or unsafe information here. If this is important, ask your teacher or parent to help."
      : "这个问题我不能继续回答。请不要在这里分享电话、地址、密码等隐私信息，也不要尝试危险内容。如果你真的需要帮助，请马上找老师或家长。",
    encouragement: english
      ? "You can still ask me safe learning questions, like vocabulary, math, reading, or homework review."
      : "你可以继续问我安全的学习问题，比如单词、口算、阅读复述或错题讲解。",
    followUpQuestion: english
      ? "Would you like to practice vocabulary or math instead?"
      : "要不要改成练单词或练口算？",
    safetyNote: english ? "Safety filter applied." : "已触发儿童安全保护。",
    fallbackReason: "safety_filter"
  };
}

function responseLength(reply: AiPracticeResponse) {
  return reply.answer.length + reply.encouragement.length + reply.followUpQuestion.length + (reply.safetyNote?.length ?? 0);
}

async function writeAiLog(userId: string, reply: AiPracticeResponse, promptLength: number) {
  await prisma.aiInteractionLog.create({
    data: {
      userId,
      mode: reply.mode,
      provider: reply.provider,
      success: reply.provider === "openai",
      promptLength,
      responseLength: responseLength(reply),
      fallbackReason: reply.fallbackReason
    }
  });
}

aiRouter.post("/practice", requireAuth(["student"]), async (request: AuthRequest, response) => {
  const body = request.body as Partial<AiPracticeRequest>;
  const mode = body.mode;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const language = body.language === "en" ? "en" : "zh";

  if (!mode || !practiceModes.has(mode)) {
    return response.status(400).json({ message: "请选择正确的 AI 陪练模式" });
  }
  if (!message) return response.status(400).json({ message: "请输入要练习的内容" });
  if (message.length > 800) return response.status(400).json({ message: "单次提问请控制在 800 字以内" });

  if (containsBlockedContent(message)) {
    const reply = safetyReply(mode, language);
    await writeAiLog(request.auth!.id, reply, message.length);
    return response.json(reply);
  }

  const [tasks, reports] = await Promise.all([
    prisma.learningTask.findMany({
      where: { studentId: request.auth!.id },
      select: { title: true, detail: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.classSessionReport.findMany({
      where: { studentId: request.auth!.id },
      select: {
        durationMinutes: true,
        focusScore: true,
        leftPageCount: true,
        rewardCount: true,
        completedTaskCount: true,
        aiSummary: true
      },
      orderBy: { createdAt: "desc" },
      take: 3
    })
  ]);

  const aiReply = await generateAiPracticeReply({
    mode,
    message,
    language,
    recentTasks: tasks,
    recentReports: reports.map((report) => ({
      durationMinutes: report.durationMinutes,
      focusScore: report.focusScore,
      leftPageCount: report.leftPageCount,
      rewardCount: report.rewardCount,
      completedTaskCount: report.completedTaskCount,
      reviewPoints: stringList(payloadObject(report.aiSummary).reviewPoints)
    }))
  });

  const reply = aiReply ?? fallbackReply(
    mode,
    language,
    hasAiSummaryProvider()
      ? "真实 AI 陪练暂时不可用，已返回安全兜底回复。"
      : "未配置 OPENAI_API_KEY，AI 陪练暂未启用。"
  );
  await writeAiLog(request.auth!.id, reply, message.length);
  response.json(reply);
});
