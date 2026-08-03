import type { Item, ItemsResponse, SheetsResponse } from "@/lib/types";

const TIMEOUT_MS = 10_000;
const DEFAULT_GOOGLE_SHEET_ID = "1nXVUKaGbNDDrZp-n4Vl-fK4qU_7TC5yKFYY3ghArItw";
const DEFAULT_GOOGLE_SHEET_NAME = "リペア";

type CsvRow = Record<string, string>;

export function hasGoogleSheetConfig() {
  return Boolean(getGoogleSheetId() || process.env.GOOGLE_SHEET_CSV_URL?.trim());
}

export async function fetchGoogleSheetSheets(): Promise<SheetsResponse> {
  const items = await fetchGoogleSheetItems(getGoogleSheetName());

  if (!items.ok) {
    return items;
  }

  return {
    ok: true,
    sheets: [
      {
        name: items.sheet,
        rows: items.items.length,
      },
    ],
  };
}

export async function fetchGoogleSheetItems(sheet?: string): Promise<ItemsResponse> {
  const sheetName = getGoogleSheetName();
  const requestedSheet = sheet?.trim() || sheetName;

  if (requestedSheet !== sheetName) {
    return {
      ok: false,
      error: `Google Sheet source only exposes "${sheetName}".`,
    };
  }

  const csv = await fetchSheetCsv(sheetName);
  const records = csvToRecords(csv);
  const items = records.map(recordToItem).filter((item): item is Item => item !== null);
  const generatedAt =
    items
      .map((item) => new Date(item.fetchedAt).getTime())
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => b - a)[0] ?? Date.now();

  return {
    ok: true,
    sheet: sheetName,
    count: items.length,
    generatedAt: new Date(generatedAt).toISOString(),
    items,
  };
}

function getGoogleSheetId() {
  return process.env.GOOGLE_SHEET_ID?.trim() || DEFAULT_GOOGLE_SHEET_ID;
}

function getGoogleSheetName() {
  return process.env.GOOGLE_SHEET_NAME?.trim() || DEFAULT_GOOGLE_SHEET_NAME;
}

function buildCsvUrl(sheetName: string) {
  const explicitUrl = process.env.GOOGLE_SHEET_CSV_URL?.trim();

  if (explicitUrl) {
    return explicitUrl;
  }

  const sheetId = getGoogleSheetId();

  if (!sheetId) {
    throw new Error("GOOGLE_SHEET_ID is not configured.");
  }

  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  url.searchParams.set("tqx", "out:csv");
  url.searchParams.set("sheet", sheetName);
  return url.toString();
}

async function fetchSheetCsv(sheetName: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(buildCsvUrl(sheetName), {
      signal: controller.signal,
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(`Google Sheets CSV returned HTTP ${response.status}.`);
    }

    const text = await response.text();

    if (/<!doctype html|<html/i.test(text.slice(0, 500))) {
      throw new Error(
        "Google Sheets CSV returned HTML. Make the sheet accessible by link or publish it as CSV.",
      );
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Google Sheets CSV timed out after 10 seconds.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function csvToRecords(csv: string): CsvRow[] {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim() !== ""));
  const headers = rows[0]?.map((header) => header.trim()) ?? [];

  return rows.slice(1).map((row, index) => {
    const record: CsvRow = { __rowIndex: String(index + 2) };

    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex]?.trim() ?? "";
    });

    return record;
  });
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function recordToItem(record: CsvRow): Item | null {
  const title = pick(record, ["title", "商品タイトル"]);
  const url = pick(record, ["url", "商品URL", "商品ページURL"]);

  if (!title || !url) {
    return null;
  }

  const price = parseNumber(pick(record, ["price", "現在価格", "価格"]));
  const shippingText = pick(record, ["shipping", "shippingText", "送料"]) || "送料未定";
  const shippingFee = parseShippingFee(shippingText);
  const endTimeText = pick(record, ["endTime", "endTimeText", "残り時間"]);
  const fetchedAt = parseDateLike(pick(record, ["取得日時", "fetchedAt"])) ?? new Date().toISOString();

  return {
    title,
    url,
    imageUrl: pick(record, ["image", "imageUrl", "サムネイル"]) || "",
    price,
    shippingText,
    shippingFee,
    totalPrice: price === null ? null : price + (shippingFee ?? 0),
    bids: parseNumber(pick(record, ["bids", "入札数"])),
    endTimeText,
    endsInHours: parseEndsInHours(endTimeText),
    isFleaMarket: /paypayfleamarket\.yahoo\.co\.jp/i.test(url),
    fetchedAt,
    sourceUrl: pick(record, ["取得元ページ", "sourceUrl", "source"]) || "",
    rowIndex: parseNumber(record.__rowIndex) ?? 0,
  };
}

function pick(record: CsvRow, keys: string[]) {
  for (const key of keys) {
    const value = record[key]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function parseNumber(value: string) {
  const normalized = value.replace(/[^\d.-]/g, "");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseShippingFee(value: string) {
  const normalized = value.normalize("NFKC");

  if (!normalized || /未定|不明/.test(normalized)) {
    return null;
  }

  if (/無料|込み|送料0円/.test(normalized)) {
    return 0;
  }

  return parseNumber(normalized);
}

function parseEndsInHours(value: string) {
  const normalized = value.normalize("NFKC");
  let hours = 0;
  let matched = false;

  for (const [, amount, unit] of normalized.matchAll(/(\d+(?:\.\d+)?)\s*(日|時間|時|分)/g)) {
    const number = Number(amount);

    if (!Number.isFinite(number)) {
      continue;
    }

    matched = true;
    if (unit === "日") {
      hours += number * 24;
    } else if (unit === "分") {
      hours += number / 60;
    } else {
      hours += number;
    }
  }

  if (matched) {
    return hours;
  }

  if (/終了/.test(normalized)) {
    return 0;
  }

  return null;
}

function parseDateLike(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const serial = Number(normalized);
  if (Number.isFinite(serial) && serial > 20_000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return date.toISOString();
  }

  const date = new Date(normalized.replace(/\//g, "-"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
