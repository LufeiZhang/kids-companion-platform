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
type PendingCandidate = { candidate: RTCIceCandidateInit; negotiationId?: string };

interface PeerBundle {
  peer: RTCPeerConnection;
  remote: MediaStream;
  pendingCandidates: PendingCandidate[];
  activeNegotiationId?: string;
  localOfferCreatedAt?: number;
  makingOffer?: boolean;
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
  virtualBackgroundUrl: string | null;
  toggleCamera(): Promise<boolean>;
  toggleMic(): Promise<boolean>;
  setVirtualBackground(imageUrl: string | null): Promise<void>;
}

interface RTCProviderProps {
  children: ReactNode;
  selfId?: string;
  teacherId?: string;
  initiator?: boolean;
  peerIds?: string[];
  incoming?: RTCMessage | RTCMessage[] | null;
  readyKey?: string | number;
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

function rtcConnectionMessage(error: unknown) {
  if (error instanceof Error && error.message) return `音视频连接异常，正在自动重连：${error.message}`;
  return "音视频连接异常，正在自动重连";
}

function createNegotiationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMLineOrderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /order of m-lines|m-line/i.test(message);
}

type MediaDirection = "sendrecv" | "sendonly" | "recvonly" | "inactive";

function parseOfferDirections(description?: RTCSessionDescriptionInit | RTCSessionDescription | null) {
  const directions: MediaDirection[] = [];
  const sections = description?.sdp?.split(/\r?\nm=/) ?? [];
  for (let index = 1; index < sections.length; index += 1) {
    const section = `m=${sections[index]}`;
    const direction = (section.match(/^a=(sendrecv|sendonly|recvonly|inactive)$/m)?.[1] ?? "sendrecv") as MediaDirection;
    directions.push(direction);
  }
  return directions;
}

function answerDirection(remoteDirection: MediaDirection | undefined, hasLocalTrack: boolean): RTCRtpTransceiverDirection {
  const remoteCanSend = remoteDirection === "sendrecv" || remoteDirection === "sendonly" || !remoteDirection;
  const remoteCanReceive = remoteDirection === "sendrecv" || remoteDirection === "recvonly" || !remoteDirection;
  if (hasLocalTrack && remoteCanReceive && remoteCanSend) return "sendrecv";
  if (hasLocalTrack && remoteCanReceive) return "sendonly";
  if (remoteCanSend) return "recvonly";
  return "inactive";
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("虚拟背景图片加载失败"));
    image.src = src;
  });
}

function waitForVideo(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    if (video.readyState >= video.HAVE_METADATA) {
      resolve();
      return;
    }
    const done = () => resolve();
    video.onloadedmetadata = done;
    window.setTimeout(done, 600);
  });
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const cropWidth = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
  const cropHeight = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;
  const cropX = (sourceWidth - cropWidth) / 2;
  const cropY = (sourceHeight - cropHeight) / 2;
  context.drawImage(source, cropX, cropY, cropWidth, cropHeight, targetX, targetY, targetWidth, targetHeight);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

async function createVirtualBackgroundTrack(rawTrack: MediaStreamTrack, backgroundUrl: string) {
  const settings = rawTrack.getSettings();
  const width = Math.max(640, Number(settings.width) || 1280);
  const height = Math.max(360, Number(settings.height) || 720);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.captureStream !== "function") throw new Error("当前浏览器不支持虚拟背景画布");

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([rawTrack]);
  await video.play().catch(() => undefined);
  await waitForVideo(video);
  const image = await loadImage(backgroundUrl);

  let frame = 0;
  let stopped = false;
  const render = () => {
    if (stopped) return;
    context.clearRect(0, 0, width, height);
    drawCover(context, image, image.naturalWidth || width, image.naturalHeight || height, 0, 0, width, height);
    context.fillStyle = "rgba(255, 255, 255, 0.72)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#315f9d";
    context.font = `700 ${Math.round(width * 0.038)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.fillText("Companion Learning Classroom", width / 2, height * 0.12);

    const videoWidth = video.videoWidth || width;
    const videoHeight = video.videoHeight || height;
    const cardWidth = width * 0.56;
    const cardHeight = cardWidth * 0.62;
    const x = (width - cardWidth) / 2;
    const y = height * 0.2;
    context.save();
    context.shadowColor = "rgba(29, 52, 87, 0.32)";
    context.shadowBlur = width * 0.035;
    context.shadowOffsetY = height * 0.018;
    roundedRect(context, x - width * 0.012, y - width * 0.012, cardWidth + width * 0.024, cardHeight + width * 0.024, width * 0.035);
    context.fillStyle = "white";
    context.fill();
    roundedRect(context, x, y, cardWidth, cardHeight, width * 0.03);
    context.clip();
    drawCover(context, video, videoWidth, videoHeight, x, y, cardWidth, cardHeight);
    context.restore();

    context.fillStyle = "rgba(255, 255, 255, 0.82)";
    roundedRect(context, width * 0.18, height * 0.75, width * 0.64, height * 0.11, width * 0.025);
    context.fill();
    context.fillStyle = "#456385";
    context.font = `600 ${Math.round(width * 0.028)}px system-ui, sans-serif`;
    context.fillText("Custom virtual background", width / 2, height * 0.815);
    frame = window.requestAnimationFrame(render);
  };
  render();

  const outputStream = canvas.captureStream(30);
  const outputTrack = outputStream.getVideoTracks()[0];
  if (!outputTrack) throw new Error("虚拟背景视频轨道创建失败");
  outputTrack.enabled = rawTrack.enabled;
  return {
    track: outputTrack,
    stop() {
      stopped = true;
      window.cancelAnimationFrame(frame);
      video.pause();
      video.srcObject = null;
      outputTrack.stop();
    }
  };
}

export function RTCProvider({ children, selfId, teacherId, initiator = false, peerIds = [], incoming, readyKey = 0, sendRTC }: RTCProviderProps) {
  const peersRef = useRef<Map<string, PeerBundle>>(new Map());
  const localRef = useRef<MediaStream>(new MediaStream());
  const sendRef = useRef(sendRTC);
  const selfIdRef = useRef(selfId);
  const teacherIdRef = useRef(teacherId);
  const initiatorRef = useRef(initiator);
  const peerIdsRef = useRef<string[]>(peerIds);
  const handledMessages = useRef<Set<string>>(new Set());
  const rawVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const outboundVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const virtualStopRef = useRef<(() => void) | null>(null);
  const virtualBackgroundRef = useRef<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [connectionStates, setConnectionStates] = useState<Record<string, RTCPeerConnectionState | "idle">>({});
  const [error, setError] = useState("");
  const [virtualBackgroundUrl, setVirtualBackgroundUrl] = useState<string | null>(null);
  const createOfferRef = useRef<(peerId: string, force?: boolean, reset?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => { sendRef.current = sendRTC; }, [sendRTC]);
  useEffect(() => { selfIdRef.current = selfId; }, [selfId]);
  useEffect(() => { teacherIdRef.current = teacherId; }, [teacherId]);
  useEffect(() => { initiatorRef.current = initiator; }, [initiator]);

  const allPeerIds = useCallback(() => {
    const self = selfIdRef.current;
    const ids = new Set(peerIdsRef.current.filter((uid) => Boolean(uid) && uid !== self));
    for (const uid of peersRef.current.keys()) ids.add(uid);
    return [...ids];
  }, []);

  const shouldCreateOffer = useCallback((peerId: string) => {
    const self = selfIdRef.current;
    const teacher = teacherIdRef.current;
    if (!self) return initiatorRef.current;
    if (teacher) {
      if (self === teacher) return true;
      if (peerId === teacher) return false;
    }
    if (initiatorRef.current && !teacher) return true;
    return self < peerId;
  }, []);

  const sendToPeer = useCallback((peerId: string, action: RTCAction, payload: RTCSignalPayload) => {
    if (!peerId || peerId === selfIdRef.current) return;
    void sendRef.current?.(action, payload, peerId);
  }, []);

  const attachLocalTracks = useCallback(async (
    peer: RTCPeerConnection,
    mode: "offer" | "answer" = "offer",
    remoteDirections: MediaDirection[] = []
  ) => {
    for (const kind of ["audio", "video"] as const) {
      const track = localRef.current.getTracks().find((item) => item.kind === kind);
      let transceiver = peer.getTransceivers().find(({ receiver, sender }) => (
        sender.track?.kind === kind || receiver.track.kind === kind
      ));
      if (!transceiver && mode === "offer") transceiver = peer.addTransceiver(kind, { direction: track ? "sendrecv" : "recvonly" });
      if (!transceiver) continue;
      await transceiver.sender.replaceTrack(track ?? null);
      const transceiverIndex = peer.getTransceivers().indexOf(transceiver);
      transceiver.direction = mode === "answer"
        ? answerDirection(remoteDirections[transceiverIndex], Boolean(track))
        : track ? "sendrecv" : "recvonly";
    }
  }, []);

  const disposePeer = useCallback((peerId: string) => {
    const bundle = peersRef.current.get(peerId);
    if (!bundle) return;
    bundle.peer.onicecandidate = null;
    bundle.peer.ontrack = null;
    bundle.peer.onconnectionstatechange = null;
    bundle.peer.oniceconnectionstatechange = null;
    bundle.peer.close();
    peersRef.current.delete(peerId);
    setRemoteStreams((current) => {
      const { [peerId]: _removed, ...rest } = current;
      return rest;
    });
    setConnectionStates((current) => {
      const { [peerId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const ensurePeer = useCallback((peerId: string) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const peer = new RTCPeerConnection(rtcConfiguration);
    const bundle: PeerBundle = { peer, remote: new MediaStream(), pendingCandidates: [] };
    peersRef.current.set(peerId, bundle);
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) sendToPeer(peerId, "ICE_CANDIDATE", {
        candidate: candidate.toJSON(),
        negotiationId: bundle.activeNegotiationId
      });
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
      if (peer.connectionState === "connected") setError("");
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "failed") {
        peer.restartIce();
        if (shouldCreateOffer(peerId)) void createOfferRef.current(peerId, true);
      }
    };
    return bundle;
  }, [sendToPeer, shouldCreateOffer]);

  const addRemoteCandidate = useCallback(async (bundle: PeerBundle, item: PendingCandidate) => {
    if (item.negotiationId && bundle.activeNegotiationId && item.negotiationId !== bundle.activeNegotiationId) return;
    try {
      await bundle.peer.addIceCandidate(item.candidate);
    } catch (reason) {
      // ICE candidates can arrive late from an older offer/answer cycle.
      // They should not be shown as camera/mic permission failures.
      console.debug("Ignored stale ICE candidate", reason);
    }
  }, []);

  const flushCandidates = useCallback(async (bundle: PeerBundle) => {
    const peer = bundle.peer;
    if (!peer.remoteDescription) return;
    const candidates = bundle.pendingCandidates.splice(0);
    for (const candidate of candidates) await addRemoteCandidate(bundle, candidate);
  }, [addRemoteCandidate]);

  const createOffer = useCallback(async (peerId: string, force = false, reset = false) => {
    let bundle = ensurePeer(peerId);
    if (bundle.makingOffer) return;
    bundle.makingOffer = true;
    try {
      let peer = bundle.peer;
      if (peer.signalingState !== "stable") {
        const staleOffer = peer.signalingState === "have-local-offer"
          && Date.now() - (bundle.localOfferCreatedAt ?? 0) > 1500;
        if (force || staleOffer) {
          await peer.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit).catch(() => undefined);
          bundle.localOfferCreatedAt = undefined;
        }
        if ((peer.signalingState as RTCSignalingState) !== "stable") return;
      }
      await attachLocalTracks(peer);
      const negotiationId = createNegotiationId();
      bundle.activeNegotiationId = negotiationId;
      const offer = await peer.createOffer({ iceRestart: force });
      try {
        await peer.setLocalDescription(offer);
      } catch (reason) {
        if (!isMLineOrderError(reason)) throw reason;
        disposePeer(peerId);
        bundle = ensurePeer(peerId);
        peer = bundle.peer;
        bundle.makingOffer = true;
        await attachLocalTracks(peer);
        const retryNegotiationId = createNegotiationId();
        bundle.activeNegotiationId = retryNegotiationId;
        const retryOffer = await peer.createOffer({ iceRestart: true });
        await peer.setLocalDescription(retryOffer);
        bundle.localOfferCreatedAt = Date.now();
        sendToPeer(peerId, "RTC_OFFER", { description: peer.localDescription ?? retryOffer, negotiationId: retryNegotiationId, reset: true });
        setError("");
        return;
      }
      bundle.localOfferCreatedAt = Date.now();
      sendToPeer(peerId, "RTC_OFFER", { description: peer.localDescription ?? offer, negotiationId, reset });
      setError("");
    } catch (reason) {
      setError(rtcConnectionMessage(reason));
    } finally {
      const latest = peersRef.current.get(peerId);
      if (latest) latest.makingOffer = false;
    }
  }, [attachLocalTracks, disposePeer, ensurePeer, sendToPeer]);

  useEffect(() => { createOfferRef.current = createOffer; }, [createOffer]);

  const renegotiatePeers = useCallback(async (
    ids?: string[],
    options: { force?: boolean; recreate?: boolean } = {}
  ) => {
    const uniqueIds = [...new Set((ids ?? allPeerIds()).filter((uid) => uid && uid !== selfIdRef.current))];
    for (const peerId of uniqueIds) {
      if (options.recreate) disposePeer(peerId);
      const { peer } = ensurePeer(peerId);
      await attachLocalTracks(peer);
      if (shouldCreateOffer(peerId)) await createOffer(peerId, Boolean(options.force), Boolean(options.recreate));
      else sendToPeer(peerId, "RTC_READY", { negotiationId: createNegotiationId(), reset: Boolean(options.recreate) });
    }
  }, [allPeerIds, attachLocalTracks, createOffer, disposePeer, ensurePeer, sendToPeer, shouldCreateOffer]);

  const peerIdsKey = useMemo(() => peerIds.filter(Boolean).sort().join("|"), [peerIds]);
  useEffect(() => {
    const self = selfIdRef.current;
    const nextPeerIds = peerIds.filter((uid) => Boolean(uid) && uid !== self);
    peerIdsRef.current = nextPeerIds;
    for (const [peerId, { peer }] of peersRef.current) {
      if (nextPeerIds.includes(peerId)) continue;
      peer.close();
      peersRef.current.delete(peerId);
      setRemoteStreams((current) => {
        const { [peerId]: _removed, ...rest } = current;
        return rest;
      });
      setConnectionStates((current) => {
        const { [peerId]: _removed, ...rest } = current;
        return rest;
      });
    }
    void renegotiatePeers(nextPeerIds, { force: Boolean(readyKey) });
  }, [peerIdsKey, readyKey, renegotiatePeers]);

  useEffect(() => {
    const messages = Array.isArray(incoming) ? incoming : incoming ? [incoming] : [];
    const unhandled = messages.filter((message) => !handledMessages.current.has(message.msg_id));
    if (!unhandled.length) return;
    for (const message of unhandled) {
      handledMessages.current.add(message.msg_id);
      if (handledMessages.current.size > 500) {
        const first = handledMessages.current.values().next().value;
        if (first) handledMessages.current.delete(first);
      }
    }
    const handle = async (message: RTCMessage) => {
      try {
        const peerId = message.from_uid;
        if (message.action === "RTC_READY") {
          if (shouldCreateOffer(peerId) && message.payload.reset) disposePeer(peerId);
          const bundle = ensurePeer(peerId);
          await attachLocalTracks(bundle.peer);
          if (shouldCreateOffer(peerId)) await createOffer(peerId, true, Boolean(message.payload.reset));
          return;
        }
        if (message.action === "RTC_OFFER" && message.payload.description) {
          if (message.payload.reset) disposePeer(peerId);
          let bundle = ensurePeer(peerId);
          let peer = bundle.peer;
          const negotiationId = message.payload.negotiationId ?? createNegotiationId();
          const remoteDirections = parseOfferDirections(message.payload.description);
          if (peer.signalingState !== "stable") {
            await peer.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit).catch(() => undefined);
            bundle.localOfferCreatedAt = undefined;
          }
          bundle.activeNegotiationId = negotiationId;
          bundle.pendingCandidates = bundle.pendingCandidates.filter((item) => !item.negotiationId || item.negotiationId === negotiationId);
          try {
            await peer.setRemoteDescription(message.payload.description);
          } catch (reason) {
            if (!isMLineOrderError(reason)) throw reason;
            disposePeer(peerId);
            bundle = ensurePeer(peerId);
            peer = bundle.peer;
            bundle.activeNegotiationId = negotiationId;
            await peer.setRemoteDescription(message.payload.description);
          }
          await attachLocalTracks(peer, "answer", remoteDirections);
          await flushCandidates(bundle);
          let answer = await peer.createAnswer();
          try {
            await peer.setLocalDescription(answer);
          } catch (reason) {
            if (!isMLineOrderError(reason)) throw reason;
            disposePeer(peerId);
            bundle = ensurePeer(peerId);
            peer = bundle.peer;
            bundle.activeNegotiationId = negotiationId;
            await peer.setRemoteDescription(message.payload.description);
            await attachLocalTracks(peer, "answer", remoteDirections);
            await flushCandidates(bundle);
            answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
          }
          sendToPeer(peerId, "RTC_ANSWER", { description: peer.localDescription ?? answer, negotiationId });
          setError("");
        }
        if (message.action === "RTC_ANSWER" && message.payload.description) {
          const bundle = ensurePeer(peerId);
          const peer = bundle.peer;
          if (peer.signalingState !== "have-local-offer") return;
          if (message.payload.negotiationId && bundle.activeNegotiationId && message.payload.negotiationId !== bundle.activeNegotiationId) return;
          try {
            await peer.setRemoteDescription(message.payload.description);
          } catch (reason) {
            if (!isMLineOrderError(reason)) throw reason;
            disposePeer(peerId);
            if (shouldCreateOffer(peerId)) await createOffer(peerId, true);
            return;
          }
          if (message.payload.negotiationId) bundle.activeNegotiationId = message.payload.negotiationId;
          bundle.localOfferCreatedAt = undefined;
          await flushCandidates(bundle);
          setError("");
        }
        if (message.action === "ICE_CANDIDATE" && message.payload.candidate) {
          const bundle = ensurePeer(peerId);
          const peer = bundle.peer;
          const item = { candidate: message.payload.candidate, negotiationId: message.payload.negotiationId };
          if (item.negotiationId && bundle.activeNegotiationId && item.negotiationId !== bundle.activeNegotiationId) return;
          if (peer.remoteDescription) await addRemoteCandidate(bundle, item);
          else bundle.pendingCandidates.push(item);
        }
      } catch (reason) {
        setError(rtcConnectionMessage(reason));
      }
    };
    const run = async () => {
      for (const message of unhandled) await handle(message);
    };
    void run();
  }, [addRemoteCandidate, attachLocalTracks, createOffer, disposePeer, ensurePeer, flushCandidates, incoming, shouldCreateOffer]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const retryIds = allPeerIds().filter((peerId) => {
        const state = peersRef.current.get(peerId)?.peer.connectionState ?? "new";
        return state !== "connected";
      });
      if (retryIds.length) void renegotiatePeers(retryIds, { force: true });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [allPeerIds, renegotiatePeers]);

  const stopVirtualOutput = useCallback(() => {
    virtualStopRef.current?.();
    virtualStopRef.current = null;
  }, []);

  const installLocalVideoTrack = useCallback(async (track: MediaStreamTrack | null) => {
    for (const oldTrack of localRef.current.getVideoTracks()) {
      localRef.current.removeTrack(oldTrack);
      if (oldTrack !== track && oldTrack !== rawVideoTrackRef.current) oldTrack.stop();
    }
    if (track) localRef.current.addTrack(track);
    outboundVideoTrackRef.current = track;
    setLocalStream(new MediaStream(localRef.current.getTracks()));
    await renegotiatePeers(undefined, { force: true, recreate: true });
  }, [renegotiatePeers]);

  const rebuildVideoOutput = useCallback(async (rawTrack = rawVideoTrackRef.current) => {
    if (!rawTrack || rawTrack.readyState === "ended") return false;
    stopVirtualOutput();
    let outputTrack = rawTrack;
    const backgroundUrl = virtualBackgroundRef.current;
    if (backgroundUrl) {
      try {
        const virtualOutput = await createVirtualBackgroundTrack(rawTrack, backgroundUrl);
        virtualStopRef.current = virtualOutput.stop;
        outputTrack = virtualOutput.track;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "虚拟背景启用失败，已使用原摄像头画面");
      }
    }
    outputTrack.enabled = rawTrack.enabled;
    await installLocalVideoTrack(outputTrack);
    setCameraOn(rawTrack.enabled);
    return true;
  }, [installLocalVideoTrack, stopVirtualOutput]);

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
      if (kind === "video") {
        rawVideoTrackRef.current?.stop();
        rawVideoTrackRef.current = track;
        track.onended = () => {
          setCameraOn(false);
          stopVirtualOutput();
        };
        await rebuildVideoOutput(track);
        return true;
      }

      for (const oldTrack of localRef.current.getAudioTracks()) {
        oldTrack.stop();
        localRef.current.removeTrack(oldTrack);
      }
      localRef.current.addTrack(track);
      setLocalStream(new MediaStream(localRef.current.getTracks()));
      setMicOn(true);
      await renegotiatePeers(undefined, { force: true, recreate: true });
      track.onended = () => {
        setMicOn(false);
      };
      return true;
    } catch (reason) {
      setError(permissionMessage(reason));
      return false;
    }
  }, [rebuildVideoOutput, renegotiatePeers, stopVirtualOutput]);

  const toggleCamera = useCallback(async () => {
    const rawTrack = rawVideoTrackRef.current;
    const outputTrack = outboundVideoTrackRef.current ?? localRef.current.getVideoTracks()[0];
    if (!rawTrack || rawTrack.readyState === "ended" || !outputTrack || outputTrack.readyState === "ended") return addTrack("video");
    const enabled = !outputTrack.enabled;
    rawTrack.enabled = enabled;
    outputTrack.enabled = enabled;
    setCameraOn(enabled);
    setLocalStream(new MediaStream(localRef.current.getTracks()));
    await renegotiatePeers(undefined, { force: true });
    return enabled;
  }, [addTrack, renegotiatePeers]);

  const toggleMic = useCallback(async () => {
    const track = localRef.current.getAudioTracks()[0];
    if (!track || track.readyState === "ended") return addTrack("audio");
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    await renegotiatePeers(undefined, { force: true });
    return track.enabled;
  }, [addTrack, renegotiatePeers]);

  const setVirtualBackground = useCallback(async (imageUrl: string | null) => {
    virtualBackgroundRef.current = imageUrl;
    setVirtualBackgroundUrl(imageUrl);
    const rawTrack = rawVideoTrackRef.current;
    if (rawTrack && rawTrack.readyState !== "ended") await rebuildVideoOutput(rawTrack);
  }, [rebuildVideoOutput]);

  useEffect(() => () => {
    stopVirtualOutput();
    const rawTrack = rawVideoTrackRef.current;
    if (rawTrack && !localRef.current.getTracks().includes(rawTrack)) rawTrack.stop();
    localRef.current.getTracks().forEach((track) => track.stop());
    for (const { peer } of peersRef.current.values()) peer.close();
    peersRef.current.clear();
  }, [stopVirtualOutput]);

  const remoteStream = useMemo(() => {
    const preferredId = peerIds[0];
    return (preferredId ? remoteStreams[preferredId] : undefined) ?? Object.values(remoteStreams)[0] ?? null;
  }, [peerIds, remoteStreams]);
  const connectionState = useMemo(() => {
    const preferredId = peerIds[0];
    return (preferredId ? connectionStates[preferredId] : undefined) ?? Object.values(connectionStates)[0] ?? "idle";
  }, [connectionStates, peerIds]);
  const value = useMemo<RTCContextValue>(() => ({
    cameraOn, micOn, localStream, remoteStream, remoteStreams, connectionState, connectionStates,
    error, virtualBackgroundUrl, toggleCamera, toggleMic, setVirtualBackground
  }), [
    cameraOn, connectionState, connectionStates, error, localStream, micOn, remoteStream, remoteStreams,
    setVirtualBackground, toggleCamera, toggleMic, virtualBackgroundUrl
  ]);

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playBlocked, setPlayBlocked] = useState(false);
  const isMuted = muted ?? source === "local";
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream ? new MediaStream(stream.getVideoTracks()) : null;
    video.muted = true;
    setPlayBlocked(false);
    if (!stream) return;
    const play = video.play();
    if (play) play.catch(() => undefined);
  }, [stream]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = !isMuted && stream?.getAudioTracks().length ? new MediaStream(stream.getAudioTracks()) : null;
    setPlayBlocked(false);
    if (!audio.srcObject) return;
    const play = audio.play();
    if (play) play.catch(() => setPlayBlocked(true));
  }, [isMuted, stream]);
  const hasVideo = Boolean(stream?.getVideoTracks().some(({ enabled, readyState }) => enabled && readyState === "live"));
  const hasAudio = Boolean(stream?.getAudioTracks().some(({ enabled, readyState }) => enabled && readyState === "live"));
  const active = hasVideo || hasAudio;
  const peerConnectionState = peerId ? rtc.connectionStates[peerId] : rtc.connectionState;
  const emptyMessage = (() => {
    if (hasAudio) return "已连接语音";
    if (source === "local") return "点击摄像头按钮开启";
    if (peerConnectionState === "failed" || peerConnectionState === "disconnected") return "连接异常，正在自动重连";
    if (peerConnectionState === "new" || peerConnectionState === "connecting") return "正在连接对方视频/语音";
    return "等待对方开启摄像头";
  })();
  return (
    <div className={`video-tile ${childFriendly ? "video-tile--child" : ""} ${active ? "is-live" : ""}`}>
      <video ref={videoRef} autoPlay playsInline muted />
      <audio ref={audioRef} autoPlay />
      {!hasVideo && <div className="video-empty"><span className="video-avatar">{source === "local" ? "🙂" : "👩‍🏫"}</span><strong>{label}</strong><small>{emptyMessage}</small></div>}
      {active && <span className="video-label">● {label}{hasAudio && !hasVideo ? " · 语音" : ""}</span>}
      {playBlocked && <button type="button" className="video-play-button" onClick={() => {
        void Promise.allSettled([
          videoRef.current?.play(),
          audioRef.current?.play()
        ]).then(() => setPlayBlocked(false));
      }}>点击播放声音</button>}
    </div>
  );
}
