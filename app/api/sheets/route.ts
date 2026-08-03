import { NextResponse } from "next/server";
import { fetchGasJson, hasGasConfig } from "@/lib/gas";
import { fetchGoogleSheetSheets, hasGoogleSheetConfig } from "@/lib/google-sheet";
import { getMockSheets } from "@/lib/mock";
import type { SheetsResponse } from "@/lib/types";

export const revalidate = 300;

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

    return NextResponse.json(upstream);
  } catch (error) {
    return NextResponse.json(await getFallbackSheets());
  }
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

function isValidSheetsPayload(response: SheetsResponse) {
  return response.ok && Array.isArray(response.sheets);
}
