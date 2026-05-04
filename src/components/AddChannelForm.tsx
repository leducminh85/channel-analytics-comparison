"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2, LinkIcon } from "lucide-react";
import { addChannelToGroup } from "@/app/actions/channelActions";

export default function AddChannelForm({ groupId }: { groupId: string }) {
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError("");

    startTransition(async () => {
      try {
        await addChannelToGroup(url.trim(), groupId);
        setUrl("");
      } catch (err: any) {
        setError(err.message || "Đã xảy ra lỗi khi thêm kênh");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">
        Thêm kênh Youtube
      </h3>
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <div className="relative flex-1">
          <LinkIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Dán URL kênh Youtube (VD: https://youtube.com/@MrBeast)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            disabled={isPending}
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang xử lý...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Thêm kênh
            </>
          )}
        </button>
      </form>

      {isPending && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2.5 text-xs text-indigo-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Đang lấy dữ liệu... Vui lòng đợi trong giây lát.
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-xs text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
