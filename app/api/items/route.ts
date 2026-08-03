import { NextRequest, NextResponse } from "next/server";
import { fetchGasJson, hasGasConfig, toErrorMessage } from "@/lib/gas";
import { fetchGoogleSheetItems, hasGoogleSheetConfig } from "@/lib/google-sheet";
import { getMockItems } from "@/lib/mock";
import type { ItemsResponse } from "@/lib/types";

export const revalidate = 300;

export async function GET(request: NextRequest) {
  const sheet = request.nextUrl.searchParams.get("sheet")?.trim() || undefined;

  if (!hasGasConfig() && !hasGoogleSheetConfig()) {
    return NextResponse.json(getMockItems(sheet));
  }

  if (hasGasConfig() && !sheet) {
    return NextResponse.json({ error: "sheet is required." }, { status: 400 });
  }

  try {
    if (!hasGasConfig()) {
      const sheetResponse = await fetchGoogleSheetItems(sheet);

      if (!sheetResponse.ok) {
        return NextResponse.json({ error: sheetResponse.error }, { status: 502 });
      }

      return NextResponse.json(sheetResponse);
    }

    const upstream = await fetchGasJson<ItemsResponse>({
      action: "list",
      sheet,
    });

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
