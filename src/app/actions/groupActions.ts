"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getAccessibleGroupWhere,
  getGroupAccessMetadata,
  getSessionUserId,
  isGroupShareRole,
  requireGroupAccess,
  type GroupAccessRole,
  type GroupShareRoleValue,
} from "@/lib/groupAccess";

const AVAILABLE_ICONS = [
  "GitCompareArrows", "PieChart", "BarChart2", "TrendingUp", "Activity",
  "Target", "Zap", "Star", "Heart", "Briefcase",
  "Globe", "Layers", "Box", "Cpu", "Database",
  "Folder", "Hash", "Monitor", "Smartphone", "Tv"
];

type GroupWithAccessShape = {
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
  shares: Array<{
    role: "VIEWER" | "EDITOR";
  }>;
};

type GroupShareRecord = {
  userId: string;
  role: "VIEWER" | "EDITOR";
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

async function requireCurrentUserId() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) throw new Error("Không có quyền");
  return userId;
}

function resolveAccessRole(group: GroupWithAccessShape, userId: string): GroupAccessRole {
  if (group.userId === userId) return "OWNER";

  const shareRole = group.shares[0]?.role;
  if (shareRole === "EDITOR" || shareRole === "VIEWER") return shareRole;

  throw new Error("Không có quyền");
}

function serializeGroupWithAccess<T extends GroupWithAccessShape>(group: T, userId: string) {
  const groupData = { ...group };
  delete (groupData as Partial<T>).shares;
  delete (groupData as Partial<T>).user;

  const accessRole = resolveAccessRole(group, userId);

  return {
    ...groupData,
    owner: group.user,
    ...getGroupAccessMetadata(accessRole),
  };
}

function serializeShare(share: GroupShareRecord) {
  return {
    userId: share.userId,
    role: share.role,
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
    user: share.user,
  };
}

function revalidateGroupAccessPaths(groupId: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/group/${groupId}`);
}

async function findUserByEmail(email: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) throw new Error("Nhập email");

  return prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });
}

/**
 * Create a new comparison group for the current user.
 */
export async function createGroup(name: string) {
  const userId = await requireCurrentUserId();
  const randomIcon = AVAILABLE_ICONS[Math.floor(Math.random() * AVAILABLE_ICONS.length)];

  const group = await prisma.compareGroup.create({
    data: {
      name,
      icon: randomIcon,
      userId,
    },
  });

  revalidatePath("/dashboard");
  return group;
}

/**
 * Return comparison groups owned by or shared with the current user.
 */
export async function getGroups() {
  const userId = await requireCurrentUserId();

  const groups = await prisma.compareGroup.findMany({
    where: getAccessibleGroupWhere(userId),
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      shares: {
        where: { userId },
        select: {
          role: true,
        },
        take: 1,
      },
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

  return groups.map((group) => serializeGroupWithAccess(group, userId));
}

/**
 * Return group details, including channels and historical metrics.
 */
export async function getGroupDetails(groupId: string) {
  const userId = await requireCurrentUserId();

  const group = await prisma.compareGroup.findFirst({
    where: {
      id: groupId,
      ...getAccessibleGroupWhere(userId),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      shares: {
        where: { userId },
        select: {
          role: true,
        },
        take: 1,
      },
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

  if (!group) throw new Error("Không tìm thấy nhóm");

  const groupWithAccess = serializeGroupWithAccess(group, userId);

  // Convert BigInt values to Number to avoid Server Actions serialization issues.
  return JSON.parse(
    JSON.stringify(groupWithAccess, (key, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}

/**
 * Delete one comparison group owned by the current user.
 */
export async function deleteGroup(groupId: string) {
  const userId = await requireCurrentUserId();
  await requireGroupAccess(groupId, userId, ["OWNER"]);

  try {
    await prisma.compareGroup.delete({
      where: { id: groupId }
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error in deleteGroup:", error);
    throw new Error("Không thể xóa nhóm");
  }
}

/**
 * Update editable group fields such as the name or icon.
 */
export async function updateGroup(groupId: string, data: { name?: string; icon?: string | null }) {
  const userId = await requireCurrentUserId();
  await requireGroupAccess(groupId, userId, ["OWNER", "EDITOR"]);

  const updateData: { name?: string; icon?: string | null } = {};
  if (typeof data.name === "string") updateData.name = data.name.trim();
  if (typeof data.icon === "string" || data.icon === null) updateData.icon = data.icon;

  if (Object.keys(updateData).length === 0) {
    return { success: true, group: null };
  }

  try {
    const updatedGroup = await prisma.compareGroup.update({
      where: { id: groupId },
      data: updateData
    });

    revalidateGroupAccessPaths(groupId);
    return { success: true, group: updatedGroup };
  } catch (error: unknown) {
    console.error("Error in updateGroup:", error);
    throw new Error("Không thể cập nhật nhóm");
  }
}

export async function getGroupShares(groupId: string) {
  const userId = await requireCurrentUserId();
  await requireGroupAccess(groupId, userId, ["OWNER"]);

  const shares = await prisma.compareGroupShare.findMany({
    where: { groupId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return shares.map(serializeShare);
}

export async function shareGroupWithUser(groupId: string, email: string, role: GroupShareRoleValue) {
  const ownerId = await requireCurrentUserId();
  await requireGroupAccess(groupId, ownerId, ["OWNER"]);

  if (!isGroupShareRole(role)) {
    throw new Error("Quyền không hợp lệ");
  }

  const targetUser = await findUserByEmail(email);
  if (!targetUser) {
    throw new Error("Không tìm thấy người dùng");
  }

  if (targetUser.id === ownerId) {
    throw new Error("Chủ đã có quyền");
  }

  const share = await prisma.compareGroupShare.upsert({
    where: {
      groupId_userId: {
        groupId,
        userId: targetUser.id,
      },
    },
    update: { role },
    create: {
      groupId,
      userId: targetUser.id,
      role,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  revalidateGroupAccessPaths(groupId);
  return serializeShare(share);
}

export async function updateGroupShareRole(
  groupId: string,
  targetUserId: string,
  role: GroupShareRoleValue
) {
  const ownerId = await requireCurrentUserId();
  await requireGroupAccess(groupId, ownerId, ["OWNER"]);

  if (!isGroupShareRole(role)) {
    throw new Error("Quyền không hợp lệ");
  }

  if (targetUserId === ownerId) {
    throw new Error("Chủ đã có quyền");
  }

  const share = await prisma.compareGroupShare.update({
    where: {
      groupId_userId: {
        groupId,
        userId: targetUserId,
      },
    },
    data: { role },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  revalidateGroupAccessPaths(groupId);
  return serializeShare(share);
}

export async function removeGroupShare(groupId: string, targetUserId: string) {
  const ownerId = await requireCurrentUserId();
  await requireGroupAccess(groupId, ownerId, ["OWNER"]);

  if (targetUserId === ownerId) {
    throw new Error("Không thể gỡ chủ");
  }

  await prisma.compareGroupShare.delete({
    where: {
      groupId_userId: {
        groupId,
        userId: targetUserId,
      },
    },
  });

  revalidateGroupAccessPaths(groupId);
  return { success: true };
}
