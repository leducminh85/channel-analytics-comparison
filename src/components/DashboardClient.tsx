"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, GitCompareArrows, ArrowRight } from "lucide-react";
import CreateGroupModal from "@/components/CreateGroupModal";

interface CompareGroup {
  id: string;
  name: string;
  createdAt: Date | string;
}

export default function DashboardClient({
  groups,
  userName,
}: {
  groups: CompareGroup[];
  userName: string;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Chào mừng, <span className="font-medium text-slate-700">{userName}</span>
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 hover:shadow-indigo-500/40"
        >
          <Plus className="h-4 w-4" />
          Tạo Group mới
        </button>
      </div>

      {/* Stats Overview */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
            <GitCompareArrows className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{groups.length}</p>
          <p className="mt-0.5 text-xs text-slate-500">Nhóm so sánh</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
            <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <p className="text-2xl font-bold text-slate-900">—</p>
          <p className="mt-0.5 text-xs text-slate-500">Kênh đang theo dõi</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <p className="text-2xl font-bold text-slate-900">—</p>
          <p className="mt-0.5 text-xs text-slate-500">Tổng số video</p>
        </div>
      </div>

      {/* Group Cards */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Danh sách nhóm so sánh
        </h2>
        {groups.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white py-16">
            <div className="mb-3 rounded-full bg-indigo-50 p-4">
              <GitCompareArrows className="h-8 w-8 text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">
              Bạn chưa có nhóm so sánh nào
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Nhấn &quot;Tạo Group mới&quot; để bắt đầu
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <Link
                key={group.id}
                href={`/group/${group.id}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-500/5"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/20">
                  <GitCompareArrows className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 group-hover:text-indigo-600">
                  {group.name}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Tạo lúc{" "}
                  {new Date(group.createdAt).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
                  Xem chi tiết
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <CreateGroupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
