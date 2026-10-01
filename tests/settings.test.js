import { describe, expect, it } from 'vitest';
import { DEFAULTS, defaultSpeakerId, normalizeEngineUrl } from '../src/settings.js';

describe('normalizeEngineUrl', () => {
  it.each([
    ['http://127.0.0.1:50021', 'http://127.0.0.1:50021'],
    ['http://127.0.0.1:50021/', 'http://127.0.0.1:50021'],
    ['  http://localhost:10101/  ', 'http://localhost:10101'],
    ['127.0.0.1:50021', 'http://127.0.0.1:50021'],
    ['localhost:10101', 'http://localhost:10101'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeEngineUrl(input)).toBe(expected);
  });

  it.each(['https://127.0.0.1:50021', 'http://example.com:50021', 'http://192.168.0.2:50021', '', 'not a url'])(
    '許可外・不正な入力 %s は null',
    (input) => {
      expect(normalizeEngineUrl(input)).toBeNull();
    },
  );
});

describe('defaultSpeakerId', () => {
  it('最初の話者の最初のスタイル', () => {
    expect(defaultSpeakerId([{ name: 'A', styles: [{ name: 'ノーマル', id: 3 }] }])).toBe(3);
  });
  it('話者が無ければ null', () => {
    expect(defaultSpeakerId([])).toBeNull();
  });
});

describe('DEFAULTS', () => {
  it('既定値', () => {
    expect(DEFAULTS).toEqual({
      engineUrl: 'http://127.0.0.1:50021',
      speaker: null,
      speed: 1.0,
      browserVoice: null,
    });
  });
});
