# Tài liệu tích hợp VidIQ API

Tài liệu này mô tả cách project đang dùng VidIQ API mới để lấy lịch sử số liệu công khai của kênh YouTube, sau đó chuyển đổi dữ liệu về format `daily_stats` và `monthly_stats` hiện có trong app.

Code chính:

- `src/lib/services/vidiq.ts`: gọi VidIQ API, xoay token, normalize dữ liệu.
- `src/app/actions/channelActions.ts`: lưu dữ liệu VidIQ vào database khi thêm hoặc refresh kênh.

## Endpoint

```text
GET https://api.vidiq.com/youtube/channels/public/stats
```

## Query parameters

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `ids` | `string` | Có | YouTube channel ID cần lấy dữ liệu. |
| `from` | `YYYY-MM-DD` | Có | Ngày bắt đầu lấy lịch sử. |
| `to` | `YYYY-MM-DD` | Có | Ngày kết thúc lấy lịch sử. |

App tự lấy range 365 ngày gần nhất. Ví dụ nếu hôm nay là `2026-07-06`, request sẽ dùng:

```text
from=2025-07-07
to=2026-07-06
```

## Headers

| Header | Bắt buộc | Giá trị |
| --- | --- | --- |
| `Authorization` | Có | `Bearer <VIDIQ_BEARER_TOKEN>` |
| `accept` | Không | `*/*` |
| `x-vidiq-client` | Không | Mặc định `ext vch/3.200.0` |

Nếu `.env` có `VIDIQ_CLIENT_ID="YOUR_VIDIQ_CLIENT_ID"` thì app xem đó là placeholder và vẫn dùng fallback `ext vch/3.200.0`.

Ví dụ request:

```bash
curl 'https://api.vidiq.com/youtube/channels/public/stats?ids=UC8EB7c0E_TS4tpTQwMtv6fw&from=2025-07-07&to=2026-07-06' \
  -H 'accept: */*' \
  -H 'authorization: Bearer <VIDIQ_BEARER_TOKEN>' \
  -H 'x-vidiq-client: ext vch/3.200.0'
```

## Biến môi trường

```env
VIDIQ_BEARER_TOKEN="primary_vidiq_token"
VIDIQ_BEARER_TOKEN2="optional_backup_token"
VIDIQ_BEARER_TOKEN3="optional_backup_token"
VIDIQ_BEARER_TOKEN4="optional_backup_token"
VIDIQ_BEARER_TOKEN5="optional_backup_token"
VIDIQ_BEARER_TOKEN6="optional_backup_token"
VIDIQ_CLIENT_ID="ext vch/3.200.0"
```

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `VIDIQ_BEARER_TOKEN` | Có | Token chính để gọi VidIQ. |
| `VIDIQ_BEARER_TOKEN2` - `VIDIQ_BEARER_TOKEN6` | Không | Token dự phòng để xoay vòng khi token bị lỗi hoặc rate limit. |
| `VIDIQ_CLIENT_ID` | Không | Giá trị gửi qua header `x-vidiq-client`. |

Không commit token thật vào repository.

## Response gốc từ VidIQ

API trả về một mảng JSON. Mỗi phần tử là một kênh:

```ts
[
  {
    id: string,
    title: string,
    thumbnails: string,
    country: string | null,
    default_language: string | null,
    published_at: string,
    topics: string[],
    global_rank: number | null,
    country_rank: number | null,
    stats: [
      {
        recorded_at: string,
        subscribers: number,
        views: number,
        videos: number
      }
    ]
  }
]
```

`stats` là các snapshot cumulative. Nghĩa là `views`, `subscribers`, `videos` là tổng tại thời điểm `recorded_at`, không phải số tăng thêm.

## Response nội bộ của `getVidiqStats`

Để không phải sửa UI/database, service vẫn trả về contract cũ:

```ts
{
  views30Days: number,
  dailyStats: Array<{
    date_str: string,
    views: number,
    views_change: number,
    subscribers: number,
    subscribers_change: number
  }>,
  monthlyStats: Array<{
    month: string,
    views_gained: number,
    total_views_at_end: number,
    subscribers: number,
    subscribers_change: number
  }>
}
```

## Cách normalize dữ liệu

### Daily stats

VidIQ có thể trả nhiều snapshot trong một ngày. App xử lý như sau:

1. Parse `recorded_at`.
2. Sort snapshot theo thời gian tăng dần.
3. Gom theo ngày UTC.
4. Mỗi ngày chỉ giữ snapshot mới nhất.
5. Tính delta với ngày trước đó:

```text
views_change = max(0, today.views - previousDay.views)
subscribers_change = max(0, today.subscribers - previousDay.subscribers)
```

`date_str` vẫn được lưu là Unix timestamp dạng string để tương thích chart hiện tại.

### Views 30 ngày

`views30Days` được tính bằng tổng `views_change` của 30 daily records mới nhất:

```text
views30Days = sum(latest 30 dailyStats.views_change)
```

### Monthly stats

Monthly stats được tạo từ daily snapshots đã normalize:

1. Gom daily snapshots theo tháng UTC `YYYY-MM`.
2. Lấy snapshot cuối tháng làm tổng cuối tháng.
3. So sánh với snapshot cuối tháng trước đó để tính tăng trưởng:

```text
views_gained = max(0, monthEnd.views - previousMonthEnd.views)
subscribers_change = max(0, monthEnd.subscribers - previousMonthEnd.subscribers)
```

Nếu là tháng đầu tiên trong range và chưa có tháng trước làm baseline, app dùng snapshot đầu tiên của tháng đó làm baseline.

## Token rotation và cooldown

App hỗ trợ tối đa 6 token VidIQ. Mỗi lần gọi `getVidiqStats`:

- Lọc token đã cấu hình.
- Bỏ qua token đang cooldown.
- Ưu tiên token ít dùng gần đây hơn.
- Chỉ thử tối đa 2 token trong một request.

| Hằng số | Giá trị | Ý nghĩa |
| --- | --- | --- |
| `VIDIQ_MAX_TOKEN_ATTEMPTS` | `2` | Số token tối đa được thử cho một lần fetch. |
| `VIDIQ_RATE_LIMIT_COOLDOWN_MS` | `30 phút` | Cooldown mặc định khi gặp HTTP `429`. |
| `VIDIQ_FAILURE_COOLDOWN_MS` | `5 phút` | Cooldown khi token lỗi liên tiếp. |
| `VIDIQ_FAILURES_BEFORE_COOLDOWN` | `3` | Số lần lỗi liên tiếp trước khi cooldown token. |

Nếu VidIQ trả `retry-after`, app dùng giá trị đó để quyết định thời gian cooldown.

## Lưu database

| Dữ liệu | Bảng | Field |
| --- | --- | --- |
| Views 30 ngày | `channels` | `views30Days` |
| Lần cập nhật VidIQ | `channels` | `vidiqUpdatedAt` |
| Trạng thái cập nhật | `channels` | `lastUpdateStatus` |
| Daily stats | `daily_stats` | `date_str`, `views`, `views_change`, `subscribers`, `subscribers_change` |
| Monthly stats | `monthly_stats` | `month`, `views_gained`, `total_views`, `subscribers`, `subscribers_change` |

Daily stats upsert theo:

```text
channelId + date_str
```

Monthly stats upsert theo:

```text
channelId + month
```

## Flow trong app

### Khi thêm kênh

1. App resolve YouTube channel ID.
2. YouTube Data API lấy metadata bắt buộc.
3. VidIQ API lấy lịch sử stats 365 ngày.
4. Nếu VidIQ thành công, app lưu `views30Days`, daily stats, monthly stats.
5. Nếu VidIQ lỗi, app vẫn thêm kênh bằng dữ liệu YouTube và trả warning cho UI.

### Khi refresh kênh

1. YouTube Data API luôn được gọi trước.
2. VidIQ chỉ được gọi nếu `vidiqUpdatedAt` chưa phải hôm nay.
3. Nếu VidIQ lỗi, app giữ dữ liệu VidIQ cũ và vẫn cập nhật metadata YouTube.
4. Nếu VidIQ thành công, app upsert lại daily/monthly stats.

## Test nhanh

Chạy:

```bash
npx ts-node test_vidiq.ts
```

Kết quả mong đợi:

- API trả HTTP `200`.
- `dailyStats.length` lớn hơn 0.
- `monthlyStats.length` lớn hơn 0.
- `views30Days` lớn hơn hoặc bằng 0.

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `401 Unauthorized` | Token sai hoặc hết hạn | Cập nhật `VIDIQ_BEARER_TOKEN`. |
| `400 Bad Request` | Thiếu `ids/from/to` hoặc sai format ngày | Kiểm tra query params. |
| `404 Not Found` | Không có dữ liệu cho channel ID | Kiểm tra channel ID. |
| `429 Too Many Requests` | Rate limit | Chờ cooldown hoặc thêm token dự phòng. |
| `response missing stats data` | Response không có mảng `stats` | Kiểm tra endpoint/token/channel ID. |

## Ghi chú

- Endpoint VidIQ này trả snapshot cumulative, nên mọi field tăng trưởng trong app đều là dữ liệu được tính lại.
- API đang dùng `cache: "no-store"` để tránh dùng lại response cũ trong server-side fetch.
- Nếu response shape từ VidIQ thay đổi, cần cập nhật `src/lib/services/vidiq.ts`.
