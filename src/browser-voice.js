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
