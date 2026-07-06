/* eslint-disable @typescript-eslint/no-require-imports */
const dotenv = require("dotenv");
dotenv.config();

const { getVidiqStats } = require("./src/lib/services/vidiq");

async function test() {
  try {
    const channelId = "UC8EB7c0E_TS4tpTQwMtv6fw";
    console.log(`[TEST] Fetching VidIQ stats for channel: ${channelId}...`);

    const data = await getVidiqStats(channelId);

    console.log(`=> views30Days: ${data.views30Days}`);
    console.log(`=> dailyStats count: ${data.dailyStats.length}`);
    console.log(`=> monthlyStats count: ${data.monthlyStats.length}`);

    if (data.dailyStats.length > 0) {
      const oldestDate = new Date(Number(data.dailyStats[data.dailyStats.length - 1].date_str) * 1000);
      const newestDate = new Date(Number(data.dailyStats[0].date_str) * 1000);
      console.log(`=> oldest daily stat: ${oldestDate.toISOString().slice(0, 10)}`);
      console.log(`=> newest daily stat: ${newestDate.toISOString().slice(0, 10)}`);
      console.log(`=> newest daily views_change: ${data.dailyStats[0].views_change}`);
    }

    if (data.monthlyStats.length > 0) {
      console.log(`=> newest month: ${data.monthlyStats[0].month}`);
      console.log(`=> newest month views_gained: ${data.monthlyStats[0].views_gained}`);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
