import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGroupDetails } from "@/app/actions/groupActions";
import AddChannelForm from "@/components/AddChannelForm";
import CompareTable from "@/components/CompareTable";
import ViewsChart from "@/components/ViewsChart";
import MonthlyComparisonTable from "@/components/MonthlyComparisonTable";
import MonthlyViewsChart from "@/components/MonthlyViewsChart";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import GroupActionMenu from "@/components/GroupActionMenu";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;

  let group;
  try {
    group = await getGroupDetails(id);
  } catch (error) {
    console.error("Error fetching group details:", error);
    redirect("/dashboard");
  }

  if (!group) {
    redirect("/dashboard");
  }

  // Normalize channel data so downstream components always receive arrays.
  const channels = (group.channels || []).map((gc: any) => ({
    ...gc.channel,
    dailyStats: gc.channel.dailyStats || [],
    monthlyStats: gc.channel.monthlyStats || [],
  }));

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-indigo-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay láº¡i Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {channels.length} kÃªnh Ä‘ang Ä‘Æ°á»£c so sÃ¡nh
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-slate-200 shadow-sm rounded-xl px-2 py-1">
          <GroupActionMenu
            groupId={id}
            groupName={group.name}
            currentIcon={group.icon}
            redirectToDashboard={true}
          />
        </div>
      </div>

      {/* Add Channel Section */}
      <AddChannelForm groupId={id} />

      {/* Overview Table */}
      <CompareTable channels={channels} groupId={id} />

      {/* 30-Day Views Chart */}
      <ViewsChart channels={channels} />

      {/* Historical Monthly Data Section */}
      {channels.some((c: any) => c.monthlyStats.length > 0) && (
        <>
          <MonthlyComparisonTable channels={channels} />
          <MonthlyViewsChart channels={channels} />
        </>
      )}
    </div>
  );
}
