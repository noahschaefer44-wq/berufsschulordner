import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, FLEETS, aiFleet, aliveShips, allSunk, around, bestShots, canPlace, densityMap, fire, idx, knowledgeOf, newSide, radar, randomFleet, shipCells, simulate, type Ship } from '../src/games/schiff/engine';
import { mulberry32 } from '../src/games/shared/rng';

describe('Seeschlacht: Flotte', () => {
  it('Schiffszellen und Ränder', () => {
    expect(shipCells(10, 0, 0, 5, true)).toEqual([0, 1, 2, 3, 4]);
    expect(shipCells(10, 8, 0, 5, true)).toBeNull();
    expect(shipCells(10, 0, 8, 3, false)).toBeNull();
    expect(shipCells(10, 3, 2, 3, false)).toEqual([23, 33, 43]);
  });
  it('Abstandsregel: keine Berührung, auch nicht diagonal', () => {
    const a: Ship = { id: 0, len: 3, cells: [0, 1, 2] };
    expect(canPlace(10, [a], [10, 11], false)).toBe(true);
    expect(canPlace(10, [a], [10, 11], true)).toBe(false);
    expect(canPlace(10, [a], [30, 31], true)).toBe(true);
    expect(canPlace(10, [a], [3, 4], true)).toBe(false);
    expect(canPlace(10, [a], [13, 14], true)).toBe(false);
    expect(canPlace(10, [a], [4, 5], true)).toBe(true);
    expect(canPlace(10, [a], [1, 11], false)).toBe(false);
  });
  it('Zufallsflotten sind gültig (mit und ohne Abstand)', () => {
    for (const spacing of [false, true]) for (let s = 1; s <= 20; s++) {
      const fleet = randomFleet(10, [5, 4, 3, 3, 2], spacing, mulberry32(s))!;
      expect(fleet).not.toBeNull();
      expect(fleet.length).toBe(5);
      const all = fleet.flatMap((x) => x.cells);
      expect(new Set(all).size).toBe(17);
      if (spacing) for (const sh of fleet) for (const o of fleet) if (sh !== o) for (const c of sh.cells) for (const a of around(10, c)) expect(o.cells.includes(a)).toBe(false);
    }
  });
  it('alle Standardflotten passen auf ihr Brett', () => {
    for (const f of Object.values(FLEETS)) expect(randomFleet(f.n, f.lens, true, mulberry32(3))).not.toBeNull();
  });
});

describe('Seeschlacht: Schüsse', () => {
  const ships: Ship[] = [{ id: 0, len: 2, cells: [0, 1] }, { id: 1, len: 3, cells: [20, 30, 40] }];
  it('Wasser, Treffer, Versenkt', () => {
    const s = newSide(10, ships);
    expect(fire(s, 55).kind).toBe('wasser');
    expect(fire(s, 0).kind).toBe('treffer');
    const r = fire(s, 1);
    expect(r.kind).toBe('versenkt');
    expect(r.ship?.id).toBe(0);
    expect(fire(s, 1).already).toBe(true);
    expect(aliveShips(s).length).toBe(1);
    fire(s, 20); fire(s, 30);
    expect(allSunk(s)).toBe(false);
    fire(s, 40);
    expect(allSunk(s)).toBe(true);
  });
  it('Radar zählt Schiffszellen in der 3×3-Umgebung', () => {
    const s = newSide(10, ships);
    expect(radar(s, 10, 11)).toBe(3); // 0, 1, 20? 11 umgibt 0,1,2,10,12,20,21,22 → 0,1,20 = 3
    expect(radar(s, 10, 88)).toBe(0);
  });
});

describe('Seeschlacht: KI', () => {
  it('nach einem Treffer sind die Nachbarn am wahrscheinlichsten', () => {
    const s = newSide(10, [{ id: 0, len: 4, cells: [44, 45, 46, 47] }]);
    fire(s, 45);
    const k = knowledgeOf(s, { ...DEFAULT_RULES, lens: [4] });
    const top = bestShots(k, 4, mulberry32(1), false);
    for (const t of top) expect([35, 44, 46, 55, 25, 43, 47, 65, 36, 37, 54, 56, 34, 24, 66]).toContain(t);
    expect(top.some((t) => t === 44 || t === 46)).toBe(true);
  });
  it('Wasserfelder haben Dichte 0, versenkte Schiffe werden nicht doppelt gezählt', () => {
    const s = newSide(10, [{ id: 0, len: 2, cells: [0, 1] }, { id: 1, len: 3, cells: [50, 51, 52] }]);
    fire(s, 5);
    const k = knowledgeOf(s, { ...DEFAULT_RULES, lens: [2, 3] });
    const d = densityMap(k);
    expect(d[5]).toBe(0);
    expect(d[6]).toBeGreaterThan(0);
  });
  it('Stufen werden besser: Mittelwert der Schusszahlen fällt', () => {
    const avg = (lv: number) => { let t = 0; const N = 30; for (let i = 0; i < N; i++) t += simulate(lv, DEFAULT_RULES, mulberry32(100 + i)); return t / N; };
    const a1 = avg(1), a2 = avg(2), a4 = avg(4);
    expect(a2).toBeLessThan(a1);
    expect(a4).toBeLessThan(a2);
    expect(a4).toBeLessThan(62);
  }, 60000);
  it('KI-Flotte gültig', () => {
    const f = aiFleet({ ...DEFAULT_RULES, spacing: true }, mulberry32(9));
    expect(f.length).toBe(5);
    expect(idx(10, 3, 4)).toBe(43);
  });
});

import { genTactic, tacticOk } from '../src/games/schiff/tactics';
import { LEVELS_S, MISSIONS } from '../src/games/schiff/data';
describe('Seeschlacht: Taktik und Daten', () => {
  it('Aufgaben sind deterministisch und lösbar', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = genTactic(seed), b = genTactic(seed);
      expect(a).not.toBeNull();
      expect(a!.best).toEqual(b!.best);
      expect(a!.best.length).toBeGreaterThan(0);
      for (const c of a!.best) expect(tacticOk(a!, c)).toBe(true);
      expect(a!.remaining.length).toBeGreaterThan(0);
    }
  });
  it('Missionen haben gültige Flotten und steigende Stärke', () => {
    expect(MISSIONS.length).toBe(8);
    for (const m of MISSIONS) expect(FLEETS[m.fleet]).toBeDefined();
    expect(LEVELS_S.length).toBe(5);
  });
});
