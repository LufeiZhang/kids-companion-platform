export type Language = "zh" | "en";

export const LANGUAGE_STORAGE_KEY = "companion_language";
const LANGUAGE_EVENT = "companion:language-change";

const exactTranslations: Record<string, string> = {
  "儿童远程伴学互动平台": "Kids Companion Learning Platform",
  "把每一次陪伴，变成看得见的成长。": "Turn every companion session into visible growth.",
  "实时互动白板": "Live interactive whiteboard",
  "正向学习激励": "Positive learning rewards",
  "轻量专注提醒": "Lightweight focus reminders",
  "教师工作台": "Teacher Workspace",
  "欢迎回来，请登录继续今天的陪伴。": "Welcome back. Sign in to continue today's sessions.",
  "邮箱": "Email",
  "密码": "Password",
  "登录中…": "Signing in…",
  "进入教师端": "Enter Teacher App",
  "演示账号已预填 · 密码 Demo123!": "Demo account is prefilled · Password Demo123!",
  "伴学空间": "Companion Space",
  "首页": "Home",
  "学生分组": "Student Groups",
  "学习任务": "Learning Tasks",
  "课堂记录": "Class Records",
  "奖励记录": "Reward Records",
  "儿童信息仅用于教学服务，请勿截屏或外传。": "Children's information is used only for teaching. Do not screenshot or share externally.",
  "退出登录": "Sign out",
  "上午好，": "Good morning,",
  "伴学教师": "Companion Teacher",
  "今日教学": "Today's Teaching",
  "让专注自然发生，让鼓励及时抵达。": "Make focus natural and encouragement timely.",
  "＋ 创建课堂": "+ Create Class",
  "今日课程": "Today's Classes",
  "待进行": "Upcoming",
  "我的学生": "My Students",
  "已分配学生": "Assigned students",
  "本周奖励": "Weekly Rewards",
  "查看即时奖励记录": "View reward records",
  "课堂列表": "Classroom List",
  "开始或继续你的伴学课堂": "Start or continue a companion class",
  "创建新课堂": "Create New Class",
  "还没有课堂": "No classes yet",
  "创建第一节伴学课吧": "Create the first companion class",
  "进行中": "Active",
  "已结束": "Ended",
  "待开始": "Scheduled",
  "进入课堂": "Enter Class",
  "开始课堂": "Start Class",
  "分组内学生": "Students in groups",
  "可邀请": "Available",
  "查看已分配学生，并快速发起一节伴学课堂。": "View assigned students and quickly start a companion class.",
  "邀请上课 →": "Invite to class →",
  "暂未分组": "No group yet",
  "暂时没有已分配学生，请联系管理员分配。": "No assigned students yet. Ask an admin to assign students.",
  "查看由管理员分配给你的教学小组和成员。": "View the teaching groups and members assigned by the admin.",
  "一起认真学习、快乐成长。": "Study carefully and grow happily together.",
  "目前没有负责的学生分组，管理员分配后会显示在这里。": "No student groups yet. Admin assignments will appear here.",
  "由教师布置并确认完成，学生端只能查看任务状态。": "Teachers assign and confirm tasks. Students can only view task status.",
  "＋ 布置任务": "+ Assign Task",
  "任务总数": "Total Tasks",
  "待确认": "Pending",
  "已完成": "Completed",
  "任务": "Task",
  "截止日期": "Due Date",
  "状态": "Status",
  "教师操作": "Teacher Action",
  "暂无任务说明": "No task details",
  "学生": "Student",
  "未设置": "Not set",
  "等待确认": "Pending confirmation",
  "重新打开": "Reopen",
  "确认完成": "Confirm completion",
  "还没有学习任务，点击“布置任务”开始安排。": "No learning tasks yet. Click \"Assign Task\" to start.",
  "查看课堂状态、参与学生和上课时间。": "View class status, participants, and class time.",
  "课堂": "Class",
  "开始时间": "Start Time",
  "操作": "Action",
  "课堂编号": "Class ID",
  "尚未开始": "Not started",
  "已生成": "Generated",
  "生成记录": "Generate record",
  "课后记录": "Post-class Record",
  "真实 AI 课后总结": "Real AI Post-class Summary",
  "模板课后记录": "Template Post-class Record",
  "专注分": "Focus score",
  "未离开页面": "Did not leave page",
  "暂无总结": "No summary yet",
  "查看 AI 课后总结字段": "View AI post-class summary fields",
  "生成来源：": "Source:",
  "模板总结": "Template summary",
  "真实 AI 生成失败，已自动使用模板总结。": "Real AI generation failed. Template summary was used.",
  "未配置 OPENAI_API_KEY，已使用模板总结。": "OPENAI_API_KEY is not configured. Template summary was used.",
  "学习内容：": "Learning content:",
  "注意力：": "Attention:",
  "下节建议：": "Next-class suggestion:",
  "家长版：": "Parent version:",
  "教师备注": "Teacher Notes",
  "保存中…": "Saving…",
  "保存备注并刷新总结": "Save notes and refresh summary",
  "查看课堂中发给学生的每一次正向鼓励。": "View every positive reward sent to students in class.",
  "奖励": "Reward",
  "鼓励语": "Encouragement",
  "发送时间": "Sent Time",
  "小红花": "Red Flower",
  "奖杯": "Trophy",
  "彩带": "Confetti",
  "星星雨": "Star Rain",
  "继续加油！": "Keep going!",
  "还没有奖励记录，进入课堂给学生送出第一份鼓励吧。": "No reward records yet. Enter a class and send the first encouragement.",
  "创建伴学课堂": "Create Companion Class",
  "课堂名称": "Class Name",
  "邀请学生": "Invite Students",
  "正在创建课堂…": "Creating class…",
  "创建并进入课堂": "Create and Enter Class",
  "布置学习任务": "Assign Learning Task",
  "任务名称": "Task Name",
  "任务说明": "Task Details",
  "选择学生": "Select Student",
  "请选择学生": "Select a student",
  "正在布置…": "Assigning…",
  "确认布置任务": "Create Task",
  "当前目标": "Current target",
  "已举手": "Hand raised",
  "已提前完成": "Finished early",
  "可能离开页面": "May have left page",
  "在线学习": "Online",
  "等待加入": "Waiting to join",
  "我的画面": "My Video",
  "关闭摄像头": "Turn camera off",
  "开启摄像头": "Turn camera on",
  "关闭麦克风": "Mute mic",
  "开启麦克风": "Unmute mic",
  "仅用于本次课堂通话，不录音录像": "Only for this class call. No recording.",
  "专注中": "Focusing",
  "已暂停": "Paused",
  "未开始": "Not started",
  "时长（分钟）": "Duration (minutes)",
  "开始": "Start",
  "暂停": "Pause",
  "继续": "Resume",
  "完成": "Finish",
  "停止": "Stop",
  "名学生已提前完成并举手。": "students finished early and raised hands.",
  "全班表扬": "Whole-class Praise",
  "正在准备课堂空间…": "Preparing classroom space…",
  "正在授课": "Teaching now",
  "＋ 上传课件": "+ Upload Courseware",
  "空白白板": "Blank Whiteboard",
  "结束课堂": "End Class",
  "学生状态": "Student Status",
  "我的音视频": "My Audio/Video",
  "老师画面": "Teacher Video",
  "课堂番茄钟": "Class Pomodoro",
  "教师统一控制": "Teacher controlled",
  "即时鼓励": "Instant Rewards",
  "发送给选中学生": "Send to selected student",
  "专注提醒": "Focus Reminder",
  "发送提醒": "Send Reminder",
  "任务表扬": "Task Praise",
  "全课堂可见": "Visible to everyone",
  "老师确认完成后，所有学生都会看到表扬特效。": "After the teacher confirms completion, every student sees the praise effect.",
  "已完成，可再次表扬": "Completed. Praise again",
  "点击确认完成并表扬": "Confirm completion and praise",
  "该学生暂无学习任务": "No learning tasks for this student",
  "音视频通话": "Audio/Video Call",
  "已支持老师同时查看多个学生摄像头；每个学生会建立独立 WebRTC 连接。": "The teacher can view multiple student cameras at once; each student uses an independent WebRTC connection.",
  "本课堂还没有学生": "No students in this class yet",
  "学生举手了 ✋": "A student raised a hand ✋",
  "学生已放下手": "The student lowered their hand",
  "学生已提前完成本轮番茄钟任务 🍅": "A student finished this Pomodoro task early 🍅",
  "已开始全班番茄钟": "Class Pomodoro started",
  "任务表扬失败": "Task praise failed",
  "确定结束本次课堂吗？学生端会立即收到结束提示。": "End this class? Students will immediately see the class-ended notice.",

  "嗨，小小探索家！": "Hi, little explorer!",
  "老师和今天的新知识，都在这里等你啦。": "Your teacher and today's new knowledge are waiting here.",
  "欢迎回到伴学空间": "Welcome back to Companion Space",
  "准备好开始今天的学习了吗？": "Ready to start today's learning?",
  "你的账号": "Your Account",
  "秘密口令": "Password",
  "出发，去学习！ 🚀": "Let's learn! 🚀",
  "演示账号和口令已经帮你填好啦": "The demo account and password are already filled in.",
  "星星伴学": "Star Study",
  "快乐学习每一天": "Happy learning every day",
  "我的首页": "Home",
  "成长宝箱": "Growth Chest",
  "今天也要加油呀！": "Keep going today!",
  "新的一天": "A New Day",
  "元气满满": "full of energy",
  "认真完成每一次小挑战，星星就会越来越多 ✨": "Complete each little challenge carefully and collect more stars ✨",
  "老师正在等你，进入课堂": "Your teacher is waiting. Enter class",
  "进入今天的课堂": "Enter today's class",
  "等待老师创建课堂": "Waiting for the teacher to create a class",
  "今日任务": "Today's Tasks",
  "我的积分": "My Points",
  "我的徽章": "My Badges",
  "节": "class(es)",
  "颗": "stars",
  "枚": "badges",
  "准备好了吗？": "Ready?",
  "今天没有待上课程": "No upcoming classes today",
  "全部完成，你真棒！": "All done. Great job!",
  "老师还没有布置任务": "The teacher has not assigned tasks yet",
  "本周已经获得 36 颗": "36 stars earned this week",
  "距离新徽章还差一点点": "Almost there for a new badge",
  "今天的课程": "Today's Classes",
  "和老师一起开启知识探险": "Start a knowledge adventure with your teacher",
  "伴学老师": "Companion teacher",
  "互动伴学": "Interactive companion learning",
  "正在上课": "In class",
  "进入 →": "Enter →",
  "老师创建课堂后，会出现在这里哦 🌱": "Classes will appear here after your teacher creates them 🌱",
  "每天进步一点点，": "A little progress every day,",
  "你正在变成更棒的自己！": "you are becoming a better you!",
  "— 来自伴学老师的悄悄话": "— A note from your companion teacher",
  "老师布置的学习任务": "Learning Tasks from Your Teacher",
  "认真完成后告诉老师，由老师确认完成 ✨": "After finishing carefully, tell your teacher. The teacher will confirm it ✨",
  "任务进度": "Task Progress",
  "全部完成！今天的你闪闪发光。": "All done! You are shining today.",
  "任务状态由老师确认，你只需要认真完成。": "Task status is confirmed by your teacher. You only need to finish carefully.",
  "认真完成老师布置的任务": "Carefully complete the task from your teacher",
  "老师已确认完成": "Teacher confirmed completion",
  "老师还没有布置任务，先去读一本喜欢的书吧 📚": "No tasks yet. Read a favorite book first 📚",
  "你的每一次认真，都变成了宝箱里的闪亮收藏。": "Every focused effort becomes a shiny treasure in your chest.",
  "成长星星": "Growth Stars",
  "已获徽章": "Badges Earned",
  "连续学习": "Learning Streak",
  "继续努力，解锁更多成长纪念": "Keep going to unlock more growth memories",
  "专注小达人": "Focus Star",
  "认真完成一节伴学课": "Finished one companion class carefully",
  "阅读之星": "Reading Star",
  "完成五次阅读任务": "Completed five reading tasks",
  "元气早鸟": "Morning Learner",
  "连续三天按时学习": "Studied on time for three days",
  "坚持之星": "Persistence Star",
  "连续学习七天": "Studied for seven days in a row",
  "鼓励收藏家": "Reward Collector",
  "收到五朵小红花": "Received five red flowers",
  "进步小火箭": "Progress Rocket",
  "本周完成全部任务": "Completed all tasks this week",
  "神秘徽章": "Mystery Badge",
  "再完成 2 节课堂解锁": "Unlock after 2 more classes",
  "获得一座奖杯！": "You earned a trophy!",
  "你真棒！": "Great job!",
  "老师为你点赞啦 👍": "Your teacher gave you a thumbs up 👍",
  "全班为TA鼓掌": "The whole class applauds",
  "专注时间进行中": "Focus time is running",
  "老师暂停了番茄钟": "The teacher paused the Pomodoro",
  "本轮番茄钟完成啦": "This Pomodoro is complete",
  "已举手等待老师": "Hand raised. Waiting for teacher",
  "我提前完成了，举手": "I finished early · raise hand",
  "老师，我举手啦！": "Teacher, I raised my hand!",
  "已经放下小手": "Hand lowered",
  "麦克风": "Mic",
  "摄像头": "Camera",
  "举手": "Raise Hand",
  "表情": "Emoji",
  "正在连接老师…": "Connecting to teacher…",
  "已连线": "Connected",
  "连接中断，正在重试…": "Connection interrupted. Retrying…",
  "互动发送失败，请稍后再试": "Interaction failed. Please try again later.",
  "小眼睛看回来啦，我们继续学习哦！": "Eyes back here. Let's keep learning!",
  "正在飞往课堂…": "Flying to class…",
  "认真听讲的你最闪亮 ✨": "You shine brightest when you listen carefully ✨",
  "老师在线": "Teacher online",
  "小眼睛，看这里": "Eyes here, please",
  "我回来啦！": "I'm back!",
  "今天的课堂结束啦": "Today's class is over",
  "你今天也很认真哦，休息一下吧！": "You worked hard today. Take a break!",
  "回到我的首页": "Back to Home",

  "平台管理后台": "Platform Admin Console",
  "账号、课堂与数据治理中心": "Account, class, and data governance center",
  "管理员邮箱": "Admin Email",
  "登录管理后台": "Enter Admin Console",
  "演示密码 Demo123!": "Demo password Demo123!",
  "学生管理": "Students",
  "教师管理": "Teachers",
  "分组管理": "Groups",
  "系统日志": "System Logs",
  "伴学平台": "Companion Platform",
  "隐私安全提示": "Privacy & Security Note",
  "遵循最小化收集原则；管理员的账号、分组等操作均会记录审计日志。": "Follow data minimization. Admin account, group, and assignment actions are audited.",
  "儿童远程伴学互动平台 · 管理与审计": "Kids Companion Learning Platform · Management & Audit",
  "超级管理员": "Super Admin",
  "早上好，平台运行一切正常。": "Good morning. The platform is running normally.",
  "这里汇总账号、课堂与关键互动数据。": "This summarizes accounts, classes, and key interaction data.",
  "数据更新时间": "Data updated",
  "学生账号": "Student Accounts",
  "教师账号": "Teacher Accounts",
  "纳入隐私保护范围": "Covered by privacy protection",
  "已登记教师": "Registered teachers",
  "课堂总数": "Total Classes",
  "节正在进行": "active class(es)",
  "奖励总数": "Total Rewards",
  "正向激励记录": "Positive reward records",
  "最近课堂": "Recent Classes",
  "近期创建与完成情况": "Recent creation and completion status",
  "实时系统动态": "Live System Activity",
  "最近关键操作": "Recent key actions",
  "系统": "System",
  "查看基础学习状态、分组与账号信息": "View learning status, groups, and account information",
  "管理教师及其负责的学生分组": "Manage teachers and their student groups",
  "＋ 创建账号": "+ Create Account",
  "用户": "User",
  "角色": "Role",
  "分组 / 负责范围": "Groups / Scope",
  "基础学习状态": "Basic Learning Status",
  "创建时间": "Created At",
  "教师": "Teacher",
  "请先创建分组": "Create groups first",
  "尚未分配": "Not assigned",
  "正常": "Normal",
  "暂无数据": "No data",
  "每个分组由一名教师负责，学生只能被邀请进入授权教师的课堂。": "Each group has one teacher. Students can only join authorized teachers' classes.",
  "＋ 新建分组": "+ New Group",
  "暂无分组说明": "No group description",
  "查看课堂参与者、状态与时间记录": "View participants, status, and time records",
  "奖励发送记录": "Reward Sending Records",
  "所有课堂正向激励均在服务端留痕": "All classroom rewards are recorded on the server",
  "教师 → 学生": "Teacher → Student",
  "时间": "Time",
  "信令日志": "Signal Logs",
  "最近 200 条 WebSocket 控制信令": "Latest 200 WebSocket control signals",
  "类型 / 动作": "Type / Action",
  "发起人": "Sender",
  "管理员审计日志": "Admin Audit Logs",
  "账号、分组和分配操作不可抵赖记录": "Non-repudiable records for account, group, and assignment operations",
  "管理员": "Admin",
  "动作": "Action",
  "对象": "Object",
  "创建用户账号": "Create User Account",
  "姓名": "Name",
  "初始密码": "Initial Password",
  "创建账号": "Create Account",
  "新建学生分组": "Create Student Group",
  "分组名称": "Group Name",
  "负责教师": "Teacher in Charge",
  "请选择教师": "Select a teacher",
  "分组说明": "Group Description",
  "创建分组": "Create Group",

  "请填写任务名称并选择学生": "Please enter a task name and select a student.",
  "任务布置失败": "Task assignment failed.",
  "任务状态更新失败": "Task status update failed.",
  "课后记录生成失败": "Failed to generate post-class records.",
  "教师备注保存失败": "Failed to save teacher notes.",
  "请填写课堂名称": "Please enter a class name.",
  "请至少选择一名学生": "Please select at least one student.",
  "创建失败，请稍后再试": "Creation failed. Please try again later.",
  "加载失败": "Loading failed.",
  "上传失败": "Upload failed.",
  "操作未送达": "Action was not delivered.",
  "登录失败": "Sign-in failed.",
  "请求失败": "Request failed.",
  "信令响应超时": "Signal response timed out."
};

const patternTranslations: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^你今天有\s*(\d+)\s*节待进行课堂，\s*(\d+)\s*位学生等待陪伴。$/, (m) => `You have ${m[1]} upcoming class(es) and ${m[2]} student(s) waiting.`],
  [/^待进行\s*(\d+)\s*节$/, (m) => `${m[1]} upcoming`],
  [/^(\d+)\s*名学生$/, (m) => `${m[1]} student(s)`],
  [/^已选\s*(\d+)\s*人$/, (m) => `${m[1]} selected`],
  [/^邀请学生 · 已选\s*(\d+)\s*人$/, (m) => `Invite Students · ${m[1]} selected`],
  [/^本周\s*(\d+)\s*次$/, (m) => `${m[1]} this week`],
  [/^上课\s*(\d+)\s*分钟$/, (m) => `${m[1]} min in class`],
  [/^离开页面\s*(\d+)\s*次$/, (m) => `Left page ${m[1]} time(s)`],
  [/^奖励\s*(\d+)\s*次$/, (m) => `${m[1]} reward(s)`],
  [/^任务\s*(\d+)\s*个$/, (m) => `${m[1]} task(s)`],
  [/^举手\s*(\d+)\s*次$/, (m) => `${m[1]} hand raise(s)`],
  [/^反馈\s*(\d+)\s*次$/, (m) => `${m[1]} feedback action(s)`],
  [/^(\d+) \/ (\d+)$/, (m) => `${m[1]} / ${m[2]}`],
  [/^(.+)的伴学课$/, (m) => `${m[1]}'s companion class`],
  [/^(.+)的成长宝箱$/, (m) => `${m[1]}'s Growth Chest`],
  [/^(.+)，今天也要\s*元气满满地学习哦！$/, (m) => `${m[1]}, let's learn with full energy today!`],
  [/^(.+) 完成任务啦！$/, (m) => `${m[1]} completed a task!`],
  [/^《(.+)》$/, (m) => `"${m[1]}"`],
  [/^已向\s*(.+)\s*发送奖励$/, (m) => `Reward sent to ${m[1]}`],
  [/^已提醒\s*(.+)\s*专注$/, (m) => `Focus reminder sent to ${m[1]}`],
  [/^已全班表扬\s*(.+)$/, (m) => `Praised ${m[1]} in class`],
  [/^学生发送了\s*(.+)$/, (m) => `Student sent ${m[1]}`],
  [/^(.+)认真完成了学习任务，大家一起给TA鼓掌！$/, (m) => `${m[1]} finished the learning task carefully. Let's applaud!`],
  [/^(.+)正在陪伴你$/, (m) => `${m[1]} is with you`],
  [/^(.+)已确认完成$/, (m) => `${m[1]} confirmed completion`],
  [/^等待(.+)确认$/, (m) => `Waiting for ${m[1]} to confirm`],
  [/^还有\s*(\d+)\s*个等待老师确认$/, (m) => `${m[1]} waiting for teacher confirmation`],
  [/^(\d+)\s*节课程$/, (m) => `${m[1]} class(es)`],
  [/^已点亮\s*(\d+)\s*枚$/, (m) => `${m[1]} unlocked`],
  [/^(\d+)\s*天$/, (m) => `${m[1]} days`],
  [/^(\d+)\s*人$/, (m) => `${m[1]} people`],
  [/^(\d+)\s*颗$/, (m) => `${m[1]} stars`],
  [/^(\d+)\s*枚$/, (m) => `${m[1]} badges`],
  [/^(.+)\s*→\s*(.+)$/, (m) => `${m[1]} → ${m[2]}`]
];

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatableAttributes = ["placeholder", "title", "aria-label"];

export function getLanguagePreference(): Language {
  if (typeof localStorage === "undefined") return "zh";
  return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "zh";
}

export function setLanguagePreference(language: Language) {
  if (typeof localStorage !== "undefined") localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<Language>(LANGUAGE_EVENT, { detail: language }));
  }
}

export function subscribeLanguagePreference(listener: (language: Language) => void) {
  if (typeof window === "undefined") return () => undefined;
  const onLanguage = (event: Event) => listener((event as CustomEvent<Language>).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY) listener(event.newValue === "en" ? "en" : "zh");
  };
  window.addEventListener(LANGUAGE_EVENT, onLanguage);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, onLanguage);
    window.removeEventListener("storage", onStorage);
  };
}

export function translateText(source: string, language: Language): string {
  if (language === "zh") return source;
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return source;
  const [, leading = "", core = "", trailing = ""] = match;
  if (!core.trim()) return source;
  const exact = exactTranslations[core];
  if (exact) return `${leading}${exact}${trailing}`;
  for (const [pattern, translate] of patternTranslations) {
    const result = core.match(pattern);
    if (result) return `${leading}${translate(result)}${trailing}`;
  }
  return source;
}

function shouldSkipNode(node: Node) {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest("script,style,noscript,textarea,code,pre,[data-i18n-skip]"));
}

function translateTextNode(node: Text, language: Language) {
  if (shouldSkipNode(node)) return;
  const current = node.nodeValue ?? "";
  const existingOriginal = originalText.get(node);
  if (language === "zh") {
    if (existingOriginal && current === translateText(existingOriginal, "en")) node.nodeValue = existingOriginal;
    else originalText.set(node, current);
    return;
  }
  let source = existingOriginal;
  if (!source || (current !== source && current !== translateText(source, "en"))) {
    source = current;
    originalText.set(node, source);
  }
  const translated = translateText(source, "en");
  if (current !== translated) node.nodeValue = translated;
}

function translateElementAttributes(element: Element, language: Language) {
  if (element.closest("script,style,noscript,textarea,code,pre,[data-i18n-skip]")) return;
  for (const attribute of translatableAttributes) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    let originals = originalAttributes.get(element);
    if (!originals) {
      originals = new Map<string, string>();
      originalAttributes.set(element, originals);
    }
    const existingOriginal = originals.get(attribute);
    if (language === "zh") {
      if (existingOriginal && current === translateText(existingOriginal, "en")) element.setAttribute(attribute, existingOriginal);
      else originals.set(attribute, current);
      continue;
    }
    let source = existingOriginal;
    if (!source || (current !== source && current !== translateText(source, "en"))) {
      source = current;
      originals.set(attribute, source);
    }
    const translated = translateText(source, "en");
    if (current !== translated) element.setAttribute(attribute, translated);
  }
}

export function applyDocumentLanguage(language: Language, root?: ParentNode) {
  if (typeof document === "undefined") return;
  const scope = root ?? document.body;
  if (!scope) return;
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  if (scope instanceof Element) translateElementAttributes(scope, language);
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, language);
    else if (node.nodeType === Node.ELEMENT_NODE) translateElementAttributes(node as Element, language);
    node = walker.nextNode();
  }
}

export function syncDocumentLanguage(language: Language) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => undefined;
  applyDocumentLanguage(language);
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyDocumentLanguage(language);
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: translatableAttributes
  });
  return () => observer.disconnect();
}
