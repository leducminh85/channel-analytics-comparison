"use client";

import Image from "next/image";
import { Calendar } from "lucide-react";

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
  if (channels.length === 0) return null;

  // Map: { "YYYY-MM": { channelId: gained } }
  const monthlyData: Record<string, Record<string, number>> = {};
  const allMonthsSet = new Set<string>();

  channels.forEach((channel) => {
    (channel.monthlyStats || []).forEach((stat) => {
      const monthKey = stat.month;
      allMonthsSet.add(monthKey);
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {};
      }
      monthlyData[monthKey][channel.id] = stat.views_gained;
    });
  });

  // Sort months descending (newest first)
  const sortedMonths = Array.from(allMonthsSet).sort((a, b) => b.localeCompare(a));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-8">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700">So sánh Views theo tháng (Gained)</h3>
        </div>
        {/* <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Lịch sử từ VidIQ</p> */}
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
            {sortedMonths.map((month) => (
              <tr key={month} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-4 font-semibold text-slate-700">
                  {formatMonthLabel(month)}
                </td>
                {channels.map((channel) => {
                  const gained = monthlyData[month]?.[channel.id] || 0;
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
