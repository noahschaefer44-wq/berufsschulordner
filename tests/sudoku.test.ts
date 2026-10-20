// Sudoku: Löser, Erzeugung (alle Varianten), logische Techniken.
import { describe, expect, it } from 'vitest';
import { VARIANTS, buildSpec, solve, type Variant } from '../src/games/sudoku/engine';
import { generate } from '../src/games/sudoku/gen';
import { applyStep, consistent, initState, nextStep, rate } from '../src/games/sudoku/logic';

const CLASSIC = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const CLASSIC_SOL = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('Sudoku: Löser', () => {
  it('löst ein klassisches Rätsel eindeutig', () => {
    const spec = buildSpec('klassik');
    const r = solve(spec, Array.from(CLASSIC, Number), 2);
    expect(r.count).toBe(1);
    expect(Array.from(r.solution!).join('')).toBe(CLASSIC_SOL);
  });
  it('erkennt mehrere Lösungen und Widersprüche', () => {
    const spec = buildSpec('klassik');
    expect(solve(spec, new Array(81).fill(0), 2).count).toBe(2);
    const bad = Array.from(CLASSIC, Number);
    bad[2] = 5; // zweite 5 in Zeile 1
    expect(solve(spec, bad, 2).count).toBe(0);
  });
  it('Logik löst das Beispiel vollständig mit einfachen Techniken', () => {
    const spec = buildSpec('klassik');
    const r = rate(spec, Array.from(CLASSIC, Number));
    expect(r.solved).toBe(true);
    expect(r.weight).toBeLessThanOrEqual(2);
  });
});

describe('Sudoku: Erzeugung', () => {
  for (const v of VARIANTS) {
    it(`${v.name}: eindeutig und logisch kohärent`, () => {
      const p = generate(v.id as Variant, 'leicht', 12345, 3000);
      const spec = buildSpec(p.variant, p.cages);
      const r = solve(spec, p.givens, 2);
      expect(r.count).toBe(1);
      expect(Array.from(r.solution!)).toEqual(p.solution);
      // Lösung respektiert alle Gruppen
      for (const g of spec.groups) expect(new Set(g.map((c) => p.solution[c])).size).toBe(spec.n);
      // Käfig-Summen stimmen
      for (const cg of p.cages) expect(cg.cells.reduce((a, c) => a + p.solution[c], 0)).toBe(cg.sum);
      // Springer-Regel
      if (v.id === 'ritter') for (let i = 0; i < 81; i++) for (const j of spec.peers[i]) expect(p.solution[i]).not.toBe(p.solution[j]);
    });
  }
  it('gleicher Startwert ergibt dasselbe Rätsel', () => {
    const a = generate('klassik', 'mittel', 777, 1500), b = generate('klassik', 'mittel', 777, 1500);
    expect(a.givens).toEqual(b.givens);
  });
  it('schwerere Stufen haben weniger Vorgaben', () => {
    const e = generate('klassik', 'leicht', 5, 1500), h = generate('klassik', 'schwer', 5, 2500);
    expect(h.givens.filter(Boolean).length).toBeLessThan(e.givens.filter(Boolean).length);
  });
});

describe('Sudoku: Techniken widersprechen der Lösung nie', () => {
  for (const [v, lv] of [['klassik', 'experte'], ['x', 'schwer'], ['hyper', 'schwer'], ['killer', 'mittel'], ['ritter', 'mittel'], ['mini', 'schwer']] as const) {
    it(`${v} (${lv})`, () => {
      const p = generate(v, lv, 99, 2500);
      const spec = buildSpec(p.variant, p.cages);
      const s = initState(spec, p.givens);
      for (let k = 0; k < 300; k++) {
        const st = nextStep(spec, s);
        if (!st) break;
        if (st.place) expect(st.place.d).toBe(p.solution[st.place.cell]);
        for (const e of st.elim) expect(p.solution[e.cell]).not.toBe(e.d);
        applyStep(spec, s, st);
        expect(consistent(s)).toBe(true);
      }
    });
  }
});
