# ハワイ旅程 2026

家族旅行（オアフ島 2026/12/2〜12/13）の旅程表です。HTML / CSS / JavaScript だけで動きます（ビルド不要）。

## ファイル
| ファイル | 役割 |
|---|---|
| `data/itinerary.json` | 旅程データ（予定・ホテル・便・予算・チェックリスト）。手で直す場所 |
| `index.html` / `styles.css` / `app.js` | アプリ本体 |
| `sw.js` | オフライン対応（Service Worker） |
| `manifest.webmanifest` / `icons/` | ホーム画面に追加したときの名前とアイコン |

## ローカルで確認する
`file://` で直接開くと JSON を読み込めないので、簡易サーバーを使います。

```bash
cd hawaii-itinerary
python3 -m http.server 8000
```
ブラウザで http://localhost:8000 を開きます。Mac の Safari の「開発 > レスポンシブ・デザイン・モード」で iPhone 表示を確認できます。

## JSON を直すとき
- アプリで編集していない日は、JSON の変更がそのまま反映されます。
- アプリで編集した日は端末の内容が優先されます（「アプリで編集済み」と表示）。JSON を反映したいときは、その日の下の「この日をJSONの内容に戻す」を押します。
- 予定の `slot` は `morning`（朝）/ `noon`（昼）/ `evening`（夕）/ `night`（夜）。`"rest": true` で「ゆっくり」表示。
- `map` が空なら場所名で Google マップを検索します。
- JSON の書き方を間違えると、アプリ上部にエラーが出ます。

## アプリ本体を直したとき
`sw.js` の `CACHE = "hawaii2026-v1"` の番号を上げてください（v2 など）。スマホ側で古い画面が残るのを防げます。JSON だけの変更なら不要です。
