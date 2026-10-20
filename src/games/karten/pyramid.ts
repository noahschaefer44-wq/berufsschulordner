// Pyramide (Paare mit Summe 13) und TriPeaks (Karten ±1 auf den Ablagestapel).
import { type Card, mk, newDeck, rankOf, shuffleDeck } from './cards';
import { mulberry32 } from '../shared/rng';

export type PKind = 'pyramide' | 'tripeaks';

export interface PyrGame {
  kind: PKind;
  board: (Card | null)[];
  stock: Card[];
  waste: Card[];
  redeals: number;
  moves: number;
  score: number;
  streak: number;
  best: number;
  deal: number;
  wrap: boolean;
  won: boolean;
}

export type PMove = { act: 'draw' } | { act: 'recycle' } | { act: 'remove'; a: number | 'W'; b?: number | 'W' } | { act: 'play'; a: number };

// ───────── Anordnung ─────────

export interface Slot { row: number; x: number; kids: number[] }

function buildPyramid(): Slot[] {
  const s: Slot[] = [];
  let k = 0;
  for (let r = 0; r < 7; r++) for (let c = 0; c <= r; c++) { s.push({ row: r, x: c - r / 2, kids: r < 6 ? [k + r + 1, k + r + 2] : [] }); k++; }
  // Indizes der Kinder neu berechnen (Zeile r, Spalte c → (r+1, c) und (r+1, c+1))
  const start = (r: number) => (r * (r + 1)) / 2;
  let i = 0;
  for (let r = 0; r < 7; r++) for (let c = 0; c <= r; c++) { s[i].kids = r < 6 ? [start(r + 1) + c, start(r + 1) + c + 1] : []; i++; }
  return s;
}
function buildTri(): Slot[] {
  const rows: number[][] = [[1.5, 4.5, 7.5], [1, 2, 4, 5, 7, 8], [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]];
  const slots: Slot[] = [];
  const idx: number[][] = [];
  rows.forEach((xs, r) => { idx.push(xs.map((x) => { slots.push({ row: r, x, kids: [] }); return slots.length - 1; })); });
  rows.forEach((xs, r) => {
    if (r === rows.length - 1) return;
    xs.forEach((x, i) => {
      const kids = rows[r + 1].map((y, j) => ({ y, j })).filter((o) => Math.abs(o.y - x) === 0.5).map((o) => idx[r + 1][o.j]);
      slots[idx[r][i]].kids = kids;
    });
  });
  return slots;
}
export const PYRAMID_SLOTS = buildPyramid();
export const TRI_SLOTS = buildTri();
export const slotsOf = (k: PKind) => (k === 'pyramide' ? PYRAMID_SLOTS : TRI_SLOTS);

// ───────── Neue Spiele ─────────

export function newPyramid(seed: number): PyrGame {
  const deck = shuffleDeck(newDeck(1), mulberry32(seed)).map((c) => ({ ...c, up: true }));
  return { kind: 'pyramide', board: deck.slice(0, 28), stock: deck.slice(28), waste: [], redeals: 2, moves: 0, score: 0, streak: 0, best: 0, deal: seed, wrap: false, won: false };
}
export function newTriPeaks(seed: number, wrap = false): PyrGame {
  const deck = shuffleDeck(newDeck(1), mulberry32(seed));
  const board: (Card | null)[] = deck.slice(0, 28).map((c, i) => ({ ...c, up: i >= 18 }));
  const stock = deck.slice(28).map((c) => ({ ...c, up: false }));
  const first = stock.pop()!;
  return { kind: 'tripeaks', board, stock, waste: [{ ...first, up: true }], redeals: 0, moves: 0, score: 0, streak: 0, best: 0, deal: seed, wrap, won: false };
}

export const cloneP = (g: PyrGame): PyrGame => ({ ...g, board: g.board.map((c) => (c ? { ...c } : null)), stock: g.stock.map((c) => ({ ...c })), waste: g.waste.map((c) => ({ ...c })) });

export function isFree(g: PyrGame, i: number): boolean {
  if (!g.board[i]) return false;
  const kids = slotsOf(g.kind)[i].kids;
  return kids.every((k) => !g.board[k]);
}
const value = (c: Card) => rankOf(c.id) + 1;

export function refreshUp(g: PyrGame) {
  if (g.kind !== 'tripeaks') return;
  g.board.forEach((c, i) => { if (c && !c.up && isFree(g, i)) g.board[i] = { ...c, up: true }; });
}

function cardAt(g: PyrGame, ref: number | 'W'): Card | null {
  if (ref === 'W') return g.waste[g.waste.length - 1] ?? null;
  return isFree(g, ref) ? g.board[ref] : null;
}

export function applyP(g0: PyrGame, m: PMove): PyrGame | null {
  const g = cloneP(g0);
  if (m.act === 'draw') {
    if (!g.stock.length) return null;
    const c = g.stock.pop()!;
    g.waste.push({ ...c, up: true });
    g.streak = 0;
  } else if (m.act === 'recycle') {
    if (g.kind !== 'pyramide' || g.stock.length || !g.waste.length || g.redeals <= 0) return null;
    g.stock = g.waste.reverse().map((c) => ({ ...c, up: true }));
    g.waste = [];
    g.redeals--;
  } else if (m.act === 'remove') {
    if (g.kind !== 'pyramide') return null;
    const ca = cardAt(g, m.a);
    if (!ca) return null;
    if (m.b === undefined) {
      if (value(ca) !== 13) return null;
    } else {
      const cb = cardAt(g, m.b);
      if (!cb || m.a === m.b || value(ca) + value(cb) !== 13) return null;
    }
    for (const r of [m.a, m.b]) { if (r === undefined) continue; if (r === 'W') g.waste.pop(); else g.board[r] = null; }
    g.score += m.b === undefined ? 5 : 10;
  } else {
    if (g.kind !== 'tripeaks') return null;
    const c = cardAt(g, m.a), top = g.waste[g.waste.length - 1];
    if (!c || !top) return null;
    const d = Math.abs(rankOf(c.id) - rankOf(top.id));
    if (!(d === 1 || (g.wrap && d === 12))) return null;
    g.board[m.a] = null;
    g.waste.push({ ...c, up: true });
    g.streak++;
    g.best = Math.max(g.best, g.streak);
    g.score += 10 * g.streak;
  }
  g.moves++;
  refreshUp(g);
  g.won = g.board.every((c) => !c);
  if (g.won && g.kind === 'tripeaks') g.score += g.stock.length * 15;
  return g;
}

export function legalP(g: PyrGame): PMove[] {
  const out: PMove[] = [];
  const free = g.board.map((_, i) => i).filter((i) => isFree(g, i));
  if (g.kind === 'pyramide') {
    const refs: (number | 'W')[] = [...free];
    if (g.waste.length) refs.push('W');
    for (const a of refs) { const ca = cardAt(g, a); if (ca && value(ca) === 13) out.push({ act: 'remove', a }); }
    for (let x = 0; x < refs.length; x++) for (let y = x + 1; y < refs.length; y++) {
      const ca = cardAt(g, refs[x]), cb = cardAt(g, refs[y]);
      if (ca && cb && value(ca) + value(cb) === 13) out.push({ act: 'remove', a: refs[x], b: refs[y] });
    }
    if (g.stock.length) out.push({ act: 'draw' });
    else if (g.waste.length && g.redeals > 0) out.push({ act: 'recycle' });
  } else {
    const top = g.waste[g.waste.length - 1];
    if (top) for (const i of free) { const d = Math.abs(rankOf(g.board[i]!.id) - rankOf(top.id)); if (d === 1 || (g.wrap && d === 12)) out.push({ act: 'play', a: i }); }
    if (g.stock.length) out.push({ act: 'draw' });
  }
  return out;
}

export function hintP(g: PyrGame): PMove | null {
  const ms = legalP(g);
  const non = ms.filter((m) => m.act !== 'draw' && m.act !== 'recycle');
  return non[0] ?? ms.find((m) => m.act === 'draw') ?? ms.find((m) => m.act === 'recycle') ?? null;
}

export const stuckP = (g: PyrGame) => !g.won && legalP(g).length === 0;
export { mk };
