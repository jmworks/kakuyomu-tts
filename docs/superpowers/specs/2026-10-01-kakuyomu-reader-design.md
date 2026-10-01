# カクヨム読み上げ Chrome 拡張 設計書

日付: 2026-10-01

## 目的

カクヨム（https://kakuyomu.jp/）のエピソードを、Mac の Chrome 上で Audible のように読み上げさせる。
読み上げ中は自動でページをめくり（次のエピソードへ遷移し）、停止するまで読み続ける。

## 前提・合意事項

- 利用環境: Mac + Chrome（作業中に流し聴きする用途）
- 音声エンジン: VOICEVOX（ユーザーの Mac にインストール済み、`http://127.0.0.1:50021`）
- 開始位置: ▶ を押した時点で画面最上部に表示されている段落から。遷移後のエピソードは冒頭から
- 読み位置は拡張側で保持しない。既読管理はカクヨム本体に任せる（実際にタブを遷移させるので、ログイン中ならカクヨム側の既読が更新される）
- 誤読対策は今回のスコープ外。必要になったら VOICEVOX アプリの「読み方＆アクセント辞書」で対応する

## スコープ外（YAGNI）

- 読み位置の保存・再開
- 拡張独自の読み辞書
- VOICEVOX 以外の音声エンジン（Web Speech API へのフォールバック含む）
- iPhone 等モバイル対応

## カクヨムのDOM（2026-10-01 実ページで確認）

- エピソードURL: `https://kakuyomu.jp/works/{workId}/episodes/{episodeId}`
- ページ遷移は通常の全ページロード（SPA ではない）
- 本文コンテナ: `.widget-episodeBody.js-episode-body`
- 段落: コンテナ直下の `<p id="p1">`, `<p id="p2">`, …。空行は `<p class="blank">`（読み上げ対象外）
- ルビ: `<ruby><rb>…</rb><rt>…</rt></ruby>` の可能性あり（確認したページには無し）。読み上げテキストは `<rt>`/`<rp>` を除いた親文字のみとする
- エピソードタイトル: `.widget-episodeTitle`
- 次のエピソード: `a#contentMain-readNextEpisode`（`href` は相対パス）。最新話では要素自体が存在しない
- ページに CSP meta なし

## アーキテクチャ

Chrome 拡張（Manifest V3）、ビルド不要の素の JavaScript（ES modules）。

| ファイル | 役割 |
|---|---|
| `manifest.json` | content script を `https://kakuyomu.jp/works/*/episodes/*` に注入。`host_permissions: ["http://127.0.0.1:50021/*"]`、`permissions: ["storage", "offscreen"]` |
| `src/content.js` | ページ内UI（右下の ▶/■ ボタン、エラー表示）、段落抽出、開始段落判定、読み上げ中段落のハイライトと自動スクロール、次エピソードへの遷移、ページロード時の自動再開 |
| `src/episode.js` | DOM 純粋関数群（`extractParagraphs`, `findStartIndex`, `findNextEpisodeUrl`）。content.js から import し、テスト対象にする |
| `src/background.js` | Service worker。VOICEVOX 呼び出し（`/audio_query` → `/synthesis`）、1段落先の先読み、offscreen document の生成と再生指示、再生状態の管理 |
| `src/voicevox.js` | VOICEVOX API クライアント（`getSpeakers`, `synthesize(text, speaker, speed)`） |
| `src/offscreen.html` / `offscreen.js` | WAV を `Audio` で再生し、終了を background に通知 |
| `src/popup.html` / `popup.js` | 話者選択（`/speakers` から取得）、速度（`speedScale`）設定 |

VOICEVOX との通信を background に集約する理由: カクヨムのオリジンから `127.0.0.1:50021` へ直接 fetch すると CORS で拒否される可能性が高い。拡張コンテキストは `host_permissions` で CORS を回避できる。
再生を offscreen に置く理由: 再生処理を拡張コンテキスト内で完結させ、ページ側の制約に影響されないようにする。

content script はページ読み込み時点で「再生中」かを判定する必要があるため、content.js は ES module を動的 import するローダー経由で読み込む（MV3 の content script は直接 ESM にできない）。

## データフロー

1. ユーザーが ▶ を押す
2. content.js: `findStartIndex` で画面最上部の段落を決定し、それ以降の段落テキスト配列を `{type: "play", paragraphs, startIndex}` として background に送る
3. background: `chrome.storage.session` に `{playingTabId}` を保存。段落を順に `synthesize` → offscreen で再生。再生中に次段落を先に合成しておく。各段落の再生開始時に `{type: "reading", index}` を content.js に送る
4. content.js: 該当段落をハイライトし `scrollIntoView({block: "center"})`
5. 全段落終了 → background が `{type: "episodeEnd"}` を送る → content.js が `findNextEpisodeUrl` の URL へ `location.href` で遷移
   - 次エピソードが無い（最新話）場合は停止
6. 遷移先ページで content.js がロード時に background に「このタブは再生中か」を問い合わせ、再生中なら冒頭（startIndex 0）から自動で play を送る
7. 停止条件: ■ 押下 / 最新話到達 / 再生中タブがエピソード以外のページへ遷移 / タブを閉じる → `playingTabId` を消して offscreen の再生を止める

## 保存データ

- `chrome.storage.sync`: `{speaker: number, speed: number}`（初期値: speaker = VOICEVOX の先頭話者のスタイル ID、speed = 1.0）
- `chrome.storage.session`: `{playingTabId: number | null}`（ブラウザ終了で消える）

## エラー処理

- VOICEVOX に接続できない（fetch 失敗 / タイムアウト）: 再生を停止し、ページ右下に「VOICEVOX を起動してください」を表示
- 本文コンテナが見つからない: ▶ ボタンを出さない
- 1段落の合成に失敗: 再生停止してエラー表示（スキップはしない。原因が見えなくなるため）

## テスト

- 自動テスト（vitest + jsdom）: `src/episode.js` の各関数を、実ページ構造を模した合成 HTML フィクスチャで検証（実作品の本文はリポジトリに入れない）
  - `extractParagraphs`: blank 除外、ルビの `rt`/`rp` 除外、空白のトリム
  - `findStartIndex`: 段落の `getBoundingClientRect` をモックし、画面上端に最初にかかる段落を返す。全段落が画面外上方なら最後、下方なら0
  - `findNextEpisodeUrl`: リンクありで絶対URL、なしで `null`
- 手動 E2E: 実 Chrome に拡張をロードし、実 VOICEVOX で「途中から再生 → 話末で次話へ遷移して継続 → ■ で停止」「最新話で停止」「VOICEVOX 停止中のエラー表示」を確認
