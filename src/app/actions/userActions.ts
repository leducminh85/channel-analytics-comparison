"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

async function checkAdmin() {
  const session = await getServerSession(authOptions);
  console.log("Admin Check Session:", JSON.stringify(session, null, 2));
  if (!session || (session.user as any).role !== "ADMIN") {
    throw new Error("Không có quyền truy cập");
  }
}

export async function getUsers() {
  await checkAdmin();
  return await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function createUser(data: any) {
  await checkAdmin();
  const { name, email, password, role } = data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error("Email đã tồn tại");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role || "USER",
    },
  });

  revalidatePath("/admin");
  return user;
}

export async function deleteUser(id: string) {
  await checkAdmin();
  
  const session = await getServerSession(authOptions);
  if ((session?.user as any).id === id) {
    throw new Error("Không thể tự xoá chính mình");
  }

  await prisma.user.delete({
    where: { id },
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function resetPassword(id: string, newPassword: string) {
  await checkAdmin();

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id },
    data: {
      password: hashedPassword,
    },
  });

  return { success: true };
}
