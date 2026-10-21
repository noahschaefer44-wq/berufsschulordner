// Schnelle Auswertung und Monte-Carlo-Gewinnchancen für Bots, Hilfen und Trainer.
import { type Game, type Hand, bestHand, holeCount, newDeck, strength, suitOf } from './engine';
import type { Rng } from '../shared/rng';

const P = 13;
const pack = (cat: number, ranks: number[]) => { let v = cat; for (let i = 0; i < 5; i++) v = v * P + (ranks[i] ?? 0); return v; };

/** Rang-Bitmaske → höchste Straße (Rang der obersten Karte) oder −1. */
function straightHigh(mask: number, short: boolean): number {
  for (let h = 12; h >= 4; h--) {
    const need = 0b11111 << (h - 4);
    if ((mask & need) === need) return h;
  }
  if (!short && (mask & 0b1000000001111) === 0b1000000001111) return 3;
  if (short && (mask & ((1 << 12) | (0b1111 << 4))) === ((1 << 12) | (0b1111 << 4))) return 7;
  return -1;
}

/** Wert von 5–7 Karten (Hold'em/Short Deck), gleiches Format wie `score5`. */
export function eval7(cards: number[], short = false): number {
  const rc = new Array<number>(13).fill(0);
  const sm = [0, 0, 0, 0], sn = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) { const r = strength(c), s = suitOf(c); rc[r]++; sm[s] |= 1 << r; sn[s]++; mask |= 1 << r; }
  let fs = -1;
  for (let s = 0; s < 4; s++) if (sn[s] >= 5) fs = s;
  if (fs >= 0) {
    const sh = straightHigh(sm[fs], short);
    if (sh >= 0) return pack(8, [sh]);
  }
  const quads: number[] = [], trips: number[] = [], pairs: number[] = [];
  for (let r = 12; r >= 0; r--) { if (rc[r] === 4) quads.push(r); else if (rc[r] === 3) trips.push(r); else if (rc[r] === 2) pairs.push(r); }
  const kickers = (skip: number[], n: number) => { const out: number[] = []; for (let r = 12; r >= 0 && out.length < n; r--) if (rc[r] > 0 && !skip.includes(r)) out.push(r); return out; };
  if (quads.length) return pack(7, [quads[0], ...kickers([quads[0]], 1)]);
  const hasFull = trips.length > 0 && (pairs.length > 0 || trips.length > 1);
  if (hasFull) {
    const fullScore = pack(short ? 5 : 6, [trips[0], Math.max(pairs[0] ?? -1, trips[1] ?? -1)]);
    if (fs < 0) return fullScore;
    const fl: number[] = [];
    for (let r = 12; r >= 0 && fl.length < 5; r--) if (sm[fs] & (1 << r)) fl.push(r);
    return Math.max(fullScore, pack(short ? 6 : 5, fl));
  }
  if (fs >= 0) { const fl: number[] = []; for (let r = 12; r >= 0 && fl.length < 5; r--) if (sm[fs] & (1 << r)) fl.push(r); return pack(short ? 6 : 5, fl); }
  const sh = straightHigh(mask, short);
  if (sh >= 0) return pack(4, [sh]);
  if (trips.length) return pack(3, [trips[0], ...kickers([trips[0]], 2)]);
  if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], ...kickers([pairs[0], pairs[1]], 1)]);
  if (pairs.length === 1) return pack(1, [pairs[0], ...kickers([pairs[0]], 3)]);
  return pack(0, kickers([], 5));
}

export const scoreOf = (hole: number[], board: number[], game: Game): number => (game === 'omaha' ? bestHand(hole, board, game).score : eval7([...hole, ...board], game === 'short'));

export interface Equity { eq: number; win: number; tie: number; sims: number }

/**
 * Gewinnchance der Hand gegen `nOpp` zufällige Gegnerhände (oder gegebene Hände).
 * `known`: bekannte Gegnerhände (zählt zu nOpp; Rest zufällig).
 */
export function equity(hole: number[], board: number[], nOpp: number, game: Game, rnd: Rng, sims = 300, known: number[][] = []): Equity {
  const dead = new Set<number>([...hole, ...board, ...known.flat()]);
  const deck = newDeck(game).filter((c) => !dead.has(c));
  const need = 5 - board.length;
  const randomOpp = Math.max(0, nOpp - known.length);
  const hc = holeCount(game);
  const draw = need + randomOpp * hc;
  let wins = 0, ties = 0, eq = 0;
  for (let s = 0; s < sims; s++) {
    // Teilmischen (Fisher-Yates)
    for (let i = 0; i < draw; i++) { const j = i + Math.floor(rnd() * (deck.length - i)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const fullBoard = board.concat(deck.slice(0, need));
    const mine = scoreOf(hole, fullBoard, game);
    let better = false, equal = 1;
    for (const h of known) { const v = scoreOf(h, fullBoard, game); if (v > mine) { better = true; break; } if (v === mine) equal++; }
    if (!better) for (let o = 0; o < randomOpp; o++) {
      const oh = deck.slice(need + o * hc, need + (o + 1) * hc);
      const v = scoreOf(oh, fullBoard, game);
      if (v > mine) { better = true; break; }
      if (v === mine) equal++;
    }
    if (better) continue;
    if (equal === 1) { wins++; eq += 1; } else { ties++; eq += 1 / equal; }
  }
  return { eq: eq / sims, win: wins / sims, tie: ties / sims, sims };
}

/** Outs-Schätzung: Karten, die die Hand auf dem Flop/Turn verbessern (Kategorie steigt). */
export function outs(hole: number[], board: number[], game: Game = 'holdem'): number[] {
  if (board.length < 3 || board.length > 4 || game === 'omaha') return [];
  const base = eval7([...hole, ...board], game === 'short');
  const baseCat = Math.floor(base / P ** 5);
  const used = new Set([...hole, ...board]);
  const res: number[] = [];
  for (const c of newDeck(game)) {
    if (used.has(c)) continue;
    const v = eval7([...hole, ...board, c], game === 'short');
    if (Math.floor(v / P ** 5) > baseCat) res.push(c);
  }
  return res;
}

export type { Hand };
