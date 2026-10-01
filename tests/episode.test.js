import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  extractParagraphs,
  findEpisodeBody,
  findNextEpisodeUrl,
  findStartIndex,
  findWork,
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
  it('空行と空白だけの段落を除き、ルビはふりがなで読む', () => {
    const texts = extractParagraphs(load()).map((p) => p.text);
    expect(texts).toEqual(['吾輩はテストである。', 'なまえはまだ無い。', '「どこで生まれたか」']);
  });

  const textOf = (inner) => extractParagraphs(load(`<div class="js-episode-body"><p>${inner}</p></div>`))[0].text;

  it('rb の無いルビもふりがなで読む', () => {
    expect(textOf('<ruby>本気<rt>マジ</rt></ruby>で言ってる')).toBe('マジで言ってる');
  });

  it('ふりがなが「・」などの記号だけ（傍点としての使い方）なら親文字を読む', () => {
    expect(textOf('<ruby><rb>絶対</rb><rp>（</rp><rt>・・</rt><rp>）</rp></ruby>に')).toBe('絶対に');
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

describe('findWork', () => {
  it('URL から作品 ID を、作品ページへのリンクから作品名を取る', () => {
    const doc = load(`<div id="worksEpisodesEpisodeHeader-closeButton"><a href="/works/1">閉じる</a></div>
      <h1><a href="/works/1">テスト作品</a></h1><div class="js-episode-body"></div>`);
    expect(findWork(doc)).toEqual({ workId: '1', title: 'テスト作品' });
  });

  it('作品名が見つからなければ title は null', () => {
    expect(findWork(load())).toEqual({ workId: '1', title: null });
  });

  it('エピソードページ以外では null', () => {
    const doc = new JSDOM('<p></p>', { url: 'https://kakuyomu.jp/works/1' }).window.document;
    expect(findWork(doc)).toBeNull();
  });
});
