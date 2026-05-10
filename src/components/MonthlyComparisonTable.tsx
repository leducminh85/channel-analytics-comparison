"use client";

import Image from "next/image";
import { Calendar, ChevronDown, ChevronUp, ChevronsUpDown, Filter } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  updateMonthlyComparisonSettings,
  type MonthlyComparisonSettings,
} from "@/app/actions/monthlyComparisonSettingsActions";

interface MonthlyStat {
  month: string;
  views_gained: number;
}

interface ChannelWithStats {
  id: string;
  title: string;
  logo_url: string | null;
  monthlyStats: MonthlyStat[];
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString("vi-VN");
}

function formatMonthLabel(monthStr: string): string {
  // input: YYYY-MM -> output: MM/YYYY
  const [y, m] = monthStr.split("-");
  return `${m}/${y}`;
}

export default function MonthlyComparisonTable({
  channels,
  initialSettings,
}: {
  channels: ChannelWithStats[];
  initialSettings: MonthlyComparisonSettings;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<MonthlyComparisonSettings>(initialSettings);
  const [showFilters, setShowFilters] = useState(false);
  const [, startTransition] = useTransition();

  const saveSettings = (nextSettings: MonthlyComparisonSettings) => {
    setSettings(nextSettings);
    startTransition(async () => {
      try {
        await updateMonthlyComparisonSettings(nextSettings);
      } catch (error) {
        console.error("Failed to save monthly comparison settings:", error);
      }
    });
  };

  // Auto scroll to the right (newest months) on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [channels, settings.filterMode, settings.customStartMonth, settings.customEndMonth]);

  const { channelData, sortedMonths, visibleMonths, displayChannels } = useMemo(() => {
    const allMonthsSet = new Set<string>();
    const data: Record<string, Record<string, number>> = {};

    channels.forEach((channel) => {
      data[channel.id] = {};
      (channel.monthlyStats || []).forEach((stat) => {
        allMonthsSet.add(stat.month);
        data[channel.id][stat.month] = stat.views_gained;
      });
    });

    const allMonths = Array.from(allMonthsSet).sort((a, b) => a.localeCompare(b));
    let months = allMonths;

    if (settings.filterMode === "last3" || settings.filterMode === "last6") {
      const limit = settings.filterMode === "last3" ? 3 : 6;
      months = allMonths.slice(-limit);
    }

    if (settings.filterMode === "custom") {
      months = allMonths.filter((month) => {
        if (settings.customStartMonth && month < settings.customStartMonth) return false;
        if (settings.customEndMonth && month > settings.customEndMonth) return false;
        return true;
      });
    }

    const sortMonthIsVisible = Boolean(
      settings.sortMonth && settings.sortDirection && months.includes(settings.sortMonth)
    );

    const rows = sortMonthIsVisible
      ? [...channels].sort((a, b) => {
          const aValue = data[a.id]?.[settings.sortMonth as string] || 0;
          const bValue = data[b.id]?.[settings.sortMonth as string] || 0;
          return settings.sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        })
      : channels;

    return {
      channelData: data,
      sortedMonths: allMonths,
      visibleMonths: months,
      displayChannels: rows,
    };
  }, [channels, settings]);

  const handleSortMonth = (month: string) => {
    const nextDirection =
      settings.sortMonth !== month
        ? "desc"
        : settings.sortDirection === "desc"
          ? "asc"
          : settings.sortDirection === "asc"
            ? null
            : "desc";

    saveSettings({
      ...settings,
      sortMonth: nextDirection ? month : null,
      sortDirection: nextDirection,
    });
  };

  const updateFilter = (nextSettings: Partial<MonthlyComparisonSettings>) => {
    saveSettings({
      ...settings,
      ...nextSettings,
    });
  };

  const getFilterLabel = () => {
    if (settings.filterMode === "last3") return "3 tháng gần nhất";
    if (settings.filterMode === "last6") return "6 tháng gần nhất";
    if (settings.filterMode === "custom") return "Tùy chọn";
    return "Tất cả tháng";
  };

  if (channels.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mt-8 w-full overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700">So sánh Views theo tháng (Gained)</h3>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Filter className="h-3.5 w-3.5" />
            {getFilterLabel()}
          </button>

          {showFilters && (
            <div className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { mode: "all", label: "Tất cả" },
                  { mode: "last3", label: "3 tháng" },
                  { mode: "last6", label: "6 tháng" },
                  { mode: "custom", label: "Tùy chọn" },
                ].map((option) => (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() =>
                      updateFilter({
                        filterMode: option.mode as MonthlyComparisonSettings["filterMode"],
                      })
                    }
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      settings.filterMode === option.mode
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {settings.filterMode === "custom" && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-slate-500">
                    Từ tháng
                    <input
                      type="month"
                      value={settings.customStartMonth || ""}
                      min={sortedMonths[0]}
                      max={settings.customEndMonth || sortedMonths[sortedMonths.length - 1]}
                      onChange={(event) => updateFilter({ customStartMonth: event.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-500">
                    Đến tháng
                    <input
                      type="month"
                      value={settings.customEndMonth || ""}
                      min={settings.customStartMonth || sortedMonths[0]}
                      max={sortedMonths[sortedMonths.length - 1]}
                      onChange={(event) => updateFilter({ customEndMonth: event.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="w-full overflow-x-auto scroll-smooth custom-scrollbar"
      >
        <table className="min-w-full text-sm border-collapse table-auto">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="sticky left-0 z-10 bg-slate-50/95 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-r border-slate-100 min-w-[200px] backdrop-blur-sm">
                Kênh
              </th>
              {visibleMonths.map((month) => (
                <th key={month} className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-[100px] border-r border-slate-100 last:border-r-0">
                  <button
                    type="button"
                    onClick={() => handleSortMonth(month)}
                    className="mx-auto flex items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                    title={`Sắp xếp theo ${formatMonthLabel(month)}`}
                  >
                    {formatMonthLabel(month)}
                    {settings.sortMonth === month && settings.sortDirection === "desc" ? (
                      <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                    ) : settings.sortMonth === month && settings.sortDirection === "asc" ? (
                      <ChevronUp className="h-3.5 w-3.5 text-indigo-600" />
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayChannels.map((channel) => (
              <tr key={channel.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                <td className="sticky left-0 z-10 bg-white/95 px-5 py-4 font-semibold text-slate-700 border-r border-slate-100 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    {channel.logo_url && (
                      <div className="relative h-6 w-6 rounded-full overflow-hidden border border-slate-200 shrink-0">
                        <Image src={channel.logo_url} alt="" fill className="object-cover" />
                      </div>
                    )}
                    <span className="truncate max-w-[150px]">{channel.title}</span>
                  </div>
                </td>
                {visibleMonths.map((month) => {
                  const gained = channelData[channel.id][month] || 0;
                  return (
                    <td key={month} className="px-5 py-4 text-center font-mono text-slate-600 border-r border-slate-50 last:border-r-0">
                      {gained > 0 ? (
                        <span className="text-indigo-600 font-bold">+{formatNumber(gained)}</span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {visibleMonths.length === 0 && (
              <tr>
                <td className="px-5 py-8 text-center text-sm text-slate-400" colSpan={2}>
                  Không có dữ liệu trong khoảng thời gian đã chọn
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
