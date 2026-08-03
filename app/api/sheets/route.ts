import { NextResponse } from "next/server";
import { fetchGasJson, hasGasConfig, toErrorMessage } from "@/lib/gas";
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
      const sheetResponse = await fetchGoogleSheetSheets();

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
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 502 });
  }
}
