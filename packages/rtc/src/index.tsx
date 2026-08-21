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
type SendRTC = (action: RTCAction, payload: RTCSignalPayload, targetUid?: string) => void | Promise<void>;

interface PeerBundle {
  peer: RTCPeerConnection;
  remote: MediaStream;
  pendingCandidates: RTCIceCandidateInit[];
}

interface RTCContextValue {
  cameraOn: boolean;
  micOn: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  connectionState: RTCPeerConnectionState | "idle";
  connectionStates: Record<string, RTCPeerConnectionState | "idle">;
  error: string;
  toggleCamera(): Promise<boolean>;
  toggleMic(): Promise<boolean>;
}

interface RTCProviderProps {
  children: ReactNode;
  initiator?: boolean;
  peerIds?: string[];
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

export function RTCProvider({ children, initiator = false, peerIds = [], incoming, sendRTC }: RTCProviderProps) {
  const peersRef = useRef<Map<string, PeerBundle>>(new Map());
  const localRef = useRef<MediaStream>(new MediaStream());
  const sendRef = useRef(sendRTC);
  const initiatorRef = useRef(initiator);
  const peerIdsRef = useRef<string[]>(peerIds);
  const handledMessages = useRef<Set<string>>(new Set());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [connectionStates, setConnectionStates] = useState<Record<string, RTCPeerConnectionState | "idle">>({});
  const [error, setError] = useState("");

  useEffect(() => { sendRef.current = sendRTC; }, [sendRTC]);
  useEffect(() => { initiatorRef.current = initiator; }, [initiator]);
  useEffect(() => { peerIdsRef.current = peerIds; }, [peerIds]);

  const allPeerIds = useCallback(() => {
    const ids = new Set(peerIdsRef.current.filter(Boolean));
    for (const uid of peersRef.current.keys()) ids.add(uid);
    return [...ids];
  }, []);

  const sendToPeer = useCallback((peerId: string, action: RTCAction, payload: RTCSignalPayload) => {
    if (!peerId) return;
    void sendRef.current?.(action, payload, peerId);
  }, []);

  const attachLocalTracks = useCallback(async (peer: RTCPeerConnection) => {
    for (const kind of ["audio", "video"] as const) {
      const track = localRef.current.getTracks().find((item) => item.kind === kind);
      let transceiver = peer.getTransceivers().find(({ receiver, sender }) => (
        sender.track?.kind === kind || receiver.track.kind === kind
      ));
      if (!transceiver) transceiver = peer.addTransceiver(kind, { direction: track ? "sendrecv" : "recvonly" });
      await transceiver.sender.replaceTrack(track ?? null);
      transceiver.direction = track ? "sendrecv" : "recvonly";
    }
  }, []);

  const ensurePeer = useCallback((peerId: string) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection(rtcConfiguration);
    const bundle: PeerBundle = { peer, remote: new MediaStream(), pendingCandidates: [] };
    peersRef.current.set(peerId, bundle);
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) sendToPeer(peerId, "ICE_CANDIDATE", { candidate: candidate.toJSON() });
    };
    peer.ontrack = ({ track, streams }) => {
      const stream = streams[0];
      if (stream) {
        bundle.remote = stream;
      } else if (!bundle.remote.getTracks().some(({ id }) => id === track.id)) {
        bundle.remote.addTrack(track);
      }
      setRemoteStreams((current) => ({ ...current, [peerId]: new MediaStream(bundle.remote.getTracks()) }));
      track.onended = () => setRemoteStreams((current) => ({
        ...current,
        [peerId]: new MediaStream(bundle.remote.getTracks().filter(({ readyState }) => readyState === "live"))
      }));
    };
    peer.onconnectionstatechange = () => {
      setConnectionStates((current) => ({ ...current, [peerId]: peer.connectionState }));
    };
    return bundle;
  }, [sendToPeer]);

  const flushCandidates = useCallback(async (bundle: PeerBundle) => {
    const peer = bundle.peer;
    if (!peer.remoteDescription) return;
    const candidates = bundle.pendingCandidates.splice(0);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }, []);

  const createOffer = useCallback(async (peerId: string) => {
    try {
      const { peer } = ensurePeer(peerId);
      if (peer.signalingState !== "stable") return;
      await attachLocalTracks(peer);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendToPeer(peerId, "RTC_OFFER", { description: peer.localDescription ?? offer });
    } catch (reason) {
      setError(permissionMessage(reason));
    }
  }, [attachLocalTracks, ensurePeer, sendToPeer]);

  const createOffers = useCallback(async (ids = allPeerIds()) => {
    for (const peerId of ids) await createOffer(peerId);
  }, [allPeerIds, createOffer]);

  const announceReady = useCallback(() => {
    for (const peerId of allPeerIds()) sendToPeer(peerId, "RTC_READY", {});
  }, [allPeerIds, sendToPeer]);

  useEffect(() => {
    announceReady();
  }, [announceReady]);

  useEffect(() => {
    if (!incoming || handledMessages.current.has(incoming.msg_id)) return;
    handledMessages.current.add(incoming.msg_id);
    if (handledMessages.current.size > 200) {
      const first = handledMessages.current.values().next().value;
      if (first) handledMessages.current.delete(first);
    }
    const handle = async () => {
      try {
        const peerId = incoming.from_uid;
        if (incoming.action === "RTC_READY") {
          if (initiatorRef.current) await createOffer(peerId);
          else sendToPeer(peerId, "RTC_READY", {});
          return;
        }
        const bundle = ensurePeer(peerId);
        const peer = bundle.peer;
        if (incoming.action === "RTC_OFFER" && incoming.payload.description) {
          await attachLocalTracks(peer);
          await peer.setRemoteDescription(incoming.payload.description);
          await flushCandidates(bundle);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendToPeer(peerId, "RTC_ANSWER", { description: peer.localDescription ?? answer });
        }
        if (incoming.action === "RTC_ANSWER" && incoming.payload.description) {
          if (peer.signalingState !== "have-local-offer") return;
          await peer.setRemoteDescription(incoming.payload.description);
          await flushCandidates(bundle);
        }
        if (incoming.action === "ICE_CANDIDATE" && incoming.payload.candidate) {
          if (peer.remoteDescription) await peer.addIceCandidate(incoming.payload.candidate);
          else bundle.pendingCandidates.push(incoming.payload.candidate);
        }
      } catch (reason) {
        setError(permissionMessage(reason));
      }
    };
    void handle();
  }, [attachLocalTracks, createOffer, ensurePeer, flushCandidates, incoming, sendToPeer]);

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
      for (const { peer } of peersRef.current.values()) await attachLocalTracks(peer);
      if (initiatorRef.current) await createOffers();
      else announceReady();
      track.onended = () => {
        if (kind === "video") setCameraOn(false);
        else setMicOn(false);
      };
      return true;
    } catch (reason) {
      setError(permissionMessage(reason));
      return false;
    }
  }, [announceReady, attachLocalTracks, createOffers]);

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
    for (const { peer } of peersRef.current.values()) peer.close();
    peersRef.current.clear();
  }, []);

  const remoteStream = useMemo(() => {
    const preferredId = peerIds[0];
    return (preferredId ? remoteStreams[preferredId] : undefined) ?? Object.values(remoteStreams)[0] ?? null;
  }, [peerIds, remoteStreams]);
  const connectionState = useMemo(() => {
    const preferredId = peerIds[0];
    return (preferredId ? connectionStates[preferredId] : undefined) ?? Object.values(connectionStates)[0] ?? "idle";
  }, [connectionStates, peerIds]);
  const value = useMemo<RTCContextValue>(() => ({
    cameraOn, micOn, localStream, remoteStream, remoteStreams, connectionState, connectionStates, error, toggleCamera, toggleMic
  }), [cameraOn, connectionState, connectionStates, error, localStream, micOn, remoteStream, remoteStreams, toggleCamera, toggleMic]);

  return <RTCContext.Provider value={value}>{children}</RTCContext.Provider>;
}

export function useRTC() {
  const context = useContext(RTCContext);
  if (!context) throw new Error("useRTC must be used inside RTCProvider");
  return context;
}

export function VideoTile({ label, source = "remote", peerId, childFriendly = false, muted }: {
  label: string;
  source?: "local" | "remote";
  peerId?: string;
  childFriendly?: boolean;
  muted?: boolean;
}) {
  const rtc = useRTC();
  const stream = source === "local" ? rtc.localStream : ((peerId ? rtc.remoteStreams[peerId] : rtc.remoteStream) ?? null);
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
