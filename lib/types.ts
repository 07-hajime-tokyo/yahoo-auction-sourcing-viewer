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
  conditionText?: string;
  fetchedAt: string;
  sourceUrl: string;
  rowIndex: number;
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
