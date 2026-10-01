import { describe, expect, it } from 'vitest';
import {
  initialState,
  onAdvance,
  onPlay,
  onQuery,
  onStop,
  onTabLoading,
} from '../src/playback-state.js';

const playing = (tabId, advancing = false) => ({ playingTabId: tabId, advancing });

describe('onPlay', () => {
  it('再生中タブを記録する', () => {
    expect(onPlay(initialState, 1)).toEqual({ state: playing(1), previousTabId: null });
  });
  it('別タブが再生中ならそのタブを previousTabId で返す', () => {
    expect(onPlay(playing(1), 2)).toEqual({ state: playing(2), previousTabId: 1 });
  });
  it('同じタブで再開しても previousTabId は null', () => {
    expect(onPlay(playing(1), 1).previousTabId).toBeNull();
  });
});

describe('onStop', () => {
  it('再生中タブからの停止で初期状態に戻り音声を止める', () => {
    expect(onStop(playing(1), 1)).toEqual({ state: initialState, stopAudio: true });
  });
  it('他のタブからの停止は無視する', () => {
    expect(onStop(playing(1), 2)).toEqual({ state: playing(1), stopAudio: false });
  });
});

describe('自動遷移と手動遷移', () => {
  it('advance 後の読み込みは継続し、遷移先の問い合わせで resume = true', () => {
    const state = onAdvance(playing(1), 1);
    const loading = onTabLoading(state, 1);
    expect(loading.state).toEqual(playing(1, true));
    const query = onQuery(loading.state, 1);
    expect(query.resume).toBe(true);
    expect(query.state).toEqual(playing(1, false));
  });

  it('advance 無しの読み込み（リロード・手動移動）は停止し、遷移先で再開しない', () => {
    const loading = onTabLoading(playing(1), 1);
    expect(loading).toEqual({ state: initialState, stopAudio: true });
    expect(onQuery(loading.state, 1).resume).toBe(false);
  });

  it('resume は 1 回だけ（再度読み込んだら止まる）', () => {
    const { state } = onQuery(onTabLoading(onAdvance(playing(1), 1), 1).state, 1);
    expect(onTabLoading(state, 1)).toEqual({ state: initialState, stopAudio: true });
  });

  it('再生していないタブの読み込みは何もしない', () => {
    expect(onTabLoading(playing(1), 2)).toEqual({ state: playing(1), stopAudio: false });
  });

  it('再生していないタブの問い合わせは resume = false', () => {
    expect(onQuery(playing(1, true), 2)).toEqual({ state: playing(1, true), resume: false });
  });

  it('他のタブからの advance は無視する', () => {
    expect(onAdvance(playing(1), 2)).toEqual(playing(1));
  });
});
