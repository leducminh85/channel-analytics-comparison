"use client";

import Image from "next/image";
import { Eye, Video, Users, TrendingUp, Clock, ExternalLink, Trash2 } from "lucide-react";
import { removeChannelFromGroup } from "@/app/actions/channelActions";
import { useState, useTransition } from "react";
import ActionMenu from "./ActionMenu";
import ConfirmModal from "./ConfirmModal";

interface Channel {
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
  dailyStats?: { date_str: string }[];
  monthlyStats?: { month: string }[];
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString("vi-VN");
}

function hasVidiqData(channel: Channel): boolean {
  return Boolean(channel.dailyStats?.length || channel.monthlyStats?.length);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function CompareTable({
  channels,
  groupId
}: {
  channels: Channel[],
  groupId: string
}) {
  const [isPending, startTransition] = useTransition();
  const [deletingChannel, setDeletingChannel] = useState<{id: string, title: string} | null>(null);

  const handleConfirmDelete = () => {
    if (!deletingChannel) return;

    startTransition(async () => {
      try {
        await removeChannelFromGroup(deletingChannel.id, groupId);
        setDeletingChannel(null);
      } catch (error: unknown) {
        alert(getErrorMessage(error, "Khong the xoa kenh khoi nhom"));
        setDeletingChannel(null);
      }
    });
  };

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16">
        <div className="mb-3 rounded-full bg-slate-100 p-4">
          <Users className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-500">
          ChÆ°a cÃ³ kÃªnh nÃ o trong nhÃ³m
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Sá»­ dá»¥ng form phÃ­a trÃªn Ä‘á»ƒ thÃªm kÃªnh Youtube
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto overflow-y-visible pb-32 -mb-32">
        <table className="compare-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                KÃªnh
              </th>
              <th className="whitespace-nowrap px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div className="flex items-center justify-end gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> Tá»•ng Views
                </div>
              </th>
              <th className="whitespace-nowrap px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div className="flex items-center justify-end gap-1.5">
                  <Video className="h-3.5 w-3.5" /> Sá»‘ Video
                </div>
              </th>
              <th className="whitespace-nowrap px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div className="flex items-center justify-end gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Subscriber
                </div>
              </th>
              <th className="whitespace-nowrap px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div className="flex items-center justify-end gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Views (30 ngÃ y)
                </div>
              </th>
              <th className="whitespace-nowrap px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Chu kÃ¬ Ä‘Äƒng
                </div>
              </th>
              <th className="whitespace-nowrap px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                {/* Actions */}
              </th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => (
              <tr
                key={channel.id}
                className="group border-b border-slate-50 transition-colors last:border-0 hover:bg-indigo-50/30"
              >
                {/* Channel identity */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-slate-100">
                      {channel.logo_url ? (
                        <Image
                          src={channel.logo_url}
                          alt={channel.title}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-indigo-100 text-sm font-bold text-indigo-600">
                          {channel.title.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <a
                        href={channel.channel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm font-semibold text-slate-800 transition-colors hover:text-indigo-600"
                      >
                        <span className="truncate">{channel.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    </div>
                  </div>
                </td>

                {/* Total views */}
                <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm font-medium text-slate-700">
                  {formatNumber(channel.viewCount)}
                </td>

                {/* Video count */}
                <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm font-medium text-slate-700">
                  {formatNumber(channel.videoCount)}
                </td>

                {/* Subscriber count */}
                <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm font-medium text-slate-700">
                  {formatNumber(channel.subscriberCount)}
                </td>

                {/* Views in the last 30 days */}
                <td className="whitespace-nowrap px-5 py-4 text-right">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      hasVidiqData(channel)
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <TrendingUp className="h-3 w-3" />
                    {formatNumber(channel.views30Days)}
                  </span>
                </td>

                {/* Upload frequency */}
                <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                  {channel.uploadFrequency || "N/A"}
                </td>

                {/* Row actions */}
                <td className="px-5 py-4 text-center relative overflow-visible">
                  <ActionMenu
                    items={[
                      {
                        label: "XÃ³a khá»i nhÃ³m",
                        icon: <Trash2 className="h-4 w-4" />,
                        onClick: () => setDeletingChannel({ id: channel.id, title: channel.title }),
                        variant: "destructive",
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={!!deletingChannel}
        onClose={() => setDeletingChannel(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isPending}
        title="XÃ³a kÃªnh khá»i nhÃ³m"
        description={`Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a kÃªnh "${deletingChannel?.title}" khá»i nhÃ³m so sÃ¡nh nÃ y?`}
        confirmText="XÃ³a kÃªnh"
      />
    </div>
  );
}
