"use client";

import Image from "next/image";
import { Calendar } from "lucide-react";
import { useEffect, useRef } from "react";

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
}: {
  channels: ChannelWithStats[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to the right (newest months) on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [channels]);

  if (channels.length === 0) return null;

  // Get all unique months and sort them ascending (oldest to newest)
  const allMonthsSet = new Set<string>();
  channels.forEach((channel) => {
    (channel.monthlyStats || []).forEach((stat) => {
      allMonthsSet.add(stat.month);
    });
  });
  const sortedMonths = Array.from(allMonthsSet).sort((a, b) => a.localeCompare(b));

  // Map: { channelId: { month: gained } }
  const channelData: Record<string, Record<string, number>> = {};
  channels.forEach((channel) => {
    channelData[channel.id] = {};
    (channel.monthlyStats || []).forEach((stat) => {
      channelData[channel.id][stat.month] = stat.views_gained;
    });
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mt-8 w-full overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700">So sánh Views theo tháng (Gained)</h3>
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
              {sortedMonths.map((month) => (
                <th key={month} className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-[100px] border-r border-slate-100 last:border-r-0">
                  {formatMonthLabel(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => (
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
                {sortedMonths.map((month) => {
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
