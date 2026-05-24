"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  FileSpreadsheet,
  ImageIcon,
  LinkIcon,
  Loader2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { importChannelsToGroup } from "@/app/actions/channelActions";

type ImportMode = "text" | "image" | "excel";

const CHANNEL_IMPORT_DELAY_MS = 3000;

const modeOptions: Array<{ mode: ImportMode; label: string; icon: typeof LinkIcon }> = [
  { mode: "text", label: "Dán đường dẫn", icon: LinkIcon },
  { mode: "image", label: "Ảnh", icon: ImageIcon },
  { mode: "excel", label: "Excel", icon: FileSpreadsheet },
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeDetails(details: string[]) {
  const visibleDetails = details.slice(0, 3).join("; ");
  return details.length > 3 ? `${visibleDetails}; và ${details.length - 3} đường dẫn khác` : visibleDetails;
}

function extractYoutubeUrls(text: string) {
  const urlPattern =
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:channel\/UC[a-zA-Z0-9_-]{22}|@[a-zA-Z0-9._-]+)/gi;

  const matches = text.match(urlPattern) || [];
  return matches
    .map((url) => url.replace(/[.,;:!?)]$/, ""))
    .filter(Boolean);
}

function getXmlText(node: Element) {
  return Array.from(node.getElementsByTagName("t"))
    .map((item) => item.textContent || "")
    .join("");
}

async function extractYoutubeUrlsFromSpreadsheet(file: File) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".csv")) {
    return extractYoutubeUrls(await file.text());
  }

  if (!fileName.endsWith(".xlsx")) {
    throw new Error("Chỉ hỗ trợ file .xlsx hoặc .csv");
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parser = new DOMParser();
  const values: string[] = [];

  const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const sharedStrings = sharedStringsXml
    ? Array.from(
        parser.parseFromString(sharedStringsXml, "application/xml").getElementsByTagName("si")
      ).map(getXmlText)
    : [];

  const worksheetPaths = Object.keys(zip.files).filter((path) =>
    /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)
  );

  for (const worksheetPath of worksheetPaths) {
    const worksheetXml = await zip.file(worksheetPath)?.async("text");
    if (!worksheetXml) continue;

    const worksheetFile = worksheetPath.split("/").pop() || "";
    const relationshipXml = await zip
      .file(`xl/worksheets/_rels/${worksheetFile}.rels`)
      ?.async("text");
    const relationships = new Map<string, string>();

    if (relationshipXml) {
      const relationshipDoc = parser.parseFromString(relationshipXml, "application/xml");
      Array.from(relationshipDoc.getElementsByTagName("Relationship")).forEach((item) => {
        const id = item.getAttribute("Id");
        const target = item.getAttribute("Target");
        if (id && target) relationships.set(id, target);
      });
    }

    const worksheetDoc = parser.parseFromString(worksheetXml, "application/xml");

    Array.from(worksheetDoc.getElementsByTagName("c")).forEach((cell) => {
      const type = cell.getAttribute("t");
      const rawValue = cell.getElementsByTagName("v")[0]?.textContent || "";
      let value = rawValue;

      if (type === "s") {
        value = sharedStrings[Number(rawValue)] || "";
      } else if (type === "inlineStr") {
        value = getXmlText(cell);
      }

      if (value) values.push(value);
    });

    Array.from(worksheetDoc.getElementsByTagName("hyperlink")).forEach((hyperlink) => {
      const relationshipId = hyperlink.getAttribute("r:id");
      const target = relationshipId ? relationships.get(relationshipId) : null;
      if (target) values.push(target);
    });
  }

  return extractYoutubeUrls(values.join("\n"));
}

export default function AddChannelForm({ groupId }: { groupId: string }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("text");
  const [rawText, setRawText] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  const detectedUrls = useMemo(() => extractYoutubeUrls(rawText), [rawText]);
  const activeUrls = urls.length > 0 ? urls : detectedUrls;
  const isBusy = isImporting || isParsingImage;
  const canImport =
    mode === "excel"
      ? Boolean(excelFile) && !isBusy
      : activeUrls.length > 0 && !isBusy;

  const resetFeedback = useCallback(() => {
    setError("");
    setNotice("");
    setProgressMessage("");
  }, []);

  const setTextAndUrls = useCallback((text: string, nextUrls?: string[]) => {
    setRawText(text);
    setUrls(nextUrls || []);
    resetFeedback();
  }, [resetFeedback]);

  const resetInputsForMode = (nextMode: ImportMode) => {
    setMode(nextMode);
    setRawText("");
    setUrls([]);
    setExcelFile(null);
    resetFeedback();
  };

  const importUrlsSequentially = async (nextUrls: string[]) => {
    const uniqueUrls = Array.from(new Set(nextUrls.map((url) => url.trim()).filter(Boolean)));
    if (uniqueUrls.length === 0) throw new Error("Không tìm thấy đường dẫn kênh YouTube để thêm");

    let added = 0;
    let skipped = 0;
    let failed = 0;
    const skippedDetails: string[] = [];
    const failedDetails: string[] = [];

    for (const [index, url] of uniqueUrls.entries()) {
      if (index > 0) {
        setProgressMessage(`Đợi 3 giây trước khi xử lý kênh tiếp theo...`);
        await delay(CHANNEL_IMPORT_DELAY_MS);
      }

      setProgressMessage(`Đang xử lý ${index + 1}/${uniqueUrls.length}: ${url}`);

      try {
        const result = await importChannelsToGroup([url], groupId);
        const item = result.items[0];

        if (item?.status === "added") {
          added += 1;
        } else if (item?.status === "skipped") {
          skipped += 1;
          skippedDetails.push(`${url} (${item.message || "Bỏ qua"})`);
        } else {
          failed += 1;
          failedDetails.push(`${url} (${item?.message || "Không thể thêm kênh"})`);
        }
      } catch (error: unknown) {
        failed += 1;
        failedDetails.push(`${url} (${getErrorMessage(error, "Không thể thêm kênh")})`);
      }
    }

    const parts = [`Đã thêm ${added} kênh`];
    if (skipped) parts.push(`bỏ qua ${skipped}: ${summarizeDetails(skippedDetails)}`);
    if (failed) parts.push(`lỗi ${failed}: ${summarizeDetails(failedDetails)}`);
    setNotice(parts.join(", "));
    setProgressMessage("");

    return { added, skipped, failed };
  };

  const handleImport = async () => {
    resetFeedback();
    setIsImporting(true);

    try {
      if (mode === "excel") {
        if (!excelFile) return;

        setProgressMessage(`Đang đọc file: ${excelFile.name}`);
        const excelUrls = await extractYoutubeUrlsFromSpreadsheet(excelFile);
        if (excelUrls.length === 0) throw new Error("Không tìm thấy đường dẫn kênh YouTube trong file");

        await importUrlsSequentially(excelUrls);
        setExcelFile(null);
        if (excelInputRef.current) excelInputRef.current.value = "";
        return;
      }

      if (!activeUrls.length) return;

      const result = await importUrlsSequentially(activeUrls);
      if (result.failed === 0) {
        setRawText("");
        setUrls([]);
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Không thể thêm danh sách kênh"));
    } finally {
      setIsImporting(false);
    }
  };

  const handleImageFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setMode("image");
    setIsParsingImage(true);
    setOcrProgress(0);
    resetFeedback();

    try {
      const { recognize } = await import("tesseract.js");
      const response = await recognize(file, "eng", {
        logger: (message) => {
          if (message.status === "recognizing text" && typeof message.progress === "number") {
            setOcrProgress(Math.round(message.progress * 100));
          }
        },
      });
      const text = response.data.text;
      const nextUrls = extractYoutubeUrls(text);
      setTextAndUrls(nextUrls.join("\n"), nextUrls);
      if (nextUrls.length === 0) {
        setError("Không tìm thấy đường dẫn kênh YouTube trong ảnh");
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Không thể đọc đường dẫn từ ảnh"));
    } finally {
      setIsParsingImage(false);
      setOcrProgress(null);
    }
  }, [resetFeedback, setTextAndUrls]);

  const handleImageDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingImage(false);
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
    handleImageFile(file || null);
  };

  useEffect(() => {
    if (mode !== "image") return;

    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files || []).find((item) =>
        item.type.startsWith("image/")
      );
      if (file) {
        event.preventDefault();
        handleImageFile(file);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [mode, handleImageFile]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Thêm kênh YouTube</h3>
          <p className="mt-1 text-xs text-slate-400">
            Thêm nhiều kênh từ đường dẫn, ảnh chụp hoặc file Excel.
          </p>
        </div>
        <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1">
          {modeOptions.map((option) => {
            const Icon = option.icon;
            const active = mode === option.mode;

            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => resetInputsForMode(option.mode)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  active ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {mode === "text" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">
            Danh sách đường dẫn kênh
          </label>
          <div className="relative">
            <LinkIcon className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <textarea
              value={rawText}
              onChange={(event) => setTextAndUrls(event.target.value)}
              placeholder="Dán nhiều đường dẫn, mỗi dòng một kênh hoặc cả đoạn văn có chứa đường dẫn YouTube"
              className="min-h-32 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              disabled={isBusy}
            />
          </div>
        </div>
      )}

      {mode === "image" && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingImage(true);
          }}
          onDragLeave={() => setIsDraggingImage(false)}
          onDrop={handleImageDrop}
          className={`rounded-xl border border-dashed p-5 transition-colors ${
            isDraggingImage ? "border-indigo-300 bg-indigo-50" : "border-slate-300 bg-slate-50"
          }`}
        >
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isBusy}
            className="flex w-full flex-col items-center justify-center rounded-lg bg-white px-4 py-8 text-center transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isParsingImage ? (
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-500" />
            ) : (
              <UploadCloud className="mb-3 h-8 w-8 text-indigo-500" />
            )}
            <span className="text-sm font-semibold text-slate-700">
              {isParsingImage
                ? `Đang đọc ảnh${ocrProgress !== null ? ` (${ocrProgress}%)` : ""}`
                : "Chọn, kéo-thả hoặc dán ảnh chứa đường dẫn"}
            </span>
            <span className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <Clipboard className="h-3.5 w-3.5" />
              Copy ảnh rồi nhấn Cmd/Ctrl+V khi đang ở tab này
            </span>
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isBusy}
            onChange={(event) => handleImageFile(event.target.files?.[0] || null)}
          />
        </div>
      )}

      {mode === "excel" && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <button
            type="button"
            onClick={() => excelInputRef.current?.click()}
            disabled={isBusy}
            className="flex w-full flex-col items-center justify-center rounded-lg bg-white px-4 py-8 text-center transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? (
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-500" />
            ) : (
              <FileSpreadsheet className="mb-3 h-8 w-8 text-indigo-500" />
            )}
            <span className="text-sm font-semibold text-slate-700">
              {excelFile ? excelFile.name : "Chọn file Excel chứa đường dẫn kênh"}
            </span>
            <span className="mt-1 text-xs text-slate-400">
              Hỗ trợ .xlsx và .csv; hệ thống sẽ tìm đường dẫn trong các ô
            </span>
          </button>
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            disabled={isBusy}
            onChange={(event) => {
              setExcelFile(event.target.files?.[0] || null);
              resetFeedback();
            }}
          />
        </div>
      )}

      {mode === "image" && rawText && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Đường dẫn tìm được</p>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-500">
              {activeUrls.length} đường dẫn
            </span>
          </div>
          <textarea
            value={activeUrls.join("\n")}
            onChange={(event) => setTextAndUrls(event.target.value)}
            className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canImport}
          onClick={handleImport}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Thêm kênh
        </button>
        <span className="text-xs text-slate-400">
          {mode === "excel" ? (excelFile ? "Sẵn sàng thêm kênh từ file đã chọn" : "Chưa chọn file") : `Tìm thấy ${activeUrls.length} đường dẫn YouTube`}
        </span>
      </div>

      {progressMessage && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2.5 text-xs text-indigo-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="min-w-0 truncate">{progressMessage}</span>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="min-w-0 break-words">{notice}</span>
        </div>
      )}
    </div>
  );
}
