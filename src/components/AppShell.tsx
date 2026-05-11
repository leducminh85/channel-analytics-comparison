"use client";

import { useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import Sidebar from "@/components/Sidebar";

interface CompareGroup {
  id: string;
  name: string;
  icon?: string | null;
}

export default function AppShell({
  groups,
  children,
}: {
  groups: CompareGroup[];
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("channelCompare.sidebarOpen") !== "false";
  });

  const toggleSidebar = () => {
    setSidebarOpen((current) => {
      const next = !current;
      window.localStorage.setItem("channelCompare.sidebarOpen", String(next));
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen ? (
        <Sidebar groups={groups} onToggle={toggleSidebar} />
      ) : (
        <button
          type="button"
          onClick={toggleSidebar}
          className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          title="Hiện sidebar"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      )}
      <main
        className={`flex-1 min-w-0 overflow-hidden p-8 transition-[margin] duration-200 ${
          sidebarOpen ? "ml-64" : "ml-0 pt-16"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
