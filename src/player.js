// 読み上げ単位を「合成 → 再生」の順に処理する。再生中に次の単位を先に合成しておく。
// 合成・再生の手段は注入する（VOICEVOX 用と chrome.tts 用で共通に使う）。
export const PLAYBACK_FAILED = '音声を再生できませんでした';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Player {
  constructor({ synthesize, play, stopAudio, onReading, onEnded, onError, sleep = defaultSleep }) {
    Object.assign(this, { synthesize, play, stopAudio, onReading, onEnded, onError, sleep });
    this.session = 0;
  }

  // paragraphPauseMs: 段落が変わるところで空ける無音の長さ（同じ段落を分割した部分の間には空けない）
  async start(units, { paragraphPauseMs = 0 } = {}) {
    this.stop();
    const session = this.session;
    const isCurrent = () => session === this.session;
    const prefetch = (i) => {
      if (i >= units.length) return null;
      const pending = this.synthesize(units[i].text);
      pending.catch(() => {}); // 失敗は await した時点で扱う
      return pending;
    };

    let next = prefetch(0);
    for (let i = 0; i < units.length; i++) {
      let audio;
      try {
        audio = await next;
      } catch (error) {
        if (isCurrent()) this.onError(error);
        return;
      }
      if (!isCurrent()) return;
      next = prefetch(i + 1);
      this.onReading(units[i].index);
      try {
        await this.play(audio);
      } catch (error) {
        if (isCurrent()) this.onError(error);
        return;
      }
      if (!isCurrent()) return;
      const paragraphEnds = i + 1 < units.length && units[i + 1].index !== units[i].index;
      if (paragraphEnds && paragraphPauseMs > 0) {
        await this.sleep(paragraphPauseMs);
        if (!isCurrent()) return;
      }
    }
    this.onEnded();
  }

  stop() {
    this.session++;
    this.stopAudio();
  }
}
