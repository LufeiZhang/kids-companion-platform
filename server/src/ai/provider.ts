import type { AiClassSummary } from "@companion/types";

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
const DEFAULT_MODEL = "gpt-5.6-luna";

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
