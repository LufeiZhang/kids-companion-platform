import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Socket } from "socket.io-client";
import {
  api, API_URL, connectSocket, getLanguagePreference, login, sendSignal, session,
  setLanguagePreference, subscribeLanguagePreference, syncDocumentLanguage, translateText, type Language
} from "@companion/shared";
import { RTCProvider, VideoTile, useRTC } from "@companion/rtc";
import type {
  ClassSessionReport, Classroom, ClassroomPraisePayload, Courseware, CoursewarePayload, DrawPayload,
  LearningTask, PomodoroPayload, RewardPayload, RTCAction, RTCSignalPayload, SignalMessage, StudentInteractionPayload,
  User, WhiteboardAction
} from "@companion/types";
import { createSignal } from "@companion/types";
import { Button, Card, EmptyState, Input, LanguageSwitcher } from "@companion/ui";
import { Whiteboard } from "@companion/whiteboard";
import "./styles.css";

const APP_BASE = import.meta.env.BASE_URL;
const appUrl = (path = "") => `${APP_BASE}${path}`;
type TeacherTab = "首页" | "我的学生" | "学生分组" | "学习任务" | "课堂记录" | "奖励记录";
interface TeacherGroup {
  id: string;
  name: string;
  teacherId: string;
  description?: string;
  students?: Array<{ user: Pick<User, "id" | "name" | "email"> }>;
}
interface TeacherStudent extends User {
  studentProfile?: {
    groupId?: string | null;
    group?: { id: string; teacherId: string } | null;
    groupMemberships?: Array<{ group: { id: string; teacherId: string } }>;
  };
}
interface TeacherReward {
  id: string;
  teacherId?: string;
  rewardType: string;
  message?: string;
  createdAt: string;
  teacher?: { id?: string; name: string };
  student: { id?: string; name: string };
  room: { title: string; teacherId?: string };
}

const rewardIcon = (type: string) => type === "red_flower" ? "🌸" : type === "trophy" ? "🏆" : type === "confetti" ? "🎉" : type === "task_praise" ? "👏" : "⭐";
const rewardLabel = (type: string) => type === "red_flower" ? "小红花" : type === "trophy" ? "奖杯" : type === "confetti" ? "彩带" : type === "task_praise" ? "任务表扬" : "星星雨";
const studentBelongsToTeacher = (student: TeacherStudent, teacherId: string) =>
  student.studentProfile?.group?.teacherId === teacherId
  || (student.studentProfile?.groupMemberships ?? []).some(({ group }) => group.teacherId === teacherId);
const rewardBelongsToTeacher = (reward: TeacherReward, teacherId: string) =>
  reward.teacherId === teacherId || reward.teacher?.id === teacherId || reward.room.teacherId === teacherId;
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const formatSeconds = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, "0")}:${Math.max(0, seconds % 60).toString().padStart(2, "0")}`;
const remainingPomodoroSeconds = (pomodoro: PomodoroPayload | null, now = Date.now()) => {
  if (!pomodoro) return 0;
  if (pomodoro.status === "running" && pomodoro.endsAt) return Math.max(0, Math.ceil((pomodoro.endsAt - now) / 1000));
  return Math.max(0, pomodoro.remainingSeconds ?? pomodoro.durationSeconds ?? 0);
};
const pomodoroFromRoom = (room: Classroom): PomodoroPayload | null => {
  if (!room.pomodoroStatus || room.pomodoroStatus === "stopped") return null;
  return {
    status: room.pomodoroStatus,
    durationSeconds: room.pomodoroDurationSeconds ?? 0,
    startedAt: room.pomodoroStartedAt ? new Date(room.pomodoroStartedAt).getTime() : undefined,
    endsAt: room.pomodoroEndsAt ? new Date(room.pomodoroEndsAt).getTime() : undefined,
    remainingSeconds: room.pomodoroRemainingSeconds ?? undefined,
    label: room.pomodoroLabel ?? undefined
  };
};

function useDismissibleOverlay(onDone: () => void, durationMs: number, resetKey: unknown) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), durationMs);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDoneRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [durationMs, resetKey]);
}

function useLanguageState() {
  const [language, setLanguageState] = useState<Language>(() => getLanguagePreference());
  useEffect(() => subscribeLanguagePreference(setLanguageState), []);
  const setLanguage = useCallback((next: Language) => {
    setLanguagePreference(next);
    setLanguageState(next);
  }, []);
  return { language, setLanguage };
}

function DocumentLanguageSync() {
  const { language } = useLanguageState();
  useEffect(() => syncDocumentLanguage(language), [language]);
  return null;
}

function Login() {
  const { language, setLanguage } = useLanguageState();
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
        <LanguageSwitcher language={language} onChange={setLanguage} className="login-language" />
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
  const { language, setLanguage } = useLanguageState();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span>伴</span><div><b>伴学空间</b><small>教师工作台</small></div></div>
        <nav>
          {(["首页", "我的学生", "学生分组", "学习任务", "课堂记录", "奖励记录"] as TeacherTab[]).map((item) => (
            <button key={item} className={active === item ? "active" : ""} onClick={() => onNavigate(item)}>{item === "首页" ? "▦" : item === "我的学生" ? "♙" : item === "学生分组" ? "◫" : item === "学习任务" ? "✓" : item === "课堂记录" ? "◷" : "✿"} {item}</button>
          ))}
        </nav>
        <div className="privacy-note">🔒 儿童信息仅用于教学服务，请勿截屏或外传。</div>
        <button className="logout" onClick={() => { session.clear(); location.href = appUrl(); }}>退出登录</button>
      </aside>
      <main className="content">
        <header><div><small>上午好，</small><h2>{user.name} 👋</h2></div><div className="header-actions"><LanguageSwitcher language={language} onChange={setLanguage} /><div className="user-chip"><span>{user.name.slice(0, 1)}</span><div><b>{user.name}</b><small>伴学教师</small></div></div></div></header>
        {children}
      </main>
    </div>
  );
}

function Dashboard() {
  const { language } = useLanguageState();
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [rooms, setRooms] = useState<Classroom[]>([]);
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [rewards, setRewards] = useState<TeacherReward[]>([]);
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [activeTab, setActiveTab] = useState<TeacherTab>("首页");
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("快乐阅读伴学课");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", detail: "", studentId: "", dueDate: "" });
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const [savingReportId, setSavingReportId] = useState("");
  const load = async () => {
    try {
      const [currentTeacher, studentData, roomData, groupData, rewardData, taskData] = await Promise.all([
        api<User>("/api/users/me"),
        api<TeacherStudent[]>("/api/users?role=student"),
        api<Classroom[]>("/api/rooms"),
        api<TeacherGroup[]>("/api/groups"),
        api<TeacherReward[]>("/api/logs/rewards"),
        api<LearningTask[]>("/api/tasks")
      ]);
      if (currentTeacher.role !== "teacher" || currentTeacher.id !== session.user?.id) {
        session.clear();
        location.href = appUrl();
        return;
      }
      const scopedStudents = studentData.filter((student) => studentBelongsToTeacher(student, currentTeacher.id));
      const scopedStudentIds = new Set(scopedStudents.map(({ id }) => id));
      setStudents(scopedStudents);
      setRooms(roomData.filter((room) => room.teacherId === currentTeacher.id));
      setGroups(groupData
        .filter((group) => group.teacherId === currentTeacher.id)
        .map((group) => ({
          ...group,
          students: group.students?.filter(({ user }) => scopedStudentIds.has(user.id))
        })));
      setRewards(rewardData.filter((reward) => rewardBelongsToTeacher(reward, currentTeacher.id)));
      setTasks(taskData.filter((task) => task.teacherId === currentTeacher.id && scopedStudentIds.has(task.studentId)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败");
    }
  };
  useEffect(() => { void load(); }, []);
  const activeRoomCount = rooms.filter((room) => room.status !== "ended").length;
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
  const openTaskForm = () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setTaskForm({ title: "", detail: "", studentId: students[0]?.id ?? "", dueDate: tomorrow });
    setTaskError("");
    setShowTaskForm(true);
  };
  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingTask) return;
    if (!taskForm.title.trim() || !taskForm.studentId) {
      setTaskError("请填写任务名称并选择学生");
      return;
    }
    setSavingTask(true);
    setTaskError("");
    try {
      const task = await api<LearningTask>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(taskForm)
      });
      setTasks((current) => [task, ...current]);
      setShowTaskForm(false);
    } catch (reason) {
      setTaskError(reason instanceof Error ? reason.message : "任务布置失败");
    } finally {
      setSavingTask(false);
    }
  };
  const changeTaskStatus = async (task: LearningTask) => {
    try {
      const updated = await api<LearningTask>(`/api/tasks/${task.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" })
      });
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "任务状态更新失败");
    }
  };
  const updateRoomReports = (roomId: string, reports: ClassSessionReport[]) => {
    setRooms((current) => current.map((room) => room.id === roomId ? { ...room, sessionReports: reports } : room));
  };
  const generateReports = async (room: Classroom) => {
    try {
      const reports = await api<ClassSessionReport[]>(`/api/rooms/${room.id}/reports/generate`, { method: "POST" });
      updateRoomReports(room.id, reports);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "课后记录生成失败");
    }
  };
  const saveReportNote = async (roomId: string, report: ClassSessionReport) => {
    setSavingReportId(report.id);
    try {
      const updated = await api<ClassSessionReport>(`/api/rooms/${roomId}/reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify({ teacherNotes: reportNotes[report.id] ?? report.teacherNotes ?? "" })
      });
      setRooms((current) => current.map((room) => room.id === roomId ? {
        ...room,
        sessionReports: (room.sessionReports ?? []).map((item) => item.id === updated.id ? updated : item)
      } : room));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "教师备注保存失败");
    } finally {
      setSavingReportId("");
    }
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
      <section className="welcome-strip"><div><small>{language === "en" ? "WED · Today's Teaching" : "WED · 今日教学"}</small><h1>让专注自然发生，让鼓励及时抵达。</h1><p>{language === "en" ? <>You have {activeRoomCount} upcoming class(es), with {students.length} student(s) waiting.</> : <>你今天有 {activeRoomCount} 节待进行课堂，{students.length} 位学生等待陪伴。</>}</p></div><Button onClick={() => openCreate()}>＋ 创建课堂</Button></section>
      {error && <p className="error">{error}</p>}
      <div className="stat-grid">
        <button className="stat-link" onClick={showTodayClasses}><Card><span className="stat-icon blue">◷</span><div><small>今日课程</small><strong>{rooms.length}</strong><p>{language === "en" ? `${activeRoomCount} upcoming` : <>待进行 {activeRoomCount} 节</>}</p></div><i>›</i></Card></button>
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
      {activeTab === "学习任务" && <section className="teacher-subpage">
        <div className="page-heading"><div><small>LEARNING TASKS</small><h1>学习任务</h1><p>由教师布置并确认完成，学生端只能查看任务状态。</p></div><Button onClick={openTaskForm}>＋ 布置任务</Button></div>
        {error && <p className="error">{error}</p>}
        <div className="task-stat-row"><Card><small>任务总数</small><strong>{tasks.length}</strong></Card><Card><small>待确认</small><strong>{tasks.filter(({ status }) => status === "pending").length}</strong></Card><Card><small>已完成</small><strong>{tasks.filter(({ status }) => status === "completed").length}</strong></Card></div>
        <Card className="teacher-task-card">
          <div className="teacher-task-row teacher-task-head"><span>任务</span><span>学生</span><span>截止日期</span><span>状态</span><span>教师操作</span></div>
          {tasks.map((task) => <div className="teacher-task-row" key={task.id}><div><b>{task.title}</b><small>{task.detail || "暂无任务说明"}</small></div><span>{task.student?.name ?? "学生"}</span><span>{task.dueDate ? new Date(task.dueDate).toLocaleDateString("zh-CN") : "未设置"}</span><span className={`task-status ${task.status}`}>{task.status === "completed" ? "已完成" : "等待确认"}</span><button className={task.status === "completed" ? "reopen" : ""} onClick={() => void changeTaskStatus(task)}>{task.status === "completed" ? "重新打开" : "确认完成"}</button></div>)}
          {!tasks.length && <div className="subpage-empty">还没有学习任务，点击“布置任务”开始安排。</div>}
        </Card>
      </section>}
      {activeTab === "课堂记录" && <section className="teacher-subpage">
        <div className="page-heading"><div><small>CLASS RECORDS</small><h1>课堂记录</h1><p>查看课堂状态、参与学生和上课时间。</p></div></div>
        <Card className="record-card">
          <div className="record-table record-head"><span>课堂</span><span>学生</span><span>状态</span><span>开始时间</span><span>操作</span></div>
          {rooms.map((room) => <div className="record-block" key={room.id}><div className="record-table"><div><b>{room.title}</b><small>课堂编号 {room.id.slice(0, 8)}</small></div><span>{room.students.map(({ student }) => student.name).join("、") || "—"}</span><span className={`record-status ${room.status}`}>{room.status === "active" ? "进行中" : room.status === "ended" ? "已结束" : "待开始"}</span><span>{room.startedAt ? new Date(room.startedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "尚未开始"}</span><button disabled={room.status === "ended" && Boolean(room.sessionReports?.length)} onClick={() => { room.status === "ended" ? void generateReports(room) : location.href = appUrl(`classroom/${room.id}`); }}>{room.status === "active" ? "进入课堂" : room.status === "ended" ? room.sessionReports?.length ? "已生成" : "生成记录" : "开始课堂"}</button></div>
            {room.status === "ended" && Boolean(room.sessionReports?.length) && <div className="session-report-list">
              {room.sessionReports!.map((report) => <div className="session-report-card" key={report.id}>
                <div className="report-top"><div><small>{report.aiSummary?.provider === "openai" ? "真实 AI 课后总结" : "模板课后记录"}</small><h3>{report.student?.name ?? "学生"} · 专注分 {report.focusScore}</h3></div><span className={report.focusScore >= 80 ? "good" : report.focusScore >= 60 ? "mid" : "low"}>{report.focusScore}</span></div>
                <div className="report-metrics">
                  <span>上课 {report.durationMinutes} 分钟</span><span>{report.leftPage ? `离开页面 ${report.leftPageCount} 次` : "未离开页面"}</span><span>奖励 {report.rewardCount} 次</span><span>任务 {report.completedTaskCount} 个</span><span>举手 {report.handRaiseCount} 次</span><span>反馈 {report.feedbackCount + report.earlyFinishCount} 次</span>
                </div>
                <p className="ai-summary">{report.aiSummary?.studentPerformance ?? report.parentSummary ?? "暂无总结"}</p>
                <details><summary>查看 AI 课后总结字段</summary><div className="ai-detail"><p><b>生成来源：</b>{report.aiSummary?.provider === "openai" ? `OpenAI · ${report.aiSummary.model ?? "AI"}` : report.aiSummary?.fallbackReason ?? "模板总结"}</p><p><b>学习内容：</b>{report.aiSummary?.learningContent}</p><p><b>注意力：</b>{report.aiSummary?.attention}</p><p><b>下节建议：</b>{report.aiSummary?.nextLessonSuggestion}</p><p><b>家长版：</b>{report.parentSummary}</p></div></details>
                <label className="teacher-note">教师备注<textarea value={reportNotes[report.id] ?? report.teacherNotes ?? ""} onChange={(event) => setReportNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="补充本节课重点、学生状态或下节课建议" /></label>
                <button className="save-note" disabled={savingReportId === report.id} onClick={() => void saveReportNote(room.id, report)}>{savingReportId === report.id ? "保存中…" : "保存备注并刷新总结"}</button>
              </div>)}
            </div>}
          </div>)}
          {!rooms.length && <div className="subpage-empty">还没有课堂记录。</div>}
        </Card>
      </section>}
      {activeTab === "奖励记录" && <section className="teacher-subpage">
        <div className="page-heading"><div><small>REWARD RECORDS</small><h1>奖励记录</h1><p>查看课堂中发给学生的每一次正向鼓励。</p></div><span className="week-reward-count">本周 {weeklyRewards.length} 次</span></div>
        <Card className="reward-record-card">
          <div className="reward-record-row reward-record-head"><span>奖励</span><span>学生</span><span>课堂</span><span>鼓励语</span><span>发送时间</span></div>
          {rewards.map((reward) => <div className="reward-record-row" key={reward.id}><div><span className="reward-record-icon">{rewardIcon(reward.rewardType)}</span><b>{rewardLabel(reward.rewardType)}</b></div><span>{reward.student.name}</span><span>{reward.room.title}</span><span>{reward.message || "继续加油！"}</span><span>{new Date(reward.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>)}
          {!rewards.length && <div className="subpage-empty">还没有奖励记录，进入课堂给学生送出第一份鼓励吧。</div>}
        </Card>
      </section>}
      {showCreate && <div className="modal-backdrop"><form className="modal" onSubmit={createRoom}><button type="button" className="modal-close" disabled={creating} onClick={() => setShowCreate(false)}>×</button><small>NEW CLASSROOM</small><h2>创建伴学课堂</h2><label>课堂名称<Input value={title} disabled={creating} onChange={(event) => setTitle(event.target.value)} /></label><fieldset disabled={creating}><legend>邀请学生 · 已选 {selected.length} 人</legend>{students.map((student) => <label className="check-row" key={student.id}><input type="checkbox" checked={selected.includes(student.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} /><span>{student.name}</span><small>{student.email}</small></label>)}</fieldset>{modalError && <p className="modal-error" role="alert">⚠ {modalError}</p>}<Button type="submit" disabled={creating}>{creating ? "正在创建课堂…" : "创建并进入课堂"}</Button></form></div>}
      {showTaskForm && <div className="modal-backdrop"><form className="modal task-modal" onSubmit={createTask}><button type="button" className="modal-close" disabled={savingTask} onClick={() => setShowTaskForm(false)}>×</button><small>NEW LEARNING TASK</small><h2>布置学习任务</h2><label>任务名称<Input value={taskForm.title} disabled={savingTask} placeholder="例如：朗读课文第 3 课" onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} /></label><label>任务说明<Input value={taskForm.detail} disabled={savingTask} placeholder="写清楚完成要求" onChange={(event) => setTaskForm((current) => ({ ...current, detail: event.target.value }))} /></label><label>选择学生<select value={taskForm.studentId} disabled={savingTask} onChange={(event) => setTaskForm((current) => ({ ...current, studentId: event.target.value }))}><option value="">请选择学生</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><label>截止日期<Input type="date" value={taskForm.dueDate} disabled={savingTask} onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>{taskError && <p className="modal-error" role="alert">⚠ {taskError}</p>}<Button type="submit" disabled={savingTask}>{savingTask ? "正在布置…" : "确认布置任务"}</Button></form></div>}
    </Shell>
  );
}

function TeacherVideoPanel({ studentId, studentName, studentState, selected, onSelect, handRaised, emoji, emojiKey, pomodoroDone }: {
  studentId: string;
  studentName: string;
  studentState: "online" | "hidden" | "offline";
  selected: boolean;
  onSelect(): void;
  handRaised?: boolean;
  emoji?: string;
  emojiKey?: number;
  pomodoroDone?: boolean;
}) {
  return (
    <button type="button" className={`student-video-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <VideoTile label={studentName} peerId={studentId} />
      {emoji && <div className="teacher-emoji-pop" key={emojiKey}>{emoji}</div>}
      <div className="student-state"><b>{studentName}</b><div>{selected && <span className="target-badge">当前目标</span>}{handRaised && <span className="hand-raised">✋ 已举手</span>}{pomodoroDone && <span className="pomodoro-done">🍅 已提前完成</span>}<span className={`state ${studentState}`}>{studentState === "hidden" ? "⚠ 可能离开页面" : studentState === "online" ? "● 在线学习" : "○ 等待加入"}</span></div></div>
    </button>
  );
}

function TeacherRTCControls() {
  const rtc = useRTC();
  return (
    <div className="teacher-self-card">
      <div className="teacher-local-video"><VideoTile label="我的画面" source="local" muted /></div>
      <div className="teacher-rtc-controls">
        <button className={rtc.cameraOn ? "active" : ""} onClick={() => void rtc.toggleCamera()}>{rtc.cameraOn ? "📹 关闭摄像头" : "📷 开启摄像头"}</button>
        <button className={rtc.micOn ? "active" : ""} onClick={() => void rtc.toggleMic()}>{rtc.micOn ? "🎙️ 关闭麦克风" : "🎤 开启麦克风"}</button>
      </div>
      <small className="rtc-privacy">🔒 仅用于本次课堂通话，不录音录像</small>
      {rtc.error && <div className="teacher-rtc-error">⚠ {rtc.error}</div>}
    </div>
  );
}

function TeacherPomodoroPanel({ minutes, setMinutes, pomodoro, remainingSeconds, doneCount, total, onStart, onPause, onResume, onStop, onFinish }: {
  minutes: number;
  setMinutes(value: number): void;
  pomodoro: PomodoroPayload | null;
  remainingSeconds: number;
  doneCount: number;
  total: number;
  onStart(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  onFinish(): void;
}) {
  const status = pomodoro?.status ?? "stopped";
  return (
    <div className={`pomodoro-panel ${status}`}>
      <div className="pomodoro-clock"><span>🍅</span><b>{formatSeconds(remainingSeconds)}</b><small>{status === "running" ? "专注中" : status === "paused" ? "已暂停" : status === "completed" ? "已完成" : "未开始"}</small></div>
      <label>时长（分钟）<input type="number" min="1" max="120" value={minutes} disabled={status === "running"} onChange={(event) => setMinutes(clampNumber(Number(event.target.value), 1, 120))} /></label>
      <div className="pomodoro-actions">
        <button onClick={onStart}>开始</button>
        <button onClick={status === "paused" ? onResume : onPause} disabled={!pomodoro || status === "stopped" || status === "completed"}>{status === "paused" ? "继续" : "暂停"}</button>
        <button onClick={onFinish} disabled={!pomodoro || status === "completed" || status === "stopped"}>完成</button>
        <button onClick={onStop} disabled={!pomodoro || status === "stopped"}>停止</button>
      </div>
      <p>{doneCount}/{total} 名学生已提前完成并举手。</p>
    </div>
  );
}

function ClassroomPraiseOverlay({ praise, onDone }: { praise: ClassroomPraisePayload; onDone(): void }) {
  const { language } = useLanguageState();
  useDismissibleOverlay(onDone, praise.duration || 4200, praise);
  const studentName = translateText(praise.student_name, language);
  const taskTitle = praise.task_title ? translateText(praise.task_title, language) : "";
  return (
    <div className={`class-praise-overlay ${praise.animation}`} role="dialog" aria-modal="true" onClick={onDone}>
      <button type="button" className="overlay-close" aria-label="关闭" onClick={(event) => { event.stopPropagation(); onDone(); }}>×</button>
      <div className="praise-rays" />
      <div className="praise-particles">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties}>★</i>)}</div>
      <div className="class-praise-card" onClick={(event) => event.stopPropagation()}>
        <span>👏</span>
        <small>{language === "en" ? "Whole-class Praise" : "全班表扬"}</small>
        <h2>{language === "en" ? `${studentName} completed a task!` : `${studentName} 完成任务啦！`}</h2>
        {taskTitle && <b>{language === "en" ? `"${taskTitle}"` : `《${taskTitle}》`}</b>}
        <p>{translateText(praise.message, language)}</p>
      </div>
    </div>
  );
}

function ClassroomPage({ roomId }: { roomId: string }) {
  const user = session.user!;
  const { language, setLanguage } = useLanguageState();
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
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [classroomPraise, setClassroomPraise] = useState<ClassroomPraisePayload | null>(null);
  const [pomodoroMinutes, setPomodoroMinutes] = useState(25);
  const [pomodoro, setPomodoro] = useState<PomodoroPayload | null>(null);
  const [pomodoroDone, setPomodoroDone] = useState<Record<string, boolean>>({});
  const [timerNow, setTimerNow] = useState(Date.now());
  const [finishBroadcasted, setFinishBroadcasted] = useState(false);
  useEffect(() => {
    if (!studentEmoji) return;
    const timer = setTimeout(() => setStudentEmoji(null), 2200);
    return () => clearTimeout(timer);
  }, [studentEmoji]);
  useEffect(() => {
    const timer = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const classroomStudents = useMemo(() => room?.students.map(({ student }) => student) ?? [], [room]);
  const selectedTarget = classroomStudents.find(({ id }) => id === selectedStudentId) ?? classroomStudents[0];
  const tasksForSelectedTarget = useMemo(
    () => tasks.filter((task) => task.studentId === selectedTarget?.id),
    [tasks, selectedTarget?.id]
  );
  const pomodoroRemaining = remainingPomodoroSeconds(pomodoro, timerNow);
  const visiblePomodoro = pomodoro && pomodoro.status === "running" && pomodoroRemaining <= 0
    ? { ...pomodoro, status: "completed" as const, remainingSeconds: 0 }
    : pomodoro;
  useEffect(() => {
    const firstStudent = classroomStudents[0];
    if (!firstStudent) return;
    if (!classroomStudents.some(({ id }) => id === selectedStudentId)) setSelectedStudentId(firstStudent.id);
  }, [classroomStudents, selectedStudentId]);

  const sendRTC = useCallback((action: RTCAction, payload: RTCSignalPayload, targetUid?: string) => {
    const socket = socketRef.current;
    if (!socket || !targetUid) return;
    void sendSignal(socket, createSignal({
      msg_type: "RTC_SIGNAL",
      action,
      room_id: roomId,
      from_uid: user.id,
      target_uid: targetUid,
      payload
    }));
  }, [roomId, user.id]);
  const makeSignal = <T,>(msgType: SignalMessage["msg_type"], action: SignalMessage["action"], payload: T, targetUid?: string) =>
    createSignal({ msg_type: msgType, action, room_id: roomId, from_uid: user.id, target_uid: targetUid, payload });
  const emit = async (message: SignalMessage<unknown>) => {
    const socket = socketRef.current;
    if (!socket) return false;
    const ack = await sendSignal(socket, message);
    if (!ack.ok) setNotice(ack.error ?? "操作未送达");
    return ack.ok;
  };

  useEffect(() => {
    void Promise.all([
      api<User>("/api/users/me"),
      api<Classroom>(`/api/rooms/${roomId}`),
      api<Courseware[]>("/api/courseware"),
      api<LearningTask[]>("/api/tasks")
    ]).then(([currentTeacher, roomData, coursewareData, taskData]) => {
      if (currentTeacher.role !== "teacher" || currentTeacher.id !== session.user?.id || roomData.teacherId !== currentTeacher.id) {
        session.clear();
        location.href = appUrl();
        return;
      }
      const classroomStudentIds = new Set(roomData.students.map(({ student }) => student.id));
      setRoom(roomData);
      setCourseware(coursewareData);
      setTasks(taskData.filter((task) => task.teacherId === currentTeacher.id && classroomStudentIds.has(task.studentId)));
      setPomodoro(pomodoroFromRoom(roomData));
      setPage(roomData.currentPage ?? 1);
      setSelectedCourseware(
        roomData.courseware
          ?? coursewareData.find(({ id }) => id === roomData.coursewareId)
          ?? null
      );
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
        if (message.action === "POMODORO_FINISHED_EARLY") {
          setPomodoroDone((current) => ({ ...current, [message.from_uid]: true }));
          setRaisedHands((current) => ({ ...current, [message.from_uid]: true }));
          setNotice("学生已提前完成本轮番茄钟任务 🍅");
        }
        if (message.action === "SEND_EMOJI" && payload.emoji) {
          setStudentEmoji({ uid: message.from_uid, emoji: payload.emoji, id: Date.now() });
          setNotice(`学生发送了 ${payload.emoji}`);
        }
      }
      if (message.msg_type === "CLASSROOM_PRAISE") {
        setClassroomPraise(message.payload as unknown as ClassroomPraisePayload);
      }
      if (message.msg_type === "POMODORO_CONTROL") {
        setPomodoro(message.payload as unknown as PomodoroPayload);
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
    if (!selectedTarget) return;
    void emit(makeSignal("TEACHER_CONTROL", "GRANT_REWARD", {
      reward_type: rewardType,
      animation: rewardType,
      message,
      duration: 3200
    } satisfies RewardPayload, selectedTarget.id));
    setNotice(`已向 ${selectedTarget.name} 发送奖励`);
  };
  const focus = () => {
    if (!selectedTarget) return;
    void emit(makeSignal("TEACHER_CONTROL", "FOCUS_REMINDER", {
      message: "小眼睛看回来啦，我们继续专心学习哦！", duration: 4000
    }, selectedTarget.id));
    setNotice(`已提醒 ${selectedTarget.name} 专注`);
  };
  const sendPomodoro = (action: SignalMessage["action"], payload: PomodoroPayload) => {
    setPomodoro(payload);
    if (action === "START_POMODORO" || action === "RESUME_POMODORO") setFinishBroadcasted(false);
    if (action === "START_POMODORO") setPomodoroDone({});
    void emit(makeSignal("POMODORO_CONTROL", action, payload));
  };
  const startPomodoro = () => {
    const durationSeconds = Math.round(clampNumber(pomodoroMinutes, 1, 120) * 60);
    const startedAt = Date.now();
    sendPomodoro("START_POMODORO", {
      status: "running",
      durationSeconds,
      startedAt,
      endsAt: startedAt + durationSeconds * 1000,
      remainingSeconds: durationSeconds,
      label: "课堂番茄钟"
    });
    setNotice("已开始全班番茄钟");
  };
  const pausePomodoro = () => {
    if (!pomodoro) return;
    sendPomodoro("PAUSE_POMODORO", {
      ...pomodoro,
      status: "paused",
      remainingSeconds: pomodoroRemaining,
      endsAt: undefined
    });
  };
  const resumePomodoro = () => {
    if (!pomodoro) return;
    const remainingSeconds = pomodoroRemaining || pomodoro.durationSeconds;
    const startedAt = Date.now();
    sendPomodoro("RESUME_POMODORO", {
      ...pomodoro,
      status: "running",
      startedAt,
      endsAt: startedAt + remainingSeconds * 1000,
      remainingSeconds
    });
  };
  const stopPomodoro = () => {
    const durationSeconds = Math.round(clampNumber(pomodoroMinutes, 1, 120) * 60);
    sendPomodoro("STOP_POMODORO", {
      status: "stopped",
      durationSeconds,
      remainingSeconds: 0,
      label: "课堂番茄钟"
    });
  };
  const finishPomodoro = () => {
    if (!pomodoro) return;
    sendPomodoro("FINISH_POMODORO", {
      ...pomodoro,
      status: "completed",
      remainingSeconds: 0,
      endsAt: Date.now()
    });
  };
  useEffect(() => {
    if (!pomodoro || pomodoro.status !== "running" || pomodoroRemaining > 0 || finishBroadcasted) return;
    setFinishBroadcasted(true);
    finishPomodoro();
  }, [pomodoro, pomodoroRemaining, finishBroadcasted]);
  const praiseCompletedTask = async (task: LearningTask) => {
    const student = classroomStudents.find(({ id }) => id === task.studentId);
    if (!student) return;
    try {
      let updated = task;
      if (task.status !== "completed") {
        updated = await api<LearningTask>(`/api/tasks/${task.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "completed" })
        });
        setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      const payload: ClassroomPraisePayload = {
        student_id: student.id,
        student_name: student.name,
        task_id: updated.id,
        task_title: updated.title,
        message: `${student.name}认真完成了学习任务，大家一起给TA鼓掌！`,
        animation: "confetti",
        duration: 4200
      };
      if (await emit(makeSignal("CLASSROOM_PRAISE", "TASK_COMPLETED_PRAISE", payload))) {
        setNotice(`已全班表扬 ${student.name}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "任务表扬失败");
    }
  };
  const endClass = async () => {
    if (!confirm(translateText("确定结束本次课堂吗？学生端会立即收到结束提示。", language))) return;
    await emit(makeSignal("ROOM_EVENT", "ROOM_ENDED", {}));
    await api(`/api/rooms/${roomId}/end`, { method: "POST" });
    location.href = appUrl();
  };

  if (!room) return <div className="loading">正在准备课堂空间…</div>;
  return (
    <RTCProvider
      initiator
      peerIds={classroomStudents.map(({ id }) => id)}
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
          <LanguageSwitcher language={language} onChange={setLanguage} className="class-language" />
          <Button className="danger" onClick={endClass}>结束课堂</Button>
        </header>
        <main className="classroom-layout">
          <section className="board-panel">
            <Whiteboard page={page} editable incoming={incoming} onEvent={whiteboardEvent} backgroundUrl={selectedCourseware ? `${API_URL}${selectedCourseware.fileUrl}` : undefined} backgroundType={selectedCourseware?.type} />
          </section>
          <aside className="classroom-aside">
            <div className="aside-block">
              <div className="aside-heading"><b>学生状态</b><span>{classroomStudents.length} 人</span></div>
              <div className="student-video-list">
                {classroomStudents.map((student) => (
                  <TeacherVideoPanel
                    key={student.id}
                    studentId={student.id}
                    studentName={student.name}
                    selected={selectedTarget?.id === student.id}
                    onSelect={() => setSelectedStudentId(student.id)}
                    studentState={online[student.id] ?? "offline"}
                    handRaised={raisedHands[student.id]}
                    pomodoroDone={pomodoroDone[student.id]}
                    emoji={studentEmoji?.uid === student.id ? studentEmoji.emoji : undefined}
                    emojiKey={studentEmoji?.id}
                  />
                ))}
              </div>
              {!classroomStudents.length && <div className="classroom-empty">本课堂还没有学生</div>}
            </div>
            <div className="aside-block">
              <div className="aside-heading"><b>我的音视频</b><small>老师画面</small></div>
              <TeacherRTCControls />
            </div>
            <div className="aside-block">
              <div className="aside-heading"><b>课堂番茄钟</b><small>教师统一控制</small></div>
              <TeacherPomodoroPanel
                minutes={pomodoroMinutes}
                setMinutes={setPomodoroMinutes}
                pomodoro={visiblePomodoro}
                remainingSeconds={pomodoroRemaining}
                doneCount={Object.values(pomodoroDone).filter(Boolean).length}
                total={classroomStudents.length}
                onStart={startPomodoro}
                onPause={pausePomodoro}
                onResume={resumePomodoro}
                onStop={stopPomodoro}
                onFinish={finishPomodoro}
              />
            </div>
            <div className="aside-block">
              <div className="aside-heading"><b>即时鼓励</b><small>发送给选中学生</small></div>
              <select className="target-select" value={selectedTarget?.id ?? ""} onChange={(event) => setSelectedStudentId(event.target.value)}>
                {classroomStudents.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
              <div className="reward-grid">
                <button onClick={() => reward("red_flower", "你真棒！继续加油！")}><span>🌸</span>小红花</button>
                <button onClick={() => reward("trophy", "太出色啦！这是你的奖杯！")}><span>🏆</span>奖杯</button>
                <button onClick={() => reward("confetti", "为认真学习的你喝彩！")}><span>🎉</span>彩带</button>
                <button onClick={() => reward("star_rain", "每一颗星星都为你闪亮！")}><span>⭐</span>星星雨</button>
              </div>
            </div>
            <div className="aside-block focus-block"><div><span>🎯</span><b>专注提醒</b><small>发送给 {selectedTarget?.name ?? "选中学生"}</small></div><Button onClick={focus} disabled={!selectedTarget}>发送提醒</Button></div>
            <div className="aside-block task-praise-block">
              <div className="aside-heading"><b>任务表扬</b><small>全课堂可见</small></div>
              <p>老师确认完成后，所有学生都会看到表扬特效。</p>
              <div className="task-praise-list">
                {tasksForSelectedTarget.map((task) => (
                  <button key={task.id} className={task.status === "completed" ? "completed" : ""} onClick={() => void praiseCompletedTask(task)}>
                    <span>{task.status === "completed" ? "✓" : "·"}</span>
                    <div><b>{task.title}</b><small>{task.status === "completed" ? "已完成，可再次表扬" : "点击确认完成并表扬"}</small></div>
                  </button>
                ))}
                {!tasksForSelectedTarget.length && <div className="task-praise-empty">该学生暂无学习任务</div>}
              </div>
            </div>
            <div className="rtc-note"><b>音视频通话</b><p>已支持老师同时查看多个学生摄像头；每个学生会建立独立 WebRTC 连接。</p></div>
          </aside>
        </main>
        {classroomPraise && <ClassroomPraiseOverlay praise={classroomPraise} onDone={() => setClassroomPraise(null)} />}
        {notice && <div className="toast" onAnimationEnd={() => setNotice("")}>{notice}</div>}
      </div>
    </RTCProvider>
  );
}

function App() {
  const app = (() => {
  const path = location.pathname.startsWith(APP_BASE)
    ? `/${location.pathname.slice(APP_BASE.length)}`
    : location.pathname;
  if (!session.user || session.user.role !== "teacher") return <Login />;
  const match = path.match(/^\/classroom\/([^/]+)/);
  return match?.[1] ? <ClassroomPage roomId={match[1]} /> : <Dashboard />;
  })();
  return <><DocumentLanguageSync />{app}</>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
