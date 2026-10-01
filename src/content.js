import { createControls } from './controls.js';
import { createSender } from './messenger.js';
import {
  extractParagraphs,
  findEpisodeBody,
  findNextEpisodeUrl,
  findStartIndex,
  findWork,
} from './episode.js';

const HIGHLIGHT_CLASS = 'kakuyomu-tts-reading';
const RELOAD_NEEDED = '拡張機能が更新されました。このページを再読み込みしてから、もう一度お試しください';

let paragraphs = [];
let current = null;

const controls = createControls({
  onPlay: () => play(findStartIndex(paragraphs)),
  onStop: stop,
  onSettings: () => send({ type: 'openSettings', work: findWork(document) }),
});

const send = createSender(
  () => globalThis.chrome?.runtime,
  () => {
    controls.setPlaying(false);
    clearHighlight();
    controls.showMessage(RELOAD_NEEDED, { sticky: true });
  },
);

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
  // 送れなかったときに send が ▶ に戻すので、先に ■ にしておく
  controls.setPlaying(true);
  send({
    type: 'play',
    texts: paragraphs.map((p) => p.text),
    startIndex,
    workId: findWork(document)?.workId ?? null,
  });
}

function stop() {
  send({ type: 'stop' });
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
  if (!(await send({ type: 'advance', url: next }))) return;
  location.href = next;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'getWork':
      // 設定画面が、いま開いている作品の辞書を表示するために問い合わせる
      sendResponse(findWork(document));
      break;
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
    // 自動遷移の途中ならここで止める（再生中の目印を残さない）
    const response = await send({ type: 'query' });
    if (response?.resume) send({ type: 'stop' });
    return;
  }
  const style = document.createElement('style');
  style.textContent = `.${HIGHLIGHT_CLASS} { background-color: rgba(255, 214, 0, 0.3); }`;
  document.head.append(style);
  paragraphs = extractParagraphs(document);

  const response = await send({ type: 'query' });
  if (response?.resume) play(0);
}

init();
