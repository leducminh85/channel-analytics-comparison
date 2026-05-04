"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Tạo một nhóm so sánh mới
 */
export async function createGroup(name: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Bạn cần đăng nhập để thực hiện thao tác này");

  const userId = (session.user as any).id;

  const group = await prisma.compareGroup.create({
    data: {
      name,
      userId: userId,
    },
  });

  revalidatePath("/dashboard");
  return group;
}

/**
 * Lấy danh sách các nhóm của người dùng hiện tại
 */
export async function getGroups() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const userId = (session.user as any).id;

  return await prisma.compareGroup.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Lấy chi tiết nhóm bao gồm các kênh và thống kê 30 ngày qua
 */
export async function getGroupDetails(groupId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const userId = (session.user as any).id;

  const group = await prisma.compareGroup.findFirst({
    where: { 
      id: groupId,
      userId: userId
    },
    include: {
      channels: {
        include: {
          channel: {
            include: {
              dailyStats: {
                orderBy: { date_str: "desc" },
                take: 30
              }
            }
          }
        }
      }
    }
  });

  if (!group) throw new Error("Không tìm thấy nhóm so sánh");

  return group;
}

/**
 * Xóa một nhóm so sánh
 */
export async function deleteGroup(groupId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const userId = (session.user as any).id;

  try {
    await prisma.compareGroup.delete({
      where: { 
        id: groupId,
        userId: userId
      }
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: any) {
    console.error("Error in deleteGroup:", error);
    throw new Error("Không thể xóa nhóm");
  }
}
