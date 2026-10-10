import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '../../src/learn/glossary.ts';
import { LESSONS } from '../../src/learn/lessons.ts';
import { initialLabState } from '../../src/state/lab.ts';
import { lessonStatus } from '../../src/ui/learn/LearnView.tsx';
import { RichText } from '../../src/ui/learn/RichText.tsx';

describe('lesson content', () => {
  it('has six lessons, numbered in order, with unique ids', () => {
    expect(LESSONS.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it('ties every lesson to the course', () => {
    for (const l of LESSONS) expect(l.course).toMatch(/^course §\d/);
  });

  it('gives every question exactly one correct answer and an explanation for every option', () => {
    const ids = new Set<string>();
    for (const l of LESSONS) {
      expect(l.quiz.length, l.id).toBeGreaterThanOrEqual(2);
      for (const q of l.quiz) {
        expect(ids.has(q.id), `duplicate question id ${q.id}`).toBe(false);
        ids.add(q.id);
        expect(q.options.filter((o) => o.correct), q.id).toHaveLength(1);
        for (const o of q.options) expect(o.why.length, `${q.id}: ${o.text}`).toBeGreaterThan(20);
      }
    }
  });

  it('keeps backticks balanced, so code formatting never swallows text', () => {
    const texts = LESSONS.flatMap((l) => [...l.paragraphs, ...l.quiz.flatMap((q) => [q.prompt, ...q.options.flatMap((o) => [o.text, o.why])])]);
    for (const t of [...texts, ...GLOSSARY.map((g) => g.meaning)]) expect((t.match(/`/g) ?? []).length % 2, t).toBe(0);
  });

  it('has an alphabetical glossary without duplicates', () => {
    const terms = GLOSSARY.map((g) => g.term.toLowerCase());
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b)));
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe('RichText (safe formatting)', () => {
  const html = (text: string) => renderToStaticMarkup(createElement(RichText, { text }));

  it('renders backticks as code', () => {
    expect(html('says `CA:TRUE, pathlen:0` here')).toBe('says <code>CA:TRUE, pathlen:0</code> here');
  });

  it('never turns text into markup, even inside code', () => {
    const out = html('<img src=x onerror=alert(1)> and `<script>alert(1)</script>`');
    expect(out).not.toMatch(/<img|<script/);
    expect(out).toContain('&lt;img');
    expect(out).toContain('<code>&lt;script&gt;');
  });
});

describe('lesson progress', () => {
  const certs = LESSONS.find((l) => l.id === 'certificates')!;

  it('marks a lab task as practised once the lab reaches its milestone', () => {
    const empty = { practiced: [], correct: [], current: 'certificates' };
    expect(lessonStatus(certs, empty, initialLabState).practiced).toBe(false);
    const withRoot = { ...initialLabState, root: {} as never };
    expect(lessonStatus(certs, empty, withRoot).practiced).toBe(true);
  });

  it('is done only when practised and every question is answered correctly', () => {
    const withRoot = { ...initialLabState, root: {} as never };
    const someRight = { practiced: [], correct: [certs.quiz[0]!.id], current: 'certificates' };
    expect(lessonStatus(certs, someRight, withRoot).done).toBe(false);
    const allRight = { practiced: [], correct: certs.quiz.map((q) => q.id), current: 'certificates' };
    expect(lessonStatus(certs, allRight, withRoot).done).toBe(true);
  });
});

describe('shuffle', () => {
  it('returns a permutation and leaves the input untouched', async () => {
    const { shuffle } = await import('../../src/learn/shuffle.ts');
    const input = [0, 1, 2, 3, 4];
    const out = shuffle(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([0, 1, 2, 3, 4]);
  });

  it('puts a three-option question’s correct answer in every position, roughly equally', async () => {
    const { shuffle } = await import('../../src/learn/shuffle.ts');
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[shuffle([0, 1, 2]).indexOf(0)]! += 1;
    for (const c of counts) expect(c).toBeGreaterThan(850); // expected 1000 each
  });

  it('is deterministic with an injected random source', async () => {
    const { shuffle } = await import('../../src/learn/shuffle.ts');
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });
});
