import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash("Demo123!", 10);

async function upsertUser(email: string, name: string, role: UserRole) {
  return prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: { email, name, role, passwordHash }
  });
}

async function main() {
  const admin = await upsertUser("admin@example.com", "平台管理员", "admin");
  const teacher = await upsertUser("teacher@example.com", "林老师", "teacher");
  const student = await upsertUser("student@example.com", "小星星", "student");

  await prisma.teacherProfile.upsert({
    where: { userId: teacher.id },
    update: {},
    create: { userId: teacher.id, bio: "耐心陪伴每一次进步", subjects: ["阅读", "数学"] }
  });
  await prisma.studentProfile.upsert({
    where: { userId: student.id },
    update: {},
    create: { userId: student.id, age: 8, grade: "二年级", parentName: "家长", parentContact: "已脱敏" }
  });

  const group = await prisma.studentGroup.findFirst({ where: { teacherId: teacher.id } })
    ?? await prisma.studentGroup.create({
      data: { name: "星光一组", teacherId: teacher.id, description: "MVP 演示小组" }
    });
  await prisma.studentProfile.update({
    where: { userId: student.id },
    data: { groupId: group.id }
  });
  console.log(`Seed complete: ${admin.email}, ${teacher.email}, ${student.email}`);
}

main().finally(() => prisma.$disconnect());
