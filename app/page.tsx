import { Suspense } from "react";
import { YahooAuctionViewer } from "@/components/yahoo-auction-viewer";

export default function Page() {
  return (
    <main className="min-h-screen bg-base text-text">
      <Suspense fallback={<div className="p-6 text-sm text-muted">読み込み中...</div>}>
        <YahooAuctionViewer />
      </Suspense>
    </main>
  );
}
