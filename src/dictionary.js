// 読み方の辞書。「表記:読み」を 1 行 1 語で書き、音声を作る直前に本文の表記を読みに置き換える。

const KANJI = /\p{Script=Han}/u;

export function parseDictionary(text) {
  const bySurface = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^([^:：]+)[:：](.+)$/);
    if (!match) continue;
    const surface = match[1].trim();
    const reading = match[2].trim();
    if (surface && reading) bySurface.set(surface, reading);
  }
  return [...bySurface].map(([surface, reading]) => ({ surface, reading }));
}

// 同じ表記なら作品ごとの辞書を優先する
export function mergeDictionaries(globalEntries, workEntries) {
  const bySurface = new Map();
  for (const { surface, reading } of [...globalEntries, ...workEntries]) bySurface.set(surface, reading);
  return [...bySurface].map(([surface, reading]) => ({ surface, reading }));
}

// 表記の前後に漢字が続くときは別の熟語の一部（「我」に対する「我慢」「自我」など）とみなして置き換えない
function isWordBoundary(text, start, surface) {
  const before = text[start - 1];
  const after = text[start + surface.length];
  if (KANJI.test(surface[0]) && before && KANJI.test(before)) return false;
  if (KANJI.test(surface.at(-1)) && after && KANJI.test(after)) return false;
  return true;
}

export function applyDictionary(text, entries) {
  if (entries.length === 0) return text;
  // 長い表記から試す。熟語ごと登録すれば、短い表記の規則より優先される
  const sorted = [...entries].sort((a, b) => b.surface.length - a.surface.length);
  let out = '';
  let i = 0;
  while (i < text.length) {
    const hit = sorted.find((e) => text.startsWith(e.surface, i) && isWordBoundary(text, i, e.surface));
    if (hit) {
      out += hit.reading;
      i += hit.surface.length;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}
