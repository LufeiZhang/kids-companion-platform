import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { authRouter } from "./auth/routes.js";
import { usersRouter } from "./users/routes.js";
import { classesRouter } from "./classes/routes.js";
import { groupsRouter } from "./classes/groups.js";
import { coursewareRouter } from "./courseware/routes.js";
import { logsRouter } from "./logs/routes.js";
import { tasksRouter } from "./tasks/routes.js";
import { createSocketGateway } from "./websocket/gateway.js";
import { prisma } from "./database/client.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const origins = (process.env.CLIENT_ORIGINS
  ?? "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175")
  .split(",")
  .map((value) => value.trim());
const allowAnyOrigin = origins.includes("*");
const corsOrigin = allowAnyOrigin ? true : origins;

const app = express();
app.use(cors({ origin: corsOrigin, credentials: !allowAnyOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.resolve("uploads")));

app.get("/health", (_request, response) => response.json({
  ok: true,
  service: "kids-companion-server",
  time: new Date().toISOString()
}));
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/rooms", classesRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/courseware", coursewareRouter);
app.use("/api/logs", logsRouter);
app.use("/api/tasks", tasksRouter);

const workspaceRoot = path.basename(process.cwd()) === "server" ? path.resolve("..") : process.cwd();
const frontends = [
  { route: "/teacher", directory: path.join(workspaceRoot, "apps/teacher-web/dist") },
  { route: "/student", directory: path.join(workspaceRoot, "apps/student-web/dist") },
  { route: "/admin", directory: path.join(workspaceRoot, "apps/admin-web/dist") }
];
for (const frontend of frontends) {
  if (!fs.existsSync(frontend.directory)) continue;
  app.use(frontend.route, express.static(frontend.directory));
  app.get(`${frontend.route}/*`, (_request, response) => {
    response.sendFile(path.join(frontend.directory, "index.html"));
  });
}
const publicDirectory = path.join(workspaceRoot, "server/public");
if (fs.existsSync(publicDirectory)) app.use(express.static(publicDirectory));

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "服务器内部错误";
  response.status(500).json({ message });
});

const httpServer = createServer(app);
createSocketGateway(httpServer, allowAnyOrigin ? ["*"] : origins);

httpServer.listen(port, host, () => {
  console.log(`API and WebSocket listening on http://${host}:${port}`);
});

async function shutdown() {
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
