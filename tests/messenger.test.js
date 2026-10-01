import { describe, expect, it, vi } from 'vitest';
import { createSender } from '../src/messenger.js';

describe('createSender', () => {
  it('拡張とつながっていれば sendMessage の応答を返す', async () => {
    const runtime = { id: 'ext', sendMessage: vi.fn(async () => ({ resume: true })) };
    const onUnavailable = vi.fn();
    const send = createSender(() => runtime, onUnavailable);
    await expect(send({ type: 'query' })).resolves.toEqual({ resume: true });
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it.each([
    ['chrome.runtime が無い（拡張の更新後に残った古いページ）', () => undefined],
    ['runtime.id が無い（拡張との接続が切れた）', () => ({ sendMessage: vi.fn() })],
  ])('%s場合は送らずに onUnavailable を呼び null を返す', async (_, getRuntime) => {
    const onUnavailable = vi.fn();
    const send = createSender(getRuntime, onUnavailable);
    await expect(send({ type: 'play' })).resolves.toBeNull();
    expect(onUnavailable).toHaveBeenCalledOnce();
  });

  it('送信に失敗したら onUnavailable を呼び null を返す', async () => {
    const runtime = {
      id: 'ext',
      sendMessage: vi.fn(async () => {
        throw new Error('Extension context invalidated.');
      }),
    };
    const onUnavailable = vi.fn();
    const send = createSender(() => runtime, onUnavailable);
    await expect(send({ type: 'stop' })).resolves.toBeNull();
    expect(onUnavailable).toHaveBeenCalledOnce();
  });
});
