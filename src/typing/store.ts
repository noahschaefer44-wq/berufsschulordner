// Lokaler Speicher des Tipptrainings (nur im Browser, Schlüssel „tp.v1“).
import { useSyncExternalStore } from 'react';
import { DEFAULT_DECKS } from './data';

export interface Settings {
  theme: 'dunkel' | 'terminal' | 'papier' | 'neon' | 'eigen';
  accent: string; bg: string; fg: string;
  font: 'mono' | 'jetbrains' | 'sans' | 'serif' | 'schreibmaschine' | 'hand';
  size: number;
  cursor: 'block' | 'linie' | 'unterstrich';
  sound: 'aus' | 'mechanisch' | 'schreibmaschine' | 'weich';
  volume: number;
  confetti: boolean;
  layout: string;
  lang: 'de' | 'en';
  showKb: boolean;
  stopOnError: boolean;
  goalMin: number;
}
export const DEFAULT_SETTINGS: Settings = {
  theme: 'dunkel', accent: '#4fb07a', bg: '#101216', fg: '#e8eaed', font: 'jetbrains', size: 26, cursor: 'block',
  sound: 'weich', volume: 0.5, confetti: true, layout: 'qwertz', lang: 'de', showKb: true, stopOnError: false, goalMin: 10,
};

export interface Run { t: number; mode: string; wpm: number; raw: number; acc: number; chars: number; secs: number; errs: number }
export interface KeyStat { n: number; e: number; ms: number; c: number }
export interface Card { id: string; q: string; a: string; box: number; due: number }
export interface Deck { id: string; name: string; cards: Card[] }
export interface TextItem { id: string; title: string; body: string }
export interface WordList { id: string; name: string; words: string }

export interface TypingData {
  v: 1;
  settings: Settings;
  runs: Run[];
  keys: Record<string, KeyStat>;
  pairs: Record<string, KeyStat>;
  lessons: Record<string, { wpm: number; acc: number; stars: number; n: number }>;
  xp: number;
  days: Record<string, number>;
  badges: string[];
  texts: TextItem[];
  lists: WordList[];
  decks: Deck[];
  best: Record<string, number>;
  arcade: number;
}

const KEY = 'tp.v1';
const uid = () => Math.random().toString(36).slice(2, 10);
export const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE');

function fresh(): TypingData {
  return {
    v: 1, settings: { ...DEFAULT_SETTINGS }, runs: [], keys: {}, pairs: {}, lessons: {}, xp: 0, days: {}, badges: [], texts: [], lists: [],
    decks: DEFAULT_DECKS.map((d) => ({ id: uid(), name: d.name, cards: d.cards.map((c) => ({ id: uid(), q: c.q, a: c.a, box: 0, due: 0 })) })),
    best: {}, arcade: 0,
  };
}

function load(): TypingData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<TypingData>;
      const f = fresh();
      return { ...f, ...d, settings: { ...f.settings, ...(d.settings ?? {}) } } as TypingData;
    }
  } catch { /* leer */ }
  return fresh();
}

let data: TypingData = load();
const subs = new Set<() => void>();
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* voll */ }
}
export function update(fn: (d: TypingData) => void) {
  const next = { ...data };
  fn(next);
  data = next;
  persist();
  subs.forEach((s) => s());
}
export function replaceAll(d: TypingData) {
  data = { ...fresh(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
  persist();
  subs.forEach((s) => s());
}
export function resetAll() { replaceAll(fresh()); }
export const getData = () => data;
export function useData(): TypingData {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => data);
}
export const useSettings = () => useData().settings;
export const newId = uid;

// ───────── Auswertung ─────────

export const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 40)) + 1;
export const xpForLevel = (lv: number) => (lv - 1) * (lv - 1) * 40;

export interface BadgeDef { id: string; name: string; info: string; test: (d: TypingData) => boolean }
const streakOf = (d: TypingData) => {
  let n = 0;
  const t = new Date();
  for (;;) {
    if (d.days[dayKey(t.getTime())]) n++; else if (n > 0 || t.toDateString() !== new Date().toDateString()) break;
    t.setDate(t.getDate() - 1);
  }
  return n;
};
export const streak = streakOf;
const totalChars = (d: TypingData) => d.runs.reduce((a, r) => a + r.chars, 0);
const bestWpm = (d: TypingData) => d.runs.reduce((a, r) => Math.max(a, r.wpm), 0);
export const BADGES: BadgeDef[] = [
  { id: 'first', name: 'Erster Anschlag', info: 'Erste Übung abgeschlossen', test: (d) => d.runs.length >= 1 },
  { id: 'w30', name: '30 WPM', info: '30 Wörter pro Minute erreicht', test: (d) => bestWpm(d) >= 30 },
  { id: 'w50', name: '50 WPM', info: '50 Wörter pro Minute erreicht', test: (d) => bestWpm(d) >= 50 },
  { id: 'w80', name: '80 WPM', info: '80 Wörter pro Minute erreicht', test: (d) => bestWpm(d) >= 80 },
  { id: 'w100', name: '100 WPM', info: '100 Wörter pro Minute erreicht', test: (d) => bestWpm(d) >= 100 },
  { id: 'clean', name: 'Makellos', info: '100 % Genauigkeit bei mind. 30 Zeichen', test: (d) => d.runs.some((r) => r.acc >= 100 && r.chars >= 30) },
  { id: 'runs50', name: 'Dranbleiber', info: '50 Übungen abgeschlossen', test: (d) => d.runs.length >= 50 },
  { id: 'c1k', name: '1.000 Zeichen', info: 'Insgesamt 1.000 Zeichen getippt', test: (d) => totalChars(d) >= 1000 },
  { id: 'c10k', name: '10.000 Zeichen', info: 'Insgesamt 10.000 Zeichen getippt', test: (d) => totalChars(d) >= 10000 },
  { id: 'c100k', name: '100.000 Zeichen', info: 'Insgesamt 100.000 Zeichen getippt', test: (d) => totalChars(d) >= 100000 },
  { id: 'streak3', name: '3 Tage in Folge', info: 'Drei Tage hintereinander geübt', test: (d) => streakOf(d) >= 3 },
  { id: 'streak7', name: 'Wochenserie', info: 'Sieben Tage hintereinander geübt', test: (d) => streakOf(d) >= 7 },
  { id: 'home', name: 'Grundreihe sitzt', info: 'Alle fünf Lektionen der Grundreihe geschafft', test: (d) => [1, 2, 3, 4, 5].every((i) => d.lessons[`home-${i}`]) },
  { id: 'school', name: 'Schreibschule komplett', info: 'Alle Lektionen mindestens einmal geschafft', test: (d) => ['home', 'top', 'bot'].every((r) => [1, 2, 3, 4, 5].every((i) => d.lessons[`${r}-${i}`])) && !!d.lessons['saetze'] },
  { id: 'hard', name: 'Nervenstärke', info: 'Hardcore-Übung ohne Fehler beendet', test: (d) => d.runs.some((r) => r.mode.includes('hardcore') && r.errs === 0 && r.chars >= 40) },
  { id: 'arcade', name: 'Wortjäger', info: '50 Punkte im Arcade-Modus', test: (d) => d.arcade >= 50 },
  { id: 'night', name: 'Nachteule', info: 'Nach 22 Uhr geübt', test: (d) => d.runs.some((r) => new Date(r.t).getHours() >= 22) },
];

export interface RunResult { wpm: number; raw: number; acc: number; secs: number; chars: number; errs: number; series: number[] }

/** Trägt ein Ergebnis ein, vergibt XP und Abzeichen. Gibt neue Abzeichen zurück. */
export function recordRun(mode: string, r: RunResult): string[] {
  let gained: string[] = [];
  update((d) => {
    d.runs = [...d.runs, { t: Date.now(), mode, wpm: r.wpm, raw: r.raw, acc: r.acc, chars: r.chars, secs: Math.round(r.secs), errs: r.errs }].slice(-600);
    d.xp = d.xp + Math.round(r.chars * (0.5 + r.acc / 200));
    d.days = { ...d.days, [dayKey()]: (d.days[dayKey()] ?? 0) + r.secs };
    const top = mode.split(':')[0];
    if (r.acc >= 90) d.best = { ...d.best, [top]: Math.max(d.best[top] ?? 0, r.wpm) };
    const have = new Set(d.badges);
    const got = BADGES.filter((b) => !have.has(b.id) && b.test(d)).map((b) => b.id);
    gained = got;
    d.badges = [...d.badges, ...got];
  });
  return gained;
}

export function addKeyStat(map: 'keys' | 'pairs', k: string, ok: boolean, ms: number) {
  const d = data;
  const cur = d[map][k] ?? { n: 0, e: 0, ms: 0, c: 0 };
  cur.n++;
  if (!ok) cur.e++;
  else if (ms > 0 && ms < 3000) { cur.ms += ms; cur.c++; }
  d[map][k] = cur;
}
export function flushStats() { data = { ...data }; persist(); subs.forEach((s) => s()); }
