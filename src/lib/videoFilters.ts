// Date inputs represent publication dates in GMT+7; the end date is inclusive.
export function publicationRange(start?: string, end?: string) {
  function day(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Ngày lọc không hợp lệ.");
    const midnight = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== value) throw new Error("Ngày lọc không hợp lệ.");
    return new Date(midnight.getTime() - 7 * 3600000);
  }
  const from = start ? day(start) : undefined;
  const until = end ? day(end) : undefined;
  if (from && until && from > until) throw new Error("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
  return { ...(from ? { gte: from } : {}), ...(until ? { lt: new Date(until.getTime() + 86400000) } : {}) };
}

export function normalizeVideoMetrics(payload: unknown, ids: string[]): Map<string, number | null> {
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) throw new Error("VidIQ trả dữ liệu điểm đột biến không hợp lệ.");
  const allowed = new Set(ids);
  const scores = new Map<string, number | null>();
  for (const item of payload.data) {
    if (!item || typeof item.video_id !== "string" || !allowed.has(item.video_id)) continue;
    const score = item.breakout_score;
    if (score === null || (typeof score === "number" && Number.isFinite(score) && score >= 0)) scores.set(item.video_id, score);
  }
  return scores;
}
