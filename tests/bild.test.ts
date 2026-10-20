// Bildrätsel: Zeilenlöser gegen vollständige Aufzählung, Gesamtlöser, Eindeutigkeit, Erzeugung, Teilen.
import { describe, expect, it } from 'vitest';
import { cluesOf, countSolutions, decodeNono, encodeNono, generateNono, lineClue, solveLine, solveLogic } from '../src/games/bild/engine';
import { mulberry32 } from '../src/games/shared/rng';

/** alle Belegungen einer Linie mit dieser Hinweisfolge */
function arrangements(clue: number[], n: number): number[][] {
  const out: number[][] = [];
  for (let m = 0; m < 1 << n; m++) {
    const line = Array.from({ length: n }, (_, i) => (m >> i) & 1);
    const c = lineClue(line);
    if (c.join() === clue.join()) out.push(line);
  }
  return out;
}

describe('Bildrätsel: Zeilenlöser', () => {
  it('stimmt mit Aufzählung überein (zufällige Teilwissen-Linien)', () => {
    const rng = mulberry32(11);
    for (let t = 0; t < 600; t++) {
      const n = 3 + Math.floor(rng() * 7);
      const truth = Array.from({ length: n }, () => (rng() < 0.5 ? 1 : 0));
      const clue = lineClue(truth);
      const known = truth.map((v) => (rng() < 0.35 ? v : -1));
      const arr = arrangements(clue, n).filter((a) => a.every((v, i) => known[i] === -1 || known[i] === v));
      const expect_ = Array.from({ length: n }, (_, i) => {
        const vs = new Set(arr.map((a) => a[i]));
        return vs.size === 1 ? [...vs][0] : -1;
      });
      const got = solveLine(clue, known);
      expect(got).not.toBeNull();
      expect(Array.from(got!)).toEqual(expect_);
    }
  });
  it('erkennt Widersprüche', () => {
    expect(solveLine([4], [0, 0, -1, -1, -1])).toBeNull();
    expect(solveLine([2, 2], [1, 1, 1, -1, -1])).toBeNull();
  });
  it('Überlappung bei großem Block', () => {
    expect(Array.from(solveLine([4], new Array(5).fill(-1))!)).toEqual([-1, 1, 1, 1, -1]);
    expect(Array.from(solveLine([0], new Array(4).fill(-1))!)).toEqual([0, 0, 0, 0]);
  });
});

describe('Bildrätsel: Gesamtlöser', () => {
  it('löst ein Beispielbild rein logisch', () => {
    const rows = ['..#..', '.###.', '#####', '.###.', '..#..'];
    const bits = rows.join('').split('').map((c) => (c === '#' ? 1 : 0));
    const p = cluesOf(5, 5, bits);
    const r = solveLogic(p);
    expect(r.status).toBe('solved');
    expect(Array.from(r.grid)).toEqual(bits);
  });
  it('Schachbrett 2×2 ist mehrdeutig', () => {
    const p = cluesOf(2, 2, [1, 0, 0, 1]);
    expect(solveLogic(p).status).toBe('stuck');
    expect(countSolutions(p, 3)).toBe(2);
  });
  it('erzeugte Rätsel sind eindeutig logisch lösbar', () => {
    for (const [w, h, d] of [[5, 5, 'leicht'], [10, 10, 'mittel'], [15, 10, 'schwer'], [20, 20, 'mittel']] as const) {
      const g = generateNono(w, h, d, 42 + w, 2500);
      const r = solveLogic(g.nono);
      expect(r.status).toBe('solved');
      expect(Array.from(r.grid)).toEqual(Array.from(g.bits));
    }
  });
  it('Teilen: Code hin und zurück', () => {
    const bits = Array.from({ length: 7 * 9 }, (_, i) => (i * 7) % 3 === 0 ? 1 : 0);
    const d = decodeNono(encodeNono(7, 9, bits))!;
    expect(d.w).toBe(7); expect(d.h).toBe(9);
    expect(Array.from(d.bits)).toEqual(bits);
  });
});

import { BLESSONS } from '../src/games/bild/data';
import { PICTURES } from '../src/games/bild/pictures';
describe('Bildrätsel: Bilder und Lektionen', () => {
  const toBits = (art: string[]) => art.join('').split('').map((c) => (c === '#' ? 1 : 0));
  for (const p of PICTURES) it(`Bild ${p.name} ist eindeutig und rein logisch lösbar`, () => {
    expect(p.art.every((r) => r.length === p.w)).toBe(true);
    expect(solveLogic(cluesOf(p.w, p.h, toBits(p.art))).status).toBe('solved');
  });
  for (const l of BLESSONS) it(`Lektion ${l.title} ist rein logisch lösbar`, () => {
    expect(l.art.length).toBe(l.h);
    expect(l.art.every((r) => r.length === l.w)).toBe(true);
    expect(solveLogic(cluesOf(l.w, l.h, toBits(l.art))).status).toBe('solved');
  });
});
