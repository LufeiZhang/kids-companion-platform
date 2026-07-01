import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { prisma } from "../database/client.js";
import { requireAuth, type AuthRequest } from "../auth/security.js";

const storage = multer.diskStorage({
  destination: path.resolve("uploads"),
  filename: (_request, file, callback) => {
    const safeName = file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
    callback(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype === "application/pdf" || file.mimetype.startsWith("image/"));
  }
});

export const coursewareRouter = Router();
coursewareRouter.use(requireAuth(["teacher"]));

coursewareRouter.get("/", async (request: AuthRequest, response) => {
  response.json(await prisma.courseware.findMany({
    where: { ownerId: request.auth!.id },
    orderBy: { createdAt: "desc" }
  }));
});

coursewareRouter.post("/", upload.single("file"), async (request: AuthRequest, response) => {
  if (!request.file) return response.status(400).json({ message: "请选择图片或 PDF 文件" });
  const courseware = await prisma.courseware.create({
    data: {
      title: String(request.body.title || request.file.originalname),
      type: request.file.mimetype === "application/pdf" ? "pdf" : "image",
      fileUrl: `/uploads/${request.file.filename}`,
      ownerId: request.auth!.id
    }
  });
  response.status(201).json(courseware);
});
