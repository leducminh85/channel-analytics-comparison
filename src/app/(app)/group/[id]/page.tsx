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
  } catch {
    redirect("/dashboard");
  }

  // Extract channels from the join table
  const channels = group.channels.map((gc) => gc.channel);

  // Prepare channels with dailyStats for the chart
  const channelsWithStats = channels.map((ch) => ({
    id: ch.id,
    title: ch.title,
    logo_url: ch.logo_url,
    dailyStats: ch.dailyStats,
  }));

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
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

      {/* Add Channel Form */}
      <div className="mb-6">
        <AddChannelForm groupId={id} />
      </div>

      {/* Compare Table */}
      <div className="mb-6">
        <CompareTable channels={channels} />
      </div>

      <div className="mb-6">
        <ViewsChart channels={channelsWithStats} />
      </div>

      {/* Monthly Comparison Table */}
      <div className="mb-6">
        <MonthlyComparisonTable channels={channelsWithStats} />
      </div>

      {/* Monthly Comparison Chart */}
      <div>
        <MonthlyViewsChart channels={channelsWithStats} />
      </div>
    </div>
  );
}
