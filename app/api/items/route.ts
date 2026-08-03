import { NextRequest, NextResponse } from "next/server";
import { fetchGasJson, hasGasConfig } from "@/lib/gas";
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
      return NextResponse.json(await getFallbackItems(sheet));
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

    if (!isValidItemsPayload(upstream)) {
      return NextResponse.json(await getFallbackItems(sheet));
    }

    return NextResponse.json(upstream);
  } catch (error) {
    return NextResponse.json(await getFallbackItems(sheet));
  }
}

async function getFallbackItems(sheet?: string): Promise<ItemsResponse> {
  try {
    const sheetResponse = await fetchGoogleSheetItems(sheet);

    if (sheetResponse.ok) {
      return sheetResponse;
    }
  } catch {
    // Fall through to the bundled snapshot when the live fallback is not readable.
  }

  return getMockItems(sheet);
}

function isValidItemsPayload(response: ItemsResponse) {
  return (
    response.ok &&
    typeof response.sheet === "string" &&
    typeof response.count === "number" &&
    typeof response.generatedAt === "string" &&
    Array.isArray(response.items)
  );
}
