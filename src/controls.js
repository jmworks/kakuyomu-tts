const STYLE = `
  :host { all: initial; }
  .box {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    font-family: system-ui, sans-serif;
  }
  button {
    width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
    background: #333; color: #fff; font-size: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, .3);
  }
  button:focus-visible { outline: 3px solid #4c9ffe; outline-offset: 2px; }
  .msg {
    max-width: 280px; padding: 8px 12px; border-radius: 8px;
    background: #333; color: #fff; font-size: 13px; line-height: 1.5;
  }
  [hidden] { display: none !important; }
`;

const MESSAGE_MS = 8000;

export function createControls({ onPlay, onStop }) {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="box">
      <div class="msg" role="status" hidden></div>
      <button type="button"></button>
    </div>`;
  const button = root.querySelector('button');
  const msg = root.querySelector('.msg');
  let playing = false;
  let timer = null;

  function setPlaying(value) {
    playing = value;
    const label = value ? '読み上げ停止' : '読み上げ開始';
    button.textContent = value ? '■' : '▶';
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  button.addEventListener('click', () => (playing ? onStop() : onPlay()));
  setPlaying(false);
  document.body.append(host);

  return {
    setPlaying,
    showMessage(text, { sticky = false } = {}) {
      msg.textContent = text;
      msg.hidden = false;
      clearTimeout(timer);
      if (!sticky) timer = setTimeout(() => (msg.hidden = true), MESSAGE_MS);
    },
    hideButton() {
      button.hidden = true;
    },
  };
}
