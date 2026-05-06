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
import { TrendingUp } from "lucide-react";

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

// Color palette for chart lines
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

function formatDate(dateStr: string): string {
  try {
    // Handle Unix timestamps returned as strings.
    const timestamp = Number(dateStr);
    if (!isNaN(timestamp)) {
      // VidIQ timestamps are expected to be in seconds, not milliseconds.
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export default function ViewsChart({
  channels,
}: {
  channels: ChannelWithStats[];
}) {
  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16">
        <div className="mb-3 rounded-full bg-slate-100 p-4">
          <TrendingUp className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-500">
          ChÆ°a cÃ³ dá»¯ liá»‡u Ä‘á»ƒ hiá»ƒn thá»‹ biá»ƒu Ä‘á»“
        </p>
      </div>
    );
  }

  // Collect all unique dates across all channels and sort ascending
  const allDates = new Set<string>();
  channels.forEach((ch) => {
    ch.dailyStats.forEach((stat) => allDates.add(stat.date_str));
  });
  const sortedDates = Array.from(allDates).sort();

  // Build chart data: each entry has a date and one metric per channel
  const chartData = sortedDates.map((date) => {
    const entry: Record<string, string | number> = {
      date,
      formattedDate: formatDate(date)
    };
    channels.forEach((ch) => {
      const stat = ch.dailyStats.find((s) => s.date_str === date);
      entry[ch.id] = stat?.views_change ?? 0;
    });
    return entry;
  });

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        <p className="mb-2 text-xs font-semibold text-slate-500">{formatDate(label)}</p>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <TrendingUp className="h-4 w-4 text-indigo-500" />
        So sÃ¡nh Views tÄƒng thÃªm hÃ ng ngÃ y
      </h3>
      <div className="h-[400px] w-full">
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
              tickFormatter={(val) => formatDate(val)}
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
            {channels.map((ch, index) => (
              <Line
                key={ch.id}
                type="monotone"
                dataKey={ch.id}
                name={ch.title}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
