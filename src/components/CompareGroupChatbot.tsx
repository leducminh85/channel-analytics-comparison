"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, RotateCcw, Send, Trash2, X } from "lucide-react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { stripModelReasoning } from "@/lib/chatReasoning";

type CompareGroupChatbotProps = {
  groupId: string;
};

function getMessageText(message: UIMessage) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  return stripModelReasoning(text);
}

function hasToolActivity(message: UIMessage) {
  return message.parts.some((part) => {
    if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") return false;

    return "state" in part && part.state !== "output-available" && part.state !== "output-error";
  });
}

const suggestedQuestions = [
  "Kênh nào đang có views 30 ngày cao nhất?",
  "So sánh tổng view của các kênh trong nhóm",
  "Kênh nào có subscriber nhiều nhất?",
];

export default function CompareGroupChatbot({ groupId }: CompareGroupChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { groupId },
      }),
    [groupId]
  );

  const { messages, sendMessage, status, error, stop, clearError, regenerate, setMessages } = useChat({
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [isOpen, messages, status]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

  async function submitMessage(value: string) {
    const text = value.trim();
    if (!text || isLoading) return;

    clearError();
    setInput("");
    try {
      await sendMessage({ text: value });
    } catch {
      setInput(value);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage(input);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-colors hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          aria-label="Mở trợ lý phân tích nhóm"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      ) : (
        <section className="flex h-[min(560px,calc(100vh-2.5rem))] w-[min(calc(100vw-2.5rem),390px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-900">AI phân tích nhóm</h2>
                <p className="truncate text-xs text-slate-500">
                  {isLoading ? "Đang xử lý dữ liệu..." : "Sẵn sàng phân tích"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setMessages([]);
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Xoá lịch sử trò chuyện"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label="Đóng trợ lý"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3">
                {suggestedQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void submitMessage(question)}
                    disabled={isLoading}
                    className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) => {
              const text = getMessageText(message);
              const isUser = message.role === "user";
              const isQuerying = !isUser && hasToolActivity(message);

              if (!text && !isQuerying) return null;

              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6 ${
                      isUser
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
                    {isQuerying && (
                      <div className={text ? "mt-2 flex items-center gap-1.5 text-xs text-slate-500" : "flex items-center gap-1.5 text-xs text-slate-500"}>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Đang truy vấn số liệu nhóm...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI đang phân tích...
                </div>
              </div>
            )}

            {error && (
              <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <p>
                  Không thể gửi câu hỏi lúc này. Vui lòng thử lại sau.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void regenerate()}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Thử lại
                  </button>
                  <button
                    type="button"
                    onClick={clearError}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  if (error) clearError();
                  setInput(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={2}
                className="min-h-10 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="Hỏi về số liệu trong nhóm này..."
              />
              {isLoading ? (
                <button
                  type="button"
                  onClick={() => void stop()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100"
                  aria-label="Dừng phản hồi"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  aria-label="Gửi câu hỏi"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
