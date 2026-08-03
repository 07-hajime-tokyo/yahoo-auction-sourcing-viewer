# ヤフオク仕入れ候補ビューア

Google Apps Script WebApp または Google Sheets CSV を Next.js Route Handler 経由で読み込み、仕入れ候補をURLクエリの条件で絞り込む内部ツールです。

## セットアップ

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

## データソース

優先順位は次の通りです。

1. `GAS_API_URL` がある場合: GAS WebApp JSON APIを使用
2. `GAS_API_URL` が無い場合: Google Sheets CSVを使用
3. Google Sheets CSVが読めない、または設定が無い場合: `mock/items.json` を使用

このリポジトリでは、既定のGoogle Sheetとして次を組み込んでいます。

- Spreadsheet ID: `1nXVUKaGbNDDrZp-n4Vl-fK4qU_7TC5yKFYY3ghArItw`
- Sheet tab: `リペア`

`mock/items.json` には上記シートから取り込んだスナップショットを同梱しています。非公開シートのままVercelからCSV取得できない場合でも、このスナップショットで一覧表示できます。最新データへ自動更新したい場合は、`GAS_API_URL` を設定するか、Vercelから読める公開CSV URLを `GOOGLE_SHEET_CSV_URL` に設定してください。

商品の状態欄は、表示中データに含まれるコンディションを手動でメモするためのチェックリストです。チェック状態はURLに残りますが、商品一覧の絞り込みには使いません。カード上の状態表示は、上流データに `conditionText` / `condition` / `商品の状態` / `状態` / `コンディション` のいずれかの列がある場合だけ表示します。タイトルから状態を推測する処理は入れていません。

`endTimeText` が `終了` の商品、または `fetchedAt + endsInHours` から終了済みと推定できる商品は一覧に表示しません。

## 環境変数

`.env.local` または Vercel Project Settings に設定します。

```bash
GAS_API_URL=https://script.google.com/macros/s/xxxxx/exec
GAS_READ_TOKEN=

GOOGLE_SHEET_ID=1nXVUKaGbNDDrZp-n4Vl-fK4qU_7TC5yKFYY3ghArItw
GOOGLE_SHEET_NAME=リペア
GOOGLE_SHEET_CSV_URL=
```

- `GAS_API_URL`: 公開済みGAS WebAppの `/exec` URL。設定時は最優先で使います。
- `GAS_READ_TOKEN`: 読み取りトークン。空ならGASへのクエリに付けません。
- `GOOGLE_SHEET_ID`: Google Sheets CSVを使う場合のSpreadsheet ID。
- `GOOGLE_SHEET_NAME`: 読み込むタブ名。
- `GOOGLE_SHEET_CSV_URL`: 公開CSV URLを直接指定したい場合に使います。

ブラウザからGASやGoogle Sheetsへ直接アクセスせず、画面は必ず `/api/sheets` と `/api/items` を呼びます。

## API 中継

- `GET /api/sheets`: シート一覧を返します。
- `GET /api/items?sheet=リペア`: 商品一覧を返します。
- `export const revalidate = 300` で5分キャッシュします。
- GASがHTTP 200で `{ "ok": false, "error": "..." }` を返した場合、Route Handlerは `502` と `{ "error": "..." }` に変換します。
- GAS/Google Sheets CSVの呼び出しは10秒でタイムアウトします。

## URL クエリ

フィルタ状態はURLに保存されます。

- `sheet`: シート名
- `maxTotal`: 仕入れ上限
- `minTotal`: 価格下限
- `hours`: `6` / `24` / `48` / `72`
- `maxBids`: 入札数の上限
- `condition`: 商品の状態チェック欄。表示件数には影響しません。`unused` / `used` / `likeNew` / `good` / `fair` / `damaged` / `poor` をカンマ区切りで指定
- `exclude`: 除外キーワード
- `include`: 含むキーワード
- `excludeFlea`: `0` のときフリマを含めます。既定では除外します。
- `unknownShipping`: `1` のとき送料未定を除外します。
- `sort`: `totalAsc` / `endsSoon` / `bidsAsc` / `newFetched`

## Vercel デプロイ

1. GitHubにpushします。
2. VercelでこのリポジトリをImportします。
3. 必要に応じてEnvironment Variablesを設定します。
4. Build Commandは `npm run build` のままでデプロイします。

Google Sheet CSVを使う場合、そのシートはVercelのサーバーからCSVとして読める必要があります。非公開シートを使う場合は、従来通りGAS WebAppを公開して `GAS_API_URL` を設定してください。
