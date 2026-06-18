import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGroupDetails } from "@/app/actions/groupActions";
import {
  getMonthlyComparisonSettings,
  type MonthlyComparisonSettings,
} from "@/app/actions/monthlyComparisonSettingsActions";
import AddChannelForm from "@/components/AddChannelForm";
import CompareTable from "@/components/CompareTable";
import ViewsChart from "@/components/ViewsChart";
import MonthlyComparisonTable from "@/components/MonthlyComparisonTable";
import MonthlyViewsChart from "@/components/MonthlyViewsChart";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import GroupActionMenu from "@/components/GroupActionMenu";

type DailyStat = {
  date_str: string;
  views: number;
  views_change: number;
  subscribers: number;
  subscribers_change: number;
};

type MonthlyStat = {
  month: string;
  views_gained: number;
};

type Channel = {
  id: string;
  channel_id: string;
  channel_url: string;
  title: string;
  logo_url: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  uploadFrequency: string | null;
  views30Days: number;
  dailyStats?: DailyStat[];
  monthlyStats?: MonthlyStat[];
};

type CompareGroupDetails = {
  name: string;
  icon: string | null;
  accessRole: "OWNER" | "EDITOR" | "VIEWER";
  canEdit: boolean;
  canManageShares: boolean;
  canDelete: boolean;
  channels?: Array<{
    channel: Channel;
  }>;
};

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;

  let group: CompareGroupDetails;
  let monthlyComparisonSettings: MonthlyComparisonSettings;
  try {
    const result = await Promise.all([
      getGroupDetails(id),
      getMonthlyComparisonSettings(),
    ]);

    group = result[0] as CompareGroupDetails;
    monthlyComparisonSettings = result[1];
  } catch (error) {
    console.error("Error fetching group details:", error);
    redirect("/dashboard");
  }

  if (!group) {
    redirect("/dashboard");
  }

  const channels = (group.channels || []).map((gc) => ({
    ...gc.channel,
    dailyStats: gc.channel.dailyStats || [],
    monthlyStats: gc.channel.monthlyStats || [],
  }));

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-indigo-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {"Quay l\u1ea1i Dashboard"}
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {`${channels.length} k\u00eanh \u0111ang \u0111\u01b0\u1ee3c so s\u00e1nh`}
          </p>
        </div>
        {(group.canEdit || group.canManageShares || group.canDelete) && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
            <GroupActionMenu
              groupId={id}
              groupName={group.name}
              currentIcon={group.icon}
              redirectToDashboard={true}
              canEdit={group.canEdit}
              canManageShares={group.canManageShares}
              canDelete={group.canDelete}
            />
          </div>
        )}
      </div>

      {group.canEdit && <AddChannelForm groupId={id} />}
      <CompareTable channels={channels} groupId={id} canEdit={group.canEdit} />
      <ViewsChart channels={channels} />

      {channels.some((channel) => channel.monthlyStats.length > 0) && (
        <>
          <MonthlyComparisonTable channels={channels} initialSettings={monthlyComparisonSettings} />
          <MonthlyViewsChart channels={channels} />
        </>
      )}
    </div>
  );
}
