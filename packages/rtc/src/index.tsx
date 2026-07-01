import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface RTCParticipant {
  uid: string;
  name: string;
  cameraOn: boolean;
  micOn: boolean;
}

export interface RTCProviderAdapter {
  join(roomId: string, uid: string): Promise<void>;
  leave(): Promise<void>;
  setCamera(enabled: boolean): Promise<void>;
  setMicrophone(enabled: boolean): Promise<void>;
}

export class PlaceholderRTCAdapter implements RTCProviderAdapter {
  async join() {}
  async leave() {}
  async setCamera() {}
  async setMicrophone() {}
}

interface RTCContextValue {
  cameraOn: boolean;
  micOn: boolean;
  toggleCamera(): void;
  toggleMic(): void;
}

const RTCContext = createContext<RTCContextValue | null>(null);

export function RTCProvider({ children }: { children: ReactNode }) {
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const value = useMemo(() => ({
    cameraOn,
    micOn,
    toggleCamera: () => setCameraOn((value) => !value),
    toggleMic: () => setMicOn((value) => !value)
  }), [cameraOn, micOn]);
  return <RTCContext.Provider value={value}>{children}</RTCContext.Provider>;
}

export function useRTC() {
  const context = useContext(RTCContext);
  if (!context) throw new Error("useRTC must be used inside RTCProvider");
  return context;
}

export function VideoPlaceholder({ label, childFriendly = false }: {
  label: string;
  childFriendly?: boolean;
}) {
  return (
    <div className={`video-placeholder ${childFriendly ? "video-placeholder--child" : ""}`}>
      <span className="video-avatar">👩‍🏫</span>
      <strong>{label}</strong>
      <small>RTC 接口已预留</small>
    </div>
  );
}
