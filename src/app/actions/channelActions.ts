"use server";

import prisma from "@/lib/prisma";
import { getChannelIdFromUrl, getChannelStats, getUploadFrequency } from "@/lib/services/youtube";
import { getVidiqStats } from "@/lib/services/vidiq";
import { revalidatePath } from "next/cache";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeYoutubeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
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

/**
 * Add a YouTube channel to a comparison group.
 */
export async function addChannelToGroup(url: string, groupId: string) {
  try {
    const existingChannel = await findExistingChannelFromUrl(url);

    if (existingChannel) {
      await prisma.groupChannel.upsert({
        where: {
          groupId_channelId: {
            groupId,
            channelId: existingChannel.id,
          },
        },
        update: {},
        create: {
          groupId,
          channelId: existingChannel.id,
        },
      });

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
      await prisma.groupChannel.upsert({
        where: {
          groupId_channelId: {
            groupId,
            channelId: existingByYoutubeId.id,
          },
        },
        update: {},
        create: {
          groupId,
          channelId: existingByYoutubeId.id,
        },
      });

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
    await prisma.groupChannel.upsert({
      where: {
        groupId_channelId: {
          groupId,
          channelId: channel.id,
        },
      },
      update: {},
      create: {
        groupId,
        channelId: channel.id,
      },
    });

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
