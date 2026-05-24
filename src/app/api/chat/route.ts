import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const ollamaBaseUrl = `${(process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(
  /\/$/,
  ""
)}/v1`;
const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
const ollama = createOpenAI({
  name: "ollama",
  baseURL: ollamaBaseUrl,
  apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
});

const chatRequestSchema = z.object({
  groupId: z.string().min(1),
  messages: z.array(z.custom<UIMessage>()),
});

const dailyStatsInputSchema = z.object({
  channelTitle: z.string().min(1).describe("Ten chinh xac cua kenh trong compare group hien tai."),
  limit: z.number().int().min(1).max(400).default(120).describe("So ngay gan nhat can lay."),
});

const monthlyStatsInputSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .describe("Thang can phan tich theo format YYYY-MM."),
});

function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))
  ) as T;
}

function normalizeTitle(title: string) {
  return title.trim().toLocaleLowerCase("vi-VN");
}

async function getChannelsForGroup(groupId: string) {
  const groupChannels = await prisma.groupChannel.findMany({
    where: { groupId },
    orderBy: { assignedAt: "asc" },
    select: {
      channel: {
        select: {
          title: true,
          subscriberCount: true,
          videoCount: true,
          viewCount: true,
          views30Days: true,
        },
      },
    },
  });

  return serializeBigInt(
    groupChannels.map(({ channel }) => ({
      title: channel.title,
      subscriberCount: channel.subscriberCount,
      videoCount: channel.videoCount,
      viewCount: channel.viewCount,
      views30Days: channel.views30Days,
    }))
  );
}

async function findChannelInGroup(groupId: string, channelTitle: string) {
  const groupChannels = await prisma.groupChannel.findMany({
    where: { groupId },
    select: {
      channel: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  const normalizedTitle = normalizeTitle(channelTitle);

  return (
    groupChannels.find(({ channel }) => normalizeTitle(channel.title) === normalizedTitle)?.channel ??
    null
  );
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages, groupId } = chatRequestSchema.parse(await request.json());

    const group = await prisma.compareGroup.findFirst({
      where: {
        id: groupId,
        userId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!group) {
      return Response.json({ error: "Compare group not found" }, { status: 404 });
    }

    const channelsOverview = await getChannelsForGroup(groupId);

    const result = streamText({
      model: ollama.chat(ollamaModel),
      temperature: 0.1,
      maxOutputTokens: 700,
      system: `
Ban la chatbot AI phan tich so lieu YouTube cho mot Compare Group duy nhat.

Pham vi bat buoc:
- Chi duoc tra loi dua tren du lieu cua groupId hien tai: ${group.id}.
- Tuyet doi khong doc, suy luan, tong hop, hay so sanh voi bat ky group nao khac.
- Moi so lieu ve kenh, daily stats, monthly stats bat buoc phai lay qua tools duoc cung cap.
- Neu nguoi dung hoi kenh khong nam trong group hien tai, hay noi ro rang rang khong tim thay kenh trong nhom nay.
- Khong duoc yeu cau hay tao SQL, khong duoc noi rang ban co quyen truy cap database ngoai tools.
- Cac truong viewCount, views30Days, views, views_change, views_gained, total_views co the duoc tra ve dang chuoi de tranh loi BigInt; khi phan tich hay coi chung la so.
- Luon tra loi dung cau hoi moi nhat cua user. Khong viet mo dau chung chung, khong chen thong tin khong lien quan.
- Neu du lieu trong tools khong du de ket luan, noi ro "chua du du lieu" va neu can thi goi tool phu hop.
- Khi so sanh, neu co so lieu thi neu top 3 hoac ket luan chinh kem con so.

Ten group hien tai: ${group.name}.
Danh sach kenh trong group hien tai da duoc server gioi han san:
${JSON.stringify(channelsOverview)}

Tra loi bang tieng Viet, ngan gon, co so lieu cu the khi co du lieu.
      `.trim(),
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
      prepareStep: ({ stepNumber }) => {
        if (stepNumber === 0) {
          return {
            toolChoice: { type: "tool", toolName: "getChannelsInGroup" },
            activeTools: ["getChannelsInGroup"],
          };
        }

        return {
          toolChoice: "auto",
        };
      },
      tools: {
        getChannelsInGroup: tool({
          description:
            "Lay danh sach tat ca kenh thuoc compare group hien tai. Khong doc du lieu cua group khac.",
          inputSchema: z.object({}),
          execute: async () => getChannelsForGroup(groupId),
        }),
        getDailyStatsForGroup: tool({
          description:
            "Lay daily_stats moi nhat cua mot kenh cu the, nhung chi khi kenh do nam trong compare group hien tai.",
          inputSchema: dailyStatsInputSchema,
          execute: async ({ channelTitle, limit }) => {
            const channel = await findChannelInGroup(groupId, channelTitle);

            if (!channel) {
              return {
                channelTitle,
                found: false,
                message: "Khong tim thay kenh nay trong compare group hien tai.",
                stats: [],
              };
            }

            const stats = await prisma.dailyStat.findMany({
              where: { channelId: channel.id },
              orderBy: { date_str: "desc" },
              take: limit,
              select: {
                date_str: true,
                views: true,
                views_change: true,
                subscribers: true,
                subscribers_change: true,
              },
            });

            return serializeBigInt({
              channelTitle: channel.title,
              found: true,
              stats,
            });
          },
        }),
        getMonthlyStatsForGroup: tool({
          description:
            "Lay monthly_stats cua cac kenh thuoc compare group hien tai trong mot thang YYYY-MM.",
          inputSchema: monthlyStatsInputSchema,
          execute: async ({ month }) => {
            const groupChannels = await prisma.groupChannel.findMany({
              where: { groupId },
              orderBy: { assignedAt: "asc" },
              select: {
                channel: {
                  select: {
                    title: true,
                    monthlyStats: {
                      where: { month },
                      select: {
                        month: true,
                        views_gained: true,
                        total_views: true,
                        subscribers: true,
                        subscribers_change: true,
                      },
                    },
                  },
                },
              },
            });

            return serializeBigInt(
              groupChannels.map(({ channel }) => ({
                title: channel.title,
                month,
                stats: channel.monthlyStats[0] ?? null,
              }))
            );
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat route error:", error);

    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid chat request" }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
