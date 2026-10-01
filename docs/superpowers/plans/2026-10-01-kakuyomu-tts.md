# kakuyomu-tts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カクヨムのエピソードを VOICEVOX（無ければ OS のローカル音声）で読み上げ、話の終わりで次のエピソードへ自動遷移し続ける Chrome 拡張を作り、GitHub で公開できる状態にする。

**Architecture:** Manifest V3 拡張、ビルドなしの素の ES modules。content script はページ内 UI・段落抽出・ハイライト・遷移を担当し、background（service worker）が再生状態の管理とメッセージ中継を行う。VOICEVOX の合成と再生は offscreen document 内の `Player` が、ブラウザ音声の再生は background 内の `Player` が `chrome.tts` で行う。

**Tech Stack:** Chrome Extension Manifest V3（Chrome 116+）、JavaScript（ES modules）、VOICEVOX ENGINE HTTP API、`chrome.tts`、vitest + jsdom（テストのみ）、GitHub Actions

**Spec:** `docs/superpowers/specs/2026-10-01-kakuyomu-tts-design.md`

## Global Constraints

- ビルドステップを入れない。`src/` 以下がそのまま拡張として読み込まれる
- `minimum_chrome_version` は `"116"`（`chrome.runtime.getContexts` を使うため）
- 本文テキストの送信先は、ユーザー設定のローカル音声エンジン（`http://127.0.0.1` / `http://localhost`）と `remote: false` の OS 音声だけ。それ以外への通信を追加しない
- リポジトリにカクヨムの実作品本文を入れない。テストは合成 HTML のみ
- ユーザーに見える文言はすべて日本語
- 拡張の表示名は「カクヨム読み上げ（非公式）」、リポジトリ名は `kakuyomu-tts`、ライセンスは MIT
- カクヨムの CSS セレクタは `src/episode.js` 先頭の `SELECTORS` 以外に書かない
- 読み上げ単位は最大 120 文字
- コミットメッセージは `<type>: <日本語の説明>` 形式で、末尾に以下を付ける:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## Review Focus

1. 再生途中で VOICEVOX を終了した → 停止して接続エラーを表示し、ボタンが ▶ に戻る（Task 3 / Task 4 のテストで固定、Task 9 で手動確認）
2. 句読点の無い数百文字の段落 → 120 文字以下に分割され、合成待ちで長く無音にならない（Task 2 のテストで固定）
3. 「＊　＊　＊」「◇◇◇」など記号だけの段落 → 読み飛ばされ、エンジンエラーにならない（Task 2 のテストで固定）
4. 再生中にユーザー自身がリロード・別ページへ移動した → 音声が止まり、移動先で勝手に再生が始まらない（Task 5 のテストで固定）
5. エンジン URL を末尾スラッシュ付き・スキーム無し・外部ホストで入力した → 正規化される、または形式エラーが表示される（Task 3 のテストで固定）

---

## File Structure

| パス | 責務 |
|---|---|
| `manifest.json` | 拡張の定義 |
| `package.json` / `vitest.config.js` | テスト実行環境 |
| `src/episode.js` | カクヨム DOM の読み取り（セレクタ定数、段落抽出、開始段落判定、次話 URL） |
| `src/text.js` | 段落 → 読み上げ単位への分割 |
| `src/settings.js` | 設定の既定値、エンジン URL 正規化、既定話者の決定 |
| `src/voicevox.js` | VOICEVOX API クライアント |
| `src/browser-voice.js` | ブラウザ音声の選択（純粋関数）と `chrome.tts` による再生関数 |
| `src/player.js` | 合成→再生キュー（先読み付き） |
| `src/playback-state.js` | 再生状態遷移の純粋関数 |
| `src/background.js` | service worker：状態管理・中継・ブラウザ音声 Player |
| `src/offscreen.html` / `src/offscreen.js` | VOICEVOX Player |
| `src/content-loader.js` | content script（ESM を動的 import するだけ） |
| `src/content.js` | ページ側の制御 |
| `src/controls.js` | ▶/■ ボタンとメッセージ（Shadow DOM） |
| `src/popup.html` / `src/popup.js` | 設定画面 |
| `tests/*.test.js` / `tests/fixtures/episode.html` | 自動テスト |
| `README.md` / `LICENSE` / `.github/workflows/test.yml` | 公開用 |

### メッセージ一覧（全タスク共通の契約）

| 方向 | メッセージ |
|---|---|
| content → background | `{type: "play", texts: string[], startIndex: number}` / `{type: "stop"}` / `{type: "advance"}`（応答 `{}`） / `{type: "query"}`（応答 `{resume: boolean}`） |
| background → content（`chrome.tabs.sendMessage`） | `{type: "reading", index: number}` / `{type: "episodeEnd"}` / `{type: "error", message: string}` / `{type: "notice", message: string}` / `{type: "stopped"}` |
| background → offscreen | `{target: "offscreen", type: "start", tabId: number, units: Utterance[], settings: Settings}` / `{target: "offscreen", type: "stop"}` |
| offscreen → background | `{type: "player-event", tabId: number, event: "reading" \| "ended" \| "error", index?: number, message?: string}` |

型:
- `Utterance = {index: number, text: string}`（`index` は段落番号）
- `Settings = {engineUrl: string, speaker: number | null, speed: number, browserVoice: string | null}`

---

### Task 1: プロジェクト雛形とカクヨム DOM 読み取り（`episode.js`）

**Files:**
- Create: `package.json`, `vitest.config.js`, `manifest.json`, `LICENSE`, `src/episode.js`, `tests/fixtures/episode.html`, `tests/episode.test.js`, `tests/manifest.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces:
  - `SELECTORS: {body: string, paragraph: string, blankClass: string, nextEpisode: string}`
  - `findEpisodeBody(doc: Document): Element | null`
  - `extractParagraphs(doc: Document): Array<{el: Element, text: string}>`
  - `findStartIndex(paragraphs: Array<{el: Element}>): number`
  - `findNextEpisodeUrl(doc: Document): string | null`（絶対 URL）

- [ ] **Step 1: 雛形ファイルを作る**

`package.json`:
```json
{
  "name": "kakuyomu-tts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "カクヨムの小説を VOICEVOX で読み上げる Chrome 拡張（非公式）",
  "license": "MIT",
  "scripts": {
    "test": "vitest run",
    "package": "mkdir -p dist && rm -f dist/kakuyomu-tts.zip && zip -r dist/kakuyomu-tts.zip manifest.json src LICENSE"
  }
}
```

`vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
  },
});
```

`manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "カクヨム読み上げ（非公式）",
  "version": "0.1.0",
  "description": "カクヨムの小説を VOICEVOX で読み上げ、話の終わりで次のエピソードへ自動で進みます。カクヨム公式とは関係ありません。",
  "minimum_chrome_version": "116",
  "permissions": ["storage", "offscreen", "tts"],
  "host_permissions": ["http://127.0.0.1/*", "http://localhost/*"],
  "background": { "service_worker": "src/background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["https://kakuyomu.jp/works/*/episodes/*"],
      "js": ["src/content-loader.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    { "resources": ["src/*.js"], "matches": ["https://kakuyomu.jp/*"] }
  ],
  "action": { "default_popup": "src/popup.html", "default_title": "カクヨム読み上げ" }
}
```

`LICENSE`: MIT License 全文、`Copyright (c) 2026 jmworks`。

`.gitignore` に `dist/` を追記（既存: `.playwright-mcp/`, `node_modules/`）。

Run: `npm install -D vitest jsdom`
Expected: `package.json` に devDependencies が追加され、`package-lock.json` ができる

- [ ] **Step 2: 合成フィクスチャを作る**

`tests/fixtures/episode.html`（実ページの構造を模した架空の文章）:
```html
<!doctype html>
<html lang="ja">
<body>
<div id="contentMain">
  <p class="widget-episodeTitle">第1話　テストの話</p>
  <div class="widget-episodeBody js-episode-body">
    <p id="p1">　吾輩はテストである。</p>
    <p id="p2" class="blank"><br /></p>
    <p id="p3"><ruby><rb>名前</rb><rp>（</rp><rt>なまえ</rt><rp>）</rp></ruby>はまだ無い。</p>
    <p id="p4">　 </p>
    <p id="p5">「どこで生まれたか」</p>
  </div>
  <a id="contentMain-readNextEpisode" class="js-read-next-episode" href="/works/1/episodes/3">次のエピソード</a>
</div>
</body>
</html>
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/episode.test.js`:
```js
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  extractParagraphs,
  findEpisodeBody,
  findNextEpisodeUrl,
  findStartIndex,
} from '../src/episode.js';

const HTML = readFileSync(new URL('./fixtures/episode.html', import.meta.url), 'utf8');
const URL_ = 'https://kakuyomu.jp/works/1/episodes/2';

function load(html = HTML) {
  return new JSDOM(html, { url: URL_ }).window.document;
}

describe('findEpisodeBody', () => {
  it('本文コンテナを返す', () => {
    expect(findEpisodeBody(load()).classList.contains('js-episode-body')).toBe(true);
  });
  it('本文が無いページでは null', () => {
    expect(findEpisodeBody(load('<p>no body</p>'))).toBeNull();
  });
});

describe('extractParagraphs', () => {
  it('空行と空白だけの段落を除き、ルビは親文字だけ読む', () => {
    const texts = extractParagraphs(load()).map((p) => p.text);
    expect(texts).toEqual(['吾輩はテストである。', '名前はまだ無い。', '「どこで生まれたか」']);
  });
  it('要素への参照を保持する', () => {
    const [first] = extractParagraphs(load());
    expect(first.el.id).toBe('p1');
  });
  it('本文が無ければ空配列', () => {
    expect(extractParagraphs(load('<p>x</p>'))).toEqual([]);
  });
});

describe('findStartIndex', () => {
  const para = (bottom) => ({ el: { getBoundingClientRect: () => ({ bottom }) } });

  it('画面上端より下に下端がある最初の段落', () => {
    expect(findStartIndex([para(-50), para(-1), para(30), para(200)])).toBe(2);
  });
  it('下端がちょうど 0 の段落は画面外とみなす', () => {
    expect(findStartIndex([para(0), para(10)])).toBe(1);
  });
  it('全段落が画面より上なら最後の段落', () => {
    expect(findStartIndex([para(-300), para(-100)])).toBe(1);
  });
  it('全段落が画面内・下なら 0', () => {
    expect(findStartIndex([para(500), para(900)])).toBe(0);
  });
  it('段落が無ければ 0', () => {
    expect(findStartIndex([])).toBe(0);
  });
});

describe('findNextEpisodeUrl', () => {
  it('次話リンクを絶対 URL で返す', () => {
    expect(findNextEpisodeUrl(load())).toBe('https://kakuyomu.jp/works/1/episodes/3');
  });
  it('最新話（リンク無し）では null', () => {
    const doc = load();
    doc.getElementById('contentMain-readNextEpisode').remove();
    expect(findNextEpisodeUrl(doc)).toBeNull();
  });
});
```

`tests/manifest.test.js`（manifest が参照するファイルの存在確認）:
```js
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

describe('manifest.json', () => {
  it('manifest_version 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });
  it.each([
    ['background', () => manifest.background.service_worker],
    ['content script', () => manifest.content_scripts[0].js[0]],
    ['popup', () => manifest.action.default_popup],
  ])('%s のファイルが存在する', (_, get) => {
    expect(exists(get())).toBe(true);
  });
});
```
（manifest テストは Task 6〜8 でファイルができるまで一部失敗する。Task 1 では `episode.test.js` だけを対象に実行する）

- [ ] **Step 4: 失敗を確認**

Run: `npx vitest run tests/episode.test.js`
Expected: FAIL（`../src/episode.js` が無い）

- [ ] **Step 5: 実装**

`src/episode.js`:
```js
// カクヨムのページ構造に依存するセレクタはここにだけ書く。
// カクヨム側の変更で動かなくなったら、まずここを直す。
export const SELECTORS = {
  body: '.js-episode-body',
  paragraph: 'p',
  blankClass: 'blank',
  nextEpisode: '#contentMain-readNextEpisode',
};

export function findEpisodeBody(doc) {
  return doc.querySelector(SELECTORS.body);
}

function paragraphText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('rt, rp').forEach((node) => node.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

export function extractParagraphs(doc) {
  const body = findEpisodeBody(doc);
  if (!body) return [];
  return [...body.querySelectorAll(SELECTORS.paragraph)]
    .filter((el) => !el.classList.contains(SELECTORS.blankClass))
    .map((el) => ({ el, text: paragraphText(el) }))
    .filter((p) => p.text !== '');
}

// 画面上端より下に下端がある最初の段落 = いま画面の一番上に見えている段落
export function findStartIndex(paragraphs) {
  if (paragraphs.length === 0) return 0;
  const index = paragraphs.findIndex((p) => p.el.getBoundingClientRect().bottom > 0);
  return index === -1 ? paragraphs.length - 1 : index;
}

export function findNextEpisodeUrl(doc) {
  const href = doc.querySelector(SELECTORS.nextEpisode)?.getAttribute('href');
  return href ? new URL(href, doc.baseURI).href : null;
}
```

- [ ] **Step 6: 成功を確認**

Run: `npx vitest run tests/episode.test.js`
Expected: PASS（12 tests）

- [ ] **Step 7: コミット**

```bash
git add package.json package-lock.json vitest.config.js manifest.json LICENSE .gitignore src/episode.js tests/
git commit -m "feat: 拡張の雛形とカクヨム本文の読み取りを追加"
```

---

### Task 2: 読み上げ単位への分割（`text.js`）

**Files:**
- Create: `src/text.js`, `tests/text.test.js`

**Interfaces:**
- Produces:
  - `MAX_CHARS = 120`
  - `splitLong(text: string, max?: number): string[]`
  - `toUtterances(texts: string[], startIndex: number): Array<{index: number, text: string}>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/text.test.js`:
```js
import { describe, expect, it } from 'vitest';
import { MAX_CHARS, splitLong, toUtterances } from '../src/text.js';

describe('splitLong', () => {
  it('短い段落はそのまま 1 つ', () => {
    expect(splitLong('こんにちは。元気？')).toEqual(['こんにちは。元気？']);
  });

  it('長い段落は文の切れ目で 120 文字以下に分け、つなげると元に戻る', () => {
    const sentence = 'あ'.repeat(50) + '。';
    const text = sentence.repeat(5);
    const chunks = splitLong(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= MAX_CHARS)).toBe(true);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((c) => c.endsWith('。'))).toBe(true);
  });

  it('閉じかっこは文末記号と同じ塊に残す', () => {
    const text = `「${'い'.repeat(70)}！」${'う'.repeat(70)}。`;
    const chunks = splitLong(text);
    expect(chunks[0].endsWith('！」')).toBe(true);
    expect(chunks.join('')).toBe(text);
  });

  it('句読点が全く無い長文も 120 文字以下に切る', () => {
    const text = 'え'.repeat(300);
    const chunks = splitLong(text);
    expect(chunks.every((c) => c.length <= MAX_CHARS)).toBe(true);
    expect(chunks.join('')).toBe(text);
  });

  it('文末が無く読点がある長文は読点の直後で切る', () => {
    const text = `${'お'.repeat(80)}、${'か'.repeat(80)}`;
    expect(splitLong(text)[0]).toBe(`${'お'.repeat(80)}、`);
  });
});

describe('toUtterances', () => {
  it('startIndex 以降の段落を段落番号付きで返す', () => {
    expect(toUtterances(['一。', '二。', '三。'], 1)).toEqual([
      { index: 1, text: '二。' },
      { index: 2, text: '三。' },
    ]);
  });

  it('記号だけの段落は読み飛ばす', () => {
    expect(toUtterances(['＊　＊　＊', '◇◇◇', '……', '本文。'], 0)).toEqual([
      { index: 3, text: '本文。' },
    ]);
  });

  it('長い段落は同じ段落番号で複数に分かれる', () => {
    const long = ('あ'.repeat(50) + '。').repeat(5);
    const units = toUtterances([long], 0);
    expect(units.length).toBeGreaterThan(1);
    expect(units.every((u) => u.index === 0)).toBe(true);
  });

  it('startIndex が末尾以降なら空', () => {
    expect(toUtterances(['一。'], 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/text.test.js`
Expected: FAIL（`../src/text.js` が無い）

- [ ] **Step 3: 実装**

`src/text.js`:
```js
// 1 回の合成に渡す最大文字数。長すぎると合成待ちで無音が長くなる
export const MAX_CHARS = 120;

// 文末記号（と直後の閉じかっこ）の後ろで区切る。記号が連続する途中では区切らない
const SENTENCE_END = /(?<=[。！？!?][」』）)]*)(?![。！？!?」』）)])/u;
// 文字か数字を 1 つも含まない塊（「＊　＊　＊」など）は読まない
const SPEAKABLE = /[\p{L}\p{N}]/u;

function hardCut(text, max) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    const comma = rest.lastIndexOf('、', max - 1);
    const at = comma > 0 ? comma + 1 : max;
    out.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  if (rest) out.push(rest);
  return out;
}

export function splitLong(text, max = MAX_CHARS) {
  const chunks = [];
  let buf = '';
  for (const sentence of text.split(SENTENCE_END)) {
    if (buf && (buf + sentence).length > max) {
      chunks.push(buf);
      buf = '';
    }
    buf += sentence;
  }
  if (buf) chunks.push(buf);
  return chunks.flatMap((chunk) => hardCut(chunk, max));
}

export function toUtterances(texts, startIndex) {
  const units = [];
  for (let index = startIndex; index < texts.length; index++) {
    for (const text of splitLong(texts[index])) {
      if (SPEAKABLE.test(text)) units.push({ index, text });
    }
  }
  return units;
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run tests/text.test.js`
Expected: PASS（9 tests）

- [ ] **Step 5: コミット**

```bash
git add src/text.js tests/text.test.js
git commit -m "feat: 段落を読み上げ単位に分割する処理を追加"
```

---

### Task 3: 設定と VOICEVOX クライアント（`settings.js`, `voicevox.js`）

**Files:**
- Create: `src/settings.js`, `src/voicevox.js`, `tests/settings.test.js`, `tests/voicevox.test.js`

**Interfaces:**
- Produces:
  - `DEFAULTS: Settings`（`{engineUrl: 'http://127.0.0.1:50021', speaker: null, speed: 1.0, browserVoice: null}`）
  - `normalizeEngineUrl(input: string): string | null`（`origin` 形式、許可外なら `null`）
  - `defaultSpeakerId(speakers: Speaker[]): number | null`
  - `ENGINE_UNREACHABLE: string`（接続エラー文言）
  - `class EngineError extends Error { unreachable: boolean }`
  - `getSpeakers(engineUrl: string): Promise<Speaker[]>`（`Speaker = {name: string, styles: Array<{name: string, id: number}>}`）
  - `synthesize(engineUrl: string, text: string, speaker: number, speed: number): Promise<Blob>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/settings.test.js`:
```js
import { describe, expect, it } from 'vitest';
import { DEFAULTS, defaultSpeakerId, normalizeEngineUrl } from '../src/settings.js';

describe('normalizeEngineUrl', () => {
  it.each([
    ['http://127.0.0.1:50021', 'http://127.0.0.1:50021'],
    ['http://127.0.0.1:50021/', 'http://127.0.0.1:50021'],
    ['  http://localhost:10101/  ', 'http://localhost:10101'],
    ['127.0.0.1:50021', 'http://127.0.0.1:50021'],
    ['localhost:10101', 'http://localhost:10101'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeEngineUrl(input)).toBe(expected);
  });

  it.each(['https://127.0.0.1:50021', 'http://example.com:50021', 'http://192.168.0.2:50021', '', 'not a url'])(
    '許可外・不正な入力 %s は null',
    (input) => {
      expect(normalizeEngineUrl(input)).toBeNull();
    },
  );
});

describe('defaultSpeakerId', () => {
  it('最初の話者の最初のスタイル', () => {
    expect(defaultSpeakerId([{ name: 'A', styles: [{ name: 'ノーマル', id: 3 }] }])).toBe(3);
  });
  it('話者が無ければ null', () => {
    expect(defaultSpeakerId([])).toBeNull();
  });
});

describe('DEFAULTS', () => {
  it('既定値', () => {
    expect(DEFAULTS).toEqual({
      engineUrl: 'http://127.0.0.1:50021',
      speaker: null,
      speed: 1.0,
      browserVoice: null,
    });
  });
});
```

`tests/voicevox.test.js`:
```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_UNREACHABLE, EngineError, getSpeakers, synthesize } from '../src/voicevox.js';

const ENGINE = 'http://127.0.0.1:50021';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(handler) {
  const fetch = vi.fn(handler);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('getSpeakers', () => {
  it('/speakers を返す', async () => {
    const speakers = [{ name: 'A', styles: [{ name: 'ノーマル', id: 1 }] }];
    const fetch = stubFetch(async () => new Response(JSON.stringify(speakers)));
    await expect(getSpeakers(ENGINE)).resolves.toEqual(speakers);
    expect(fetch.mock.calls[0][0]).toBe(`${ENGINE}/speakers`);
  });

  it('接続できなければ unreachable な EngineError', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await getSpeakers(ENGINE).catch((e) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect(error.unreachable).toBe(true);
    expect(error.message).toBe(ENGINE_UNREACHABLE);
  });

  it('HTTP エラーは unreachable ではない EngineError', async () => {
    stubFetch(async () => new Response('bad', { status: 500 }));
    const error = await getSpeakers(ENGINE).catch((e) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect(error.unreachable).toBe(false);
    expect(error.message).toContain('500');
  });
});

describe('synthesize', () => {
  it('audio_query に速度を設定して synthesis に渡し、WAV を返す', async () => {
    const fetch = stubFetch(async (url, init) => {
      if (url.startsWith(`${ENGINE}/audio_query`)) {
        return new Response(JSON.stringify({ speedScale: 1, accent_phrases: [] }));
      }
      return new Response(new Blob(['RIFF'], { type: 'audio/wav' }));
    });

    const blob = await synthesize(ENGINE, '本文です。', 8, 1.3);

    const [queryUrl, queryInit] = fetch.mock.calls[0];
    expect(queryUrl).toBe(`${ENGINE}/audio_query?text=${encodeURIComponent('本文です。')}&speaker=8`);
    expect(queryInit.method).toBe('POST');

    const [synthUrl, synthInit] = fetch.mock.calls[1];
    expect(synthUrl).toBe(`${ENGINE}/synthesis?speaker=8`);
    expect(JSON.parse(synthInit.body).speedScale).toBe(1.3);
    expect(await blob.text()).toBe('RIFF');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/settings.test.js tests/voicevox.test.js`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装**

`src/settings.js`:
```js
export const DEFAULTS = {
  engineUrl: 'http://127.0.0.1:50021',
  speaker: null,
  speed: 1.0,
  browserVoice: null,
};

// manifest の host_permissions で許可しているホストだけ受け付ける
const ALLOWED_HOSTS = ['127.0.0.1', 'localhost'];

export function normalizeEngineUrl(input) {
  const trimmed = input.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || !ALLOWED_HOSTS.includes(url.hostname)) return null;
  return url.origin;
}

export function defaultSpeakerId(speakers) {
  return speakers[0]?.styles[0]?.id ?? null;
}
```

`src/voicevox.js`:
```js
export const ENGINE_UNREACHABLE =
  'VOICEVOX（音声エンジン）に接続できません。起動しているか、設定の URL を確認してください';

const TIMEOUT_MS = 30_000;

export class EngineError extends Error {
  constructor(message, { unreachable }) {
    super(message);
    this.unreachable = unreachable;
  }
}

async function request(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new EngineError(ENGINE_UNREACHABLE, { unreachable: true });
  }
  if (!res.ok) {
    throw new EngineError(`音声エンジンがエラーを返しました（HTTP ${res.status}）`, { unreachable: false });
  }
  return res;
}

export async function getSpeakers(engineUrl) {
  return (await request(`${engineUrl}/speakers`)).json();
}

export async function synthesize(engineUrl, text, speaker, speed) {
  const params = new URLSearchParams({ text, speaker: String(speaker) });
  const query = await (await request(`${engineUrl}/audio_query?${params}`, { method: 'POST' })).json();
  query.speedScale = speed;
  const res = await request(`${engineUrl}/synthesis?speaker=${speaker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  return res.blob();
}
```
注: `URLSearchParams` は空白を `+` にエンコードするが、テストの本文には空白が無いので `encodeURIComponent` と一致する。

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run tests/settings.test.js tests/voicevox.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/settings.js src/voicevox.js tests/settings.test.js tests/voicevox.test.js
git commit -m "feat: 設定と VOICEVOX クライアントを追加"
```

---

### Task 4: 先読み付き再生キュー（`player.js`）

**Files:**
- Create: `src/player.js`, `tests/player.test.js`

**Interfaces:**
- Produces: `class Player`
  - `constructor({synthesize: (text: string) => Promise<A>, play: (audio: A) => Promise<void>, stopAudio: () => void, onReading: (index: number) => void, onEnded: () => void, onError: (e: Error) => void})`
  - `start(units: Utterance[]): Promise<void>` … 前の再生を止めてから開始。全単位を再生し終えたら `onEnded`
  - `stop(): void` … 再生中の音声を止め、以後イベントを出さない
  - `play` は再生完了時、または `stopAudio` が呼ばれた時に resolve すること

- [ ] **Step 1: 失敗するテストを書く**

`tests/player.test.js`:
```js
import { describe, expect, it, vi } from 'vitest';
import { Player } from '../src/player.js';

// 再生を手動で終わらせられるフェイク
function createHarness({ failOn } = {}) {
  const log = [];
  let finishCurrent = null;
  const player = new Player({
    synthesize: vi.fn(async (text) => {
      log.push(`synth:${text}`);
      if (text === failOn) throw new Error('合成失敗');
      return `audio:${text}`;
    }),
    play: vi.fn(
      (audio) =>
        new Promise((resolve) => {
          log.push(`play:${audio}`);
          finishCurrent = () => {
            finishCurrent = null;
            resolve();
          };
        }),
    ),
    stopAudio: vi.fn(() => finishCurrent?.()),
    onReading: vi.fn((index) => log.push(`reading:${index}`)),
    onEnded: vi.fn(() => log.push('ended')),
    onError: vi.fn((e) => log.push(`error:${e.message}`)),
  });
  const finish = async () => {
    await vi.waitFor(() => expect(finishCurrent).not.toBeNull());
    finishCurrent();
  };
  return { player, log, finish };
}

const units = [
  { index: 0, text: 'a' },
  { index: 0, text: 'b' },
  { index: 2, text: 'c' },
];

describe('Player', () => {
  it('順に再生して最後に ended を 1 回出す', async () => {
    const { player, log, finish } = createHarness();
    const done = player.start(units);
    await finish();
    await finish();
    await finish();
    await done;
    expect(log.filter((l) => l.startsWith('reading') || l === 'ended')).toEqual([
      'reading:0',
      'reading:0',
      'reading:2',
      'ended',
    ]);
  });

  it('再生中に次の単位を先読みする', async () => {
    const { player, log, finish } = createHarness();
    player.start(units);
    await vi.waitFor(() => expect(log).toContain('play:audio:a'));
    // a の再生が終わる前に b の合成が始まっている
    await vi.waitFor(() => expect(log).toContain('synth:b'));
    expect(log).not.toContain('play:audio:b');
    await finish();
  });

  it('stop したら以後イベントを出さない', async () => {
    const { player, log } = createHarness();
    const done = player.start(units);
    await vi.waitFor(() => expect(log).toContain('play:audio:a'));
    player.stop();
    await done;
    expect(log).not.toContain('ended');
    expect(log).not.toContain('play:audio:b');
  });

  it('合成に失敗したら onError で止まり ended は出さない', async () => {
    const { player, log, finish } = createHarness({ failOn: 'b' });
    const done = player.start(units);
    await finish();
    await done;
    expect(log).toContain('error:合成失敗');
    expect(log).not.toContain('ended');
    expect(log).not.toContain('reading:2');
  });

  it('再生中に start し直すと前の再生は止まり、新しい方だけ進む', async () => {
    const { player, log, finish } = createHarness();
    const first = player.start(units);
    await vi.waitFor(() => expect(log).toContain('play:audio:a'));
    const second = player.start([{ index: 5, text: 'z' }]);
    await first;
    await finish();
    await second;
    expect(log.filter((l) => l === 'ended')).toHaveLength(1);
    expect(log).toContain('reading:5');
    expect(log).not.toContain('reading:2');
  });

  it('単位が空ならすぐ ended', async () => {
    const { player, log } = createHarness();
    await player.start([]);
    expect(log).toEqual(['ended']);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/player.test.js`
Expected: FAIL（`../src/player.js` が無い）

- [ ] **Step 3: 実装**

`src/player.js`:
```js
// 読み上げ単位を「合成 → 再生」の順に処理する。再生中に次の単位を先に合成しておく。
// 合成・再生の手段は注入する（VOICEVOX 用と chrome.tts 用で共通に使う）。
export class Player {
  constructor({ synthesize, play, stopAudio, onReading, onEnded, onError }) {
    Object.assign(this, { synthesize, play, stopAudio, onReading, onEnded, onError });
    this.session = 0;
  }

  async start(units) {
    this.stop();
    const session = this.session;
    const isCurrent = () => session === this.session;
    const prefetch = (i) => {
      if (i >= units.length) return null;
      const pending = this.synthesize(units[i].text);
      pending.catch(() => {}); // 失敗は await した時点で扱う
      return pending;
    };

    let next = prefetch(0);
    for (let i = 0; i < units.length; i++) {
      let audio;
      try {
        audio = await next;
      } catch (error) {
        if (isCurrent()) this.onError(error);
        return;
      }
      if (!isCurrent()) return;
      next = prefetch(i + 1);
      this.onReading(units[i].index);
      await this.play(audio);
      if (!isCurrent()) return;
    }
    this.onEnded();
  }

  stop() {
    this.session++;
    this.stopAudio();
  }
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run tests/player.test.js`
Expected: PASS（6 tests）

- [ ] **Step 5: コミット**

```bash
git add src/player.js tests/player.test.js
git commit -m "feat: 先読み付きの再生キューを追加"
```

---

### Task 5: 再生状態の遷移（`playback-state.js`）

**Files:**
- Create: `src/playback-state.js`, `tests/playback-state.test.js`

**Interfaces:**
- Produces（すべて純粋関数。`State = {playingTabId: number | null, advancing: boolean}`）:
  - `initialState: State`
  - `onPlay(state, tabId): {state, previousTabId: number | null}`（別タブが再生中だったらその ID）
  - `onStop(state, tabId): {state, stopAudio: boolean}`
  - `onAdvance(state, tabId): State`
  - `onTabLoading(state, tabId): {state, stopAudio: boolean}`
  - `onQuery(state, tabId): {state, resume: boolean}`

- [ ] **Step 1: 失敗するテストを書く**

`tests/playback-state.test.js`:
```js
import { describe, expect, it } from 'vitest';
import {
  initialState,
  onAdvance,
  onPlay,
  onQuery,
  onStop,
  onTabLoading,
} from '../src/playback-state.js';

const playing = (tabId, advancing = false) => ({ playingTabId: tabId, advancing });

describe('onPlay', () => {
  it('再生中タブを記録する', () => {
    expect(onPlay(initialState, 1)).toEqual({ state: playing(1), previousTabId: null });
  });
  it('別タブが再生中ならそのタブを previousTabId で返す', () => {
    expect(onPlay(playing(1), 2)).toEqual({ state: playing(2), previousTabId: 1 });
  });
  it('同じタブで再開しても previousTabId は null', () => {
    expect(onPlay(playing(1), 1).previousTabId).toBeNull();
  });
});

describe('onStop', () => {
  it('再生中タブからの停止で初期状態に戻り音声を止める', () => {
    expect(onStop(playing(1), 1)).toEqual({ state: initialState, stopAudio: true });
  });
  it('他のタブからの停止は無視する', () => {
    expect(onStop(playing(1), 2)).toEqual({ state: playing(1), stopAudio: false });
  });
});

describe('自動遷移と手動遷移', () => {
  it('advance 後の読み込みは継続し、遷移先の問い合わせで resume = true', () => {
    let state = onAdvance(playing(1), 1);
    const loading = onTabLoading(state, 1);
    expect(loading.state).toEqual(playing(1, true));
    const query = onQuery(loading.state, 1);
    expect(query.resume).toBe(true);
    expect(query.state).toEqual(playing(1, false));
  });

  it('advance 無しの読み込み（リロード・手動移動）は停止し、遷移先で再開しない', () => {
    const loading = onTabLoading(playing(1), 1);
    expect(loading).toEqual({ state: initialState, stopAudio: true });
    expect(onQuery(loading.state, 1).resume).toBe(false);
  });

  it('resume は 1 回だけ（再度読み込んだら止まる）', () => {
    const { state } = onQuery(onTabLoading(onAdvance(playing(1), 1), 1).state, 1);
    expect(onTabLoading(state, 1)).toEqual({ state: initialState, stopAudio: true });
  });

  it('再生していないタブの読み込みは何もしない', () => {
    expect(onTabLoading(playing(1), 2)).toEqual({ state: playing(1), stopAudio: false });
  });

  it('再生していないタブの問い合わせは resume = false', () => {
    expect(onQuery(playing(1, true), 2)).toEqual({ state: playing(1, true), resume: false });
  });

  it('他のタブからの advance は無視する', () => {
    expect(onAdvance(playing(1), 2)).toEqual(playing(1));
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/playback-state.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/playback-state.js`:
```js
// どのタブで読み上げ中か、次のページ読み込みが拡張による自動遷移か、を表す。
// 自動遷移でない読み込み（リロードや手動での移動）が起きたら再生を止める。
export const initialState = { playingTabId: null, advancing: false };

export function onPlay(state, tabId) {
  const previousTabId =
    state.playingTabId !== null && state.playingTabId !== tabId ? state.playingTabId : null;
  return { state: { playingTabId: tabId, advancing: false }, previousTabId };
}

export function onStop(state, tabId) {
  if (state.playingTabId !== tabId) return { state, stopAudio: false };
  return { state: initialState, stopAudio: true };
}

export function onAdvance(state, tabId) {
  if (state.playingTabId !== tabId) return state;
  return { ...state, advancing: true };
}

export function onTabLoading(state, tabId) {
  if (state.playingTabId !== tabId) return { state, stopAudio: false };
  if (state.advancing) return { state, stopAudio: false };
  return { state: initialState, stopAudio: true };
}

export function onQuery(state, tabId) {
  if (state.playingTabId !== tabId || !state.advancing) return { state, resume: false };
  return { state: { ...state, advancing: false }, resume: true };
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run tests/playback-state.test.js`
Expected: PASS（11 tests）

- [ ] **Step 5: コミット**

```bash
git add src/playback-state.js tests/playback-state.test.js
git commit -m "feat: 再生状態の遷移ロジックを追加"
```

---

### Task 6: ブラウザ音声の選択と再生（`browser-voice.js`）

**Files:**
- Create: `src/browser-voice.js`, `tests/browser-voice.test.js`

**Interfaces:**
- Produces:
  - `localJapaneseVoices(voices: chrome.tts.TtsVoice[]): TtsVoice[]`（`lang` が `ja` で始まり `remote !== true`）
  - `pickVoice(voices: TtsVoice[], preferredName: string | null): string | null`（使う `voiceName`。候補が無ければ `null`）
  - `ttsPlay(text: string, {voiceName: string, rate: number}): Promise<void>`（`chrome.tts.speak`。終了系イベントで resolve）
  - `ttsStop(): void`

- [ ] **Step 1: 失敗するテストを書く**

`tests/browser-voice.test.js`:
```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localJapaneseVoices, pickVoice, ttsPlay } from '../src/browser-voice.js';

const voices = [
  { voiceName: 'Samantha', lang: 'en-US', remote: false },
  { voiceName: 'Google 日本語', lang: 'ja-JP', remote: true },
  { voiceName: 'Kyoko', lang: 'ja-JP', remote: false },
  { voiceName: 'Otoya', lang: 'ja-JP' },
];

describe('localJapaneseVoices', () => {
  it('日本語のローカル音声だけ（ネットワーク音声は除く）', () => {
    expect(localJapaneseVoices(voices).map((v) => v.voiceName)).toEqual(['Kyoko', 'Otoya']);
  });
});

describe('pickVoice', () => {
  it('指定の声が使えればそれ', () => {
    expect(pickVoice(voices, 'Otoya')).toBe('Otoya');
  });
  it('指定が無ければ最初の日本語ローカル音声', () => {
    expect(pickVoice(voices, null)).toBe('Kyoko');
  });
  it('指定がネットワーク音声なら使わない', () => {
    expect(pickVoice(voices, 'Google 日本語')).toBe('Kyoko');
  });
  it('日本語ローカル音声が無ければ null', () => {
    expect(pickVoice([voices[0], voices[1]], null)).toBeNull();
  });
});

describe('ttsPlay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['end', 'interrupted', 'cancelled', 'error'])('%s イベントで完了する', async (type) => {
    const speak = vi.fn((text, options) => {
      options.onEvent({ type: 'start' });
      options.onEvent({ type });
    });
    vi.stubGlobal('chrome', { tts: { speak } });
    await ttsPlay('本文。', { voiceName: 'Kyoko', rate: 1.2 });
    expect(speak).toHaveBeenCalledWith(
      '本文。',
      expect.objectContaining({ voiceName: 'Kyoko', rate: 1.2, lang: 'ja-JP', enqueue: false }),
    );
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run tests/browser-voice.test.js`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/browser-voice.js`:
```js
// VOICEVOX が使えないときの代わりに OS の音声（chrome.tts）で読む。
// ネットワーク音声（remote）は本文を外部に送るため使わない。
export function localJapaneseVoices(voices) {
  return voices.filter((v) => v.lang?.startsWith('ja') && v.remote !== true);
}

export function pickVoice(voices, preferredName) {
  const candidates = localJapaneseVoices(voices);
  const preferred = candidates.find((v) => v.voiceName === preferredName);
  return (preferred ?? candidates[0])?.voiceName ?? null;
}

const DONE_EVENTS = new Set(['end', 'interrupted', 'cancelled', 'error']);

export function ttsPlay(text, { voiceName, rate }) {
  return new Promise((resolve) => {
    chrome.tts.speak(text, {
      voiceName,
      rate,
      lang: 'ja-JP',
      enqueue: false,
      onEvent: (event) => {
        if (DONE_EVENTS.has(event.type)) resolve();
      },
    });
  });
}

export function ttsStop() {
  chrome.tts.stop();
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run tests/browser-voice.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/browser-voice.js tests/browser-voice.test.js
git commit -m "feat: VOICEVOX が無いときのブラウザ音声を追加"
```

---

### Task 7: background と offscreen の配線

**Files:**
- Create: `src/background.js`, `src/offscreen.html`, `src/offscreen.js`

**Interfaces:**
- Consumes: Task 2〜6 の全関数、「メッセージ一覧」の契約
- Produces: 「メッセージ一覧」の background 側・offscreen 側の振る舞い

このタスクの部品は chrome API への薄い配線なので自動テストは書かず、Task 9 の手動 E2E で確認する。ロジックは Task 2〜6 で検証済みの関数に寄せる。

- [ ] **Step 1: offscreen を書く**

`src/offscreen.html`:
```html
<!doctype html>
<meta charset="utf-8">
<script type="module" src="offscreen.js"></script>
```

`src/offscreen.js`:
```js
import { Player } from './player.js';
import { synthesize } from './voicevox.js';

const audio = new Audio();
let settings = null;
let tabId = null;
let finishPlay = null;

function play(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    finishPlay = () => {
      finishPlay = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = () => finishPlay?.();
    audio.onerror = () => finishPlay?.();
    audio.src = url;
    audio.play().catch(() => finishPlay?.());
  });
}

function stopAudio() {
  audio.pause();
  finishPlay?.();
}

function emit(event, extra = {}) {
  chrome.runtime.sendMessage({ type: 'player-event', tabId, event, ...extra }).catch(() => {});
}

const player = new Player({
  synthesize: (text) => synthesize(settings.engineUrl, text, settings.speaker, settings.speed),
  play,
  stopAudio,
  onReading: (index) => emit('reading', { index }),
  onEnded: () => emit('ended'),
  onError: (error) => emit('error', { message: error.message }),
});

// 応答を返しておかないと、送信側の Promise が「応答前にポートが閉じた」で reject される
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;
  if (msg.type === 'start') {
    settings = msg.settings;
    tabId = msg.tabId;
    player.start(msg.units);
  } else if (msg.type === 'stop') {
    player.stop();
  }
  sendResponse({});
  return false;
});
```

- [ ] **Step 2: background を書く**

`src/background.js`:
```js
import { pickVoice, ttsPlay, ttsStop } from './browser-voice.js';
import { Player } from './player.js';
import {
  initialState,
  onAdvance,
  onPlay,
  onQuery,
  onStop,
  onTabLoading,
} from './playback-state.js';
import { DEFAULTS, defaultSpeakerId } from './settings.js';
import { toUtterances } from './text.js';
import { ENGINE_UNREACHABLE, getSpeakers } from './voicevox.js';

const OFFSCREEN_URL = 'src/offscreen.html';
const FALLBACK_NOTICE = 'VOICEVOX に接続できないため、ブラウザの音声で読み上げます';

// --- 状態（service worker が止まっても消えないよう storage.session に置く） ---

async function getState() {
  const { playback } = await chrome.storage.session.get('playback');
  return playback ?? initialState;
}

async function setState(state) {
  await chrome.storage.session.set({ playback: state });
}

function toTab(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

// --- 再生手段 ---

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['AUDIO_PLAYBACK'],
    justification: '小説の本文を音声エンジンで合成した音声を再生するため',
  });
}

let browserTabId = null;
let browserOptions = null;
const browserPlayer = new Player({
  synthesize: async (text) => text,
  play: (text) => ttsPlay(text, browserOptions),
  stopAudio: ttsStop,
  onReading: (index) => handlePlayerEvent({ tabId: browserTabId, event: 'reading', index }),
  onEnded: () => handlePlayerEvent({ tabId: browserTabId, event: 'ended' }),
  onError: (error) => handlePlayerEvent({ tabId: browserTabId, event: 'error', message: error.message }),
});

async function stopAudio() {
  browserPlayer.stop();
  if (await hasOffscreen()) {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
  }
}

// 開始時に VOICEVOX に繋がればそれを、繋がらなければローカルの日本語音声を使う
async function chooseEngine(settings) {
  try {
    const speakers = await getSpeakers(settings.engineUrl);
    const speaker = settings.speaker ?? defaultSpeakerId(speakers);
    return { kind: 'voicevox', settings: { ...settings, speaker } };
  } catch (error) {
    if (!error.unreachable) throw error;
    const voiceName = pickVoice(await chrome.tts.getVoices(), settings.browserVoice);
    if (!voiceName) throw new Error(ENGINE_UNREACHABLE);
    return { kind: 'browser', voiceName, rate: settings.speed };
  }
}

// --- メッセージ処理 ---

async function handlePlay(tabId, { texts, startIndex }) {
  const { state, previousTabId } = onPlay(await getState(), tabId);
  await setState(state);
  await stopAudio();
  if (previousTabId !== null) toTab(previousTabId, { type: 'stopped' });

  const units = toUtterances(texts, startIndex);
  const settings = await chrome.storage.sync.get(DEFAULTS);
  let engine;
  try {
    engine = await chooseEngine(settings);
  } catch (error) {
    await handlePlayerEvent({ tabId, event: 'error', message: error.message });
    return;
  }

  if (engine.kind === 'voicevox') {
    await ensureOffscreen();
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'start',
      tabId,
      units,
      settings: engine.settings,
    });
  } else {
    toTab(tabId, { type: 'notice', message: FALLBACK_NOTICE });
    browserTabId = tabId;
    browserOptions = { voiceName: engine.voiceName, rate: engine.rate };
    browserPlayer.start(units);
  }
}

async function handleStop(tabId) {
  const result = onStop(await getState(), tabId);
  await setState(result.state);
  if (result.stopAudio) await stopAudio();
}

async function handlePlayerEvent({ tabId, event, index, message }) {
  const state = await getState();
  if (state.playingTabId !== tabId) return; // 止めた後に届いた古いイベント
  if (event === 'reading') {
    toTab(tabId, { type: 'reading', index });
  } else if (event === 'ended') {
    toTab(tabId, { type: 'episodeEnd' });
  } else if (event === 'error') {
    await setState(onStop(state, tabId).state);
    toTab(tabId, { type: 'error', message });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === 'offscreen') return false;
  const tabId = sender.tab?.id;
  switch (msg.type) {
    case 'play':
      handlePlay(tabId, msg);
      sendResponse({});
      return false;
    case 'stop':
      handleStop(tabId);
      sendResponse({});
      return false;
    case 'advance':
      getState()
        .then((state) => setState(onAdvance(state, tabId)))
        .then(() => sendResponse({}));
      return true;
    case 'query':
      getState().then(async (state) => {
        const result = onQuery(state, tabId);
        await setState(result.state);
        sendResponse({ resume: result.resume });
      });
      return true;
    case 'player-event':
      handlePlayerEvent(msg);
      sendResponse({});
      return false;
    default:
      return false;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'loading') return;
  const result = onTabLoading(await getState(), tabId);
  await setState(result.state);
  if (result.stopAudio) await stopAudio();
});

chrome.tabs.onRemoved.addListener((tabId) => handleStop(tabId));
```

- [ ] **Step 3: 構文チェック**

Run: `node --check src/background.js && node --check src/offscreen.js && npm test`
Expected: 構文エラー無し。manifest テストは `content-loader.js` と `popup.html` が未作成のため 2 件 FAIL、それ以外 PASS

- [ ] **Step 4: コミット**

```bash
git add src/background.js src/offscreen.html src/offscreen.js
git commit -m "feat: background と offscreen の再生処理を追加"
```

---

### Task 8: ページ側 UI と設定画面

**Files:**
- Create: `src/content-loader.js`, `src/content.js`, `src/controls.js`, `src/popup.html`, `src/popup.js`

**Interfaces:**
- Consumes: `episode.js`（Task 1）、`settings.js` / `voicevox.js`（Task 3）、`browser-voice.js`（Task 6）、メッセージ契約
- Produces:
  - `createControls({onPlay: () => void, onStop: () => void}): {setPlaying(v: boolean), showMessage(text: string, opts?: {sticky?: boolean}), hideButton()}`

- [ ] **Step 1: content script を書く**

`src/content-loader.js`（MV3 の content script は ESM にできないため、モジュールを動的 import する）:
```js
(async () => {
  await import(chrome.runtime.getURL('src/content.js'));
})();
```

`src/controls.js`:
```js
const STYLE = `
  :host { all: initial; }
  .box {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    font-family: system-ui, sans-serif;
  }
  button {
    width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
    background: #333; color: #fff; font-size: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, .3);
  }
  button:focus-visible { outline: 3px solid #4c9ffe; outline-offset: 2px; }
  .msg {
    max-width: 280px; padding: 8px 12px; border-radius: 8px;
    background: #333; color: #fff; font-size: 13px; line-height: 1.5;
  }
  [hidden] { display: none !important; }
`;

const MESSAGE_MS = 8000;

export function createControls({ onPlay, onStop }) {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="box">
      <div class="msg" role="status" hidden></div>
      <button type="button"></button>
    </div>`;
  const button = root.querySelector('button');
  const msg = root.querySelector('.msg');
  let playing = false;
  let timer = null;

  function setPlaying(value) {
    playing = value;
    const label = value ? '読み上げ停止' : '読み上げ開始';
    button.textContent = value ? '■' : '▶';
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  button.addEventListener('click', () => (playing ? onStop() : onPlay()));
  setPlaying(false);
  document.body.append(host);

  return {
    setPlaying,
    showMessage(text, { sticky = false } = {}) {
      msg.textContent = text;
      msg.hidden = false;
      clearTimeout(timer);
      if (!sticky) timer = setTimeout(() => (msg.hidden = true), MESSAGE_MS);
    },
    hideButton() {
      button.hidden = true;
    },
  };
}
```

`src/content.js`:
```js
import { createControls } from './controls.js';
import {
  extractParagraphs,
  findEpisodeBody,
  findNextEpisodeUrl,
  findStartIndex,
} from './episode.js';

const HIGHLIGHT_CLASS = 'kakuyomu-tts-reading';

let paragraphs = [];
let current = null;

const controls = createControls({
  onPlay: () => play(findStartIndex(paragraphs)),
  onStop: stop,
});

function highlight(index) {
  current?.classList.remove(HIGHLIGHT_CLASS);
  current = paragraphs[index]?.el ?? null;
  if (!current) return;
  current.classList.add(HIGHLIGHT_CLASS);
  current.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function clearHighlight() {
  current?.classList.remove(HIGHLIGHT_CLASS);
  current = null;
}

function play(startIndex) {
  chrome.runtime.sendMessage({ type: 'play', texts: paragraphs.map((p) => p.text), startIndex });
  controls.setPlaying(true);
}

function stop() {
  chrome.runtime.sendMessage({ type: 'stop' });
  controls.setPlaying(false);
  clearHighlight();
}

async function goNext() {
  const next = findNextEpisodeUrl(document);
  if (!next) {
    stop();
    controls.showMessage('最新話まで読み終えました');
    return;
  }
  await chrome.runtime.sendMessage({ type: 'advance' });
  location.href = next;
}

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'reading':
      highlight(msg.index);
      break;
    case 'episodeEnd':
      goNext();
      break;
    case 'notice':
      controls.showMessage(msg.message);
      break;
    case 'error':
      controls.setPlaying(false);
      clearHighlight();
      controls.showMessage(msg.message, { sticky: true });
      break;
    case 'stopped':
      controls.setPlaying(false);
      clearHighlight();
      break;
  }
});

async function init() {
  if (!findEpisodeBody(document)) {
    controls.hideButton();
    controls.showMessage('本文が見つかりません。カクヨムのページ構造が変わった可能性があります', {
      sticky: true,
    });
    return;
  }
  const style = document.createElement('style');
  style.textContent = `.${HIGHLIGHT_CLASS} { background-color: rgba(255, 214, 0, 0.3); }`;
  document.head.append(style);
  paragraphs = extractParagraphs(document);

  const { resume } = await chrome.runtime.sendMessage({ type: 'query' });
  if (resume) play(0);
}

init();
```

- [ ] **Step 2: 設定画面を書く**

`src/popup.html`:
```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>カクヨム読み上げ</title>
<style>
  body { width: 320px; margin: 0; padding: 16px; font: 13px/1.5 system-ui, sans-serif; color: #222; background: #fff; }
  h1 { font-size: 14px; margin: 0 0 12px; }
  label { display: block; margin: 12px 0 4px; font-weight: 600; }
  input[type=text], select { width: 100%; box-sizing: border-box; padding: 4px 6px; font: inherit; }
  input[type=range] { width: 100%; }
  button { margin-top: 6px; font: inherit; }
  .status { min-height: 1.5em; margin: 6px 0 0; color: #555; }
  .note { color: #666; font-size: 12px; margin: 4px 0 0; }
  @media (prefers-color-scheme: dark) {
    body { color: #eee; background: #222; }
    .status, .note { color: #aaa; }
  }
</style>
</head>
<body>
<h1>カクヨム読み上げ（非公式）</h1>

<label for="engineUrl">音声エンジンの URL</label>
<input id="engineUrl" type="text" spellcheck="false" autocomplete="off">
<button id="connect" type="button">接続して声の一覧を読み込む</button>
<p id="status" class="status" role="status"></p>

<label for="speaker">声（VOICEVOX）</label>
<select id="speaker" disabled></select>

<label for="browserVoice">VOICEVOX が使えないときの声</label>
<select id="browserVoice"></select>
<p class="note">端末内の日本語音声だけを表示しています。</p>

<label for="speed">速度 <span id="speedValue"></span></label>
<input id="speed" type="range" min="0.5" max="2" step="0.1">
<p class="note">設定の変更は次に ▶ を押したときから反映されます。</p>

<script type="module" src="popup.js"></script>
</body>
</html>
```

`src/popup.js`:
```js
import { localJapaneseVoices } from './browser-voice.js';
import { DEFAULTS, defaultSpeakerId, normalizeEngineUrl } from './settings.js';
import { getSpeakers } from './voicevox.js';

const $ = (id) => document.getElementById(id);
const save = (values) => chrome.storage.sync.set(values);

async function loadSpeakers(engineUrl, savedSpeaker) {
  const select = $('speaker');
  $('status').textContent = '接続中…';
  try {
    const speakers = await getSpeakers(engineUrl);
    select.replaceChildren();
    for (const speaker of speakers) {
      for (const style of speaker.styles) {
        select.append(new Option(`VOICEVOX:${speaker.name}（${style.name}）`, String(style.id)));
      }
    }
    select.value = String(savedSpeaker ?? defaultSpeakerId(speakers));
    // 保存していた声がこのエンジンに無ければ先頭の声にする
    if (select.value === '') select.value = String(defaultSpeakerId(speakers));
    select.disabled = false;
    await save({ speaker: Number(select.value) });
    $('status').textContent = `接続しました（${select.options.length} 種類の声）`;
  } catch (error) {
    select.disabled = true;
    $('status').textContent = error.message;
  }
}

async function loadBrowserVoices(savedVoice) {
  const select = $('browserVoice');
  const voices = localJapaneseVoices(await chrome.tts.getVoices());
  select.replaceChildren(new Option('自動（最初の日本語音声）', ''));
  for (const voice of voices) select.append(new Option(voice.voiceName, voice.voiceName));
  select.value = savedVoice ?? '';
  if (voices.length === 0) {
    select.disabled = true;
    select.replaceChildren(new Option('日本語の音声がありません', ''));
  }
}

function showSpeed(speed) {
  $('speedValue').textContent = `×${speed.toFixed(1)}`;
}

async function main() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  $('engineUrl').value = settings.engineUrl;
  $('speed').value = String(settings.speed);
  showSpeed(settings.speed);

  $('connect').addEventListener('click', async () => {
    const url = normalizeEngineUrl($('engineUrl').value);
    if (!url) {
      $('status').textContent =
        'URL は http://127.0.0.1:ポート番号 または http://localhost:ポート番号 の形で入力してください';
      return;
    }
    $('engineUrl').value = url;
    await save({ engineUrl: url });
    const { speaker } = await chrome.storage.sync.get(DEFAULTS);
    await loadSpeakers(url, speaker);
  });
  $('speaker').addEventListener('change', () => save({ speaker: Number($('speaker').value) }));
  $('browserVoice').addEventListener('change', () =>
    save({ browserVoice: $('browserVoice').value || null }),
  );
  $('speed').addEventListener('input', () => showSpeed(Number($('speed').value)));
  $('speed').addEventListener('change', () => save({ speed: Number($('speed').value) }));

  await Promise.all([loadSpeakers(settings.engineUrl, settings.speaker), loadBrowserVoices(settings.browserVoice)]);
}

main();
```

- [ ] **Step 3: テストと構文チェック**

Run: `for f in src/*.js; do node --check "$f" || exit 1; done && npm test`
Expected: 全テスト PASS（manifest テスト含む）

- [ ] **Step 4: コミット**

```bash
git add src/content-loader.js src/content.js src/controls.js src/popup.html src/popup.js
git commit -m "feat: ページの再生ボタンと設定画面を追加"
```

---

### Task 9: 実機 E2E 確認と修正

**Files:**
- Modify: 不具合が見つかったファイルのみ
- Create: `docs/e2e-checklist.md`

前提: ユーザーの Chrome で `chrome://extensions` →「デベロッパーモード」ON →「パッケージ化されていない拡張機能を読み込む」でリポジトリのルートを選ぶ（この操作はユーザーに依頼する）。VOICEVOX を起動しておく。

- [ ] **Step 1: チェックリストを作る**

`docs/e2e-checklist.md`:
```markdown
# 手動 E2E チェックリスト

リリース前にこの順で確認する。

## VOICEVOX あり
- [ ] 設定画面を開くと「接続しました（N 種類の声）」と表示され、声を選べる
- [ ] 話のページで本文を途中までスクロールして ▶ → 画面最上部の段落から読み始め、その段落が強調される
- [ ] 段落が進むと強調とスクロールが追従する。段落間に目立つ無音が無い
- [ ] 話の最後まで読むと次のエピソードへ移動し、冒頭から自動で続きを読む
- [ ] ■ で止まり、強調が消える
- [ ] 再生中にリロード → 音声が止まり、自動で再開しない
- [ ] 再生中に目次など別ページへ移動 → 音声が止まる
- [ ] 最新話の最後まで読む →「最新話まで読み終えました」で止まる
- [ ] 2 つのタブで順に ▶ → 先のタブのボタンが ▶ に戻り、後のタブだけ読む
- [ ] 設定で速度・声を変えて ▶ → 反映される
- [ ] 設定の URL に `127.0.0.1:50021/` を入れて接続 → `http://127.0.0.1:50021` に直る
- [ ] 再生中に VOICEVOX を終了 → エラー表示で止まり、ボタンが ▶ に戻る

## VOICEVOX なし
- [ ] VOICEVOX を終了して ▶ →「ブラウザの音声で読み上げます」と出て、OS の日本語音声で読む
- [ ] ブラウザ音声でも段落の強調・次話への移動が動く
- [ ] 1 単位（最大 120 文字）を読み終えるまで途切れない（service worker が止まらない）
- [ ] 設定の「VOICEVOX が使えないときの声」に Google 日本語などのネットワーク音声が出ない

## ポート違いのエンジン
- [ ] AivisSpeech などを別ポートで起動し、URL を変えて接続できる（host_permissions がポートを問わず効く）
```

- [ ] **Step 2: ユーザーに拡張の読み込みを依頼し、チェックリストを順に実施する**

不具合が出たら superpowers:systematic-debugging に従って原因を特定し、修正ごとに `fix:` コミットを作る。

- [ ] **Step 3: コミット**

```bash
git add docs/e2e-checklist.md
git commit -m "docs: 手動 E2E チェックリストを追加"
```

---

### Task 10: 公開用ドキュメントと CI

**Files:**
- Create: `README.md`, `.github/workflows/test.yml`

- [ ] **Step 1: CI を書く**

`.github/workflows/test.yml`:
```yaml
name: test
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: README を書く**

`README.md` の構成（日本語）:
1. タイトル「カクヨム読み上げ（非公式）」と一文説明。直下に「このツールはカクヨム（株式会社KADOKAWA）とは関係のない非公式ツールです」
2. 動作の様子（GIF。Task 9 の確認時に録画したものを `docs/demo.gif` に置く）
3. できること: VOICEVOX で読み上げ / 画面最上部の段落から開始 / 話の終わりで次のエピソードへ自動移動 / ■ で停止 / VOICEVOX が無いときは端末の日本語音声で読む
4. 必要なもの: Chrome 116 以降、VOICEVOX（推奨。https://voicevox.hiroshiba.jp/ ）
5. 導入手順: Releases から zip を取得して展開 → `chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」
6. 使い方: VOICEVOX を起動 → カクヨムの話のページを開く → 右下の ▶
7. 設定: 音声エンジンの URL（AivisSpeech など互換エンジンも可）、声、VOICEVOX が使えないときの声、速度
8. よくある質問: 「VOICEVOX に接続できません」と出る / 読み間違いを直したい（VOICEVOX の「読み方＆アクセント辞書」に登録） / 再生中にページを移動したら止まった（仕様）
9. プライバシー: 本文は設定した手元の音声エンジンか、端末内の音声にだけ渡す。外部サーバーへの送信・利用状況の収集はしない
10. 音声のクレジット: 拡張は音声を保存・配布しない。録音して公開する場合などは VOICEVOX と各キャラクターの利用規約に従うこと（https://voicevox.hiroshiba.jp/term/ ）
11. 開発: `npm install` / `npm test` / `npm run package` で `dist/kakuyomu-tts.zip`
12. ライセンス: MIT

- [ ] **Step 3: 配布 zip を作って中身を確認**

Run: `npm run package && unzip -l dist/kakuyomu-tts.zip`
Expected: `manifest.json`、`LICENSE`、`src/` 以下のみが入っていて、`tests/`、`node_modules/`、`docs/` が入っていない

- [ ] **Step 4: コミット**

```bash
git add README.md .github/workflows/test.yml
git commit -m "docs: README と CI を追加"
```
