"use server";

import prisma from "@/lib/prisma";
import { getChannelIdFromUrl, getChannelStats, getUploadFrequency } from "@/lib/services/youtube";
import { getVidiqStats } from "@/lib/services/vidiq";
import { revalidatePath } from "next/cache";

/**
 * Add a YouTube channel to a comparison group.
 */
export async function addChannelToGroup(url: string, groupId: string) {
  try {
    // 1. Resolve the YouTube channel ID from the submitted URL.
    const youtubeChannelId = await getChannelIdFromUrl(url);
    if (!youtubeChannelId) {
      throw new Error("URL khÃ´ng há»£p lá»‡ hoáº·c khÃ´ng tÃ¬m tháº¥y kÃªnh Youtube");
    }

    // 2. Fetch YouTube and VidIQ data in parallel to reduce latency.
    const [youtubeStats, vidiqData, uploadFreq] = await Promise.all([
      getChannelStats(youtubeChannelId),
      getVidiqStats(youtubeChannelId),
      getUploadFrequency(youtubeChannelId),
    ]);

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
        views30Days: vidiqData.views30Days,
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
        views30Days: vidiqData.views30Days,
      },
    });

    // 4. Link the channel to the selected comparison group.
    await prisma.groupChannel.upsert({
      where: {
        groupId_channelId: {
          groupId: groupId,
          channelId: channel.id,
        },
      },
      update: {}, // No-op when the channel is already in the group.
      create: {
        groupId: groupId,
        channelId: channel.id,
      },
    });

    // 5. Persist the daily stats returned by VidIQ.
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

    // 6. Persist the monthly stats returned by VidIQ.
    for (const mStat of vidiqData.monthlyStats) {
      await prisma.monthlyStat.upsert({
        where: {
          channelId_month: {
            channelId: channel.id,
            month: mStat.month,
          },
        },
        update: {
          views_gained: mStat.views_gained,
          total_views: mStat.total_views_at_end,
          subscribers: mStat.subscribers,
          subscribers_change: mStat.subscribers_change,
        },
        create: {
          channelId: channel.id,
          month: mStat.month,
          views_gained: mStat.views_gained,
          total_views: mStat.total_views_at_end,
          subscribers: mStat.subscribers,
          subscribers_change: mStat.subscribers_change,
        },
      });
    }

    // 7. Revalidate cached UI routes that depend on this group.
    revalidatePath("/dashboard");
    revalidatePath(`/group/${groupId}`);

    return { success: true, channelId: channel.id };
  } catch (error: any) {
    console.error("Error in addChannelToGroup:", error);
    throw new Error(error.message || "ÄÃ£ xáº£y ra lá»—i khi thÃªm kÃªnh");
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
  } catch (error: any) {
    console.error("Error in removeChannelFromGroup:", error);
    throw new Error("KhÃ´ng thá»ƒ xÃ³a kÃªnh khá»i nhÃ³m");
  }
}
