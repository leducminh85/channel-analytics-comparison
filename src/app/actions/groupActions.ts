"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const AVAILABLE_ICONS = [
  "GitCompareArrows", "PieChart", "BarChart2", "TrendingUp", "Activity",
  "Target", "Zap", "Star", "Heart", "Briefcase",
  "Globe", "Layers", "Box", "Cpu", "Database",
  "Folder", "Hash", "Monitor", "Smartphone", "Tv"
];

/**
 * Tạo một nhóm so sánh mới
 */
export async function createGroup(name: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Bạn cần đăng nhập để thực hiện thao tác này");

  const userId = (session.user as any).id;
  const randomIcon = AVAILABLE_ICONS[Math.floor(Math.random() * AVAILABLE_ICONS.length)];

  const group = await prisma.compareGroup.create({
    data: {
      name,
      icon: randomIcon,
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
    include: {
      channels: {
        include: {
          channel: {
            select: {
              id: true,
              logo_url: true,
              title: true
            }
          }
        }
      }
    },
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
                take: 400
              },
              monthlyStats: {
                orderBy: { month: "desc" },
                take: 24
              }
            }
          }
        }
      }
    }
  });

  if (!group) throw new Error("Không tìm thấy nhóm so sánh");

  // Chuyển đổi BigInt sang Number để tránh lỗi serialization của Next.js Server Actions
  const serializedGroup = JSON.parse(
    JSON.stringify(group, (key, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );

  return serializedGroup;
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

/**
 * Cập nhật thông tin nhóm (Tên hoặc Logo)
 */
export async function updateGroup(groupId: string, data: { name?: string; icon?: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const userId = (session.user as any).id;

  try {
    const updatedGroup = await prisma.compareGroup.update({
      where: { 
        id: groupId,
        userId: userId
      },
      data: data
    });

    revalidatePath("/dashboard");
    revalidatePath(`/group/${groupId}`);
    return { success: true, group: updatedGroup };
  } catch (error: any) {
    console.error("Error in updateGroup:", error);
    throw new Error("Không thể cập nhật nhóm");
  }
}
