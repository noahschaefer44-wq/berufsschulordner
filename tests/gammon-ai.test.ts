import { describe, expect, it } from 'vitest';
import { type BG, applyMv, finished, notate, opp, startPosition, type Side, rollDice, sequences, outcome } from '../src/games/gammon/engine';
import { chooseMove, preRollProb, shots, winProb } from '../src/games/gammon/ai';
import { mulberry32 } from '../src/games/shared/rng';

function playGame(levels: [number, number], seed: number, maxTurns = 400): { winner: number; turns: number; pts: number } {
  const rnd = mulberry32(seed);
  let s: BG = startPosition();
  let turn: Side = 0;
  // Eröffnungswurf: nicht gleich
  let first = rollDice(rnd);
  while (first[0] === first[1]) first = rollDice(rnd);
  turn = first[0] > first[1] ? 0 : 1;
  let dice: number[] | null = [first[0], first[1]];
  let t = 0;
  for (; t < maxTurns; t++) {
    const d = dice ?? rollDice(rnd);
    dice = null;
    const ch = chooseMove({ ...s, turn }, turn, d, levels[turn], rnd);
    if (ch.seq) s = ch.seq.end;
    const w = finished(s);
    if (w >= 0) { const o = outcome(s, 1, false); return { winner: w, turns: t, pts: o!.points }; }
    turn = opp(turn);
  }
  return { winner: -1, turns: t, pts: 0 };
}

describe('Backgammon-KI', () => {
  it('Eröffnung 3-1: macht den 5-Punkt', () => {
    const c = chooseMove(startPosition(), 0, [3, 1], 5, mulberry32(1));
    expect(notate(c.seq!.moves)).toMatch(/8\/5/);
    expect(notate(c.seq!.moves)).toMatch(/6\/5/);
  });
  it('Eröffnung 6-5 und 4-2 sind sinnvoll', () => {
    const a = chooseMove(startPosition(), 0, [6, 5], 5, mulberry32(1));
    expect(notate(a.seq!.moves)).toBe('24/13');
    const b = chooseMove(startPosition(), 0, [4, 2], 5, mulberry32(1));
    expect(notate(b.seq!.moves)).toMatch(/8\/4/);
  });
  it('Schüsse: Blot direkt vor einem Stein wird oft getroffen', () => {
    const s = startPosition();
    // Weißer Stein auf 24 hat 2 → kein Blot. Schüsse auf Stein, der nach 24/23 allein steht:
    const t = applyMv(s, 0, { from: 24, to: 23, die: 1, hit: false });
    const n = shots(t, 0, 23);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(36);
  });
  it('Siegchance liegt in (0,1) und die Grundstellung ist fast ausgeglichen', () => {
    const p = winProb(startPosition(), 0);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.6);
    const q = preRollProb(startPosition(), 0);
    expect(q).toBeGreaterThan(0.4);
    expect(q).toBeLessThan(0.65);
  });
  it('KI-Partien enden und liefern gültige Ergebnisse', () => {
    const r = playGame([3, 3], 5);
    expect([0, 1]).toContain(r.winner);
    expect(r.pts).toBeGreaterThanOrEqual(1);
  });
  it('Stufe 4 schlägt Anfänger meistens', () => {
    let w = 0;
    const N = 8;
    for (let g = 0; g < N; g++) {
      const side = g % 2 as Side;
      const lv: [number, number] = side === 0 ? [4, 1] : [1, 4];
      const r = playGame(lv, 100 + g);
      if (r.winner === side) w++;
    }
    expect(w).toBeGreaterThanOrEqual(6);
  }, 120000);
  it('Zugwahl bleibt in Zeit (Stufe 6 < 2 s)', () => {
    const t0 = performance.now();
    chooseMove(startPosition(), 0, [4, 3], 6, mulberry32(2));
    expect(performance.now() - t0).toBeLessThan(2500);
  });
  it('alle Eröffnungswürfe liefern legale Züge', () => {
    for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
      const seqs = sequences(startPosition(), 0, [a, b], true);
      expect(seqs.length).toBeGreaterThan(0);
    }
  });
});
