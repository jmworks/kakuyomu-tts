import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  extractParagraphs,
  findEpisodeBody,
  findNextEpisodeUrl,
  findStartIndex,
} from '../src/episode.js';

const HTML = readFileSync(new URL('./fixtures/episode.html', import.meta.url), 'utf8');
const URL_ = 'https://kakuyomu.jp/works/1/episodes/2';

function load(html = HTML) {
  return new JSDOM(html, { url: URL_ }).window.document;
}

describe('findEpisodeBody', () => {
  it('本文コンテナを返す', () => {
    expect(findEpisodeBody(load()).classList.contains('js-episode-body')).toBe(true);
  });
  it('本文が無いページでは null', () => {
    expect(findEpisodeBody(load('<p>no body</p>'))).toBeNull();
  });
});

describe('extractParagraphs', () => {
  it('空行と空白だけの段落を除き、ルビは親文字だけ読む', () => {
    const texts = extractParagraphs(load()).map((p) => p.text);
    expect(texts).toEqual(['吾輩はテストである。', '名前はまだ無い。', '「どこで生まれたか」']);
  });
  it('要素への参照を保持する', () => {
    const [first] = extractParagraphs(load());
    expect(first.el.id).toBe('p1');
  });
  it('本文が無ければ空配列', () => {
    expect(extractParagraphs(load('<p>x</p>'))).toEqual([]);
  });
});

describe('findStartIndex', () => {
  const para = (bottom) => ({ el: { getBoundingClientRect: () => ({ bottom }) } });

  it('画面上端より下に下端がある最初の段落', () => {
    expect(findStartIndex([para(-50), para(-1), para(30), para(200)])).toBe(2);
  });
  it('下端がちょうど 0 の段落は画面外とみなす', () => {
    expect(findStartIndex([para(0), para(10)])).toBe(1);
  });
  it('全段落が画面より上なら最後の段落', () => {
    expect(findStartIndex([para(-300), para(-100)])).toBe(1);
  });
  it('全段落が画面内・下なら 0', () => {
    expect(findStartIndex([para(500), para(900)])).toBe(0);
  });
  it('段落が無ければ 0', () => {
    expect(findStartIndex([])).toBe(0);
  });
});

describe('findNextEpisodeUrl', () => {
  it('次話リンクを絶対 URL で返す', () => {
    expect(findNextEpisodeUrl(load())).toBe('https://kakuyomu.jp/works/1/episodes/3');
  });
  it('最新話（リンク無し）では null', () => {
    const doc = load();
    doc.getElementById('contentMain-readNextEpisode').remove();
    expect(findNextEpisodeUrl(doc)).toBeNull();
  });
});
