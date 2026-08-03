import { NextResponse } from "next/server";
import { fetchGasJson, hasGasConfig, toErrorMessage } from "@/lib/gas";
import { getMockSheets } from "@/lib/mock";
import type { SheetsResponse } from "@/lib/types";

export const revalidate = 300;

export async function GET() {
  if (!hasGasConfig()) {
    return NextResponse.json(getMockSheets());
  }

  try {
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
