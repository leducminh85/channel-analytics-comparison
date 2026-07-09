"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Eye, EyeOff, TrendingUp } from "lucide-react";
import { useState } from "react";

interface DailyStat {
  date_str: string;
  views: number;
  views_change: number;
  subscribers: number;
  subscribers_change: number;
}

interface ChannelWithStats {
  id: string;
  title: string;
  dailyStats: DailyStat[];
}

interface TooltipEntry {
  color?: string;
  name?: string;
  value?: number | string;
}

const COLORS = [
  "#6366f1",
  "#f43f5e",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#ef4444",
  "#84cc16",
];

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString("vi-VN");
}

function formatDate(dateStr: string): string {
  try {
    const timestamp = Number(dateStr);
    if (!isNaN(timestamp)) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    }

    return dateStr;
  } catch {
    return dateStr;
  }
}

function getDateKey(dateStr: string): string {
  const timestamp = Number(dateStr);
  if (!isNaN(timestamp)) {
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
  }

  return dateStr;
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
      <p className="mb-2 text-xs font-semibold text-slate-500">{formatDate(String(label ?? ""))}</p>
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

export default function ViewsChart({
  channels,
}: {
  channels: ChannelWithStats[];
}) {
  const [chartVisible, setChartVisible] = useState(true);
  const hasDailyStats = channels.some((channel) => channel.dailyStats.length > 0);

  if (channels.length === 0 || !hasDailyStats) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16">
        <div className="mb-3 rounded-full bg-slate-100 p-4">
          <TrendingUp className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-500">
          {"Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u \u0111\u1ec3 hi\u1ec3n th\u1ecb bi\u1ec3u \u0111\u1ed3"}
        </p>
      </div>
    );
  }

  const allDates = new Set<string>();
  channels.forEach((channel) => {
    channel.dailyStats.forEach((stat) => allDates.add(getDateKey(stat.date_str)));
  });
  const sortedDates = Array.from(allDates).sort();
  const recentDates = sortedDates.slice(-30);

  const chartData = recentDates.map((date) => {
    const entry: Record<string, string | number> = {
      date,
      formattedDate: formatDate(date)
    };
    channels.forEach((channel) => {
      const stat = channel.dailyStats.find((s) => getDateKey(s.date_str) === date);
      entry[channel.id] = Math.max(0, stat?.views_change ?? 0);
    });
    return entry;
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <TrendingUp className="h-4 w-4 text-indigo-500" />
          {"So s\u00e1nh Views t\u0103ng th\u00eam h\u00e0ng ng\u00e0y"}
        </h3>
        <button
          type="button"
          onClick={() => setChartVisible((visible) => !visible)}
          aria-label={chartVisible ? "Ẩn biểu đồ" : "Hiện biểu đồ"}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          title={chartVisible ? "Ẩn biểu đồ" : "Hiện biểu đồ"}
        >
          {chartVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {chartVisible && <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              tickFormatter={(value) => formatDate(value)}
              interval="preserveStartEnd"
              minTickGap={30}
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
            {channels.map((channel, index) => (
              <Line
                key={channel.id}
                type="monotone"
                dataKey={channel.id}
                name={channel.title}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>}
    </div>
  );
}
