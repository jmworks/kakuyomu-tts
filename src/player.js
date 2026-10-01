// 読み上げ単位を「合成 → 再生」の順に処理する。再生中に次の単位を先に合成しておく。
// 合成・再生の手段は注入する（VOICEVOX 用と chrome.tts 用で共通に使う）。
export const PLAYBACK_FAILED = '音声を再生できませんでした';

export class Player {
  constructor({ synthesize, play, stopAudio, onReading, onEnded, onError }) {
    Object.assign(this, { synthesize, play, stopAudio, onReading, onEnded, onError });
    this.session = 0;
  }

  async start(units) {
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
    }
    this.onEnded();
  }

  stop() {
    this.session++;
    this.stopAudio();
  }
}
