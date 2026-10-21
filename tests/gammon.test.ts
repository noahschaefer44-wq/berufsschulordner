import { describe, expect, it } from 'vitest';
import { type BG, applyMv, cloneBG, isRace, notate, outcome, own, pips, seqKey, sequences, singleMoves, startPosition } from '../src/games/gammon/engine';

/** Stellung aus Listen: { weiß: {q: n}, schwarz: {q: n} } in Koordinaten der jeweiligen Seite. */
function pos(w: Record<number, number>, b: Record<number, number>, extra: Partial<BG> = {}): BG {
  const s = startPosition();
  s.pts.fill(0); s.bar = [0, 0]; s.off = [0, 0];
  for (const [q, n] of Object.entries(w)) { if (+q === 25) s.bar[0] = n; else s.pts[+q - 1] = n; }
  for (const [q, n] of Object.entries(b)) { if (+q === 25) s.bar[1] = n; else s.pts[24 - +q] = -n; }
  return { ...s, ...extra };
}

describe('Backgammon: Grundstellung', () => {
  it('15 Steine, 167 Pips je Seite', () => {
    const s = startPosition();
    for (const p of [0, 1] as const) {
      let n = s.bar[p] + s.off[p];
      for (let q = 1; q <= 24; q++) n += own(s, p, q);
      expect(n).toBe(15);
      expect(pips(s, p)).toBe(167);
    }
  });
  it('Varianten haben die richtige Steinzahl', () => {
    for (const [v, n] of [['hyper', 3], ['kurz', 10], ['rueckspiel', 15]] as const) {
      const s = startPosition(v);
      let c = 0;
      for (let q = 1; q <= 24; q++) c += own(s, 0, q);
      expect(c).toBe(n);
      expect(s.total).toBe(n);
    }
  });
  it('Schwarz ist gespiegelt', () => {
    const s = startPosition();
    expect(own(s, 1, 24)).toBe(2);
    expect(own(s, 0, 24)).toBe(2);
    expect(s.pts[23]).toBe(2);
    expect(s.pts[0]).toBe(-2);
  });
});

describe('Backgammon: Züge', () => {
  it('Eröffnung 3-1 enthält 8/5 6/5', () => {
    const seqs = sequences(startPosition(), 0, [3, 1], true);
    const keys = seqs.map((q) => seqKey(q.moves));
    expect(keys).toContain(seqKey([{ from: 8, to: 5, die: 3, hit: false }, { from: 6, to: 5, die: 1, hit: false }]));
  });
  it('Notation bündelt gleiche Züge', () => {
    expect(notate([{ from: 24, to: 20, die: 4, hit: false }, { from: 24, to: 20, die: 4, hit: false }])).toBe('24/20(2)');
    expect(notate([{ from: 13, to: 7, die: 6, hit: false }, { from: 8, to: 7, die: 1, hit: true }])).toBe('13/7 8/7*');
  });
  it('Steine auf der Bar müssen zuerst herein', () => {
    const s = pos({ 25: 1, 13: 2 }, { 20: 2 });
    const m = singleMoves(s, 0, 3);
    expect(m.length).toBe(1);
    expect(m[0].from).toBe(25);
    expect(m[0].to).toBe(22);
  });
  it('blockierter Eintritt: kein Zug', () => {
    const s = pos({ 25: 1, 13: 2 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 });
    expect(sequences(s, 0, [3, 4])).toEqual([]);
    const t = pos({ 25: 1, 13: 2 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 });
    const seqs = sequences(t, 0, [6, 1]);
    expect(seqs.length).toBeGreaterThan(0);
    expect(seqs.every((q) => q.moves[0].from === 25 && q.moves[0].die === 6)).toBe(true);
  });
  it('Schlagen schickt den Gegner auf die Bar', () => {
    const s = pos({ 8: 1, 13: 2 }, { 17: 1, 6: 2 });
    // Schwarz-Stein steht auf 17 (aus Schwarz-Sicht) = 8 aus Weiß-Sicht
    const hit = singleMoves(s, 0, 5).filter((m) => m.hit);
    expect(hit.length).toBe(1);
    expect(hit[0].from).toBe(13);
    const t = applyMv(s, 0, hit[0]);
    expect(t.bar[1]).toBe(1);
  });
  it('Würfe von 6-6 vier Züge', () => {
    const seqs = sequences(startPosition(), 0, [6, 6], true);
    expect(seqs.length).toBeGreaterThan(0);
    for (const q of seqs) expect(q.moves.length).toBe(4);
  });
  it('Pflicht: größeren Würfel spielen, wenn nur einer geht', () => {
    // Weiß hat einen Stein auf 7 und Gegner blockiert 5 (7-2) und 4 (7-3 nach 7-... ). Nur Zug mit 6 möglich: 7→1
    const s = pos({ 7: 1 }, { 20: 2, 21: 2 }); // Schwarz q=20 → Weiß 5; q=21 → Weiß 4
    // Würfel 2 (7→5 blockiert) und 3 (7→4 blockiert): kein Zug
    expect(sequences(s, 0, [2, 3])).toEqual([]);
    // Würfel 1 (7→6 frei) und 2 (blockiert): einzig 1 spielbar; danach 6→4 blockiert (6-2) usw.
    const one = sequences(s, 0, [1, 2]);
    expect(one.every((q) => q.moves.length === 1 && q.moves[0].die === 1)).toBe(true);
  });
  it('Pflicht: beide Würfel nutzen, wenn möglich', () => {
    const s = startPosition();
    for (const q of sequences(s, 0, [5, 2], true)) expect(q.moves.length).toBe(2);
  });
  it('Auswürfeln: erst wenn alle im Heimfeld', () => {
    const s = pos({ 6: 1, 3: 1, 9: 1 }, { 24: 1 });
    expect(singleMoves(s, 0, 6).some((m) => m.to === 0)).toBe(false);
    const t = pos({ 6: 1, 3: 1 }, { 24: 1 });
    expect(singleMoves(t, 0, 6).some((m) => m.from === 6 && m.to === 0)).toBe(true);
  });
  it('Auswürfeln mit größerer Zahl nur vom hintersten Stein', () => {
    const t = pos({ 5: 1, 3: 1 }, { 24: 1 });
    const ms = singleMoves(t, 0, 6).filter((m) => m.to === 0);
    expect(ms.map((m) => m.from)).toEqual([5]);
    const u = pos({ 3: 1, 2: 1 }, { 24: 1 });
    expect(singleMoves(u, 0, 5).filter((m) => m.to === 0).map((m) => m.from)).toEqual([3]);
  });
  it('Rennposition wird erkannt', () => {
    expect(isRace(startPosition())).toBe(false);
    expect(isRace(pos({ 3: 2 }, { 3: 2 }))).toBe(true);
  });
});

describe('Backgammon: Wertung', () => {
  it('einfacher Sieg, Gammon, Backgammon', () => {
    const base = pos({}, { 3: 2 }, { off: [15, 5] });
    expect(outcome(base, 1, false)?.kind).toBe('einfach');
    const g = pos({}, { 10: 2 }, { off: [15, 0] });
    expect(outcome(g, 1, false)?.kind).toBe('gammon');
    expect(outcome(g, 2, true)?.points).toBe(4);
    const bg = pos({}, { 22: 1, 10: 1 }, { off: [15, 0] });
    expect(outcome(bg, 1, false)?.kind).toBe('backgammon');
    expect(outcome(bg, 1, false)?.points).toBe(3);
  });
  it('Jacoby: ohne Würfel nur einfach', () => {
    const g = pos({}, { 10: 2 }, { off: [15, 0] });
    expect(outcome(g, 1, false, true)?.points).toBe(1);
    expect(outcome(g, 2, true, true)?.points).toBe(4);
  });
  it('Spiel läuft noch', () => {
    expect(outcome(startPosition(), 1, false)).toBeNull();
  });
  it('Kopie ist unabhängig', () => {
    const s = startPosition();
    const t = cloneBG(s);
    t.pts[0] = 99;
    expect(s.pts[0]).not.toBe(99);
  });
});

import { LESSONS } from '../src/games/gammon/lessons';
import { genPuzzle } from '../src/games/gammon/puzzles';
import { newTurn, nextMoves, step, isComplete, undoStep, targetsFrom, pickMove } from '../src/games/gammon/turn';

describe('Backgammon: Lektionen und Rätsel', () => {
  it('jede Lektionsaufgabe hat eine Lösung, nicht jede Zugfolge löst sie', () => {
    for (const l of LESSONS) for (const st of l.steps) {
      if (st.t !== 'task') continue;
      const seqs = sequences(st.pos, 0, st.dice, true);
      const ok = seqs.filter((q) => st.goal(q.end, q.moves));
      expect(ok.length, st.title).toBeGreaterThan(0);
      expect(ok.length, st.title).toBeLessThan(seqs.length);
    }
  });
  it('Pip-Fragen haben eine Antwort', () => {
    for (const l of LESSONS) for (const st of l.steps) if (st.t === 'quiz') expect(st.answer(st.pos)).toBeGreaterThan(0);
  });
  it('Rätsel sind deterministisch und haben einen klar besten Zug', () => {
    const a = genPuzzle(3), b = genPuzzle(3);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.margin).toBeGreaterThanOrEqual(0.035);
    expect(a!.top[0].text).toBe(a!.best);
  });
});

describe('Backgammon: Zug-Ablauf', () => {
  it('Schritt für Schritt bis zum Ende, mit Rücknahme', () => {
    let t = newTurn(startPosition(), 0, [3, 1]);
    expect(nextMoves(t).length).toBeGreaterThan(3);
    const m = pickMove(t, 8, 5)!;
    expect(m).not.toBeNull();
    t = step(t, m);
    expect(isComplete(t)).toBe(false);
    expect(targetsFrom(t, 6)).toContain(5);
    const back = undoStep(t);
    expect(back.played.length).toBe(0);
    t = step(t, pickMove(t, 6, 5)!);
    expect(isComplete(t)).toBe(true);
    expect(t.cur.pts[4]).toBe(2);
  });
  it('Pasch: vier Einzelzüge', () => {
    let t = newTurn(startPosition(), 0, [4, 4]);
    let n = 0;
    while (!isComplete(t) && n < 8) { t = step(t, nextMoves(t)[0]); n++; }
    expect(n).toBe(4);
  });
});
