"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  EXCLUDE_KEYWORDS_STORAGE_KEY,
  GRADE_FILTER_OPTIONS,
  SORT_OPTIONS,
  TIME_OPTIONS,
  filterAndSortItems,
  getEstimatedEndDate,
  isProbablyEnded,
  normalizeKeywordList,
  normalizeAiGrade,
  parseKeywordInput,
  parseFilters,
  serializeGradeFilter,
  serializeKeywords,
  toGradeFilterValue,
} from "@/lib/filtering";
import type { ExcludeKeywordStat, GradeFilterValue } from "@/lib/filtering";
import type { AiGrade, ApiError, Item, ItemsResponse, SheetInfo, SheetsResponse } from "@/lib/types";

type LoadingState = "idle" | "loading" | "error";

const CONDITION_CHECKS_STORAGE_PREFIX = "isa.conditionChecks.";
const CONDITION_OPTIONS = [
  { value: "unused", label: "未使用", group: "root" },
  { value: "used", label: "中古", group: "root" },
  { value: "likeNew", label: "未使用に近い", group: "used" },
  { value: "good", label: "目立った傷や汚れなし", group: "used" },
  { value: "fair", label: "やや傷や汚れあり", group: "used" },
  { value: "damaged", label: "傷や汚れあり", group: "used" },
  { value: "poor", label: "全体的に状態が悪い", group: "used" },
] as const;
type ConditionOption = (typeof CONDITION_OPTIONS)[number]["value"];

export function YahooAuctionViewer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [storedExcludeKeywords, setStoredExcludeKeywords] = useState<string[] | undefined>();
  const [conditionChecksBySheet, setConditionChecksBySheet] = useState<
    Record<string, ConditionOption[]>
  >({});
  const filters = useMemo(
    () => parseFilters(searchParams, storedExcludeKeywords),
    [searchParams, storedExcludeKeywords],
  );
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [sheetState, setSheetState] = useState<LoadingState>("idle");
  const [itemsState, setItemsState] = useState<LoadingState>("idle");
  const [itemsResponse, setItemsResponse] = useState<Extract<ItemsResponse, { ok: true }> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const availableSheets = Array.isArray(sheets) ? sheets : [];
  const selectedSheet = filters.sheet || availableSheets[0]?.name || "";

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("condition");

      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setStoredExcludeKeywords(readStoredExcludeKeywords());
  }, []);

  useEffect(() => {
    if (!selectedSheet) {
      return;
    }

    setConditionChecksBySheet((current) => {
      if (selectedSheet in current) {
        return current;
      }

      return {
        ...current,
        [selectedSheet]: readStoredConditionChecks(selectedSheet),
      };
    });
  }, [selectedSheet]);

  useEffect(() => {
    if (!searchParams.has("condition")) {
      return;
    }

    updateQuery({ condition: null });
  }, [searchParams, updateQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadSheets() {
      setSheetState("loading");
      setError(null);

      try {
        const response = await fetch("/api/sheets", { cache: "no-store" });
        const data = (await response.json()) as SheetsResponse | ApiError;

        if (!response.ok || "error" in data || !data.ok) {
          throw new Error("error" in data ? data.error : "シート一覧を取得できませんでした。");
        }

        if (!cancelled) {
          setSheets(Array.isArray(data.sheets) ? data.sheets : []);
          setSheetState("idle");
        }
      } catch (loadError) {
        if (!cancelled) {
          setSheetState("error");
          setError(toErrorText(loadError));
        }
      }
    }

    void loadSheets();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (filters.sheet || availableSheets.length === 0) {
      return;
    }

    updateQuery({ sheet: availableSheets[0].name });
  }, [availableSheets, filters.sheet, updateQuery]);

  useEffect(() => {
    if (!selectedSheet) {
      return;
    }

    let cancelled = false;

    async function loadItems() {
      setItemsState("loading");
      setError(null);

      try {
        const params = new URLSearchParams({ sheet: selectedSheet });
        const response = await fetch(`/api/items?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as ItemsResponse | ApiError;

        if (!response.ok || "error" in data || !data.ok) {
          throw new Error("error" in data ? data.error : "商品一覧を取得できませんでした。");
        }

        if (!cancelled) {
          setItemsResponse(data);
          setItemsState("idle");
        }
      } catch (loadError) {
        if (!cancelled) {
          setItemsState("error");
          setItemsResponse(null);
          setError(toErrorText(loadError));
        }
      }
    }

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [selectedSheet, refreshKey]);

  const rawItems = itemsResponse?.items ?? [];
  const visibleItems = useMemo(() => rawItems.filter((item) => !isProbablyEnded(item)), [rawItems]);
  const filtered = useMemo(() => filterAndSortItems(visibleItems, filters), [visibleItems, filters]);
  const excludeKeywords = useMemo(
    () => parseKeywordInput(filters.excludeKeywords),
    [filters.excludeKeywords],
  );
  const selectedConditions = conditionChecksBySheet[selectedSheet] ?? [];
  const totalCount = visibleItems.length;
  const gradeCounts = useMemo(() => getGradeCounts(visibleItems), [visibleItems]);

  function handleInputChange(key: string, value: string) {
    updateQuery({ [key]: value === "" ? null : value });
  }

  function updateExcludeKeywords(keywords: string[]) {
    const nextKeywords = normalizeKeywordList(keywords);

    writeStoredExcludeKeywords(nextKeywords);
    setStoredExcludeKeywords(nextKeywords);
    updateQuery({ exclude: serializeKeywords(nextKeywords) });
  }

  function updateGradeFilter(values: GradeFilterValue[]) {
    updateQuery({ grade: serializeGradeFilter(values) });
  }

  function handleGradeToggle(value: GradeFilterValue, checked: boolean) {
    const selectedValues = new Set<GradeFilterValue>(filters.gradeValues);

    if (checked) {
      selectedValues.add(value);
    } else {
      selectedValues.delete(value);
    }

    updateGradeFilter(
      GRADE_FILTER_OPTIONS.filter((option) => selectedValues.has(option.value)).map(
        (option) => option.value,
      ),
    );
  }

  function handleGradeOnly(value: GradeFilterValue) {
    updateGradeFilter([value]);
  }

  function clearFilters() {
    updateQuery({
      maxTotal: null,
      minTotal: null,
      hours: null,
      maxBids: null,
      exclude: "",
      include: null,
      grade: null,
      excludeFlea: "0",
      unknownShipping: null,
      sort: null,
    });
  }

  function handleConditionToggle(value: ConditionOption, checked: boolean) {
    if (!selectedSheet) {
      return;
    }

    const selected = new Set<ConditionOption>(selectedConditions);

    if (checked) {
      selected.add(value);
    } else {
      selected.delete(value);
    }

    const nextConditions = CONDITION_OPTIONS.filter((option) => selected.has(option.value)).map(
      (option) => option.value,
    );

    writeStoredConditionChecks(selectedSheet, nextConditions);
    setConditionChecksBySheet((current) => ({
      ...current,
      [selectedSheet]: nextConditions,
    }));
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 text-xs text-muted">ヤフオク仕入れ候補</div>
          <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-1">
            {sheetState === "loading" && availableSheets.length === 0 ? (
              <div className="rounded-[8px] border border-border px-3 py-2 text-sm text-muted">
                シート取得中
              </div>
            ) : null}
            {availableSheets.map((sheet) => (
              <button
                key={sheet.name}
                type="button"
                onClick={() => updateQuery({ sheet: sheet.name })}
                className={[
                  "whitespace-nowrap rounded-[8px] border px-3 py-2 text-sm transition",
                  selectedSheet === sheet.name
                    ? "border-accent bg-accent/15 text-text"
                    : "border-border bg-panel text-muted hover:border-accent/60 hover:text-text",
                ].join(" ")}
              >
                {sheet.name}
                <span className="ml-2 text-xs text-muted">{sheet.rows}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="rounded-[8px] border border-border bg-panel px-3 py-2">
            <span className="text-text">{totalCount.toLocaleString("ja-JP")}件中 </span>
            <span className="text-accent">{filtered.items.length.toLocaleString("ja-JP")}件</span>
            <span className="text-text">を表示</span>
          </div>
          <div className="rounded-[8px] border border-warning/50 bg-warning/10 px-3 py-2 text-warning">
            最終取得 {itemsResponse ? formatDateTime(itemsResponse.generatedAt) : "-"}
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="rounded-[8px] border border-border bg-panel px-3 py-2 text-text hover:border-accent/60 disabled:cursor-not-allowed disabled:text-muted"
            disabled={sheetState === "loading" || itemsState === "loading"}
          >
            再読み込み
          </button>
        </div>
      </header>

      <section className="sticky top-0 z-10 border-b border-border bg-base/95 pb-3 pt-2 backdrop-blur">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <FilterField label="仕入れ上限">
            <input
              value={filters.maxTotal}
              onChange={(event) => handleInputChange("maxTotal", event.target.value)}
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="なし"
              className={inputClassName}
            />
          </FilterField>

          <FilterField label="価格下限">
            <input
              value={filters.minTotal}
              onChange={(event) => handleInputChange("minTotal", event.target.value)}
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="なし"
              className={inputClassName}
            />
          </FilterField>

          <FilterField label="残り時間">
            <select
              value={filters.timeLimit}
              onChange={(event) => updateQuery({ hours: event.target.value })}
              className={inputClassName}
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="入札数の上限">
            <input
              value={filters.maxBids}
              onChange={(event) => handleInputChange("maxBids", event.target.value)}
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="なし"
              className={inputClassName}
            />
          </FilterField>

          <FilterField label="含むキーワード">
            <input
              value={filters.includeKeywords}
              onChange={(event) => handleInputChange("include", event.target.value)}
              type="text"
              placeholder="なし"
              className={inputClassName}
            />
          </FilterField>

          <FilterField label="並び替え">
            <select
              value={filters.sort}
              onChange={(event) => updateQuery({ sort: event.target.value })}
              className={inputClassName}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>

          <div className="flex flex-col gap-2 rounded-[8px] border border-border bg-panel p-2">
            <label className="flex min-h-8 items-center gap-2 text-xs text-text">
              <input
                checked={filters.excludeFleaMarket}
                onChange={(event) =>
                  updateQuery({ excludeFlea: event.target.checked ? null : "0" })
                }
                type="checkbox"
                className="h-4 w-4 accent-accent"
              />
              フリマを除く
            </label>
            <label className="flex min-h-8 items-center gap-2 text-xs text-text">
              <input
                checked={filters.excludeUnknownShipping}
                onChange={(event) =>
                  updateQuery({ unknownShipping: event.target.checked ? "1" : null })
                }
                type="checkbox"
                className="h-4 w-4 accent-accent"
              />
              送料未定を除く
            </label>
          </div>
        </div>

        <GradeFilter
          selectedValues={filters.gradeValues}
          counts={gradeCounts}
          onToggle={handleGradeToggle}
          onOnly={handleGradeOnly}
        />

        <ExcludeKeywordEditor
          keywords={excludeKeywords}
          baseCount={filtered.excludeKeywordBaseCount}
          stats={filtered.excludeKeywordStats}
          onChange={updateExcludeKeywords}
        />

        <ConditionChecklist
          selectedConditions={selectedConditions}
          onToggle={handleConditionToggle}
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted">
            送料未定の商品は上限を通過しやすいため、カード上で明示しています。
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-[8px] border border-border px-3 py-2 text-xs text-muted hover:border-accent/60 hover:text-text"
          >
            フィルタをすべて解除
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-[8px] border border-warning/60 bg-warning/10 p-4 text-sm text-warning">
          {error}
        </div>
      ) : null}

      {itemsState === "loading" && rawItems.length === 0 ? <LoadingGrid /> : null}

      {itemsState !== "loading" && filtered.items.length === 0 ? (
        <EmptyState totalCount={visibleItems.length} breakdown={filtered.breakdown} />
      ) : null}

      {filtered.items.length > 0 ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.items.map((item) => (
            <ItemCard key={item.url} item={item} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 rounded-[8px] border border-border bg-panel p-2">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function GradeFilter({
  selectedValues,
  counts,
  onToggle,
  onOnly,
}: {
  selectedValues: GradeFilterValue[];
  counts: Record<GradeFilterValue, number>;
  onToggle: (value: GradeFilterValue, checked: boolean) => void;
  onOnly: (value: GradeFilterValue) => void;
}) {
  const selectedSet = new Set<GradeFilterValue>(selectedValues);

  return (
    <div className="mt-2 rounded-[8px] border border-border bg-panel p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-text">判定</div>
        <div className="text-[11px] text-muted">Dは既定で非表示</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {GRADE_FILTER_OPTIONS.map((option) => {
          const display = getGradeDisplay(option.grade);
          const selected = selectedSet.has(option.value);

          return (
            <div
              key={option.value}
              className={[
                "flex min-h-8 items-center gap-1.5 rounded-[8px] border px-2",
                selected ? "border-accent/45 bg-accent/10" : "border-border bg-base opacity-65",
              ].join(" ")}
            >
              <input
                checked={selected}
                onChange={(event) => onToggle(option.value, event.target.checked)}
                type="checkbox"
                aria-label={`${display.label}を表示`}
                className="h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <button
                type="button"
                onClick={() => onOnly(option.value)}
                title={display.tooltip}
                className={[
                  "inline-flex items-center gap-1 rounded-[7px] border px-1.5 py-1 text-[11px] leading-none transition hover:brightness-95",
                  display.className,
                ].join(" ")}
              >
                <span>{display.symbol}</span>
                <span>{display.label}</span>
              </button>
              <span className="text-[11px] text-muted">
                {counts[option.value].toLocaleString("ja-JP")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExcludeKeywordEditor({
  keywords,
  baseCount,
  stats,
  onChange,
}: {
  keywords: string[];
  baseCount: number;
  stats: ExcludeKeywordStat[];
  onChange: (keywords: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const statsByKeyword = new Map(stats.map((stat) => [stat.keyword, stat]));

  function commitInput() {
    const additions = parseKeywordInput(inputValue);

    if (additions.length === 0) {
      setInputValue("");
      return;
    }

    onChange([...keywords, ...additions]);
    setInputValue("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    commitInput();
  }

  return (
    <div className="mt-2 rounded-[8px] border border-border bg-panel p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-text">除外キーワード</div>
        <div className="text-[11px] text-muted">母集団 {baseCount.toLocaleString("ja-JP")}件</div>
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5">
        {keywords.map((keyword) => {
          const stat = statsByKeyword.get(keyword) ?? {
            keyword,
            removed: 0,
            baseCount,
          };
          const tooBroad = stat.baseCount > 0 && stat.removed / stat.baseCount > 0.4;
          const chipClassName =
            stat.removed === 0
              ? "border-border bg-base text-muted opacity-55"
              : tooBroad
                ? "border-warning/60 bg-warning/10 text-warning"
                : "border-accent/35 bg-accent/10 text-text";

          return (
            <span
              key={keyword}
              className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-[8px] border px-2 text-xs ${chipClassName}`}
            >
              <span className="truncate">{keyword}</span>
              <span className="rounded-[6px] border border-current/25 px-1 text-[10px] leading-4">
                {stat.removed.toLocaleString("ja-JP")}
              </span>
              <button
                type="button"
                onClick={() => onChange(keywords.filter((current) => current !== keyword))}
                aria-label={`${keyword}を除外キーワードから削除`}
                className="text-sm leading-none opacity-75 hover:opacity-100"
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          type="text"
          aria-label="除外キーワードを追加"
          placeholder="キーワードを追加"
          className="h-7 min-w-[12rem] flex-1 rounded-[8px] border border-border bg-base px-2 text-xs text-text outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
    </div>
  );
}

function ConditionChecklist({
  selectedConditions,
  onToggle,
}: {
  selectedConditions: ConditionOption[];
  onToggle: (value: ConditionOption, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const selectedCount = selectedConditions.length;

  return (
    <div className="mt-2 rounded-[8px] border border-border bg-panel p-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-text"
      >
        <span className="flex items-center gap-2">
          商品の状態
          {selectedCount > 0 ? (
            <span className="rounded-[8px] border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
              {selectedCount}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="text-muted">
          {open ? "⌃" : "⌄"}
        </span>
      </button>
      <div
        className={[
          open ? "mt-2 flex" : "hidden",
          "flex-wrap gap-x-5 gap-y-1",
        ].join(" ")}
      >
        {CONDITION_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={[
              "flex min-h-5 items-center gap-1.5 whitespace-nowrap text-xs text-text",
              option.group === "used" ? "ml-2" : "",
            ].join(" ")}
          >
            <input
              checked={selectedConditions.includes(option.value)}
              onChange={(event) => onToggle(option.value, event.target.checked)}
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 accent-accent"
            />
            <span className="min-w-0 leading-4">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: Item }) {
  const ended = isProbablyEnded(item);
  const estimatedEndDate = getEstimatedEndDate(item);
  const urgent = item.endsInHours !== null && item.endsInHours <= 6 && !ended;
  const gradeDisplay = getGradeDisplay(item.aiGrade);
  const specs = getDisplaySpecs(item.aiSpecs);

  return (
    <article
      className={[
        "group grid grid-cols-[112px_1fr] gap-3 rounded-[8px] border bg-panel p-2 transition sm:grid-cols-1",
        ended
          ? "border-border opacity-45"
          : "border-border hover:border-accent/60",
      ].join(" ")}
    >
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="block aspect-square overflow-hidden rounded-[8px] border border-border bg-base"
      >
        <img
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />
      </a>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {item.isFleaMarket ? <Badge tone="accent">PayPayフリマ</Badge> : null}
          {item.shippingFee === null ? <Badge tone="warning">送料未定</Badge> : null}
          {ended ? <Badge tone="muted">終了推定</Badge> : null}
        </div>

        <div className="rounded-[8px] border border-border bg-base px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <GradePill display={gradeDisplay} />
            {item.aiReason ? (
              <span className="min-w-0 flex-1 text-xs text-text">{item.aiReason}</span>
            ) : null}
          </div>
          {specs.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
              {specs.map((spec) => (
                <span key={spec.label}>
                  {spec.label}:{spec.value}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 min-h-10 text-sm font-medium leading-5 text-text hover:text-accent"
        >
          {item.title}
        </a>

        <div>
          <div className="text-2xl font-semibold text-text">
            {formatYen(item.totalPrice)}
          </div>
          <div className="mt-1 text-xs text-muted">
            本体 {formatYen(item.price)} +{" "}
            {item.shippingFee === null ? item.shippingText || "送料未定" : `送料 ${formatYen(item.shippingFee)}`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Badge tone="muted">入札 {item.bids === null ? "-" : item.bids.toLocaleString("ja-JP")}</Badge>
          <Badge tone={urgent ? "warning" : "muted"}>残り {item.endTimeText || "-"}</Badge>
          <Badge tone="muted">行 {item.rowIndex}</Badge>
        </div>

        <div className="mt-auto text-xs text-muted">
          取得 {formatDateTime(item.fetchedAt)}
          {estimatedEndDate ? ` / 終了推定 ${formatDateTime(estimatedEndDate.toISOString())}` : ""}
        </div>
      </div>
    </article>
  );
}

type GradeDisplay = {
  grade: AiGrade;
  symbol: string;
  label: string;
  tooltip: string;
  className: string;
};

const GRADE_DISPLAYS: Record<AiGrade, GradeDisplay> = {
  A: {
    grade: "A",
    symbol: "◎",
    label: "有望",
    tooltip: "動作確認済みで状態に難の記載なし",
    className: "border-emerald-500/45 bg-emerald-50 text-emerald-700",
  },
  B: {
    grade: "B",
    symbol: "○",
    label: "検討",
    tooltip: "状態情報はあるが懸念あり",
    className: "border-sky-500/45 bg-sky-50 text-sky-700",
  },
  C: {
    grade: "C",
    symbol: "△",
    label: "要確認",
    tooltip: "商品ページの確認が必要",
    className: "border-stone-400/60 bg-stone-100 text-stone-700",
  },
  D: {
    grade: "D",
    symbol: "✕",
    label: "見送り",
    tooltip: "状態不良またはジャンク系",
    className: "border-rose-500/45 bg-rose-50 text-rose-700",
  },
  "": {
    grade: "",
    symbol: "—",
    label: "未判定",
    tooltip: "判定結果がありません",
    className: "border-border bg-panel text-muted",
  },
};

function getGradeDisplay(value: unknown) {
  return GRADE_DISPLAYS[normalizeAiGrade(value)];
}

function GradePill({ display }: { display: GradeDisplay }) {
  return (
    <span
      title={display.tooltip}
      className={`inline-flex items-center gap-1 rounded-[7px] border px-1.5 py-1 text-[11px] font-semibold leading-none ${display.className}`}
    >
      <span>{display.symbol}</span>
      <span>{display.label}</span>
    </span>
  );
}

function getGradeCounts(items: Item[]): Record<GradeFilterValue, number> {
  const counts = Object.fromEntries(
    GRADE_FILTER_OPTIONS.map((option) => [option.value, 0]),
  ) as Record<GradeFilterValue, number>;

  for (const item of items) {
    counts[toGradeFilterValue(item.aiGrade)] += 1;
  }

  return counts;
}

function getDisplaySpecs(value: unknown) {
  const specs = parseSpecs(value);

  return Object.entries(specs)
    .map(([key, specValue]) => ({
      label: toSpecLabel(key),
      value: toSpecValue(specValue),
    }))
    .filter((spec) => spec.value !== "")
    .slice(0, 6);
}

function parseSpecs(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.trim() === "") {
    return {};
  }

  try {
    const parsedValue: unknown = JSON.parse(value);
    return parsedValue !== null && typeof parsedValue === "object" && !Array.isArray(parsedValue)
      ? (parsedValue as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toSpecLabel(key: string) {
  const labels: Record<string, string> = {
    operation: "動作",
    working: "動作",
    works: "動作",
    screen: "画面",
    display: "画面",
    upperScreen: "上画面",
    lowerScreen: "下画面",
    accessories: "付属",
    accessory: "付属",
    body: "本体",
    box: "箱",
    charger: "充電器",
    stylus: "タッチペン",
  };

  return labels[key] ?? key;
}

function toSpecValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalizedValue = String(value).trim();
  const lookupKey = normalizedValue.normalize("NFKC").toLowerCase();

  if (lookupKey === "" || lookupKey === "unknown" || lookupKey === "不明" || lookupKey === "情報なし") {
    return "";
  }

  const labels: Record<string, string> = {
    confirmed: "確認済",
    checked: "確認済",
    working: "確認済",
    ok: "確認済",
    unconfirmed: "未確認",
    not_checked: "未確認",
    good: "良好",
    clean: "良好",
    issue: "難あり",
    has_issue: "難あり",
    included: "あり",
    yes: "あり",
    true: "あり",
    none: "なし",
    no: "なし",
    false: "なし",
    body_only: "本体のみ",
    scratches: "キズあり",
    burn: "ヤケあり",
  };

  return labels[lookupKey] ?? normalizedValue;
}

function Badge({
  tone,
  children,
}: {
  tone: "accent" | "warning" | "muted";
  children: React.ReactNode;
}) {
  const className =
    tone === "accent"
      ? "border-accent/50 bg-accent/15 text-accent"
      : tone === "warning"
        ? "border-warning/50 bg-warning/15 text-warning"
        : "border-border bg-base text-muted";

  return (
    <span className={`rounded-[8px] border px-2 py-1 text-[11px] leading-none ${className}`}>
      {children}
    </span>
  );
}

function EmptyState({
  totalCount,
  breakdown,
}: {
  totalCount: number;
  breakdown: { label: string; removed: number }[];
}) {
  return (
    <section className="rounded-[8px] border border-border bg-panel p-5">
      <div className="text-base font-semibold text-text">条件に一致する候補がありません</div>
      <div className="mt-2 text-sm text-muted">
        読み込み済み {totalCount.toLocaleString("ja-JP")} 件から、次の条件で候補が落ちています。
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {breakdown.length > 0 ? (
          breakdown.map((item) => (
            <div key={item.label} className="rounded-[8px] border border-border bg-base p-3">
              <div className="text-xs text-muted">{item.label}</div>
              <div className="mt-1 text-xl font-semibold text-text">
                {item.removed.toLocaleString("ja-JP")}件
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[8px] border border-border bg-base p-3 text-sm text-muted">
            フィルタ適用前のデータが0件です。
          </div>
        )}
      </div>
    </section>
  );
}

function LoadingGrid() {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="rounded-[8px] border border-border bg-panel p-2">
          <div className="aspect-square rounded-[8px] bg-border/70" />
          <div className="mt-3 h-4 rounded bg-border/70" />
          <div className="mt-2 h-4 w-2/3 rounded bg-border/70" />
          <div className="mt-4 h-7 w-1/2 rounded bg-border/70" />
        </div>
      ))}
    </section>
  );
}

const inputClassName =
  "min-h-9 w-full rounded-[8px] border border-border bg-base px-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent";

function formatYen(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${value.toLocaleString("ja-JP")}円`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readStoredExcludeKeywords() {
  const values = readStoredStringArray(EXCLUDE_KEYWORDS_STORAGE_KEY);
  return values ? normalizeKeywordList(values) : undefined;
}

function writeStoredExcludeKeywords(keywords: string[]) {
  writeStoredStringArray(EXCLUDE_KEYWORDS_STORAGE_KEY, normalizeKeywordList(keywords));
}

function readStoredConditionChecks(sheetName: string): ConditionOption[] {
  const values = readStoredStringArray(getConditionChecksStorageKey(sheetName)) ?? [];
  const allowedValues = new Set(CONDITION_OPTIONS.map((option) => option.value));
  const selectedValues = new Set(
    values.filter((value): value is ConditionOption => allowedValues.has(value as ConditionOption)),
  );

  return CONDITION_OPTIONS.filter((option) => selectedValues.has(option.value)).map(
    (option) => option.value,
  );
}

function writeStoredConditionChecks(sheetName: string, conditions: ConditionOption[]) {
  writeStoredStringArray(getConditionChecksStorageKey(sheetName), conditions);
}

function getConditionChecksStorageKey(sheetName: string) {
  return `${CONDITION_CHECKS_STORAGE_PREFIX}${encodeURIComponent(sheetName)}`;
}

function readStoredStringArray(key: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (rawValue === null) {
      return undefined;
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return undefined;
    }

    return parsedValue.filter((value): value is string => typeof value === "string");
  } catch {
    return undefined;
  }
}

function writeStoredStringArray(key: string, value: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

function toErrorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "不明なエラーが発生しました。";
}
