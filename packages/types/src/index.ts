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
  startedAt?: string | null;
  endedAt?: string | null;
  students: Array<{ student: User }>;
  teacher?: User;
}

export interface Courseware {
  id: string;
  title: string;
  type: "image" | "pdf";
  fileUrl: string;
  ownerId: string;
  createdAt: string;
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
    "RAISE_HAND", "LOWER_HAND", "SEND_EMOJI"
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
export type SignalAction =
  | RoomAction | WhiteboardAction | CoursewareAction | TeacherAction
  | StudentStatusAction | RTCAction | StudentInteractionAction;

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

export interface RTCSignalPayload {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface StudentInteractionPayload {
  raised?: boolean;
  emoji?: string;
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
