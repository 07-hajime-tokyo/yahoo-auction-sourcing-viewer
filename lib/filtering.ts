import type { Item } from "@/lib/types";

export const DEFAULT_EXCLUDE_KEYWORDS = [
  "ジャンク",
  "部品取り",
  "訳あり",
  "難あり",
  "不動",
];

export const TIME_OPTIONS = [
  { value: "all", label: "すべて", hours: null },
  { value: "6", label: "6時間以内", hours: 6 },
  { value: "24", label: "24時間以内", hours: 24 },
  { value: "72", label: "3日以内", hours: 72 },
] as const;

export const SORT_OPTIONS = [
  { value: "totalAsc", label: "総額が安い順" },
  { value: "endsSoon", label: "残り時間が短い順" },
  { value: "bidsAsc", label: "入札数が少ない順" },
  { value: "newFetched", label: "取得日時が新しい順" },
] as const;

export type TimeOption = (typeof TIME_OPTIONS)[number]["value"];
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export type Filters = {
  sheet: string;
  maxTotal: string;
  minTotal: string;
  timeLimit: TimeOption;
  maxBids: string;
  excludeKeywords: string;
  includeKeywords: string;
  excludeFleaMarket: boolean;
  excludeUnknownShipping: boolean;
  sort: SortOption;
};

export type FilterBreakdown = {
  label: string;
  removed: number;
};

type SearchLike = {
  get(name: string): string | null;
  has(name: string): boolean;
};

export function parseFilters(searchParams: SearchLike): Filters {
  const timeLimit = normalizeTimeOption(searchParams.get("hours"));
  const sort = normalizeSortOption(searchParams.get("sort"));

  return {
    sheet: searchParams.get("sheet") ?? "",
    maxTotal: searchParams.get("maxTotal") ?? "",
    minTotal: searchParams.get("minTotal") ?? "",
    timeLimit,
    maxBids: searchParams.get("maxBids") ?? "",
    excludeKeywords: searchParams.has("exclude")
      ? (searchParams.get("exclude") ?? "")
      : DEFAULT_EXCLUDE_KEYWORDS.join(", "),
    includeKeywords: searchParams.get("include") ?? "",
    excludeFleaMarket: searchParams.get("excludeFlea") !== "0",
    excludeUnknownShipping: searchParams.get("unknownShipping") === "1",
    sort,
  };
}

export function filterAndSortItems(items: Item[], filters: Filters) {
  let remaining = [...items];
  const breakdown: FilterBreakdown[] = [];

  for (const step of getFilterSteps(filters)) {
    if (!step.active) {
      continue;
    }

    const before = remaining.length;
    remaining = remaining.filter(step.passes);
    breakdown.push({ label: step.label, removed: before - remaining.length });
  }

  return {
    items: sortItems(remaining, filters.sort),
    breakdown,
  };
}

export function splitKeywords(input: string) {
  return input
    .split(/[,\u3001]/)
    .map((keyword) => normalizeText(keyword.trim()))
    .filter(Boolean);
}

export function normalizeText(input: string) {
  return input.normalize("NFKC").toLowerCase();
}

export function getEstimatedEndDate(item: Item) {
  if (!item.fetchedAt || item.endsInHours === null) {
    return null;
  }

  const fetchedAt = new Date(item.fetchedAt);

  if (Number.isNaN(fetchedAt.getTime())) {
    return null;
  }

  return new Date(fetchedAt.getTime() + item.endsInHours * 60 * 60 * 1000);
}

export function isProbablyEnded(item: Item, now = new Date()) {
  const estimatedEndDate = getEstimatedEndDate(item);

  if (!estimatedEndDate) {
    return false;
  }

  return estimatedEndDate.getTime() < now.getTime();
}

function getFilterSteps(filters: Filters) {
  const maxTotal = parseNumericFilter(filters.maxTotal);
  const minTotal = parseNumericFilter(filters.minTotal);
  const maxBids = parseNumericFilter(filters.maxBids);
  const timeLimit = TIME_OPTIONS.find((option) => option.value === filters.timeLimit)?.hours ?? null;
  const excludeKeywords = splitKeywords(filters.excludeKeywords);
  const includeKeywords = splitKeywords(filters.includeKeywords);

  return [
    {
      label: "仕入れ上限",
      active: maxTotal !== null,
      passes: (item: Item) => item.totalPrice !== null && item.totalPrice <= maxTotal!,
    },
    {
      label: "価格下限",
      active: minTotal !== null,
      passes: (item: Item) => item.totalPrice !== null && item.totalPrice >= minTotal!,
    },
    {
      label: "残り時間",
      active: timeLimit !== null,
      passes: (item: Item) => item.endsInHours !== null && item.endsInHours <= timeLimit!,
    },
    {
      label: "入札数の上限",
      active: maxBids !== null,
      passes: (item: Item) => item.bids !== null && item.bids <= maxBids!,
    },
    {
      label: "除外キーワード",
      active: excludeKeywords.length > 0,
      passes: (item: Item) => {
        const title = normalizeText(item.title);
        return !excludeKeywords.some((keyword) => title.includes(keyword));
      },
    },
    {
      label: "含むキーワード",
      active: includeKeywords.length > 0,
      passes: (item: Item) => {
        const title = normalizeText(item.title);
        return includeKeywords.some((keyword) => title.includes(keyword));
      },
    },
    {
      label: "フリマ除外",
      active: filters.excludeFleaMarket,
      passes: (item: Item) => !item.isFleaMarket,
    },
    {
      label: "送料未定除外",
      active: filters.excludeUnknownShipping,
      passes: (item: Item) => item.shippingFee !== null,
    },
  ];
}

function parseNumericFilter(value: string) {
  if (value.trim() === "") {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue;
}

function normalizeTimeOption(value: string | null): TimeOption {
  if (TIME_OPTIONS.some((option) => option.value === value)) {
    return value as TimeOption;
  }

  return "all";
}

function normalizeSortOption(value: string | null): SortOption {
  if (SORT_OPTIONS.some((option) => option.value === value)) {
    return value as SortOption;
  }

  return "totalAsc";
}

function sortItems(items: Item[], sort: SortOption) {
  const sorted = [...items];

  switch (sort) {
    case "endsSoon":
      return sorted.sort((a, b) => sortableEndTime(a) - sortableEndTime(b));
    case "bidsAsc":
      return sorted.sort((a, b) => sortableNumber(a.bids) - sortableNumber(b.bids));
    case "newFetched":
      return sorted.sort(
        (a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime(),
      );
    case "totalAsc":
    default:
      return sorted.sort(
        (a, b) => sortableNumber(a.totalPrice) - sortableNumber(b.totalPrice),
      );
  }
}

function sortableNumber(value: number | null) {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

function sortableEndTime(item: Item) {
  return getEstimatedEndDate(item)?.getTime() ?? Number.POSITIVE_INFINITY;
}
