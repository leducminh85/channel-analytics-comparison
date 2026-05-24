"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { getUsers, createUser, deleteUser, resetPassword } from "@/app/actions/userActions";
import {
  deleteAdminChannel,
  getAdminChannels,
  updateAdminChannel,
  updateAllAdminChannels,
} from "@/app/actions/channelActions";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Eye,
  Key,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  TrendingUp,
  User as UserIcon,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  createdAt: Date | string;
}

interface AdminChannel {
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
  groupsCount: number;
  createdAt: string;
  updatedAt: string;
}

type ConfirmState =
  | { type: "delete-user"; user: AdminUser }
  | { type: "update-all-channels" }
  | { type: "delete-channel"; channel: AdminChannel }
  | null;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatNumber(num: number) {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString("vi-VN");
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [channelSearchTerm, setChannelSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"create" | "reset">("create");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [updatingAllChannels, setUpdatingAllChannels] = useState(false);
  const [updatingChannelIds, setUpdatingChannelIds] = useState<Record<string, boolean>>({});

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchChannels();
  }, []);

  async function fetchUsers() {
    setLoadingUsers(true);
    try {
      const data = await getUsers();
      setUsers(data as AdminUser[]);
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error, "Không thể tải danh sách user") });
    } finally {
      setLoadingUsers(false);
    }
  }

  async function fetchChannels() {
    setLoadingChannels(true);
    try {
      const data = await getAdminChannels();
      setChannels(data);
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error, "Không thể tải danh sách kênh") });
    } finally {
      setLoadingChannels(false);
    }
  }

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      await createUser({ name, email, password, role });
      setMessage({ type: "success", text: "Tạo tài khoản thành công" });
      setIsModalOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error, "Không thể tạo tài khoản") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;

    setSubmitting(true);
    setMessage(null);

    try {
      await resetPassword(selectedUser.id, password);
      setMessage({ type: "success", text: "Đặt lại mật khẩu thành công" });
      setIsModalOpen(false);
      resetForm();
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error, "Không thể đặt lại mật khẩu") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    setSubmitting(true);
    setMessage(null);
    try {
      await deleteUser(user.id);
      await fetchUsers();
      setConfirmState(null);
      setMessage({ type: "success", text: `Đã xoá tài khoản ${user.email || user.name || ""}` });
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error, "Không thể xoá tài khoản") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateChannel = async (channel: AdminChannel) => {
    setUpdatingChannelIds((current) => ({ ...current, [channel.id]: true }));
    setMessage(null);

    try {
      const result = await updateAdminChannel(channel.id);
      setChannels((current) =>
        current.map((item) => (item.id === channel.id ? result.channel : item))
      );
      setMessage({
        type: result.warning ? "error" : "success",
        text: result.warning || `Đã cập nhật kênh ${result.channel.title}`,
      });
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error, "Không thể cập nhật kênh") });
    } finally {
      setUpdatingChannelIds((current) => {
        const next = { ...current };
        delete next[channel.id];
        return next;
      });
    }
  };

  const handleUpdateAllChannels = async () => {
    if (channels.length === 0) return;

    setUpdatingAllChannels(true);
    setMessage(null);
    setConfirmState(null);

    try {
      const result = await updateAllAdminChannels();
      await fetchChannels();

      if (result.failed.length > 0) {
        const failedText = result.failed
          .slice(0, 3)
          .map((item) => `${item.title}: ${item.message}`)
          .join("; ");
        const suffix = result.failed.length > 3 ? `; và ${result.failed.length - 3} kênh khác` : "";
        setMessage({
          type: "error",
          text: `Đã cập nhật ${result.updated}/${result.total} kênh. Lỗi: ${failedText}${suffix}`,
        });
      } else {
        setMessage({ type: "success", text: `Đã cập nhật ${result.updated}/${result.total} kênh` });
      }
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error, "Không thể cập nhật toàn bộ kênh") });
    } finally {
      setUpdatingAllChannels(false);
    }
  };

  const handleDeleteChannel = async (channel: AdminChannel) => {
    setUpdatingChannelIds((current) => ({ ...current, [channel.id]: true }));
    setMessage(null);

    try {
      await deleteAdminChannel(channel.id);
      setChannels((current) => current.filter((item) => item.id !== channel.id));
      setConfirmState(null);
      setMessage({ type: "success", text: `Đã xóa kênh ${channel.title}` });
    } catch (error: unknown) {
      setMessage({ type: "error", text: getErrorMessage(error, "Không thể xóa kênh") });
    } finally {
      setUpdatingChannelIds((current) => {
        const next = { ...current };
        delete next[channel.id];
        return next;
      });
    }
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("USER");
    setSelectedUser(null);
  };

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [searchTerm, users]
  );

  const filteredChannels = useMemo(
    () =>
      channels.filter(
        (channel) =>
          channel.title.toLowerCase().includes(channelSearchTerm.toLowerCase()) ||
          channel.channel_url.toLowerCase().includes(channelSearchTerm.toLowerCase()) ||
          channel.channel_id.toLowerCase().includes(channelSearchTerm.toLowerCase())
      ),
    [channelSearchTerm, channels]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Shield className="text-indigo-600" />
            Quản trị hệ thống
          </h1>
          <p className="mt-1 text-slate-500">Quản lý người dùng, phân quyền và dữ liệu kênh</p>
        </div>
        <button
          onClick={() => {
            setModalType("create");
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700"
        >
          <UserPlus size={18} />
          Cấp tài khoản mới
        </button>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 ${
            message.type === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto opacity-50 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Users className="h-5 w-5 text-indigo-600" />
              Quản lý người dùng
            </h2>
            <p className="mt-1 text-sm text-slate-500">Tổng cộng {users.length} người dùng</p>
          </div>
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Tìm kiếm theo tên hoặc email..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-6 py-4">Người dùng</th>
                <th className="px-6 py-4">Vai trò</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingUsers
                ? Array.from({ length: 3 }).map((_, index) => (
                    <tr key={index} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="h-10 w-40 rounded-lg bg-slate-100" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-6 w-20 rounded-full bg-slate-100" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-6 w-24 rounded-lg bg-slate-100" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="ml-auto h-8 w-8 rounded-lg bg-slate-100" />
                      </td>
                    </tr>
                  ))
                : filteredUsers.map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 text-indigo-600">
                            <UserIcon size={20} />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{user.name || "N/A"}</div>
                            <div className="text-sm text-slate-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                            user.role === "ADMIN"
                              ? "border-amber-100 bg-amber-50 text-amber-600"
                              : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setModalType("reset");
                              setIsModalOpen(true);
                            }}
                            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-indigo-50 hover:text-indigo-600"
                            title="Đổi mật khẩu"
                          >
                            <Key size={18} />
                          </button>
                          <button
                            onClick={() => setConfirmState({ type: "delete-user", user })}
                            className="rounded-lg p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600"
                            title="Xoá tài khoản"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!loadingUsers && filteredUsers.length === 0 && (
            <div className="p-12 text-center text-slate-500">Không tìm thấy người dùng nào phù hợp</div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/50 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Database className="h-5 w-5 text-indigo-600" />
              Quản lý kênh
            </h2>
            <p className="mt-1 text-sm text-slate-500">Tổng cộng {channels.length} kênh trong hệ thống</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Tìm theo tên, đường dẫn hoặc mã kênh..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={channelSearchTerm}
                onChange={(event) => setChannelSearchTerm(event.target.value)}
              />
            </div>
            <button
              onClick={() => setConfirmState({ type: "update-all-channels" })}
              disabled={updatingAllChannels || loadingChannels || channels.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updatingAllChannels ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Cập nhật toàn bộ
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-5 py-4">Kênh</th>
                <th className="px-5 py-4 text-right">Tổng Views</th>
                <th className="px-5 py-4 text-right">Số Video</th>
                <th className="px-5 py-4 text-right">Subscriber</th>
                <th className="px-5 py-4 text-right">Views (30 ngày)</th>
                <th className="px-5 py-4">Chu kỳ đăng</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingChannels
                ? Array.from({ length: 4 }).map((_, index) => (
                    <tr key={index} className="animate-pulse">
                      <td className="px-5 py-4">
                        <div className="h-11 w-56 rounded-lg bg-slate-100" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="ml-auto h-6 w-20 rounded bg-slate-100" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="ml-auto h-6 w-16 rounded bg-slate-100" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="ml-auto h-6 w-20 rounded bg-slate-100" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="ml-auto h-6 w-20 rounded bg-slate-100" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="h-6 w-28 rounded bg-slate-100" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="ml-auto h-8 w-20 rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                : filteredChannels.map((channel) => {
                    const isUpdating = Boolean(updatingChannelIds[channel.id]);

                    return (
                      <tr key={channel.id} className="transition-colors hover:bg-indigo-50/30">
                        <td className="px-5 py-4">
                          <div className="flex min-w-64 items-center gap-3">
                            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                              {channel.logo_url ? (
                                <Image
                                  src={channel.logo_url}
                                  alt={channel.title}
                                  fill
                                  sizes="44px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-indigo-600">
                                  {channel.title.charAt(0)}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <a
                                href={channel.channel_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 font-semibold text-slate-900 hover:text-indigo-600"
                              >
                                <span className="truncate">{channel.title}</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              </a>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span>{channel.channel_id}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                                  {channel.groupsCount} nhóm
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm text-slate-700">
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Eye className="h-3.5 w-3.5 text-slate-400" />
                            {formatNumber(channel.viewCount)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm text-slate-700">
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Video className="h-3.5 w-3.5 text-slate-400" />
                            {formatNumber(channel.videoCount)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-sm text-slate-700">
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            {formatNumber(channel.subscriberCount)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <TrendingUp className="h-3 w-3" />
                            {formatNumber(channel.views30Days)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {channel.uploadFrequency || "N/A"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleUpdateChannel(channel)}
                              disabled={isUpdating || updatingAllChannels}
                              className="rounded-lg p-2 text-slate-400 transition-all hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Cập nhật kênh"
                            >
                              {isUpdating ? (
                                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                              ) : (
                                <RefreshCw size={18} />
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmState({ type: "delete-channel", channel })}
                              disabled={updatingAllChannels}
                              className="rounded-lg p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Xóa khỏi hệ thống"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loadingChannels && filteredChannels.length === 0 && (
            <div className="p-12 text-center text-slate-500">Không tìm thấy kênh nào phù hợp</div>
          )}
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                {modalType === "create" ? (
                  <UserPlus className="text-indigo-600" />
                ) : (
                  <Key className="text-indigo-600" />
                )}
                {modalType === "create" ? "Cấp tài khoản mới" : "Đặt lại mật khẩu"}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={modalType === "create" ? handleCreateUser : handleResetPassword}
              className="space-y-4 p-6"
            >
              {modalType === "create" && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Tên hiển thị</label>
                    <input
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                    <input
                      required
                      type="email"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Vai trò</label>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                </>
              )}

              {modalType === "reset" && (
                <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-700">
                  Đang đặt lại mật khẩu cho: <strong>{selectedUser?.email}</strong>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {modalType === "create" ? "Mật khẩu ban đầu" : "Mật khẩu mới"}
                </label>
                <input
                  required
                  type="password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  minLength={6}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2 font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? "Đang xử lý..." : modalType === "create" ? "Tạo tài khoản" : "Cập nhật"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmState !== null}
        onClose={() => setConfirmState(null)}
        onConfirm={() => {
          if (!confirmState) return;
          if (confirmState.type === "delete-user") {
            void handleDeleteUser(confirmState.user);
            return;
          }
          if (confirmState.type === "update-all-channels") {
            void handleUpdateAllChannels();
            return;
          }
          void handleDeleteChannel(confirmState.channel);
        }}
        isLoading={
          submitting ||
          updatingAllChannels ||
          (confirmState?.type === "delete-channel" &&
            Boolean(updatingChannelIds[confirmState.channel.id]))
        }
        title={
          confirmState?.type === "delete-user"
            ? "Xoá tài khoản"
            : confirmState?.type === "update-all-channels"
              ? "Cập nhật toàn bộ kênh"
              : "Xoá kênh"
        }
        description={
          confirmState?.type === "delete-user"
            ? `Bạn có chắc chắn muốn xoá tài khoản "${confirmState.user.email || confirmState.user.name}"?`
            : confirmState?.type === "update-all-channels"
              ? `Cập nhật toàn bộ ${channels.length} kênh? Quá trình này sẽ lấy dữ liệu mới và cách nhau khoảng 3 giây cho mỗi kênh.`
              : confirmState?.type === "delete-channel"
                ? `Xóa kênh "${confirmState.channel.title}" khỏi hệ thống? Kênh này cũng sẽ bị gỡ khỏi mọi nhóm đang liên kết.`
                : ""
        }
        confirmText={
          confirmState?.type === "update-all-channels" ? "Cập nhật" : "Xác nhận xoá"
        }
        isDestructive={confirmState?.type !== "update-all-channels"}
      />
    </div>
  );
}
