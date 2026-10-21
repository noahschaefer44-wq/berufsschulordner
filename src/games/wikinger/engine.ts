// Wikingerschach (Hnefatafl): Angreifer gegen Verteidiger mit König. Regeln, Zuggenerator, Suche.
import { type Rng } from '../shared/rng';

export type Side = 0 | 1; // 0 = Angreifer, 1 = Verteidiger
export const EMPTY = 0, ATT = 1, DEF = 2, KING = 3;

export interface Variant {
  id: string;
  name: string;
  info: string;
  n: number;
  escape: 'corner' | 'edge';
  /** two: König wird (fern vom Thron) von zwei Angreifern gefangen; four: immer von vier */
  kingCapture: 'two' | 'four';
  attackers: [number, number][];
  defenders: [number, number][];
}

const mirror4 = (pts: [number, number][], n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (const [r, c] of pts) {
    out.push([r, c], [c, n - 1 - r], [n - 1 - r, n - 1 - c], [n - 1 - c, r]);
  }
  return out;
};

export const VARIANTS: Variant[] = [
  {
    id: 'brandubh', name: 'Brandubh 7×7', info: 'Irische Kurzform: 8 Angreifer, 4 Verteidiger, der König flieht in eine Ecke.',
    n: 7, escape: 'corner', kingCapture: 'two',
    attackers: mirror4([[0, 3], [1, 3]], 7), defenders: mirror4([[2, 3]], 7),
  },
  {
    id: 'tablut', name: 'Tablut 9×9', info: 'Lappländische Form: 16 gegen 8, der König braucht nur einen Rand.',
    n: 9, escape: 'edge', kingCapture: 'two',
    attackers: mirror4([[0, 3], [0, 4], [0, 5], [1, 4]], 9),
    defenders: mirror4([[2, 4], [3, 4]], 9),
  },
  {
    id: 'kopenhagen', name: 'Kopenhagen 11×11', info: 'Die heutige Turnierform: 24 gegen 12, Ecken als Ziel, König nur von vier Seiten zu fangen.',
    n: 11, escape: 'corner', kingCapture: 'four',
    attackers: mirror4([[0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [1, 5]], 11),
    defenders: mirror4([[3, 5], [4, 4], [4, 5]], 11),
  },
];

export interface Pos {
  v: Variant;
  n: number;
  b: Int8Array;
  turn: Side;
  plies: number;
  hash: number;
  /** Teilhashes (inkrementell) */
  h1: number;
  h2: number;
  /** Zugzähler seit dem letzten Schlag (für die Remis-Regel) */
  quiet: number;
}

export interface Mv { from: number; to: number }
export const rc = (n: number, i: number): [number, number] => [(i / n) | 0, i % n];

// ───────── Zobrist ─────────
let seedZ = 0x2545f491;
const rz = () => { seedZ = (Math.imul(seedZ ^ (seedZ >>> 15), 0x2c1b3c6d) + 0x297a2d39) | 0; return (seedZ ^ (seedZ >>> 13)) >>> 0; };
const ZH: number[][] = Array.from({ length: 4 }, () => Array.from({ length: 121 }, rz));
const ZT = rz();
const ZL: number[][] = Array.from({ length: 4 }, () => Array.from({ length: 121 }, rz));
const hashOf = (p: Pos): number => {
  let h = 0, l = 0;
  for (let i = 0; i < p.n * p.n; i++) { const x = p.b[i]; if (x) { h ^= ZH[x][i]; l ^= ZL[x][i]; } }
  if (p.turn) h ^= ZT;
  p.h1 = h >>> 0; p.h2 = l >>> 0;
  return p.h1 * 2097152 + (p.h2 >>> 11);
};
const combine = (p: Pos) => (p.h1 >>> 0) * 2097152 + (p.h2 >>> 11);

// ───────── Nachbarn ─────────
const NB: Record<number, Int16Array> = {};
const nb = (n: number) => {
  if (NB[n]) return NB[n];
  const t = new Int16Array(n * n * 4).fill(-1);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c;
    if (r > 0) t[i * 4] = i - n;
    if (c < n - 1) t[i * 4 + 1] = i + 1;
    if (r < n - 1) t[i * 4 + 2] = i + n;
    if (c > 0) t[i * 4 + 3] = i - 1;
  }
  return (NB[n] = t);
};

export const throneOf = (n: number) => ((n - 1) / 2) * n + (n - 1) / 2;
export const isCorner = (n: number, i: number) => i === 0 || i === n - 1 || i === n * (n - 1) || i === n * n - 1;
export const isEdge = (n: number, i: number) => { const [r, c] = rc(n, i); return r === 0 || c === 0 || r === n - 1 || c === n - 1; };
export const isEscape = (v: Variant, i: number) => (v.escape === 'corner' ? isCorner(v.n, i) : isEdge(v.n, i));
/** Nur der König darf auf Thron und Ecken (bei Eckenflucht) landen. */
const restricted = (v: Variant, i: number) => i === throneOf(v.n) || (v.escape === 'corner' && isCorner(v.n, i));

export function newPos(v: Variant): Pos {
  const n = v.n;
  const b = new Int8Array(n * n);
  for (const [r, c] of v.attackers) b[r * n + c] = ATT;
  for (const [r, c] of v.defenders) b[r * n + c] = DEF;
  b[throneOf(n)] = KING;
  const p: Pos = { v, n, b, turn: 0, plies: 0, hash: 0, h1: 0, h2: 0, quiet: 0 };
  p.hash = hashOf(p);
  return p;
}

export const clonePos = (p: Pos): Pos => ({ ...p, b: p.b.slice() });
export const sideOf = (x: number): Side | -1 => (x === ATT ? 0 : x === DEF || x === KING ? 1 : -1);

// ───────── Züge ─────────

export function movesFrom(p: Pos, from: number): number[] {
  const x = p.b[from];
  if (!x) return [];
  const { n, b, v } = p;
  const t = nb(n), out: number[] = [];
  for (let d = 0; d < 4; d++) {
    let j = t[from * 4 + d];
    while (j >= 0 && b[j] === EMPTY) {
      if (x === KING || !restricted(v, j)) out.push(j);
      j = t[j * 4 + d];
    }
  }
  return out;
}

export function legalMoves(p: Pos, side: Side = p.turn): Mv[] {
  const out: Mv[] = [];
  for (let i = 0; i < p.n * p.n; i++) {
    const x = p.b[i];
    if (!x || sideOf(x) !== side) continue;
    for (const to of movesFrom(p, i)) out.push({ from: i, to });
  }
  return out;
}

const hostileForDef = (p: Pos, i: number, victimIsAtt: boolean): boolean => {
  // Feld i steht hinter dem Opfer: zählt als Amboss?
  const x = p.b[i];
  if (victimIsAtt) return x === DEF || x === KING || (isCorner(p.n, i) && p.v.escape === 'corner') || (i === throneOf(p.n));
  return x === ATT || (isCorner(p.n, i) && p.v.escape === 'corner') || (i === throneOf(p.n) && x === EMPTY);
};

export interface Undo { mv: Mv; moved: number; captured: { i: number; x: number }[]; turn: Side; quiet: number; hash: number; h1: number; h2: number }

/** Zug ausführen (ohne Prüfung); liefert Rücknahme-Daten. */
export function make(p: Pos, mv: Mv): Undo {
  const { n, b } = p;
  const t = nb(n);
  const moved = b[mv.from];
  const u: Undo = { mv, moved, captured: [], turn: p.turn, quiet: p.quiet, hash: p.hash, h1: p.h1, h2: p.h2 };
  b[mv.from] = EMPTY; b[mv.to] = moved;
  const me = sideOf(moved) as Side;
  for (let d = 0; d < 4; d++) {
    const a = t[mv.to * 4 + d];
    if (a < 0) continue;
    const x = b[a];
    if (me === 0) {
      if (x === DEF) {
        const c = t[a * 4 + d];
        if (c >= 0 && hostileForDef(p, c, false)) { u.captured.push({ i: a, x }); b[a] = EMPTY; }
      }
    } else if (x === ATT) {
      const c = t[a * 4 + d];
      if (c >= 0 && hostileForDef(p, c, true)) { u.captured.push({ i: a, x }); b[a] = EMPTY; }
    }
  }
  if (me === 0) {
    const k = b.indexOf(KING);
    if (k >= 0 && kingTrapped(p, k)) { u.captured.push({ i: k, x: KING }); b[k] = EMPTY; }
  }
  p.turn = (1 - p.turn) as Side;
  p.plies++;
  p.quiet = u.captured.length ? 0 : p.quiet + 1;
  let h = p.h1 ^ ZH[moved][mv.from] ^ ZH[moved][mv.to] ^ ZT, l = p.h2 ^ ZL[moved][mv.from] ^ ZL[moved][mv.to];
  for (const c of u.captured) { h ^= ZH[c.x][c.i]; l ^= ZL[c.x][c.i]; }
  p.h1 = h >>> 0; p.h2 = l >>> 0;
  p.hash = combine(p);
  return u;
}

export function unmake(p: Pos, u: Undo) {
  p.b[u.mv.to] = EMPTY;
  p.b[u.mv.from] = u.moved;
  for (const c of u.captured) p.b[c.i] = c.x;
  p.turn = u.turn;
  p.plies--;
  p.quiet = u.quiet;
  p.hash = u.hash; p.h1 = u.h1; p.h2 = u.h2;
}

/** Ist der König auf Feld k gefangen? */
function kingTrapped(p: Pos, k: number): boolean {
  const { n, b, v } = p;
  const t = nb(n), th = throneOf(n);
  const ns = [0, 1, 2, 3].map((d) => t[k * 4 + d]);
  const att = (i: number) => i >= 0 && (b[i] === ATT || (v.escape === 'corner' && isCorner(n, i)));
  if (k === th) return ns.every((i) => i >= 0 && b[i] === ATT);
  const atThrone = ns.includes(th);
  if (atThrone) return ns.every((i) => i === th || (i >= 0 && b[i] === ATT));
  if (v.kingCapture === 'four') return ns.every((i) => i >= 0 && att(i));
  return (att(ns[0]) && att(ns[2])) || (att(ns[1]) && att(ns[3]));
}

export type Result = { winner: Side | 'draw'; why: string } | null;

export function result(p: Pos): Result {
  const k = p.b.indexOf(KING);
  if (k < 0) return { winner: 0, why: 'Der König ist gefangen.' };
  if (isEscape(p.v, k)) return { winner: 1, why: p.v.escape === 'corner' ? 'Der König hat eine Ecke erreicht.' : 'Der König hat den Rand erreicht.' };
  if (!legalMoves(p).length) return { winner: (1 - p.turn) as Side, why: p.turn === 0 ? 'Die Angreifer können nicht mehr ziehen.' : 'Die Verteidiger können nicht mehr ziehen.' };
  if (p.quiet >= 120) return { winner: 'draw', why: '60 Züge ohne Schlag – Remis.' };
  return null;
}

// ───────── Notation ─────────
export const FILES = 'abcdefghijk';
export const sqName = (n: number, i: number) => { const [r, c] = rc(n, i); return `${FILES[c]}${n - r}`; };
export const notate = (p: { n: number }, mv: Mv, cap = false) => `${sqName(p.n, mv.from)}${cap ? 'x' : '-'}${sqName(p.n, mv.to)}`;
export function parseMove(n: number, txt: string): Mv | null {
  const m = /^([a-k])(\d+)[-x]([a-k])(\d+)$/.exec(txt.trim().toLowerCase());
  if (!m) return null;
  const f = (c: string, r: string) => (n - +r) * n + FILES.indexOf(c);
  const from = f(m[1], m[2]), to = f(m[3], m[4]);
  if (from < 0 || to < 0 || from >= n * n || to >= n * n) return null;
  return { from, to };
}

// ───────── Bewertung ─────────

const WIN = 100000;

/** Kleinste Zahl König-Züge bis zur Flucht (Gegner stehen still); 99 wenn unerreichbar. */
export function kingDistance(p: Pos, limit = 6): number {
  const { n, b, v } = p;
  const k = b.indexOf(KING);
  if (k < 0) return 99;
  const t = nb(n);
  const dist = new Int8Array(n * n).fill(-1);
  const q = [k];
  dist[k] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (isEscape(v, i)) return dist[i];
    if (dist[i] >= limit) continue;
    for (let d = 0; d < 4; d++) {
      let j = t[i * 4 + d];
      while (j >= 0 && b[j] === EMPTY) { if (dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } j = t[j * 4 + d]; }
    }
  }
  return 99;
}

/** Fluchtfelder, die der König sofort erreichen kann. */
export function kingExits(p: Pos): number[] {
  const k = p.b.indexOf(KING);
  if (k < 0) return [];
  return movesFrom(p, k).filter((j) => isEscape(p.v, j));
}

export function evaluate(p: Pos): number {
  // aus Sicht der Verteidiger (positiv = gut für Verteidiger)
  const { n, b, v } = p;
  const k = b.indexOf(KING);
  if (k < 0) return -WIN + p.plies;
  if (isEscape(v, k)) return WIN - p.plies;
  let a = 0, d = 0;
  for (let i = 0; i < n * n; i++) { if (b[i] === ATT) a++; else if (b[i] === DEF) d++; }
  let s = d * 170 - a * 100;
  const dist = kingDistance(p, 5);
  s += (dist >= 99 ? -250 : (6 - dist) * 80);
  const exits = kingExits(p).length;
  if (exits >= 2) s += p.turn === 0 ? 4000 : 6000;
  else if (exits === 1) s += p.turn === 0 ? 350 : 5000;
  // König-Sicherheit
  const t = nb(n);
  let adjA = 0, adjF = 0;
  for (let q = 0; q < 4; q++) { const j = t[k * 4 + q]; if (j >= 0) { if (b[j] === ATT) adjA++; else if (b[j] === EMPTY) adjF++; } }
  s += adjF * 12 - adjA * 45;
  // Beweglichkeit des Königs
  s += Math.min(8, movesFrom(p, k).length) * 6;
  // Eckenwächter der Angreifer
  if (v.escape === 'corner') {
    const g = [n + 1, 2 * n - 2, (n - 2) * n + 1, (n - 1) * n - 2];
    for (const i of g) if (b[i] === ATT) s -= 40;
    const edges = [2, n - 3, n * 2, n * (n - 3), n * 2 + n - 1, n * (n - 3) + n - 1, n * (n - 1) + 2, n * (n - 1) + n - 3];
    for (const i of edges) if (b[i] === ATT) s -= 14;
  } else {
    // Randfeld-Sperren: Angreifer auf Rand-Nähe halten Fluchtwege zu
    for (let i = 0; i < n * n; i++) if (b[i] === ATT) { const [r, c] = rc(n, i); if (r === 1 || c === 1 || r === n - 2 || c === n - 2) s -= 6; }
  }
  return s;
}

// ───────── Suche ─────────

interface TT { d: number; v: number; f: 0 | 1 | 2; m: number }
let table = new Map<number, TT>();
export const clearTable = () => { table = new Map(); };

interface Bud { until: number; nodes: number; stop: boolean }

function captureCount(p: Pos, mv: Mv): number {
  const { n, b } = p;
  const t = nb(n);
  const x = b[mv.from], me = sideOf(x);
  let c = 0;
  const at = (i: number) => (i === mv.from ? EMPTY : b[i]);
  for (let d = 0; d < 4; d++) {
    const a = t[mv.to * 4 + d];
    if (a < 0) continue;
    const y = at(a);
    const z = t[a * 4 + d];
    if (z < 0) continue;
    const w = z === mv.to ? x : at(z);
    if (me === 0 && y === DEF) { if (w === ATT || (isCorner(n, z) && p.v.escape === 'corner') || (z === throneOf(n) && w === EMPTY)) c++; }
    if (me === 1 && y === ATT) { if (w === DEF || w === KING || (isCorner(n, z) && p.v.escape === 'corner') || z === throneOf(n)) c++; }
  }
  return c;
}

export const fullHash = (p: Pos): number => hashOf(clonePos(p));

function ordered(p: Pos, ttMove: number): Mv[] {
  const ms = legalMoves(p);
  const n = p.n;
  const kg = p.b.indexOf(KING);
  const scored = ms.map((m) => {
    let k = captureCount(p, m) * 600;
    const x = p.b[m.from];
    if (x === KING) {
      k += 120;
      if (isEscape(p.v, m.to)) k += 100000;
    }
    if (p.turn === 0) { // Angreifer: Nähe zum König
      if (kg >= 0) { const [r1, c1] = rc(n, m.to), [r2, c2] = rc(n, kg); k += 20 - (Math.abs(r1 - r2) + Math.abs(c1 - c2)); }
    }
    if (m.from * 1000 + m.to === ttMove) k += 50000;
    return { m, k };
  });
  scored.sort((a, b) => b.k - a.k);
  return scored.map((x) => x.m);
}

function nega(p: Pos, depth: number, alpha: number, beta: number, bud: Bud, seen: ReadonlySet<number> | undefined): number {
  const sign = p.turn === 1 ? 1 : -1;
  const k = p.b.indexOf(KING);
  if (k < 0) return sign * (-WIN + p.plies);
  if (isEscape(p.v, k)) return sign * (WIN - p.plies);
  if (depth === 0) return sign * evaluate(p);
  if ((++bud.nodes & 1023) === 0 && performance.now() > bud.until) bud.stop = true;
  if (bud.stop) return sign * evaluate(p);
  const a0 = alpha;
  const hit = table.get(p.hash);
  let ttm = -1;
  if (hit) {
    ttm = hit.m;
    if (hit.d >= depth) {
      if (hit.f === 0) return hit.v;
      if (hit.f === 1 && hit.v >= beta) return hit.v;
      if (hit.f === 2 && hit.v <= alpha) return hit.v;
    }
  }
  const ms = ordered(p, ttm);
  if (!ms.length) return -WIN + p.plies;
  let best = -Infinity, bm = -1;
  for (const m of ms) {
    const u = make(p, m);
    let v: number;
    if (seen && seen.has(p.hash)) v = 0;
    else v = -nega(p, depth - 1, -beta, -alpha, bud, seen);
    unmake(p, u);
    if (v > best) { best = v; bm = m.from * 1000 + m.to; }
    if (best > alpha) alpha = best;
    if (alpha >= beta || bud.stop) break;
  }
  if (!bud.stop) {
    if (table.size > 600000) table = new Map();
    table.set(p.hash, { d: depth, v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0, m: bm });
  }
  return best;
}

export interface Level { id: number; name: string; info: string; depth: number; ms: number; noise: number }
export const LEVELS: Level[] = [
  { id: 1, name: 'Knecht', info: 'Zieht fast zufällig, nimmt aber offene Beute mit.', depth: 0, ms: 0, noise: 1 },
  { id: 2, name: 'Krieger', info: 'Sieht Schläge und Fluchtwege zwei Halbzüge voraus.', depth: 2, ms: 400, noise: 0.3 },
  { id: 3, name: 'Hauptmann', info: 'Rechnet drei Halbzüge.', depth: 3, ms: 900, noise: 0.06 },
  { id: 4, name: 'Jarl', info: 'Vier Halbzüge mit Gedächtnistabelle.', depth: 4, ms: 1500, noise: 0 },
  { id: 5, name: 'Odin', info: 'Vertieft, solange die Zeit reicht (bis sechs Halbzüge).', depth: 6, ms: 2800, noise: 0 },
];

export interface Scored { mv: Mv; score: number }

/** Bewertet Wurzelzüge aus Sicht des Ziehenden (je höher, desto besser). */
export function scoreRoot(p0: Pos, depth: number, ms: number, seen?: ReadonlySet<number>, exact = true): Scored[] {
  const p = clonePos(p0);
  const bud: Bud = { until: performance.now() + ms, nodes: 0, stop: false };
  let res: Scored[] = [];
  let roots = ordered(p, -1);
  for (let d = 1; d <= depth; d++) {
    const cur: Scored[] = [];
    let alpha = -Infinity;
    let complete = true;
    for (const m of roots) {
      const u = make(p, m);
      let v: number;
      if (seen && seen.has(p.hash)) v = 0;
      else v = -nega(p, d - 1, -Infinity, exact ? Infinity : -alpha, bud, seen);
      unmake(p, u);
      if (bud.stop) { complete = false; break; }
      cur.push({ mv: m, score: v });
      if (v > alpha) alpha = v;
    }
    if (!complete) { if (!res.length) res = cur.sort((a, b) => b.score - a.score); break; }
    res = cur.sort((a, b) => b.score - a.score);
    roots = res.map((x) => x.mv);
    if (Math.abs(res[0].score) > WIN / 2) break;
  }
  return res;
}

export function aiMove(p: Pos, level: number, rnd: Rng = Math.random, seen?: ReadonlySet<number>): Mv {
  const L = LEVELS[Math.max(0, Math.min(4, level - 1))];
  const ms = legalMoves(p);
  // Sofortgewinn (König-Flucht bzw. Königsfang)
  for (const m of ms) {
    if (p.b[m.from] === KING && isEscape(p.v, m.to)) return m;
  }
  if (p.turn === 0) {
    for (const m of ms) { const u = make(p, m); const dead = p.b.indexOf(KING) < 0; unmake(p, u); if (dead) return m; }
  }
  if (L.depth === 0) {
    const caps = ms.filter((m) => captureCount(p, m) > 0);
    if (caps.length && rnd() < 0.7) return caps[Math.floor(rnd() * caps.length)];
    return ms[Math.floor(rnd() * ms.length)];
  }
  let sc = scoreRoot(p, L.depth, L.ms, seen, false);
  if (!sc.length) return ms[0];
  if (seen) {
    const fresh = sc.filter((x) => { const u = make(p, x.mv); const dup = seen.has(p.hash); unmake(p, u); return !dup; });
    if (fresh.length) sc = fresh;
  }
  if (L.noise > 0 && rnd() < L.noise && sc.length > 1) {
    const top = sc.slice(0, Math.min(4, sc.length));
    return top[1 + Math.floor(rnd() * (top.length - 1))].mv;
  }
  return sc[0].mv;
}

// ───────── Coach ─────────
export type Grade = 'best' | 'good' | 'inacc' | 'mistake' | 'blunder';
export const GRADE_TXT: Record<Grade, string> = { best: 'Bester Zug', good: 'Gut', inacc: 'Ungenau', mistake: 'Fehler', blunder: 'Patzer' };

export function gradeMove(before: Pos, played: Mv, depth = 3, ms = 900): { grade: Grade; loss: number; best: Mv } {
  const sc = scoreRoot(before, depth, ms);
  if (!sc.length) return { grade: 'best', loss: 0, best: played };
  const mine = sc.find((x) => x.mv.from === played.from && x.mv.to === played.to);
  const loss = mine ? Math.max(0, sc[0].score - mine.score) : 600;
  const grade: Grade = loss < 40 ? 'best' : loss < 150 ? 'good' : loss < 400 ? 'inacc' : loss < 1500 ? 'mistake' : 'blunder';
  return { grade, loss, best: sc[0].mv };
}

// ───────── Aufgaben: erzwungene Gewinne ─────────

/** Kann die Seite am Zug in höchstens `plies` eigenen Zügen erzwungen gewinnen? Liefert gewinnende Erstzüge. */
export function winningMoves(p0: Pos, own: number): Mv[] {
  const p = clonePos(p0);
  const me = p.turn;
  const win = (): number => { const r = result(p); if (!r || r.winner === 'draw') return 0; return r.winner === me ? 1 : -1; };
  const solve = (left: number): boolean => {
    // Seite me am Zug: gibt es einen Zug, der erzwungen gewinnt?
    for (const m of legalMoves(p)) {
      const u = make(p, m);
      const w = win();
      let ok = false;
      if (w === 1) ok = true;
      else if (w === 0 && left > 1) {
        const rs = legalMoves(p);
        ok = rs.length > 0 && rs.every((r) => { const u2 = make(p, r); const w2 = win(); const good = w2 === -1 ? false : w2 === 1 ? true : solve(left - 1); unmake(p, u2); return good; });
      }
      unmake(p, u);
      if (ok) return true;
    }
    return false;
  };
  const out: Mv[] = [];
  for (const m of legalMoves(p)) {
    const u = make(p, m);
    const w = win();
    let ok = false;
    if (w === 1) ok = true;
    else if (w === 0 && own > 1) {
      const rs = legalMoves(p);
      ok = rs.length > 0 && rs.every((r) => { const u2 = make(p, r); const w2 = win(); const good = w2 === -1 ? false : w2 === 1 ? true : solve(own - 1); unmake(p, u2); return good; });
    }
    unmake(p, u);
    if (ok) out.push(m);
  }
  return out;
}

export interface Puzzle { pos: Pos; side: Side; own: number; solutions: Mv[]; title: string }

export function playOut(v: Variant, levels: [number, number], rnd: Rng, maxPlies = 400): { winner: Side | 'draw'; plies: number; why: string } {
  const p = newPos(v);
  const seen = new Set<number>([p.hash]);
  clearTable();
  while (p.plies < maxPlies) {
    const r = result(p);
    if (r) return { winner: r.winner, plies: p.plies, why: r.why };
    const m = aiMove(p, levels[p.turn], rnd, seen);
    make(p, m);
    seen.add(p.hash);
  }
  return { winner: 'draw', plies: p.plies, why: 'Zuglimit' };
}

/** Zufallsstellung aus einer Partie zweier schwacher KIs; nachspielbar aus dem Startwert. */
export function midgame(v: Variant, rnd: Rng, plies: number): Pos {
  const p = newPos(v);
  for (let i = 0; i < plies; i++) {
    if (result(p)) break;
    const ms = legalMoves(p);
    const caps = ms.filter((m) => captureCount(p, m) > 0);
    const m = caps.length && rnd() < 0.6 ? caps[Math.floor(rnd() * caps.length)] : ms[Math.floor(rnd() * ms.length)];
    make(p, m);
  }
  return p;
}

export function makePuzzle(v: Variant, rnd: Rng, own = 2, tries = 400): Puzzle | null {
  for (let t = 0; t < tries; t++) {
    const p = midgame(v, rnd, 8 + Math.floor(rnd() * 26));
    if (result(p)) continue;
    // Es soll nicht schon ein Ein-Zug-Gewinn existieren
    const one = winningMoves(p, 1);
    if (one.length) continue;
    const sol = winningMoves(p, own);
    if (sol.length && sol.length <= 3) {
      const side = p.turn;
      return { pos: p, side, own, solutions: sol, title: side === 1 ? 'Der König flieht in zwei Zügen – wie?' : 'Fange den König in zwei Zügen!' };
    }
  }
  return null;
}

/** Figuren von `victim`, die der Gegner mit seinem nächsten Zug schlagen könnte. */
export function exposed(p0: Pos, victim: Side): number[] {
  const p = clonePos(p0);
  p.turn = (1 - victim) as Side;
  const out = new Set<number>();
  for (const m of legalMoves(p)) {
    const u = make(p, m);
    for (const c of u.captured) if (sideOf(c.x) === victim) out.add(c.i);
    unmake(p, u);
  }
  return [...out];
}

/** Stellung aus einer Liste [Zeile, Spalte, Figur] bauen. */
export function buildPos(v: Variant, turn: Side, pieces: [number, number, number][]): Pos {
  const p = newPos(v);
  p.b.fill(EMPTY);
  for (const [r, c, x] of pieces) p.b[r * v.n + c] = x;
  p.turn = turn;
  p.hash = hashOf(p);
  return p;
}
