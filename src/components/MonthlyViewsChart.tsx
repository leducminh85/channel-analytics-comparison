"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";

interface DailyStat {
  date_str: string;
  views_change: number;
}

interface ChannelWithStats {
  id: string;
  title: string;
  dailyStats: DailyStat[];
}

const COLORS = [
  "#6366f1", // indigo
  "#f43f5e", // rose
  "#10b981", // emerald
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#ef4444", // red
  "#84cc16", // lime
];

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

export default function MonthlyViewsChart({
  channels,
}: {
  channels: ChannelWithStats[];
}) {
  if (channels.length === 0) return null;

  // Group views by month and channel
  const monthlyDataMap: Record<string, Record<string, number>> = {};
  const allMonthsSet = new Set<string>();

  channels.forEach((channel) => {
    channel.dailyStats.forEach((stat) => {
      const monthKey = getMonthKey(stat.date_str);
      if (monthKey === "N/A") return;
      allMonthsSet.add(monthKey);
      if (!monthlyDataMap[monthKey]) monthlyDataMap[monthKey] = {};
      monthlyDataMap[monthKey][channel.title] = (monthlyDataMap[monthKey][channel.title] || 0) + stat.views_change;
    });
  });

  // Sort months ascending for chart
  const sortedMonths = Array.from(allMonthsSet).sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return (ya * 12 + ma) - (yb * 12 + mb);
  });

  const chartData = sortedMonths.map((month) => ({
    month,
    ...monthlyDataMap[month],
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        <p className="mb-2 text-xs font-semibold text-slate-500">Tháng {label}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-600">{entry.name}:</span>
              <span className="font-semibold text-slate-900">
                +{formatNumber(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mt-8">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <BarChart3 className="h-4 w-4 text-indigo-500" />
        Biểu đồ Views theo tháng
      </h3>
      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatNumber(value)}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
              iconType="circle"
              iconSize={8}
            />
            {channels.map((ch, index) => (
              <Bar
                key={ch.id}
                dataKey={ch.title}
                fill={COLORS[index % COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
