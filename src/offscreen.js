import { PLAYBACK_FAILED, Player } from './player.js';
import { synthesize } from './voicevox.js';

const audio = new Audio();
let settings = null;
let tabId = null;
let playId = null;
let finishPlay = null;

function play(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      finishPlay = null;
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve();
    };
    finishPlay = () => finish();
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error(PLAYBACK_FAILED));
    audio.src = url;
    audio.play().catch(() => finish(new Error(PLAYBACK_FAILED)));
  });
}

function stopAudio() {
  audio.pause();
  finishPlay?.();
}

function emit(event, extra = {}) {
  chrome.runtime.sendMessage({ type: 'player-event', tabId, playId, event, ...extra }).catch(() => {});
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
    playId = msg.playId;
    player.start(msg.units, { paragraphPauseMs: settings.paragraphPause * 1000 });
  } else if (msg.type === 'stop') {
    player.stop();
  } else if (msg.type === 'settings' && settings) {
    // 再生中の設定変更。声・速度は次の単位から、段落の間は次の切れ目から反映する
    const { speaker, speed, paragraphPause } = msg.settings;
    const nextSpeaker = speaker ?? settings.speaker;
    const voiceChanged = nextSpeaker !== settings.speaker || speed !== settings.speed;
    settings = { ...settings, speaker: nextSpeaker, speed, paragraphPause };
    player.setParagraphPause(paragraphPause * 1000);
    if (voiceChanged) player.refresh();
  }
  sendResponse({});
  return false;
});
