"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Edit3, Image as ImageIcon, Check, Loader2, X } from "lucide-react";
import { deleteGroup, updateGroup } from "@/app/actions/groupActions";
import ActionMenu from "./ActionMenu";
import ConfirmModal from "./ConfirmModal";
import * as LucideIcons from "lucide-react";
import { AVAILABLE_ICONS, ICON_COLORS } from "@/lib/iconMap";

interface GroupActionMenuProps {
  groupId: string;
  groupName: string;
  currentIcon?: string | null;
  redirectToDashboard?: boolean;
}

export default function GroupActionMenu({
  groupId,
  groupName,
  currentIcon,
  redirectToDashboard = false,
}: GroupActionMenuProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isLogoOpen, setIsLogoOpen] = useState(false);

  const [newName, setNewName] = useState(groupName);

  // Handle group deletion.
  const handleConfirmDelete = () => {
    startTransition(async () => {
      try {
        await deleteGroup(groupId);
        setIsDeleteOpen(false);
        if (redirectToDashboard) {
          router.push("/dashboard");
        }
      } catch (error: any) {
        alert(error.message);
        setIsDeleteOpen(false);
      }
    });
  };

  // Handle group rename.
  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName === groupName) {
      setIsRenameOpen(false);
      return;
    }

    startTransition(async () => {
      try {
        await updateGroup(groupId, { name: newName.trim() });
        setIsRenameOpen(false);
      } catch (error: any) {
        alert(error.message);
      }
    });
  };

  // Handle icon selection.
  const handleSelectIcon = (iconName: string) => {
    startTransition(async () => {
      try {
        await updateGroup(groupId, { icon: iconName });
        setIsLogoOpen(false);
      } catch (error: any) {
        alert(error.message);
      }
    });
  };

  return (
    <>
      <ActionMenu
        items={[
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
          {
            label: "Xóa Nhóm",
            icon: <Trash2 className="h-4 w-4" />,
            onClick: () => setIsDeleteOpen(true),
            variant: "destructive",
          },
        ]}
      />

      {/* Delete modal */}
      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        isLoading={isPending}
        title="Xóa nhóm so sánh"
        description={`Bạn có chắc chắn muốn xóa nhóm "${groupName}"? Mọi dữ liệu về nhóm này sẽ bị mất vĩnh viễn.`}
        confirmText="Xóa ngay"
      />

      {/* Rename modal */}
      {isRenameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm transition-all">
          <div className="w-full max-w-sm scale-100 transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
            <h3 className="text-lg font-bold text-slate-900">Sửa Tên Nhóm</h3>
            <p className="mt-2 text-sm text-slate-500">
              Nhập tên mới cho nhóm so sánh của bạn.
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

      {/* Icon picker modal */}
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

            <div className="grid grid-cols-5 gap-3 sm:grid-cols-5 relative">
              {/* Saving overlay */}
              {isPending && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/50 backdrop-blur-[2px]">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              )}

              {AVAILABLE_ICONS.map((iconName) => {
                // @ts-ignore
                const IconComponent = LucideIcons[iconName];
                const isActive = currentIcon === iconName;
                const gradient = ICON_COLORS[iconName] || "from-slate-400 to-slate-500";

                return (
                  <button
                    key={iconName}
                    onClick={() => handleSelectIcon(iconName)}
                    disabled={isPending}
                    className={`relative flex aspect-square items-center justify-center rounded-xl border-2 transition-all hover:scale-105 text-white shadow-sm bg-gradient-to-br ${gradient} ${
                      isActive
                        ? "border-slate-900 ring-2 ring-indigo-500 ring-offset-2 scale-110 z-10"
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
