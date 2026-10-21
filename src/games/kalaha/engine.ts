// Kalaha (Mancala): Samen säen, Extrazüge, Fangen. Varianten Kalah, Oware und Lawine.
import { type Rng } from '../shared/rng';

export type VariantId = 'kalah' | 'oware' | 'lawine';
export type Side = 0 | 1;

export interface Rules { v: VariantId; n: number; seeds: number }

export interface VariantInfo { id: VariantId; name: string; info: string }
export const VARIANTS: VariantInfo[] = [
  { id: 'kalah', name: 'Kalah', info: 'Die bekannteste Form: Landet der letzte Samen im eigenen Speicher, darfst du nochmal. Landet er in einer leeren eigenen Mulde, fängst du die gegenüberliegenden Samen.' },
  { id: 'oware', name: 'Oware', info: 'Ohne Speicher gesät: Wer im gegnerischen Feld eine Mulde mit zwei oder drei Samen vollmacht, nimmt sie – und alle davor. Gewonnen hat, wer mehr als die Hälfte erbeutet.' },
  { id: 'lawine', name: 'Lawine', info: 'Wie Kalah, aber landet der letzte Samen in einer vollen Mulde, wird sie aufgenommen und weitergesät – Ketten und Überraschungen.' },
];

export interface Pos {
  r: Rules;
  /** 0..n-1: Mulden von Spieler 0, n: Speicher 0, n+1..2n: Mulden von Spieler 1, 2n+1: Speicher 1 */
  b: number[];
  turn: Side;
  moves: number;
  over: boolean;
  /** Gesamtzahl der Samen (Oware: Siegschwelle) */
  total: number;
}

export const storeIdx = (n: number, p: Side) => (p === 0 ? n : 2 * n + 1);
export const pitIdx = (n: number, p: Side, i: number) => (p === 0 ? i : n + 1 + i);
export const sideOfIdx = (n: number, k: number): Side | -1 => (k < n ? 0 : k === n ? -1 : k < 2 * n + 1 ? 1 : -1);
export const oppositeIdx = (n: number, k: number) => 2 * n - k;
export const isStore = (n: number, k: number) => k === n || k === 2 * n + 1;

export function newPos(r: Rules): Pos {
  const b = new Array(2 * r.n + 2).fill(r.seeds);
  b[r.n] = 0; b[2 * r.n + 1] = 0;
  return { r, b, turn: 0, moves: 0, over: false, total: b.reduce((a, c) => a + c, 0) };
}
export const clone = (p: Pos): Pos => ({ r: p.r, b: p.b.slice(), turn: p.turn, moves: p.moves, over: p.over, total: p.total });

export const pitsSum = (p: Pos, s: Side) => { let t = 0; for (let i = 0; i < p.r.n; i++) t += p.b[pitIdx(p.r.n, s, i)]; return t; };
export const scores = (p: Pos): [number, number] => [p.b[p.r.n], p.b[2 * p.r.n + 1]];

export type Step =
  | { k: 'pick'; i: number; n: number }
  | { k: 'drop'; i: number }
  | { k: 'capture'; from: number[]; to: number; n: number }
  | { k: 'extra' }
  | { k: 'sweep'; moves: { from: number; to: number; n: number }[] };

export interface Played { pos: Pos; steps: Step[]; extra: boolean; captured: number; relays: number }

/** Alle Muldennummern (0..n-1 aus Sicht des Ziehenden), aus denen gesät werden darf. */
export function legalMoves(p: Pos): number[] {
  if (p.over) return [];
  const n = p.r.n, s = p.turn;
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (p.b[pitIdx(n, s, i)] > 0) out.push(i);
  if (p.r.v === 'oware' && pitsSum(p, (1 - s) as Side) === 0) {
    // Aushungern verboten: nur Züge, die dem Gegner Samen geben
    return out.filter((i) => pitsSum(sow(p, i).pos, (1 - s) as Side) > 0);
  }
  return out;
}

function finish(p: Pos, steps: Step[]) {
  const n = p.r.n;
  const sweepAll = () => {
    const mv: { from: number; to: number; n: number }[] = [];
    for (const s of [0, 1] as Side[]) for (let i = 0; i < n; i++) {
      const k = pitIdx(n, s, i);
      if (p.b[k] > 0) { mv.push({ from: k, to: storeIdx(n, s), n: p.b[k] }); p.b[storeIdx(n, s)] += p.b[k]; p.b[k] = 0; }
    }
    if (mv.length) steps.push({ k: 'sweep', moves: mv });
    p.over = true;
  };
  if (p.r.v === 'oware') {
    const total = p.total;
    const [a, b] = scores(p);
    if (a * 2 > total || b * 2 > total || (a * 2 === total && b * 2 === total)) { p.over = true; return; }
    if (p.moves >= 300) { sweepAll(); return; }
    // Spieler am Zug ohne Samen: Gegner nimmt seine Samen
    if (pitsSum(p, p.turn) === 0) { sweepAll(); return; }
    // Aushungern unvermeidbar: Zug nicht möglich
    if (legalMoves(p).length === 0) { sweepAll(); }
    return;
  }
  if (pitsSum(p, 0) === 0 || pitsSum(p, 1) === 0) sweepAll();
  else if (p.moves >= 500) sweepAll();
}

/** Aussaat ohne Spielende-Prüfung. */
function sow(p0: Pos, i: number): Played {
  const p = clone(p0);
  const { n, v } = p.r;
  const me = p.turn, opp = (1 - me) as Side;
  const size = 2 * n + 2;
  const myStore = storeIdx(n, me), oppStore = storeIdx(n, opp);
  const steps: Step[] = [];
  const start = pitIdx(n, me, i);
  let hand = p.b[start];
  p.b[start] = 0;
  steps.push({ k: 'pick', i: start, n: hand });
  let cur = start, extra = false, captured = 0, relays = 0;

  if (v === 'oware') {
    while (hand > 0) {
      cur = (cur + 1) % size;
      if (isStore(n, cur) || cur === start) continue;
      p.b[cur]++; hand--;
      steps.push({ k: 'drop', i: cur });
    }
    if (sideOfIdx(n, cur) === opp) {
      const take: number[] = [];
      let k = cur;
      while (k >= 0 && sideOfIdx(n, k) === opp && (p.b[k] === 2 || p.b[k] === 3)) { take.push(k); k--; }
      const sum = take.reduce((s, q) => s + p.b[q], 0);
      if (take.length && sum < pitsSum(p, opp)) {
        for (const q of take) p.b[q] = 0;
        p.b[myStore] += sum; captured = sum;
        steps.push({ k: 'capture', from: take, to: myStore, n: sum });
      }
    }
  } else {
    for (;;) {
      while (hand > 0) {
        cur = (cur + 1) % size;
        if (cur === oppStore) continue;
        p.b[cur]++; hand--;
        steps.push({ k: 'drop', i: cur });
      }
      if (cur === myStore) { extra = true; break; }
      if (v === 'lawine' && p.b[cur] > 1 && relays < 100) {
        relays++;
        hand = p.b[cur]; p.b[cur] = 0;
        steps.push({ k: 'pick', i: cur, n: hand });
        continue;
      }
      if (sideOfIdx(n, cur) === me && p.b[cur] === 1) {
        const o = oppositeIdx(n, cur);
        if (p.b[o] > 0) {
          const sum = p.b[o] + 1;
          p.b[myStore] += sum; captured = sum;
          steps.push({ k: 'capture', from: [cur, o], to: myStore, n: sum });
          p.b[cur] = 0; p.b[o] = 0;
        }
      }
      break;
    }
  }
  p.moves++;
  if (!extra) p.turn = opp;
  if (extra) steps.push({ k: 'extra' });
  return { pos: p, steps, extra, captured, relays };
}

/** Zug ausführen: Mulde `i` (0..n-1) des Spielers am Zug. */
export function play(p0: Pos, i: number): Played {
  const r = sow(p0, i);
  finish(r.pos, r.steps);
  if (r.pos.over) r.extra = false;
  return r;
}

export function winner(p: Pos): Side | 'draw' | null {
  if (!p.over) return null;
  const [a, b] = scores(p);
  return a > b ? 0 : b > a ? 1 : 'draw';
}

// ───────── Bewertung und Suche ─────────

const WIN = 1000;

function extraTurns(p: Pos, s: Side): number {
  // Mulden, deren Samenzahl genau in den eigenen Speicher reicht
  const n = p.r.n;
  let c = 0;
  const size = 2 * n + 1; // Zyklus ohne gegnerischen Speicher
  for (let i = 0; i < n; i++) {
    const cnt = p.b[pitIdx(n, s, i)];
    if (cnt > 0 && (cnt - (n - i)) % size === 0) c++;
  }
  return c;
}

/** Bewertung aus Sicht von `me` in Samen. */
export function evaluate(p: Pos, me: Side): number {
  const [a, b] = scores(p);
  const sm = me === 0 ? a : b, so = me === 0 ? b : a;
  if (p.over) return (sm - so) * 10 + (sm > so ? WIN : sm < so ? -WIN : 0);
  const opp = (1 - me) as Side;
  let s = (sm - so) * 10;
  if (p.r.v === 'oware') {
    s += (pitsSum(p, me) - pitsSum(p, opp)) * 1.2;
    // eigene Mulden mit 1–2 Samen sind gefährdet
    let weak = 0, weakO = 0;
    for (let i = 0; i < p.r.n; i++) { const x = p.b[pitIdx(p.r.n, me, i)], y = p.b[pitIdx(p.r.n, opp, i)]; if (x === 1 || x === 2) weak++; if (y === 1 || y === 2) weakO++; }
    s += (weakO - weak) * 2;
  } else {
    s += (pitsSum(p, me) - pitsSum(p, opp)) * 3;
    s += (extraTurns(p, me) - extraTurns(p, opp)) * 4;
  }
  return s;
}

interface Bud { until: number; nodes: number; stop: boolean }

function order(p: Pos): number[] {
  const ms = legalMoves(p);
  const sc = ms.map((i) => { const r = play(p, i); return { i, k: (r.extra ? 100 : 0) + r.captured * 10 + (r.pos.over ? 5 : 0) + i * 0.01 }; });
  sc.sort((a, b) => b.k - a.k);
  return sc.map((x) => x.i);
}

function search(p: Pos, depth: number, alpha: number, beta: number, me: Side, bud: Bud): number {
  if (p.over || depth === 0) return evaluate(p, me);
  if ((++bud.nodes & 255) === 0 && performance.now() > bud.until) bud.stop = true;
  if (bud.stop) return evaluate(p, me);
  const maxing = p.turn === me;
  let best = maxing ? -Infinity : Infinity;
  for (const i of order(p)) {
    const r = play(p, i);
    const v = search(r.pos, r.extra ? depth : depth - 1, alpha, beta, me, bud);
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; } else { if (v < best) best = v; if (best < beta) beta = best; }
    if (alpha >= beta || bud.stop) break;
  }
  if (best === Infinity || best === -Infinity) return evaluate(p, me);
  return best;
}

export interface Level { id: number; name: string; info: string; depth: number; ms: number; noise: number }
export const LEVELS: Level[] = [
  { id: 1, name: 'Hirtenkind', info: 'Wählt meist irgendeine Mulde.', depth: 0, ms: 0, noise: 1 },
  { id: 2, name: 'Händlerin', info: 'Denkt zwei Züge voraus und mag Extrazüge.', depth: 2, ms: 150, noise: 0.3 },
  { id: 3, name: 'Karawanenführer', info: 'Rechnet vier Halbzüge.', depth: 4, ms: 300, noise: 0.06 },
  { id: 4, name: 'Wesir', info: 'Rechnet acht Halbzüge und kaum Fehler.', depth: 8, ms: 700, noise: 0 },
  { id: 5, name: 'Sultanin', info: 'Rechnet so tief, wie die Zeit reicht (bis zwölf Halbzüge).', depth: 12, ms: 1600, noise: 0 },
];

export interface Scored { i: number; score: number }

/** Bewertet alle Züge des Spielers am Zug (volle Fenster – vergleichbare Werte für Tipp und Coach). */
export function scoreMoves(p: Pos, depth: number, ms: number): Scored[] {
  const me = p.turn;
  const bud: Bud = { until: performance.now() + ms, nodes: 0, stop: false };
  let res: Scored[] = [];
  const moves = order(p);
  for (let d = 1; d <= depth; d++) {
    const cur: Scored[] = [];
    let complete = true;
    for (const i of moves) {
      const r = play(p, i);
      const v = search(r.pos, r.extra ? d : d - 1, -Infinity, Infinity, me, bud);
      if (bud.stop) { complete = false; break; }
      cur.push({ i, score: v });
    }
    if (!complete) { if (!res.length) res = cur.sort((a, b) => b.score - a.score); break; }
    res = cur.sort((a, b) => b.score - a.score);
    if (Math.abs(res[0].score) > WIN / 2) break;
  }
  return res;
}

export function aiMove(p: Pos, level: number, rnd: Rng = Math.random): number {
  const L = LEVELS[Math.max(0, Math.min(4, level - 1))];
  const ms = legalMoves(p);
  if (ms.length === 1) return ms[0];
  if (L.depth === 0) {
    // gern Extrazug oder Fang, sonst zufällig
    const good = ms.filter((i) => { const r = play(p, i); return r.extra || r.captured > 0; });
    if (good.length && rnd() < 0.5) return good[Math.floor(rnd() * good.length)];
    return ms[Math.floor(rnd() * ms.length)];
  }
  const sc = scoreMoves(p, L.depth, L.ms);
  if (!sc.length) return ms[0];
  if (L.noise > 0 && rnd() < L.noise && sc.length > 1) {
    const top = sc.slice(0, Math.min(3, sc.length));
    return top[1 + Math.floor(rnd() * (top.length - 1))].i;
  }
  return sc[0].i;
}

// ───────── Coach ─────────
export type Grade = 'best' | 'good' | 'inacc' | 'mistake' | 'blunder';
export const GRADE_TXT: Record<Grade, string> = { best: 'Bester Zug', good: 'Gut', inacc: 'Ungenau', mistake: 'Fehler', blunder: 'Patzer' };

export function gradeMove(before: Pos, played: number, depth = 8, ms = 600): { grade: Grade; loss: number; best: number } {
  const sc = scoreMoves(before, depth, ms);
  if (!sc.length) return { grade: 'best', loss: 0, best: played };
  const mine = sc.find((x) => x.i === played);
  const loss = mine ? Math.max(0, (sc[0].score - mine.score) / 10) : 8;
  const grade: Grade = loss < 0.6 ? 'best' : loss < 2 ? 'good' : loss < 4.5 ? 'inacc' : loss < 9 ? 'mistake' : 'blunder';
  return { grade, loss, best: sc[0].i };
}

// ───────── Aufgaben ─────────

export function playOut(r: Rules, levels: [number, number], rnd: Rng, maxMoves = 400): { winner: Side | 'draw' | null; scores: [number, number]; moves: number } {
  let p = newPos(r);
  while (!p.over && p.moves < maxMoves) p = play(p, aiMove(p, levels[p.turn], rnd)).pos;
  return { winner: winner(p), scores: scores(p), moves: p.moves };
}

export interface Puzzle { pos: Pos; best: number[]; margin: number; title: string }

/** Stellung aus Zufallszügen, in der genau ein Zug deutlich der beste ist. */
export function makePuzzle(r: Rules, rnd: Rng, tries = 200): Puzzle | null {
  for (let t = 0; t < tries; t++) {
    let p = newPos(r);
    const k = 6 + Math.floor(rnd() * 16);
    for (let i = 0; i < k && !p.over; i++) { const ms = legalMoves(p); p = play(p, ms[Math.floor(rnd() * ms.length)]).pos; }
    if (p.over) continue;
    const ms = legalMoves(p);
    if (ms.length < 3) continue;
    const a = scoreMoves(p, 9, 400);
    if (a.length < 3) continue;
    const b = scoreMoves(p, 6, 400);
    if (b[0].i !== a[0].i) continue;
    const margin = (a[0].score - a[1].score) / 10;
    if (margin >= 1.5 && margin <= 30) return { pos: p, best: [a[0].i], margin, title: 'Welche Mulde ist hier der beste Zug?' };
  }
  return null;
}

/** Aussaat-Länge (Anzahl Samenabwürfe) eines Zuges – für Lektionen. */
export const sowLength = (p: Pos, i: number) => play(p, i).steps.filter((s) => s.k === 'drop').length;

export function buildPos(r: Rules, turn: Side, pits0: number[], pits1: number[], s0 = 0, s1 = 0): Pos {
  const n = r.n;
  const b = new Array(2 * n + 2).fill(0);
  for (let i = 0; i < n; i++) { b[pitIdx(n, 0, i)] = pits0[i] ?? 0; b[pitIdx(n, 1, i)] = pits1[i] ?? 0; }
  b[n] = s0; b[2 * n + 1] = s1;
  return { r, b, turn, moves: 10, over: false, total: b.reduce((a, c) => a + c, 0) };
}
