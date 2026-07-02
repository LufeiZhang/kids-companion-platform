import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Socket } from "socket.io-client";
import { api, API_URL, connectSocket, login, sendSignal, session } from "@companion/shared";
import { RTCProvider, VideoTile, useRTC } from "@companion/rtc";
import type {
  Classroom, Courseware, CoursewarePayload, DrawPayload, RewardPayload,
  RTCAction, RTCSignalPayload, SignalMessage, StudentInteractionPayload,
  User, WhiteboardAction
} from "@companion/types";
import { createSignal } from "@companion/types";
import { Button, Card, EmptyState, Input } from "@companion/ui";
import { Whiteboard } from "@companion/whiteboard";
import "./styles.css";

const APP_BASE = import.meta.env.BASE_URL;
const appUrl = (path = "") => `${APP_BASE}${path}`;
type TeacherTab = "首页" | "我的学生" | "学生分组" | "课堂记录" | "奖励记录";
interface TeacherGroup {
  id: string;
  name: string;
  teacherId: string;
  description?: string;
  students?: Array<{ user: Pick<User, "id" | "name" | "email"> }>;
}
interface TeacherReward {
  id: string;
  rewardType: string;
  message?: string;
  createdAt: string;
  student: { name: string };
  room: { title: string };
}

function Login() {
  const [email, setEmail] = useState("teacher@example.com");
  const [password, setPassword] = useState("Demo123!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password, "teacher");
      location.href = appUrl();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-brand">
        <span className="brand-mark">伴</span>
        <p>儿童远程伴学互动平台</p>
        <h1>把每一次陪伴，变成看得见的成长。</h1>
        <div className="brand-points"><span>实时互动白板</span><span>正向学习激励</span><span>轻量专注提醒</span></div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div><small>TEACHER CONSOLE</small><h2>教师工作台</h2><p>欢迎回来，请登录继续今天的陪伴。</p></div>
        <label>邮箱<Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></label>
        <label>密码<Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></label>
        {error && <p className="error">{error}</p>}
        <Button disabled={busy}>{busy ? "登录中…" : "进入教师端"}</Button>
        <p className="demo-tip">演示账号已预填 · 密码 Demo123!</p>
      </form>
    </main>
  );
}

function Shell({ children, active, onNavigate }: { children: React.ReactNode; active: TeacherTab; onNavigate(tab: TeacherTab): void }) {
  const user = session.user!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span>伴</span><div><b>伴学空间</b><small>教师工作台</small></div></div>
        <nav>
          {(["首页", "我的学生", "学生分组", "课堂记录", "奖励记录"] as TeacherTab[]).map((item) => (
            <button key={item} className={active === item ? "active" : ""} onClick={() => onNavigate(item)}>{item === "首页" ? "▦" : item === "我的学生" ? "♙" : item === "学生分组" ? "◫" : item === "课堂记录" ? "◷" : "✿"} {item}</button>
          ))}
        </nav>
        <div className="privacy-note">🔒 儿童信息仅用于教学服务，请勿截屏或外传。</div>
        <button className="logout" onClick={() => { session.clear(); location.href = appUrl(); }}>退出登录</button>
      </aside>
      <main className="content">
        <header><div><small>上午好，</small><h2>{user.name} 👋</h2></div><div className="user-chip"><span>{user.name.slice(0, 1)}</span><div><b>{user.name}</b><small>伴学教师</small></div></div></header>
        {children}
      </main>
    </div>
  );
}

function Dashboard() {
  const [students, setStudents] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Classroom[]>([]);
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [rewards, setRewards] = useState<TeacherReward[]>([]);
  const [activeTab, setActiveTab] = useState<TeacherTab>("首页");
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("快乐阅读伴学课");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [creating, setCreating] = useState(false);
  const load = async () => {
    try {
      const [studentData, roomData, groupData, rewardData] = await Promise.all([
        api<User[]>("/api/users?role=student"),
        api<Classroom[]>("/api/rooms"),
        api<TeacherGroup[]>("/api/groups"),
        api<TeacherReward[]>("/api/logs/rewards")
      ]);
      setStudents(studentData);
      setRooms(roomData);
      setGroups(groupData);
      setRewards(rewardData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败");
    }
  };
  useEffect(() => { void load(); }, []);
  const weeklyRewards = rewards.filter(({ createdAt }) => Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000);
  const showTodayClasses = () => {
    document.querySelector<HTMLElement>(".schedule")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  };

  const openCreate = (student?: User) => {
    setModalError("");
    if (student) {
      setSelected([student.id]);
      setTitle(`${student.name}的伴学课`);
    } else {
      setSelected([]);
      setTitle("快乐阅读伴学课");
    }
    setShowCreate(true);
  };

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;
    const roomTitle = title.trim();
    if (!roomTitle) {
      setModalError("请填写课堂名称");
      return;
    }
    if (!selected.length) {
      setModalError("请至少选择一名学生");
      return;
    }
    setCreating(true);
    setModalError("");
    try {
      const room = await api<Classroom>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ title: roomTitle, studentIds: selected })
      });
      window.location.assign(appUrl(`classroom/${room.id}`));
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "创建失败，请稍后再试");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Shell active={activeTab} onNavigate={setActiveTab}>
      {activeTab === "首页" && <>
      <section className="welcome-strip"><div><small>WED · 今日教学</small><h1>让专注自然发生，让鼓励及时抵达。</h1><p>你今天有 {rooms.filter((room) => room.status !== "ended").length} 节待进行课堂，{students.length} 位学生等待陪伴。</p></div><Button onClick={() => openCreate()}>＋ 创建课堂</Button></section>
      {error && <p className="error">{error}</p>}
      <div className="stat-grid">
        <button className="stat-link" onClick={showTodayClasses}><Card><span className="stat-icon blue">◷</span><div><small>今日课程</small><strong>{rooms.length}</strong><p>待进行 {rooms.filter((room) => room.status !== "ended").length} 节</p></div><i>›</i></Card></button>
        <button className="stat-link" onClick={() => setActiveTab("我的学生")}><Card><span className="stat-icon cyan">♙</span><div><small>我的学生</small><strong>{students.length}</strong><p>已分配学生</p></div><i>›</i></Card></button>
        <button className="stat-link" onClick={() => setActiveTab("奖励记录")}><Card><span className="stat-icon orange">✿</span><div><small>本周奖励</small><strong>{weeklyRewards.length}</strong><p>查看即时奖励记录</p></div><i>›</i></Card></button>
      </div>
      <div className="dashboard-grid">
        <Card className="schedule">
          <div className="section-title"><div><h3>课堂列表</h3><p>开始或继续你的伴学课堂</p></div><button onClick={() => openCreate()}>创建新课堂</button></div>
          {!rooms.length ? <EmptyState icon="📘" title="还没有课堂"><p>创建第一节伴学课吧</p></EmptyState> : rooms.map((room) => (
            <div className="room-row" key={room.id}>
              <span className={`room-status ${room.status}`}>{room.status === "active" ? "进行中" : room.status === "ended" ? "已结束" : "待开始"}</span>
              <div><b>{room.title}</b><small>{room.students.map(({ student }) => student.name).join("、")}</small></div>
              <button disabled={room.status === "ended"} onClick={() => { location.href = appUrl(`classroom/${room.id}`); }}>{room.status === "active" ? "进入课堂" : "开始课堂"} →</button>
            </div>
          ))}
        </Card>
        <Card className="student-list">
          <div className="section-title"><div><h3>我的学生</h3><p>分组内学生</p></div></div>
          {students.map((student, index) => <div className="student-row" key={student.id}><span className={`avatar a${index % 3}`}>{student.name.slice(0, 1)}</span><div><b>{student.name}</b><small>{student.email}</small></div><span className="online-dot">● 可邀请</span></div>)}
        </Card>
      </div>
      </>}
      {activeTab === "我的学生" && <section className="teacher-subpage">
        <div className="page-heading"><div><small>MY STUDENTS</small><h1>我的学生</h1><p>查看已分配学生，并快速发起一节伴学课堂。</p></div><Button onClick={() => openCreate()}>＋ 创建课堂</Button></div>
        <div className="student-management-grid">
          {students.map((student, index) => {
            const group = groups.find((item) => item.students?.some(({ user }) => user.id === student.id));
            return <Card className="management-card" key={student.id}><div className={`management-avatar a${index % 3}`}>{student.name.slice(0, 1)}</div><div className="management-info"><h3>{student.name}</h3><p>{student.email}</p><span>{group ? `◫ ${group.name}` : "暂未分组"}</span></div><button onClick={() => openCreate(student)}>邀请上课 →</button></Card>;
          })}
          {!students.length && <Card className="subpage-empty">暂时没有已分配学生，请联系管理员分配。</Card>}
        </div>
      </section>}
      {activeTab === "学生分组" && <section className="teacher-subpage">
        <div className="page-heading"><div><small>STUDENT GROUPS</small><h1>学生分组</h1><p>查看由管理员分配给你的教学小组和成员。</p></div></div>
        <div className="group-management-grid">
          {groups.map((group) => <Card className="teacher-group-card" key={group.id}><div className="group-card-top"><span>◫</span><small>{group.students?.length ?? 0} 名学生</small></div><h3>{group.name}</h3><p>{group.description || "一起认真学习、快乐成长。"}</p><div className="group-member-list">{group.students?.map(({ user }, index) => <div key={user.id}><span className={`avatar a${index % 3}`}>{user.name.slice(0, 1)}</span><div><b>{user.name}</b><small>{user.email}</small></div></div>)}</div></Card>)}
          {!groups.length && <Card className="subpage-empty">目前没有负责的学生分组，管理员分配后会显示在这里。</Card>}
        </div>
      </section>}
      {activeTab === "课堂记录" && <section className="teacher-subpage">
        <div className="page-heading"><div><small>CLASS RECORDS</small><h1>课堂记录</h1><p>查看课堂状态、参与学生和上课时间。</p></div></div>
        <Card className="record-card">
          <div className="record-table record-head"><span>课堂</span><span>学生</span><span>状态</span><span>开始时间</span><span>操作</span></div>
          {rooms.map((room) => <div className="record-table" key={room.id}><div><b>{room.title}</b><small>课堂编号 {room.id.slice(0, 8)}</small></div><span>{room.students.map(({ student }) => student.name).join("、") || "—"}</span><span className={`record-status ${room.status}`}>{room.status === "active" ? "进行中" : room.status === "ended" ? "已结束" : "待开始"}</span><span>{room.startedAt ? new Date(room.startedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "尚未开始"}</span><button disabled={room.status === "ended"} onClick={() => { location.href = appUrl(`classroom/${room.id}`); }}>{room.status === "active" ? "进入课堂" : room.status === "ended" ? "已归档" : "开始课堂"}</button></div>)}
          {!rooms.length && <div className="subpage-empty">还没有课堂记录。</div>}
        </Card>
      </section>}
      {activeTab === "奖励记录" && <section className="teacher-subpage">
        <div className="page-heading"><div><small>REWARD RECORDS</small><h1>奖励记录</h1><p>查看课堂中发给学生的每一次正向鼓励。</p></div><span className="week-reward-count">本周 {weeklyRewards.length} 次</span></div>
        <Card className="reward-record-card">
          <div className="reward-record-row reward-record-head"><span>奖励</span><span>学生</span><span>课堂</span><span>鼓励语</span><span>发送时间</span></div>
          {rewards.map((reward) => <div className="reward-record-row" key={reward.id}><div><span className="reward-record-icon">{reward.rewardType === "red_flower" ? "🌸" : reward.rewardType === "trophy" ? "🏆" : reward.rewardType === "confetti" ? "🎉" : "⭐"}</span><b>{reward.rewardType === "red_flower" ? "小红花" : reward.rewardType === "trophy" ? "奖杯" : reward.rewardType === "confetti" ? "彩带" : "星星雨"}</b></div><span>{reward.student.name}</span><span>{reward.room.title}</span><span>{reward.message || "继续加油！"}</span><span>{new Date(reward.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>)}
          {!rewards.length && <div className="subpage-empty">还没有奖励记录，进入课堂给学生送出第一份鼓励吧。</div>}
        </Card>
      </section>}
      {showCreate && <div className="modal-backdrop"><form className="modal" onSubmit={createRoom}><button type="button" className="modal-close" disabled={creating} onClick={() => setShowCreate(false)}>×</button><small>NEW CLASSROOM</small><h2>创建伴学课堂</h2><label>课堂名称<Input value={title} disabled={creating} onChange={(event) => setTitle(event.target.value)} /></label><fieldset disabled={creating}><legend>邀请学生 · 已选 {selected.length} 人</legend>{students.map((student) => <label className="check-row" key={student.id}><input type="checkbox" checked={selected.includes(student.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} /><span>{student.name}</span><small>{student.email}</small></label>)}</fieldset>{modalError && <p className="modal-error" role="alert">⚠ {modalError}</p>}<Button type="submit" disabled={creating}>{creating ? "正在创建课堂…" : "创建并进入课堂"}</Button></form></div>}
    </Shell>
  );
}

function TeacherVideoPanel({ studentName, studentState, handRaised, emoji, emojiKey }: {
  studentName: string;
  studentState: "online" | "hidden" | "offline";
  handRaised?: boolean;
  emoji?: string;
  emojiKey?: number;
}) {
  const rtc = useRTC();
  return (
    <>
      <div className="student-video-card">
        <VideoTile label={studentName} />
        {emoji && <div className="teacher-emoji-pop" key={emojiKey}>{emoji}</div>}
        <div className="student-state"><b>{studentName}</b><div>{handRaised && <span className="hand-raised">✋ 已举手</span>}<span className={`state ${studentState}`}>{studentState === "hidden" ? "⚠ 可能离开页面" : studentState === "online" ? "● 在线学习" : "○ 等待加入"}</span></div></div>
      </div>
      <div className="teacher-local-video"><VideoTile label="我的画面" source="local" muted /></div>
      <div className="teacher-rtc-controls">
        <button className={rtc.cameraOn ? "active" : ""} onClick={() => void rtc.toggleCamera()}>{rtc.cameraOn ? "📹 关闭摄像头" : "📷 开启摄像头"}</button>
        <button className={rtc.micOn ? "active" : ""} onClick={() => void rtc.toggleMic()}>{rtc.micOn ? "🎙️ 关闭麦克风" : "🎤 开启麦克风"}</button>
      </div>
      <small className="rtc-privacy">🔒 仅用于本次课堂通话，不录音录像</small>
      {rtc.error && <div className="teacher-rtc-error">⚠ {rtc.error}</div>}
    </>
  );
}

function ClassroomPage({ roomId }: { roomId: string }) {
  const user = session.user!;
  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<Classroom | null>(null);
  const [incoming, setIncoming] = useState<SignalMessage | null>(null);
  const [page, setPage] = useState(1);
  const [online, setOnline] = useState<Record<string, "online" | "hidden" | "offline">>({});
  const [courseware, setCourseware] = useState<Courseware[]>([]);
  const [selectedCourseware, setSelectedCourseware] = useState<Courseware | null>(null);
  const [notice, setNotice] = useState("");
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [studentEmoji, setStudentEmoji] = useState<{ uid: string; emoji: string; id: number } | null>(null);
  useEffect(() => {
    if (!studentEmoji) return;
    const timer = setTimeout(() => setStudentEmoji(null), 2200);
    return () => clearTimeout(timer);
  }, [studentEmoji]);

  const target = room?.students[0]?.student;
  const sendRTC = useCallback((action: RTCAction, payload: RTCSignalPayload) => {
    const socket = socketRef.current;
    if (!socket || !target) return;
    void sendSignal(socket, createSignal({
      msg_type: "RTC_SIGNAL",
      action,
      room_id: roomId,
      from_uid: user.id,
      target_uid: target.id,
      payload
    }));
  }, [roomId, target?.id, user.id]);
  const makeSignal = <T,>(msgType: SignalMessage["msg_type"], action: SignalMessage["action"], payload: T, targetUid?: string) =>
    createSignal({ msg_type: msgType, action, room_id: roomId, from_uid: user.id, target_uid: targetUid, payload });
  const emit = async (message: SignalMessage<unknown>) => {
    const socket = socketRef.current;
    if (!socket) return;
    const ack = await sendSignal(socket, message);
    if (!ack.ok) setNotice(ack.error ?? "操作未送达");
  };

  useEffect(() => {
    void Promise.all([
      api<Classroom>(`/api/rooms/${roomId}`),
      api<Courseware[]>("/api/courseware")
    ]).then(([roomData, coursewareData]) => {
      setRoom(roomData);
      setCourseware(coursewareData);
      setPage(roomData.currentPage ?? 1);
      if (roomData.status === "scheduled") void api(`/api/rooms/${roomId}/start`, { method: "POST" });
    }).catch((error: Error) => setNotice(error.message));

    const socket = connectSocket();
    socketRef.current = socket;
    socket.on("connect", () => {
      void emit(makeSignal("ROOM_EVENT", "JOIN_ROOM", {}));
      void emit(makeSignal("ROOM_EVENT", "ROOM_STARTED", {}));
    });
    socket.on("signal", (message: SignalMessage) => {
      setIncoming(message);
      if (message.msg_type === "STUDENT_STATUS") {
        setOnline((current) => ({
          ...current,
          [message.from_uid]: message.action === "PAGE_HIDDEN" ? "hidden" : "online"
        }));
      }
      if (message.msg_type === "ROOM_EVENT") {
        setOnline((current) => ({
          ...current,
          [message.from_uid]: message.action === "USER_OFFLINE" ? "offline" : "online"
        }));
      }
      if (message.msg_type === "STUDENT_INTERACTION") {
        const payload = message.payload as unknown as StudentInteractionPayload;
        if (message.action === "RAISE_HAND" || message.action === "LOWER_HAND") {
          setRaisedHands((current) => ({ ...current, [message.from_uid]: message.action === "RAISE_HAND" }));
          setNotice(message.action === "RAISE_HAND" ? "学生举手了 ✋" : "学生已放下手");
        }
        if (message.action === "SEND_EMOJI" && payload.emoji) {
          setStudentEmoji({ uid: message.from_uid, emoji: payload.emoji, id: Date.now() });
          setNotice(`学生发送了 ${payload.emoji}`);
        }
      }
    });
    return () => { socket.disconnect(); };
  }, [roomId]);

  const whiteboardEvent = (action: WhiteboardAction, payload: DrawPayload | { page: number }) => {
    void emit(makeSignal("WHITEBOARD_EVENT", action, payload));
  };
  const changePage = (next: number) => {
    const safePage = Math.max(1, next);
    setPage(safePage);
    void emit(makeSignal("COURSEWARE_CONTROL", "GO_TO_PAGE", {
      courseware_id: selectedCourseware?.id,
      file_url: selectedCourseware ? `${API_URL}${selectedCourseware.fileUrl}` : undefined,
      file_type: selectedCourseware?.type,
      page: safePage
    } satisfies CoursewarePayload));
  };
  const openCourseware = (item: Courseware) => {
    setSelectedCourseware(item);
    setPage(1);
    void emit(makeSignal("COURSEWARE_CONTROL", "OPEN_COURSEWARE", {
      courseware_id: item.id, file_url: `${API_URL}${item.fileUrl}`, file_type: item.type, page: 1
    } satisfies CoursewarePayload));
  };
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("title", file.name);
    try {
      const item = await api<Courseware>("/api/courseware", { method: "POST", body });
      setCourseware((current) => [item, ...current]);
      openCourseware(item);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "上传失败");
    }
  };
  const reward = (rewardType: RewardPayload["reward_type"], message: string) => {
    if (!target) return;
    void emit(makeSignal("TEACHER_CONTROL", "GRANT_REWARD", {
      reward_type: rewardType,
      animation: rewardType,
      message,
      duration: 3200
    } satisfies RewardPayload, target.id));
    setNotice(`已向 ${target.name} 发送奖励`);
  };
  const focus = () => {
    if (!target) return;
    void emit(makeSignal("TEACHER_CONTROL", "FOCUS_REMINDER", {
      message: "小眼睛看回来啦，我们继续专心学习哦！", duration: 4000
    }, target.id));
    setNotice("专注提醒已发送");
  };
  const endClass = async () => {
    if (!confirm("确定结束本次课堂吗？学生端会立即收到结束提示。")) return;
    await emit(makeSignal("ROOM_EVENT", "ROOM_ENDED", {}));
    await api(`/api/rooms/${roomId}/end`, { method: "POST" });
    location.href = appUrl();
  };

  if (!room) return <div className="loading">正在准备课堂空间…</div>;
  return (
    <RTCProvider
      initiator
      incoming={incoming?.msg_type === "RTC_SIGNAL" ? incoming as SignalMessage<RTCSignalPayload> : null}
      sendRTC={sendRTC}
    >
      <div className="classroom-page">
        <header className="classroom-topbar">
          <a href={appUrl()} className="back">←</a><div className="class-title"><small>正在授课</small><b>{room.title}</b></div>
          <div className="courseware-picker">
            <label className="upload-button">＋ 上传课件<input hidden type="file" accept="image/*,.pdf" onChange={upload} /></label>
            <select value={selectedCourseware?.id ?? ""} onChange={(event) => { const item = courseware.find(({ id }) => id === event.target.value); if (item) openCourseware(item); }}>
              <option value="">空白白板</option>{courseware.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
            </select>
          </div>
          <div className="page-controls"><button onClick={() => changePage(page - 1)}>‹</button><span>{page} / —</span><button onClick={() => changePage(page + 1)}>›</button></div>
          <Button className="danger" onClick={endClass}>结束课堂</Button>
        </header>
        <main className="classroom-layout">
          <section className="board-panel">
            <Whiteboard page={page} editable incoming={incoming} onEvent={whiteboardEvent} backgroundUrl={selectedCourseware ? `${API_URL}${selectedCourseware.fileUrl}` : undefined} backgroundType={selectedCourseware?.type} />
          </section>
          <aside className="classroom-aside">
            <div className="aside-block">
              <div className="aside-heading"><b>学生状态</b><span>{target ? "1 人" : "0 人"}</span></div>
              {target && <TeacherVideoPanel studentName={target.name} studentState={online[target.id] ?? "offline"} handRaised={raisedHands[target.id]} emoji={studentEmoji?.uid === target.id ? studentEmoji.emoji : undefined} emojiKey={studentEmoji?.id} />}
            </div>
            <div className="aside-block">
              <div className="aside-heading"><b>即时鼓励</b><small>选择一份奖励</small></div>
              <div className="reward-grid">
                <button onClick={() => reward("red_flower", "你真棒！继续加油！")}><span>🌸</span>小红花</button>
                <button onClick={() => reward("trophy", "太出色啦！这是你的奖杯！")}><span>🏆</span>奖杯</button>
                <button onClick={() => reward("confetti", "为认真学习的你喝彩！")}><span>🎉</span>彩带</button>
                <button onClick={() => reward("star_rain", "每一颗星星都为你闪亮！")}><span>⭐</span>星星雨</button>
              </div>
            </div>
            <div className="aside-block focus-block"><div><span>🎯</span><b>专注提醒</b><small>温和提醒学生回到学习页面</small></div><Button onClick={focus}>发送提醒</Button></div>
            <div className="rtc-note"><b>音视频通话</b><p>RTCProvider 已预留 Agora / TRTC / WebRTC 适配接口。MVP 当前显示安全占位画面。</p></div>
          </aside>
        </main>
        {notice && <div className="toast" onAnimationEnd={() => setNotice("")}>{notice}</div>}
      </div>
    </RTCProvider>
  );
}

function App() {
  const path = location.pathname.startsWith(APP_BASE)
    ? `/${location.pathname.slice(APP_BASE.length)}`
    : location.pathname;
  if (!session.user || session.user.role !== "teacher") return <Login />;
  const match = path.match(/^\/classroom\/([^/]+)/);
  return match?.[1] ? <ClassroomPage roomId={match[1]} /> : <Dashboard />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
