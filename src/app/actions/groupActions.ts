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
 * Create a new comparison group for the current user.
 */
export async function createGroup(name: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ thá»±c hiá»‡n thao tÃ¡c nÃ y");

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
 * Return the current user's comparison groups.
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
 * Return group details, including channels and historical metrics.
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

  if (!group) throw new Error("KhÃ´ng tÃ¬m tháº¥y nhÃ³m so sÃ¡nh");

  // Convert BigInt values to Number to avoid Server Actions serialization issues.
  const serializedGroup = JSON.parse(
    JSON.stringify(group, (key, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );

  return serializedGroup;
}

/**
 * Delete one comparison group owned by the current user.
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
    throw new Error("KhÃ´ng thá»ƒ xÃ³a nhÃ³m");
  }
}

/**
 * Update editable group fields such as the name or icon.
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
    throw new Error("KhÃ´ng thá»ƒ cáº­p nháº­t nhÃ³m");
  }
}
