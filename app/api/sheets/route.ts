import { NextResponse } from "next/server";
import { fetchGasJson, hasGasConfig } from "@/lib/gas";
import { fetchGoogleSheetSheets, hasGoogleSheetConfig } from "@/lib/google-sheet";
import { getMockSheets } from "@/lib/mock";
import type { SheetsResponse } from "@/lib/types";

export const revalidate = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasGasConfig() && !hasGoogleSheetConfig()) {
    return NextResponse.json(getMockSheets());
  }

  try {
    if (!hasGasConfig()) {
      return NextResponse.json(await getFallbackSheets());
    }

    const upstream = await fetchGasJson<SheetsResponse>({ action: "sheets" });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: upstream.error || "GAS API returned ok:false." },
        { status: 502 },
      );
    }

    if (!isValidSheetsPayload(upstream)) {
      return NextResponse.json(await getFallbackSheets());
    }

    return NextResponse.json(await mergeWithFallbackSheets(upstream));
  } catch (error) {
    return NextResponse.json(await getFallbackSheets());
  }
}

async function mergeWithFallbackSheets(upstream: SheetsResponse): Promise<SheetsResponse> {
  try {
    const fallback = await fetchGoogleSheetSheets();

    if (fallback.ok) {
      return mergeSheets(upstream, fallback);
    }
  } catch {
    // GAS is still usable; only skip the supplemental Google Sheets tab list.
  }

  return upstream;
}

async function getFallbackSheets(): Promise<SheetsResponse> {
  try {
    const sheetResponse = await fetchGoogleSheetSheets();

    if (sheetResponse.ok) {
      return sheetResponse;
    }
  } catch {
    // Fall through to the bundled snapshot when the live fallback is not readable.
  }

  return getMockSheets();
}

function mergeSheets(primary: SheetsResponse, supplemental: SheetsResponse): SheetsResponse {
  if (!primary.ok || !supplemental.ok) {
    return primary;
  }

  const sheetsByName = new Map<string, { name: string; rows: number }>();

  for (const sheet of [...primary.sheets, ...supplemental.sheets]) {
    const current = sheetsByName.get(sheet.name);
    sheetsByName.set(sheet.name, {
      name: sheet.name,
      rows: Math.max(current?.rows ?? 0, sheet.rows),
    });
  }

  return {
    ok: true,
    sheets: Array.from(sheetsByName.values()),
  };
}

function isValidSheetsPayload(response: SheetsResponse) {
  return response.ok && Array.isArray(response.sheets);
}
