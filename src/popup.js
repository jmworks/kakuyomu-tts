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
  select.replaceChildren(new Option('自動（Kyoko などの標準の声）', ''));
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
