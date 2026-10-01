// content script から拡張本体へメッセージを送る。
// 拡張を更新すると、開いたままのページに残った古い content script は拡張との接続が切れ、
// chrome.runtime が使えなくなる。そのときは送らずに onUnavailable で知らせる。
export function createSender(getRuntime, onUnavailable) {
  return async (msg) => {
    const runtime = getRuntime();
    if (!runtime?.id) {
      onUnavailable();
      return null;
    }
    try {
      return await runtime.sendMessage(msg);
    } catch {
      onUnavailable();
      return null;
    }
  };
}
