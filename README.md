# Channel Analytics Comparison

[![Next.js](https://img.shields.io/badge/Next.js-16.2.4-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7.8.0-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

Channel Analytics Comparison is a web application for tracking, comparing, and managing YouTube channel performance inside a single dashboard. It supports comparison groups, daily and monthly analytics, user administration, and role-based access control.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Requirements](#environment-requirements)
- [Environment Variables](#environment-variables)
- [Run Locally](#run-locally)
- [Run with Docker](#run-with-docker)
- [Default Account](#default-account)
- [Useful Scripts](#useful-scripts)
- [Core Application Flows](#core-application-flows)
- [Security and Access Control](#security-and-access-control)
- [Production Notes](#production-notes)

## Overview

This project is built for teams that need to:

- Compare multiple YouTube channels inside the same workspace.
- Track top-line metrics such as total views, subscribers, video count, and publishing cadence.
- Review historical trends through daily and monthly tables and charts.
- Manage internal users through an admin interface.
- Run the stack locally or through Docker for development and demos.

## Key Features

- Credentials-based authentication with `NextAuth`
- Automatic redirect from `/` to `/login` or `/dashboard` depending on session state
- Create, rename, update, and delete comparison groups
- Add YouTube channels to groups from channel URLs
- Sync channel data from the YouTube Data API and VidIQ API
- Visualize daily view growth and monthly performance trends
- Navigate groups from a persistent sidebar
- Manage users from the `Admin` page:
  - list users
  - create new users
  - reset passwords
  - delete users
- Restrict `/admin` to users with the `ADMIN` role

## Screenshots

The images below are real screenshots captured from the running application, focused on the primary analytics experience.

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

## Architecture

The application uses the Next.js App Router with Server Components, Server Actions, and Prisma as the data access layer.

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

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Authentication | NextAuth |
| Database | PostgreSQL |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Charts | Recharts |
| Icons | Lucide React |
| Containers | Docker, Docker Compose |

## Project Structure

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

## Environment Requirements

- Node.js `20+`
- npm `10+`
- PostgreSQL `15+`
- Docker Desktop if you want to run the stack in containers
- Valid credentials for:
  - YouTube Data API v3
  - VidIQ API

## Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/channel_analytics?schema=public"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-change-this-in-production"

YOUTUBE_API_KEY="your_youtube_api_key"
VIDIQ_BEARER_TOKEN="your_vidiq_bearer_token"
VIDIQ_CLIENT_ID="your_vidiq_client_id"
```

### Variable reference

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | Base URL of the application |
| `NEXTAUTH_SECRET` | Yes | Secret used for JWT/session signing |
| `YOUTUBE_API_KEY` | Yes | API key for YouTube channel metadata |
| `VIDIQ_BEARER_TOKEN` | Yes | Bearer token for VidIQ |
| `VIDIQ_CLIENT_ID` | Yes | Client ID sent with VidIQ requests |

## Run Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

You can use a local PostgreSQL instance or start one with Docker:

```bash
docker compose up -d db
```

### 3. Sync the schema and seed data

```bash
npx prisma db push
npx prisma generate
npx prisma db seed
```

### 4. Start the application

```bash
npm run dev
```

By default:

- App: `http://localhost:3000`
- Database through Docker: `localhost:5433`

## Run with Docker

### Build the image

```bash
docker compose build
```

### Start the full stack

```bash
docker compose up -d
```

### Access the services

- Application: `http://localhost:3002`
- PostgreSQL: `localhost:5433`

### Stop the containers

```bash
docker compose down
```

### Remove containers and the local database volume

```bash
docker compose down -v
```

## Default Account

The seed script creates a default administrator account:

- Email: `admin@example.com`
- Password: `admin123`
- Role: `ADMIN`

Use this only for local development. Replace the credentials and `NEXTAUTH_SECRET` before deploying anywhere real.

## Useful Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the production bundle |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |

## Core Application Flows

### Authentication and authorization

1. A user signs in with email and password.
2. NextAuth validates the credentials through `CredentialsProvider`.
3. The JWT session receives a `role`.
4. Middleware and server layouts enforce route-level access rules.
5. Standard users land on the dashboard, while admins can also reach `/admin`.

### Adding a channel to a group

1. A user submits a YouTube channel URL.
2. The app resolves the `channelId`.
3. The server calls the YouTube API and VidIQ API in parallel.
4. The data is upserted into `Channel`, `DailyStat`, and `MonthlyStat`.
5. The related UI routes are revalidated to show the latest metrics.

## Security and Access Control

- `/admin` is protected at two layers:
  - middleware token checks
  - server-side layout checks
- Only users with `role = ADMIN` can access the admin area.
- Sessions use the `jwt` strategy.
- Passwords are hashed with `bcryptjs`.

## Production Notes

- Replace all default secrets in `.env`.
- Never commit real credentials to the repository.
- Replace the default seeded admin account with your own bootstrap process.
- Put the app behind TLS, typically through a reverse proxy or a cloud platform that terminates HTTPS.
- Use a dedicated production database instead of a local Docker volume.
- Set up regular PostgreSQL backups.
