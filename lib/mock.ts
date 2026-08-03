import mockItems from "@/mock/items.json";
import type { ItemsResponse, SheetsResponse } from "@/lib/types";

const mock = mockItems as ItemsResponse;

export function getMockItems(sheet?: string): ItemsResponse {
  if (!mock.ok) {
    return mock;
  }

  return {
    ...mock,
    sheet: sheet?.trim() || mock.sheet,
    count: mock.items.length,
  };
}

export function getMockSheets(): SheetsResponse {
  if (!mock.ok) {
    return mock;
  }

  return {
    ok: true,
    sheets: [
      {
        name: mock.sheet,
        rows: mock.items.length,
      },
    ],
  };
}
