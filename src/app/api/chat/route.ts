import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { getServerSession } from "next-auth";
import { z } from "zod";
import {
  compareDailyViews,
  compareMonthlyViews,
  getChannelTrend,
  getGroupAnalyticsSummary,
  getGroupDatabaseContext,
  rankChannels,
} from "@/lib/chatAnalytics";
import { stripModelReasoning } from "@/lib/chatReasoning";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const ollamaBaseUrl = `${(process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(
  /\/$/,
  ""
)}/v1`;
const ollamaModel = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
const enableChatTools = process.env.AI_CHAT_ENABLE_TOOLS === "true";
const ollama = createOpenAI({
  name: "ollama",
  baseURL: ollamaBaseUrl,
  apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
});

const chatRequestSchema = z.object({
  groupId: z.string().min(1),
  messages: z.array(z.custom<UIMessage>()),
});

const metricSchema = z.enum(["totalViews", "views30Days", "subscribers", "videos"]);

const rankChannelsInputSchema = z.object({
  metric: metricSchema.describe(
    "Metric can xep hang: totalViews, views30Days, subscribers, hoac videos."
  ),
  limit: z.number().int().min(1).max(20).default(10),
});

const dailyCompareInputSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(400)
    .default(30)
    .describe("So ngay gan nhat can so sanh theo daily_stats.views_change."),
});

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .describe("Thang theo format YYYY-MM.");

const monthlyCompareInputSchema = z.object({
  month: z
    .union([
      monthSchema,
      z.string().regex(/^(0?[1-9]|1[0-2])$/).describe("Thang dang 1-12 khi co year."),
    ])
    .optional(),
  year: z
    .union([z.string().regex(/^\d{4}$/), z.number().int().min(1900).max(3000)])
    .optional(),
  startMonth: monthSchema.optional(),
  endMonth: monthSchema.optional(),
});

const channelTrendInputSchema = z.object({
  channelTitle: z.string().min(1).describe("Ten kenh trong compare group hien tai."),
  days: z.number().int().min(1).max(400).default(30),
  months: z.number().int().min(1).max(24).default(6),
});

const databaseContextInputSchema = z.object({
  dailyLimit: z.number().int().min(1).max(400).default(60),
  monthlyLimit: z.number().int().min(1).max(60).default(24),
});

function sanitizeChatMessages(messages: UIMessage[]) {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "text") return part;
      return {
        ...part,
        text: stripModelReasoning(part.text),
      };
    }),
  }));
}

function latestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) return "";

  return latestUserMessage.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

function normalizeText(text: string) {
  return stripModelReasoning(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN");
}

function normalizeMonthlyToolInput(input: z.infer<typeof monthlyCompareInputSchema>) {
  const year = input.year ? String(input.year) : undefined;
  const month =
    input.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)
      ? input.month
      : input.month && year
        ? `${year}-${input.month.padStart(2, "0")}`
        : input.month;

  return {
    month,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
  };
}

function metricText(metric: { formattedValue: string }) {
  return metric.formattedValue;
}

function detectRequestedMonth(question: string) {
  return question.match(/\b(?:19|20)\d{2}-(0[1-9]|1[0-2])\b/)?.[0];
}

function requestedMetricText(
  metric: string,
  channel: Awaited<ReturnType<typeof getGroupDatabaseContext>>["channels"][number],
  monthlyMonth?: string,
  latestMonth?: string
) {
  const monthlyStat = monthlyMonth
    ? channel.monthlyStats.find((stat) => stat.month === monthlyMonth)
    : undefined;

  if (metric === "totalViews") return `tong views ${metricText(channel.metrics.totalViews)}`;
  if (metric === "views30Days") return `views 30 ngay ${metricText(channel.metrics.views30Days)}`;
  if (metric === "latestMonthlyViewsGained") {
    const monthlyLabel =
      monthlyMonth && latestMonth && monthlyMonth === latestMonth
        ? "views tang thang gan nhat"
        : "views tang thang";
    return `${monthlyLabel}${monthlyMonth ? ` (${monthlyMonth})` : ""} ${
      monthlyStat ? metricText(monthlyStat.views_gained) : "chua co du lieu"
    }`;
  }
  if (metric === "subscribers") return `subscribers ${metricText(channel.metrics.subscribers)}`;
  if (metric === "videos") return `so video ${metricText(channel.metrics.videos)}`;
  return null;
}

function requestedMetricLabel(metric: string, monthlyMonth?: string, latestMonth?: string) {
  if (metric === "totalViews") return "tong views";
  if (metric === "views30Days") return "views 30 ngay";
  if (metric === "latestMonthlyViewsGained") {
    if (!monthlyMonth) return "views tang thang";
    return monthlyMonth === latestMonth
      ? `views tang thang gan nhat (${monthlyMonth})`
      : `views tang thang (${monthlyMonth})`;
  }
  if (metric === "subscribers") return "subscribers";
  if (metric === "videos") return "so video";
  return metric;
}

function requestedMetricValue(
  metric: string,
  channel: Awaited<ReturnType<typeof getGroupDatabaseContext>>["channels"][number],
  monthlyMonth?: string
) {
  if (metric === "totalViews") return metricBigInt(channel.metrics.totalViews);
  if (metric === "views30Days") return metricBigInt(channel.metrics.views30Days);
  if (metric === "subscribers") return metricBigInt(channel.metrics.subscribers);
  if (metric === "videos") return metricBigInt(channel.metrics.videos);
  if (metric === "latestMonthlyViewsGained") {
    const monthlyStat = monthlyMonth
      ? channel.monthlyStats.find((stat) => stat.month === monthlyMonth)
      : undefined;
    return monthlyStat ? metricBigInt(monthlyStat.views_gained) : null;
  }
  return null;
}

function sumMetricValues(items: Array<{ value: string }>) {
  return items.reduce((sum, item) => sum + BigInt(item.value), BigInt(0)).toLocaleString("vi-VN");
}

function metricBigInt(metric: { value: string }) {
  return BigInt(metric.value);
}

function detectRequiredMetrics(question: string) {
  const normalizedQuestion = normalizeText(question);
  const metrics: string[] = [];

  if (
    normalizedQuestion.includes("tong view") ||
    normalizedQuestion.includes("total view") ||
    normalizedQuestion.includes("tong luot xem")
  ) {
    metrics.push("totalViews");
  }

  if (
    normalizedQuestion.includes("30 ngay") ||
    normalizedQuestion.includes("30ngay") ||
    normalizedQuestion.includes("30 days")
  ) {
    metrics.push("views30Days");
  }

  if (
    normalizedQuestion.includes("monthly") ||
    normalizedQuestion.includes("thang") ||
    normalizedQuestion.includes("gan nhat")
  ) {
    metrics.push("latestMonthlyViewsGained");
  }

  if (normalizedQuestion.includes("subscriber") || normalizedQuestion.includes("dang ky")) {
    metrics.push("subscribers");
  }

  if (normalizedQuestion.includes("video")) {
    metrics.push("videos");
  }

  return Array.from(new Set(metrics));
}

function hasRecommendationIntent(question: string) {
  const normalizedQuestion = normalizeText(question);
  return (
    normalizedQuestion.includes("dau tu") ||
    normalizedQuestion.includes("uu tien") ||
    normalizedQuestion.includes("tap trung") ||
    normalizedQuestion.includes("nen lam") ||
    (normalizedQuestion.includes("nen") &&
      (normalizedQuestion.includes("kenh") ||
        normalizedQuestion.includes("noi dung") ||
        normalizedQuestion.includes("content")))
  );
}

function detectUnknownChannelMentions(
  question: string,
  databaseContext: Awaited<ReturnType<typeof getGroupDatabaseContext>>
) {
  const allowedChannelNames = databaseContext.channels.map((channel) => normalizeText(channel.title));
  const candidates = new Set<string>();
  const capitalizedPhrasePattern =
    /(?<![\p{L}\p{N}])([\p{Lu}][\p{L}\p{N}&._-]*(?:\s+[\p{Lu}][\p{L}\p{N}&._-]*){1,4})/gu;

  for (const match of question.matchAll(capitalizedPhrasePattern)) {
    const candidate = match[1].trim();
    const normalizedCandidate = normalizeText(candidate);
    if (
      !allowedChannelNames.includes(normalizedCandidate) &&
      !["youtube", "ai", "db", "data packet"].includes(normalizedCandidate)
    ) {
      candidates.add(candidate);
    }
  }

  return Array.from(candidates);
}

function buildContentRecommendation(
  databaseContext: Awaited<ReturnType<typeof getGroupDatabaseContext>>
) {
  const latestMonth = databaseContext.availableMonths[0];
  const rows = databaseContext.channels.map((channel) => {
    const latestMonthlyStat = latestMonth
      ? channel.monthlyStats.find((stat) => stat.month === latestMonth)
      : undefined;

    return {
      channel,
      views30Days: metricBigInt(channel.metrics.views30Days),
      latestMonthlyViews: latestMonthlyStat ? metricBigInt(latestMonthlyStat.views_gained) : null,
      totalViews: metricBigInt(channel.metrics.totalViews),
      subscribers: metricBigInt(channel.metrics.subscribers),
    };
  });

  const byMomentum = [...rows].sort((a, b) => {
    if (a.views30Days !== b.views30Days) return a.views30Days > b.views30Days ? -1 : 1;
    const aMonthly = a.latestMonthlyViews ?? BigInt(-1);
    const bMonthly = b.latestMonthlyViews ?? BigInt(-1);
    if (aMonthly !== bMonthly) return aMonthly > bMonthly ? -1 : 1;
    if (a.totalViews !== b.totalViews) return a.totalViews > b.totalViews ? -1 : 1;
    return 0;
  });

  const recommended = byMomentum[0];
  if (!recommended) return "none";

  const rankingText = byMomentum
    .map(
      (row, index) =>
        `${index + 1}. ${row.channel.title}: views 30 ngay ${metricText(
          row.channel.metrics.views30Days
        )}, views tang thang gan nhat${latestMonth ? ` (${latestMonth})` : ""} ${
          row.latestMonthlyViews === null
            ? "chua co du lieu"
            : row.latestMonthlyViews.toLocaleString("vi-VN")
        }, tong views ${metricText(row.channel.metrics.totalViews)}, subscribers ${metricText(
          row.channel.metrics.subscribers
        )}`
    )
    .join("; ");

  return [
    `Kenh nen uu tien: ${recommended.channel.title}.`,
    "Ly do: uu tien momentum noi dung dua tren views 30 ngay, views tang thang gan nhat, sau do moi den tong views/subscribers.",
    `Xep hang theo momentum: ${rankingText}`,
  ].join("\n");
}

function buildQuestionAnalysis(
  question: string,
  databaseContext: Awaited<ReturnType<typeof getGroupDatabaseContext>>
) {
  const recommendationIntent = hasRecommendationIntent(question);
  const unknownChannels = detectUnknownChannelMentions(question, databaseContext);

  return {
    recommendationIntent,
    unknownChannels,
    contentRecommendation: recommendationIntent
      ? buildContentRecommendation(databaseContext)
      : "none",
  };
}

function buildQuestionRelevantFacts(
  question: string,
  databaseContext: Awaited<ReturnType<typeof getGroupDatabaseContext>>
) {
  const normalizedQuestion = normalizeText(question);
  const latestMonth = databaseContext.availableMonths[0];
  const requestedMonth = detectRequestedMonth(question);
  const monthlyMonth = requestedMonth ?? latestMonth;
  const requiredMetrics = detectRequiredMetrics(question);
  const mentionedChannels = databaseContext.channels.filter((channel) =>
    normalizedQuestion.includes(normalizeText(channel.title))
  );
  const channels = mentionedChannels.length > 0 ? mentionedChannels : databaseContext.channels;

  const lines = channels.map((channel) => {
    return `- ${channel.title}: tong views ${metricText(
      channel.metrics.totalViews
    )}, views 30 ngay ${metricText(
      channel.metrics.views30Days
    )}, ${requestedMetricText(
      "latestMonthlyViewsGained",
      channel,
      monthlyMonth,
      latestMonth
    )}, subscribers ${metricText(channel.metrics.subscribers)}, so video ${metricText(
      channel.metrics.videos
    )}`;
  });
  const mandatoryLines =
    requiredMetrics.length > 0
      ? [
          ...channels.map((channel) => {
            const metricParts = requiredMetrics.map((metric) =>
              requestedMetricText(metric, channel, monthlyMonth, latestMonth)
            );

            return `- ${channel.title}: ${metricParts.filter(Boolean).join(", ")}`;
          }),
          ...requiredMetrics.map((metric) => {
            const ranked = [...channels]
              .map((channel) => ({
                channel,
                value: requestedMetricValue(metric, channel, monthlyMonth),
              }))
              .sort((a, b) => {
                if (a.value === null && b.value === null) return 0;
                if (a.value === null) return 1;
                if (b.value === null) return -1;
                if (a.value === b.value) return 0;
                return a.value > b.value ? -1 : 1;
              })
              .map((row, index) => {
                const valueText = row.value === null ? "chua co du lieu" : row.value.toLocaleString("vi-VN");
                return `${index + 1}. ${row.channel.title} ${valueText}`;
              })
              .join("; ");

            return `- Xep hang ${requestedMetricLabel(metric, monthlyMonth, latestMonth)}: ${ranked}`;
          }),
        ]
      : [];

  return {
    requiredMetrics,
    facts: lines.join("\n"),
    mandatoryLines: mandatoryLines.join("\n"),
  };
}

function buildDataPacket(databaseContext: Awaited<ReturnType<typeof getGroupDatabaseContext>>) {
  const latestMonth = databaseContext.availableMonths[0];
  const channelLines = databaseContext.channels.map((channel) => {
    const { metrics } = channel;
    const latestMonthlyStat = latestMonth
      ? channel.monthlyStats.find((stat) => stat.month === latestMonth)
      : undefined;
    const latestMonthlyViews = latestMonthlyStat
      ? metricText(latestMonthlyStat.views_gained)
      : "chua co du lieu";
    return `- ${channel.title}: totalViews=${metricText(metrics.totalViews)}, views30Days=${metricText(metrics.views30Days)}, latestMonthlyViewsGained${latestMonth ? `(${latestMonth})` : ""}=${latestMonthlyViews}, subscribers=${metricText(metrics.subscribers)}, videos=${metricText(metrics.videos)}, uploadFrequency=${channel.uploadFrequency ?? "N/A"}`;
  });

  const monthlyLines = databaseContext.channels.map((channel) => {
    const stats = channel.monthlyStats
      .slice(0, 12)
      .map((stat) => `${stat.month}: views_gained=${metricText(stat.views_gained)}`)
      .join("; ");
    return `- ${channel.title}: ${stats || "chua co monthly stats"}`;
  });

  const latestMonthlyLines = latestMonth
    ? databaseContext.channels.map((channel) => {
        const stat = channel.monthlyStats.find((item) => item.month === latestMonth);
        return `- ${channel.title}: ${stat ? metricText(stat.views_gained) : "chua co du lieu"}`;
      })
    : [];

  const recentDailyLines = databaseContext.channels.map((channel) => {
    const recentStats = channel.dailyStats.slice(0, 7);
    const total = sumMetricValues(recentStats.map((stat) => stat.views_change));
    const bestDay = recentStats.reduce<(typeof recentStats)[number] | null>((best, stat) => {
      if (!best) return stat;
      return BigInt(stat.views_change.value) > BigInt(best.views_change.value) ? stat : best;
    }, null);

    return `- ${channel.title}: last7DaysViews=${total}, bestRecentDay=${bestDay ? `${bestDay.date_str} (${metricText(bestDay.views_change)})` : "N/A"}`;
  });

  const rankingLines = [
    `views30Days: ${databaseContext.summary.rankings.views30Days
      .map((row) => `${row.rank}. ${row.channelTitle}=${row.formattedValue}`)
      .join("; ")}`,
    `totalViews: ${databaseContext.summary.rankings.totalViews
      .map((row) => `${row.rank}. ${row.channelTitle}=${row.formattedValue}`)
      .join("; ")}`,
    `subscribers: ${databaseContext.summary.rankings.subscribers
      .map((row) => `${row.rank}. ${row.channelTitle}=${row.formattedValue}`)
      .join("; ")}`,
  ];

  return `
ALLOWED_CHANNELS: ${databaseContext.channels.map((channel) => channel.title).join(", ") || "none"}
GROUP_TOTALS:
- totalViews=${databaseContext.summary.totals.totalViews.formattedValue}
- views30Days=${databaseContext.summary.totals.views30Days.formattedValue}
- subscribers=${databaseContext.summary.totals.subscribers.formattedValue}
- videos=${databaseContext.summary.totals.videos.formattedValue}

CHANNEL_METRICS:
${channelLines.join("\n")}

RANKINGS:
${rankingLines.join("\n")}

LATEST_MONTHLY_VIEWS_GAINED${latestMonth ? ` (${latestMonth})` : ""}:
${latestMonthlyLines.join("\n") || "chua co monthly stats"}

MONTHLY_HISTORY_LAST_12:
${monthlyLines.join("\n")}

RECENT_DAILY_LAST_7:
${recentDailyLines.join("\n")}

AVAILABLE_MONTHS: ${databaseContext.availableMonths.join(", ") || "none"}
MISSING_DATA:
- dailyStats: ${databaseContext.missingData.dailyStats.join(", ") || "none"}
- monthlyStats: ${databaseContext.missingData.monthlyStats.join(", ") || "none"}
  `.trim();
}

function buildSystemPrompt({
  group,
  dataPacket,
  latestQuestion,
  questionAnalysis,
  questionRelevantFacts,
}: {
  group: { id: string; name: string };
  dataPacket: string;
  latestQuestion: string;
  questionAnalysis: ReturnType<typeof buildQuestionAnalysis>;
  questionRelevantFacts: ReturnType<typeof buildQuestionRelevantFacts>;
}) {
  const usesFocusedData =
    Boolean(questionRelevantFacts.mandatoryLines) ||
    questionAnalysis.recommendationIntent ||
    questionAnalysis.unknownChannels.length > 0;
  const supportingData = usesFocusedData
    ? "Dung cac so lieu da rut gon o tren. Khong dung them metric nao ngoai phan do neu cau hoi da co metric/thang ro rang."
    : dataPacket;

  return `
Ban la tro ly ao phan tich du lieu YouTube cho compare group "${group.name}".

Quy tac bat buoc:
- Chi dung du lieu duoc cung cap ben duoi cho compare group hien tai.
- Tra loi linh hoat nhu data analyst: so sanh, xep hang, tom tat xu huong, giai thich insight, hoac hoi lai khi cau hoi thieu moc quan trong.
- Khong bia du lieu, khong suy doan ve kenh ngoai group, khong noi minh doc DB truc tiep.
- Khong lap lai prompt, khong lap lai ten section nguon, khong noi "toi se bat dau" hoac "toi se su dung", khong hien thi chain-of-thought hay the <think>.
- Luon tra loi bang tieng Viet, ngan gon nhung du y.
- Khong nhac nguon ngoai nhu Google Trends, YouTube Analytics, web, hay API ben ngoai; nguon duy nhat la du lieu group duoc cung cap.
- Khong tu tinh phan tram, ty le, hay chenh lech neu cac so do khong co san trong du lieu. Khi so sanh, uu tien neu so goc va noi kenh nao cao hon/thap hon.
- Khong suy luan linh vuc/chu de cua kenh neu du lieu khong cung cap.
- Neu cau hoi co thang cu the dang YYYY-MM, chi dung views tang cua dung thang do; khong thay bang views 30 ngay hay tong views.
- Neu cau hoi la nen uu tien/dau tu noi dung, cau dau tien phai noi ro "Nen uu tien <ten kenh>".

Canh bao ve kenh ngoai group:
${questionAnalysis.unknownChannels.length > 0 ? questionAnalysis.unknownChannels.join(", ") : "none"}

Neu nguoi dung hoi nen uu tien/dau tu noi dung:
${questionAnalysis.contentRecommendation}

So lieu phai dung cho cau hoi neu co:
${questionRelevantFacts.mandatoryLines || questionRelevantFacts.facts || "none"}

Du lieu group de tham khao:
${supportingData}

Cau hoi hien tai: ${latestQuestion}

Hay tra loi ngay cau hoi tren. Dung so lieu cu the, khong lap lai noi dung nguon.
  `.trim();
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

    const databaseContext = await getGroupDatabaseContext(groupId, {
      dailyLimit: 30,
      monthlyLimit: 24,
    });
    const latestQuestion = latestUserText(messages);
    const dataPacket = buildDataPacket(databaseContext);
    const questionAnalysis = buildQuestionAnalysis(latestQuestion, databaseContext);
    const questionRelevantFacts = buildQuestionRelevantFacts(latestQuestion, databaseContext);

    const tools = {
      getDatabaseContext: tool({
        description:
          "Lay snapshot du lieu DB cho compare group hien tai voi daily/monthly limits tuy chon.",
        inputSchema: databaseContextInputSchema,
        execute: async ({ dailyLimit, monthlyLimit }) =>
          getGroupDatabaseContext(groupId, { dailyLimit, monthlyLimit }),
      }),
      getGroupAnalyticsSummary: tool({
        description:
          "Lay summary da tinh san cho compare group hien tai: totals, rankings, channel counts, va missingData.",
        inputSchema: z.object({}),
        execute: async () => getGroupAnalyticsSummary(groupId),
      }),
      rankChannels: tool({
        description:
          "Xep hang kenh theo metric totalViews, views30Days, subscribers, hoac videos.",
        inputSchema: rankChannelsInputSchema,
        execute: async ({ metric, limit }) => rankChannels(groupId, metric, limit),
      }),
      compareDailyViews: tool({
        description:
          "So sanh views tang them theo daily_stats.views_change trong N ngay gan nhat.",
        inputSchema: dailyCompareInputSchema,
        execute: async ({ days }) => compareDailyViews(groupId, days),
      }),
      compareMonthlyViews: tool({
        description:
          "So sanh monthly_stats.views_gained cho mot thang YYYY-MM, khoang thang, hoac thang moi nhat co trong DB neu khong truyen thang.",
        inputSchema: monthlyCompareInputSchema,
        execute: async (input) => compareMonthlyViews(groupId, normalizeMonthlyToolInput(input)),
      }),
      getChannelTrend: tool({
        description:
          "Lay trend da tinh san cho mot kenh trong group hien tai, gom totals, daily window va recent monthly stats.",
        inputSchema: channelTrendInputSchema,
        execute: async ({ channelTitle, days, months }) =>
          getChannelTrend(groupId, channelTitle, days, months),
      }),
    };

    const result = streamText({
      model: ollama.chat(ollamaModel),
      temperature: 0.1,
      maxOutputTokens: 900,
      system: buildSystemPrompt({
        group,
        dataPacket,
        latestQuestion,
        questionAnalysis,
        questionRelevantFacts,
      }),
      messages: await convertToModelMessages(sanitizeChatMessages(messages)),
      stopWhen: stepCountIs(6),
      ...(enableChatTools ? { tools } : { toolChoice: "none" as const }),
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
