"use client";

import { useState, useTransition } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { createGroup } from "@/app/actions/groupActions";
import { useRouter } from "next/navigation";

export default function CreateGroupModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      try {
        const group = await createGroup(name.trim());
        setName("");
        onClose();
        router.push(`/group/${group.id}`);
        router.refresh();
      } catch (error) {
        console.error("Failed to create group:", error);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900">
            Tạo nhóm so sánh mới
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Nhóm so sánh giúp bạn theo dõi và đối chiếu các kênh Youtube cùng lúc.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="group-name"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Tên nhóm
          </label>
          <input
            id="group-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Gaming Channels Vietnam"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            autoFocus
            disabled={isPending}
          />

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
              disabled={isPending}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Tạo nhóm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
