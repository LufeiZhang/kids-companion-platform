import { io, type Socket } from "socket.io-client";
import type { AuthResponse, SignalAck, SignalMessage, UserRole } from "@companion/types";

const API_URL = import.meta.env?.VITE_API_URL
  || (import.meta.env?.PROD ? window.location.origin : "http://localhost:4000");
const SOCKET_URL = import.meta.env?.VITE_SOCKET_URL || API_URL;

export const session = {
  get token() { return localStorage.getItem("companion_token") ?? ""; },
  get user(): AuthResponse["user"] | null {
    const raw = localStorage.getItem("companion_user");
    return raw ? JSON.parse(raw) as AuthResponse["user"] : null;
  },
  save(auth: AuthResponse) {
    localStorage.setItem("companion_token", auth.token);
    localStorage.setItem("companion_user", JSON.stringify(auth.user));
  },
  clear() {
    localStorage.removeItem("companion_token");
    localStorage.removeItem("companion_user");
  }
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (session.token) headers.set("Authorization", `Bearer ${session.token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message ?? "请求失败");
  }
  return response.json() as Promise<T>;
}

export async function login(email: string, password: string, role: UserRole) {
  const auth = await api<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, role })
  });
  session.save(auth);
  return auth;
}

export function connectSocket(): Socket {
  return io(SOCKET_URL, {
    auth: { token: session.token },
    transports: ["websocket", "polling"]
  });
}

export function sendSignal(socket: Socket, message: SignalMessage<unknown>): Promise<SignalAck> {
  return new Promise((resolve) => {
    socket.timeout(5000).emit("signal", message, (err: Error | null, ack: SignalAck) => {
      if (err) resolve({ ok: false, msg_id: message.msg_id, error: "信令响应超时" });
      else resolve(ack);
    });
  });
}

export { API_URL };
