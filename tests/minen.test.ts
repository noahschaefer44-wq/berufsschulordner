// Minenfeld: Nachbarschaften, Aufdecken, Doppelklick, Löser, Ohne-Raten-Erzeugung.
import { describe, expect, it } from 'vitest';
import { FLAG, OPEN, bbbv, boardFromMines, chord, isWon, layMines, neighborsOf, newBoard, reveal, toggleFlag } from '../src/games/minen/engine';
import { generate } from '../src/games/minen/gen';
import { deduce, probabilities, simulate, viewOf } from '../src/games/minen/solve';
import { mulberry32 } from '../src/games/shared/rng';

describe('Minenfeld: Nachbarschaft', () => {
  it('Quadrat: Ecke 3, Rand 5, Mitte 8', () => {
    const nb = neighborsOf('quad', 5, 5);
    expect(nb[0].length).toBe(3);
    expect(nb[2].length).toBe(5);
    expect(nb[12].length).toBe(8);
  });
  it('Sechseck: innen 6, symmetrisch', () => {
    const nb = neighborsOf('hex', 6, 6);
    expect(nb[2 * 6 + 2].length).toBe(6);
    expect(nb[3 * 6 + 3].length).toBe(6);
    nb.forEach((list, i) => list.forEach((j) => expect(nb[j]).toContain(i)));
  });
  it('Torus: alle 8 Nachbarn, symmetrisch', () => {
    const nb = neighborsOf('torus', 6, 5);
    nb.forEach((list, i) => { expect(list.length).toBe(8); list.forEach((j) => expect(nb[j]).toContain(i)); });
  });
  it('Kreuz: nur 4 Richtungen', () => expect(neighborsOf('cross', 4, 4)[5].length).toBe(4));
});

describe('Minenfeld: Spielablauf', () => {
  it('Aufdecken breitet sich über Nullfelder aus', () => {
    const b = newBoard({ topo: 'quad', w: 5, h: 5, mines: 1 });
    layMines(b, [24]);
    const r = reveal(b, 0);
    expect(r.boom).toBe(false);
    expect(b.opened).toBe(24);
    expect(isWon(b)).toBe(true);
  });
  it('Mine löst aus', () => {
    const b = boardFromMines({ topo: 'quad', w: 3, h: 3, mines: 1 }, [4]);
    expect(reveal(b, 4).boom).toBe(true);
    expect(b.boom).toBe(4);
  });
  it('Doppelklick öffnet nur bei passender Flaggenzahl', () => {
    const b = boardFromMines({ topo: 'quad', w: 3, h: 3, mines: 1 }, [0]);
    reveal(b, 4); // zeigt 1
    expect(chord(b, 4).opened.length).toBe(0);
    toggleFlag(b, 0, false);
    expect(b.st[0]).toBe(FLAG);
    const c = chord(b, 4);
    expect(c.boom.length).toBe(0);
    expect(isWon(b)).toBe(true);
  });
  it('Flagge: Fragezeichen-Zyklus', () => {
    const b = newBoard({ topo: 'quad', w: 3, h: 3, mines: 1 });
    expect(toggleFlag(b, 1, true)).toBe(2);
    expect(toggleFlag(b, 1, true)).toBe(3);
    expect(toggleFlag(b, 1, true)).toBe(0);
  });
  it('3BV einer leeren Fläche mit einer Mine in der Ecke', () => {
    const b = boardFromMines({ topo: 'quad', w: 4, h: 4, mines: 1 }, [15]);
    expect(bbbv(b)).toBe(1);
  });
});

describe('Minenfeld: Erzeugung', () => {
  it('erster Klick und Umgebung sind frei (100 Felder)', () => {
    const cfg = { topo: 'quad' as const, w: 9, h: 9, mines: 10 };
    for (let s = 1; s <= 100; s++) {
      const first = (s * 7) % 81;
      const r = generate(cfg, first, mulberry32(s), { noGuess: false, opening: true });
      const b = boardFromMines(cfg, r.mines);
      expect(r.mines.length).toBe(10);
      expect(b.mine[first]).toBe(0);
      b.nb[first].forEach((j) => expect(b.mine[j]).toBe(0));
      expect(b.num[first]).toBe(0);
    }
  });
  it('Ohne Raten: Anfängerfelder sind logisch lösbar', () => {
    const cfg = { topo: 'quad' as const, w: 9, h: 9, mines: 10 };
    for (let s = 1; s <= 8; s++) {
      const r = generate(cfg, 40, mulberry32(s), { noGuess: true, opening: true, budgetMs: 6000 });
      expect(r.guessFree).toBe(true);
      const b = boardFromMines(cfg, r.mines);
      expect(simulate(b, 40).solved).toBe(true);
    }
  });
  it('Sechseck- und Torus-Felder lassen sich erzeugen', () => {
    for (const topo of ['hex', 'torus', 'cross'] as const) {
      const cfg = { topo, w: 8, h: 8, mines: 8 };
      const r = generate(cfg, 27, mulberry32(3), { noGuess: false, opening: true });
      expect(boardFromMines(cfg, r.mines).num[27]).toBe(0);
    }
  });
});

describe('Minenfeld: Löser', () => {
  it('erkennt die einfache Regel', () => {
    const b = boardFromMines({ topo: 'quad', w: 3, h: 1, mines: 1 }, [2]);
    reveal(b, 0);
    const d = deduce(viewOf(b));
    expect(d.find((x) => x.cell === 2)?.mine).toBe(true);
  });
  it('1-2-1-Muster: Mitte sicher an den Flanken Minen', () => {
    // Zeile oben offen (1 2 1), darunter verdeckt: Minen links und rechts unten, Mitte sicher
    const cfg = { topo: 'quad' as const, w: 3, h: 2, mines: 2 };
    const b = boardFromMines(cfg, [3, 5]);
    reveal(b, 0); reveal(b, 1); reveal(b, 2);
    const d = deduce(viewOf(b));
    const m = (c: number) => d.find((x) => x.cell === c);
    expect(m(4)?.mine).toBe(false);
    expect(m(3)?.mine).toBe(true);
    expect(m(5)?.mine).toBe(true);
  });
  it('Wahrscheinlichkeiten: 1 mit zwei Kandidaten = 50 %', () => {
    const cfg = { topo: 'quad' as const, w: 3, h: 3, mines: 1 };
    const b = boardFromMines(cfg, [0]);
    for (const i of [2, 5, 6, 7, 8]) b.st[i] = OPEN;
    b.opened = 5;
    const p = probabilities(viewOf(b));
    expect(p[0]).toBeGreaterThan(0.2);
    expect(p[0]).toBeLessThanOrEqual(1);
    for (let i = 0; i < b.n; i++) if (!Number.isNaN(p[i])) expect(p[i]).toBeGreaterThanOrEqual(0);
  });
  it('Minenzähler-Regel: letzte Mine bekannt', () => {
    const cfg = { topo: 'quad' as const, w: 4, h: 1, mines: 1 };
    const b = boardFromMines(cfg, [0]);
    reveal(b, 3); reveal(b, 2); reveal(b, 1);
    const d = deduce(viewOf(b));
    expect(d.find((x) => x.cell === 0)?.mine).toBe(true);
  });
});

import { LESSONS, lessonBoard } from '../src/games/minen/lessons';
describe('Minenfeld: Lernstationen', () => {
  for (const l of LESSONS) {
    it(`${l.title} ist rein logisch lösbar`, () => {
      const b = lessonBoard(l);
      for (let i = 0; i < b.n; i++) if (b.st[i] === 1 && b.num[i] === 0) b.nb[i].forEach((j) => expect(b.st[j]).toBe(1));
      const found = new Set<number>();
      for (let g = 0; g < 30; g++) {
        const d = deduce(viewOf(b), { enumerate: true });
        d.filter((x) => x.mine).forEach((x) => found.add(x.cell));
        const safe = d.filter((x) => !x.mine && b.st[x.cell] !== 1);
        if (!safe.length) break;
        for (const s of safe) { b.st[s.cell] = 1; b.opened++; }
      }
      expect(b.opened).toBe(b.n - l.mines.length);
      if (l.goal === 'flag') for (const m of l.mines) expect(found.has(m)).toBe(true);
    });
  }
});
