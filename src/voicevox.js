export const ENGINE_UNREACHABLE =
  'VOICEVOX（音声エンジン）に接続できません。起動しているか、設定の URL を確認してください';

const TIMEOUT_MS = 30_000;

export class EngineError extends Error {
  constructor(message, { unreachable }) {
    super(message);
    this.unreachable = unreachable;
  }
}

async function request(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new EngineError(ENGINE_UNREACHABLE, { unreachable: true });
  }
  if (!res.ok) {
    throw new EngineError(`音声エンジンがエラーを返しました（HTTP ${res.status}）`, { unreachable: false });
  }
  return res;
}

export async function getSpeakers(engineUrl) {
  return (await request(`${engineUrl}/speakers`)).json();
}

export async function synthesize(engineUrl, text, speaker, speed) {
  const params = new URLSearchParams({ text, speaker: String(speaker) });
  const query = await (await request(`${engineUrl}/audio_query?${params}`, { method: 'POST' })).json();
  query.speedScale = speed;
  const res = await request(`${engineUrl}/synthesis?speaker=${speaker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  return res.blob();
}
