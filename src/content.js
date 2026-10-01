import { createControls } from './controls.js';
import {
  extractParagraphs,
  findEpisodeBody,
  findNextEpisodeUrl,
  findStartIndex,
  findWork,
} from './episode.js';

const HIGHLIGHT_CLASS = 'kakuyomu-tts-reading';

let paragraphs = [];
let current = null;

const controls = createControls({
  onPlay: () => play(findStartIndex(paragraphs)),
  onStop: stop,
  onSettings: () => chrome.runtime.sendMessage({ type: 'openSettings', work: findWork(document) }),
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
  chrome.runtime.sendMessage({
    type: 'play',
    texts: paragraphs.map((p) => p.text),
    startIndex,
    workId: findWork(document)?.workId ?? null,
  });
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
  await chrome.runtime.sendMessage({ type: 'advance', url: next });
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
    const { resume } = await chrome.runtime.sendMessage({ type: 'query' });
    if (resume) chrome.runtime.sendMessage({ type: 'stop' });
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
