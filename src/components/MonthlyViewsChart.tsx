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
import { BarChart3, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface MonthlyStat {
  month: string;
  views_gained: number;
}

interface ChannelWithStats {
  id: string;
  title: string;
  monthlyStats: MonthlyStat[];
}

interface TooltipEntry {
  color?: string;
  name?: string;
  value?: number | string;
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

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <p className="mb-2 text-xs font-semibold text-slate-500">Tháng {label}</p>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={`${entry.name || "series"}-${index}`} className="flex items-center gap-2 text-xs">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-600">{entry.name}:</span>
            <span className="font-semibold text-slate-900">
              +{formatNumber(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MonthlyViewsChart({
  channels,
}: {
  channels: ChannelWithStats[];
}) {
  const [chartVisible, setChartVisible] = useState(true);

  if (channels.length === 0) return null;

  // Group views by month and channel
  const monthlyDataMap: Record<string, Record<string, number>> = {};
  const allMonthsSet = new Set<string>();

  channels.forEach((channel) => {
    (channel.monthlyStats || []).forEach((stat) => {
      const monthKey = stat.month;
      allMonthsSet.add(monthKey);
      if (!monthlyDataMap[monthKey]) monthlyDataMap[monthKey] = {};
      monthlyDataMap[monthKey][channel.id] = stat.views_gained;
    });
  });

  // Sort months ascending for chart (oldest to newest)
  const sortedMonths = Array.from(allMonthsSet).sort((a, b) => a.localeCompare(b));

  const chartData = sortedMonths.map((month) => ({
    month: formatMonthLabel(month),
    ...monthlyDataMap[month],
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mt-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          Biểu đồ Views theo tháng
        </h3>
        <button
          type="button"
          onClick={() => setChartVisible((visible) => !visible)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          title={chartVisible ? "Ẩn biểu đồ" : "Hiện biểu đồ"}
        >
          {chartVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {chartVisible ? "Ẩn" : "Hiện"}
        </button>
      </div>
      {chartVisible && <div className="h-[400px] w-full">
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
                dataKey={ch.id}
                name={ch.title}
                fill={COLORS[index % COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>}
    </div>
  );
}
