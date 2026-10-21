// Kniffel: Wertung, Würfel-Wahrscheinlichkeiten und KI. Varianten Kniffel (5 Würfel) und Maxi-Kniffel (6 Würfel).
import { type Rng } from '../shared/rng';

export type CatId =
  | 'n1' | 'n2' | 'n3' | 'n4' | 'n5' | 'n6'
  | 'pair' | 'two_pairs' | 'three_pairs' | 'three' | 'four' | 'five'
  | 'fh' | 'villa' | 'tower' | 'ss' | 'ls' | 'fs' | 'chance' | 'kniffel';

export interface Cat { id: CatId; name: string; info: string; upper: boolean }
export interface Variant {
  id: 'classic' | 'maxi';
  name: string;
  info: string;
  dice: number;
  cats: CatId[];
  bonusNeed: number;
  bonusPts: number;
  /** Kniffel-Bonus (zusätzliche Kniffel) und Joker-Regel */
  yzBonus: number;
}

export const CATS: Record<CatId, Cat> = {
  n1: { id: 'n1', name: 'Einser', info: 'Summe aller Einser', upper: true },
  n2: { id: 'n2', name: 'Zweier', info: 'Summe aller Zweier', upper: true },
  n3: { id: 'n3', name: 'Dreier', info: 'Summe aller Dreier', upper: true },
  n4: { id: 'n4', name: 'Vierer', info: 'Summe aller Vierer', upper: true },
  n5: { id: 'n5', name: 'Fünfer', info: 'Summe aller Fünfer', upper: true },
  n6: { id: 'n6', name: 'Sechser', info: 'Summe aller Sechser', upper: true },
  pair: { id: 'pair', name: 'Ein Paar', info: 'Summe des höchsten Paares', upper: false },
  two_pairs: { id: 'two_pairs', name: 'Zwei Paare', info: 'Summe zweier verschiedener Paare', upper: false },
  three_pairs: { id: 'three_pairs', name: 'Drei Paare', info: 'Summe dreier verschiedener Paare', upper: false },
  three: { id: 'three', name: 'Dreierpasch', info: 'Mindestens drei gleiche – Summe aller Würfel (Kniffel) bzw. der drei Gleichen (Maxi)', upper: false },
  four: { id: 'four', name: 'Viererpasch', info: 'Mindestens vier gleiche – Summe aller Würfel (Kniffel) bzw. der vier Gleichen (Maxi)', upper: false },
  five: { id: 'five', name: 'Fünferpasch', info: 'Mindestens fünf gleiche – Summe der fünf Gleichen', upper: false },
  fh: { id: 'fh', name: 'Full House', info: 'Drei gleiche und zwei gleiche', upper: false },
  villa: { id: 'villa', name: 'Villa', info: 'Zweimal drei gleiche (Summe aller Würfel)', upper: false },
  tower: { id: 'tower', name: 'Turm', info: 'Vier gleiche und zwei gleiche (Summe aller Würfel)', upper: false },
  ss: { id: 'ss', name: 'Kleine Straße', info: 'Vier (Kniffel) bzw. fünf (Maxi) aufeinanderfolgende Zahlen', upper: false },
  ls: { id: 'ls', name: 'Große Straße', info: 'Fünf (Kniffel) bzw. fünf höhere (Maxi) aufeinanderfolgende Zahlen', upper: false },
  fs: { id: 'fs', name: 'Volle Straße', info: '1 bis 6', upper: false },
  chance: { id: 'chance', name: 'Chance', info: 'Summe aller Würfel', upper: false },
  kniffel: { id: 'kniffel', name: 'Kniffel', info: 'Alle Würfel gleich', upper: false },
};

export const VARIANTS: Variant[] = [
  {
    id: 'classic', name: 'Kniffel', info: 'Fünf Würfel, 13 Felder, Bonus ab 63 Punkten im oberen Block.', dice: 5,
    cats: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'three', 'four', 'fh', 'ss', 'ls', 'kniffel', 'chance'], bonusNeed: 63, bonusPts: 35, yzBonus: 100,
  },
  {
    id: 'maxi', name: 'Maxi-Kniffel', info: 'Sechs Würfel, 20 Felder: Paare, Villa, Turm, volle Straße und der Maxi-Kniffel mit 100 Punkten.', dice: 6,
    cats: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'pair', 'two_pairs', 'three_pairs', 'three', 'four', 'five', 'ss', 'ls', 'fs', 'fh', 'villa', 'tower', 'chance', 'kniffel'], bonusNeed: 84, bonusPts: 50, yzBonus: 0,
  },
];

export interface Card { s: Partial<Record<CatId, number>>; bonusYz: number }
export const emptyCard = (): Card => ({ s: {}, bonusYz: 0 });
export const sum = (d: number[]) => d.reduce((a, b) => a + b, 0);
const counts = (d: number[]) => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const x of d) c[x]++; return c; };

export const isKniffel = (d: number[]) => d.length > 0 && d.every((x) => x === d[0]);

/** Punkte der Würfel im Feld (ohne Joker). */
export function scoreCat(v: Variant, cat: CatId, d: number[]): number {
  const c = counts(d);
  const n = d.length;
  const faces = [6, 5, 4, 3, 2, 1];
  switch (cat) {
    case 'n1': case 'n2': case 'n3': case 'n4': case 'n5': case 'n6': { const f = +cat[1]; return c[f] * f; }
    case 'pair': { for (const f of faces) if (c[f] >= 2) return f * 2; return 0; }
    case 'two_pairs': { const ps = faces.filter((f) => c[f] >= 2); return ps.length >= 2 ? (ps[0] + ps[1]) * 2 : 0; }
    case 'three_pairs': { const ps = faces.filter((f) => c[f] >= 2); return ps.length >= 3 ? (ps[0] + ps[1] + ps[2]) * 2 : 0; }
    case 'three': { for (const f of faces) if (c[f] >= 3) return v.id === 'classic' ? sum(d) : f * 3; return 0; }
    case 'four': { for (const f of faces) if (c[f] >= 4) return v.id === 'classic' ? sum(d) : f * 4; return 0; }
    case 'five': { for (const f of faces) if (c[f] >= 5) return f * 5; return 0; }
    case 'fh': {
      if (v.id === 'classic') return faces.some((f) => c[f] === 3) && faces.some((f) => c[f] === 2) ? 25 : 0;
      // Maxi: drei gleiche und zwei gleiche (anderer Wert), Summe dieser fünf
      for (const a of faces) if (c[a] >= 3) for (const b of faces) if (b !== a && c[b] >= 2) return a * 3 + b * 2;
      return 0;
    }
    case 'villa': { const t = faces.filter((f) => c[f] >= 3); return t.length >= 2 ? (t[0] + t[1]) * 3 : 0; }
    case 'tower': { for (const a of faces) if (c[a] >= 4) for (const b of faces) if (b !== a && c[b] >= 2) return a * 4 + b * 2; return 0; }
    case 'ss': {
      if (v.id === 'classic') return [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]].some((r) => r.every((x) => c[x] > 0)) ? 30 : 0;
      return [1, 2, 3, 4, 5].every((x) => c[x] > 0) ? 15 : 0;
    }
    case 'ls': {
      if (v.id === 'classic') return [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]].some((r) => r.every((x) => c[x] > 0)) ? 40 : 0;
      return [2, 3, 4, 5, 6].every((x) => c[x] > 0) ? 20 : 0;
    }
    case 'fs': return [1, 2, 3, 4, 5, 6].every((x) => c[x] > 0) && n >= 6 ? 30 : 0;
    case 'chance': return sum(d);
    case 'kniffel': return isKniffel(d) ? (v.id === 'classic' ? 50 : 100) : 0;
  }
}

export const openCats = (v: Variant, card: Card): CatId[] => v.cats.filter((c) => card.s[c] === undefined);

/** Joker-Regel (Kniffel): nach einem 50-Punkte-Kniffel zählt ein weiterer Kniffel als Joker. */
export function jokerActive(v: Variant, card: Card, d: number[]): boolean {
  return v.id === 'classic' && isKniffel(d) && card.s.kniffel === 50;
}

/** Felder, die für diese Würfel erlaubt sind (mit erzwungener Joker-Regel). */
export function legalCats(v: Variant, card: Card, d: number[]): CatId[] {
  const open = openCats(v, card);
  if (!jokerActive(v, card, d)) return open;
  const upper = (`n${d[0]}`) as CatId;
  if (open.includes(upper)) return [upper];
  const lower = open.filter((c) => !CATS[c].upper);
  return lower.length ? lower : open;
}

/** Punkte, die dieses Feld mit diesen Würfeln bringt (Joker eingerechnet). */
export function cellScore(v: Variant, card: Card, cat: CatId, d: number[]): number {
  if (jokerActive(v, card, d)) {
    if (cat === 'fh') return 25;
    if (cat === 'ss') return 30;
    if (cat === 'ls') return 40;
  }
  return scoreCat(v, cat, d);
}

export function totals(v: Variant, card: Card) {
  let upper = 0, lower = 0;
  for (const c of v.cats) { const x = card.s[c]; if (x === undefined) continue; if (CATS[c].upper) upper += x; else lower += x; }
  const bonus = upper >= v.bonusNeed ? v.bonusPts : 0;
  const yz = card.bonusYz * v.yzBonus;
  return { upper, bonus, lower, yz, total: upper + bonus + lower + yz };
}

export const gameOver = (v: Variant, card: Card) => openCats(v, card).length === 0;

/** Trägt Würfel in ein Feld ein; liefert die neue Karte (Kniffel-Bonus eingerechnet). */
export function fill(v: Variant, card: Card, cat: CatId, d: number[]): Card {
  const s = { ...card.s, [cat]: cellScore(v, card, cat, d) };
  const bonusYz = card.bonusYz + (v.yzBonus > 0 && isKniffel(d) && card.s.kniffel === 50 ? 1 : 0);
  return { s, bonusYz };
}

// ───────── Würfeln ─────────

export const rollDie = (rnd: Rng) => 1 + Math.floor(rnd() * 6);
export const rollDice = (rnd: Rng, n: number) => Array.from({ length: n }, () => rollDie(rnd));

// ───────── Wahrscheinlichkeiten (Multimengen) ─────────

interface Table {
  n: number;
  states: number[][];
  index: Map<number, number>;
  roll: { key: number[]; prob: number }[][];
  trans: Map<number, [number, number][]>;
}
const tables = new Map<number, Table>();
const keyOf = (sorted: number[]) => sorted.reduce((a, b) => a * 7 + b, 0);

function table(n: number): Table {
  const hit = tables.get(n);
  if (hit) return hit;
  const states: number[][] = [];
  const gen = (cur: number[], from: number) => { if (cur.length === n) { states.push(cur.slice()); return; } for (let f = from; f <= 6; f++) { cur.push(f); gen(cur, f); cur.pop(); } };
  gen([], 1);
  const index = new Map<number, number>();
  states.forEach((s, i) => index.set(keyOf(s), i));
  // Verteilung von k geworfenen Würfeln
  const roll: { key: number[]; prob: number }[][] = [];
  for (let k = 0; k <= n; k++) {
    const m = new Map<number, { key: number[]; cnt: number }>();
    const rec = (cur: number[]) => {
      if (cur.length === k) { const s = cur.slice().sort((a, b) => a - b); const kk = keyOf(s); const e = m.get(kk); if (e) e.cnt++; else m.set(kk, { key: s, cnt: 1 }); return; }
      for (let f = 1; f <= 6; f++) { cur.push(f); rec(cur); cur.pop(); }
    };
    rec([]);
    const tot = Math.pow(6, k);
    roll.push([...m.values()].map((e) => ({ key: e.key, prob: e.cnt / tot })));
  }
  const t: Table = { n, states, index, roll, trans: new Map() };
  tables.set(n, t);
  return t;
}

/** Verteilung der nächsten Zustände, wenn die Würfel `held` (sortiert) behalten und der Rest geworfen wird. */
function transitions(t: Table, held: number[]): [number, number][] {
  const hk = keyOf(held) * 8 + held.length;
  const hit = t.trans.get(hk);
  if (hit) return hit;
  const out: [number, number][] = [];
  for (const r of t.roll[t.n - held.length]) {
    const merged = held.concat(r.key).sort((a, b) => a - b);
    out.push([t.index.get(keyOf(merged))!, r.prob]);
  }
  t.trans.set(hk, out);
  return out;
}

/** Alle verschiedenen Halte-Mengen (Teilmengen) eines sortierten Zustands. */
function holdsOf(state: number[]): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  const n = state.length;
  for (let m = 0; m < 1 << n; m++) {
    const h: number[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) h.push(state[i]);
    const k = keyOf(h) * 8 + h.length;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

const holdCache = new Map<number, number[][][]>();
function allHolds(t: Table): number[][][] {
  let hit = holdCache.get(t.n);
  if (!hit) { hit = t.states.map((s) => holdsOf(s)); holdCache.set(t.n, hit); }
  return hit;
}

// ───────── Bewertungsmaß für Entscheidungen ─────────

/** Durchschnittliche Punktzahl je Feld bei gutem Spiel (Opportunitätskosten) – Kniffel nach der Literatur. */
const BASE_CLASSIC: Partial<Record<CatId, number>> = { n1: 2.1, n2: 5.3, n3: 8.6, n4: 12.2, n5: 15.7, n6: 19.2, three: 21.7, four: 13.1, fh: 22.6, ss: 29.5, ls: 32.7, kniffel: 16.9, chance: 22.0 };

const baseCache = new Map<string, Partial<Record<CatId, number>>>();
/** Erwartung eines einzelnen Feldes bei drei Würfen, wenn man nur dieses anstrebt (für Maxi-Basiswerte). */
function singleCatEV(v: Variant, cat: CatId): number {
  const t = table(v.dice);
  const holds = allHolds(t);
  const v0 = t.states.map((s) => scoreCat(v, cat, s));
  let cur = v0;
  for (let r = 0; r < 2; r++) {
    const next = new Array(t.states.length).fill(0);
    for (let i = 0; i < t.states.length; i++) {
      let best = cur[i]; // nicht weiterwürfeln: Wert dieses Feldes jetzt wäre v0; hier cur als Stufe
      for (const h of holds[i]) { let e = 0; for (const [j, p] of transitions(t, h)) e += cur[j] * p; if (e > best) best = e; }
      next[i] = best;
    }
    cur = next;
  }
  // Erwartung nach dem ersten Wurf aller Würfel
  let e = 0;
  for (const [j, p] of transitions(t, [])) e += cur[j] * p;
  return e;
}

export function baseline(v: Variant): Partial<Record<CatId, number>> {
  if (v.id === 'classic') return BASE_CLASSIC;
  let b = baseCache.get(v.id);
  if (!b) {
    b = {};
    for (const c of v.cats) b[c] = Math.round(singleCatEV(v, c) * 0.78 * 10) / 10;
    baseCache.set(v.id, b);
  }
  return b;
}

/** Wert (in Punkten), den das Eintragen von `s` Punkten in `cat` gegenüber dem üblichen Ergebnis bringt. */
function gain(v: Variant, cat: CatId, s: number): number {
  const b = baseline(v)[cat] ?? 0;
  let g = s - b;
  if (CATS[cat].upper) {
    const f = +cat[1];
    const par = (v.bonusNeed / 21) * f; // Soll für den Bonus: 3 je Zahl (Kniffel) bzw. 4 je Zahl (Maxi)
    g += (s - par) * (v.bonusPts / v.bonusNeed) * 0.92;
  }
  return g;
}

export interface Analysis {
  /** je Halte-Menge der Erwartungswert (relativ), absteigend */
  holds: { hold: number[]; ev: number }[];
  /** je Feld Punkte und Wert, absteigend nach Wert */
  cats: { cat: CatId; score: number; value: number }[];
}

/** Wert eines Zustands bei `rolls` verbleibenden Würfen (Karte `card` bestimmt die offenen Felder). */
function values(v: Variant, card: Card, rolls: number): number[][] {
  const t = table(v.dice);
  const holds = allHolds(t);
  const open = openCats(v, card);
  const v0 = t.states.map((s) => {
    const cats = jokerActive(v, card, s) ? legalCats(v, card, s) : open;
    let best = -Infinity;
    for (const c of cats) { const g = gain(v, c, cellScore(v, card, c, s)); if (g > best) best = g; }
    return best;
  });
  const levels = [v0];
  for (let r = 1; r <= rolls; r++) {
    const prev = levels[r - 1];
    const cur = new Array(t.states.length);
    for (let i = 0; i < t.states.length; i++) {
      let best = prev[i]; // jetzt eintragen (ohne weiter zu werfen)
      for (const h of holds[i]) { let e = 0; for (const [j, p] of transitions(t, h)) e += prev[j] * p; if (e > best) best = e; }
      cur[i] = best;
    }
    levels.push(cur);
  }
  return levels;
}

export function analyze(v: Variant, card: Card, dice: number[], rollsLeft: number): Analysis {
  const t = table(v.dice);
  const sorted = dice.slice().sort((a, b) => a - b);
  const si = t.index.get(keyOf(sorted))!;
  const lv = values(v, card, Math.max(0, rollsLeft));
  const cats = (jokerActive(v, card, sorted) ? legalCats(v, card, sorted) : openCats(v, card)).map((c) => {
    const score = cellScore(v, card, c, sorted);
    return { cat: c, score, value: gain(v, c, score) };
  }).sort((a, b) => b.value - a.value);
  const holds: Analysis['holds'] = [];
  if (rollsLeft > 0) {
    const prev = lv[rollsLeft - 1];
    for (const h of allHolds(t)[si]) {
      let e = 0;
      for (const [j, p] of transitions(t, h)) e += prev[j] * p;
      holds.push({ hold: h, ev: e });
    }
    holds.sort((a, b) => b.ev - a.ev);
  }
  return { holds, cats };
}

/** Maske (über die Positionen in `dice`) für eine Halte-Menge; wählt die ersten passenden Würfel. */
export function maskFor(dice: number[], hold: number[]): boolean[] {
  const need = counts(hold);
  const mask = dice.map(() => false);
  dice.forEach((x, i) => { if (need[x] > 0) { need[x]--; mask[i] = true; } });
  return mask;
}

export const heldValues = (dice: number[], mask: boolean[]) => dice.filter((_, i) => mask[i]).sort((a, b) => a - b);

/** Erwartungswert einer Halte-Auswahl (aus Analyse, in relativen Punkten). */
export function evOfHold(a: Analysis, hold: number[]): number {
  const k = keyOf(hold) * 8 + hold.length;
  const h = a.holds.find((x) => keyOf(x.hold) * 8 + x.hold.length === k);
  return h ? h.ev : a.holds[a.holds.length - 1].ev;
}

// ───────── Chancen-Tabelle ─────────

export interface Chance { cat: CatId; kind: 'p' | 'ev'; value: number; now: number }

/** Wahrscheinlichkeit bzw. Erwartung je offenes Feld bei bestem Spiel für genau dieses Feld. */
export function chances(v: Variant, card: Card, dice: number[], rollsLeft: number): Chance[] {
  const t = table(v.dice);
  const holds = allHolds(t);
  const sorted = dice.slice().sort((a, b) => a - b);
  const si = t.index.get(keyOf(sorted))!;
  const out: Chance[] = [];
  for (const c of openCats(v, card)) {
    const threshold = !CATS[c].upper && c !== 'chance' && c !== 'pair' && c !== 'two_pairs' && c !== 'three_pairs';
    const f = (s: number[]) => (threshold ? (scoreCat(v, c, s) > 0 ? 1 : 0) : scoreCat(v, c, s));
    let cur = t.states.map((s) => f(s));
    for (let r = 1; r <= rollsLeft; r++) {
      const prev = cur;
      cur = t.states.map((_, i) => {
        let best = prev[i];
        for (const h of holds[i]) { let e = 0; for (const [j, p] of transitions(t, h)) e += prev[j] * p; if (e > best) best = e; }
        return best;
      });
    }
    out.push({ cat: c, kind: threshold ? 'p' : 'ev', value: cur[si], now: scoreCat(v, c, sorted) });
  }
  return out;
}

// ───────── KI ─────────

export interface Level { id: number; name: string; info: string }
export const LEVELS: Level[] = [
  { id: 1, name: 'Würfelanfänger', info: 'Behält Zufallswürfel und trägt meist das höchste Feld ein.' },
  { id: 2, name: 'Stammtisch', info: 'Behält die häufigste Augenzahl, trägt gierig ein.' },
  { id: 3, name: 'Kniffel-Veteran', info: 'Rechnet den letzten Wurf genau durch.' },
  { id: 4, name: 'Kniffel-Profi', info: 'Rechnet alle Würfe voraus und kennt die Felderwerte.' },
  { id: 5, name: 'Kniffel-Meister', info: 'Wie der Profi, ohne jeden Aussetzer.' },
];

function mostFrequentHold(dice: number[], rnd: Rng): boolean[] {
  const c = counts(dice);
  let best = 0, face = 6;
  for (let f = 6; f >= 1; f--) if (c[f] > best || (c[f] === best && rnd() < 0.3)) { best = c[f]; face = f; }
  return dice.map((x) => (best >= 2 ? x === face : x >= 5));
}

export interface Decision { hold: boolean[] | null; cat: CatId | null }

/** Entscheidung der KI: weiterwürfeln (hold) oder Feld wählen (cat). */
export function decide(v: Variant, card: Card, dice: number[], rollsLeft: number, level: number, rnd: Rng): Decision {
  const open = jokerActive(v, card, dice) ? legalCats(v, card, dice) : openCats(v, card);
  const bestByScore = () => open.map((c) => ({ c, s: cellScore(v, card, c, dice), g: gain(v, c, cellScore(v, card, c, dice)) }));
  if (level <= 2) {
    const sc = bestByScore();
    // Spät im Wurf: gieriges Eintragen, wenn ein gutes Feld erreicht ist
    const topScore = sc.reduce((m, x) => Math.max(m, level === 1 ? x.s : x.g), -Infinity);
    const goodEnough = (level === 1 ? topScore >= 20 : topScore >= 6) && rollsLeft < 3;
    if (rollsLeft === 0 || goodEnough || (rollsLeft < 3 && rnd() < 0.15)) {
      const list = sc.sort((a, b) => (level === 1 ? b.s - a.s : b.g - a.g));
      const pick = level === 1 && rnd() < 0.35 ? list[Math.min(list.length - 1, Math.floor(rnd() * 3))] : list[0];
      return { hold: null, cat: pick.c };
    }
    if (level === 1 && rnd() < 0.4) return { hold: dice.map(() => rnd() < 0.5), cat: null };
    return { hold: mostFrequentHold(dice, rnd), cat: null };
  }
  const a = analyze(v, card, dice, rollsLeft);
  const topCat = a.cats[0];
  if (rollsLeft === 0) {
    if (level === 4 && a.cats.length > 1 && rnd() < 0.06) return { hold: null, cat: a.cats[1].cat };
    return { hold: null, cat: topCat.cat };
  }
  if (level === 3 && rollsLeft >= 2) {
    // nur ein Wurf Vorausschau: Halten nach der häufigsten Augenzahl, dann exakt
    if (rnd() < 0.5) return { hold: mostFrequentHold(dice, rnd), cat: null };
  }
  const bestHold = a.holds[0];
  if (topCat.value >= bestHold.ev - 1e-9) return { hold: null, cat: topCat.cat };
  let pick = bestHold;
  if (level === 4 && a.holds.length > 1 && rnd() < 0.05) pick = a.holds[1];
  return { hold: maskFor(dice, pick.hold), cat: null };
}

export interface PlayedGame { card: Card; score: number; turns: number; kniffels: number }

/** Spielt ein Solo-Spiel durch (Test/Statistik). */
export function playSolo(v: Variant, level: number, rnd: Rng): PlayedGame {
  let card = emptyCard();
  let turns = 0, kn = 0;
  while (!gameOver(v, card)) {
    let dice = rollDice(rnd, v.dice);
    let rollsLeft = 2;
    for (;;) {
      const d = decide(v, card, dice, rollsLeft, level, rnd);
      if (d.cat) { if (isKniffel(dice)) kn++; card = fill(v, card, d.cat, dice); break; }
      const hold = d.hold!;
      dice = dice.map((x, i) => (hold[i] ? x : rollDie(rnd)));
      rollsLeft--;
    }
    turns++;
  }
  return { card, score: totals(v, card).total, turns, kniffels: kn };
}

// ───────── Aufgaben ─────────

export interface Puzzle {
  kind: 'hold' | 'cat';
  card: Card;
  dice: number[];
  rollsLeft: number;
  /** beste Halte-Menge bzw. bestes Feld */
  best: { hold?: number[]; cat?: CatId };
  /** Abstand zum Zweitbesten in Punkten */
  margin: number;
}

/** Zufallsstellung mit teilweise gefüllter Karte. */
export function makePuzzle(v: Variant, rnd: Rng, kind: 'hold' | 'cat', tries = 200): Puzzle | null {
  for (let t = 0; t < tries; t++) {
    let card = emptyCard();
    const fillN = 3 + Math.floor(rnd() * Math.max(1, v.cats.length - 6));
    for (let i = 0; i < fillN; i++) {
      const open = openCats(v, card);
      const dice = rollDice(rnd, v.dice);
      const c = open[Math.floor(rnd() * open.length)];
      card = fill(v, card, c, dice);
    }
    if (openCats(v, card).length < 3) continue;
    const dice = rollDice(rnd, v.dice);
    const rollsLeft = kind === 'hold' ? 1 + Math.floor(rnd() * 2) : 0;
    const a = analyze(v, card, dice, rollsLeft);
    if (kind === 'hold') {
      if (a.holds.length < 4) continue;
      const best = a.holds[0], second = a.holds[1];
      const margin = best.ev - second.ev;
      if (margin < 0.8 || margin > 20) continue;
      if (a.cats.length && a.cats[0].value > best.ev) continue; // Eintragen wäre besser – das ist eine andere Aufgabe
      return { kind, card, dice, rollsLeft, best: { hold: best.hold }, margin };
    }
    if (a.cats.length < 3) continue;
    const margin = a.cats[0].value - a.cats[1].value;
    if (margin < 1.5 || margin > 25) continue;
    return { kind, card, dice, rollsLeft, best: { cat: a.cats[0].cat }, margin };
  }
  return null;
}
