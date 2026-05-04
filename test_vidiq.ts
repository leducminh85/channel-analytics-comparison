import * as dotenv from 'dotenv';
dotenv.config();

// Require sau khi dotenv config xong
const { getVidiqStats } = require('./src/lib/services/vidiq');

async function test() {
  try {
    const channelId = "UCX6OQ3DkcsbYNE6H8uQQuVA"; // MrBeast
    console.log(`[TEST] Đang lấy dữ liệu cho kênh: ${channelId}...`);
    
    const data = await getVidiqStats(channelId);
    
    console.log(`=> Tổng số ngày trả về (daily_stats): ${data.dailyStats.length}`);
    console.log(`=> Tổng số tháng tính toán được (monthly_stats): ${data.monthlyStats.length}`);
    
    if (data.dailyStats.length > 0) {
      const oldestDate = new Date(Number(data.dailyStats[data.dailyStats.length - 1].date_str) * 1000);
      const newestDate = new Date(Number(data.dailyStats[0].date_str) * 1000);
      console.log(`=> Ngày cũ nhất có data: ${oldestDate.toLocaleDateString('vi-VN')}`);
      console.log(`=> Ngày mới nhất có data: ${newestDate.toLocaleDateString('vi-VN')}`);
    }
  } catch (err) {
    console.error("Lỗi:", err);
  }
}

test();
