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
