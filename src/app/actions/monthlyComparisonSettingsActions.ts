"use server";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";

export type MonthlyComparisonFilterMode = "all" | "last3" | "last6" | "custom";
export type MonthlyComparisonSortDirection = "asc" | "desc";

export interface MonthlyComparisonSettings {
  sortMonth: string | null;
  sortDirection: MonthlyComparisonSortDirection | null;
  filterMode: MonthlyComparisonFilterMode;
  customStartMonth: string | null;
  customEndMonth: string | null;
}

const DEFAULT_SETTINGS: MonthlyComparisonSettings = {
  sortMonth: null,
  sortDirection: null,
  filterMode: "all",
  customStartMonth: null,
  customEndMonth: null,
};

function isValidMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function sanitizeSettings(value: unknown): MonthlyComparisonSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;

  const raw = value as Record<string, unknown>;
  const filterMode = raw.filterMode;
  const sortDirection = raw.sortDirection;

  return {
    sortMonth: isValidMonth(raw.sortMonth) ? raw.sortMonth : null,
    sortDirection: sortDirection === "asc" || sortDirection === "desc" ? sortDirection : null,
    filterMode:
      filterMode === "last3" || filterMode === "last6" || filterMode === "custom"
        ? filterMode
        : "all",
    customStartMonth: isValidMonth(raw.customStartMonth) ? raw.customStartMonth : null,
    customEndMonth: isValidMonth(raw.customEndMonth) ? raw.customEndMonth : null,
  };
}

async function getCurrentUserByEmail() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, monthlyComparisonSettings: true },
  });

  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function getMonthlyComparisonSettings() {
  const user = await getCurrentUserByEmail();
  return sanitizeSettings(user.monthlyComparisonSettings);
}

export async function updateMonthlyComparisonSettings(settings: MonthlyComparisonSettings) {
  const user = await getCurrentUserByEmail();
  const sanitized = sanitizeSettings(settings);

  await prisma.user.update({
    where: { id: user.id },
    data: { monthlyComparisonSettings: sanitized as unknown as Prisma.InputJsonObject },
  });

  return sanitized;
}
