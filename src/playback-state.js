// どのタブで読み上げ中か、次のページ読み込みが拡張による自動遷移か、を表す。
// 自動遷移でない読み込み（リロードや手動での移動）が起きたら再生を止める。
// playId は ▶ のたびに増える再生の世代番号で、止めた後に届く古いイベントを捨てるのに使う。
export const initialState = { playingTabId: null, playId: 0, advance: null };

// 自動遷移の予定（advance）が有効な時間。遷移先が読み込めなかった場合などに目印が残り続けないようにする
export const ADVANCE_TTL_MS = 60_000;

function stopped(state) {
  return { playingTabId: null, playId: state.playId, advance: null };
}

function pathOf(url) {
  return new URL(url).pathname;
}

export function isCurrentPlay(state, tabId, playId) {
  return state.playingTabId === tabId && state.playId === playId;
}

export function onPlay(state, tabId) {
  const previousTabId =
    state.playingTabId !== null && state.playingTabId !== tabId ? state.playingTabId : null;
  return { state: { playingTabId: tabId, playId: state.playId + 1, advance: null }, previousTabId };
}

export function onStop(state, tabId) {
  if (state.playingTabId !== tabId) return { state, stopAudio: false };
  return { state: stopped(state), stopAudio: true };
}

export function onAdvance(state, tabId, nextUrl, now) {
  if (state.playingTabId !== tabId) return state;
  return { ...state, advance: { path: pathOf(nextUrl), at: now } };
}

export function onTabLoading(state, tabId) {
  if (state.playingTabId !== tabId || state.advance) return { state, stopAudio: false };
  return { state: stopped(state), stopAudio: true };
}

// 遷移先のページからの問い合わせ。予定どおりの話に、時間内に着いたときだけ再開する
export function onQuery(state, tabId, url, now) {
  if (state.playingTabId !== tabId) return { state, resume: false };
  const { advance } = state;
  if (advance && advance.path === pathOf(url) && now - advance.at <= ADVANCE_TTL_MS) {
    return { state: { ...state, advance: null }, resume: true };
  }
  return { state: stopped(state), resume: false };
}
