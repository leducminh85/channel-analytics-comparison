"use server";

import prisma from "@/lib/prisma";
import { getChannelIdFromUrl, getChannelStats, getUploadFrequency } from "@/lib/services/youtube";
import { getVidiqStats } from "@/lib/services/vidiq";
import { revalidatePath } from "next/cache";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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

async function linkChannelToGroup(channelId: string, groupId: string) {
  return prisma.groupChannel.upsert({
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

/**
 * Add a YouTube channel to a comparison group.
 */
export async function addChannelToGroup(url: string, groupId: string) {
  try {
    const existingChannel = await findExistingChannelFromUrl(url);

    if (existingChannel) {
      await linkChannelToGroup(existingChannel.id, groupId);

      revalidatePath("/dashboard");
      revalidatePath(`/group/${groupId}`);

      return { success: true, channelId: existingChannel.id };
    }

    // 1. Resolve the YouTube channel ID from the submitted URL.
    const youtubeChannelId = await getChannelIdFromUrl(url);
    if (!youtubeChannelId) {
      throw new Error("URL không hợp lệ hoặc không tìm thấy kênh Youtube");
    }

    const existingByYoutubeId = await prisma.channel.findUnique({
      where: { channel_id: youtubeChannelId },
    });

    if (existingByYoutubeId) {
      await linkChannelToGroup(existingByYoutubeId.id, groupId);

      revalidatePath("/dashboard");
      revalidatePath(`/group/${groupId}`);

      return { success: true, channelId: existingByYoutubeId.id };
    }

    // 2. YouTube data is required. VidIQ data is best-effort.
    const [youtubeStats, uploadFreq] = await Promise.all([
      getChannelStats(youtubeChannelId),
      getUploadFrequency(youtubeChannelId),
    ]);

    let vidiqData: Awaited<ReturnType<typeof getVidiqStats>> | null = null;
    let warning: string | undefined;

    try {
      vidiqData = await getVidiqStats(youtubeChannelId);
    } catch (vidiqError) {
      console.error("VidIQ fetch failed, channel will be added without VidIQ stats:", vidiqError);
      warning = "Kênh đã được thêm, nhưng không lấy được dữ liệu view từ VidIQ. Các số liệu VidIQ đang được đặt mặc định.";
    }

    // 3. Upsert the channel record so existing channels stay up to date.
    const channel = await prisma.channel.upsert({
      where: { channel_id: youtubeChannelId },
      update: {
        title: youtubeStats.title,
        logo_url: youtubeStats.logo_url,
        subscriberCount: youtubeStats.subscriberCount,
        videoCount: youtubeStats.videoCount,
        viewCount: youtubeStats.viewCount,
        uploadFrequency: uploadFreq,
        views30Days: vidiqData?.views30Days ?? 0,
        updatedAt: new Date(),
      },
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
      },
    });

    // 4. Link the channel to the selected comparison group.
    await linkChannelToGroup(channel.id, groupId);

    // 5. Persist VidIQ stats only when the API succeeds.
    if (vidiqData) {
      for (const stat of vidiqData.dailyStats) {
        await prisma.dailyStat.upsert({
          where: {
            channelId_date_str: {
              channelId: channel.id,
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
            channelId: channel.id,
            date_str: String(stat.date_str),
            views: stat.views,
            views_change: stat.views_change,
            subscribers: stat.subscribers,
            subscribers_change: stat.subscribers_change,
          },
        });
      }

      for (const monthlyStat of vidiqData.monthlyStats) {
        await prisma.monthlyStat.upsert({
          where: {
            channelId_month: {
              channelId: channel.id,
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
            channelId: channel.id,
            month: monthlyStat.month,
            views_gained: monthlyStat.views_gained,
            total_views: monthlyStat.total_views_at_end,
            subscribers: monthlyStat.subscribers,
            subscribers_change: monthlyStat.subscribers_change,
          },
        });
      }
    }

    // 6. Revalidate cached UI routes that depend on this group.
    revalidatePath("/dashboard");
    revalidatePath(`/group/${groupId}`);

    return { success: true, channelId: channel.id, warning };
  } catch (error: unknown) {
    console.error("Error in addChannelToGroup:", error);
    throw new Error(getErrorMessage(error, "Đã xảy ra lỗi khi thêm kênh"));
  }
}

/**
 * Preview a batch import without fetching new channel data from external APIs.
 */
export async function previewChannelsForGroup(inputs: string[], groupId: string) {
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
        message: "URL bị trùng trong danh sách nhập",
      });
      continue;
    }

    seen.add(normalizedUrl);

    if (!isPotentialYoutubeChannelUrl(normalizedUrl)) {
      items.push({
        input,
        normalizedUrl,
        status: "invalid",
        message: "Không nhận diện được URL kênh YouTube",
      });
      continue;
    }

    const existingChannel = await findExistingChannelFromUrl(normalizedUrl);
    if (!existingChannel) {
      items.push({
        input,
        normalizedUrl,
        status: "ready",
        message: "Kênh mới, sẽ fetch dữ liệu khi import",
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
        ? "Kênh đã có trong group này"
        : "Kênh đã có trong cơ sở dữ liệu, chỉ cần liên kết vào group",
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
  const preview = await previewChannelsForGroup(inputs, groupId);
  const results: ChannelImportResultItem[] = [];

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
      const result = await addChannelToGroup(item.normalizedUrl || item.input, groupId);
      results.push({
        input: item.input,
        status: "added",
        message:
          item.status === "existing"
            ? "Đã thêm từ dữ liệu có sẵn, không fetch lại API"
            : result.warning || "Đã fetch dữ liệu và thêm kênh",
        channelId: result.channelId,
      });
    } catch (error: unknown) {
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
