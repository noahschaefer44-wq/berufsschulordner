// Zug-Rätsel: Stellungen aus Selbstspielpartien der KI, in denen ein Zug deutlich besser ist als alle anderen.
import { type BG, type Mv, type Seq, type Side, finished, isRace, opp, rollDice, startPosition, sequences, notate, posKey } from './engine';
import { chooseMove, rankMoves } from './ai';
import { mulberry32 } from '../shared/rng';

export interface Puzzle {
  id: string;
  s: BG;
  p: Side;
  dice: [number, number];
  /** Bester Zug (Notation) und die beste Siegchance */
  best: string;
  bestMoves: Mv[];
  bestP: number;
  /** Die fünf besten Antworten mit Siegchance */
  top: { text: string; p: number }[];
  margin: number;
}

export function genPuzzle(seed: number, tries = 40): Puzzle | null {
  for (let t = 0; t < tries; t++) {
    const rnd = mulberry32(seed * 7919 + t * 104729);
    let s: BG = startPosition();
    let p: Side = rnd() < 0.5 ? 0 : 1;
    const plies = 6 + Math.floor(rnd() * 22);
    for (let i = 0; i < plies; i++) {
      let d = rollDice(rnd);
      if (i === 0) while (d[0] === d[1]) d = rollDice(rnd);
      const ch = chooseMove({ ...s, turn: p }, p, d, 3, rnd);
      if (ch.seq) s = ch.seq.end;
      if (finished(s) >= 0) break;
      p = opp(p);
    }
    if (finished(s) >= 0 || isRace(s)) continue;
    let dice = rollDice(rnd);
    const seqs = sequences({ ...s, turn: p }, p, dice, true);
    if (seqs.length < 5) continue;
    const ranked = rankMoves({ ...s, turn: p }, p, dice, 1, 12);
    const margin = ranked[0].p - ranked[1].p;
    if (margin < 0.035) continue;
    dice = [dice[0], dice[1]];
    return {
      id: `p${seed}`, s: { ...s, turn: p }, p, dice: dice as [number, number],
      best: notate(ranked[0].seq.moves), bestMoves: ranked[0].seq.moves, bestP: ranked[0].p,
      top: ranked.slice(0, 5).map((r) => ({ text: notate(r.seq.moves), p: r.p })), margin,
    };
  }
  return null;
}

export type Grade = 'best' | 'gut' | 'ungenau' | 'fehler' | 'patzer';
export function gradeLoss(loss: number): Grade {
  return loss < 0.008 ? 'best' : loss < 0.025 ? 'gut' : loss < 0.05 ? 'ungenau' : loss < 0.1 ? 'fehler' : 'patzer';
}
export const GRADE_TEXT: Record<Grade, string> = { best: 'Bester Zug', gut: 'Gut', ungenau: 'Ungenau', fehler: 'Fehler', patzer: 'Patzer' };
export const sameEnd = (a: Seq, b: Seq) => posKey({ ...a.end, turn: 0 }) === posKey({ ...b.end, turn: 0 });
