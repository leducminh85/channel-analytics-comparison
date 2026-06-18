"use server";

import prisma from "@/lib/prisma";
import { getChannelIdFromUrl, getChannelStats, getUploadFrequency } from "@/lib/services/youtube";
import { getVidiqStats } from "@/lib/services/vidiq";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { getSessionUserId, requireGroupAccess } from "@/lib/groupAccess";
import type { Prisma } from "@prisma/client";

const CHANNEL_IMPORT_BATCH_DELAY_MS = 3000;
const CHANNEL_ADMIN_UPDATE_BATCH_DELAY_MS = 60 * 1000;
const CHANNEL_ADMIN_UPDATE_BATCH_JITTER_MS = 30 * 1000;
const CHANNEL_UPDATE_DATE_TIME_ZONE = process.env.CHANNEL_UPDATE_DATE_TIME_ZONE ?? "Asia/Ho_Chi_Minh";
const ADMIN_CHANNELS_PAGE_SIZE = 25;

type ChannelWriteClient = Pick<Prisma.TransactionClient, "channel" | "dailyStat" | "groupChannel" | "monthlyStat">;
type ChannelUpdateStatus = "SUCCESS" | "YOUTUBE_FAILED" | "VIDIQ_FAILED";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAdminBatchDelayMs() {
  return CHANNEL_ADMIN_UPDATE_BATCH_DELAY_MS + Math.floor(Math.random() * CHANNEL_ADMIN_UPDATE_BATCH_JITTER_MS);
}

function getDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getChannelUpdateDateKey(date: Date) {
  try {
    return getDateKey(date, CHANNEL_UPDATE_DATE_TIME_ZONE);
  } catch {
    return getDateKey(date, "UTC");
  }
}

function wasUpdatedToday(updatedAt: Date) {
  return getChannelUpdateDateKey(updatedAt) === getChannelUpdateDateKey(new Date());
}

function wasFullyUpdatedToday(channel: {
  updatedAt: Date;
  youtubeUpdatedAt?: Date | null;
  vidiqUpdatedAt?: Date | null;
}) {
  const youtubeUpdatedAt = channel.youtubeUpdatedAt ?? channel.updatedAt;
  return wasUpdatedToday(youtubeUpdatedAt) && Boolean(channel.vidiqUpdatedAt && wasUpdatedToday(channel.vidiqUpdatedAt));
}

function getErrorLog(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

function logChannelImport(level: "info" | "warn" | "error", event: string, data: Record<string, unknown>) {
  const payload = {
    event,
    at: new Date().toISOString(),
    ...data,
  };

  if (level === "error") {
    console.error("[ChannelImport]", payload);
  } else if (level === "warn") {
    console.warn("[ChannelImport]", payload);
  } else {
    console.info("[ChannelImport]", payload);
  }
}

export type ChannelImportPreviewStatus =
  | "ready"
  | "existing"
  | "already-in-group"
  | "duplicate"
  | "invalid";

export interface ChannelImportPreviewItem {
  input: string;
  normalizedUrl: string | null;
  status: ChannelImportPreviewStatus;
  message: string;
  channelId?: string;
  channelTitle?: string;
}

export interface ChannelImportResultItem {
  input: string;
  status: "added" | "skipped" | "failed";
  message: string;
  channelId?: string;
}

type ChannelForAdmin = {
  id: string;
  channel_id: string;
  channel_url: string;
  title: string;
  logo_url: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: bigint;
  uploadFrequency: string | null;
  views30Days: bigint;
  createdAt: Date;
  updatedAt: Date;
  youtubeUpdatedAt: Date | null;
  vidiqUpdatedAt: Date | null;
  lastUpdateAttemptAt: Date | null;
  lastUpdateStatus: string | null;
  _count?: {
    groups: number;
  };
};

async function checkAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string } | undefined)?.role !== "ADMIN") {
    throw new Error("Không có quyền truy cập");
  }
}

async function checkGroupEditor(groupId: string) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) throw new Error("Không có quyền");

  await requireGroupAccess(groupId, userId, ["OWNER", "EDITOR"]);
}

function serializeAdminChannel(channel: ChannelForAdmin) {
  return {
    id: channel.id,
    channel_id: channel.channel_id,
    channel_url: channel.channel_url,
    title: channel.title,
    logo_url: channel.logo_url,
    subscriberCount: channel.subscriberCount,
    videoCount: channel.videoCount,
    viewCount: Number(channel.viewCount),
    uploadFrequency: channel.uploadFrequency,
    views30Days: Number(channel.views30Days),
    groupsCount: channel._count?.groups ?? 0,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    youtubeUpdatedAt: channel.youtubeUpdatedAt?.toISOString() ?? null,
    vidiqUpdatedAt: channel.vidiqUpdatedAt?.toISOString() ?? null,
    lastUpdateAttemptAt: channel.lastUpdateAttemptAt?.toISOString() ?? null,
    lastUpdateStatus: channel.lastUpdateStatus,
  };
}

function normalizeYoutubeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

function isPotentialYoutubeChannelUrl(url: string) {
  const normalizedUrl = normalizeYoutubeUrl(url);

  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host !== "youtube.com" && host !== "m.youtube.com") return false;
    return Boolean(
      parsed.pathname.match(/^\/channel\/UC[a-zA-Z0-9_-]{22}$/) ||
        parsed.pathname.match(/^\/@[a-zA-Z0-9._-]+$/)
    );
  } catch {
    return false;
  }
}

async function findExistingChannelFromUrl(url: string) {
  const normalizedUrl = normalizeYoutubeUrl(url);
  const channelIdMatch = normalizedUrl.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);

  if (channelIdMatch) {
    const existingById = await prisma.channel.findUnique({
      where: { channel_id: channelIdMatch[1] },
    });
    if (existingById) return existingById;
  }

  const handleMatch = normalizedUrl.match(/@([a-zA-Z0-9._-]+)/);
  const handle = handleMatch?.[1];

  return prisma.channel.findFirst({
    where: {
      OR: [
        { channel_url: normalizedUrl },
        { channel_url: `${normalizedUrl}/` },
        ...(handle ? [{ channel_url: { contains: `@${handle}` } }] : []),
      ],
    },
  });
}

async function linkChannelToGroup(channelId: string, groupId: string, db: ChannelWriteClient = prisma) {
  return db.groupChannel.upsert({
    where: {
      groupId_channelId: {
        groupId,
        channelId,
      },
    },
    update: {},
    create: {
      groupId,
      channelId,
    },
  });
}

async function persistVidiqStats(
  db: ChannelWriteClient,
  channelId: string,
  vidiqData: Awaited<ReturnType<typeof getVidiqStats>>
) {
  for (const stat of vidiqData.dailyStats) {
    await db.dailyStat.upsert({
      where: {
        channelId_date_str: {
          channelId,
          date_str: String(stat.date_str),
        },
      },
      update: {
        views: stat.views,
        views_change: stat.views_change,
        subscribers: stat.subscribers,
        subscribers_change: stat.subscribers_change,
      },
      create: {
        channelId,
        date_str: String(stat.date_str),
        views: stat.views,
        views_change: stat.views_change,
        subscribers: stat.subscribers,
        subscribers_change: stat.subscribers_change,
      },
    });
  }

  for (const monthlyStat of vidiqData.monthlyStats) {
    await db.monthlyStat.upsert({
      where: {
        channelId_month: {
          channelId,
          month: monthlyStat.month,
        },
      },
      update: {
        views_gained: monthlyStat.views_gained,
        total_views: monthlyStat.total_views_at_end,
        subscribers: monthlyStat.subscribers,
        subscribers_change: monthlyStat.subscribers_change,
      },
      create: {
        channelId,
        month: monthlyStat.month,
        views_gained: monthlyStat.views_gained,
        total_views: monthlyStat.total_views_at_end,
        subscribers: monthlyStat.subscribers,
        subscribers_change: monthlyStat.subscribers_change,
      },
    });
  }
}

async function recordChannelUpdateFailure(channelId: string, attemptedAt: Date, status: Exclude<ChannelUpdateStatus, "SUCCESS">) {
  await prisma.$executeRaw`
    UPDATE "channels"
    SET "lastUpdateAttemptAt" = ${attemptedAt},
        "lastUpdateStatus" = ${status}
    WHERE "id" = ${channelId}
  `;
}

async function revalidateChannelUsage(channelId: string) {
  const groupLinks = await prisma.groupChannel.findMany({
    where: { channelId },
    select: { groupId: true },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  for (const link of groupLinks) {
    revalidatePath(`/group/${link.groupId}`);
  }
}

async function refreshChannelData(channel: {
  id: string;
  channel_id: string;
  channel_url: string;
  views30Days: bigint;
  updatedAt: Date;
  youtubeUpdatedAt?: Date | null;
  vidiqUpdatedAt?: Date | null;
}) {
  const attemptedAt = new Date();
  let youtubeStats: Awaited<ReturnType<typeof getChannelStats>>;
  let uploadFreq: Awaited<ReturnType<typeof getUploadFrequency>>;

  try {
    [youtubeStats, uploadFreq] = await Promise.all([
      getChannelStats(channel.channel_id),
      getUploadFrequency(channel.channel_id),
    ]);
  } catch (youtubeError) {
    await recordChannelUpdateFailure(channel.id, attemptedAt, "YOUTUBE_FAILED");
    throw youtubeError;
  }

  let vidiqData: Awaited<ReturnType<typeof getVidiqStats>> | null = null;
  const shouldFetchVidiq = !channel.vidiqUpdatedAt || !wasUpdatedToday(channel.vidiqUpdatedAt);

  if (shouldFetchVidiq) {
    try {
      vidiqData = await getVidiqStats(channel.channel_id);
    } catch (vidiqError) {
      console.error("VidIQ fetch failed while refreshing channel:", vidiqError);

      const updatedChannel = await prisma.channel.update({
        where: { id: channel.id },
        data: {
          title: youtubeStats.title,
          logo_url: youtubeStats.logo_url,
          subscriberCount: youtubeStats.subscriberCount,
          videoCount: youtubeStats.videoCount,
          viewCount: youtubeStats.viewCount,
          uploadFrequency: uploadFreq,
          youtubeUpdatedAt: attemptedAt,
          lastUpdateAttemptAt: attemptedAt,
          lastUpdateStatus: "VIDIQ_FAILED",
          updatedAt: channel.updatedAt,
        },
        include: {
          _count: {
            select: { groups: true },
          },
        },
      });

      await revalidateChannelUsage(channel.id);

      return {
        channel: serializeAdminChannel(updatedChannel),
        skipped: false,
        warning: getErrorMessage(vidiqError, "VidIQ lỗi, đã giữ nguyên dữ liệu tăng trưởng cũ."),
      };
    }
  }

  const vidiqSucceededOrAlreadyFresh = Boolean(vidiqData || !shouldFetchVidiq);
  const updatedChannel = await prisma.$transaction(async (tx) => {
    const updated = await tx.channel.update({
      where: { id: channel.id },
      data: {
        title: youtubeStats.title,
        logo_url: youtubeStats.logo_url,
        subscriberCount: youtubeStats.subscriberCount,
        videoCount: youtubeStats.videoCount,
        viewCount: youtubeStats.viewCount,
        uploadFrequency: uploadFreq,
        views30Days: vidiqData?.views30Days ?? channel.views30Days,
        youtubeUpdatedAt: attemptedAt,
        vidiqUpdatedAt: vidiqData ? attemptedAt : channel.vidiqUpdatedAt,
        lastUpdateAttemptAt: attemptedAt,
        lastUpdateStatus: vidiqSucceededOrAlreadyFresh ? "SUCCESS" : "VIDIQ_FAILED",
        updatedAt: vidiqSucceededOrAlreadyFresh ? attemptedAt : channel.updatedAt,
      },
      include: {
        _count: {
          select: { groups: true },
        },
      },
    });

    if (vidiqData) {
      await persistVidiqStats(tx, channel.id, vidiqData);
    }

    return updated;
  });

  await revalidateChannelUsage(channel.id);

  return {
    channel: serializeAdminChannel(updatedChannel),
    skipped: false,
    warning: undefined,
  };
}

/**
 * Add a YouTube channel to a comparison group.
 */
export async function addChannelToGroup(url: string, groupId: string) {
  await checkGroupEditor(groupId);

  const normalizedUrl = normalizeYoutubeUrl(url);

  logChannelImport("info", "add:start", {
    url,
    normalizedUrl,
    groupId,
  });

  try {
    const existingChannel = await findExistingChannelFromUrl(url);

    if (existingChannel) {
      logChannelImport("info", "add:existing-channel-found", {
        url,
        normalizedUrl,
        groupId,
        dbChannelId: existingChannel.id,
        youtubeChannelId: existingChannel.channel_id,
        title: existingChannel.title,
      });

      await linkChannelToGroup(existingChannel.id, groupId);

      revalidatePath("/dashboard");
      revalidatePath(`/group/${groupId}`);

      logChannelImport("info", "add:existing-channel-linked", {
        url,
        normalizedUrl,
        groupId,
        dbChannelId: existingChannel.id,
      });

      return { success: true, channelId: existingChannel.id };
    }

    // 1. Resolve the YouTube channel ID from the submitted URL.
    const youtubeChannelId = await getChannelIdFromUrl(url);
    if (!youtubeChannelId) {
      logChannelImport("error", "add:youtube-channel-id-not-resolved", {
        url,
        normalizedUrl,
        groupId,
        reason: "getChannelIdFromUrl returned null",
      });
      throw new Error("Đường dẫn không hợp lệ hoặc không tìm thấy kênh YouTube");
    }

    logChannelImport("info", "add:youtube-channel-id-resolved", {
      url,
      normalizedUrl,
      groupId,
      youtubeChannelId,
    });

    const existingByYoutubeId = await prisma.channel.findUnique({
      where: { channel_id: youtubeChannelId },
    });

    if (existingByYoutubeId) {
      logChannelImport("info", "add:existing-youtube-id-found", {
        url,
        normalizedUrl,
        groupId,
        dbChannelId: existingByYoutubeId.id,
        youtubeChannelId,
        title: existingByYoutubeId.title,
      });

      await linkChannelToGroup(existingByYoutubeId.id, groupId);

      revalidatePath("/dashboard");
      revalidatePath(`/group/${groupId}`);

      logChannelImport("info", "add:existing-youtube-id-linked", {
        url,
        normalizedUrl,
        groupId,
        dbChannelId: existingByYoutubeId.id,
        youtubeChannelId,
      });

      return { success: true, channelId: existingByYoutubeId.id };
    }

    // 2. YouTube data is required. VidIQ data is best-effort.
    logChannelImport("info", "add:fetching-channel-data", {
      url,
      normalizedUrl,
      groupId,
      youtubeChannelId,
    });

    const [youtubeStats, uploadFreq] = await Promise.all([
      getChannelStats(youtubeChannelId),
      getUploadFrequency(youtubeChannelId),
    ]);

    logChannelImport("info", "add:youtube-data-fetched", {
      url,
      normalizedUrl,
      groupId,
      youtubeChannelId,
      title: youtubeStats.title,
      subscriberCount: youtubeStats.subscriberCount,
      videoCount: youtubeStats.videoCount,
      viewCount: youtubeStats.viewCount,
      uploadFrequency: uploadFreq,
    });

    let vidiqData: Awaited<ReturnType<typeof getVidiqStats>> | null = null;
    let warning: string | undefined;

    try {
      vidiqData = await getVidiqStats(youtubeChannelId);
      logChannelImport("info", "add:vidiq-data-fetched", {
        url,
        normalizedUrl,
        groupId,
        youtubeChannelId,
        views30Days: vidiqData.views30Days,
        dailyStatsCount: vidiqData.dailyStats.length,
        monthlyStatsCount: vidiqData.monthlyStats.length,
      });
    } catch (vidiqError) {
      console.error("VidIQ fetch failed, channel will be added without VidIQ stats:", vidiqError);
      logChannelImport("warn", "add:vidiq-data-failed", {
        url,
        normalizedUrl,
        groupId,
        youtubeChannelId,
        error: getErrorLog(vidiqError),
      });
      warning = "Kênh đã được thêm, nhưng chưa lấy được một phần dữ liệu tăng trưởng.";
    }

    const attemptedAt = new Date();

    // 3. Create/link the channel atomically. If the channel already exists, do not overwrite its old stats here.
    const channel = await prisma.$transaction(async (tx) => {
      const upsertedChannel = await tx.channel.upsert({
        where: { channel_id: youtubeChannelId },
        update: {},
        create: {
          channel_id: youtubeChannelId,
          channel_url: url.includes("youtube.com") ? url : `https://www.youtube.com/channel/${youtubeChannelId}`,
          title: youtubeStats.title,
          logo_url: youtubeStats.logo_url,
          subscriberCount: youtubeStats.subscriberCount,
          videoCount: youtubeStats.videoCount,
          viewCount: youtubeStats.viewCount,
          uploadFrequency: uploadFreq,
          views30Days: vidiqData?.views30Days ?? 0,
          youtubeUpdatedAt: attemptedAt,
          vidiqUpdatedAt: vidiqData ? attemptedAt : undefined,
          lastUpdateAttemptAt: attemptedAt,
          lastUpdateStatus: vidiqData ? "SUCCESS" : "VIDIQ_FAILED",
        },
      });

      await linkChannelToGroup(upsertedChannel.id, groupId, tx);

      if (vidiqData) {
        await persistVidiqStats(tx, upsertedChannel.id, vidiqData);
      }

      return upsertedChannel;
    });

    logChannelImport("info", "add:channel-upserted-and-linked", {
      url,
      normalizedUrl,
      groupId,
      dbChannelId: channel.id,
      youtubeChannelId,
      title: channel.title,
    });

    // 5. VidIQ stats are persisted in the transaction above only when the API succeeds.
    if (vidiqData) {
      logChannelImport("info", "add:vidiq-stats-persisted", {
        url,
        normalizedUrl,
        groupId,
        dbChannelId: channel.id,
        youtubeChannelId,
        dailyStatsCount: vidiqData.dailyStats.length,
        monthlyStatsCount: vidiqData.monthlyStats.length,
      });
    }

    // 6. Revalidate cached UI routes that depend on this group.
    revalidatePath("/dashboard");
    revalidatePath(`/group/${groupId}`);

    return { success: true, channelId: channel.id, warning };
  } catch (error: unknown) {
    logChannelImport("error", "add:failed", {
      url,
      normalizedUrl,
      groupId,
      error: getErrorLog(error),
    });
    throw new Error(getErrorMessage(error, "Đã xảy ra lỗi khi thêm kênh"));
  }
}

type AdminChannelsCursor = {
  updatedAt: string;
  id: string;
};

export async function getAdminChannels(options?: { cursor?: AdminChannelsCursor | null; search?: string }) {
  await checkAdmin();

  const search = options?.search?.trim();
  const cursorDate = options?.cursor ? new Date(options.cursor.updatedAt) : null;
  const searchWhere: Prisma.ChannelWhereInput = search
    ? {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { channel_url: { contains: search, mode: "insensitive" } },
          { channel_id: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  const cursorWhere: Prisma.ChannelWhereInput =
    cursorDate && !Number.isNaN(cursorDate.getTime())
      ? {
          OR: [
            { updatedAt: { lt: cursorDate } },
            {
              updatedAt: cursorDate,
              id: { lt: options?.cursor?.id },
            },
          ],
        }
      : {};
  const where: Prisma.ChannelWhereInput = {
    AND: [searchWhere, cursorWhere],
  };

  const [total, channels] = await Promise.all([
    prisma.channel.count({ where: searchWhere }),
    prisma.channel.findMany({
      where,
      take: ADMIN_CHANNELS_PAGE_SIZE + 1,
      include: {
        _count: {
          select: { groups: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const hasMore = channels.length > ADMIN_CHANNELS_PAGE_SIZE;
  const items = channels.slice(0, ADMIN_CHANNELS_PAGE_SIZE);
  const lastItem = items.at(-1);

  return {
    items: items.map(serializeAdminChannel),
    total,
    hasMore,
    nextCursor:
      hasMore && lastItem
        ? {
            updatedAt: lastItem.updatedAt.toISOString(),
            id: lastItem.id,
          }
        : null,
  };
}

export async function updateAdminChannel(channelId: string) {
  await checkAdmin();

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      _count: {
        select: { groups: true },
      },
    },
  });

  if (!channel) {
    throw new Error("Không tìm thấy kênh trong hệ thống");
  }

  if (wasFullyUpdatedToday(channel)) {
    return {
      channel: serializeAdminChannel(channel),
      skipped: true,
      warning: undefined,
    };
  }

  return refreshChannelData(channel);
}

export async function updateAllAdminChannels() {
  await checkAdmin();

  const channels = await prisma.channel.findMany({
    select: {
      id: true,
      channel_id: true,
      channel_url: true,
      title: true,
      views30Days: true,
      updatedAt: true,
      youtubeUpdatedAt: true,
      vidiqUpdatedAt: true,
    },
    orderBy: {
      updatedAt: "asc",
    },
  });

  let updated = 0;
  let skipped = 0;
  let attempted = 0;
  const failed: Array<{ channelId: string; title: string; message: string }> = [];

  for (const channel of channels) {
    if (wasFullyUpdatedToday(channel)) {
      skipped += 1;
      continue;
    }

    if (attempted > 0) {
      await delay(getAdminBatchDelayMs());
    }

    attempted += 1;

    try {
      await refreshChannelData(channel);
      updated += 1;
    } catch (error: unknown) {
      failed.push({
        channelId: channel.id,
        title: channel.title,
        message: getErrorMessage(error, "Không thể cập nhật kênh"),
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");

  return {
    total: channels.length,
    updated,
    skipped,
    failed,
  };
}

export async function deleteAdminChannel(channelId: string) {
  await checkAdmin();

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      groups: {
        select: { groupId: true },
      },
    },
  });

  if (!channel) {
    throw new Error("Không tìm thấy kênh trong hệ thống");
  }

  await prisma.channel.delete({
    where: { id: channelId },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  for (const link of channel.groups) {
    revalidatePath(`/group/${link.groupId}`);
  }

  return { success: true };
}

/**
 * Preview a batch import without fetching new channel data from external APIs.
 */
export async function previewChannelsForGroup(inputs: string[], groupId: string) {
  await checkGroupEditor(groupId);

  const seen = new Set<string>();
  const items: ChannelImportPreviewItem[] = [];

  for (const rawInput of inputs) {
    const input = rawInput.trim();
    if (!input) continue;

    const normalizedUrl = normalizeYoutubeUrl(input);
    if (seen.has(normalizedUrl)) {
      items.push({
        input,
        normalizedUrl,
        status: "duplicate",
        message: "Đường dẫn bị trùng trong danh sách nhập",
      });
      continue;
    }

    seen.add(normalizedUrl);

    if (!isPotentialYoutubeChannelUrl(normalizedUrl)) {
      items.push({
        input,
        normalizedUrl,
        status: "invalid",
        message: "Không nhận diện được đường dẫn kênh YouTube",
      });
      continue;
    }

    const existingChannel = await findExistingChannelFromUrl(normalizedUrl);
    if (!existingChannel) {
      items.push({
        input,
        normalizedUrl,
        status: "ready",
        message: "Kênh mới, sẽ lấy dữ liệu khi thêm",
      });
      continue;
    }

    const existingLink = await prisma.groupChannel.findUnique({
      where: {
        groupId_channelId: {
          groupId,
          channelId: existingChannel.id,
        },
      },
      select: { channelId: true },
    });

    items.push({
      input,
      normalizedUrl,
      status: existingLink ? "already-in-group" : "existing",
      message: existingLink
        ? "Kênh đã có trong nhóm này"
        : "Kênh đã có sẵn, chỉ cần thêm vào nhóm",
      channelId: existingChannel.id,
      channelTitle: existingChannel.title,
    });
  }

  return {
    total: items.length,
    importable: items.filter((item) => item.status === "ready" || item.status === "existing").length,
    items,
  };
}

/**
 * Import multiple YouTube channels into one comparison group.
 */
export async function importChannelsToGroup(inputs: string[], groupId: string) {
  await checkGroupEditor(groupId);

  const preview = await previewChannelsForGroup(inputs, groupId);
  const results: ChannelImportResultItem[] = [];
  let fetchedChannelCount = 0;

  for (const item of preview.items) {
    if (item.status === "already-in-group" || item.status === "duplicate" || item.status === "invalid") {
      results.push({
        input: item.input,
        status: "skipped",
        message: item.message,
        channelId: item.channelId,
      });
      continue;
    }

    try {
      if (item.status === "ready" && fetchedChannelCount > 0) {
        await delay(CHANNEL_IMPORT_BATCH_DELAY_MS);
      }

      const result = await addChannelToGroup(item.normalizedUrl || item.input, groupId);
      if (item.status === "ready") {
        fetchedChannelCount += 1;
      }

      results.push({
        input: item.input,
        status: "added",
        message:
          item.status === "existing"
            ? "Đã thêm từ dữ liệu có sẵn"
            : result.warning || "Đã lấy dữ liệu và thêm kênh",
        channelId: result.channelId,
      });
    } catch (error: unknown) {
      logChannelImport("error", "batch:item-failed", {
        groupId,
        input: item.input,
        normalizedUrl: item.normalizedUrl,
        previewStatus: item.status,
        error: getErrorLog(error),
      });
      results.push({
        input: item.input,
        status: "failed",
        message: getErrorMessage(error, "Không thể thêm kênh"),
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath(`/group/${groupId}`);

  return {
    total: results.length,
    added: results.filter((item) => item.status === "added").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
    items: results,
  };
}

/**
 * Remove a channel from a comparison group.
 */
export async function removeChannelFromGroup(channelId: string, groupId: string) {
  await checkGroupEditor(groupId);

  try {
    await prisma.groupChannel.delete({
      where: {
        groupId_channelId: {
          groupId,
          channelId,
        },
      },
    });

    revalidatePath(`/group/${groupId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error in removeChannelFromGroup:", error);
    throw new Error(getErrorMessage(error, "Không thể xóa kênh khỏi nhóm"));
  }
}
