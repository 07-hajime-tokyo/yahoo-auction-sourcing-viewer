import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ヤフオク仕入れ候補ビューア",
  description: "GAS JSON API backed sourcing candidate viewer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
