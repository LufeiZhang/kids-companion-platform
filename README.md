# 儿童远程伴学互动平台（MVP）

一个可本地运行的远程伴学 Demo。主画面承载白板/课件，音视频作为辅助；教师可实时同步涂鸦与翻页、发放奖励、发送专注提醒，并看到学生页面可见性状态。

## 已实现

- 三角色账号登录与服务端 RBAC：`student`、`teacher`、`admin`
- 教师创建/开启/结束课堂，学生仅能进入已授权课堂
- Socket.IO 统一 JSON 信令、ACK、身份与房间权限校验
- Canvas 比例坐标白板：画笔、橡皮、清空、撤销、重做、颜色、线宽、逐页保留
- 图片/PDF 课件上传与翻页同步
- 小红花、奖杯、彩带、星星雨奖励动画
- 学生 `visibilitychange` 状态上报，教师端离开页面提醒
- PostgreSQL + Prisma 持久化用户、房间、白板事件、信令、奖励与审计日志
- RTCProvider 抽象和音视频占位组件，便于接入 Agora/TRTC/WebRTC
- 管理后台账号、学生分组、教师分配、课堂/奖励/信令/审计记录

## 项目结构

```text
apps/
  teacher-web/       # React + TypeScript 教师端（5173）
  student-web/       # React + TypeScript 学生端（5174）
  admin-web/         # React + TypeScript 管理后台（5175）
packages/
  types/             # 唯一的信令与业务公共类型来源
  shared/            # API、登录会话、Socket 客户端
  ui/                # 通用基础组件
  rtc/               # RTCProvider 抽象
  whiteboard/        # Canvas 白板模块
server/
  prisma/            # PostgreSQL 数据模型与种子数据
  src/               # Express API、鉴权、业务模块、Socket 网关
docs/
```

## 环境要求

- Node.js 20+
- npm 10+
- Docker Desktop（推荐，用于 PostgreSQL），或本机 PostgreSQL 15+

## 本地启动

1. 安装依赖：

   ```bash
   npm install
   ```

2. 创建环境文件：

   ```bash
   cp server/.env.example server/.env
   ```

3. 启动 PostgreSQL：

   ```bash
   docker compose up -d postgres
   ```

4. 生成 Prisma Client、建表并写入演示数据：

   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

5. 同时启动后端与三套前端：

   ```bash
   npm run dev
   ```

访问：

- 教师端：<http://localhost:5173/teacher/>
- 学生端：<http://localhost:5174/student/>
- 管理后台：<http://localhost:5175/admin/>
- API 健康检查：<http://localhost:4000/health>

## 演示账号

所有账号密码均为 `Demo123!`。

| 角色 | 邮箱 |
| --- | --- |
| 管理员 | `admin@example.com` |
| 教师 | `teacher@example.com` |
| 学生 | `student@example.com` |

推荐联调顺序：先在教师端创建课堂并选择“小星星”，再分别打开教师课堂页与学生课堂页。教师画线、翻页、发奖励；切换学生标签页后，教师侧会显示“可能离开页面”。

## 常用命令

```bash
npm run dev:server
npm run dev:teacher
npm run dev:student
npm run dev:admin
npm run typecheck
npm run build
```

## 安全与合规边界

MVP 不录课、不做系统级锁屏，也不采集非教学必需的儿童信息。接入真实 RTC 前必须增加明确的摄像头/麦克风用途提示；录课须取得家长单独授权。生产环境必须使用 HTTPS/WSS、替换 JWT 密钥、限制上传类型、对联系方式脱敏并配置管理员最小权限。详见 [架构文档](docs/architecture.md)。

## 当前 RTC 范围

音视频区域为占位实现，业务代码只依赖 `RTCProviderAdapter`。接入 Agora、TRTC 或原生 WebRTC 时，在 `packages/rtc` 新增适配器即可，无需修改白板和信令业务。

## 部署到 Render

仓库根目录提供了 `render.yaml`。Render Blueprint 会创建一项 Node Web Service 和一项 PostgreSQL 数据库，并自动建表、写入演示账号。部署后使用同一个公网域名：

- `/student/`：学生端
- `/teacher/`：教师端
- `/admin/`：管理后台
- `/health`：健康检查

操作步骤：

1. 将本项目推送到 GitHub、GitLab 或 Bitbucket。
2. 登录 [Render Dashboard](https://dashboard.render.com/)。
3. 选择 **New > Blueprint**，连接代码仓库并确认 `render.yaml`。
4. 等待数据库和 Web Service 部署完成，打开 Render 提供的 `onrender.com` 地址。

免费 Web Service 闲置后会休眠，首次打开可能需要等待唤醒；免费 PostgreSQL 当前为临时方案，请勿存放真实儿童数据。生产环境应升级持久数据库和对象存储。
