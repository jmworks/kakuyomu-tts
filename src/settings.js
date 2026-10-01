export const DEFAULTS = {
  engineUrl: 'http://127.0.0.1:50021',
  speaker: null,
  speed: 1.0,
  paragraphPause: 0.7, // 段落の間の無音（秒）
  browserVoice: null,
};

// manifest の host_permissions で許可しているホストだけ受け付ける
const ALLOWED_HOSTS = ['127.0.0.1', 'localhost'];

export function normalizeEngineUrl(input) {
  const trimmed = input.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || !ALLOWED_HOSTS.includes(url.hostname)) return null;
  return url.origin;
}

export function defaultSpeakerId(speakers) {
  return speakers[0]?.styles[0]?.id ?? null;
}
