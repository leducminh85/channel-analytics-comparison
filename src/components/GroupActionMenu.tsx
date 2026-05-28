"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Edit3,
  Image as ImageIcon,
  Check,
  Loader2,
  X,
  Share2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  deleteGroup,
  getGroupShares,
  removeGroupShare,
  shareGroupWithUser,
  updateGroup,
  updateGroupShareRole,
} from "@/app/actions/groupActions";
import ActionMenu from "./ActionMenu";
import ConfirmModal from "./ConfirmModal";
import * as LucideIcons from "lucide-react";
import { AVAILABLE_ICONS, ICON_COLORS } from "@/lib/iconMap";

type GroupShareRoleValue = "VIEWER" | "EDITOR";

type GroupShare = {
  userId: string;
  role: GroupShareRoleValue;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

interface GroupActionMenuProps {
  groupId: string;
  groupName: string;
  currentIcon?: string | null;
  redirectToDashboard?: boolean;
  canEdit?: boolean;
  canManageShares?: boolean;
  canDelete?: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function GroupActionMenu({
  groupId,
  groupName,
  currentIcon,
  redirectToDashboard = false,
  canEdit = true,
  canManageShares = true,
  canDelete = true,
}: GroupActionMenuProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isLogoOpen, setIsLogoOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  const [newName, setNewName] = useState(groupName);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<GroupShareRoleValue>("VIEWER");
  const [shareError, setShareError] = useState("");
  const [shares, setShares] = useState<GroupShare[]>([]);
  const [isShareLoading, setIsShareLoading] = useState(false);

  const loadShares = async () => {
    if (!canManageShares) return;

    setIsShareLoading(true);
    setShareError("");
    try {
      const nextShares = await getGroupShares(groupId);
      setShares(nextShares);
    } catch (error: unknown) {
      setShareError(getErrorMessage(error, "Không thể tải danh sách chia sẻ"));
    } finally {
      setIsShareLoading(false);
    }
  };

  const openShareModal = () => {
    setIsShareOpen(true);
    setShareEmail("");
    setShareRole("VIEWER");
    void loadShares();
  };

  const upsertShare = (nextShare: GroupShare) => {
    setShares((current) => {
      const others = current.filter((share) => share.userId !== nextShare.userId);
      return [...others, nextShare].sort((a, b) =>
        (a.user.email || "").localeCompare(b.user.email || "")
      );
    });
  };

  const handleConfirmDelete = () => {
    if (!canDelete) return;

    startTransition(async () => {
      try {
        await deleteGroup(groupId);
        setIsDeleteOpen(false);
        if (redirectToDashboard) {
          router.push("/dashboard");
        }
      } catch (error: unknown) {
        alert(getErrorMessage(error, "Không thể xóa nhóm"));
        setIsDeleteOpen(false);
      }
    });
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newName.trim() || newName === groupName) {
      setIsRenameOpen(false);
      return;
    }

    startTransition(async () => {
      try {
        await updateGroup(groupId, { name: newName.trim() });
        setIsRenameOpen(false);
      } catch (error: unknown) {
        alert(getErrorMessage(error, "Không thể cập nhật nhóm"));
      }
    });
  };

  const handleSelectIcon = (iconName: string) => {
    if (!canEdit) return;

    startTransition(async () => {
      try {
        await updateGroup(groupId, { icon: iconName });
        setIsLogoOpen(false);
      } catch (error: unknown) {
        alert(getErrorMessage(error, "Không thể cập nhật biểu tượng"));
      }
    });
  };

  const handleShareSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageShares || !shareEmail.trim()) return;

    setIsShareLoading(true);
    setShareError("");
    try {
      const nextShare = await shareGroupWithUser(groupId, shareEmail.trim(), shareRole);
      upsertShare(nextShare);
      setShareEmail("");
      setShareRole("VIEWER");
    } catch (error: unknown) {
      setShareError(getErrorMessage(error, "Không thể chia sẻ nhóm"));
    } finally {
      setIsShareLoading(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, nextRole: GroupShareRoleValue) => {
    if (!canManageShares) return;

    setIsShareLoading(true);
    setShareError("");
    try {
      const nextShare = await updateGroupShareRole(groupId, targetUserId, nextRole);
      upsertShare(nextShare);
    } catch (error: unknown) {
      setShareError(getErrorMessage(error, "Không thể cập nhật quyền chia sẻ"));
    } finally {
      setIsShareLoading(false);
    }
  };

  const handleRemoveShare = async (targetUserId: string) => {
    if (!canManageShares) return;

    setIsShareLoading(true);
    setShareError("");
    try {
      await removeGroupShare(groupId, targetUserId);
      setShares((current) => current.filter((share) => share.userId !== targetUserId));
    } catch (error: unknown) {
      setShareError(getErrorMessage(error, "Không thể gỡ chia sẻ"));
    } finally {
      setIsShareLoading(false);
    }
  };

  const menuItems = [
    ...(canEdit
      ? [
          {
            label: "Sửa tên",
            icon: <Edit3 className="h-4 w-4" />,
            onClick: () => {
              setNewName(groupName);
              setIsRenameOpen(true);
            },
          },
          {
            label: "Sửa Logo",
            icon: <ImageIcon className="h-4 w-4" />,
            onClick: () => setIsLogoOpen(true),
          },
        ]
      : []),
    ...(canManageShares
      ? [
          {
            label: "Chia sẻ",
            icon: <Share2 className="h-4 w-4" />,
            onClick: openShareModal,
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: "Xóa Nhóm",
            icon: <Trash2 className="h-4 w-4" />,
            onClick: () => setIsDeleteOpen(true),
            variant: "destructive" as const,
          },
        ]
      : []),
  ];

  if (menuItems.length === 0) return null;

  return (
    <>
      <ActionMenu items={menuItems} />

      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        isLoading={isPending}
        title="Xóa nhóm so sánh"
        description={`Bạn có chắc chắn muốn xóa nhóm "${groupName}"? Mọi dữ liệu về nhóm này sẽ bị mất vĩnh viễn.`}
        confirmText="Xóa ngay"
      />

      {isRenameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-sm scale-100 transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
            <h3 className="text-lg font-bold text-slate-900">Sửa Tên Nhóm</h3>
            <p className="mt-2 text-sm text-slate-500">
              Nhập tên mới cho nhóm so sánh.
            </p>

            <form onSubmit={handleRenameSubmit} className="mt-5 space-y-4">
              <div>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Ví dụ: Kênh Game 2024"
                  autoFocus
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRenameOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                  disabled={isPending}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || newName === groupName || isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isShareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-xl scale-100 transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Chia sẻ nhóm</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Chỉ chia sẻ cho tài khoản đã có trong hệ thống.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsShareOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleShareSubmit} className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
              <input
                type="email"
                value={shareEmail}
                onChange={(event) => setShareEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="email@example.com"
                disabled={isShareLoading}
              />
              <select
                value={shareRole}
                onChange={(event) => setShareRole(event.target.value as GroupShareRoleValue)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                disabled={isShareLoading}
              >
                <option value="VIEWER">Xem</option>
                <option value="EDITOR">Sửa</option>
              </select>
              <button
                type="submit"
                disabled={!shareEmail.trim() || isShareLoading}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {isShareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Thêm"}
              </button>
            </form>

            {shareError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {shareError}
              </p>
            )}

            <div className="mt-5 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
              {shares.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  Chưa chia sẻ nhóm này cho ai.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {shares.map((share) => (
                    <div key={share.userId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {share.user.name || share.user.email || "Người dùng"}
                        </p>
                        <p className="truncate text-xs text-slate-500">{share.user.email}</p>
                      </div>
                      <select
                        value={share.role}
                        onChange={(event) =>
                          handleRoleChange(share.userId, event.target.value as GroupShareRoleValue)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        disabled={isShareLoading}
                      >
                        <option value="VIEWER">Xem</option>
                        <option value="EDITOR">Sửa</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveShare(share.userId)}
                        disabled={isShareLoading}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Gỡ
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isLogoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-lg scale-100 transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Chọn Logo Nhóm</h3>
              <button
                onClick={() => setIsLogoOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative grid grid-cols-5 gap-3 sm:grid-cols-5">
              {isPending && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/50 backdrop-blur-[2px]">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              )}

              {AVAILABLE_ICONS.map((iconName) => {
                const IconComponent = LucideIcons[iconName as keyof typeof LucideIcons] as LucideIcon | undefined;
                const isActive = currentIcon === iconName;
                const gradient = ICON_COLORS[iconName] || "from-slate-400 to-slate-500";

                return (
                  <button
                    key={iconName}
                    onClick={() => handleSelectIcon(iconName)}
                    disabled={isPending}
                    className={`relative flex aspect-square items-center justify-center rounded-xl border-2 text-white shadow-sm transition-all hover:scale-105 bg-gradient-to-br ${gradient} ${
                      isActive
                        ? "z-10 scale-110 border-slate-900 ring-2 ring-indigo-500 ring-offset-2"
                        : "border-transparent opacity-80 hover:opacity-100"
                    }`}
                  >
                    {IconComponent && <IconComponent className="h-6 w-6" />}
                    {isActive && (
                      <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white shadow-md ring-2 ring-white">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
