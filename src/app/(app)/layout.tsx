import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
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
    <div className="flex min-h-screen bg-slate-50">
      <Suspense fallback={<div className="w-64 bg-sidebar-bg" />}>
        <Sidebar groups={groups} />
      </Suspense>
      <main className="ml-64 flex-1 p-8 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
