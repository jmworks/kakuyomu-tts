import { describe, expect, it } from 'vitest';
import { applyDictionary, mergeDictionaries, parseDictionary } from '../src/dictionary.js';

describe('parseDictionary', () => {
  it('1 行 1 語の「表記:読み」を読む（全角コロンも可）', () => {
    expect(parseDictionary('我:われ\nお主：おぬし')).toEqual([
      { surface: '我', reading: 'われ' },
      { surface: 'お主', reading: 'おぬし' },
    ]);
  });

  it('空行・コロンの無い行・表記か読みが空の行は無視し、前後の空白は除く', () => {
    expect(parseDictionary('\n  我 : われ  \nメモ\n:よみ\n表記:\n')).toEqual([{ surface: '我', reading: 'われ' }]);
  });

  it('同じ表記が複数あれば後の行を使う', () => {
    expect(parseDictionary('我:が\n我:われ')).toEqual([{ surface: '我', reading: 'われ' }]);
  });
});

describe('mergeDictionaries', () => {
  it('作品ごとの辞書が全体の辞書より優先される', () => {
    const merged = mergeDictionaries(
      [
        { surface: '我', reading: 'われ' },
        { surface: '主', reading: 'あるじ' },
      ],
      [{ surface: '我', reading: 'わが' }],
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        { surface: '我', reading: 'わが' },
        { surface: '主', reading: 'あるじ' },
      ]),
    );
    expect(merged).toHaveLength(2);
  });
});

describe('applyDictionary', () => {
  const dict = parseDictionary('我:われ\nお主:おぬし');

  it('登録した表記を読みに置き換える', () => {
    expect(applyDictionary('我はお主を待っていた。', dict)).toBe('われはおぬしを待っていた。');
  });

  it('前後に漢字が続く場合は別の熟語の一部とみなして置き換えない', () => {
    expect(applyDictionary('我慢した。自我がある。我々は。', dict)).toBe('我慢した。自我がある。我々は。');
    expect(applyDictionary('お主人様', dict)).toBe('お主人様');
  });

  it('長い表記を優先する（熟語ごと登録すれば規則より優先できる）', () => {
    const withLong = parseDictionary('我:われ\n我慢:がまん');
    expect(applyDictionary('我慢する我', withLong)).toBe('がまんするわれ');
  });

  it('置き換えた読みを再度置き換えない', () => {
    expect(applyDictionary('我', parseDictionary('我:われ\nわれ:ワレ'))).toBe('われ');
  });

  it('辞書が空なら本文をそのまま返す', () => {
    expect(applyDictionary('我は。', [])).toBe('我は。');
  });
});
