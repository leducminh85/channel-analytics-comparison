"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Film, Loader2, Play, RefreshCw, Search, X } from "lucide-react";
import { getVideoDetails, listChannelVideos, startVideoSync } from "@/app/actions/videoActions";

type LibraryData = Awaited<ReturnType<typeof listChannelVideos>>;
type Video = LibraryData["videos"][number];
type Detail = Awaited<ReturnType<typeof getVideoDetails>>;
type LibraryChannel = { id: string; title: string; logo_url: string | null };
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50";

function duration(seconds: number | null) {
  if (seconds === null) return "—";
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ""}${String(Math.floor(seconds % 3600 / 60)).padStart(hours ? 2 : 1, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function published(value: string | null) {
  return value ? new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value)) : "Chưa rõ ngày đăng";
}

const compactViews = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function publishedAgo(value: string | null) {
  if (!value) return "Chưa rõ ngày đăng";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 0) return published(value);
  if (seconds < 60) return "Vừa đăng";
  const units: [number, string][] = [[31536000, "năm"], [2592000, "tháng"], [86400, "ngày"], [3600, "giờ"], [60, "phút"]];
  const [size, label] = units.find(([size]) => seconds >= size)!;
  return `${Math.floor(seconds / size)} ${label} trước`;
}

function message(error: unknown) {
  return error instanceof Error && error.message.length < 240 && !/Prisma|invocation|__TURBOPACK__/.test(error.message)
    ? error.message : "Không tải được dữ liệu. Vui lòng thử lại.";
}

function VideoDetail({ video, channelId, groupId, onClose }: {
  video: Video; channelId: string; groupId?: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let cancelled = false;
    getVideoDetails(channelId, video.id, groupId).then(value => {
      if (!cancelled) setDetail(value);
    }).catch(error => { if (!cancelled) setError(message(error)); });
    return () => { cancelled = true; element?.close(); };
  }, [channelId, video.id, groupId]);

  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="video-detail-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
        <span className="text-sm font-semibold text-indigo-600">Chi tiết video</span>
        <button onClick={onClose} aria-label="Đóng chi tiết" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
      </div>
      <div className="space-y-6 p-6">
        <div>
          <h2 id="video-detail-title" className="text-xl font-bold text-slate-900">{video.title}</h2>
          <p className="mt-2 text-sm text-slate-500">{BigInt(video.viewCount).toLocaleString("vi-VN")} lượt xem · {duration(video.durationSeconds)} · {published(video.publishedAt)} (GMT+7)</p>
          <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className={`${buttonClass} mt-4`}>
            <ExternalLink size={15} /> Xem trên YouTube
          </a>
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {!detail && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} /> Đang tải chi tiết...</p>}
        {detail && <>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Mô tả</h3>
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{detail.description || "Video không có mô tả."}</p>
          </section>
        </>}
      </div>
    </dialog>
  );
}

function VideoBrowser({ channel, groupId, canEdit }: { channel: LibraryChannel; groupId?: string; canEdit: boolean }) {
  const channelId = channel.id;
  const [logoFailed, setLogoFailed] = useState(false);
  const [data, setData] = useState<LibraryData | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Video | null>(null);
  const running = data?.sync?.status === "RUNNING";

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load(initial: boolean) {
      if (initial) setLoading(true);
      try {
        const next = await listChannelVideos({ channelId, groupId, page, search: query, sort });
        if (cancelled) return;
        setData(next);
        setError("");
        if (next.sync?.status === "RUNNING") timer = setTimeout(() => load(false), 4000);
      } catch (error) { if (!cancelled) setError(message(error)); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(true);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [channelId, groupId, page, query, sort, revision]);

  async function sync() {
    setStarting(true);
    setError("");
    try { await startVideoSync(channelId, groupId); setRevision(value => value + 1); }
    catch (error) { setError(message(error)); }
    finally { setStarting(false); }
  }

  return <>
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
      <div className="relative min-w-48 flex-1">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input value={search} onChange={event => setSearch(event.target.value)} aria-label="Tìm tiêu đề video" placeholder="Tìm tiêu đề video..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
      </div>
      <select aria-label="Sắp xếp video" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
        <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="views">Nhiều lượt xem nhất</option>
      </select>
      {canEdit && <button onClick={sync} disabled={starting || running} className={`${buttonClass} !border-indigo-200 !bg-indigo-50 !text-indigo-600`}>
        <RefreshCw size={15} className={starting || running ? "animate-spin" : ""} /> {running ? "Đang đồng bộ" : "Đồng bộ toàn bộ video"}
      </button>}
    </div>
    {error && <div role="alert" className="mx-5 mb-4 flex items-center justify-between rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}<button onClick={() => setRevision(value => value + 1)} className="ml-3 underline">Tải lại</button></div>}
    <div aria-live="polite" className="mx-5 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
      <span className="font-semibold text-slate-700">{data?.saved.toLocaleString("vi-VN") || 0} video đã lưu</span>
      <span>Ngày, giờ đăng: GMT+7</span>
      {running ? <span className="flex items-center gap-1.5 text-indigo-600"><Loader2 size={13} className="animate-spin" />{`Đang lấy video · ${data?.sync?.processed || 0} đã xử lý`}</span>
        : data?.sync?.completedAt && <span>Lần hoàn tất: {published(data.sync.completedAt)}</span>}
    </div>
    {data?.sync?.error && <p role="status" className="mx-5 mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{data.sync.error}</p>}
    {loading ? <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="h-64 animate-pulse rounded-xl bg-slate-100" />)}</div>
      : data?.videos.length ? <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
        {data.videos.map(video => <button key={video.id} onClick={() => setSelected(video)} className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-indigo-500">
          <div className="relative aspect-video bg-slate-100">
            {video.thumbnail ? <Image src={video.thumbnail} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover" /> : <Film className="absolute inset-0 m-auto text-slate-300" size={32} />}
            <span className="absolute bottom-2 right-2 rounded bg-slate-950/85 px-1.5 py-0.5 font-mono text-xs text-white">{duration(video.durationSeconds)}</span>
          </div>
          <div className="flex items-start gap-2.5 p-3">
              <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-indigo-50 text-sm font-semibold text-indigo-600">
                {channel.logo_url && !logoFailed ? (
                  <Image src={channel.logo_url} alt="" fill sizes="36px" className="object-cover" onError={() => setLogoFailed(true)} />
                ) : channel.title.charAt(0).toUpperCase()}
              </span>
            <div className="min-w-0 flex-1">
              <h3 title={video.title} className="line-clamp-2 text-sm font-semibold leading-5 text-slate-800 group-hover:text-indigo-600">{video.title}</h3>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs leading-5 text-slate-500">
                <span title={channel.title} className="min-w-0 truncate font-medium">{channel.title}</span>
                <span title={`${BigInt(video.viewCount).toLocaleString("vi-VN")} lượt xem`} className="inline-flex shrink-0 items-center gap-1">
                  <Play size={11} aria-hidden="true" />
                  <span aria-label={`${BigInt(video.viewCount).toLocaleString("vi-VN")} lượt xem`}>{compactViews.format(BigInt(video.viewCount))}</span>
                </span>
                <span className="shrink-0" title={`${published(video.publishedAt)} (GMT+7)`}>{publishedAgo(video.publishedAt)}</span>
              </div>
            </div>
          </div>
        </button>)}
      </div> : <div className="px-5 py-12 text-center">
        <Film size={32} className="mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">{query ? "Không có video khớp từ khóa." : running ? "Đang tải những video đầu tiên…" : "Chưa có video được lưu cho kênh này."}</p>
        {!query && !running && <p className="mt-2 text-xs text-slate-400">{canEdit ? "Bấm Đồng bộ toàn bộ video để bắt đầu." : "Chủ nhóm hoặc người chỉnh sửa có thể đồng bộ video."}</p>}
      </div>}
    {data && data.total > 0 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
      <span>{data.total.toLocaleString("vi-VN")} kết quả · Trang {data.page}/{data.pages}</span>
      <div className="flex gap-2"><button aria-label="Trang trước" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)} className={buttonClass}><ChevronLeft size={16} /></button><button aria-label="Trang sau" disabled={loading || data.page >= data.pages} onClick={() => setPage(data.page + 1)} className={buttonClass}><ChevronRight size={16} /></button></div>
    </div>}
    {selected && <VideoDetail key={selected.id} video={selected} channelId={channelId} groupId={groupId} onClose={() => { setSelected(null); setRevision(value => value + 1); }} />}
  </>;
}

export default function ChannelVideoLibrary({ channels, groupId, canEdit = false, initialChannelId }: {
  channels: LibraryChannel[]; groupId?: string; canEdit?: boolean; initialChannelId?: string;
}) {
  const [selected, setSelected] = useState(initialChannelId || channels[0]?.id || "");
  const channel = channels.find(channel => channel.id === selected) || channels[0];
  if (!channel) return null;
  const channelId = channel.id;
  return <section id="video-library" className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
      <div><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Film size={19} className="text-indigo-500" />Thư viện video</h2><p className="mt-1 text-xs text-slate-500">Khám phá nội dung, lượt xem và lịch đăng của từng kênh.</p></div>
      <select aria-label="Chọn kênh xem video" value={channelId} onChange={event => setSelected(event.target.value)} className="max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">
        {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.title}</option>)}
      </select>
    </div>
    <VideoBrowser key={`${channelId}:${channel.logo_url || ""}`} channel={channel} groupId={groupId} canEdit={canEdit} />
  </section>;
}
