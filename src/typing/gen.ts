// Erzeugt Übungstexte für alle Modi.
import { QUOTES, SENTENCES_DE, SENTENCES_EN, SNIPPETS, WORDS_CODE, WORDS_DE, WORDS_EN, WORDS_FACH } from './data';
import type { TypingLesson } from './layouts';
import type { KeyStat, WordList } from './store';

export const rnd = (n: number) => Math.floor(Math.random() * n);
export const pick = <T,>(a: T[]): T => a[rnd(a.length)];
export function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
export const pool = (lang: 'de' | 'en') => (lang === 'de' ? WORDS_DE : WORDS_EN);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** n Wörter aus einer Liste, ohne direkte Wiederholung. */
export function words(list: string[], n: number): string {
  const out: string[] = [];
  let last = '';
  while (out.length < n) {
    const x = pick(list);
    if (x !== last || list.length < 2) { out.push(x); last = x; }
  }
  return out.join(' ');
}

function drillGroup(chars: string, fresh: string): string {
  const src = fresh && Math.random() < 0.65 ? fresh : chars;
  const len = 2 + rnd(4);
  let s = '';
  for (let i = 0; i < len; i++) s += src[rnd(src.length)];
  return s;
}

function numberText(n: number, extra = ''): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const len = 2 + rnd(5);
    let s = '';
    for (let k = 0; k < len; k++) s += '0123456789'[rnd(10)];
    out.push(extra && Math.random() < 0.25 ? s + extra[rnd(extra.length)] : s);
  }
  return out.join(' ');
}

function calcText(n: number): string {
  const ops = ['+', '-', '*', '/'];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = 1 + rnd(99), b = 1 + rnd(99), op = pick(ops);
    const r = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : Math.round((a / b) * 100) / 100;
    out.push(`${a}${op}${b}=${String(r).replace('.', ',')}`);
  }
  return out.join(' ');
}

const SPECIAL = [
  'max@mail.de', 'info@firma.com', '100 € / 50 %', 'a&b=c+d', '#tag', '{ name: "x" }', '[1, 2, 3]', 'preis=19,99€', 'x+y=z', 'user@web.net',
  '50%', 'A&B', 'q@e.de', '(a+b)*c', 'size=[10]', '{a}{b}', '5€+3€=8€', '#1 & #2',
];
const PUNCT = [
  '"Hallo!" (Wie geht\'s?)', 'Ja, nein; vielleicht: später.', 'Wirklich? Ja! Gut.', '(eins) (zwei) (drei)', '"Ja", sagte er; "nein", sagte sie.',
  'Liste: Brot, Milch, Käse.', 'Achtung! Bitte warten...', '(siehe oben): gut, besser, am besten.',
];

export function lessonText(l: TypingLesson, lang: 'de' | 'en', size = 36): string {
  switch (l.kind) {
    case 'keys': {
      const set = new Set(l.chars.split(''));
      const real = [...WORDS_DE, ...WORDS_EN].filter((x) => x.length >= 2 && x === x.toLowerCase() && x.split('').every((c) => set.has(c)));
      const withFresh = real.filter((x) => l.fresh.split('').some((c) => x.includes(c)));
      const out: string[] = [];
      let guard = 0;
      while (out.length < size && guard++ < 500) {
        const useReal = withFresh.length >= 4 && Math.random() < 0.55;
        out.push(useReal ? pick(withFresh) : drillGroup(l.chars, l.fresh));
      }
      return out.join(' ');
    }
    case 'caps': return Array.from({ length: size / 2 }, () => cap(pick(WORDS_DE).toLowerCase())).join(' ');
    case 'umlaut': {
      const list = WORDS_DE.filter((x) => /[äöüßÄÖÜ]/.test(x));
      return words(list, size / 2);
    }
    case 'nums': return numberText(size / 2);
    case 'punct': return Array.from({ length: 8 }, () => pick(PUNCT)).join(' ');
    case 'special': return Array.from({ length: 12 }, () => pick(SPECIAL)).join(' ');
    case 'sentences': return shuffle(lang === 'de' ? SENTENCES_DE : SENTENCES_EN).slice(0, 4).join(' ');
    case 'numpad': return calcText(12);
  }
}

export interface SourceOpt { id: string; name: string }
export const SOURCES: SourceOpt[] = [
  { id: 'woerter', name: 'Häufige Wörter' }, { id: 'gross', name: 'Wörter mit Großbuchstaben' }, { id: 'saetze', name: 'Sätze' },
  { id: 'zitate', name: 'Zitate' }, { id: 'fach', name: 'Fachbegriffe (Beruf)' }, { id: 'zahlen', name: 'Zahlen & Rechnen' },
  { id: 'satzzeichen', name: 'Satzzeichen & Sonderzeichen' }, { id: 'code', name: 'Code-Begriffe' }, { id: 'mix', name: 'Alles gemischt' },
];

export function sourceText(src: string, lang: 'de' | 'en', n: number, lists: WordList[]): string {
  if (src.startsWith('liste:')) {
    const l = lists.find((x) => x.id === src.slice(6));
    const ws = (l?.words ?? '').split(/\s+/).filter(Boolean);
    if (ws.length) return words(ws, n);
  }
  switch (src) {
    case 'gross': return Array.from({ length: n }, () => cap(pick(pool(lang)))).join(' ');
    case 'saetze': return shuffle(lang === 'de' ? SENTENCES_DE : SENTENCES_EN).join(' ');
    case 'zitate': return shuffle(QUOTES).map((q) => q.text).join(' ');
    case 'fach': return words(WORDS_FACH, n);
    case 'zahlen': return Math.random() < 0.6 ? numberText(n, ',.') : calcText(n / 2);
    case 'satzzeichen': return shuffle([...PUNCT, ...SPECIAL]).join(' ');
    case 'code': return words(WORDS_CODE, n);
    case 'mix': return Array.from({ length: n }, () => (Math.random() < 0.15 ? numberText(1) : Math.random() < 0.15 ? cap(pick(pool(lang))) : pick(pool(lang)))).join(' ');
    default: return words(pool(lang), n);
  }
}

export function randomSnippet(lang?: string) {
  const list = lang ? SNIPPETS.filter((s) => s.lang === lang) : SNIPPETS;
  return pick(list.length ? list : SNIPPETS);
}

/** Schwächste Tasten: hohe Fehlerquote und langsame Anschläge. */
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

export function weakText(keys: Record<string, KeyStat>, lang: 'de' | 'en', n = 40): { text: string; weak: string[] } {
  const weak = weakKeys(keys).map((w) => w.ch);
  if (!weak.length) return { text: words(pool(lang), n), weak: [] };
  const all = [...WORDS_DE, ...WORDS_EN, ...WORDS_FACH];
  const scored = all.map((x) => ({ x, s: weak.reduce((a, c) => a + (x.toLowerCase().split(c.toLowerCase()).length - 1), 0) })).filter((o) => o.s > 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (scored.length >= 5 && Math.random() < 0.8) out.push(pick(scored.sort(() => Math.random() - 0.5).slice(0, 25)).x);
    else out.push(drillGroup(weak.join(''), weak.join('')));
  }
  return { text: out.join(' '), weak };
}

/** Tastenpaare (Bigramme) mit den meisten Fehlern. */
export function weakPairs(pairs: Record<string, KeyStat>, count = 8) {
  return Object.entries(pairs)
    .filter(([, s]) => s.n >= 4 && s.e / s.n > 0.12)
    .sort((a, b) => b[1].e / b[1].n - a[1].e / a[1].n)
    .slice(0, count)
    .map(([k, s]) => ({ pair: k, rate: s.e / s.n }));
}

/** Tagestext: pro Datum immer derselbe, damit Bestzeiten vergleichbar sind. */
export function dailyText(lang: 'de' | 'en'): string {
  let seed = 0;
  for (const c of new Date().toLocaleDateString('sv-SE')) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const list = lang === 'de' ? WORDS_DE : WORDS_EN;
  const out: string[] = [];
  for (let i = 0; i < 40; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; out.push(list[seed % list.length]); }
  return out.join(' ');
}
