import { afterEach, describe, expect, it, vi } from 'vitest';
import { localJapaneseVoices, pickVoice, ttsPlay } from '../src/browser-voice.js';

const voices = [
  { voiceName: 'Samantha', lang: 'en-US', remote: false },
  { voiceName: 'Google 日本語', lang: 'ja-JP', remote: true },
  { voiceName: 'Kyoko', lang: 'ja-JP', remote: false },
  { voiceName: 'Otoya', lang: 'ja-JP' },
];

describe('localJapaneseVoices', () => {
  it('日本語のローカル音声だけ（ネットワーク音声は除く）', () => {
    expect(localJapaneseVoices(voices).map((v) => v.voiceName)).toEqual(['Kyoko', 'Otoya']);
  });
});

describe('pickVoice', () => {
  it('指定の声が使えればそれ', () => {
    expect(pickVoice(voices, 'Otoya')).toBe('Otoya');
  });
  it('指定が無ければ最初の日本語ローカル音声', () => {
    expect(pickVoice(voices, null)).toBe('Kyoko');
  });
  it('指定がネットワーク音声なら使わない', () => {
    expect(pickVoice(voices, 'Google 日本語')).toBe('Kyoko');
  });
  it('指定が無ければ Kyoko など標準的な声を優先する（Mac の Eddy などより先）', () => {
    const mac = [
      { voiceName: 'Eddy (Japanese (Japan))', lang: 'ja-JP', remote: false },
      { voiceName: 'Grandma (Japanese (Japan))', lang: 'ja-JP', remote: false },
      { voiceName: 'Kyoko', lang: 'ja-JP', remote: false },
    ];
    expect(pickVoice(mac, null)).toBe('Kyoko');
  });
  it('Windows の Microsoft Haruka なども標準的な声として優先する', () => {
    const win = [
      { voiceName: 'Other Voice', lang: 'ja-JP', remote: false },
      { voiceName: 'Microsoft Haruka - Japanese (Japan)', lang: 'ja-JP', remote: false },
    ];
    expect(pickVoice(win, null)).toBe('Microsoft Haruka - Japanese (Japan)');
  });
  it('日本語ローカル音声が無ければ null', () => {
    expect(pickVoice([voices[0], voices[1]], null)).toBeNull();
  });
});

describe('ttsPlay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('error イベントでは失敗として reject する', async () => {
    vi.stubGlobal('chrome', {
      tts: { speak: (text, options) => options.onEvent({ type: 'error', errorMessage: 'no voice' }) },
    });
    await expect(ttsPlay('本文。', { voiceName: 'Kyoko', rate: 1 })).rejects.toThrow('no voice');
  });

  it.each(['end', 'interrupted', 'cancelled'])('%s イベントで完了する', async (type) => {
    const speak = vi.fn((text, options) => {
      options.onEvent({ type: 'start' });
      options.onEvent({ type });
    });
    vi.stubGlobal('chrome', { tts: { speak } });
    await ttsPlay('本文。', { voiceName: 'Kyoko', rate: 1.2 });
    expect(speak).toHaveBeenCalledWith(
      '本文。',
      expect.objectContaining({ voiceName: 'Kyoko', rate: 1.2, lang: 'ja-JP', enqueue: false }),
    );
  });
});
