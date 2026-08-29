export type UserRole = "student" | "teacher" | "admin";
export type RoomStatus = "scheduled" | "active" | "ended";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string | null;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Classroom {
  id: string;
  title: string;
  teacherId: string;
  status: RoomStatus;
  currentPage: number;
  coursewareId?: string | null;
  courseware?: Courseware | null;
  pomodoroStatus?: PomodoroStatus | null;
  pomodoroDurationSeconds?: number | null;
  pomodoroStartedAt?: string | null;
  pomodoroEndsAt?: string | null;
  pomodoroRemainingSeconds?: number | null;
  pomodoroLabel?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  students: Array<{ student: User; joinedAt?: string | null }>;
  teacher?: User;
  sessionReports?: ClassSessionReport[];
}

export interface Courseware {
  id: string;
  title: string;
  type: "image" | "pdf";
  fileUrl: string;
  ownerId: string;
  createdAt: string;
}

export type LearningTaskStatus = "pending" | "completed";

export interface LearningTask {
  id: string;
  title: string;
  detail?: string | null;
  status: LearningTaskStatus;
  teacherId: string;
  studentId: string;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  teacher?: Pick<User, "id" | "name">;
  student?: Pick<User, "id" | "name" | "email">;
}

export type PomodoroStatus = "running" | "paused" | "stopped" | "completed";

export interface PomodoroPayload {
  status: PomodoroStatus;
  durationSeconds: number;
  startedAt?: number;
  endsAt?: number;
  remainingSeconds?: number;
  label?: string;
}

export interface AiClassSummary {
  provider: "template_mvp" | "openai";
  generatedAt: string;
  model?: string | null;
  learningContent: string;
  studentPerformance: string;
  attention: string;
  reviewPoints: string[];
  nextLessonSuggestion: string;
  parentSummary: string;
  focusScoreReason: string[];
  teacherNotes?: string | null;
  futureAiEnabled: boolean;
  fallbackReason?: string | null;
}

export interface ClassSessionReport {
  id: string;
  roomId: string;
  teacherId: string;
  studentId: string;
  startedAt?: string | null;
  endedAt?: string | null;
  joinedAt?: string | null;
  durationMinutes: number;
  onTime: boolean;
  leftPage: boolean;
  leftPageCount: number;
  rewardCount: number;
  completedTaskCount: number;
  handRaiseCount: number;
  feedbackCount: number;
  earlyFinishCount: number;
  idleCount: number;
  focusScore: number;
  teacherNotes?: string | null;
  aiSummary?: AiClassSummary | null;
  parentSummary?: string | null;
  createdAt: string;
  updatedAt: string;
  student?: Pick<User, "id" | "name" | "email">;
  room?: Pick<Classroom, "id" | "title">;
}

export type AiPracticeMode = "vocabulary" | "mental_math" | "picture_retell" | "mistake_review" | "question";

export interface AiPracticeRequest {
  mode: AiPracticeMode;
  message: string;
  language?: "zh" | "en";
}

export interface AiPracticeResponse {
  provider: "template_mvp" | "openai";
  generatedAt: string;
  model?: string | null;
  mode: AiPracticeMode;
  answer: string;
  encouragement: string;
  followUpQuestion: string;
  safetyNote?: string | null;
  fallbackReason?: string | null;
}

export const MESSAGE_ACTIONS = {
  ROOM_EVENT: [
    "JOIN_ROOM", "LEAVE_ROOM", "ROOM_STARTED", "ROOM_ENDED",
    "USER_ONLINE", "USER_OFFLINE"
  ],
  WHITEBOARD_EVENT: [
    "DRAW_START", "DRAW_MOVE", "DRAW_END", "ERASE", "CLEAR", "UNDO", "REDO"
  ],
  COURSEWARE_CONTROL: [
    "OPEN_COURSEWARE", "NEXT_PAGE", "PREV_PAGE", "GO_TO_PAGE"
  ],
  TEACHER_CONTROL: [
    "GRANT_REWARD", "FOCUS_REMINDER", "START_BREAK", "END_BREAK",
    "LOCK_STUDY_MODE", "UNLOCK_STUDY_MODE"
  ],
  STUDENT_STATUS: [
    "PAGE_VISIBLE", "PAGE_HIDDEN", "IDLE", "ACTIVE",
    "CAMERA_ON", "CAMERA_OFF", "MIC_ON", "MIC_OFF"
  ],
  RTC_SIGNAL: [
    "RTC_READY", "RTC_OFFER", "RTC_ANSWER", "ICE_CANDIDATE"
  ],
  STUDENT_INTERACTION: [
    "RAISE_HAND", "LOWER_HAND", "SEND_EMOJI", "POMODORO_FINISHED_EARLY"
  ],
  CLASSROOM_PRAISE: [
    "TASK_COMPLETED_PRAISE"
  ],
  POMODORO_CONTROL: [
    "START_POMODORO", "PAUSE_POMODORO", "RESUME_POMODORO",
    "STOP_POMODORO", "FINISH_POMODORO"
  ]
} as const;

export type MessageType = keyof typeof MESSAGE_ACTIONS;
export type RoomAction = typeof MESSAGE_ACTIONS.ROOM_EVENT[number];
export type WhiteboardAction = typeof MESSAGE_ACTIONS.WHITEBOARD_EVENT[number];
export type CoursewareAction = typeof MESSAGE_ACTIONS.COURSEWARE_CONTROL[number];
export type TeacherAction = typeof MESSAGE_ACTIONS.TEACHER_CONTROL[number];
export type StudentStatusAction = typeof MESSAGE_ACTIONS.STUDENT_STATUS[number];
export type RTCAction = typeof MESSAGE_ACTIONS.RTC_SIGNAL[number];
export type StudentInteractionAction = typeof MESSAGE_ACTIONS.STUDENT_INTERACTION[number];
export type ClassroomPraiseAction = typeof MESSAGE_ACTIONS.CLASSROOM_PRAISE[number];
export type PomodoroAction = typeof MESSAGE_ACTIONS.POMODORO_CONTROL[number];
export type SignalAction =
  | RoomAction | WhiteboardAction | CoursewareAction | TeacherAction
  | StudentStatusAction | RTCAction | StudentInteractionAction | ClassroomPraiseAction
  | PomodoroAction;

export interface DrawPayload {
  x: number;
  y: number;
  pressure?: number;
  color: string;
  lineWidth: number;
  page: number;
}

export interface CoursewarePayload {
  courseware_id?: string;
  file_url?: string;
  file_type?: "image" | "pdf";
  page: number;
}

export interface RewardPayload {
  reward_type: "red_flower" | "trophy" | "confetti" | "star_rain";
  animation: string;
  message: string;
  duration: number;
}

export interface ClassroomPraisePayload {
  student_id: string;
  student_name: string;
  task_id?: string;
  task_title?: string;
  message: string;
  animation: "spotlight" | "confetti" | "star_burst";
  duration: number;
}

export interface RTCSignalPayload {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  negotiationId?: string;
  reset?: boolean;
}

export interface StudentInteractionPayload {
  raised?: boolean;
  emoji?: string;
  finished_early?: boolean;
  remainingSeconds?: number;
}

export interface SignalMessage<T = Record<string, unknown>> {
  msg_id: string;
  msg_type: MessageType;
  action: SignalAction;
  room_id: string;
  from_uid: string;
  target_uid?: string;
  timestamp: number;
  payload: T;
}

export interface SignalAck {
  ok: boolean;
  msg_id: string;
  error?: string;
}

export function createSignal<T>(
  input: Omit<SignalMessage<T>, "msg_id" | "timestamp">
): SignalMessage<T> {
  return {
    ...input,
    msg_id: crypto.randomUUID(),
    timestamp: Date.now()
  };
}
