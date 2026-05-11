import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getGroups } from "@/app/actions/groupActions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const groups = await getGroups();

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AppShell groups={groups}>{children}</AppShell>
    </Suspense>
  );
}
