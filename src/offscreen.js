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
