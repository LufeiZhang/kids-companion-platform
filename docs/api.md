# REST API

默认地址：`http://localhost:4000`。除登录与健康检查外，均使用 `Authorization: Bearer <JWT>`。

## 认证

- `POST /api/auth/login`：`{ email, password, role }`
- `GET /api/users/me`：当前用户

## 用户与分组

- `GET /api/users?role=student|teacher`：管理员查看全部；教师仅看自己分组学生
- `POST /api/users`：管理员创建账号
- `PATCH /api/users/:id/group`：管理员给学生分组
- `GET /api/groups`：管理员全部；教师自己的分组
- `POST /api/groups`：管理员创建分组并指定教师

## 课堂

- `GET /api/rooms`：按当前身份过滤可见课堂
- `POST /api/rooms`：教师创建课堂，body 为 `{ title, studentIds }`
- `GET /api/rooms/:id`：有成员权限时查看
- `POST /api/rooms/:id/start`：房间教师开启
- `POST /api/rooms/:id/end`：房间教师结束

## 学习任务

- `GET /api/tasks`：学生查看自己的任务；教师查看自己布置的任务
- `POST /api/tasks`：教师布置任务，body 为 `{ title, detail, studentId, dueDate }`
- `PATCH /api/tasks/:id/status`：仅任务所属教师可确认完成或重新打开，body 为 `{ status: "completed" | "pending" }`

学生端没有任务状态写入接口，不能自行确认完成。

## 课件

- `GET /api/courseware`：教师自己的课件
- `POST /api/courseware`：`multipart/form-data`，字段 `file`、`title`
- `/uploads/*`：MVP 本地静态文件。生产环境不应直接暴露私有课件。

## 日志

- `GET /api/logs/signals`
- `GET /api/logs/rewards`
- `GET /api/logs/audit`（仅管理员）

错误统一返回 `{ "message": "可读错误信息" }`。
