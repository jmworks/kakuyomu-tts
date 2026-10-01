import { describe, expect, it, vi } from 'vitest';
import { createStateStore } from '../src/state-store.js';

// 読み書きに時間がかかる保存先（chrome.storage.session の代わり）
function slowStorage(initial) {
  let value = initial;
  const tick = () => new Promise((r) => setTimeout(r, 5));
  return {
    load: vi.fn(async () => {
      await tick();
      return value;
    }),
    save: vi.fn(async (next) => {
      await tick();
      value = next;
    }),
    peek: () => value,
  };
}

describe('createStateStore', () => {
  it('同時に来た更新を 1 つずつ順に適用し、どの更新も失われない', async () => {
    const storage = slowStorage({ n: 0 });
    const store = createStateStore(storage);
    await Promise.all([1, 2, 3].map(() => store.update((s) => ({ state: { n: s.n + 1 } }))));
    expect(storage.peek()).toEqual({ n: 3 });
  });

  it('更新関数の戻り値（副作用の指示など）を返す', async () => {
    const store = createStateStore(slowStorage({ n: 0 }));
    await expect(store.update((s) => ({ state: { n: 1 }, stopAudio: true }))).resolves.toEqual({
      state: { n: 1 },
      stopAudio: true,
    });
  });

  it('状態が変わらない更新では保存しない', async () => {
    const storage = slowStorage({ n: 0 });
    const store = createStateStore(storage);
    await store.update((s) => ({ state: s }));
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('更新関数が例外を投げても、後の更新は進む', async () => {
    const storage = slowStorage({ n: 0 });
    const store = createStateStore(storage);
    const failed = store.update(() => {
      throw new Error('boom');
    });
    const next = store.update((s) => ({ state: { n: s.n + 1 } }));
    await expect(failed).rejects.toThrow('boom');
    await next;
    expect(storage.peek()).toEqual({ n: 1 });
  });

  it('get は先に始まった更新が終わってから読む', async () => {
    const store = createStateStore(slowStorage({ n: 0 }));
    store.update(() => ({ state: { n: 5 } }));
    await expect(store.get()).resolves.toEqual({ n: 5 });
  });
});
