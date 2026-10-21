// Ein Zug (Wurf) Schritt für Schritt: Auswahl der Steine, Zielfelder, Rücknahme – immer im Rahmen der Pflichtregeln.
import { type BG, type Mv, type Seq, type Side, applyMv, sequences } from './engine';

export interface Turn { start: BG; p: Side; dice: number[]; seqs: Seq[]; played: Mv[]; cur: BG }

const same = (a: Mv, b: Mv) => a.from === b.from && a.to === b.to && a.die === b.die;

export function newTurn(s: BG, p: Side, dice: number[]): Turn {
  return { start: s, p, dice, seqs: sequences(s, p, dice, false), played: [], cur: s };
}

export function candidates(t: Turn): Seq[] {
  const n = t.played.length;
  return t.seqs.filter((q) => q.moves.length > n && t.played.every((m, i) => same(m, q.moves[i])));
}

/** Verschiedene nächste Einzelzüge. */
export function nextMoves(t: Turn): Mv[] {
  const seen = new Set<string>();
  const out: Mv[] = [];
  for (const q of candidates(t)) {
    const m = q.moves[t.played.length];
    const k = `${m.from}>${m.to}>${m.die}`;
    if (!seen.has(k)) { seen.add(k); out.push(m); }
  }
  return out;
}

export const isComplete = (t: Turn): boolean => candidates(t).length === 0;
export const hasNoMove = (t: Turn): boolean => t.seqs.length === 0;

export function targetsFrom(t: Turn, from: number): number[] {
  return [...new Set(nextMoves(t).filter((m) => m.from === from).map((m) => m.to))];
}
export const sourcesOf = (t: Turn): number[] => [...new Set(nextMoves(t).map((m) => m.from))];

/** Einzelzug von→nach; bei mehreren Würfeln mit gleichem Ziel (Auswürfeln) der kleinste passende. */
export function pickMove(t: Turn, from: number, to: number): Mv | null {
  const ms = nextMoves(t).filter((m) => m.from === from && m.to === to).sort((a, b) => a.die - b.die);
  return ms[0] ?? null;
}

export function step(t: Turn, m: Mv): Turn {
  return { ...t, played: [...t.played, m], cur: applyMv(t.cur, t.p, m) };
}

export function undoStep(t: Turn): Turn {
  if (!t.played.length) return t;
  const played = t.played.slice(0, -1);
  let cur = t.start;
  for (const m of played) cur = applyMv(cur, t.p, m);
  return { ...t, played, cur };
}

/** Bester einzelner Zug beim Doppelklick: größter Würfel zuerst. */
export function autoFrom(t: Turn, from: number): Mv | null {
  const ms = nextMoves(t).filter((m) => m.from === from).sort((a, b) => b.die - a.die);
  return ms[0] ?? null;
}

/** Gesamte Zugfolge der KI als Schrittliste in spielbarer Reihenfolge. */
export const playedSeq = (t: Turn): Seq => ({ moves: t.played, end: t.cur });
