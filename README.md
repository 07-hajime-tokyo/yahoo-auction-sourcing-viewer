# ヤフオク仕入れ候補ビューア

Google Apps Script WebApp の JSON API を Next.js Route Handler 経由で読み込み、URL クエリの条件で絞り込む社内向けフロントエンドです。

## セットアップ

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

`GAS_API_URL` が未設定のままなら `mock/items.json` が返るため、Vercel Preview でもそのまま画面を確認できます。

## 環境変数

`.env.local` または Vercel の Project Settings に次を設定します。

```bash
GAS_API_URL=https://script.google.com/macros/s/xxxxx/exec
GAS_READ_TOKEN=
```

- `GAS_API_URL`: 公開済み GAS WebApp の `/exec` URL
- `GAS_READ_TOKEN`: 読み取りトークン。空の場合は GAS へのクエリに付与しません

ブラウザから GAS へ直接アクセスせず、画面は必ず `/api/sheets` と `/api/items` を呼びます。

## API 中継

- `GET /api/sheets`: GAS の `action=sheets` を中継します
- `GET /api/items?sheet=3DS-LL`: GAS の `action=list&sheet=...` を中継します
- `export const revalidate = 300` で5分キャッシュします
- GAS が HTTP 200 で `{ "ok": false, "error": "..." }` を返した場合は、Route Handler が `502` と `{ "error": "..." }` に変換します
- GAS 呼び出しは10秒でタイムアウトします

## URL クエリ

フィルタ状態は URL に保存されます。

- `sheet`: シート名
- `maxTotal`: 仕入れ上限
- `minTotal`: 価格下限
- `hours`: `6` / `24` / `72`
- `maxBids`: 入札数の上限
- `exclude`: 除外キーワード。未指定時は `ジャンク, 部品取り, 訳あり, 難あり, 不動`
- `include`: 含むキーワード
- `excludeFlea`: `0` のときフリマを含めます。未指定時は除外します
- `unknownShipping`: `1` のとき送料未定を除外します
- `sort`: `totalAsc` / `endsSoon` / `bidsAsc` / `newFetched`

## Vercel デプロイ

1. GitHub などにこのプロジェクトを push します。
2. Vercel で新規 Project として import します。
3. Environment Variables に `GAS_API_URL` と必要なら `GAS_READ_TOKEN` を設定します。
4. Build Command は `npm run build`、Development Command は `npm run dev` のままでデプロイします。

環境変数を設定しない Preview はモック表示、Production は実データ表示のように分けられます。
