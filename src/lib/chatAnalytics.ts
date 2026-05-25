import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type ChatMetric = "totalViews" | "views30Days" | "subscribers" | "videos";

export type MonthlyComparisonInput = {
  month?: string;
  startMonth?: string;
  endMonth?: string;
};

export type ChatDatabaseContextOptions = {
  dailyLimit?: number;
  monthlyLimit?: number;
  channelLimit?: number;
};

const metricLabels: Record<ChatMetric, string> = {
  totalViews: "tong views",
  views30Days: "views 30 ngay",
  subscribers: "subscriber",
  videos: "so video",
};

type GroupChannelRecord = {
  id: string;
  channelId: string;
  title: string;
  totalViews: bigint;
  views30Days: bigint;
  subscribers: number;
  videos: number;
  dailyStatsCount: number;
  monthlyStatsCount: number;
};

type DailyStatRecord = {
  date_str: string;
  views: bigint;
  views_change: bigint;
  subscribers: number;
  subscribers_change: number;
};

type MonthlyStatRecord = {
  month: string;
  views_gained: bigint;
  total_views: bigint;
  subscribers: number;
  subscribers_change: number;
};

function toBigInt(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") return value;
  return BigInt(value ?? 0);
}

function compareBigInt(a: bigint, b: bigint) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function formatExact(value: bigint | number) {
  return value.toLocaleString("vi-VN");
}

function formatCompact(value: bigint | number) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return formatExact(value);
  if (Math.abs(normalized) >= 1_000_000_000) return `${(normalized / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(normalized) >= 1_000_000) return `${(normalized / 1_000_000).toFixed(1)}M`;
  if (Math.abs(normalized) >= 1_000) return `${(normalized / 1_000).toFixed(1)}K`;
  return formatExact(normalized);
}

function serializeBigInt(value: bigint | number) {
  return metricValue(value);
}

function metricValue(value: bigint | number) {
  const normalized = toBigInt(value);
  return {
    value: normalized.toString(),
    formattedValue: formatExact(normalized),
    compactValue: formatCompact(normalized),
  };
}

function averageBigInt(total: bigint, count: number) {
  if (count <= 0) return metricValue(0);
  return metricValue(total / BigInt(count));
}

function getMetricValue(channel: GroupChannelRecord, metric: ChatMetric) {
  if (metric === "totalViews") return channel.totalViews;
  if (metric === "views30Days") return channel.views30Days;
  if (metric === "subscribers") return BigInt(channel.subscribers);
  return BigInt(channel.videos);
}

function source(groupId: string, channelCount: number, dataScopes: string[]) {
  return {
    groupId,
    channelCount,
    dataScopes,
    generatedAt: new Date().toISOString(),
  };
}

function missingData(channels: GroupChannelRecord[], extra?: Record<string, string[]>) {
  return {
    dailyStats: channels
      .filter((channel) => channel.dailyStatsCount === 0)
      .map((channel) => channel.title),
    monthlyStats: channels
      .filter((channel) => channel.monthlyStatsCount === 0)
      .map((channel) => channel.title),
    ...extra,
  };
}

function rankedRows(channels: GroupChannelRecord[], metric: ChatMetric, limit = channels.length) {
  return [...channels]
    .sort((a, b) => compareBigInt(getMetricValue(b, metric), getMetricValue(a, metric)))
    .slice(0, limit)
    .map((channel, index) => ({
      rank: index + 1,
      channelTitle: channel.title,
      metric,
      metricLabel: metricLabels[metric],
      ...metricValue(getMetricValue(channel, metric)),
    }));
}

function dateRange(dates: string[]) {
  if (dates.length === 0) return null;
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  return {
    start: sortedDates[0],
    end: sortedDates[sortedDates.length - 1],
  };
}

function normalizeTitle(title: string) {
  return title.trim().toLocaleLowerCase("vi-VN");
}

async function getGroupChannels(groupId: string): Promise<GroupChannelRecord[]> {
  const groupChannels = await prisma.groupChannel.findMany({
    where: { groupId },
    orderBy: { assignedAt: "asc" },
    select: {
      channel: {
        select: {
          id: true,
          channel_id: true,
          title: true,
          viewCount: true,
          views30Days: true,
          subscriberCount: true,
          videoCount: true,
          _count: {
            select: {
              dailyStats: true,
              monthlyStats: true,
            },
          },
        },
      },
    },
  });

  return groupChannels.map(({ channel }) => ({
    id: channel.id,
    channelId: channel.channel_id,
    title: channel.title,
    totalViews: channel.viewCount,
    views30Days: channel.views30Days,
    subscribers: channel.subscriberCount,
    videos: channel.videoCount,
    dailyStatsCount: channel._count.dailyStats,
    monthlyStatsCount: channel._count.monthlyStats,
  }));
}

async function findChannel(groupId: string, requestedTitle: string) {
  const channels = await getGroupChannels(groupId);
  const normalizedTitle = normalizeTitle(requestedTitle);
  const exactMatch = channels.find((channel) => normalizeTitle(channel.title) === normalizedTitle);

  if (exactMatch) return { status: "found" as const, channels, channel: exactMatch };

  const partialMatches = channels.filter((channel) =>
    normalizeTitle(channel.title).includes(normalizedTitle)
  );

  if (partialMatches.length === 1) {
    return { status: "found" as const, channels, channel: partialMatches[0] };
  }

  if (partialMatches.length > 1) {
    return {
      status: "ambiguous" as const,
      channels,
      candidates: partialMatches.map((channel) => channel.title),
    };
  }

  return { status: "not_found" as const, channels };
}

export async function getGroupAnalyticsSummary(groupId: string) {
  const channels = await getGroupChannels(groupId);
  const totals = channels.reduce(
    (acc, channel) => ({
      totalViews: acc.totalViews + channel.totalViews,
      views30Days: acc.views30Days + channel.views30Days,
      subscribers: acc.subscribers + BigInt(channel.subscribers),
      videos: acc.videos + BigInt(channel.videos),
    }),
    {
      totalViews: BigInt(0),
      views30Days: BigInt(0),
      subscribers: BigInt(0),
      videos: BigInt(0),
    }
  );

  return {
    computed: {
      channelCount: channels.length,
      totals: {
        totalViews: metricValue(totals.totalViews),
        views30Days: metricValue(totals.views30Days),
        subscribers: metricValue(totals.subscribers),
        videos: metricValue(totals.videos),
      },
      rankings: {
        totalViews: rankedRows(channels, "totalViews"),
        views30Days: rankedRows(channels, "views30Days"),
        subscribers: rankedRows(channels, "subscribers"),
        videos: rankedRows(channels, "videos"),
      },
      channels: channels.map((channel) => ({
        channelTitle: channel.title,
        totalViews: metricValue(channel.totalViews),
        views30Days: metricValue(channel.views30Days),
        subscribers: metricValue(channel.subscribers),
        videos: metricValue(channel.videos),
        dailyStatsCount: channel.dailyStatsCount,
        monthlyStatsCount: channel.monthlyStatsCount,
      })),
    },
    source: source(groupId, channels.length, ["channels", "daily_stats_count", "monthly_stats_count"]),
    missingData: missingData(channels),
  };
}

export async function getGroupDatabaseContext(
  groupId: string,
  options: ChatDatabaseContextOptions = {}
) {
  const dailyLimit = Math.min(Math.max(options.dailyLimit ?? 30, 1), 400);
  const monthlyLimit = Math.min(Math.max(options.monthlyLimit ?? 24, 1), 60);
  const channelLimit = Math.min(Math.max(options.channelLimit ?? 50, 1), 100);
  const summary = await getGroupAnalyticsSummary(groupId);

  const groupChannels = await prisma.groupChannel.findMany({
    where: { groupId },
    orderBy: { assignedAt: "asc" },
    take: channelLimit,
    select: {
      assignedAt: true,
      channel: {
        select: {
          id: true,
          channel_id: true,
          channel_url: true,
          title: true,
          logo_url: true,
          subscriberCount: true,
          videoCount: true,
          viewCount: true,
          uploadFrequency: true,
          views30Days: true,
          createdAt: true,
          updatedAt: true,
          dailyStats: {
            orderBy: { date_str: "desc" },
            take: dailyLimit,
            select: {
              date_str: true,
              views: true,
              views_change: true,
              subscribers: true,
              subscribers_change: true,
            },
          },
          monthlyStats: {
            orderBy: { month: "desc" },
            take: monthlyLimit,
            select: {
              month: true,
              views_gained: true,
              total_views: true,
              subscribers: true,
              subscribers_change: true,
            },
          },
        },
      },
    },
  });

  const availableDailyDates = Array.from(
    new Set(
      groupChannels.flatMap(({ channel }) => channel.dailyStats.map((stat) => stat.date_str))
    )
  ).sort((a, b) => b.localeCompare(a));
  const availableMonths = Array.from(
    new Set(
      groupChannels.flatMap(({ channel }) => channel.monthlyStats.map((stat) => stat.month))
    )
  ).sort((a, b) => b.localeCompare(a));

  return {
    source: {
      groupId,
      generatedAt: new Date().toISOString(),
      channelCountInContext: groupChannels.length,
      limits: {
        dailyStatsPerChannel: dailyLimit,
        monthlyStatsPerChannel: monthlyLimit,
        channels: channelLimit,
      },
    },
    schema: {
      channels:
        "Thong tin kenh YouTube. viewCount la tong views hien tai, views30Days la views tang trong 30 ngay gan nhat.",
      dailyStats:
        "Thong ke theo ngay cua tung kenh. date_str la Unix timestamp dang string; views la tong views tai ngay do; views_change la views tang them trong ngay.",
      monthlyStats:
        "Thong ke theo thang cua tung kenh. month co format YYYY-MM; views_gained la views tang them trong thang; total_views la tong views luy ke tai moc thang.",
    },
    metricDefinitions: {
      totalViews: "channels.viewCount",
      views30Days: "channels.views30Days",
      dailyViewsGained: "daily_stats.views_change",
      monthlyViewsGained: "monthly_stats.views_gained",
      subscribers: "channels.subscriberCount hoac monthly_stats.subscribers theo moc thang",
    },
    summary: summary.computed,
    missingData: summary.missingData,
    availableDailyDates,
    availableMonths,
    channels: groupChannels.map(({ assignedAt, channel }) => ({
      id: channel.id,
      youtubeChannelId: channel.channel_id,
      title: channel.title,
      url: channel.channel_url,
      logoUrl: channel.logo_url,
      assignedAt: assignedAt.toISOString(),
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
      uploadFrequency: channel.uploadFrequency,
      metrics: {
        totalViews: serializeBigInt(channel.viewCount),
        views30Days: serializeBigInt(channel.views30Days),
        subscribers: serializeBigInt(channel.subscriberCount),
        videos: serializeBigInt(channel.videoCount),
      },
      dailyStats: channel.dailyStats.map((stat) => ({
        date_str: stat.date_str,
        views: serializeBigInt(stat.views),
        views_change: serializeBigInt(stat.views_change),
        subscribers: serializeBigInt(stat.subscribers),
        subscribers_change: serializeBigInt(stat.subscribers_change),
      })),
      monthlyStats: channel.monthlyStats.map((stat) => ({
        month: stat.month,
        views_gained: serializeBigInt(stat.views_gained),
        total_views: serializeBigInt(stat.total_views),
        subscribers: serializeBigInt(stat.subscribers),
        subscribers_change: serializeBigInt(stat.subscribers_change),
      })),
    })),
  };
}

export async function rankChannels(groupId: string, metric: ChatMetric, limit = 5) {
  const channels = await getGroupChannels(groupId);
  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const rows = rankedRows(channels, metric, safeLimit);

  return {
    computed: {
      metric,
      metricLabel: metricLabels[metric],
      direction: "desc",
      totalChannels: channels.length,
      winner: rows[0] ?? null,
      rows,
    },
    source: source(groupId, channels.length, ["channels"]),
    missingData: missingData(channels),
  };
}

export async function compareDailyViews(groupId: string, days = 30) {
  const safeDays = Math.min(Math.max(days, 1), 400);
  const groupChannels = await prisma.groupChannel.findMany({
    where: { groupId },
    orderBy: { assignedAt: "asc" },
    select: {
      channel: {
        select: {
          id: true,
          channel_id: true,
          title: true,
          viewCount: true,
          views30Days: true,
          subscriberCount: true,
          videoCount: true,
          dailyStats: {
            orderBy: { date_str: "desc" },
            take: safeDays,
            select: {
              date_str: true,
              views: true,
              views_change: true,
              subscribers: true,
              subscribers_change: true,
            },
          },
          _count: {
            select: {
              dailyStats: true,
              monthlyStats: true,
            },
          },
        },
      },
    },
  });

  const channels: GroupChannelRecord[] = groupChannels.map(({ channel }) => ({
    id: channel.id,
    channelId: channel.channel_id,
    title: channel.title,
    totalViews: channel.viewCount,
    views30Days: channel.views30Days,
    subscribers: channel.subscriberCount,
    videos: channel.videoCount,
    dailyStatsCount: channel._count.dailyStats,
    monthlyStatsCount: channel._count.monthlyStats,
  }));

  const rows = groupChannels
    .map(({ channel }) => {
      const stats = channel.dailyStats as DailyStatRecord[];
      const totalViewsGained = stats.reduce(
        (sum, stat) => sum + stat.views_change,
        BigInt(0)
      );
      const bestDay = stats.reduce<DailyStatRecord | null>((best, stat) => {
        if (!best) return stat;
        return stat.views_change > best.views_change ? stat : best;
      }, null);

      return {
        channelTitle: channel.title,
        requestedDays: safeDays,
        availableDays: stats.length,
        dateRange: dateRange(stats.map((stat) => stat.date_str)),
        totalViewsGained: metricValue(totalViewsGained),
        averageDailyViewsGained: averageBigInt(totalViewsGained, stats.length),
        bestDay: bestDay
          ? {
              date: bestDay.date_str,
              viewsGained: metricValue(bestDay.views_change),
            }
          : null,
      };
    })
    .sort((a, b) => compareBigInt(BigInt(b.totalViewsGained.value), BigInt(a.totalViewsGained.value)))
    .map((row, index) => ({ rank: index + 1, ...row }));

  const allDates = groupChannels.flatMap(({ channel }) =>
    channel.dailyStats.map((stat) => stat.date_str)
  );
  const totalViewsGained = rows.reduce(
    (sum, row) => sum + BigInt(row.totalViewsGained.value),
    BigInt(0)
  );

  return {
    computed: {
      requestedDays: safeDays,
      dateRange: dateRange(allDates),
      totalViewsGained: metricValue(totalViewsGained),
      rows,
      leader: rows[0] ?? null,
    },
    source: source(groupId, channels.length, ["daily_stats.views_change"]),
    missingData: missingData(channels, {
      partialDailyStats: rows
        .filter((row) => row.availableDays > 0 && row.availableDays < safeDays)
        .map((row) => row.channelTitle),
    }),
  };
}

function normalizeMonthlyInput(input: MonthlyComparisonInput) {
  if (input.month) {
    return {
      month: input.month,
      startMonth: input.month,
      endMonth: input.month,
      note: undefined,
    };
  }

  let startMonth = input.startMonth;
  let endMonth = input.endMonth;
  let note: string | undefined;

  if (startMonth && endMonth && startMonth > endMonth) {
    [startMonth, endMonth] = [endMonth, startMonth];
    note = "startMonth va endMonth da duoc hoan doi vi dau vao nguoc thu tu.";
  }

  return {
    month: undefined,
    startMonth,
    endMonth,
    note,
  };
}

function monthlyWhere(input: ReturnType<typeof normalizeMonthlyInput>) {
  if (input.month) {
    return { month: input.month } satisfies Prisma.MonthlyStatWhereInput;
  }

  const monthFilter: Prisma.StringFilter = {};
  if (input.startMonth) monthFilter.gte = input.startMonth;
  if (input.endMonth) monthFilter.lte = input.endMonth;

  if (Object.keys(monthFilter).length === 0) return undefined;
  return { month: monthFilter } satisfies Prisma.MonthlyStatWhereInput;
}

export async function compareMonthlyViews(groupId: string, input: MonthlyComparisonInput = {}) {
  const normalizedInput = normalizeMonthlyInput(input);
  const where = monthlyWhere(normalizedInput);
  const monthlyStatsSelection = {
    orderBy: { month: "desc" as const },
    select: {
      month: true,
      views_gained: true,
      total_views: true,
      subscribers: true,
      subscribers_change: true,
    },
  };

  const groupChannels = await prisma.groupChannel.findMany({
    where: { groupId },
    orderBy: { assignedAt: "asc" },
    select: {
      channel: {
        select: {
          id: true,
          channel_id: true,
          title: true,
          viewCount: true,
          views30Days: true,
          subscriberCount: true,
          videoCount: true,
          monthlyStats: where
            ? {
                ...monthlyStatsSelection,
                where,
              }
            : monthlyStatsSelection,
          _count: {
            select: {
              dailyStats: true,
              monthlyStats: true,
            },
          },
        },
      },
    },
  });

  const channels: GroupChannelRecord[] = groupChannels.map(({ channel }) => ({
    id: channel.id,
    channelId: channel.channel_id,
    title: channel.title,
    totalViews: channel.viewCount,
    views30Days: channel.views30Days,
    subscribers: channel.subscriberCount,
    videos: channel.videoCount,
    dailyStatsCount: channel._count.dailyStats,
    monthlyStatsCount: channel._count.monthlyStats,
  }));

  const availableMonths = Array.from(
    new Set(groupChannels.flatMap(({ channel }) => channel.monthlyStats.map((stat) => stat.month)))
  ).sort((a, b) => a.localeCompare(b));

  const selectedMonths = (() => {
    if (normalizedInput.month) return [normalizedInput.month];
    if (normalizedInput.startMonth || normalizedInput.endMonth) return availableMonths;
    const latestMonth = availableMonths[availableMonths.length - 1];
    return latestMonth ? [latestMonth] : [];
  })();

  const selectedMonthSet = new Set(selectedMonths);
  const rows = groupChannels
    .map(({ channel }) => {
      const stats = (channel.monthlyStats as MonthlyStatRecord[]).filter((stat) =>
        selectedMonthSet.has(stat.month)
      );
      const viewsGained = stats.reduce((sum, stat) => sum + stat.views_gained, BigInt(0));
      const subscribersChange = stats.reduce(
        (sum, stat) => sum + BigInt(stat.subscribers_change),
        BigInt(0)
      );

      return {
        channelTitle: channel.title,
        selectedMonths,
        contributingMonths: stats.map((stat) => stat.month).sort((a, b) => a.localeCompare(b)),
        viewsGained: metricValue(viewsGained),
        subscribersChange: metricValue(subscribersChange),
      };
    })
    .sort((a, b) => compareBigInt(BigInt(b.viewsGained.value), BigInt(a.viewsGained.value)))
    .map((row, index) => ({ rank: index + 1, ...row }));

  const totalViewsGained = rows.reduce(
    (sum, row) => sum + BigInt(row.viewsGained.value),
    BigInt(0)
  );
  const answerRows = rows.map((row) => ({
    rank: row.rank,
    channelTitle: row.channelTitle,
    viewsGained: row.viewsGained,
    contributingMonths: row.contributingMonths,
  }));

  return {
    computed: {
      monthlyMetric: "viewsGained",
      answerRows,
      leader: answerRows[0] ?? null,
      groupTotalViewsGained: metricValue(totalViewsGained),
      requestedMonth: normalizedInput.month ?? null,
      requestedRange: {
        startMonth: normalizedInput.startMonth ?? null,
        endMonth: normalizedInput.endMonth ?? null,
      },
      selectedMonths,
      note: normalizedInput.note ?? null,
      hasData:
        selectedMonths.length > 0 &&
        rows.some((row) => BigInt(row.viewsGained.value) > BigInt(0)),
      rows,
    },
    source: source(groupId, channels.length, ["monthly_stats.views_gained"]),
    missingData: missingData(channels, {
      monthlyStatsForSelection: rows
        .filter((row) => row.contributingMonths.length === 0)
        .map((row) => row.channelTitle),
      partialMonthlyStats: rows
        .filter(
          (row) =>
            row.contributingMonths.length > 0 &&
            row.contributingMonths.length < selectedMonths.length
        )
        .map((row) => row.channelTitle),
    }),
  };
}

export async function getChannelTrend(groupId: string, channelTitle: string, days = 30, months = 6) {
  const match = await findChannel(groupId, channelTitle);

  if (match.status !== "found") {
    return {
      computed: {
        found: false,
        requestedChannelTitle: channelTitle,
        status: match.status,
        candidates: match.status === "ambiguous" ? match.candidates : [],
        message:
          match.status === "ambiguous"
            ? "Tim thay nhieu kenh trung mot phan ten, can hoi lai ten kenh chinh xac."
            : "Khong tim thay kenh nay trong compare group hien tai.",
      },
      source: source(groupId, match.channels.length, ["channels"]),
      missingData: missingData(match.channels),
    };
  }

  const safeDays = Math.min(Math.max(days, 1), 400);
  const safeMonths = Math.min(Math.max(months, 1), 24);
  const channel = await prisma.channel.findFirst({
    where: {
      id: match.channel.id,
      groups: {
        some: { groupId },
      },
    },
    select: {
      title: true,
      viewCount: true,
      views30Days: true,
      subscriberCount: true,
      videoCount: true,
      dailyStats: {
        orderBy: { date_str: "desc" },
        take: safeDays,
        select: {
          date_str: true,
          views: true,
          views_change: true,
          subscribers: true,
          subscribers_change: true,
        },
      },
      monthlyStats: {
        orderBy: { month: "desc" },
        take: safeMonths,
        select: {
          month: true,
          views_gained: true,
          total_views: true,
          subscribers: true,
          subscribers_change: true,
        },
      },
    },
  });

  if (!channel) {
    return {
      computed: {
        found: false,
        requestedChannelTitle: channelTitle,
        status: "not_found",
        candidates: [],
        message: "Khong tim thay kenh nay trong compare group hien tai.",
      },
      source: source(groupId, match.channels.length, ["channels"]),
      missingData: missingData(match.channels),
    };
  }

  const dailyStats = channel.dailyStats as DailyStatRecord[];
  const monthlyStats = channel.monthlyStats as MonthlyStatRecord[];
  const dailyViewsGained = dailyStats.reduce(
    (sum, stat) => sum + stat.views_change,
    BigInt(0)
  );
  const bestDailyStat = dailyStats.reduce<DailyStatRecord | null>((best, stat) => {
    if (!best) return stat;
    return stat.views_change > best.views_change ? stat : best;
  }, null);

  return {
    computed: {
      found: true,
      channelTitle: channel.title,
      totals: {
        totalViews: metricValue(channel.viewCount),
        views30Days: metricValue(channel.views30Days),
        subscribers: metricValue(channel.subscriberCount),
        videos: metricValue(channel.videoCount),
      },
      dailyWindow: {
        requestedDays: safeDays,
        availableDays: dailyStats.length,
        dateRange: dateRange(dailyStats.map((stat) => stat.date_str)),
        viewsGained: metricValue(dailyViewsGained),
        averageDailyViewsGained: averageBigInt(dailyViewsGained, dailyStats.length),
        bestDay: bestDailyStat
          ? {
              date: bestDailyStat.date_str,
              viewsGained: metricValue(bestDailyStat.views_change),
            }
          : null,
      },
      recentMonthly: monthlyStats.map((stat) => ({
        month: stat.month,
        viewsGained: metricValue(stat.views_gained),
        totalViews: metricValue(stat.total_views),
        subscribers: metricValue(stat.subscribers),
        subscribersChange: metricValue(stat.subscribers_change),
      })),
    },
    source: source(groupId, match.channels.length, ["channels", "daily_stats", "monthly_stats"]),
    missingData: missingData(match.channels, {
      dailyStatsForSelection: dailyStats.length === 0 ? [channel.title] : [],
      monthlyStatsForSelection: monthlyStats.length === 0 ? [channel.title] : [],
    }),
  };
}
