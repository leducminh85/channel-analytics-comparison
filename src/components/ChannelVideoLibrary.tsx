"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, ChartNoAxesColumnIncreasing, CalendarRange, Maximize, Minimize, Eye, EyeOff, TrendingUp, Zap, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Grid2X2, Square, ExternalLink, Film, Loader2, Play, Plus, RefreshCw, Search, X } from "lucide-react";
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

function VideoBrowser({ channel, groupId, canEdit, sort, query, breakoutOnly, startDate, endDate, infinite = false, column = false }: { channel?: LibraryChannel; groupId?: string; canEdit: boolean; sort: string; query: string; breakoutOnly: boolean; startDate: string; endDate: string; infinite?: boolean; column?: boolean }) {
  const channelId = channel?.id;
  const browserRef = useRef<HTMLDivElement>(null);
  const measuredPageSize = useRef<number | null>(null);
  const [pageSize, setPageSize] = useState<number | null>(infinite ? 24 : null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<LibraryData | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Video | null>(null);
  const running = data?.isSyncing;
  const gridClass = column
    ? "grid grid-cols-1 gap-3 px-3 pb-3 @min-[640px]:grid-cols-2"
    : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3 px-5 pb-5";

  useEffect(() => {
    const element = browserRef.current;
    if (!element || infinite) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const width = element.getBoundingClientRect().width;
        const columns = column ? (width >= 640 ? 2 : 1) : Math.max(1, Math.floor((width - 40 + 12) / (340 + 12)));
        // Keep complete rows with at least 12 videos, including after a sidebar resize.
        const nextSize = Math.min(60, Math.ceil(12 / columns) * columns);
        if (measuredPageSize.current !== nextSize) {
          measuredPageSize.current = nextSize;
          setPageSize(nextSize);
          setPage(1);
        }
      }, 150);
    });
    observer.observe(element);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [column, infinite]);

  useEffect(() => {
    if (pageSize === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load(initial: boolean) {
      if (initial) setLoading(true);
      try {
        const next = await listChannelVideos({ channelId, groupId, page, pageSize: pageSize ?? 12, search: query, sort, breakoutOnly, startDate, endDate });
        if (cancelled) return;
        setData(current => {
          if (!infinite || page === 1 || !current) return next;
          const videos = [...current.videos.slice(0, (page - 1) * (pageSize ?? 24)), ...next.videos];
          return { ...next, videos: [...new Map(videos.map(video => [video.id, video])).values()] };
        });
        setError("");
        if (next.isSyncing) timer = setTimeout(() => load(false), 4000);
      } catch (error) { if (!cancelled) setError(message(error)); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(true);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [channelId, groupId, page, pageSize, query, sort, revision, breakoutOnly, startDate, endDate, infinite]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!infinite || !sentinel || loading || error || !data || data.page >= data.pages) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        setLoading(true);
        setPage(data.page + 1);
      }
    }, { root: column ? browserRef.current?.parentElement : browserRef.current, rootMargin: "240px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [infinite, loading, error, data, column]);

  async function sync() {
    if (!channelId) return;
    setStarting(true);
    setError("");
    try { await startVideoSync(channelId, groupId); if (infinite) { setPage(1); setData(null); } setRevision(value => value + 1); }
    catch (error) { setError(message(error)); }
    finally { setStarting(false); }
  }

  return <div ref={browserRef} className={infinite && !column ? "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain" : "min-w-0"}>
    {canEdit && channelId && <div className="flex justify-end px-3 pb-3">
      <button onClick={sync} disabled={starting || running} title={data?.sync?.error || "Đồng bộ video"} aria-label="Đồng bộ video" className={`${buttonClass} !h-9 !w-9 !p-0 !border-indigo-200 !bg-indigo-50 !text-indigo-600`}>
        <RefreshCw size={16} className={starting || running ? "animate-spin" : ""} />
      </button>
    </div>}
    {error && <div role="alert" className="mx-5 mb-4 flex items-center justify-between rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}<button onClick={() => setRevision(value => value + 1)} className="ml-3 underline">Tải lại</button></div>}
    {loading && (!infinite || !data) ? <div className={gridClass}>{[0, 1, 2].map(item => <div key={item} className="h-64 animate-pulse rounded-xl bg-slate-100" />)}</div>
      : data?.videos.length ? <div className={gridClass}>
        {data.videos.map(video => <VideoCard key={video.id} video={video} onSelect={() => setSelected(video)} />)}
      </div> : <div className="px-5 py-12 text-center">
        <Film size={32} className="mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">{query || breakoutOnly || startDate || endDate ? "Không có video phù hợp với bộ lọc." : running ? "Đang tải những video đầu tiên…" : (channelId ? "Chưa có video được lưu cho kênh này." : "Chưa có video được lưu trong nhóm.")}</p>
        {!query && !breakoutOnly && !startDate && !endDate && !running && <p className="mt-2 text-xs text-slate-400">{canEdit ? (channelId ? "Bấm biểu tượng đồng bộ để lấy video." : "Chọn chế độ Một kênh để đồng bộ video của từng kênh.") : "Chủ nhóm hoặc người chỉnh sửa có thể đồng bộ video."}</p>}
      </div>}
    {!infinite && data && data.total > 0 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
      <span>{data.total.toLocaleString("vi-VN")} kết quả · Trang {data.page}/{data.pages}</span>
      <div className="flex gap-2"><button aria-label="Trang trước" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)} className={buttonClass}><ChevronLeft size={16} /></button><button aria-label="Trang sau" disabled={loading || data.page >= data.pages} onClick={() => setPage(data.page + 1)} className={buttonClass}><ChevronRight size={16} /></button></div>
    </div>}
    {infinite && <div ref={sentinelRef} role="status" className={loading ? "flex items-center justify-center gap-2 px-5 py-4 text-sm text-slate-500" : "h-px"}>
      {loading && <><Loader2 size={16} className="animate-spin" />Đang tải…</>}
    </div>}
    {selected && <VideoDetail key={selected.id} video={selected} channelId={selected.channelId} groupId={groupId} onClose={() => { setSelected(null); setRevision(value => value + 1); }} />}
  </div>;
}

function VideoCard({ video, onSelect }: { video: Video; onSelect: () => void }) {
  const [logoFailed, setLogoFailed] = useState(false);
  return (<button onClick={onSelect} className="group flex h-full w-full flex-col overflow-hidden rounded-xl bg-transparent p-2 text-left transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-indigo-500">
          <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-slate-100">
            {video.thumbnail ? <Image src={video.thumbnail} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1440px) 33vw, 25vw" className="object-cover" /> : <Film className="absolute inset-0 m-auto text-slate-300" size={32} />}
            {video.breakoutScore !== null && video.breakoutScore > 2 && <span title={`Điểm đột biến: ${video.breakoutScore}x`} aria-label={`Điểm đột biến ${video.breakoutScore}x`} className={`absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-xs font-bold text-white shadow-sm ${video.breakoutScore >= 10 ? "bg-rose-600" : "bg-blue-600"}`}>
              {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(video.breakoutScore)}x
            </span>}
            <span className="absolute bottom-2 right-2 rounded bg-slate-950/85 px-1.5 py-0.5 font-mono text-xs text-white">{duration(video.durationSeconds)}</span>
          </div>
          <div className="flex w-full items-start gap-2.5 px-1 pb-1 pt-3">
              <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-indigo-50 text-sm font-semibold text-indigo-600">
                {video.channel.logo_url && !logoFailed ? (
                  <Image src={video.channel.logo_url} alt="" fill sizes="36px" className="object-cover" onError={() => setLogoFailed(true)} />
                ) : video.channel.title.charAt(0).toUpperCase()}
              </span>
            <div className="min-w-0 flex-1">
              <h3 title={video.title} className="line-clamp-2 h-10 break-words text-sm font-semibold leading-5 text-slate-800 group-hover:text-indigo-600">{video.title}</h3>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs leading-5 text-slate-500">
                <span title={video.channel.title} className="min-w-0 truncate font-medium">{video.channel.title}</span>
                <span title={`${BigInt(video.viewCount).toLocaleString("vi-VN")} lượt xem`} className="inline-flex shrink-0 items-center gap-1">
                  <Play size={11} aria-hidden="true" />
                  <span aria-label={`${BigInt(video.viewCount).toLocaleString("vi-VN")} lượt xem`}>{compactViews.format(BigInt(video.viewCount))}</span>
                </span>
                <span className="shrink-0" title={`${published(video.publishedAt)} (GMT+7)`}>{publishedAgo(video.publishedAt)}</span>
              </div>
            </div>
          </div>
        </button>
  );
}

function ChannelAvatar({ channel }: { channel: LibraryChannel }) {
  const [failed, setFailed] = useState(false);
  return <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-indigo-50 text-xs font-semibold text-indigo-600">
    {channel.logo_url && !failed ? <Image src={channel.logo_url} alt="" fill sizes="32px" className="object-cover" onError={() => setFailed(true)} /> : channel.title.charAt(0).toUpperCase()}
  </span>;
}

function ChannelPicker({ channels, selected, onSelect, label = "Chọn kênh xem video" }: { channels: LibraryChannel[]; selected: LibraryChannel; onSelect: (id: string) => void; label?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || !popup.current) return;
    const below = window.innerHeight - rect.bottom - 12;
    const height = Math.min(360, Math.max(below, rect.top - 12));
    Object.assign(popup.current.style, {
      width: `${Math.min(rect.width, window.innerWidth - 16)}px`,
      left: `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`,
      top: below >= Math.min(360, rect.top - 12) ? `${rect.bottom + 6}px` : "auto",
      bottom: below >= Math.min(360, rect.top - 12) ? "auto" : `${window.innerHeight - rect.top + 6}px`,
      maxHeight: `${height}px`,
    });
    popup.current.showPopover();
  }
  useEffect(() => {
    const close = (event: Event) => {
      if (event.type === "wheel" && popup.current?.contains(event.target as Node)) return;
      popup.current?.hidePopover();
    };
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, true);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("wheel", close, true); };
  }, []);
  return <div className="min-w-0 flex-1" onKeyDown={event => {
    if (event.key === "Escape") { popup.current?.hidePopover(); trigger.current?.focus(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      const options = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>("button") || []);
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = current < 0 ? (event.key === "ArrowDown" ? 0 : options.length - 1) : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  }}>
    <button ref={trigger} aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => open ? popup.current?.hidePopover() : show()} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 focus-visible:outline-indigo-500">
      <ChannelAvatar key={selected.id} channel={selected} /><span className="min-w-0 flex-1 truncate text-left">{selected.title}</span><ChevronDown size={16} className="shrink-0 text-slate-400" />
    </button>
    <div id={id} ref={popup} popover="auto" onToggle={event => setOpen(event.newState === "open")} style={{ position: "fixed", inset: "auto", margin: 0 }} className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
      <div className="px-2 py-2 text-xs font-medium text-slate-400">Chọn kênh · {channels.length}</div>
      <div role="group" aria-label="Danh sách kênh">
        {channels.map(channel => <button key={channel.id} aria-pressed={selected.id === channel.id} onClick={() => {
          onSelect(channel.id); popup.current?.hidePopover(); trigger.current?.focus();
        }} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition focus-visible:outline-indigo-500 ${selected.id === channel.id ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
          <ChannelAvatar channel={channel} /><span className="min-w-0 flex-1 truncate" title={channel.title}>{channel.title}</span>{selected.id === channel.id && <Check size={16} className="shrink-0" />}
        </button>)}
      </div>
    </div>
  </div>;
}

function AddColumnsModal({ channels, onAdd, onClose }: { channels: LibraryChannel[]; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const titleId = useId();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const ids = selected.filter(id => channels.some(channel => channel.id === id));
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/40">
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 id={titleId} className="font-semibold text-slate-900">Chọn kênh thêm vào cột</h2><button onClick={onClose} aria-label="Đóng chọn kênh" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
    <div className="max-h-[50dvh] space-y-1 overflow-y-auto p-3">
      {channels.map(channel => <label key={channel.id} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 ${ids.includes(channel.id) ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
        <input type="checkbox" checked={ids.includes(channel.id)} onChange={event => setSelected(current => event.target.checked ? [...current, channel.id] : current.filter(id => id !== channel.id))} className="h-4 w-4 accent-indigo-600" />
        <ChannelAvatar channel={channel} /><span className="min-w-0 truncate text-sm text-slate-700">{channel.title}</span>
      </label>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4">
      <button disabled={!channels.length} onClick={() => onAdd(channels.map(channel => channel.id))} className={buttonClass}>Thêm tất cả ({channels.length})</button>
      <button disabled={!ids.length} onClick={() => onAdd(ids)} className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white`}>Thêm đã chọn ({ids.length})</button>
    </div>
  </dialog>;
}

export default function ChannelVideoLibrary({ channels, groupId, canEdit = false, initialChannelId }: {
  channels: LibraryChannel[]; groupId?: string; canEdit?: boolean; initialChannelId?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(true);
  const expandedDialogRef = useRef<HTMLDialogElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const libraryBodyId = useId();
  function toggleFullscreen() {
    setCollapsed(false);
    setFullscreen(value => !value);
  }
  useEffect(() => {
    if (!fullscreen) {
      const frame = requestAnimationFrame(() => fullscreenButtonRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    const dialog = expandedDialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);
  const [selected, setSelected] = useState(initialChannelId || channels[0]?.id || "");
  const [mode, setMode] = useState<"single" | "all" | "columns">("single");
  const [sort, setSort] = useState("newest");
  const [breakoutOnly, setBreakoutOnly] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [datesOpen, setDatesOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<number | null>(null);
  const datePanelId = useId();
  const datePopupRef = useRef<HTMLDivElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  function positionDatePopup() {
    const popup = datePopupRef.current;
    const button = dateButtonRef.current;
    if (!popup || !button) return;
    const rect = button.getBoundingClientRect();
    const below = rect.bottom + 8;
    const top = below + popup.offsetHeight <= window.innerHeight - 8 ? below : rect.top - popup.offsetHeight - 8;
    popup.style.left = `${Math.max(8, Math.min(rect.right - popup.offsetWidth, window.innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, top)}px`;
  }
  function closeDatePopup() {
    datePopupRef.current?.hidePopover();
    dateButtonRef.current?.focus({ preventScroll: true });
  }
  function toggleDatePopup() {
    const popup = datePopupRef.current;
    if (!popup) return;
    if (popup.matches(":popover-open")) { closeDatePopup(); return; }
    popup.showPopover();
    positionDatePopup();
  }
  useEffect(() => {
    if (!datesOpen) return;
    window.addEventListener("resize", positionDatePopup);
    window.addEventListener("scroll", positionDatePopup, true);
    return () => {
      window.removeEventListener("resize", positionDatePopup);
      window.removeEventListener("scroll", positionDatePopup, true);
    };
  }, [datesOpen]);
  function selectRecentMonths(months: number, now: number) {
    const today = new Date(now + 7 * 60 * 60 * 1000);
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, 1));
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(today.getUTCDate(), lastDay));
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(today.toISOString().slice(0, 10));
    setDatePreset(months);
    closeDatePopup();
  }
  const invalidDates = Boolean(startDate && endDate && startDate > endDate);
  const filterKey = `${breakoutOnly}:${startDate}:${endDate}:${fullscreen}`;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [columns, setColumns] = useState(() => channels.slice(0, 3).map((channel, index) => ({ id: index, channelId: channel.id })));
  const nextColumnId = useRef(3);
  const channel = channels.find(channel => channel.id === selected) || channels[0];
  const visibleColumns = columns.filter(column => channels.some(channel => channel.id === column.channelId));
  const availableChannels = channels.filter(channel => !visibleColumns.some(column => column.channelId === channel.id));
  const [addingColumns, setAddingColumns] = useState(false);
  function addColumns(ids: string[]) {
    const additions = availableChannels.filter(channel => ids.includes(channel.id)).map(channel => ({ id: nextColumnId.current++, channelId: channel.id }));
    setColumns(current => [...current, ...additions.filter(item => !current.some(existing => existing.channelId === item.channelId))]);
    setAddingColumns(false);
  }
  if (!channel) return null;
  const content = <section ref={sectionRef} id="video-library" className={fullscreen ? "flex h-full flex-col overflow-hidden bg-white" : "scroll-mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"}>
    <div className={`flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-4 ${fullscreen ? "sticky top-0 z-20 border-b border-slate-100 bg-white" : ""}`}>
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Film size={19} className="text-indigo-500" />Thư viện video</h2>
      <div className="flex flex-wrap items-center gap-2">
        {!collapsed && <>
        <div role="group" aria-label="Lọc video" className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button title="Video đột biến (điểm > 2)" aria-label="Video đột biến" aria-pressed={breakoutOnly} onClick={() => {
            setBreakoutOnly(!breakoutOnly);
            if (breakoutOnly && sort === "breakout") setSort("newest");
          }} className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${breakoutOnly ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-blue-600"}`}><Zap size={19} /></button>
          <button title={startDate || endDate ? `Ngày đăng: ${startDate || "Không giới hạn"} → ${endDate || "Không giới hạn"} (GMT+7)` : "Lọc ngày đăng (GMT+7)"} aria-label="Lọc ngày đăng" aria-expanded={datesOpen} aria-controls={datePanelId} aria-haspopup="dialog" ref={dateButtonRef} onClick={toggleDatePopup} className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${startDate || endDate ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-indigo-600"}`}><CalendarRange size={19} /></button>
        </div>
      <div role="group" aria-label="Sắp xếp video" className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {([
          ["newest", "Mới nhất", ArrowDownWideNarrow],
          ["oldest", "Cũ nhất", ArrowUpWideNarrow],
          ["views", "Phổ biến nhất (lượt xem)", ChartNoAxesColumnIncreasing],
          ["breakout", "Điểm đột biến cao nhất", TrendingUp],
        ] as const).filter(([value]) => value !== "breakout" || breakoutOnly).map(([value, label, Icon]) => <button key={value} title={label} aria-label={label} aria-pressed={sort === value} onClick={() => setSort(value)} className={`flex h-10 w-10 items-center justify-center rounded-lg transition focus-visible:outline-indigo-500 ${sort === value ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Icon size={19} aria-hidden="true" /></button>)}
      </div>
        <button ref={fullscreenButtonRef} aria-label={fullscreen ? "Thu nhỏ thư viện" : "Mở rộng thư viện"} title={fullscreen ? "Thu nhỏ" : "Mở rộng"} onClick={() => { datePopupRef.current?.hidePopover(); toggleFullscreen(); }} className={`${buttonClass} !h-9 !w-9 !p-0`}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
        </>}
        <button aria-label={collapsed ? "Hiện thư viện video" : "Ẩn thư viện video"} title={collapsed ? "Hiện thư viện" : "Ẩn thư viện"} aria-expanded={!collapsed} aria-controls={libraryBodyId} onClick={() => { datePopupRef.current?.hidePopover(); if (fullscreen) setFullscreen(false); setCollapsed(value => !value); }} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">{collapsed ? <Eye size={16} /> : <EyeOff size={16} />}</button>
      </div>
    </div>
    {!collapsed && <div id={libraryBodyId} className={fullscreen ? "flex min-h-0 flex-1 flex-col" : undefined}>
    <div id={datePanelId} ref={datePopupRef} popover="auto" role="dialog" aria-label="Lọc ngày đăng video"
      onToggle={event => setDatesOpen(event.newState === "open")}
      className="fixed inset-auto m-0 w-80 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Lọc ngày đăng <span className="font-normal text-slate-400">(GMT+7)</span></h3>
        <button aria-label="Đóng bộ lọc ngày" onClick={closeDatePopup} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X size={16} /></button>
      </div>
      <p className="mb-2 text-xs font-medium text-slate-500">Gần nhất</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {[1, 3].map(months => <button key={months} title={`${months} tháng gần nhất`} aria-pressed={datePreset === months} onClick={() => selectRecentMonths(months, Date.now())} className={`flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-indigo-500 ${datePreset === months ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"}`}>
          {datePreset === months && <Check size={14} aria-hidden="true" />}{months} tháng
        </button>)}
      </div>
      <div className="space-y-3 border-t border-slate-100 pt-3">
        <label className="block space-y-1 text-xs text-slate-600"><span className="block">Từ ngày</span><input type="date" aria-label="Ngày bắt đầu" value={startDate} max={endDate || undefined} onChange={event => { setStartDate(event.target.value); setDatePreset(null); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
        <label className="block space-y-1 text-xs text-slate-600"><span className="block">Đến ngày</span><input type="date" aria-label="Ngày kết thúc" value={endDate} min={startDate || undefined} onChange={event => { setEndDate(event.target.value); setDatePreset(null); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
        {invalidDates && <p role="alert" className="text-xs text-rose-600">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
        <button disabled={!startDate && !endDate} onClick={() => { setStartDate(""); setEndDate(""); setDatePreset(null); }} className={`${buttonClass} w-full`}>Xóa lọc</button>
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pb-4">
      {groupId && <div role="group" aria-label="Chế độ xem video" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {([["single", "Một kênh", Square], ["all", "Tất cả kênh", Grid2X2], ["columns", "Theo cột", Columns3]] as const).map(([value, label, Icon]) =>
          <button key={value} title={label} aria-label={label} aria-pressed={mode === value} onClick={() => setMode(value)} className={`flex h-10 w-10 items-center justify-center rounded-lg transition focus-visible:outline-indigo-500 ${mode === value ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Icon size={19} aria-hidden="true" /></button>
        )}
      </div>}
      {mode === "single" && <div className="w-full sm:w-80"><ChannelPicker channels={channels} selected={channel} onSelect={setSelected} /></div>}
      {/* {mode === "all" && <p className="text-xs text-slate-500">Video từ {channels.length} kênh, sắp xếp chung trong một danh sách.</p>} */}
      {mode === "columns" && <button disabled={!availableChannels.length} onClick={() => {
        if (availableChannels.length === 1) addColumns([availableChannels[0].id]);
        else setAddingColumns(true);
      }} className={buttonClass}><Plus size={15} />Thêm cột</button>}
    </div>
    <div className="shrink-0 px-5 pb-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input value={search} onChange={event => setSearch(event.target.value)} aria-label="Tìm tiêu đề video" placeholder="Tìm tiêu đề video..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-10 text-sm outline-none focus:border-indigo-400" />
        {search && <button onClick={() => setSearch("")} aria-label="Xóa tìm kiếm" title="Xóa tìm kiếm" className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>}
      </div>
    </div>
    {invalidDates && <p role="alert" className="px-5 pb-4 text-sm text-rose-600">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>}
    {!invalidDates && mode === "single" && <VideoBrowser key={`single:${channel.id}:${sort}:${query}:${filterKey}`} channel={channel} groupId={groupId} canEdit={canEdit} infinite={fullscreen} sort={sort} query={query} breakoutOnly={breakoutOnly} startDate={startDate} endDate={endDate} />}
    {!invalidDates && mode === "all" && groupId && <VideoBrowser key={`all:${groupId}:${sort}:${query}:${filterKey}`} groupId={groupId} canEdit={canEdit} infinite={fullscreen} sort={sort} query={query} breakoutOnly={breakoutOnly} startDate={startDate} endDate={endDate} />}
    {!invalidDates && mode === "columns" && <>
      {!visibleColumns.length && <p className="p-8 text-center text-sm text-slate-500">Chưa có cột nào. Bấm Thêm cột để chọn kênh.</p>}
      <div aria-label="Danh sách cột video" tabIndex={0} className={`flex gap-4 overflow-x-auto px-5 pb-5 ${fullscreen ? "min-h-0 flex-1 items-stretch" : "items-start"}`}>
        {visibleColumns.map((column, index) => {
          const columnChannel = channels.find(channel => channel.id === column.channelId)!;
          return <section key={column.id} aria-label={`Cột ${index + 1}`} className={`@container min-w-[min(340px,calc(100vw-4rem))] flex-1 basis-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40 ${fullscreen ? "flex min-h-0 flex-col" : ""}`}>
            <div className="flex shrink-0 items-center gap-2 p-3">
              <ChannelPicker label={`Kênh cột ${index + 1}`} selected={columnChannel}
                channels={channels.filter(channel => channel.id === column.channelId || !visibleColumns.some(item => item.channelId === channel.id))}
                onSelect={id => setColumns(current => current.map(item => item.id === column.id ? { ...item, channelId: id } : item))} />
              <button aria-label={`Xóa cột ${index + 1}`} onClick={() => setColumns(current => current.filter(item => item.id !== column.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={16} /></button>
            </div>
            <div className={fullscreen ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "max-h-[75vh] overflow-y-auto"}>
              <VideoBrowser key={`${column.channelId}:${sort}:${query}:${filterKey}`} channel={columnChannel} groupId={groupId} canEdit={canEdit} infinite={fullscreen} sort={sort} query={query} breakoutOnly={breakoutOnly} startDate={startDate} endDate={endDate} column />
            </div>
          </section>;
        })}
      </div>
    </>}
    {addingColumns && <AddColumnsModal channels={availableChannels} onAdd={addColumns} onClose={() => setAddingColumns(false)} />}
    </div>}
  </section>;
  return fullscreen ? <dialog ref={expandedDialogRef} aria-label="Thư viện video mở rộng"
    onCancel={event => { if (event.target === event.currentTarget) { event.preventDefault(); setFullscreen(false); } }}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-white p-0 backdrop:bg-slate-950/40">
    {content}
  </dialog> : content;
}
