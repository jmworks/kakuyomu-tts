import { pickVoice, ttsPlay, ttsStop } from './browser-voice.js';
import { Player } from './player.js';
import {
  initialState,
  isCurrentPlay,
  onAdvance,
  onPlay,
  onQuery,
  onStop,
  onTabLoading,
} from './playback-state.js';
import { DEFAULTS, defaultSpeakerId } from './settings.js';
import { createStateStore } from './state-store.js';
import { toUtterances } from './text.js';
import { ENGINE_UNREACHABLE, getSpeakers } from './voicevox.js';

const OFFSCREEN_URL = 'src/offscreen.html';
const FALLBACK_NOTICE = 'VOICEVOX に接続できないため、ブラウザの音声で読み上げます';

// --- 状態（service worker が止まっても消えないよう storage.session に置く） ---

const store = createStateStore({
  load: async () => (await chrome.storage.session.get('playback')).playback ?? initialState,
  save: (state) => chrome.storage.session.set({ playback: state }),
});

function toTab(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

// --- 再生手段 ---

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

// 作成中に別の ▶ が来ても 2 つ作ろうとしないよう、作成中の Promise を共有する
let creatingOffscreen = null;

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ['AUDIO_PLAYBACK'],
      justification: '小説の本文を音声エンジンで合成した音声を再生するため',
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;
}

// 無音が続いた offscreen は Chrome が自動で閉じるので、送る直前に閉じられていたら 1 回だけ作り直す
async function sendToOffscreen(msg) {
  await ensureOffscreen();
  try {
    await chrome.runtime.sendMessage(msg);
  } catch {
    await ensureOffscreen();
    await chrome.runtime.sendMessage(msg);
  }
}

let browserSession = null; // { tabId, playId, voiceName, rate }
const browserPlayer = new Player({
  synthesize: async (text) => text,
  play: (text) => ttsPlay(text, browserSession),
  stopAudio: ttsStop,
  onReading: (index) => handlePlayerEvent({ ...browserSession, event: 'reading', index }),
  onEnded: () => handlePlayerEvent({ ...browserSession, event: 'ended' }),
  onError: (error) => handlePlayerEvent({ ...browserSession, event: 'error', message: error.message }),
});

async function stopAudio() {
  browserPlayer.stop();
  if (await hasOffscreen()) {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
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
  const { state, previousTabId } = await store.update((s) => onPlay(s, tabId));
  const { playId } = state;
  // 準備を待つ間に ■・リロード・別の ▶ が来ていたら、この再生は始めない
  const stillCurrent = async () => isCurrentPlay(await store.get(), tabId, playId);

  await stopAudio();
  if (previousTabId !== null) toTab(previousTabId, { type: 'stopped' });

  try {
    const units = toUtterances(texts, startIndex);
    const settings = await chrome.storage.sync.get(DEFAULTS);
    const engine = await chooseEngine(settings);
    if (!(await stillCurrent())) return;

    if (engine.kind === 'voicevox') {
      await sendToOffscreen({ target: 'offscreen', type: 'start', tabId, playId, units, settings: engine.settings });
      if (!(await stillCurrent())) await stopAudio();
    } else {
      toTab(tabId, { type: 'notice', message: FALLBACK_NOTICE });
      browserSession = { tabId, playId, voiceName: engine.voiceName, rate: engine.rate };
      browserPlayer.start(units, { paragraphPauseMs: settings.paragraphPause * 1000 });
    }
  } catch (error) {
    await handlePlayerEvent({ tabId, playId, event: 'error', message: error.message });
  }
}

async function handleStop(tabId) {
  const result = await store.update((s) => onStop(s, tabId));
  if (result.stopAudio) await stopAudio();
}

async function handlePlayerEvent({ tabId, playId, event, index, message }) {
  if (event === 'error') {
    const result = await store.update((s) =>
      isCurrentPlay(s, tabId, playId) ? { ...onStop(s, tabId), current: true } : { state: s, current: false },
    );
    if (result.current) toTab(tabId, { type: 'error', message });
    return;
  }
  if (!isCurrentPlay(await store.get(), tabId, playId)) return; // 止めた後に届いた古いイベント
  if (event === 'reading') toTab(tabId, { type: 'reading', index });
  else if (event === 'ended') toTab(tabId, { type: 'episodeEnd' });
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
      store
        .update((s) => ({ state: onAdvance(s, tabId, msg.url, Date.now()) }))
        .then(() => sendResponse({}));
      return true;
    case 'query':
      store
        .update((s) => onQuery(s, tabId, sender.url, Date.now()))
        .then((result) => sendResponse({ resume: result.resume }));
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
  const result = await store.update((s) => onTabLoading(s, tabId));
  if (result.stopAudio) await stopAudio();
});

chrome.tabs.onRemoved.addListener((tabId) => handleStop(tabId));
