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
import DeleteGroupButton from "@/components/DeleteGroupButton";

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

  // Chuẩn bị dữ liệu kênh an toàn
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
            Quay lại Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {channels.length} kênh đang được so sánh
          </p>
        </div>
        <DeleteGroupButton 
          groupId={id} 
          groupName={group.name} 
          redirectToDashboard={true} 
        />
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
          <MonthlyViewsChart channels={channels} />
          <MonthlyComparisonTable channels={channels} />
        </>
      )}
    </div>
  );
}
