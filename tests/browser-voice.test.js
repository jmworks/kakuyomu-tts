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
  it('日本語ローカル音声が無ければ null', () => {
    expect(pickVoice([voices[0], voices[1]], null)).toBeNull();
  });
});

describe('ttsPlay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['end', 'interrupted', 'cancelled', 'error'])('%s イベントで完了する', async (type) => {
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
