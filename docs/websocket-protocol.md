# WebSocket 信令协议

传输使用 Socket.IO。连接时通过 `auth.token` 携带 JWT；业务事件名统一为 `signal`。

## 消息信封

```json
{
  "msg_id": "550e8400-e29b-41d4-a716-446655440000",
  "msg_type": "TEACHER_CONTROL",
  "action": "GRANT_REWARD",
  "room_id": "room_123",
  "from_uid": "teacher_001",
  "target_uid": "student_001",
  "timestamp": 1698765432000,
  "payload": {}
}
```

服务端 ACK：

```json
{ "ok": true, "msg_id": "550e8400-e29b-41d4-a716-446655440000" }
```

失败时为 `{ "ok": false, "msg_id": "...", "error": "原因" }`。发送方 5 秒未收到 ACK 可提示网络异常；如需重试应保留原 `msg_id`。

## 类型与 action

### ROOM_EVENT

`JOIN_ROOM`、`LEAVE_ROOM`、`ROOM_STARTED`、`ROOM_ENDED`、`USER_ONLINE`、`USER_OFFLINE`

### WHITEBOARD_EVENT

`DRAW_START`、`DRAW_MOVE`、`DRAW_END`、`ERASE`、`CLEAR`、`UNDO`、`REDO`

```json
{
  "x": 0.52,
  "y": 0.33,
  "pressure": 0.8,
  "color": "#ff0000",
  "lineWidth": 4,
  "page": 1
}
```

`x`、`y` 必须为 0 到 1 的比例坐标。`CLEAR`、`UNDO`、`REDO` 只需 `{ "page": 1 }`。

### COURSEWARE_CONTROL

`OPEN_COURSEWARE`、`NEXT_PAGE`、`PREV_PAGE`、`GO_TO_PAGE`

```json
{
  "courseware_id": "cw_001",
  "file_url": "https://host/private/cw_001",
  "file_type": "pdf",
  "page": 3
}
```

生产环境的 `file_url` 应使用有时效的签名 URL。

### TEACHER_CONTROL

`GRANT_REWARD`、`FOCUS_REMINDER`、`START_BREAK`、`END_BREAK`、`LOCK_STUDY_MODE`、`UNLOCK_STUDY_MODE`

```json
{
  "reward_type": "red_flower",
  "animation": "flower_shower",
  "message": "你真棒！继续加油！",
  "duration": 3000
}
```

MVP 实现奖励和专注提醒，其余 action 为后续兼容预留。所有教师控制都由服务端验证房间所有权和目标学生成员关系。

### STUDENT_STATUS

`PAGE_VISIBLE`、`PAGE_HIDDEN`、`IDLE`、`ACTIVE`、`CAMERA_ON`、`CAMERA_OFF`、`MIC_ON`、`MIC_OFF`

```json
{
  "visibility": "hidden",
  "last_active_at": 1698765432000
}
```

页面隐藏只代表浏览器文档不可见，不等价于学生主观“不专注”，教师端必须使用中性文案。

### RTC_SIGNAL

`RTC_READY`、`RTC_OFFER`、`RTC_ANSWER`、`ICE_CANDIDATE`

WebRTC 点对点协商使用定向消息，`target_uid` 必填。Offer 与 Answer 的 payload 使用
`{ "description": RTCSessionDescriptionInit }`，ICE 使用
`{ "candidate": RTCIceCandidateInit }`。服务端仅验证双方是否属于同一课堂并转发，
不保存 SDP、ICE 或音视频内容；`SignalLog` 只记录 action 标记。

当前 MVP 使用公共 STUN 完成常见网络下的 P2P 连接。生产环境需要配置自有 TURN，
或将 `RTCProvider` 替换为 Agora/TRTC 适配器，以覆盖严格 NAT 和企业网络。

### STUDENT_INTERACTION

`RAISE_HAND`、`LOWER_HAND`、`SEND_EMOJI`

学生举手 payload 为 `{ "raised": true }`，表情 payload 为 `{ "emoji": "😊" }`。
消息必须由课堂学生定向发送给本课堂教师；教师端收到后更新学生状态卡或播放表情动画。

## 奖励事务顺序

1. 教师发送带目标学生的 `GRANT_REWARD`。
2. 服务端校验 JWT、教师房间所有权和目标成员。
3. 服务端写 `RewardLog` 与 `SignalLog`。
4. 服务端只向目标学生 Socket 转发。
5. 教师收到 ACK；学生播放动画。

## 扩展规则

新增 action 时先修改 `packages/types/src/index.ts` 的 `MESSAGE_ACTIONS`，再实现服务端授权和客户端处理。未知 action 会被网关拒绝，不能在单一端私自扩展。
