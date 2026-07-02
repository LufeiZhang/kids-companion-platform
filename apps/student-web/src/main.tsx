import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Socket } from "socket.io-client";
import { api, connectSocket, login, sendSignal, session } from "@companion/shared";
import { RTCProvider, VideoTile, useRTC } from "@companion/rtc";
import type {
  Classroom, CoursewarePayload, RTCAction, RTCSignalPayload, RewardPayload,
  SignalMessage, StudentStatusAction
} from "@companion/types";
import { createSignal } from "@companion/types";
import { Button, Card, Input } from "@companion/ui";
import { Whiteboard } from "@companion/whiteboard";
import "./styles.css";

const APP_BASE = import.meta.env.BASE_URL;
const appUrl = (path = "") => `${APP_BASE}${path}`;
type StudentView = "home" | "tasks" | "treasure";

const DAILY_TASKS = [
  { id: "reading", icon: "📖", title: "晨读 15 分钟", detail: "大声朗读今天喜欢的故事" },
  { id: "math", icon: "✏️", title: "完成数学练习", detail: "认真检查每一道题" },
  { id: "review", icon: "🌱", title: "整理错题本", detail: "把今天的新发现记下来" }
];

function getSavedTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem("student-daily-tasks") ?? '["reading","math"]');
    return Array.isArray(saved) ? saved as string[] : ["reading", "math"];
  } catch {
    return ["reading", "math"];
  }
}

function Login() {
  const [email, setEmail] = useState("student@example.com");
  const [password, setPassword] = useState("Demo123!");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await login(email, password, "student");
      location.href = appUrl();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    }
  };
  return (
    <main className="kid-login">
      <div className="cloud cloud-one">☁</div><div className="cloud cloud-two">☁</div>
      <section className="login-welcome"><span className="mascot">🌟</span><small>STAR STUDY SPACE</small><h1>嗨，小小探索家！</h1><p>老师和今天的新知识，都在这里等你啦。</p><div className="planet">🪐</div></section>
      <form className="kid-login-card" onSubmit={submit}>
        <div className="mini-stars">✦　·　✧</div><h2>欢迎回到伴学空间</h2><p>准备好开始今天的学习了吗？</p>
        <label>你的账号<Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></label>
        <label>秘密口令<Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></label>
        {error && <p className="error">{error}</p>}
        <Button>出发，去学习！ 🚀</Button><small>演示账号和口令已经帮你填好啦</small>
      </form>
    </main>
  );
}

function StudentHome() {
  const user = session.user!;
  const [rooms, setRooms] = useState<Classroom[]>([]);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<StudentView>("home");
  const [completedTasks, setCompletedTasks] = useState<string[]>(getSavedTasks);
  useEffect(() => {
    void api<Classroom[]>("/api/rooms").then(setRooms).catch((reason: Error) => setError(reason.message));
  }, []);
  const toggleTask = (taskId: string) => {
    setCompletedTasks((current) => {
      const next = current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId];
      localStorage.setItem("student-daily-tasks", JSON.stringify(next));
      return next;
    });
  };
  const nextRoom = rooms.find((room) => room.status !== "ended");
  return (
    <div className="student-home">
      <header className="kid-header"><button className="kid-logo" onClick={() => setActiveView("home")}><span>★</span><div><b>星星伴学</b><small>快乐学习每一天</small></div></button><nav><button className={activeView === "home" ? "active" : ""} onClick={() => setActiveView("home")}>我的首页</button><button className={activeView === "tasks" ? "active" : ""} onClick={() => setActiveView("tasks")}>学习任务</button><button className={activeView === "treasure" ? "active" : ""} onClick={() => setActiveView("treasure")}>成长宝箱</button></nav><div className="kid-profile"><div><b>{user.name}</b><small>今天也要加油呀！</small></div><span>{user.name.slice(0, 1)}</span><button onClick={() => { session.clear(); location.href = appUrl(); }}>↪</button></div></header>
      {activeView === "home" && <main>
        <section className="hero-card"><div className="hero-copy"><span>🌞 新的一天</span><h1>{user.name}，今天也要<br/><em>元气满满</em>地学习哦！</h1><p>认真完成每一次小挑战，星星就会越来越多 ✨</p>{nextRoom ? <Button onClick={() => { location.href = appUrl(`classroom/${nextRoom.id}`); }}>{nextRoom.status === "active" ? "老师正在等你，进入课堂" : "进入今天的课堂"}　→</Button> : <Button disabled>等待老师创建课堂</Button>}</div><div className="hero-art"><div className="sun">☀️</div><div className="book-kid">📚</div><span className="hero-star s1">★</span><span className="hero-star s2">★</span></div></section>
        {error && <p className="error">{error}</p>}
        <section className="summary-row">
          <Card><span className="summary-icon blue">📅</span><div><small>今日课程</small><strong>{rooms.filter((room) => room.status !== "ended").length}<i>节</i></strong><p>{nextRoom ? "准备好了吗？" : "今天没有待上课程"}</p></div></Card>
          <Card><span className="summary-icon yellow">✅</span><div><small>今日任务</small><strong>{completedTasks.length}<i>/ {DAILY_TASKS.length}</i></strong><p>{completedTasks.length === DAILY_TASKS.length ? "全部完成，你真棒！" : `再完成 ${DAILY_TASKS.length - completedTasks.length} 个就全部完成啦`}</p></div></Card>
          <Card><span className="summary-icon pink">⭐</span><div><small>我的积分</small><strong>128<i>颗</i></strong><p>本周已经获得 36 颗</p></div></Card>
          <Card><span className="summary-icon purple">🏅</span><div><small>我的徽章</small><strong>6<i>枚</i></strong><p>距离新徽章还差一点点</p></div></Card>
        </section>
        <div className="home-columns">
          <Card className="today-class"><div className="card-heading"><div><span>📖</span><div><h3>今天的课程</h3><p>和老师一起开启知识探险</p></div></div><small>{rooms.length} 节课程</small></div>
            {rooms.length ? rooms.map((room) => <div className="kid-room" key={room.id}><span className={`subject-icon ${room.status}`}>{room.status === "ended" ? "✓" : "📘"}</span><div><b>{room.title}</b><small>{room.teacher?.name ?? "伴学老师"} · 互动伴学</small></div><span className={`kid-status ${room.status}`}>{room.status === "active" ? "正在上课" : room.status === "ended" ? "已完成" : "待开始"}</span><button disabled={room.status === "ended"} onClick={() => { location.href = appUrl(`classroom/${room.id}`); }}>进入 →</button></div>) : <div className="home-empty">老师创建课堂后，会出现在这里哦 🌱</div>}
          </Card>
          <Card className="encourage"><div className="quote-mark">“</div><p>每天进步一点点，<br/>你正在变成更棒的自己！</p><span>— 来自伴学老师的悄悄话</span><div className="rainbow">🌈</div></Card>
        </div>
      </main>}
      {activeView === "tasks" && <main className="student-subpage">
        <section className="subpage-hero tasks-hero"><div><small>DAILY ADVENTURE</small><h1>今天的学习任务</h1><p>每完成一个小任务，就点亮一颗成长星星 ✨</p></div><span>🗺️</span></section>
        <Card className="task-list-card">
          <div className="task-progress"><div><h3>今日进度</h3><p>{completedTasks.length === DAILY_TASKS.length ? "全部完成！今天的你闪闪发光。" : "一步一步来，你已经做得很好啦。"}</p></div><strong>{completedTasks.length} / {DAILY_TASKS.length}</strong></div>
          <div className="progress-track"><i style={{ width: `${completedTasks.length / DAILY_TASKS.length * 100}%` }} /></div>
          {DAILY_TASKS.map((task) => {
            const done = completedTasks.includes(task.id);
            return <button className={`task-item ${done ? "done" : ""}`} key={task.id} onClick={() => toggleTask(task.id)}><span className="task-icon">{task.icon}</span><div><b>{task.title}</b><small>{task.detail}</small></div><i className="task-check">{done ? "✓" : ""}</i></button>;
          })}
        </Card>
      </main>}
      {activeView === "treasure" && <main className="student-subpage">
        <section className="subpage-hero treasure-hero"><div><small>GROWTH TREASURE</small><h1>{user.name}的成长宝箱</h1><p>你的每一次认真，都变成了宝箱里的闪亮收藏。</p></div><span>🎁</span></section>
        <section className="treasure-summary"><Card><span>⭐</span><div><small>成长星星</small><strong>128</strong></div></Card><Card><span>🏅</span><div><small>已获徽章</small><strong>6</strong></div></Card><Card><span>🔥</span><div><small>连续学习</small><strong>7 天</strong></div></Card></section>
        <Card className="badge-collection"><div className="card-heading"><div><span>🏆</span><div><h3>我的徽章</h3><p>继续努力，解锁更多成长纪念</p></div></div><small>已点亮 6 枚</small></div>
          <div className="treasure-grid">
            {[["🎯","专注小达人","认真完成一节伴学课"],["📚","阅读之星","完成五次阅读任务"],["🌞","元气早鸟","连续三天按时学习"],["💪","坚持之星","连续学习七天"],["🌸","鼓励收藏家","收到五朵小红花"],["🚀","进步小火箭","本周完成全部任务"]].map(([icon, name, detail]) => <div className="badge-card" key={name}><span>{icon}</span><b>{name}</b><small>{detail}</small></div>)}
            <div className="badge-card locked"><span>?</span><b>神秘徽章</b><small>再完成 2 节课堂解锁</small></div>
          </div>
        </Card>
      </main>}
    </div>
  );
}

function RewardOverlay({ reward, onDone }: { reward: RewardPayload; onDone(): void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, reward.duration || 3200);
    return () => clearTimeout(timer);
  }, [reward, onDone]);
  const symbol = reward.reward_type === "red_flower" ? "🌸" : reward.reward_type === "trophy" ? "🏆" : reward.reward_type === "confetti" ? "🎉" : "⭐";
  return (
    <div className={`reward-overlay ${reward.reward_type}`}>
      <div className="reward-particles">{Array.from({ length: 26 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties}>{symbol}</i>)}</div>
      <div className="reward-card"><span>{symbol}</span><h2>{reward.reward_type === "trophy" ? "获得一座奖杯！" : "你真棒！"}</h2><p>{reward.message}</p><div>老师为你点赞啦 👍</div></div>
    </div>
  );
}

function ClassroomControls({ sendStatus }: { sendStatus(action: StudentStatusAction): void }) {
  const rtc = useRTC();
  return (
    <div className="student-controls">
      <button title="麦克风仅用于本次课堂通话，不会录音" className={!rtc.micOn ? "off" : ""} onClick={async () => { const enabled = await rtc.toggleMic(); sendStatus(enabled ? "MIC_ON" : "MIC_OFF"); }}><span>{rtc.micOn ? "🎙️" : "🔇"}</span>麦克风</button>
      <button title="摄像头仅用于本次课堂通话，不会录像" className={!rtc.cameraOn ? "off" : ""} onClick={async () => { const enabled = await rtc.toggleCamera(); sendStatus(enabled ? "CAMERA_ON" : "CAMERA_OFF"); }}><span>{rtc.cameraOn ? "📹" : "🚫"}</span>摄像头</button>
      <button><span>✋</span>举手</button><button><span>😊</span>表情</button>
    </div>
  );
}

function StudentVideoError() {
  const rtc = useRTC();
  return rtc.error ? <div className="rtc-error">⚠ {rtc.error}</div> : null;
}

function StudentClassroom({ roomId }: { roomId: string }) {
  const user = session.user!;
  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<Classroom | null>(null);
  const [incoming, setIncoming] = useState<SignalMessage | null>(null);
  const [page, setPage] = useState(1);
  const [courseware, setCourseware] = useState<{ url?: string; type?: "image" | "pdf" }>({});
  const [reward, setReward] = useState<RewardPayload | null>(null);
  const [focusMessage, setFocusMessage] = useState("");
  const [ended, setEnded] = useState(false);
  const [connection, setConnection] = useState("正在连接老师…");

  const message = <T,>(msgType: SignalMessage["msg_type"], action: SignalMessage["action"], payload: T, targetUid?: string) =>
    createSignal({ msg_type: msgType, action, room_id: roomId, from_uid: user.id, target_uid: targetUid, payload });
  const send = (signal: SignalMessage<unknown>) => {
    if (socketRef.current) void sendSignal(socketRef.current, signal);
  };
  const sendStatus = (action: StudentStatusAction) => send(message("STUDENT_STATUS", action, {
    visibility: document.visibilityState,
    last_active_at: Date.now()
  }));
  const sendRTC = useCallback((action: RTCAction, payload: RTCSignalPayload) => {
    const socket = socketRef.current;
    const teacherId = room?.teacherId;
    if (!socket || !teacherId) return;
    void sendSignal(socket, createSignal({
      msg_type: "RTC_SIGNAL",
      action,
      room_id: roomId,
      from_uid: user.id,
      target_uid: teacherId,
      payload
    }));
  }, [room?.teacherId, roomId, user.id]);

  useEffect(() => {
    void api<Classroom>(`/api/rooms/${roomId}`).then((data) => {
      setRoom(data);
      setPage(data.currentPage ?? 1);
      if (data.status === "ended") setEnded(true);
    }).catch(() => setEnded(true));
    const socket = connectSocket();
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnection("已连线");
      send(message("ROOM_EVENT", "JOIN_ROOM", {}));
      send(message("ROOM_EVENT", "USER_ONLINE", {}));
      sendStatus("PAGE_VISIBLE");
    });
    socket.on("disconnect", () => setConnection("连接中断，正在重试…"));
    socket.on("signal", (signal: SignalMessage) => {
      setIncoming(signal);
      if (signal.msg_type === "COURSEWARE_CONTROL") {
        const payload = signal.payload as unknown as CoursewarePayload;
        setPage(payload.page ?? 1);
        setCourseware({ url: payload.file_url, type: payload.file_type });
      }
      if (signal.msg_type === "TEACHER_CONTROL" && signal.action === "GRANT_REWARD") {
        setReward(signal.payload as unknown as RewardPayload);
      }
      if (signal.msg_type === "TEACHER_CONTROL" && signal.action === "FOCUS_REMINDER") {
        const payload = signal.payload as { message?: string };
        setFocusMessage(payload.message ?? "小眼睛看回来啦，我们继续学习哦！");
      }
      if (signal.msg_type === "ROOM_EVENT" && signal.action === "ROOM_ENDED") setEnded(true);
    });
    const visibility = () => sendStatus(document.hidden ? "PAGE_HIDDEN" : "PAGE_VISIBLE");
    document.addEventListener("visibilitychange", visibility);
    const beforeUnload = () => send(message("ROOM_EVENT", "LEAVE_ROOM", {}));
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("beforeunload", beforeUnload);
      socket.disconnect();
    };
  }, [roomId]);

  if (!room) return <div className="kid-loading"><span>⭐</span>正在飞往课堂…</div>;
  return (
    <RTCProvider
      initiator={false}
      incoming={incoming?.msg_type === "RTC_SIGNAL" ? incoming as SignalMessage<RTCSignalPayload> : null}
      sendRTC={sendRTC}
    >
      <div className="student-classroom">
        <header className="student-classbar"><a href={appUrl()}>★ 星星伴学</a><div><span className="live-dot">●</span><b>{room.title}</b><small>{connection}</small></div><span className="class-motto">认真听讲的你最闪亮 ✨</span></header>
        <main className="student-class-layout">
          <section className="student-board"><Whiteboard page={page} editable={false} incoming={incoming} backgroundUrl={courseware.url} backgroundType={courseware.type} /></section>
          <div className="teacher-pip"><VideoTile label={`${room.teacher?.name ?? "老师"}正在陪伴你`} childFriendly /><div className="pip-live">● 老师在线</div></div>
          <div className="student-self-pip"><VideoTile label="我的画面" source="local" muted /></div>
          <ClassroomControls sendStatus={sendStatus} />
          <StudentVideoError />
        </main>
        {reward && <RewardOverlay reward={reward} onDone={() => setReward(null)} />}
        {focusMessage && <div className="focus-overlay"><div className="focus-card"><span>🎯</span><h2>小眼睛，看这里</h2><p>{focusMessage}</p><Button onClick={() => { setFocusMessage(""); sendStatus("ACTIVE"); }}>我回来啦！</Button></div></div>}
        {ended && <div className="focus-overlay"><div className="focus-card end-card"><span>🌙</span><h2>今天的课堂结束啦</h2><p>你今天也很认真哦，休息一下吧！</p><Button onClick={() => { location.href = appUrl(); }}>回到我的首页</Button></div></div>}
      </div>
    </RTCProvider>
  );
}

function App() {
  if (!session.user || session.user.role !== "student") return <Login />;
  const path = location.pathname.startsWith(APP_BASE)
    ? `/${location.pathname.slice(APP_BASE.length)}`
    : location.pathname;
  const match = path.match(/^\/classroom\/([^/]+)/);
  return match?.[1] ? <StudentClassroom roomId={match[1]} /> : <StudentHome />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
