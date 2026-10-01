import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_UNREACHABLE, EngineError, getSpeakers, synthesize } from '../src/voicevox.js';

const ENGINE = 'http://127.0.0.1:50021';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(handler) {
  const fetch = vi.fn(handler);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('getSpeakers', () => {
  it('/speakers を返す', async () => {
    const speakers = [{ name: 'A', styles: [{ name: 'ノーマル', id: 1 }] }];
    const fetch = stubFetch(async () => new Response(JSON.stringify(speakers)));
    await expect(getSpeakers(ENGINE)).resolves.toEqual(speakers);
    expect(fetch.mock.calls[0][0]).toBe(`${ENGINE}/speakers`);
  });

  it('接続できなければ unreachable な EngineError', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await getSpeakers(ENGINE).catch((e) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect(error.unreachable).toBe(true);
    expect(error.message).toBe(ENGINE_UNREACHABLE);
  });

  it('HTTP エラーは unreachable ではない EngineError', async () => {
    stubFetch(async () => new Response('bad', { status: 500 }));
    const error = await getSpeakers(ENGINE).catch((e) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect(error.unreachable).toBe(false);
    expect(error.message).toContain('500');
  });
});

describe('synthesize', () => {
  it('audio_query に速度を設定して synthesis に渡し、WAV を返す', async () => {
    const fetch = stubFetch(async (url) => {
      if (url.startsWith(`${ENGINE}/audio_query`)) {
        return new Response(JSON.stringify({ speedScale: 1, accent_phrases: [] }));
      }
      return new Response(new Blob(['RIFF'], { type: 'audio/wav' }));
    });

    const blob = await synthesize(ENGINE, '本文です。', 8, 1.3);

    const [queryUrl, queryInit] = fetch.mock.calls[0];
    expect(queryUrl).toBe(`${ENGINE}/audio_query?text=${encodeURIComponent('本文です。')}&speaker=8`);
    expect(queryInit.method).toBe('POST');

    const [synthUrl, synthInit] = fetch.mock.calls[1];
    expect(synthUrl).toBe(`${ENGINE}/synthesis?speaker=8`);
    expect(JSON.parse(synthInit.body).speedScale).toBe(1.3);
    expect(await blob.text()).toBe('RIFF');
  });
});
