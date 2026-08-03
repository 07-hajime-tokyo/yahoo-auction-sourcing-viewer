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
      let sheetResponse: SheetsResponse;

      try {
        sheetResponse = await fetchGoogleSheetSheets();
      } catch {
        return NextResponse.json(getMockSheets());
      }

      if (!sheetResponse.ok) {
        return NextResponse.json({ error: sheetResponse.error }, { status: 502 });
      }

      return NextResponse.json(sheetResponse);
    }

    const upstream = await fetchGasJson<SheetsResponse>({ action: "sheets" });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: upstream.error || "GAS API returned ok:false." },
        { status: 502 },
      );
    }

    return NextResponse.json(upstream);
  } catch (error) {
    try {
      const sheetResponse = await fetchGoogleSheetSheets();

      if (sheetResponse.ok) {
        return NextResponse.json(sheetResponse);
      }
    } catch {
      // Fall through to the bundled snapshot when the live fallback is not readable.
    }

    return NextResponse.json(getMockSheets());
  }
}
