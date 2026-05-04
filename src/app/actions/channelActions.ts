"use server";

import prisma from "@/lib/prisma";
import { getChannelIdFromUrl, getChannelStats, getUploadFrequency } from "@/lib/services/youtube";
import { getVidiqStats } from "@/lib/services/vidiq";
import { revalidatePath } from "next/cache";

/**
 * Thêm một kênh vào nhóm so sánh
 */
export async function addChannelToGroup(url: string, groupId: string) {
  try {
    // 1. Phân giải URL để lấy Channel ID từ Youtube
    const youtubeChannelId = await getChannelIdFromUrl(url);
    if (!youtubeChannelId) {
      throw new Error("URL không hợp lệ hoặc không tìm thấy kênh Youtube");
    }

    // 2. Fetch dữ liệu đồng thời từ Youtube và VidIQ để tối ưu hiệu suất
    const [youtubeStats, vidiqData, uploadFreq] = await Promise.all([
      getChannelStats(youtubeChannelId),
      getVidiqStats(youtubeChannelId),
      getUploadFrequency(youtubeChannelId),
    ]);

    // 3. Upsert thông tin vào bảng Channel (Cập nhật nếu đã tồn tại)
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

    // 4. Kết nối Channel với Group hiện tại (Bảng trung gian)
    await prisma.groupChannel.upsert({
      where: {
        groupId_channelId: {
          groupId: groupId,
          channelId: channel.id,
        },
      },
      update: {}, // Đã tồn tại trong nhóm thì không làm gì
      create: {
        groupId: groupId,
        channelId: channel.id,
      },
    });

    // 5. Lưu mảng dailyStats vào bảng DailyStat
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

    // 6. Lưu mảng monthlyStats vào bảng MonthlyStat
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

    // 7. Cập nhật lại cache UI
    revalidatePath("/dashboard");
    revalidatePath(`/group/${groupId}`);

    return { success: true, channelId: channel.id };
  } catch (error: any) {
    console.error("Error in addChannelToGroup:", error);
    throw new Error(error.message || "Đã xảy ra lỗi khi thêm kênh");
  }
}

/**
 * Xóa một kênh khỏi nhóm
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
    throw new Error("Không thể xóa kênh khỏi nhóm");
  }
}
