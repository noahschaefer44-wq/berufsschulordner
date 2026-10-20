// Erzeugt Übungstexte für alle Modi – immer zusammenhängende Sätze und Absätze.
import { ALL_TEXTS, POOLS, poolById } from './corpus';
import { QUOTES, SNIPPETS, WORDS_DE, WORDS_EN } from './data';
import type { TypingLesson } from './layouts';
import type { KeyStat } from './store';

export const rnd = (n: number) => Math.floor(Math.random() * n);
export const pick = <T,>(a: T[]): T => a[rnd(a.length)];
export function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
/** Wortliste nur für das Arcade-Spiel (fallende Wörter). */
export const pool = (lang: 'de' | 'en') => (lang === 'de' ? WORDS_DE : WORDS_EN);

/** Mischt Texte und hängt sie aneinander, bis mindestens `min` Zeichen erreicht sind. */
export function joinTexts(texts: string[], min: number): string {
  const out: string[] = [];
  let len = 0;
  let order = shuffle(texts);
  let i = 0;
  while (len < min && out.length < 60) {
    if (i >= order.length) { order = shuffle(texts); i = 0; }
    out.push(order[i++]);
    len += out[out.length - 1].length + 1;
  }
  return out.join(' ');
}

export function lessonText(l: TypingLesson): string {
  const texts = poolById(l.pool)?.texts ?? ALL_TEXTS;
  return shuffle(texts).slice(0, l.count).join(' ');
}

export interface SourceOpt { id: string; name: string }
export const SOURCES: SourceOpt[] = [...POOLS.map((p) => ({ id: p.id, name: p.name })), { id: 'zitate', name: 'Zitate' }, { id: 'mix', name: 'Alles gemischt' }];

export function sourceText(src: string, min: number): string {
  if (src === 'zitate') return joinTexts(QUOTES.map((q) => q.text), min);
  if (src === 'mix') return joinTexts(ALL_TEXTS, min);
  return joinTexts(poolById(src)?.texts ?? ALL_TEXTS, min);
}

export function randomSnippet(lang?: string) {
  const list = lang ? SNIPPETS.filter((s) => s.lang === lang) : SNIPPETS;
  return pick(list.length ? list : SNIPPETS);
}

/** Schwächste Tasten: hohe Fehlerquote und langsame Anschläge (nur zur Analyse). */
export function weakKeys(keys: Record<string, KeyStat>, count = 6): { ch: string; score: number; err: number; ms: number }[] {
  const rows = Object.entries(keys).filter(([k, s]) => k.length === 1 && k !== ' ' && s.n >= 4);
  if (!rows.length) return [];
  const avgs = rows.map(([, s]) => (s.c ? s.ms / s.c : 0)).filter(Boolean);
  const mean = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 300;
  return rows
    .map(([ch, s]) => {
      const err = s.e / s.n;
      const ms = s.c ? s.ms / s.c : mean;
      return { ch, score: err * 100 + Math.max(0, ms - mean) / 12, err, ms };
    })
    .filter((r) => r.score > 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

/** Tastenpaare (Bigramme) mit den meisten Fehlern. */
export function weakPairs(pairs: Record<string, KeyStat>, count = 8) {
  return Object.entries(pairs)
    .filter(([, s]) => s.n >= 4 && s.e / s.n > 0.12)
    .sort((a, b) => b[1].e / b[1].n - a[1].e / a[1].n)
    .slice(0, count)
    .map(([k, s]) => ({ pair: k, rate: s.e / s.n }));
}

/** Echte Texte, in denen deine schwächsten Buchstaben besonders oft vorkommen. */
export function weakText(keys: Record<string, KeyStat>, min = 260): { text: string; weak: string[] } {
  const weak = weakKeys(keys).map((w) => w.ch);
  if (!weak.length) return { text: joinTexts(ALL_TEXTS, min), weak: [] };
  const scored = ALL_TEXTS.map((t) => {
    const low = t.toLowerCase();
    const hits = weak.reduce((a, c) => a + (low.split(c).length - 1), 0);
    return { t, s: hits / Math.sqrt(t.length) };
  }).sort((a, b) => b.s - a.s);
  const top = scored.slice(0, 14).map((x) => x.t);
  return { text: joinTexts(top, min), weak };
}

/** Tagestext: pro Datum immer derselbe, damit Ergebnisse vergleichbar sind. */
export function dailyText(): string {
  let seed = 0;
  for (const c of new Date().toLocaleDateString('sv-SE')) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const out: string[] = [];
  for (let i = 0; i < 4; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; out.push(ALL_TEXTS[seed % ALL_TEXTS.length]); }
  return out.join(' ');
}
