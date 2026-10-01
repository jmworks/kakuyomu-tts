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
