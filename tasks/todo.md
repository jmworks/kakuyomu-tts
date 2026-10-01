# kakuyomu-tts TODO

実装計画: `docs/superpowers/plans/2026-10-01-kakuyomu-tts.md`

- [x] Task 1: 雛形とカクヨム本文の読み取り
- [x] Task 2: 読み上げ単位への分割
- [x] Task 3: 設定と VOICEVOX クライアント
- [x] Task 4: 先読み付き再生キュー
- [x] Task 5: 再生状態の遷移
- [x] Task 6: ブラウザ音声フォールバック
- [x] Task 7: background / offscreen の配線
- [x] Task 8: ページ側 UI と設定画面
- [x] Task 9: 実機 E2E 確認（Playwright Chromium で自動確認。実 Chrome での聴感確認は未）
- [x] Task 10: README と CI

## 公開前に残っていること

- [ ] 実 Chrome で `docs/e2e-checklist.md` を確認（音の聞こえ方、段落間の無音、2 タブ、再生中の VOICEVOX 終了、速度 0.5 での service worker 停止）
- [ ] アイコン（`manifest.json` の `icons`）
- [ ] README の動作 GIF
- [ ] GitHub リポジトリ `kakuyomu-tts` を作成して push、Releases に `dist/kakuyomu-tts.zip` を置く

## 後回しにした軽微な指摘（最終レビューより）

- `hardCut` がサロゲートペア（BMP 外の漢字・絵文字）を分断しうる
- 固定表示のエラーが再開後も残る
- CPU 版 VOICEVOX で初回合成が 30 秒近いと offscreen が自動で閉じうる
- `web_accessible_resources` の `src/*.js` でカクヨム側から拡張の存在が分かる

## レビュー

- 2026-10-01: 10 タスクを実装。自動テスト 82 件成功
- 実カクヨム + VOICEVOX 0.25.1 で、途中段落からの開始、次話への自動遷移と再開、■ 停止、最新話での停止、リロードでの停止、設定画面、URL 正規化、ブラウザ音声フォールバックを確認
- E2E で、Mac のフォールバック既定の声が Eddy になる問題を発見して修正（Kyoko などを優先）
- 最終レビュー（別エージェント）で Important 4 件 + 格上げ 1 件を修正: 準備中の停止後に音声が流れる、自動遷移の目印が残り後で勝手に再生、状態の同時更新の消失、開始失敗でボタンが固まる、再生失敗を成功扱い
