import { Prisma } from "@prisma/client";
import type { UserRole } from "@companion/types";
import type { AuthUser } from "./security.js";

function hasWhere(where: object) {
  return Object.keys(where).length > 0;
}

function mergeWhere<T extends object>(scope: T, extra: T = {} as T): T {
  if (!hasWhere(scope)) return extra;
  if (!hasWhere(extra)) return scope;
  return { AND: [scope, extra] } as T;
}

export const teacherStudentProfileWhere = (teacherId: string): Prisma.StudentProfileWhereInput => ({
  OR: [
    { group: { teacherId } },
    { groupMemberships: { some: { group: { teacherId } } } }
  ]
});

export const studentUserWhereForTeacher = (teacherId: string): Prisma.UserWhereInput => ({
  role: "student",
  studentProfile: teacherStudentProfileWhere(teacherId)
});

export function usersWhereForAuth(auth: AuthUser, role?: UserRole): Prisma.UserWhereInput | undefined {
  if (auth.role === "teacher") return studentUserWhereForTeacher(auth.id);
  if (auth.role === "student") return { id: auth.id };
  return role ? { role } : undefined;
}

export function studentGroupWhereForAuth(auth: AuthUser, extra: Prisma.StudentGroupWhereInput = {}) {
  const scope: Prisma.StudentGroupWhereInput = auth.role === "teacher"
    ? { teacherId: auth.id }
    : {};
  return mergeWhere(scope, extra);
}

export function classRoomWhereForAuth(auth: AuthUser, extra: Prisma.ClassRoomWhereInput = {}) {
  const scope: Prisma.ClassRoomWhereInput = auth.role === "teacher"
    ? { teacherId: auth.id }
    : auth.role === "student"
      ? { students: { some: { studentId: auth.id } } }
      : {};
  return mergeWhere(scope, extra);
}

export function learningTaskWhereForAuth(auth: AuthUser, extra: Prisma.LearningTaskWhereInput = {}) {
  const scope: Prisma.LearningTaskWhereInput = auth.role === "teacher"
    ? { teacherId: auth.id }
    : auth.role === "student"
      ? { studentId: auth.id }
      : {};
  return mergeWhere(scope, extra);
}

export function rewardLogWhereForAuth(auth: AuthUser, extra: Prisma.RewardLogWhereInput = {}) {
  const scope: Prisma.RewardLogWhereInput = auth.role === "teacher"
    ? { room: { teacherId: auth.id } }
    : auth.role === "student"
      ? { studentId: auth.id }
      : {};
  return mergeWhere(scope, extra);
}

export function signalLogWhereForAuth(auth: AuthUser, extra: Prisma.SignalLogWhereInput = {}) {
  const scope: Prisma.SignalLogWhereInput = auth.role === "teacher"
    ? { room: { teacherId: auth.id } }
    : auth.role === "student"
      ? { room: { students: { some: { studentId: auth.id } } } }
      : {};
  return mergeWhere(scope, extra);
}
