import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import prisma from "@/lib/prisma";

export type GroupAccessRole = "OWNER" | "EDITOR" | "VIEWER";
export type GroupShareRoleValue = "EDITOR" | "VIEWER";

export const GROUP_SHARE_ROLES: GroupShareRoleValue[] = ["VIEWER", "EDITOR"];
export const GROUP_EDITOR_ROLES: GroupAccessRole[] = ["OWNER", "EDITOR"];

export function getSessionUserId(session: Session | null) {
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export function isGroupShareRole(value: unknown): value is GroupShareRoleValue {
  return value === "VIEWER" || value === "EDITOR";
}

export function getAccessibleGroupWhere(userId: string): Prisma.CompareGroupWhereInput {
  return {
    OR: [
      { userId },
      {
        shares: {
          some: { userId },
        },
      },
    ],
  };
}

export function canEditGroup(accessRole: GroupAccessRole | null) {
  return accessRole === "OWNER" || accessRole === "EDITOR";
}

export function getGroupAccessMetadata(accessRole: GroupAccessRole) {
  return {
    accessRole,
    canEdit: canEditGroup(accessRole),
    canManageShares: accessRole === "OWNER",
    canDelete: accessRole === "OWNER",
  };
}

export async function getGroupAccess(groupId: string, userId: string): Promise<GroupAccessRole | null> {
  const group = await prisma.compareGroup.findUnique({
    where: { id: groupId },
    select: {
      userId: true,
      shares: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!group) return null;
  if (group.userId === userId) return "OWNER";

  const shareRole = group.shares[0]?.role;
  return shareRole === "EDITOR" || shareRole === "VIEWER" ? shareRole : null;
}

export async function requireGroupAccess(
  groupId: string,
  userId: string,
  allowedRoles: readonly GroupAccessRole[]
) {
  const accessRole = await getGroupAccess(groupId, userId);

  if (!accessRole || !allowedRoles.includes(accessRole)) {
    throw new Error("Không có quyền");
  }

  return accessRole;
}
