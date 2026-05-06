import * as dotenv from 'dotenv';
dotenv.config();

// Load the service only after dotenv has initialized the environment.
const { getVidiqStats } = require('./src/lib/services/vidiq');

async function test() {
  try {
    const channelId = "UCX6OQ3DkcsbYNE6H8uQQuVA"; // MrBeast
    console.log(`[TEST] Äang láº¥y dá»¯ liá»‡u cho kÃªnh: ${channelId}...`);

    const data = await getVidiqStats(channelId);

    console.log(`=> Tá»•ng sá»‘ ngÃ y tráº£ vá» (daily_stats): ${data.dailyStats.length}`);
    console.log(`=> Tá»•ng sá»‘ thÃ¡ng tÃ­nh toÃ¡n Ä‘Æ°á»£c (monthly_stats): ${data.monthlyStats.length}`);

    if (data.dailyStats.length > 0) {
      const oldestDate = new Date(Number(data.dailyStats[data.dailyStats.length - 1].date_str) * 1000);
      const newestDate = new Date(Number(data.dailyStats[0].date_str) * 1000);
      console.log(`=> NgÃ y cÅ© nháº¥t cÃ³ data: ${oldestDate.toLocaleDateString('vi-VN')}`);
      console.log(`=> NgÃ y má»›i nháº¥t cÃ³ data: ${newestDate.toLocaleDateString('vi-VN')}`);
    }
  } catch (err) {
    console.error("Lá»—i:", err);
  }
}

test();
