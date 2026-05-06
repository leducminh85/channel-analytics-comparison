# Channel Analytics Comparison

[![Next.js](https://img.shields.io/badge/Next.js-16.2.4-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7.8.0-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

Ứng dụng web dùng để theo dõi, so sánh và quản trị dữ liệu hiệu suất của nhiều kênh YouTube trong cùng một dashboard. Hệ thống hỗ trợ nhóm so sánh, biểu đồ tăng trưởng, quản trị người dùng và phân quyền `ADMIN` / `USER`.

## Mục lục

- [Tổng quan](#tổng-quan)
- [Tính năng chính](#tính-năng-chính)
- [Screenshots](#screenshots)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Biến môi trường](#biến-môi-trường)
- [Chạy local](#chạy-local)
- [Chạy với Docker](#chạy-với-docker)
- [Tài khoản mặc định](#tài-khoản-mặc-định)
- [Scripts hữu ích](#scripts-hữu-ích)
- [Luồng nghiệp vụ chính](#luồng-nghiệp-vụ-chính)
- [Bảo mật và phân quyền](#bảo-mật-và-phân-quyền)
- [Gợi ý triển khai production](#gợi-ý-triển-khai-production)

## Tổng quan

`Channel Analytics Comparison` được xây dựng cho nhu cầu:

- So sánh nhiều kênh YouTube trong cùng một nhóm.
- Theo dõi chỉ số tổng quan như lượt xem, subscriber, tần suất đăng video.
- Hiển thị dữ liệu lịch sử theo ngày và theo tháng bằng bảng và biểu đồ.
- Quản lý tài khoản người dùng nội bộ bằng trang `Admin`.
- Chạy được cả local lẫn Docker để thuận tiện phát triển và demo.

## Tính năng chính

- Đăng nhập bằng `NextAuth Credentials`.
- Tự động điều hướng từ `/` đến `/login` hoặc `/dashboard` theo trạng thái đăng nhập.
- Tạo, sửa, xoá nhóm so sánh kênh.
- Thêm kênh YouTube vào nhóm bằng URL kênh.
- Đồng bộ dữ liệu từ YouTube Data API và VidIQ API.
- Biểu đồ 30 ngày gần nhất và thống kê tăng trưởng theo tháng.
- Sidebar điều hướng theo danh sách nhóm.
- Trang quản trị `Admin` để:
  - xem danh sách người dùng
  - tạo user mới
  - reset mật khẩu
  - xoá user
- Bảo vệ route `/admin` để chỉ `ADMIN` truy cập được.

## Screenshots

Ảnh dưới đây được chụp trực tiếp từ ứng dụng đang chạy local bằng Docker, tập trung vào các tính năng phân tích chính thay vì các màn hình phụ trợ.

### Dashboard overview

![Dashboard overview](./docs/images/dashboard-overview.png)

### Channel comparison table

![Channel comparison table](./docs/images/compare-table.png)

### Daily views growth chart

![Daily views growth chart](./docs/images/daily-views-chart.png)

### Monthly comparison table

![Monthly comparison table](./docs/images/monthly-comparison-table.png)

### Monthly views chart

![Monthly views chart](./docs/images/monthly-views-chart.png)

## Kiến trúc hệ thống

Ứng dụng sử dụng mô hình App Router của Next.js với Server Components, Server Actions và Prisma làm tầng truy cập dữ liệu.

```mermaid
flowchart LR
    A[Browser] --> B[Next.js App Router]
    B --> C[NextAuth]
    B --> D[Server Actions]
    D --> E[Prisma Client]
    E --> F[(PostgreSQL)]
    D --> G[YouTube Data API]
    D --> H[VidIQ API]
```

## Công nghệ sử dụng

| Nhóm | Công nghệ |
| --- | --- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Auth | NextAuth |
| Database | PostgreSQL |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Charts | Recharts |
| Icons | Lucide React |
| Container | Docker, Docker Compose |

## Cấu trúc thư mục

```text
.
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
├── public/
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── admin/
│   │   │   ├── dashboard/
│   │   │   └── group/[id]/
│   │   ├── actions/
│   │   ├── api/auth/[...nextauth]/
│   │   ├── login/
│   │   └── page.tsx
│   ├── components/
│   └── lib/
├── docs/
│   └── images/
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Yêu cầu môi trường

- Node.js `20+`
- npm `10+`
- PostgreSQL `15+`
- Docker Desktop nếu chạy bằng container
- API key hợp lệ cho:
  - YouTube Data API v3
  - VidIQ API

## Biến môi trường

Tạo file `.env` ở root project:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/channel_analytics?schema=public"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-change-this-in-production"

YOUTUBE_API_KEY="your_youtube_api_key"
VIDIQ_BEARER_TOKEN="your_vidiq_bearer_token"
VIDIQ_CLIENT_ID="your_vidiq_client_id"
```

### Mô tả biến

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `DATABASE_URL` | Có | Kết nối PostgreSQL |
| `NEXTAUTH_URL` | Có | Base URL của ứng dụng |
| `NEXTAUTH_SECRET` | Có | Secret cho JWT/session |
| `YOUTUBE_API_KEY` | Có | API key lấy dữ liệu kênh YouTube |
| `VIDIQ_BEARER_TOKEN` | Có | Token truy cập VidIQ |
| `VIDIQ_CLIENT_ID` | Có | Client ID gửi kèm request VidIQ |

## Chạy local

### 1. Cài dependencies

```bash
npm install
```

### 2. Khởi động PostgreSQL

Bạn có thể dùng PostgreSQL local hoặc khởi động nhanh bằng Docker:

```bash
docker compose up -d db
```

### 3. Đồng bộ schema và seed dữ liệu

```bash
npx prisma db push
npx prisma generate
npx prisma db seed
```

### 4. Chạy ứng dụng

```bash
npm run dev
```

Mặc định app chạy ở:

- App: `http://localhost:3000` hoặc URL bạn cấu hình
- DB qua Docker: `localhost:5433`

## Chạy với Docker

### Build image

```bash
docker compose build
```

### Khởi động toàn bộ stack

```bash
docker compose up -d
```

### Truy cập

- Application: `http://localhost:3002`
- PostgreSQL: `localhost:5433`

### Dừng container

```bash
docker compose down
```

### Xoá cả volume data local

```bash
docker compose down -v
```

## Tài khoản mặc định

Seed hiện tại tạo sẵn một tài khoản quản trị:

- Email: `admin@example.com`
- Password: `admin123`
- Role: `ADMIN`

Lưu ý:

- Chỉ dùng thông tin này cho local/dev.
- Bắt buộc đổi `NEXTAUTH_SECRET` và mật khẩu admin khi triển khai thật.

## Scripts hữu ích

| Script | Mô tả |
| --- | --- |
| `npm run dev` | Chạy môi trường phát triển |
| `npm run build` | Build production |
| `npm run start` | Chạy bản build production |
| `npm run lint` | Kiểm tra ESLint |

## Luồng nghiệp vụ chính

### Đăng nhập và phân quyền

1. Người dùng đăng nhập bằng email và mật khẩu.
2. NextAuth xác thực qua `CredentialsProvider`.
3. Session JWT được gắn `role`.
4. Middleware và server layout kiểm tra quyền truy cập route.
5. User thường vào dashboard, admin có thêm quyền vào `/admin`.

### Thêm kênh vào nhóm

1. Nhập URL kênh YouTube.
2. Ứng dụng trích xuất `channelId`.
3. Server gọi YouTube API và VidIQ API song song.
4. Dữ liệu được `upsert` vào bảng `Channel`, `DailyStat`, `MonthlyStat`.
5. UI được revalidate để hiển thị dữ liệu mới.

## Bảo mật và phân quyền

- Route `/admin` được bảo vệ ở 2 tầng:
  - middleware token check
  - server-side layout check
- Chỉ tài khoản `role = ADMIN` mới truy cập được trang quản trị.
- Session sử dụng `JWT strategy`.
- Password được hash bằng `bcryptjs`.

## Gợi ý triển khai production

- Đổi toàn bộ secret mặc định trong `.env`.
- Không commit file `.env` chứa key thật.
- Thay thông tin admin seed mặc định bằng dữ liệu bootstrap riêng.
- Dùng reverse proxy như Nginx hoặc deploy qua nền tảng cloud có TLS.
- Tách database production khỏi máy local hoặc volume local Docker.
- Thiết lập backup định kỳ cho PostgreSQL.

## Ghi chú

- `README` này mô tả trạng thái ứng dụng hiện tại theo source code trong repository.
- Nếu bạn muốn biến README thành tài liệu mở rộng cho đội ngũ nội bộ, bước tiếp theo hợp lý là bổ sung:
  - ảnh chụp màn hình thật của dashboard
  - luồng CI/CD
  - tiêu chuẩn coding
  - checklist release
