import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode
} from "react";
import type { RTCAction, RTCSignalPayload, SignalMessage } from "../../types/src/index.js";

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

type RTCMessage = SignalMessage<RTCSignalPayload>;
type SendRTC = (action: RTCAction, payload: RTCSignalPayload) => void | Promise<void>;

interface RTCContextValue {
  cameraOn: boolean;
  micOn: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState | "idle";
  error: string;
  toggleCamera(): Promise<boolean>;
  toggleMic(): Promise<boolean>;
}

interface RTCProviderProps {
  children: ReactNode;
  initiator?: boolean;
  incoming?: RTCMessage | null;
  sendRTC?: SendRTC;
}

const RTCContext = createContext<RTCContextValue | null>(null);
const rtcConfiguration: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function permissionMessage(error: unknown) {
  if (!(error instanceof DOMException)) return "无法开启音视频设备，请检查浏览器设置";
  if (error.name === "NotAllowedError") return "摄像头或麦克风权限被拒绝，请在浏览器地址栏中重新允许";
  if (error.name === "NotFoundError") return "没有检测到可用的摄像头或麦克风";
  if (error.name === "NotReadableError") return "摄像头可能正被其他应用占用";
  return `无法开启音视频设备：${error.message}`;
}

export function RTCProvider({ children, initiator = false, incoming, sendRTC }: RTCProviderProps) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream>(new MediaStream());
  const remoteRef = useRef<MediaStream>(new MediaStream());
  const sendRef = useRef(sendRTC);
  const initiatorRef = useRef(initiator);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const handledMessage = useRef("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | "idle">("idle");
  const [error, setError] = useState("");

  useEffect(() => { sendRef.current = sendRTC; }, [sendRTC]);
  useEffect(() => { initiatorRef.current = initiator; }, [initiator]);

  const attachLocalTracks = useCallback(async (peer: RTCPeerConnection) => {
    for (const kind of ["audio", "video"] as const) {
      let transceiver = peer.getTransceivers().find(({ receiver }) => receiver.track.kind === kind);
      if (!transceiver) transceiver = peer.addTransceiver(kind, { direction: "recvonly" });
      const track = localRef.current.getTracks().find((item) => item.kind === kind);
      await transceiver.sender.replaceTrack(track ?? null);
      transceiver.direction = track ? "sendrecv" : "recvonly";
    }
  }, []);

  const ensurePeer = useCallback(() => {
    if (peerRef.current) return peerRef.current;
    const peer = new RTCPeerConnection(rtcConfiguration);
    peerRef.current = peer;
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) void sendRef.current?.("ICE_CANDIDATE", { candidate: candidate.toJSON() });
    };
    peer.ontrack = ({ track, streams }) => {
      const stream = streams[0];
      if (stream) {
        remoteRef.current = stream;
      } else if (!remoteRef.current.getTracks().some(({ id }) => id === track.id)) {
        remoteRef.current.addTrack(track);
      }
      setRemoteStream(new MediaStream(remoteRef.current.getTracks()));
      track.onended = () => setRemoteStream(new MediaStream(remoteRef.current.getTracks().filter(({ readyState }) => readyState === "live")));
    };
    peer.onconnectionstatechange = () => setConnectionState(peer.connectionState);
    return peer;
  }, [attachLocalTracks]);

  const flushCandidates = useCallback(async (peer: RTCPeerConnection) => {
    if (!peer.remoteDescription) return;
    const candidates = pendingCandidates.current.splice(0);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }, []);

  const createOffer = useCallback(async () => {
    try {
      const peer = ensurePeer();
      await attachLocalTracks(peer);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendRef.current?.("RTC_OFFER", { description: peer.localDescription ?? offer });
    } catch (reason) {
      setError(permissionMessage(reason));
    }
  }, [attachLocalTracks, ensurePeer]);

  const announceReady = useCallback(() => {
    void sendRef.current?.("RTC_READY", {});
  }, []);

  useEffect(() => {
    announceReady();
  }, [announceReady]);

  useEffect(() => {
    if (!incoming || incoming.msg_id === handledMessage.current) return;
    handledMessage.current = incoming.msg_id;
    const handle = async () => {
      try {
        if (incoming.action === "RTC_READY") {
          if (initiatorRef.current) await createOffer();
          else announceReady();
          return;
        }
        const peer = ensurePeer();
        if (incoming.action === "RTC_OFFER" && incoming.payload.description) {
          await attachLocalTracks(peer);
          await peer.setRemoteDescription(incoming.payload.description);
          await flushCandidates(peer);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await sendRef.current?.("RTC_ANSWER", { description: peer.localDescription ?? answer });
        }
        if (incoming.action === "RTC_ANSWER" && incoming.payload.description) {
          await peer.setRemoteDescription(incoming.payload.description);
          await flushCandidates(peer);
        }
        if (incoming.action === "ICE_CANDIDATE" && incoming.payload.candidate) {
          if (peer.remoteDescription) await peer.addIceCandidate(incoming.payload.candidate);
          else pendingCandidates.current.push(incoming.payload.candidate);
        }
      } catch (reason) {
        setError(permissionMessage(reason));
      }
    };
    void handle();
  }, [announceReady, attachLocalTracks, createOffer, ensurePeer, flushCandidates, incoming]);

  const addTrack = useCallback(async (kind: "video" | "audio") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持摄像头，请使用最新版 Chrome、Edge 或 Safari");
      return false;
    }
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: kind === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
        audio: kind === "audio" ? { echoCancellation: true, noiseSuppression: true } : false
      });
      const track = stream.getTracks()[0];
      if (!track) return false;
      for (const oldTrack of localRef.current.getTracks().filter((item) => item.kind === kind)) {
        oldTrack.stop();
        localRef.current.removeTrack(oldTrack);
      }
      localRef.current.addTrack(track);
      setLocalStream(new MediaStream(localRef.current.getTracks()));
      if (kind === "video") setCameraOn(true);
      else setMicOn(true);
      const peer = ensurePeer();
      await attachLocalTracks(peer);
      announceReady();
      if (initiatorRef.current) await createOffer();
      track.onended = () => {
        if (kind === "video") setCameraOn(false);
        else setMicOn(false);
      };
      return true;
    } catch (reason) {
      setError(permissionMessage(reason));
      return false;
    }
  }, [announceReady, attachLocalTracks, createOffer, ensurePeer]);

  const toggleCamera = useCallback(async () => {
    const track = localRef.current.getVideoTracks()[0];
    if (!track || track.readyState === "ended") return addTrack("video");
    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
    announceReady();
    return track.enabled;
  }, [addTrack, announceReady]);

  const toggleMic = useCallback(async () => {
    const track = localRef.current.getAudioTracks()[0];
    if (!track || track.readyState === "ended") return addTrack("audio");
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    announceReady();
    return track.enabled;
  }, [addTrack, announceReady]);

  useEffect(() => () => {
    localRef.current.getTracks().forEach((track) => track.stop());
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  const value = useMemo<RTCContextValue>(() => ({
    cameraOn, micOn, localStream, remoteStream, connectionState, error, toggleCamera, toggleMic
  }), [cameraOn, connectionState, error, localStream, micOn, remoteStream, toggleCamera, toggleMic]);

  return <RTCContext.Provider value={value}>{children}</RTCContext.Provider>;
}

export function useRTC() {
  const context = useContext(RTCContext);
  if (!context) throw new Error("useRTC must be used inside RTCProvider");
  return context;
}

export function VideoTile({ label, source = "remote", childFriendly = false, muted }: {
  label: string;
  source?: "local" | "remote";
  childFriendly?: boolean;
  muted?: boolean;
}) {
  const rtc = useRTC();
  const stream = source === "local" ? rtc.localStream : rtc.remoteStream;
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  const active = Boolean(stream?.getVideoTracks().some(({ enabled, readyState }) => enabled && readyState === "live"));
  return (
    <div className={`video-tile ${childFriendly ? "video-tile--child" : ""} ${active ? "is-live" : ""}`}>
      <video ref={videoRef} autoPlay playsInline muted={muted ?? source === "local"} />
      {!active && <div className="video-empty"><span className="video-avatar">{source === "local" ? "🙂" : "👩‍🏫"}</span><strong>{label}</strong><small>{source === "local" ? "点击摄像头按钮开启" : "等待对方开启摄像头"}</small></div>}
      {active && <span className="video-label">● {label}</span>}
    </div>
  );
}
