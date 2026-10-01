import { describe, expect, it } from 'vitest';
import { MAX_CHARS, splitLong, toUtterances } from '../src/text.js';

describe('splitLong', () => {
  it('短い段落はそのまま 1 つ', () => {
    expect(splitLong('こんにちは。元気？')).toEqual(['こんにちは。元気？']);
  });

  it('長い段落は文の切れ目で 120 文字以下に分け、つなげると元に戻る', () => {
    const sentence = 'あ'.repeat(50) + '。';
    const text = sentence.repeat(5);
    const chunks = splitLong(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= MAX_CHARS)).toBe(true);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((c) => c.endsWith('。'))).toBe(true);
  });

  it('閉じかっこは文末記号と同じ塊に残す', () => {
    const text = `「${'い'.repeat(70)}！」${'う'.repeat(70)}。`;
    const chunks = splitLong(text);
    expect(chunks[0].endsWith('！」')).toBe(true);
    expect(chunks.join('')).toBe(text);
  });

  it('句読点が全く無い長文も 120 文字以下に切る', () => {
    const text = 'え'.repeat(300);
    const chunks = splitLong(text);
    expect(chunks.every((c) => c.length <= MAX_CHARS)).toBe(true);
    expect(chunks.join('')).toBe(text);
  });

  it('文末が無く読点がある長文は読点の直後で切る', () => {
    const text = `${'お'.repeat(80)}、${'か'.repeat(80)}`;
    expect(splitLong(text)[0]).toBe(`${'お'.repeat(80)}、`);
  });
});

describe('toUtterances', () => {
  it('startIndex 以降の段落を段落番号付きで返す', () => {
    expect(toUtterances(['一。', '二。', '三。'], 1)).toEqual([
      { index: 1, text: '二。' },
      { index: 2, text: '三。' },
    ]);
  });

  it('記号だけの段落は読み飛ばす', () => {
    expect(toUtterances(['＊　＊　＊', '◇◇◇', '……', '本文。'], 0)).toEqual([
      { index: 3, text: '本文。' },
    ]);
  });

  it('長い段落は同じ段落番号で複数に分かれる', () => {
    const long = ('あ'.repeat(50) + '。').repeat(5);
    const units = toUtterances([long], 0);
    expect(units.length).toBeGreaterThan(1);
    expect(units.every((u) => u.index === 0)).toBe(true);
  });

  it('startIndex が末尾以降なら空', () => {
    expect(toUtterances(['一。'], 1)).toEqual([]);
  });
});
