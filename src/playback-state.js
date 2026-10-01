// どのタブで読み上げ中か、次のページ読み込みが拡張による自動遷移か、を表す。
// 自動遷移でない読み込み（リロードや手動での移動）が起きたら再生を止める。
export const initialState = { playingTabId: null, advancing: false };

export function onPlay(state, tabId) {
  const previousTabId =
    state.playingTabId !== null && state.playingTabId !== tabId ? state.playingTabId : null;
  return { state: { playingTabId: tabId, advancing: false }, previousTabId };
}

export function onStop(state, tabId) {
  if (state.playingTabId !== tabId) return { state, stopAudio: false };
  return { state: initialState, stopAudio: true };
}

export function onAdvance(state, tabId) {
  if (state.playingTabId !== tabId) return state;
  return { ...state, advancing: true };
}

export function onTabLoading(state, tabId) {
  if (state.playingTabId !== tabId) return { state, stopAudio: false };
  if (state.advancing) return { state, stopAudio: false };
  return { state: initialState, stopAudio: true };
}

export function onQuery(state, tabId) {
  if (state.playingTabId !== tabId || !state.advancing) return { state, resume: false };
  return { state: { ...state, advancing: false }, resume: true };
}
