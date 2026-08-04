export type SheetInfo = {
  name: string;
  rows: number;
};

export type SheetsResponse =
  | {
      ok: true;
      sheets: SheetInfo[];
    }
  | {
      ok: false;
      error: string;
    };

export type AiGrade = "A" | "B" | "C" | "D" | "";

export type Item = {
  title: string;
  url: string;
  imageUrl: string;
  price: number | null;
  shippingText: string;
  shippingFee: number | null;
  totalPrice: number | null;
  bids: number | null;
  endTimeText: string;
  endsInHours: number | null;
  isFleaMarket: boolean;
  fetchedAt: string;
  sourceUrl: string;
  rowIndex: number;
  aiGrade: AiGrade;
  aiReason: string;
  aiSpecs: string;
};

export type ItemsResponse =
  | {
      ok: true;
      sheet: string;
      count: number;
      generatedAt: string;
      items: Item[];
    }
  | {
      ok: false;
      error: string;
    };

export type ApiError = {
  error: string;
};
