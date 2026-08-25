import type { AiClassSummary, AiPracticeMode, AiPracticeResponse } from "@companion/types";

export type AiSummaryInput = {
  roomTitle: string;
  studentName: string;
  durationMinutes: number;
  leftPageCount: number;
  rewardCount: number;
  completedTaskCount: number;
  handRaiseCount: number;
  feedbackCount: number;
  earlyFinishCount: number;
  idleCount: number;
  focusScore: number;
  focusScoreReason: string[];
  taskTitles: string[];
  teacherNotes?: string | null;
};

type OpenAIContentBlock = {
  type?: string;
  text?: string;
};

type OpenAIOutputItem = {
  content?: OpenAIContentBlock[];
};

type OpenAIResponse = {
  output_text?: string;
  output?: OpenAIOutputItem[];
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5-mini";

const summarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    learningContent: { type: "string" },
    studentPerformance: { type: "string" },
    attention: { type: "string" },
    reviewPoints: {
      type: "array",
      items: { type: "string" }
    },
    nextLessonSuggestion: { type: "string" },
    parentSummary: { type: "string" }
  },
  required: [
    "learningContent",
    "studentPerformance",
    "attention",
    "reviewPoints",
    "nextLessonSuggestion",
    "parentSummary"
  ]
} as const;

const practiceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    encouragement: { type: "string" },
    followUpQuestion: { type: "string" },
    safetyNote: { type: "string" }
  },
  required: ["answer", "encouragement", "followUpQuestion", "safetyNote"]
} as const;

export type AiPracticeInput = {
  mode: AiPracticeMode;
  message: string;
  language: "zh" | "en";
  recentTasks: Array<{
    title: string;
    detail?: string | null;
    status: string;
  }>;
  recentReports: Array<{
    durationMinutes: number;
    focusScore: number;
    leftPageCount: number;
    rewardCount: number;
    completedTaskCount: number;
    reviewPoints: string[];
  }>;
};

export function hasAiSummaryProvider() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function modelName() {
  return process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

function baseUrl() {
  return (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
}

function timeoutMs() {
  const value = Number(process.env.AI_TIMEOUT_MS ?? 15000);
  return Number.isFinite(value) && value >= 1000 ? value : 15000;
}

function shouldIncludeSensitiveNames() {
  return process.env.AI_PRIVACY_MODE === "off";
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function buildPrivacySafeInput(input: AiSummaryInput) {
  const includeNames = shouldIncludeSensitiveNames();
  return {
    classInfo: {
      title: includeNames ? truncate(input.roomTitle, 80) : "伴学课堂",
      studentLabel: includeNames ? truncate(input.studentName, 24) : "该学生",
      durationMinutes: input.durationMinutes
    },
    learningSignals: {
      focusScore: input.focusScore,
      focusScoreReason: input.focusScoreReason,
      leftPageCount: input.leftPageCount,
      idleCount: input.idleCount,
      rewardCount: input.rewardCount,
      completedTaskCount: input.completedTaskCount,
      handRaiseCount: input.handRaiseCount,
      feedbackCount: input.feedbackCount,
      earlyFinishCount: input.earlyFinishCount,
      taskTitles: input.taskTitles.map((title) => truncate(title, 80)).slice(0, 8)
    },
    teacherNotes: input.teacherNotes?.trim()
      ? truncate(input.teacherNotes.trim(), 800)
      : null,
    privacy: {
      realStudentNameIncluded: includeNames,
      instruction: "Do not infer identity, health, diagnosis, family status, or sensitive traits. Do not include contact information."
    }
  };
}

const systemPrompt = [
  "你是儿童远程伴学平台的课后总结助手。",
  "请基于结构化课堂记录生成中文课后总结。",
  "语气要专业、温和、具体，面向教师和家长均可读。",
  "不要夸大结论；专注分只是课堂过程参考，不是医学、心理或能力诊断。",
  "如果数据不足，请明确说“本节课记录有限”，不要编造学习内容。",
  "家长版总结要温和鼓励，避免给孩子贴负面标签。",
  "输出必须是符合 JSON Schema 的对象。"
].join("\n");

const practiceModeLabel: Record<AiPracticeMode, string> = {
  vocabulary: "背单词",
  mental_math: "练口算",
  picture_retell: "复述绘本",
  mistake_review: "错题问答",
  question: "学习提问"
};

const practiceSystemPrompt = [
  "你是儿童远程伴学平台的 AI 陪练助手。",
  "你的任务是帮助学生背单词、练口算、复述绘本、订正错题和回答学习问题。",
  "回复必须适合儿童：温和、鼓励、简短、具体，不使用羞辱、恐吓或过度负面评价。",
  "不要要求学生提供真实姓名、电话、住址、学校、账号密码、家长联系方式等个人信息。",
  "不要讨论或推断健康诊断、心理诊断、家庭状况、身份特征等敏感信息。",
  "不要处理摄像头、麦克风、音频、视频或图像内容；你只能基于学生输入的文字和必要学习记录作答。",
  "遇到危险、自伤、暴力、成人内容或线下见面请求时，安全拒绝，并建议找老师或家长。",
  "数学题要给出清晰步骤；不要只给答案。",
  "输出必须是符合 JSON Schema 的对象。"
].join("\n");

function extractOutputText(data: OpenAIResponse) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts = data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => typeof text === "string" && Boolean(text.trim())) ?? [];
  return parts.join("\n").trim();
}

function parseJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim())
    .slice(0, 6);
  return items.length ? items : fallback;
}

function normalizeSummary(parsed: Record<string, unknown>, input: AiSummaryInput): AiClassSummary {
  const fallbackPoints = input.taskTitles.length
    ? input.taskTitles.map((title) => `复习任务：${title}`).slice(0, 6)
    : ["请老师补充本节课重点知识点，便于后续复习。"];
  const studentLabel = shouldIncludeSensitiveNames() ? input.studentName : "孩子";
  return {
    provider: "openai",
    generatedAt: new Date().toISOString(),
    model: modelName(),
    learningContent: asString(parsed.learningContent, `本节课围绕「${input.roomTitle}」开展，课堂记录有限。`),
    studentPerformance: asString(parsed.studentPerformance, `${studentLabel} 本节课完成 ${input.completedTaskCount} 个课堂任务，收到 ${input.rewardCount} 次正向激励。`),
    attention: asString(parsed.attention, `本节课记录到 ${input.leftPageCount} 次页面离开、${input.idleCount} 次长时间无操作提醒。`),
    reviewPoints: asStringArray(parsed.reviewPoints, fallbackPoints),
    nextLessonSuggestion: asString(parsed.nextLessonSuggestion, "下节课建议继续拆分小任务，并保持及时鼓励。"),
    parentSummary: asString(parsed.parentSummary, `${studentLabel} 今天完成了一节 ${input.durationMinutes || "短时"} 分钟的伴学课，建议家长以鼓励为主，帮助孩子保持稳定学习节奏。`),
    focusScoreReason: input.focusScoreReason,
    teacherNotes: input.teacherNotes?.trim() || null,
    futureAiEnabled: true,
    fallbackReason: null
  };
}

function buildPracticeInput(input: AiPracticeInput) {
  return {
    mode: practiceModeLabel[input.mode],
    language: input.language === "en" ? "English" : "中文",
    studentMessage: truncate(input.message, 600),
    recentLearningContext: {
      tasks: input.recentTasks.map((task) => ({
        title: truncate(task.title, 80),
        detail: task.detail ? truncate(task.detail, 120) : null,
        status: task.status
      })).slice(0, 6),
      reports: input.recentReports.map((report) => ({
        durationMinutes: report.durationMinutes,
        focusScore: report.focusScore,
        leftPageCount: report.leftPageCount,
        rewardCount: report.rewardCount,
        completedTaskCount: report.completedTaskCount,
        reviewPoints: report.reviewPoints.map((point) => truncate(point, 80)).slice(0, 5)
      })).slice(0, 3)
    },
    privacy: {
      sentAudioVideo: false,
      sentCamera: false,
      sentMicrophone: false,
      sentParentContact: false,
      sentEmail: false,
      instruction: "Only the student's current text input and limited learning metadata are included."
    }
  };
}

function normalizePracticeReply(parsed: Record<string, unknown>, input: AiPracticeInput): AiPracticeResponse {
  return {
    provider: "openai",
    generatedAt: new Date().toISOString(),
    model: modelName(),
    mode: input.mode,
    answer: asString(parsed.answer, input.language === "en" ? "I can help with that. Let's try it step by step." : "我可以帮你，我们一步一步来。"),
    encouragement: asString(parsed.encouragement, input.language === "en" ? "Good effort. Keep going." : "你愿意练习就很棒，继续加油。"),
    followUpQuestion: asString(parsed.followUpQuestion, input.language === "en" ? "Would you like to try another one?" : "要不要再试一道？"),
    safetyNote: asString(parsed.safetyNote, ""),
    fallbackReason: null
  };
}

export async function generateAiClassSummary(input: AiSummaryInput): Promise<AiClassSummary | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(`${baseUrl()}/responses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(timeoutMs()),
      body: JSON.stringify({
        model: modelName(),
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify(buildPrivacySafeInput(input)) }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "class_session_summary",
            strict: true,
            schema: summarySchema
          }
        },
        max_output_tokens: 1400,
        store: false
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      throw new Error(`OpenAI ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = await response.json() as OpenAIResponse;
    const outputText = extractOutputText(data);
    if (!outputText) throw new Error("OpenAI response did not include output_text");
    return normalizeSummary(parseJsonObject(outputText), input);
  } catch (error) {
    console.warn("[ai-summary] OpenAI generation failed; template fallback will be used.", error);
    return null;
  }
}

export async function generateAiPracticeReply(input: AiPracticeInput): Promise<AiPracticeResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(`${baseUrl()}/responses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(timeoutMs()),
      body: JSON.stringify({
        model: modelName(),
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: practiceSystemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify(buildPracticeInput(input)) }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "student_practice_reply",
            strict: true,
            schema: practiceSchema
          }
        },
        max_output_tokens: 900,
        store: false
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      throw new Error(`OpenAI ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = await response.json() as OpenAIResponse;
    const outputText = extractOutputText(data);
    if (!outputText) throw new Error("OpenAI response did not include output_text");
    return normalizePracticeReply(parseJsonObject(outputText), input);
  } catch (error) {
    console.warn("[ai-practice] OpenAI generation failed; template fallback will be used.", error);
    return null;
  }
}
