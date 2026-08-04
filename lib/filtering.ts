import type { AiGrade, Item } from "@/lib/types";

export const EXCLUDE_KEYWORDS_STORAGE_KEY = "isa.excludeKeywords";

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

export const SORT_OPTIONS = [
  { value: "gradeAsc", label: "判定順" },
  { value: "totalAsc", label: "総額が安い順" },
  { value: "endsSoon", label: "残り時間が短い順" },
  { value: "bidsAsc", label: "入札数が少ない順" },
  { value: "newFetched", label: "取得日時が新しい順" },
] as const;

export const GRADE_FILTER_OPTIONS = [
  { value: "A", grade: "A", label: "有望" },
  { value: "B", grade: "B", label: "検討" },
  { value: "C", grade: "C", label: "要確認" },
  { value: "D", grade: "D", label: "見送り" },
  { value: "ungraded", grade: "", label: "未判定" },
] as const;

export const DEFAULT_GRADE_FILTER_VALUES = ["A", "B", "C", "ungraded"] as const;

export type TimeOption = (typeof TIME_OPTIONS)[number]["value"];
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];
export type GradeFilterValue = (typeof GRADE_FILTER_OPTIONS)[number]["value"];

export type Filters = {
  sheet: string;
  maxTotal: string;
  minTotal: string;
  timeLimit: TimeOption;
  maxBids: string;
  excludeKeywords: string;
  includeKeywords: string;
  gradeValues: GradeFilterValue[];
  excludeFleaMarket: boolean;
  excludeUnknownShipping: boolean;
  sort: SortOption;
};

export type FilterBreakdown = {
  label: string;
  removed: number;
};

export type ExcludeKeywordStat = {
  keyword: string;
  removed: number;
  baseCount: number;
};

type SearchLike = {
  get(name: string): string | null;
  has(name: string): boolean;
};

type FilterStep = {
  label: string;
  active: boolean;
  kind?: "excludeKeywords" | "grade";
  passes: (item: Item) => boolean;
};

export function parseFilters(
  searchParams: SearchLike,
  storedExcludeKeywords?: string[],
): Filters {
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
      : serializeKeywords(storedExcludeKeywords ?? DEFAULT_EXCLUDE_KEYWORDS),
    includeKeywords: searchParams.get("include") ?? "",
    gradeValues: searchParams.has("grade")
      ? parseGradeFilter(searchParams.get("grade") ?? "")
      : [...DEFAULT_GRADE_FILTER_VALUES],
    excludeFleaMarket: searchParams.get("excludeFlea") !== "0",
    excludeUnknownShipping: searchParams.get("unknownShipping") === "1",
    sort,
  };
}

export function filterAndSortItems(items: Item[], filters: Filters) {
  let remaining = [...items];
  const breakdown: FilterBreakdown[] = [];
  const filterSteps = getFilterSteps(filters);
  const excludeKeywordBaseItems = getExcludeKeywordBaseItems(items, filterSteps);
  const gradeBaseItems = getGradeBaseItems(items, filterSteps);

  for (const step of filterSteps) {
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
    excludeKeywordBaseCount: excludeKeywordBaseItems.length,
    excludeKeywordStats: getExcludeKeywordStats(filters, excludeKeywordBaseItems),
    gradeCounts: getGradeCounts(gradeBaseItems),
  };
}

export function splitKeywords(input: string) {
  return parseKeywordInput(input).map((keyword) => normalizeText(keyword));
}

export function parseKeywordInput(input: string) {
  return normalizeKeywordList(input.split(/[,\u3001]/));
}

export function normalizeKeywordList(keywords: string[]) {
  const seen = new Set<string>();
  const normalizedKeywords: string[] = [];

  for (const keyword of keywords) {
    const trimmedKeyword = keyword.trim();
    const normalizedKeyword = normalizeText(trimmedKeyword);

    if (!normalizedKeyword || seen.has(normalizedKeyword)) {
      continue;
    }

    seen.add(normalizedKeyword);
    normalizedKeywords.push(trimmedKeyword);
  }

  return normalizedKeywords;
}

export function serializeKeywords(keywords: string[]) {
  return normalizeKeywordList(keywords).join(", ");
}

export function normalizeText(input: string) {
  return input.normalize("NFKC").toLowerCase();
}

export function serializeGradeFilter(values: GradeFilterValue[]) {
  return normalizeGradeFilter(values).join(",");
}

export function normalizeGradeFilter(values: readonly string[]) {
  const allowedValues = new Set<string>(GRADE_FILTER_OPTIONS.map((option) => option.value));
  const seen = new Set<GradeFilterValue>();
  const normalizedValues: GradeFilterValue[] = [];

  for (const value of values) {
    if (!allowedValues.has(value)) {
      continue;
    }

    const gradeValue = value as GradeFilterValue;

    if (seen.has(gradeValue)) {
      continue;
    }

    seen.add(gradeValue);
    normalizedValues.push(gradeValue);
  }

  return normalizedValues;
}

export function parseGradeFilter(value: string) {
  return normalizeGradeFilter(value.split(",").map((item) => item.trim()));
}

export function normalizeAiGrade(value: unknown): AiGrade {
  return value === "A" || value === "B" || value === "C" || value === "D" ? value : "";
}

export function toGradeFilterValue(value: unknown): GradeFilterValue {
  const grade = normalizeAiGrade(value);
  return grade === "" ? "ungraded" : grade;
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
  if (/終了/.test(normalizeText(item.endTimeText))) {
    return true;
  }

  const estimatedEndDate = getEstimatedEndDate(item);

  if (!estimatedEndDate) {
    return false;
  }

  return estimatedEndDate.getTime() < now.getTime();
}

function getExcludeKeywordBaseItems(items: Item[], filterSteps: FilterStep[]) {
  return applyFilterSteps(
    items,
    filterSteps.filter((step) => step.kind !== "excludeKeywords"),
  );
}

function getGradeBaseItems(items: Item[], filterSteps: FilterStep[]) {
  return applyFilterSteps(
    items,
    filterSteps.filter((step) => step.kind !== "grade"),
  );
}

function getExcludeKeywordStats(
  filters: Filters,
  excludeKeywordBaseItems: Item[],
): ExcludeKeywordStat[] {
  const keywords = parseKeywordInput(filters.excludeKeywords);

  if (keywords.length === 0) {
    return [];
  }

  const baseCount = excludeKeywordBaseItems.length;

  return keywords.map((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    const removed = excludeKeywordBaseItems.filter((item) =>
      normalizeText(item.title).includes(normalizedKeyword),
    ).length;

    return {
      keyword,
      removed,
      baseCount,
    };
  });
}

function applyFilterSteps(items: Item[], steps: FilterStep[]) {
  let remaining = [...items];

  for (const step of steps) {
    if (!step.active) {
      continue;
    }

    remaining = remaining.filter(step.passes);
  }

  return remaining;
}

function getFilterSteps(filters: Filters): FilterStep[] {
  const maxTotal = parseNumericFilter(filters.maxTotal);
  const minTotal = parseNumericFilter(filters.minTotal);
  const maxBids = parseNumericFilter(filters.maxBids);
  const timeLimit = TIME_OPTIONS.find((option) => option.value === filters.timeLimit)?.hours ?? null;
  const excludeKeywords = splitKeywords(filters.excludeKeywords);
  const includeKeywords = splitKeywords(filters.includeKeywords);
  const allGradeValues = GRADE_FILTER_OPTIONS.map((option) => option.value);
  const selectedGradeValues = normalizeGradeFilter(filters.gradeValues);
  const gradeFilterActive = selectedGradeValues.length !== allGradeValues.length;
  const selectedGradeSet = new Set<GradeFilterValue>(selectedGradeValues);

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
      kind: "excludeKeywords",
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
      label: "判定",
      active: gradeFilterActive,
      kind: "grade",
      passes: (item: Item) => selectedGradeSet.has(toGradeFilterValue(item.aiGrade)),
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
    case "gradeAsc":
      return sorted.sort((a, b) => {
        const gradeDiff = sortableGrade(a.aiGrade) - sortableGrade(b.aiGrade);

        if (gradeDiff !== 0) {
          return gradeDiff;
        }

        return sortableNumber(a.totalPrice) - sortableNumber(b.totalPrice);
      });
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

function getGradeCounts(items: Item[]): Record<GradeFilterValue, number> {
  const counts = Object.fromEntries(
    GRADE_FILTER_OPTIONS.map((option) => [option.value, 0]),
  ) as Record<GradeFilterValue, number>;

  for (const item of items) {
    counts[toGradeFilterValue(item.aiGrade)] += 1;
  }

  return counts;
}

function sortableGrade(value: unknown) {
  switch (normalizeAiGrade(value)) {
    case "A":
      return 0;
    case "B":
      return 1;
    case "C":
      return 2;
    case "":
      return 3;
    case "D":
    default:
      return 4;
  }
}
