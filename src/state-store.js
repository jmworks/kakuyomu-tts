// chrome.storage.session 上の状態を「読む → 変える → 書く」を 1 つずつ順番に行う。
// 並行して読み書きすると、後から書いた古い状態で新しい状態を上書きしてしまうため。
// update(fn) の fn は現在の状態を受け取り {state, ...副作用の指示} を返す。
export function createStateStore({ load, save }) {
  let chain = Promise.resolve();

  function enqueue(task) {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  }

  return {
    update(fn) {
      return enqueue(async () => {
        const current = await load();
        const result = fn(current);
        if (result.state !== current) await save(result.state);
        return result;
      });
    },
    get() {
      return enqueue(load);
    },
  };
}
