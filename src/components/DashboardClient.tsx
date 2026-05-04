"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, GitCompareArrows, ArrowRight, Video, Users } from "lucide-react";
import CreateGroupModal from "@/components/CreateGroupModal";
import GroupActionMenu from "@/components/GroupActionMenu";
import * as LucideIcons from "lucide-react";
import { ICON_COLORS } from "@/lib/iconMap";

interface CompareGroup {
  id: string;
  name: string;
  icon?: string | null;
  createdAt: Date | string;
  channels: {
    channel: {
      id: string;
      logo_url: string | null;
      title: string;
    };
  }[];
}

export default function DashboardClient({
  groups,
  userName,
}: {
  groups: CompareGroup[];
  userName: string;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Calculate unique channels
  const uniqueChannelIds = new Set();
  groups.forEach(group => {
    group.channels?.forEach(gc => {
      if (gc.channel.id) uniqueChannelIds.add(gc.channel.id);
    });
  });
  const totalChannels = uniqueChannelIds.size;

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
            <Users className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalChannels}</p>
          <p className="mt-0.5 text-xs text-slate-500">Kênh đang theo dõi</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <Video className="h-5 w-5 text-amber-600" />
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
            {groups.map((group) => {
              const channelCount = group.channels?.length || 0;
              const logos = group.channels?.map(gc => gc.channel.logo_url).filter(Boolean) as string[];
              
              // Resolve dynamic icon
              // @ts-ignore
              const DynamicIcon = group.icon ? LucideIcons[group.icon] || GitCompareArrows : GitCompareArrows;

              const gradientClass = group.icon && ICON_COLORS[group.icon] 
                ? ICON_COLORS[group.icon] 
                : "from-indigo-500 to-violet-500";

              return (
                <div
                  key={group.id}
                  className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-500/5"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradientClass} shadow-lg opacity-90 group-hover:opacity-100 transition-opacity`}>
                      <DynamicIcon className="h-5 w-5 text-white" />
                    </div>
                    <GroupActionMenu 
                      groupId={group.id} 
                      groupName={group.name} 
                      currentIcon={group.icon} 
                    />
                  </div>

                  <Link href={`/group/${group.id}`} className="block">
                    <h3 className="text-base font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                      {group.name}
                    </h3>

                    {/* Avatar Stack & Channel Count */}
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex -space-x-2 overflow-hidden">
                          {logos.slice(0, 4).map((logo, i) => (
                            <div 
                              key={i} 
                              className="inline-block h-7 w-7 rounded-full ring-2 ring-white overflow-hidden relative border border-slate-100"
                            >
                              <Image src={logo} alt="" fill className="object-cover" />
                            </div>
                          ))}
                          {logos.length > 4 && (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 ring-2 ring-white">
                              +{logos.length - 4}
                            </div>
                          )}
                        </div>
                        <span className="ml-3 text-xs font-medium text-slate-500">
                          {channelCount} kênh
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 text-xs font-medium text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
                        Xem chi tiết
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
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
