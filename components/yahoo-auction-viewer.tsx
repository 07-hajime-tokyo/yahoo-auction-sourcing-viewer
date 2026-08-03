"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_EXCLUDE_KEYWORDS,
  SORT_OPTIONS,
  TIME_OPTIONS,
  filterAndSortItems,
  getEstimatedEndDate,
  isProbablyEnded,
  parseFilters,
} from "@/lib/filtering";
import type { ApiError, Item, ItemsResponse, SheetInfo, SheetsResponse } from "@/lib/types";

type LoadingState = "idle" | "loading" | "error";

export function YahooAuctionViewer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
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
  const filtered = useMemo(() => filterAndSortItems(rawItems, filters), [rawItems, filters]);
  const totalCount = itemsResponse?.count ?? rawItems.length;

  function handleInputChange(key: string, value: string) {
    updateQuery({ [key]: value === "" ? null : value });
  }

  function handleExcludeKeywordChange(value: string) {
    updateQuery({ exclude: value });
  }

  function clearFilters() {
    updateQuery({
      maxTotal: null,
      minTotal: null,
      hours: null,
      maxBids: null,
      exclude: "",
      include: null,
      excludeFlea: "0",
      unknownShipping: null,
      sort: null,
    });
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
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

          <FilterField label="除外キーワード">
            <input
              value={filters.excludeKeywords}
              onChange={(event) => handleExcludeKeywordChange(event.target.value)}
              type="text"
              placeholder={DEFAULT_EXCLUDE_KEYWORDS.join(", ")}
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
        <EmptyState totalCount={rawItems.length} breakdown={filtered.breakdown} />
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

function ItemCard({ item }: { item: Item }) {
  const ended = isProbablyEnded(item);
  const estimatedEndDate = getEstimatedEndDate(item);
  const urgent = item.endsInHours !== null && item.endsInHours <= 6 && !ended;

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

function toErrorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "不明なエラーが発生しました。";
}
