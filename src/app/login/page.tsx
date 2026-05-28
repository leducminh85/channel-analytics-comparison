"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CirclePlay, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";

function getSafeCallbackUrl() {
  if (typeof window === "undefined") return "/dashboard";

  const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/dashboard";
  }

  return callbackUrl;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    const trimmedEmail = email.trim();
    const nextFieldErrors: { email?: string; password?: string } = {};

    if (!trimmedEmail) {
      nextFieldErrors.email = "Vui lòng nhập email.";
    } else if (!isValidEmail(trimmedEmail)) {
      nextFieldErrors.email = "Email không hợp lệ.";
    }

    if (!password) {
      nextFieldErrors.password = "Vui lòng nhập mật khẩu.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email: trimmedEmail,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Email hoặc mật khẩu không đúng.");
      } else {
        router.replace(getSafeCallbackUrl());
        router.refresh();
      }
    } catch {
      setError("Không thể đăng nhập. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex lg:w-1/2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <CirclePlay className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Channel Compare</span>
        </div>

        <div className="max-w-md">
          <h1 className="mb-4 text-4xl font-bold leading-tight">
            So sánh kênh YouTube
            <span className="text-indigo-200"> chuyên nghiệp</span>
          </h1>
          <p className="text-base leading-relaxed text-indigo-200">
            Theo dõi, phân tích và so sánh hiệu suất các kênh YouTube một cách trực quan.
            Đưa ra quyết định nội dung dựa trên dữ liệu thực tế.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-bold">30+</p>
              <p className="mt-1 text-xs text-indigo-200">Ngày thống kê</p>
            </div>
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-bold">∞</p>
              <p className="mt-1 text-xs text-indigo-200">Kênh theo dõi</p>
            </div>
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-bold">Live</p>
              <p className="mt-1 text-xs text-indigo-200">Dữ liệu mới</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-indigo-300">© 2026 Channel Compare.</p>
      </div>

      <div className="flex w-full flex-col items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
              <CirclePlay className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">Channel Compare</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Đăng nhập</h2>
          <p className="mt-2 text-sm text-slate-500">
            Nhập email và mật khẩu để tiếp tục.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <div>
              <label
                htmlFor="email-address"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  className={`w-full rounded-xl border bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 ${
                    fieldErrors.email
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                  }`}
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((current) => ({ ...current, email: undefined }));
                    }
                  }}
                />
              </div>
              {fieldErrors.email && (
                <p id="email-error" className="mt-1.5 text-xs font-medium text-red-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  className={`w-full rounded-xl border bg-slate-50 py-3 pl-10 pr-12 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 ${
                    fieldErrors.password
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                      : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                  }`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) {
                      setFieldErrors((current) => ({ ...current, password: undefined }));
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1.5 text-xs font-medium text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 hover:shadow-indigo-500/40 disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                <>
                  Đăng nhập
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
