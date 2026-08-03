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
  { value: "48", label: "2日以内", hours: 48 },
  { value: "72", label: "3日以内", hours: 72 },
] as const;

export const CONDITION_OPTIONS = [
  { value: "unused", label: "未使用", group: "root" },
  { value: "used", label: "中古", group: "root" },
  { value: "likeNew", label: "未使用に近い", group: "used" },
  { value: "good", label: "目立った傷や汚れなし", group: "used" },
  { value: "fair", label: "やや傷や汚れあり", group: "used" },
  { value: "damaged", label: "傷や汚れあり", group: "used" },
  { value: "poor", label: "全体的に状態が悪い", group: "used" },
] as const;

export const SORT_OPTIONS = [
  { value: "totalAsc", label: "総額が安い順" },
  { value: "endsSoon", label: "残り時間が短い順" },
  { value: "bidsAsc", label: "入札数が少ない順" },
  { value: "newFetched", label: "取得日時が新しい順" },
] as const;

export type TimeOption = (typeof TIME_OPTIONS)[number]["value"];
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];
export type ConditionOption = (typeof CONDITION_OPTIONS)[number]["value"];

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
  conditions: ConditionOption[];
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
  const conditions = normalizeConditionOptions(searchParams.get("condition"));

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
    conditions,
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

export function getItemConditionText(item: Item) {
  return item.conditionText?.trim() || "";
}

export function getItemConditionValue(item: Item) {
  return normalizeConditionValue(getItemConditionText(item));
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
  const selectedConditions = filters.conditions;

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
    {
      label: "商品の状態",
      active: selectedConditions.length > 0,
      passes: (item: Item) => conditionMatches(item, selectedConditions),
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

function normalizeConditionOptions(value: string | null): ConditionOption[] {
  if (!value) {
    return [];
  }

  const allowed = new Set(CONDITION_OPTIONS.map((option) => option.value));
  const selected = new Set(
    value
      .split(",")
      .map((option) => option.trim())
      .filter((option): option is ConditionOption => allowed.has(option as ConditionOption)),
  );

  return CONDITION_OPTIONS.filter((option) => selected.has(option.value)).map(
    (option) => option.value,
  );
}

function normalizeConditionValue(value: string): ConditionOption | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  if (/未使用に近/.test(normalized)) {
    return "likeNew";
  }

  if (/未使用|新品|未開封/.test(normalized)) {
    return "unused";
  }

  if (/目立った傷|汚れなし|美品|良品|画面無傷|ヤケなし/.test(normalized)) {
    return "good";
  }

  if (/全体的に状態が悪|状態が悪|ジャンク|動作未確認|現状品|画面映らず|通電のみ/.test(
    normalized,
  )) {
    return "poor";
  }

  if (/傷や汚れあり/.test(normalized) && !/やや傷/.test(normalized)) {
    return "damaged";
  }

  if (/やや傷|小傷|キズあり|傷あり|汚れあり/.test(normalized)) {
    return "fair";
  }

  if (/中古/.test(normalized)) {
    return "used";
  }

  return null;
}

function conditionMatches(item: Item, selectedConditions: ConditionOption[]) {
  const condition = getItemConditionValue(item);

  if (!condition) {
    return false;
  }

  return selectedConditions.some((selectedCondition) => {
    if (selectedCondition === condition) {
      return true;
    }

    return selectedCondition === "used" && condition !== "unused";
  });
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
