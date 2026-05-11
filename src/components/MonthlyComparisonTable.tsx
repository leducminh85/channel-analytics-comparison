"use client";

import Image from "next/image";
import { Calendar, ChevronDown, ChevronUp, ChevronsUpDown, Download, Filter } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  updateMonthlyComparisonSettings,
  type MonthlyComparisonSettings,
} from "@/app/actions/monthlyComparisonSettingsActions";

interface MonthlyStat {
  month: string;
  views_gained: number;
}

interface ChannelWithStats {
  id: string;
  title: string;
  logo_url: string | null;
  views30Days: number;
  monthlyStats: MonthlyStat[];
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString("vi-VN");
}

function formatMonthLabel(monthStr: string): string {
  // input: YYYY-MM -> output: MM/YYYY
  const [y, m] = monthStr.split("-");
  return `${m}/${y}`;
}

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getExcelColumnName(index: number) {
  let columnName = "";
  let value = index + 1;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    value = Math.floor((value - 1) / 26);
  }

  return columnName;
}

function createWorksheetXml(rows: Array<Array<string | number>>) {
  const maxColumns = Math.max(...rows.map((row) => row.length), 1);
  const dimension = `A1:${getExcelColumnName(maxColumns - 1)}${Math.max(rows.length, 1)}`;

  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, cellIndex) => {
          const ref = `${getExcelColumnName(cellIndex)}${rowIndex + 1}`;
          const style = rowIndex === 0 ? ' s="1"' : "";

          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<c r="${ref}"${style}><v>${cell}</v></c>`;
          }

          return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function getMonthYear(monthStr: string | null, fallbackYear: number) {
  if (!monthStr) return fallbackYear;
  const year = Number(monthStr.split("-")[0]);
  return Number.isFinite(year) ? year : fallbackYear;
}

const VI_MONTHS = [
  "Tháng 1",
  "Tháng 2",
  "Tháng 3",
  "Tháng 4",
  "Tháng 5",
  "Tháng 6",
  "Tháng 7",
  "Tháng 8",
  "Tháng 9",
  "Tháng 10",
  "Tháng 11",
  "Tháng 12",
];

function MonthPickerField({
  label,
  value,
  minMonth,
  maxMonth,
  isOpen,
  displayYear,
  panelAlign = "left",
  onOpen,
  onYearChange,
  onChange,
}: {
  label: string;
  value: string | null;
  minMonth?: string;
  maxMonth?: string;
  isOpen: boolean;
  displayYear: number;
  panelAlign?: "left" | "right";
  onOpen: () => void;
  onYearChange: (year: number) => void;
  onChange: (month: string | null) => void;
}) {
  const minYear = minMonth ? Number(minMonth.slice(0, 4)) : displayYear;
  const maxYear = maxMonth ? Number(maxMonth.slice(0, 4)) : displayYear;
  const clampedYear = Math.min(Math.max(displayYear, minYear), maxYear);

  useEffect(() => {
    if (clampedYear !== displayYear) onYearChange(clampedYear);
  }, [clampedYear, displayYear, onYearChange]);

  return (
    <div className="relative">
      <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
          isOpen
            ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-200 hover:bg-white"
        }`}
      >
        <span className={value ? "font-semibold" : "text-slate-400"}>
          {value ? formatMonthLabel(value) : "Chọn tháng"}
        </span>
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div
          className={`absolute top-[66px] z-40 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl ${
            panelAlign === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              disabled={clampedYear <= minYear}
              onClick={() => onYearChange(clampedYear - 1)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Năm trước
            </button>
            <span className="text-sm font-semibold text-slate-800">{clampedYear}</span>
            <button
              type="button"
              disabled={clampedYear >= maxYear}
              onClick={() => onYearChange(clampedYear + 1)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Năm sau
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {VI_MONTHS.map((monthLabel, index) => {
              const monthValue = `${clampedYear}-${String(index + 1).padStart(2, "0")}`;
              const disabled = Boolean(
                (minMonth && monthValue < minMonth) || (maxMonth && monthValue > maxMonth)
              );
              const selected = value === monthValue;

              return (
                <button
                  key={monthValue}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(monthValue)}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                    selected
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                      : disabled
                        ? "cursor-not-allowed bg-slate-50 text-slate-300"
                        : "bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  {monthLabel}
                </button>
              );
            })}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="mt-3 w-full rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              Bỏ chọn
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MonthlyComparisonTable({
  channels,
  initialSettings,
}: {
  channels: ChannelWithStats[];
  initialSettings: MonthlyComparisonSettings;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<MonthlyComparisonSettings>(initialSettings);
  const [showFilters, setShowFilters] = useState(false);
  const [activeMonthPicker, setActiveMonthPicker] = useState<"start" | "end" | null>(null);
  const [views30DaysSortDirection, setViews30DaysSortDirection] =
    useState<MonthlyComparisonSettings["sortDirection"]>(null);
  const [startPickerYear, setStartPickerYear] = useState(() =>
    getMonthYear(initialSettings.customStartMonth, new Date().getFullYear())
  );
  const [endPickerYear, setEndPickerYear] = useState(() =>
    getMonthYear(initialSettings.customEndMonth, new Date().getFullYear())
  );
  const [, startTransition] = useTransition();

  const saveSettings = (nextSettings: MonthlyComparisonSettings) => {
    setSettings(nextSettings);
    startTransition(async () => {
      try {
        await updateMonthlyComparisonSettings(nextSettings);
      } catch (error) {
        console.error("Failed to save monthly comparison settings:", error);
      }
    });
  };

  // Auto scroll to the right (newest months) on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [channels, settings.filterMode, settings.customStartMonth, settings.customEndMonth]);

  useEffect(() => {
    if (!showFilters) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) {
        setShowFilters(false);
        setActiveMonthPicker(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showFilters]);

  const { channelData, sortedMonths, visibleMonths, displayChannels } = useMemo(() => {
    const allMonthsSet = new Set<string>();
    const data: Record<string, Record<string, number>> = {};

    channels.forEach((channel) => {
      data[channel.id] = {};
      (channel.monthlyStats || []).forEach((stat) => {
        allMonthsSet.add(stat.month);
        data[channel.id][stat.month] = stat.views_gained;
      });
    });

    const allMonths = Array.from(allMonthsSet).sort((a, b) => a.localeCompare(b));
    const latestMonth = allMonths[allMonths.length - 1];
    let months = allMonths;

    if (settings.filterMode === "last3" || settings.filterMode === "last6") {
      const limit = settings.filterMode === "last3" ? 3 : 6;
      months = allMonths.slice(-limit);
    }

    if (settings.filterMode === "custom") {
      months = allMonths.filter((month) => {
        if (settings.customStartMonth && month < settings.customStartMonth) return false;
        if (settings.customEndMonth && month > settings.customEndMonth) return false;
        return true;
      });
    }

    months = latestMonth ? months.filter((month) => month !== latestMonth) : months;

    const views30DaysSortIsActive = Boolean(views30DaysSortDirection);
    const sortMonthIsVisible = Boolean(
      settings.sortMonth && settings.sortDirection && months.includes(settings.sortMonth)
    );

    const rows = views30DaysSortIsActive
      ? [...channels].sort((a, b) => {
          return views30DaysSortDirection === "asc"
            ? a.views30Days - b.views30Days
            : b.views30Days - a.views30Days;
        })
      : sortMonthIsVisible
      ? [...channels].sort((a, b) => {
          const aValue = data[a.id]?.[settings.sortMonth as string] || 0;
          const bValue = data[b.id]?.[settings.sortMonth as string] || 0;
          return settings.sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        })
      : channels;

    return {
      channelData: data,
      sortedMonths: allMonths,
      visibleMonths: months,
      displayChannels: rows,
    };
  }, [channels, settings, views30DaysSortDirection]);

  const handleSortMonth = (month: string) => {
    setViews30DaysSortDirection(null);

    const nextDirection =
      settings.sortMonth !== month
        ? "desc"
        : settings.sortDirection === "desc"
          ? "asc"
          : settings.sortDirection === "asc"
            ? null
            : "desc";

    saveSettings({
      ...settings,
      sortMonth: nextDirection ? month : null,
      sortDirection: nextDirection,
    });
  };

  const handleSortViews30Days = () => {
    const nextDirection =
      views30DaysSortDirection === null
        ? "desc"
        : views30DaysSortDirection === "desc"
          ? "asc"
          : null;

    setViews30DaysSortDirection(nextDirection);

    if (nextDirection) {
      saveSettings({
        ...settings,
        sortMonth: null,
        sortDirection: null,
      });
    }
  };

  const updateFilter = (nextSettings: Partial<MonthlyComparisonSettings>) => {
    saveSettings({
      ...settings,
      ...nextSettings,
    });
  };

  const getFilterLabel = () => {
    if (settings.filterMode === "last3") return "3 tháng gần nhất";
    if (settings.filterMode === "last6") return "6 tháng gần nhất";
    if (settings.filterMode === "custom") return "Tùy chọn";
    return "Tất cả tháng";
  };

  const minAvailableMonth = sortedMonths[0];
  const maxAvailableMonth = sortedMonths[sortedMonths.length - 1];

  const openMonthPicker = (picker: "start" | "end") => {
    setActiveMonthPicker((current) => (current === picker ? null : picker));
    if (picker === "start") {
      setStartPickerYear(getMonthYear(settings.customStartMonth, getMonthYear(maxAvailableMonth, new Date().getFullYear())));
    } else {
      setEndPickerYear(getMonthYear(settings.customEndMonth, getMonthYear(maxAvailableMonth, new Date().getFullYear())));
    }
  };

  const updateCustomMonth = (key: "customStartMonth" | "customEndMonth", value: string | null) => {
    updateFilter({ [key]: value });
    setActiveMonthPicker(null);
  };

  const exportExcel = async () => {
    const headerCells = ["Kênh", ...visibleMonths.map(formatMonthLabel), "Views 30 ngày"];
    const bodyRows = displayChannels.map((channel) => [
      channel.title,
      ...visibleMonths.map((month) => channelData[channel.id][month] || 0),
      channel.views30Days,
    ]);
    const rows = [headerCells, ...bodyRows];
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
    zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
    zip.folder("xl")?.file("workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Monthly Views" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
    zip.folder("xl")?.folder("_rels")?.file("workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
    zip.folder("xl")?.file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font/><font><b/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`);
    zip.folder("xl")?.folder("worksheets")?.file("sheet1.xml", createWorksheetXml(rows));

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `monthly-views-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (channels.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mt-8 w-full overflow-visible">
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700">So sánh Views theo tháng (Gained)</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportExcel}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <Filter className="h-3.5 w-3.5" />
              {getFilterLabel()}
            </button>

            {showFilters && (
              <div className="absolute right-0 top-10 z-30 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { mode: "all", label: "Tất cả" },
                    { mode: "last3", label: "3 tháng" },
                    { mode: "last6", label: "6 tháng" },
                    { mode: "custom", label: "Tùy chọn" },
                  ].map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() =>
                        updateFilter({
                          filterMode: option.mode as MonthlyComparisonSettings["filterMode"],
                        })
                      }
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        settings.filterMode === option.mode
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {settings.filterMode === "custom" && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MonthPickerField
                      label="Từ tháng"
                      value={settings.customStartMonth}
                      minMonth={minAvailableMonth}
                      maxMonth={settings.customEndMonth || maxAvailableMonth}
                      isOpen={activeMonthPicker === "start"}
                      displayYear={startPickerYear}
                      onOpen={() => openMonthPicker("start")}
                      onYearChange={setStartPickerYear}
                      onChange={(month) => updateCustomMonth("customStartMonth", month)}
                    />
                    <MonthPickerField
                      label="Đến tháng"
                      value={settings.customEndMonth}
                      minMonth={settings.customStartMonth || minAvailableMonth}
                      maxMonth={maxAvailableMonth}
                      isOpen={activeMonthPicker === "end"}
                      displayYear={endPickerYear}
                      panelAlign="right"
                      onOpen={() => openMonthPicker("end")}
                      onYearChange={setEndPickerYear}
                      onChange={(month) => updateCustomMonth("customEndMonth", month)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="w-full overflow-x-auto scroll-smooth custom-scrollbar"
      >
        <table className="min-w-full text-sm border-collapse table-auto">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="sticky left-0 z-10 bg-slate-50/95 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-r border-slate-100 min-w-[200px] backdrop-blur-sm">
                Kênh
              </th>
              {visibleMonths.map((month) => (
                <th key={month} className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-[100px] border-r border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleSortMonth(month)}
                    className="mx-auto flex items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                    title={`Sắp xếp theo ${formatMonthLabel(month)}`}
                  >
                    {formatMonthLabel(month)}
                    {settings.sortMonth === month && settings.sortDirection === "desc" ? (
                      <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                    ) : settings.sortMonth === month && settings.sortDirection === "asc" ? (
                      <ChevronUp className="h-3.5 w-3.5 text-indigo-600" />
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />
                    )}
                  </button>
                </th>
              ))}
              <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 min-w-[120px]">
                <button
                  type="button"
                  onClick={handleSortViews30Days}
                  className="mx-auto flex items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                  title="Sắp xếp theo Views 30 ngày"
                >
                  Views 30 ngày
                  {views30DaysSortDirection === "desc" ? (
                    <ChevronDown className="h-3.5 w-3.5 text-indigo-600" />
                  ) : views30DaysSortDirection === "asc" ? (
                    <ChevronUp className="h-3.5 w-3.5 text-indigo-600" />
                  ) : (
                    <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />
                  )}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayChannels.map((channel) => (
              <tr key={channel.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                <td className="sticky left-0 z-10 bg-white/95 px-5 py-4 font-semibold text-slate-700 border-r border-slate-100 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    {channel.logo_url && (
                      <div className="relative h-6 w-6 rounded-full overflow-hidden border border-slate-200 shrink-0">
                        <Image src={channel.logo_url} alt="" fill className="object-cover" />
                      </div>
                    )}
                    <span className="truncate max-w-[150px]">{channel.title}</span>
                  </div>
                </td>
                {visibleMonths.map((month) => {
                  const gained = channelData[channel.id][month] || 0;
                  return (
                    <td key={month} className="px-5 py-4 text-center font-mono text-slate-600 border-r border-slate-50">
                      {gained > 0 ? (
                        <span className="text-indigo-600 font-bold">+{formatNumber(gained)}</span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-5 py-4 text-center font-mono text-slate-600">
                  {channel.views30Days > 0 ? (
                    <span className="font-bold text-emerald-600">+{formatNumber(channel.views30Days)}</span>
                  ) : (
                    <span className="text-slate-300">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
