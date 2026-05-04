"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitCompareArrows,
  LogOut,
  ChevronRight,
  CirclePlay,
} from "lucide-react";
import { signOut } from "next-auth/react";
import * as LucideIcons from "lucide-react";
import { ICON_COLORS } from "@/lib/iconMap";

interface CompareGroup {
  id: string;
  name: string;
  icon?: string | null;
}

export default function Sidebar({ groups }: { groups: CompareGroup[] }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar-bg text-sidebar-fg">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-accent">
          <CirclePlay className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-white">
            Channel Compare
          </h1>
          <p className="text-[11px] text-slate-400">Youtube Analytics</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Dashboard Link */}
        <Link
          href="/dashboard"
          className={`group mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
            pathname === "/dashboard"
              ? "bg-sidebar-accent text-white shadow-lg shadow-indigo-500/20"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          }`}
        >
          <LayoutDashboard className="h-[18px] w-[18px]" />
          Dashboard
        </Link>

        {/* Groups Section */}
        <div className="mt-6">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Nhóm so sánh
          </p>
          <div className="space-y-0.5">
            {groups.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500 italic">
                Chưa có nhóm nào
              </p>
            )}
            {groups.map((group) => {
              const isActive = pathname === `/group/${group.id}`;
              
              // Resolve dynamic icon
              // @ts-ignore
              const DynamicIcon = group.icon ? LucideIcons[group.icon] || GitCompareArrows : GitCompareArrows;
              const gradientClass = group.icon && ICON_COLORS[group.icon] 
                ? ICON_COLORS[group.icon] 
                : "from-indigo-500 to-violet-500";

              return (
                <Link
                  key={group.id}
                  href={`/group/${group.id}`}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                    isActive
                      ? "bg-white/10 text-white font-medium"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${gradientClass} shadow-sm opacity-80 group-hover:opacity-100`}>
                    <DynamicIcon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="truncate">{group.name}</span>
                  <ChevronRight
                    className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                    }`}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Sign Out */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-red-400"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
