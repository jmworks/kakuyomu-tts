import { describe, expect, it } from 'vitest';
import {
  ADVANCE_TTL_MS,
  initialState,
  isCurrentPlay,
  onAdvance,
  onPlay,
  onQuery,
  onStop,
  onTabLoading,
} from '../src/playback-state.js';

const NEXT = 'https://kakuyomu.jp/works/1/episodes/3';
const OTHER = 'https://kakuyomu.jp/works/1/episodes/9';
const NOW = 1_000_000;

const playing = (tabId, playId = 1, advance = null) => ({ playingTabId: tabId, playId, advance });
const stopped = (playId) => ({ playingTabId: null, playId, advance: null });

describe('onPlay', () => {
  it('再生中タブを記録し、再生の世代番号を進める', () => {
    expect(onPlay(initialState, 1)).toEqual({ state: playing(1, 1), previousTabId: null });
  });
  it('別タブが再生中ならそのタブを previousTabId で返す', () => {
    expect(onPlay(playing(1, 4), 2)).toEqual({ state: playing(2, 5), previousTabId: 1 });
  });
  it('同じタブで再開しても previousTabId は null', () => {
    expect(onPlay(playing(1), 1).previousTabId).toBeNull();
  });
  it('停止を挟んでも世代番号は戻らない（古い再生のイベントと区別するため）', () => {
    const { state } = onStop(playing(1, 7), 1);
    expect(onPlay(state, 1).state.playId).toBe(8);
  });
});

describe('isCurrentPlay', () => {
  it('同じタブ・同じ世代なら true', () => {
    expect(isCurrentPlay(playing(1, 3), 1, 3)).toBe(true);
  });
  it('世代が古ければ false', () => {
    expect(isCurrentPlay(playing(1, 3), 1, 2)).toBe(false);
  });
  it('停止後は false', () => {
    expect(isCurrentPlay(stopped(3), 1, 3)).toBe(false);
  });
});

describe('onStop', () => {
  it('再生中タブからの停止で止める', () => {
    expect(onStop(playing(1, 2), 1)).toEqual({ state: stopped(2), stopAudio: true });
  });
  it('他のタブからの停止は無視し、状態オブジェクトもそのまま返す', () => {
    const state = playing(1);
    const result = onStop(state, 2);
    expect(result.stopAudio).toBe(false);
    expect(result.state).toBe(state);
  });
});

describe('自動遷移と手動遷移', () => {
  const advanced = () => onAdvance(playing(1), 1, NEXT, NOW);

  it('advance 後の読み込みは継続し、遷移先からの問い合わせで resume = true', () => {
    const loading = onTabLoading(advanced(), 1);
    expect(loading.stopAudio).toBe(false);
    const query = onQuery(loading.state, 1, NEXT, NOW + 2000);
    expect(query.resume).toBe(true);
    expect(query.state).toEqual(playing(1));
  });

  it('URL のクエリやハッシュが違っても同じ話なら再開する', () => {
    const query = onQuery(onTabLoading(advanced(), 1).state, 1, `${NEXT}?a=1#top`, NOW);
    expect(query.resume).toBe(true);
  });

  it('advance 無しの読み込み（リロード・手動移動）は停止し、遷移先で再開しない', () => {
    const loading = onTabLoading(playing(1, 2), 1);
    expect(loading).toEqual({ state: stopped(2), stopAudio: true });
    expect(onQuery(loading.state, 1, NEXT, NOW).resume).toBe(false);
  });

  it('予定と違う話からの問い合わせでは再開せず、停止する', () => {
    const query = onQuery(onTabLoading(advanced(), 1).state, 1, OTHER, NOW);
    expect(query).toEqual({ state: stopped(1), resume: false });
  });

  it('advance から時間が経ちすぎた問い合わせでは再開せず、停止する', () => {
    const query = onQuery(onTabLoading(advanced(), 1).state, 1, NEXT, NOW + ADVANCE_TTL_MS + 1);
    expect(query).toEqual({ state: stopped(1), resume: false });
  });

  it('resume は 1 回だけ（再度読み込んだら止まる）', () => {
    const { state } = onQuery(onTabLoading(advanced(), 1).state, 1, NEXT, NOW);
    expect(onTabLoading(state, 1).stopAudio).toBe(true);
  });

  it('再生していないタブの読み込み・問い合わせは状態オブジェクトをそのまま返す', () => {
    const state = advanced();
    expect(onTabLoading(state, 2)).toEqual({ state, stopAudio: false });
    expect(onTabLoading(state, 2).state).toBe(state);
    expect(onQuery(state, 2, NEXT, NOW)).toEqual({ state, resume: false });
  });

  it('他のタブからの advance は無視する', () => {
    const state = playing(1);
    expect(onAdvance(state, 2, NEXT, NOW)).toBe(state);
  });
});
