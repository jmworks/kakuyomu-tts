import { describe, expect, it, vi } from 'vitest';
import { Player } from '../src/player.js';

// 再生を手動で終わらせられるフェイク
function createHarness({ failOn } = {}) {
  const log = [];
  let finishCurrent = null;
  const player = new Player({
    synthesize: vi.fn(async (text) => {
      log.push(`synth:${text}`);
      if (text === failOn) throw new Error('合成失敗');
      return `audio:${text}`;
    }),
    play: vi.fn(
      (audio) =>
        new Promise((resolve) => {
          log.push(`play:${audio}`);
          finishCurrent = () => {
            finishCurrent = null;
            resolve();
          };
        }),
    ),
    stopAudio: vi.fn(() => finishCurrent?.()),
    onReading: vi.fn((index) => log.push(`reading:${index}`)),
    onEnded: vi.fn(() => log.push('ended')),
    onError: vi.fn((e) => log.push(`error:${e.message}`)),
  });
  const finish = async () => {
    await vi.waitFor(() => expect(finishCurrent).not.toBeNull());
    finishCurrent();
  };
  return { player, log, finish };
}

const units = [
  { index: 0, text: 'a' },
  { index: 0, text: 'b' },
  { index: 2, text: 'c' },
];

describe('Player', () => {
  it('順に再生して最後に ended を 1 回出す', async () => {
    const { player, log, finish } = createHarness();
    const done = player.start(units);
    await finish();
    await finish();
    await finish();
    await done;
    expect(log.filter((l) => l.startsWith('reading') || l === 'ended')).toEqual([
      'reading:0',
      'reading:0',
      'reading:2',
      'ended',
    ]);
  });

  it('再生中に次の単位を先読みする', async () => {
    const { player, log, finish } = createHarness();
    player.start(units);
    await vi.waitFor(() => expect(log).toContain('play:audio:a'));
    // a の再生が終わる前に b の合成が始まっている
    await vi.waitFor(() => expect(log).toContain('synth:b'));
    expect(log).not.toContain('play:audio:b');
    await finish();
  });

  it('stop したら以後イベントを出さない', async () => {
    const { player, log } = createHarness();
    const done = player.start(units);
    await vi.waitFor(() => expect(log).toContain('play:audio:a'));
    player.stop();
    await done;
    expect(log).not.toContain('ended');
    expect(log).not.toContain('play:audio:b');
  });

  it('合成に失敗したら onError で止まり ended は出さない', async () => {
    const { player, log, finish } = createHarness({ failOn: 'b' });
    const done = player.start(units);
    await finish();
    await done;
    expect(log).toContain('error:合成失敗');
    expect(log).not.toContain('ended');
    expect(log).not.toContain('reading:2');
  });

  it('再生中に start し直すと前の再生は止まり、新しい方だけ進む', async () => {
    const { player, log, finish } = createHarness();
    const first = player.start(units);
    await vi.waitFor(() => expect(log).toContain('play:audio:a'));
    const second = player.start([{ index: 5, text: 'z' }]);
    await first;
    await finish();
    await second;
    expect(log.filter((l) => l === 'ended')).toHaveLength(1);
    expect(log).toContain('reading:5');
    expect(log).not.toContain('reading:2');
  });

  it('再生に失敗したら onError で止まり、次へ進まない', async () => {
    const onError = vi.fn();
    const onEnded = vi.fn();
    const onReading = vi.fn();
    const player = new Player({
      synthesize: async (text) => text,
      play: async () => {
        throw new Error('再生できない');
      },
      stopAudio: () => {},
      onReading,
      onEnded,
      onError,
    });
    await player.start(units);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: '再生できない' }));
    expect(onReading).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('単位が空ならすぐ ended', async () => {
    const { player, log } = createHarness();
    await player.start([]);
    expect(log).toEqual(['ended']);
  });
});
