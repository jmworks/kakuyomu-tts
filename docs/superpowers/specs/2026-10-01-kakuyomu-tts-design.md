# kakuyomu-tts 設計書

カクヨム読み上げ Chrome 拡張（非公式）

日付: 2026-10-01

## 目的

カクヨム（https://kakuyomu.jp/）のエピソードを、Mac の Chrome 上で Audible のように読み上げさせる。
読み上げ中は自動でページをめくり（次のエピソードへ遷移し）、停止するまで読み続ける。

## 前提・合意事項

- GitHub で公開する前提で作る（詳細は「公開に向けた方針」）
- 想定利用環境: PC の Chrome（作業中に流し聴きする用途）。作者の環境は Mac だが、OS 固有の処理は入れない
- 音声エンジン: VOICEVOX 互換エンジン。既定は VOICEVOX（`http://127.0.0.1:50021`）、URL は設定で変更可能（AivisSpeech `http://127.0.0.1:10101` など同じ API のエンジンも使えるように）
- 開始位置: ▶ を押した時点で画面最上部に表示されている段落から。遷移後のエピソードは冒頭から
- 読み位置は拡張側で保持しない。既読管理はカクヨム本体に任せる（実際にタブを遷移させるので、ログイン中ならカクヨム側の既読が更新される）
- 誤読対策: 拡張独自の「読み方の辞書」（全体 + 作品ごと）で対応する（2026-10-01 追加。下記「読み方の辞書」）。VOICEVOX アプリの「読み方＆アクセント辞書」も併用できる

## スコープ外（YAGNI）

- 読み位置の保存・再開
- VOICEVOX 互換エンジンとブラウザ音声以外の音声エンジン（クラウド TTS など）
- 再生途中で VOICEVOX が落ちたときのブラウザ音声への切り替え（開始時のみ判定し、途中で落ちたらエラー停止）
- iPhone 等モバイル対応
- UI の多言語化（カクヨム利用者向けなので日本語のみ）

## フォールバック（VOICEVOX が無い・起動していない場合）

- ▶ を押した時点で音声エンジンに接続できなければ、Chrome の `chrome.tts` API（OS の音声。Mac なら Kyoko など）で読み上げる。ページに「VOICEVOX に接続できないため、ブラウザの音声で読み上げます」と一度表示する
- 使う声は日本語（`lang` が `ja` で始まる）かつ `remote: false` のものに限る。Chrome の「Google 日本語」などのネットワーク音声は本文を外部に送るため使わない（プライバシー方針を守るため）
- 日本語のローカル音声が一つも無ければ、従来どおり接続エラーを表示して止まる
- 設定画面で「VOICEVOX が使えないときの声」を選べる（既定は Kyoko / Microsoft Haruka などの標準的な日本語音声。無ければ最初の日本語ローカル音声）。速度は VOICEVOX と共通の値を `rate` として使う
- ブラウザ音声の再生は background（service worker）で `player.js` を動かして行う。合成関数は文字列をそのまま返し、再生関数が `chrome.tts.speak` を呼んで `end` / `interrupted` / `cancelled` / `error` イベントで完了とする。`permissions` に `"tts"` を追加する
- 1 単位の読み上げ中に service worker が止まらないこと（読み上げ単位は最大 120 文字）を手動 E2E で確認する

## 読み方の辞書

- 書式: 1 行 1 語の「表記:読み」（全角コロン可）。空行・不正な行は無視
- 種類: 全体の辞書（`chrome.storage.local` の `dictGlobal`: string）と作品ごとの辞書（`dictWorks`: `{[workId]: {title, text}}`）。同じ表記は作品ごとの辞書を優先する。容量の都合で `storage.sync` ではなく `storage.local` に置く（端末間で同期しない）
- 適用: 音声を合成する直前（VOICEVOX は offscreen、ブラウザ音声は background）に、長い表記から順に 1 回だけ置き換える。表記の先頭が漢字で直前も漢字、または末尾が漢字で直後も漢字なら、別の熟語の一部とみなして置き換えない（例: 「我」→「我慢」「自我」は対象外）
- 作品の特定: URL `/works/{workId}/episodes/...` の workId。作品名は作品ページへのリンクの文字（ヘッダーの「閉じる」リンクは除く）
- 編集: 設定画面の 2 つの入力欄。⚙ から開くと URL の `work`/`title` パラメータで、ツールバーから開くとアクティブタブの content script への `getWork` 問い合わせで作品を特定する
- 読み上げ中の変更: 次の単位から反映する（先読み済みの音声を作り直す）

## 公開に向けた方針

- 名称: リポジトリ名 `kakuyomu-tts`、拡張の表示名「カクヨム読み上げ（非公式）」
- ライセンス: MIT（`LICENSE`）
- 名称・表記: カクヨム（株式会社KADOKAWA）とは無関係の非公式ツールであることを README 冒頭と拡張の説明文に明記する。公式と誤認させるロゴ・配色は使わない
- 配布: まず GitHub Releases に zip を置き「パッケージ化されていない拡張機能を読み込む」で導入する手順を README に書く。Chrome Web Store 申請は後で判断するが、審査に通る作りにしておく（リモートコード読み込みなし、権限は最小限、外部送信なし）
- プライバシー: 本文テキストはユーザーが指定したローカルの音声エンジンにだけ送る。外部サーバーへの送信・解析・トラッキングは一切しない。README に明記する
- 著作物: リポジトリにカクヨムの実作品本文を含めない（テストは構造だけを模した合成 HTML）
- 音声のクレジット: 拡張は音声ファイルを保存・配布しないため、個人の視聴には通常クレジット不要。ただし話者ごとに利用規約があるので、README で VOICEVOX と各キャラクターの規約へのリンクを案内する。ポップアップの話者名の横に「VOICEVOX:{話者名}」を表示する
- README（日本語）: 何ができるか（GIF）、必要なもの（Chrome と VOICEVOX）、導入手順、使い方、設定、よくあるトラブル（VOICEVOX 未起動、ポート違い、誤読の直し方＝VOICEVOX の辞書）、非公式である旨、ライセンス
- CI: GitHub Actions で push / PR 時に `npm test` を実行
- DOM 変更への備え: カクヨムのセレクタは `src/episode.js` の先頭に定数としてまとめ、壊れたときに直す場所を 1 か所にする。本文コンテナが見つからない場合は「ページ構造が変わった可能性があります」と表示する

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
| `manifest.json` | content script を `https://kakuyomu.jp/works/*/episodes/*` に注入。`host_permissions: ["http://127.0.0.1/*", "http://localhost/*"]`（ポート違いのエンジンに対応するため。match pattern がポートを無視することは実装時に検証する）、`permissions: ["storage", "offscreen", "tts"]` |
| `src/content.js` | ページ内UI（右下の ▶/■ ボタン、エラー表示）、段落抽出、開始段落判定、読み上げ中段落のハイライトと自動スクロール、次エピソードへの遷移、ページロード時の自動再開 |
| `src/episode.js` | DOM 純粋関数群（`extractParagraphs`, `findStartIndex`, `findNextEpisodeUrl`）。content.js から import し、テスト対象にする |
| `src/background.js` | Service worker。再生状態の管理（どのタブが再生中か）、設定の読み込み、offscreen document の生成、content script と offscreen の間のメッセージ中継 |
| `src/playback-state.js` | 再生状態の遷移を表す純粋関数群（テスト対象） |
| `src/text.js` | 段落を読み上げ単位に分割（長い段落を文で区切る、記号だけの段落を除く） |
| `src/player.js` | 読み上げ単位を順に「合成→再生」し、次の単位を先読みするキュー（合成・再生関数を注入してテスト可能にする） |
| `src/settings.js` | 設定の既定値、エンジン URL の正規化 |
| `src/voicevox.js` | VOICEVOX API クライアント（`getSpeakers`, `synthesize(text, speaker, speed)`） |
| `src/offscreen.html` / `offscreen.js` | `player.js` を動かす。VOICEVOX で合成した WAV を `Audio` で再生し、読み上げ位置・終了・エラーを background に通知 |
| `src/controls.js` | ページ右下の ▶/■ ボタンとメッセージ表示（Shadow DOM でカクヨムの CSS と隔離） |
| `src/popup.html` / `popup.js` | 話者選択（`/speakers` から取得）、速度（`speedScale`）設定、エンジン URL 設定と接続テスト |

VOICEVOX との通信を拡張側（offscreen / background / popup）で行う理由: カクヨムのオリジンから `127.0.0.1:50021` へ直接 fetch すると CORS で拒否される可能性が高い。拡張のページは `host_permissions` で CORS を回避できる。
再生を offscreen に置く理由: 再生処理を拡張コンテキスト内で完結させ、ページ側の制約に影響されないようにする。

content script はページ読み込み時点で「再生中」かを判定する必要があるため、content.js は ES module を動的 import するローダー経由で読み込む（MV3 の content script は直接 ESM にできない）。

## データフロー

1. ユーザーが ▶ を押す
2. content.js: `findStartIndex` で画面最上部の段落を決定し、それ以降の段落テキスト配列を `{type: "play", paragraphs, startIndex}` として background に送る
3. background: `chrome.storage.session` に再生中タブを保存し、設定を読み込み、段落を読み上げ単位に分けて offscreen に渡す。offscreen が単位ごとに合成→再生し、再生中に次の単位を先に合成しておく。各単位の再生開始時に段落番号が background 経由で `{type: "reading", index}` として content.js に届く
4. content.js: 該当段落をハイライトし `scrollIntoView({block: "center"})`
5. 全段落終了 → background が `{type: "episodeEnd"}` を送る → content.js が `findNextEpisodeUrl` の URL へ `location.href` で遷移
   - 次エピソードが無い（最新話）場合は停止
6. 遷移先ページで content.js がロード時に background に「このタブは再生中か」を問い合わせ、再生中なら冒頭（startIndex 0）から自動で play を送る
7. 停止条件: ■ 押下 / 最新話到達 / 拡張による自動遷移以外のページ遷移（ユーザー自身の移動やリロード）/ タブを閉じる → `playingTabId` を消して offscreen の再生を止める
   - 自動遷移の直前に content.js が `{type: "advance", url}` を送り、background は遷移先を記録する。ページ読み込み開始（`tabs.onUpdated` の `status: "loading"`）時にこの記録がなければ停止する。遷移先からの問い合わせが記録と違う話だったり 60 秒を過ぎていたりしたら、再開せずに停止する

## 保存データ

- `chrome.storage.sync`: `{engineUrl: string, speaker: number | null, speed: number, paragraphPause: number, browserVoice: string | null}`（初期値: engineUrl = `http://127.0.0.1:50021`、speaker = null（エンジンの先頭話者のスタイル ID を使う）、speed = 1.0、paragraphPause = 1.0（段落が変わるところで空ける無音の秒数。同じ段落を分割した部分の間には空けない）、browserVoice = null（標準的な日本語ローカル音声を自動で選ぶ））
- `chrome.storage.session`: `{playback: {playingTabId: number | null, playId: number, advance: {path: string, at: number} | null}}`（ブラウザ終了で消える）。読み書きは background 内で直列化する
  - `playId`: ▶ のたびに増える再生の世代番号。止めた後に届く古いイベントや、準備中に止められた再生を捨てるのに使う
  - `advance`: 自動遷移の予定（遷移先のパスと時刻）。遷移先から 60 秒以内に同じパスで問い合わせが来たときだけ再開する

## エラー処理

- 開始時に音声エンジンに接続できない: ブラウザ音声へフォールバック（上記）。日本語ローカル音声も無ければ停止し「VOICEVOX（音声エンジン）に接続できません。起動しているか、設定の URL を確認してください」を表示
- 再生途中で音声エンジンに接続できなくなった: 停止して同じメッセージを表示
- 本文コンテナが見つからない: ▶ ボタンを出さない
- 1段落の合成または再生に失敗: 再生停止してエラー表示（スキップはしない。原因が見えなくなるため。無音のまま次話へ進み続けるのも防ぐ）

## テスト

- 自動テスト（vitest + jsdom）: `src/episode.js` の各関数を、実ページ構造を模した合成 HTML フィクスチャで検証（実作品の本文はリポジトリに入れない）
  - `extractParagraphs`: blank 除外、ルビの `rt`/`rp` 除外、空白のトリム
  - `findStartIndex`: 段落の `getBoundingClientRect` をモックし、画面上端に最初にかかる段落を返す。全段落が画面外上方なら最後、下方なら0
  - `findNextEpisodeUrl`: リンクありで絶対URL、なしで `null`
- 手動 E2E: 実 Chrome に拡張をロードし、実 VOICEVOX で「途中から再生 → 話末で次話へ遷移して継続 → ■ で停止」「最新話で停止」「VOICEVOX 停止中のエラー表示」を確認
