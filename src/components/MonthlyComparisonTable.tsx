"use client";

import Image from "next/image";
import { Calendar } from "lucide-react";

interface DailyStat {
  date_str: string;
  views_change: number;
}

interface ChannelWithStats {
  id: string;
  title: string;
  logo_url: string | null;
  dailyStats: DailyStat[];
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString("vi-VN");
}

function getMonthKey(dateStr: string): string {
  try {
    const timestamp = Number(dateStr);
    if (!isNaN(timestamp)) {
      const date = new Date(timestamp * 1000);
      return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
    }
    return "N/A";
  } catch {
    return "N/A";
  }
}

export default function MonthlyComparisonTable({
  channels,
}: {
  channels: ChannelWithStats[];
}) {
  if (channels.length === 0) return null;

  // Group views by month and channel
  // Structure: { "MM/YYYY": { channelId: { gained: number, total: number } } }
  const monthlyData: Record<string, Record<string, { gained: number, total: number }>> = {};
  const allMonthsSet = new Set<string>();

  channels.forEach((channel) => {
    // Sort daily stats ascending to get the total view at the end of the month correctly
    const sortedStats = [...channel.dailyStats].sort((a, b) => Number(a.date_str) - Number(b.date_str));
    
    sortedStats.forEach((stat) => {
      const monthKey = getMonthKey(stat.date_str);
      if (monthKey === "N/A") return;

      allMonthsSet.add(monthKey);
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {};
      }
      
      if (!monthlyData[monthKey][channel.id]) {
        monthlyData[monthKey][channel.id] = { gained: 0, total: 0 };
      }
      
      const viewsChange = stat.views_change || 0;
      if (viewsChange > 0) {
        monthlyData[monthKey][channel.id].gained += viewsChange;
      }
      // Total views at the end of the month is just the last entry's views
      monthlyData[monthKey][channel.id].total = stat.views;
    });
  });

  // Sort months descending (newest first)
  const sortedMonths = Array.from(allMonthsSet).sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return (yb * 12 + mb) - (ya * 12 + ma);
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-8">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700">So sánh Views theo tháng (Gained)</h3>
        </div>
        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Hiển thị tối đa 24 tháng</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                Tháng
              </th>
              {channels.map((channel) => (
                <th key={channel.id} className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-[120px]">
                  <div className="flex items-center justify-end gap-2">
                    {channel.logo_url && (
                      <div className="relative h-5 w-5 rounded-full overflow-hidden border border-slate-200">
                        <Image src={channel.logo_url} alt="" fill className="object-cover" />
                      </div>
                    )}
                    <span className="truncate max-w-[100px]">{channel.title}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedMonths.slice(0, 24).map((month) => (
              <tr key={month} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-4 font-semibold text-slate-700">
                  {month}
                </td>
                {channels.map((channel) => {
                  const data = monthlyData[month][channel.id];
                  const gained = data?.gained || 0;
                  return (
                    <td key={channel.id} className="px-5 py-4 text-right font-mono text-slate-600">
                      {gained > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="text-indigo-600 font-bold">+{formatNumber(gained)}</span>
                        </div>
                      ) : "0"}
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
