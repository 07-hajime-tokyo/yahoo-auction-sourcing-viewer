# ヤフオク仕入れ候補ビューア

Google Apps Script WebApp、または公開Google Sheets CSVをNext.js Route Handler経由で読み、ヤフオクの仕入れ候補を絞り込む内部ツールです。

## セットアップ

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

## データソース

優先順位は次の通りです。

1. `GAS_API_URL` がある場合: GAS WebApp JSON API
2. `GAS_API_URL` がない場合: Google Sheets CSV
3. Google Sheets CSVを読めない場合: `mock/items.json`

既定のGoogle Sheetは次のファイルです。

- Spreadsheet ID: `1nXVUKaGbNDDrZp-n4Vl-fK4qU_7TC5yKFYY3ghArItw`
- 既定タブ: `リペア`, `New 3DS LL`

`/api/sheets` はスプレッドシートのタブ一覧を再取得します。新しいタブを追加した場合、画面の再読み込みボタンでタブが増えます。自動検出できない場合は `GOOGLE_SHEET_NAMES=リペア,New 3DS LL` のように固定指定できます。

## 環境変数

`.env.local` または Vercel Project Settings に設定します。

```bash
GAS_API_URL=https://script.google.com/macros/s/xxxxx/exec
GAS_READ_TOKEN=

GOOGLE_SHEET_ID=1nXVUKaGbNDDrZp-n4Vl-fK4qU_7TC5yKFYY3ghArItw
GOOGLE_SHEET_NAME=リペア
GOOGLE_SHEET_NAMES=
GOOGLE_SHEET_CSV_URL=
```

- `GAS_API_URL`: GAS WebAppの `/exec` URL。設定時は最優先で使います。
- `GAS_READ_TOKEN`: 読み取りトークン。空ならGASへのクエリに付けません。
- `GOOGLE_SHEET_ID`: CSV fallbackで読むSpreadsheet ID。
- `GOOGLE_SHEET_NAME`: `sheet` 未指定時の既定タブ名。
- `GOOGLE_SHEET_NAMES`: タブ一覧の自動検出ができない時のカンマ区切り固定リスト。
- `GOOGLE_SHEET_CSV_URL`: 単一CSV URLを直接指定したい場合に使います。

ブラウザからGASやGoogle Sheetsへ直接アクセスせず、画面は必ず `/api/sheets` と `/api/items` を呼びます。

## 除外キーワード

除外キーワードは `localStorage` の `isa.excludeKeywords` に文字列配列JSONとして保存します。

優先順位は次の通りです。

1. URLに `exclude` がある場合はURLを使う
2. URLに `exclude` がない場合は `localStorage`
3. どちらもない場合は既定値: `ジャンク, 部品取り, 訳あり, 難あり, 不動`

UIでチップを追加・削除すると、`localStorage` とURLの両方に反映します。チップの件数は、そのキーワードだけを適用した場合に落ちる件数です。

## 商品の状態

商品の状態はフィルタではありません。ヤフオク検索結果一覧や上流APIに状態フィールドがないため、画面上の手動チェックメモとして扱います。

チェック状態はタブごとに `localStorage` へ保存します。URLクエリには保存せず、表示件数にも影響しません。古いURLに `condition=...` が残っている場合は画面側で削除します。

## URLクエリ

フィルタ状態はURLに保存されます。

- `sheet`: シート名
- `maxTotal`: 仕入れ上限
- `minTotal`: 価格下限
- `hours`: `6` / `24` / `48` / `72`
- `maxBids`: 入札数の上限
- `exclude`: 除外キーワード
- `include`: 含むキーワード
- `excludeFlea`: `0` のときフリマを含めます。既定では除外します。
- `unknownShipping`: `1` のとき送料未定を除外します。
- `sort`: `totalAsc` / `endsSoon` / `bidsAsc` / `newFetched`

`condition` クエリは使いません。

## API 中継

- `GET /api/sheets`: シート一覧を返します。
- `GET /api/items?sheet=リペア`: 商品一覧を返します。
- `export const revalidate = 300` で5分キャッシュします。
- GASがHTTP 200で `{ "ok": false, "error": "..." }` を返した場合、Route Handlerは `502` と `{ "error": "..." }` に変換します。
- GAS/Google Sheets CSVの呼び出しは10秒でタイムアウトします。

`endTimeText` に `終了` を含む商品、または `fetchedAt + endsInHours` から終了済みと推定できる商品は一覧に表示しません。

## Vercel デプロイ

1. GitHubにpushします。
2. VercelでこのリポジトリをImportします。
3. 必要に応じてEnvironment Variablesを設定します。
4. Build Commandは `npm run build` のままでデプロイします。
