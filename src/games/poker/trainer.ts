// Poker-Trainer: Aufgaben mit berechneter Lösung (Handränge, Showdown, Pot-Quote, Gewinnchance, Outs, Entscheidung).
import { type Game, HAND_NAMES, bestHand, cardFrom, score5 } from './engine';
import { eval7, equity } from './equity';
import { type Rng, mulberry32, shuffled } from '../shared/rng';

const rint = (r: Rng, n: number) => Math.floor(r() * n);
const pick = <T,>(r: Rng, a: readonly T[]): T => a[rint(r, a.length)];
const deck52 = () => Array.from({ length: 52 }, (_, i) => i);

/** Fünf Karten genau einer Kategorie (0 Hohe Karte … 8 Straight Flush). */
export function makeHand(cat: number, rnd: Rng): number[] {
  for (let tries = 0; tries < 500; tries++) {
    const ranks = shuffled(rnd, Array.from({ length: 13 }, (_, i) => i));
    const suits = () => rint(rnd, 4);
    let cards: number[] = [];
    const mixed = (rs: number[]) => {
      const used = new Set<number>();
      return rs.map((r) => { let c = cardFrom(r, suits()); while (used.has(c)) c = cardFrom(r, suits()); used.add(c); return c; });
    };
    switch (cat) {
      case 0: cards = mixed(ranks.slice(0, 5)); break;
      case 1: cards = mixed([ranks[0], ranks[0], ranks[1], ranks[2], ranks[3]]); break;
      case 2: cards = mixed([ranks[0], ranks[0], ranks[1], ranks[1], ranks[2]]); break;
      case 3: cards = mixed([ranks[0], ranks[0], ranks[0], ranks[1], ranks[2]]); break;
      case 4: { const hi = 3 + rint(rnd, 10); cards = mixed(hi === 3 ? [12, 0, 1, 2, 3] : [hi, hi - 1, hi - 2, hi - 3, hi - 4]); break; }
      case 5: { const s = suits(); cards = ranks.slice(0, 5).map((r) => cardFrom(r, s)); break; }
      case 6: cards = mixed([ranks[0], ranks[0], ranks[0], ranks[1], ranks[1]]); break;
      case 7: cards = [0, 1, 2, 3].map((s) => cardFrom(ranks[0], s)).concat(cardFrom(ranks[1], suits())); break;
      default: { const hi = 3 + rint(rnd, 10); const s = suits(); cards = (hi === 3 ? [12, 0, 1, 2, 3] : [hi, hi - 1, hi - 2, hi - 3, hi - 4]).map((r) => cardFrom(r, s)); }
    }
    // Es muss genau die gewünschte Kategorie sein
    if (Math.floor(score5(cards) / 13 ** 5) === cat) return shuffled(rnd, cards);
  }
  return [];
}

export interface RankQuiz { cards: number[]; answer: number; options: string[] }
export function genRankQuiz(seed: number): RankQuiz {
  const rnd = mulberry32(seed);
  const cat = rint(rnd, 9);
  const cards = makeHand(cat, rnd);
  const wrong = shuffled(rnd, HAND_NAMES.map((_, i) => i).filter((i) => i !== cat)).slice(0, 3);
  const opts = shuffled(rnd, [cat, ...wrong]);
  return { cards, answer: opts.indexOf(cat), options: opts.map((i) => HAND_NAMES[i]) };
}

export interface WinnerQuiz { board: number[]; a: number[]; b: number[]; answer: 0 | 1 | 2; nameA: string; nameB: string }
export function genWinnerQuiz(seed: number, game: Game = 'holdem'): WinnerQuiz {
  const rnd = mulberry32(seed);
  for (;;) {
    const d = shuffled(rnd, deck52());
    const board = d.slice(0, 5), a = d.slice(5, 7), b = d.slice(7, 9);
    const ha = bestHand(a, board, game), hb = bestHand(b, board, game);
    if (ha.cat === 0 && hb.cat === 0 && rnd() < 0.7) continue;
    const answer = ha.score > hb.score ? 0 : hb.score > ha.score ? 1 : 2;
    return { board, a, b, answer, nameA: ha.name, nameB: hb.name };
  }
}

export interface OddsQuiz { pot: number; bet: number; need: number }
/** Der Gegner setzt `bet` in einen Pot von `pot`; du zahlst `bet`, um `pot + 2·bet` zu gewinnen. */
export function genOddsQuiz(seed: number): OddsQuiz {
  const rnd = mulberry32(seed);
  const pot = pick(rnd, [40, 60, 80, 100, 120, 150, 200, 240, 300, 400]);
  const frac = pick(rnd, [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5]);
  const bet = Math.max(10, Math.round((pot * frac) / 5) * 5);
  return { pot, bet, need: bet / (pot + 2 * bet) };
}

export interface EquityQuiz { hole: number[]; board: number[]; opponents: number; eq: number }
export function genEquityQuiz(seed: number, game: Game = 'holdem'): EquityQuiz {
  const rnd = mulberry32(seed);
  const d = shuffled(rnd, deck52());
  const hole = d.slice(0, 2);
  const street = pick(rnd, [0, 3, 3, 4]);
  const board = d.slice(2, 2 + street);
  const opponents = 1 + rint(rnd, 3);
  const eq = equity(hole, board, opponents, game, mulberry32(seed + 1), 2500).eq;
  return { hole, board, opponents, eq };
}

export interface OutsQuiz { hole: number[]; board: number[]; outs: number[] }
/** Outs bis zur Straße oder besser (Kategorie ≥ 4). */
export function genOutsQuiz(seed: number): OutsQuiz | null {
  for (let t = 0; t < 400; t++) {
    const rnd = mulberry32(seed * 131 + t);
    const d = shuffled(rnd, deck52());
    const hole = d.slice(0, 2);
    const board = d.slice(2, 2 + (rnd() < 0.7 ? 3 : 4));
    const base = eval7([...hole, ...board]);
    if (Math.floor(base / 13 ** 5) >= 4) continue;
    const used = new Set([...hole, ...board]);
    const good: number[] = [];
    for (let c = 0; c < 52; c++) { if (used.has(c)) continue; if (Math.floor(eval7([...hole, ...board, c]) / 13 ** 5) >= 4) good.push(c); }
    if (good.length < 4 || good.length > 15) continue;
    return { hole, board, outs: good };
  }
  return null;
}

export interface DecisionQuiz { hole: number[]; board: number[]; pot: number; bet: number; need: number; eq: number; answer: 'call' | 'fold' }
/** Entscheidung Call oder Fold – Lösung nach Gewinnchance gegen eine zufällige Hand im Vergleich zur Pot-Quote. */
export function genDecisionQuiz(seed: number, game: Game = 'holdem'): DecisionQuiz {
  for (let t = 0; t < 200; t++) {
    const rnd = mulberry32(seed * 977 + t);
    const d = shuffled(rnd, deck52());
    const hole = d.slice(0, 2);
    const board = d.slice(2, 2 + pick(rnd, [3, 4, 5]));
    const o = genOddsQuiz(seed * 31 + t);
    const eq = equity(hole, board, 1, game, mulberry32(seed + t + 5), 1500).eq;
    if (Math.abs(eq - o.need) < 0.07) continue;
    return { hole, board, pot: o.pot, bet: o.bet, need: o.need, eq, answer: eq > o.need ? 'call' : 'fold' };
  }
  const o = genOddsQuiz(seed);
  return { hole: [0, 13], board: [], pot: o.pot, bet: o.bet, need: o.need, eq: 0.5, answer: 'call' };
}
