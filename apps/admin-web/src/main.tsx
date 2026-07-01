import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, login, session } from "@companion/shared";
import type { Classroom, User, UserRole } from "@companion/types";
import { Button, Card, Input } from "@companion/ui";
import "./styles.css";

const APP_BASE = import.meta.env.BASE_URL;

type Tab = "dashboard" | "students" | "teachers" | "groups" | "classes" | "rewards" | "logs";
interface AdminUser extends User {
  phone?: string;
  studentProfile?: { id: string; grade?: string; groupId?: string; group?: Group };
  teacherProfile?: { bio?: string; subjects: string[] };
}
interface Group {
  id: string;
  name: string;
  teacherId: string;
  description?: string;
  teacher?: Pick<User, "id" | "name">;
  students?: Array<{ user: Pick<User, "id" | "name" | "email"> }>;
}
interface RewardRow {
  id: string; rewardType: string; message?: string; createdAt: string;
  teacher: { name: string }; student: { name: string }; room: { title: string };
}
interface LogRow {
  id: string; action: string; msgType?: string; ackStatus?: string; createdAt: string;
  fromUser?: { name: string }; room?: { title: string }; actor?: { name: string; email: string };
  targetType?: string;
}

function Login() {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Demo123!");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await login(email, password, "admin"); location.href = APP_BASE; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "登录失败"); }
  };
  return <main className="admin-login"><form onSubmit={submit}><div className="admin-mark">伴</div><small>COMPANION ADMIN</small><h1>平台管理后台</h1><p>账号、课堂与数据治理中心</p><label>管理员邮箱<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>密码<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div className="error">{error}</div>}<Button>登录管理后台</Button><em>演示密码 Demo123!</em></form></main>;
}

const nav: Array<[Tab, string, string]> = [
  ["dashboard","▦","Dashboard"],["students","♙","学生管理"],["teachers","♟","教师管理"],
  ["groups","◫","分组管理"],["classes","◷","课堂记录"],["rewards","✿","奖励记录"],["logs","≡","系统日志"]
];

function AdminApp() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [rooms, setRooms] = useState<Classroom[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [signals, setSignals] = useState<LogRow[]>([]);
  const [audits, setAudits] = useState<LogRow[]>([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const data = await Promise.all([
        api<AdminUser[]>("/api/users"),
        api<Group[]>("/api/groups"),
        api<Classroom[]>("/api/rooms"),
        api<RewardRow[]>("/api/logs/rewards"),
        api<LogRow[]>("/api/logs/signals"),
        api<LogRow[]>("/api/logs/audit")
      ]);
      setUsers(data[0]); setGroups(data[1]); setRooms(data[2]); setRewards(data[3]); setSignals(data[4]); setAudits(data[5]);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "数据加载失败"); }
  };
  useEffect(() => { void load(); }, []);
  const students = users.filter((user) => user.role === "student");
  const teachers = users.filter((user) => user.role === "teacher");

  return (
    <div className="admin-shell">
      <aside><div className="admin-logo"><span>伴</span><div><b>伴学平台</b><small>ADMIN CONSOLE</small></div></div><nav>{nav.map(([id, icon, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}</nav><div className="admin-security">🛡️ <b>隐私安全提示</b><p>遵循最小化收集原则；管理员的账号、分组等操作均会记录审计日志。</p></div><button className="signout" onClick={() => { session.clear(); location.href = APP_BASE; }}>退出登录</button></aside>
      <main><header><div><h2>{nav.find(([id]) => id === tab)?.[2]}</h2><p>儿童远程伴学互动平台 · 管理与审计</p></div><div className="admin-user"><span>{session.user!.name.slice(0,1)}</span><div><b>{session.user!.name}</b><small>超级管理员</small></div></div></header>
        {tab === "dashboard" && <Dashboard users={users} rooms={rooms} rewards={rewards} signals={signals} />}
        {tab === "students" && <UserTable title="学生账号" subtitle="查看基础学习状态、分组与账号信息" users={students} groups={groups} action={() => setShowUserForm(true)} onAssigned={load} />}
        {tab === "teachers" && <UserTable title="教师账号" subtitle="管理教师及其负责的学生分组" users={teachers} groups={groups} action={() => setShowUserForm(true)} onAssigned={load} />}
        {tab === "groups" && <Groups groups={groups} action={() => setShowGroupForm(true)} />}
        {tab === "classes" && <Classes rooms={rooms} />}
        {tab === "rewards" && <Rewards rows={rewards} />}
        {tab === "logs" && <Logs signals={signals} audits={audits} />}
      </main>
      {showUserForm && <CreateUser onClose={() => setShowUserForm(false)} onCreated={() => { setShowUserForm(false); void load(); }} />}
      {showGroupForm && <CreateGroup teachers={teachers} onClose={() => setShowGroupForm(false)} onCreated={() => { setShowGroupForm(false); void load(); }} />}
      {notice && <div className="toast">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    </div>
  );
}

function Dashboard({ users, rooms, rewards, signals }: { users: AdminUser[]; rooms: Classroom[]; rewards: RewardRow[]; signals: LogRow[] }) {
  return <div className="admin-body"><section className="admin-welcome"><div><small>PLATFORM OVERVIEW</small><h1>早上好，平台运行一切正常。</h1><p>这里汇总账号、课堂与关键互动数据。</p></div><span>数据更新时间<br/><b>{new Date().toLocaleString("zh-CN")}</b></span></section><div className="admin-stats"><Card><span className="i-blue">♙</span><div><small>学生账号</small><strong>{users.filter((u) => u.role === "student").length}</strong><p>纳入隐私保护范围</p></div></Card><Card><span className="i-cyan">♟</span><div><small>教师账号</small><strong>{users.filter((u) => u.role === "teacher").length}</strong><p>已登记教师</p></div></Card><Card><span className="i-orange">◷</span><div><small>课堂总数</small><strong>{rooms.length}</strong><p>{rooms.filter((r) => r.status === "active").length} 节正在进行</p></div></Card><Card><span className="i-pink">✿</span><div><small>奖励总数</small><strong>{rewards.length}</strong><p>正向激励记录</p></div></Card></div><div className="overview-grid"><Card><div className="panel-title"><div><h3>最近课堂</h3><p>近期创建与完成情况</p></div></div><Classes rooms={rooms.slice(0,5)} embedded /></Card><Card><div className="panel-title"><div><h3>实时系统动态</h3><p>最近关键操作</p></div></div>{signals.slice(0,6).map((log) => <div className="activity" key={log.id}><span>•</span><div><b>{log.action}</b><small>{log.fromUser?.name ?? "系统"} · {log.room?.title}</small></div><time>{new Date(log.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</time></div>)}</Card></div></div>;
}

function UserTable({ title, subtitle, users, groups, action, onAssigned }: { title:string;subtitle:string;users:AdminUser[];groups:Group[];action():void;onAssigned():void }) {
  const assign = async (userId: string, groupId: string) => {
    await api(`/api/users/${userId}/group`, { method: "PATCH", body: JSON.stringify({ groupId: groupId || null }) });
    onAssigned();
  };
  return <div className="admin-body"><Card className="table-card"><div className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div><Button onClick={action}>＋ 创建账号</Button></div><table><thead><tr><th>用户</th><th>角色</th><th>分组 / 负责范围</th><th>基础学习状态</th><th>创建时间</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="person"><span>{user.name.slice(0,1)}</span><div><b>{user.name}</b><small>{user.email}</small></div></div></td><td><span className={`role ${user.role}`}>{user.role === "student" ? "学生" : "教师"}</span></td><td>{user.role === "student" ? <select value={user.studentProfile?.groupId ?? ""} onChange={(event) => void assign(user.id,event.target.value)}><option value="">未分组</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name} · {group.teacher?.name}</option>)}</select> : groups.filter((group) => group.teacherId === user.id).map((group) => group.name).join("、") || "尚未分配"}</td><td><span className="healthy">● 正常</span></td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString("zh-CN") : "—"}</td></tr>)}</tbody></table>{!users.length && <div className="no-data">暂无数据</div>}</Card></div>;
}

function Groups({ groups, action }: { groups: Group[]; action(): void }) {
  return <div className="admin-body"><div className="page-actions"><div><h3>学生分组</h3><p>每个分组由一名教师负责，学生只能被邀请进入授权教师的课堂。</p></div><Button onClick={action}>＋ 新建分组</Button></div><div className="group-grid">{groups.map((group) => <Card key={group.id}><div className="group-top"><span>◫</span><small>{group.students?.length ?? 0} 名学生</small></div><h3>{group.name}</h3><p>{group.description || "暂无分组说明"}</p><div className="group-teacher"><span>{group.teacher?.name.slice(0,1)}</span><div><small>负责教师</small><b>{group.teacher?.name}</b></div></div><div className="group-members">{group.students?.map(({user}) => <i key={user.id} title={user.name}>{user.name.slice(0,1)}</i>)}</div></Card>)}</div></div>;
}

function Classes({ rooms, embedded=false }: { rooms: Classroom[]; embedded?:boolean }) {
  const content = <table><thead><tr><th>课堂</th><th>教师</th><th>学生</th><th>状态</th><th>开始时间</th></tr></thead><tbody>{rooms.map((room) => <tr key={room.id}><td><b>{room.title}</b><small className="id">{room.id.slice(-8)}</small></td><td>{room.teacher?.name ?? "—"}</td><td>{room.students.map(({student})=>student.name).join("、")}</td><td><span className={`room-pill ${room.status}`}>{room.status === "active" ? "进行中" : room.status === "ended" ? "已结束" : "待开始"}</span></td><td>{room.startedAt ? new Date(room.startedAt).toLocaleString("zh-CN") : "—"}</td></tr>)}</tbody></table>;
  if (embedded) return content;
  return <div className="admin-body"><Card className="table-card"><div className="panel-title"><div><h3>课堂记录</h3><p>查看课堂参与者、状态与时间记录</p></div></div>{content}</Card></div>;
}

function Rewards({ rows }: { rows: RewardRow[] }) {
  const icon: Record<string,string> = {red_flower:"🌸",trophy:"🏆",confetti:"🎉",star_rain:"⭐"};
  return <div className="admin-body"><Card className="table-card"><div className="panel-title"><div><h3>奖励发送记录</h3><p>所有课堂正向激励均在服务端留痕</p></div></div><table><thead><tr><th>奖励</th><th>课堂</th><th>教师 → 学生</th><th>鼓励语</th><th>时间</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><span className="reward-icon">{icon[row.rewardType] ?? "🎁"}</span>{row.rewardType}</td><td>{row.room.title}</td><td>{row.teacher.name} → {row.student.name}</td><td>{row.message}</td><td>{new Date(row.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></Card></div>;
}

function Logs({ signals, audits }: { signals: LogRow[]; audits: LogRow[] }) {
  return <div className="admin-body logs-grid"><Card className="table-card"><div className="panel-title"><div><h3>信令日志</h3><p>最近 200 条 WebSocket 控制信令</p></div></div><table><thead><tr><th>类型 / 动作</th><th>发起人</th><th>课堂</th><th>ACK</th><th>时间</th></tr></thead><tbody>{signals.map((row)=><tr key={row.id}><td><b>{row.msgType}</b><small className="id">{row.action}</small></td><td>{row.fromUser?.name}</td><td>{row.room?.title}</td><td><span className="healthy">{row.ackStatus}</span></td><td>{new Date(row.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></Card><Card className="table-card"><div className="panel-title"><div><h3>管理员审计日志</h3><p>账号、分组和分配操作不可抵赖记录</p></div></div><table><thead><tr><th>管理员</th><th>动作</th><th>对象</th><th>时间</th></tr></thead><tbody>{audits.map((row)=><tr key={row.id}><td>{row.actor?.name}</td><td>{row.action}</td><td>{row.targetType}</td><td>{new Date(row.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></Card></div>;
}

function CreateUser({ onClose,onCreated }: { onClose():void;onCreated():void }) {
  const [form,setForm]=useState({name:"",email:"",password:"Demo123!",role:"student" as UserRole});
  const [error,setError]=useState("");
  const submit=async(event:React.FormEvent)=>{event.preventDefault();try{await api("/api/users",{method:"POST",body:JSON.stringify(form)});onCreated();}catch(reason){setError(reason instanceof Error?reason.message:"创建失败");}};
  return <div className="modal-bg"><form className="admin-modal" onSubmit={submit}><button type="button" className="x" onClick={onClose}>×</button><small>CREATE ACCOUNT</small><h2>创建用户账号</h2><label>姓名<Input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label>邮箱<Input required type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></label><label>初始密码<Input required value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})}/></label><label>角色<select value={form.role} onChange={(e)=>setForm({...form,role:e.target.value as UserRole})}><option value="student">学生</option><option value="teacher">教师</option><option value="admin">管理员</option></select></label>{error&&<div className="error">{error}</div>}<Button>创建账号</Button></form></div>;
}
function CreateGroup({ teachers,onClose,onCreated }: { teachers:AdminUser[];onClose():void;onCreated():void }) {
  const [form,setForm]=useState({name:"",teacherId:teachers[0]?.id??"",description:""});
  const submit=async(event:React.FormEvent)=>{event.preventDefault();await api("/api/groups",{method:"POST",body:JSON.stringify(form)});onCreated();};
  return <div className="modal-bg"><form className="admin-modal" onSubmit={submit}><button type="button" className="x" onClick={onClose}>×</button><small>CREATE GROUP</small><h2>新建学生分组</h2><label>分组名称<Input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label>负责教师<select required value={form.teacherId} onChange={(e)=>setForm({...form,teacherId:e.target.value})}><option value="">请选择教师</option>{teachers.map((t)=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label>分组说明<Input value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label><Button>创建分组</Button></form></div>;
}

function App(){return !session.user||session.user.role!=="admin"?<Login/>:<AdminApp/>}
createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
