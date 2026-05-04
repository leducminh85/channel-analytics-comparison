import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGroups } from "@/app/actions/groupActions";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const groups = await getGroups();

  return (
    <DashboardClient
      groups={groups}
      userName={session.user?.name || session.user?.email || "Bạn"}
    />
  );
}
