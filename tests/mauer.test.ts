import { describe, expect, it } from 'vitest';
import { apply, aiMove, allWalls, bestWallGain, distance, gradeMove, legal, makePuzzle, newState, notate, parseMove, pawnMoves, playOut, PRESETS, scoreMoves, shortestPath, undo, wallLegal, winner, type Move } from '../src/games/mauer/engine';
import { mulberry32 } from '../src/games/shared/rng';

const R9 = { n: 9, walls: 10 };

describe('Mauerbau – Regeln', () => {
  it('Grundstellung', () => {
    const s = newState(R9);
    expect(s.pawn[0]).toEqual({ r: 8, c: 4 });
    expect(s.pawn[1]).toEqual({ r: 0, c: 4 });
    expect(distance(s, 0)).toBe(8);
    expect(distance(s, 1)).toBe(8);
    expect(pawnMoves(s).length).toBe(3);
  });

  it('Sprung über den Gegner, Diagonalsprung bei Mauer dahinter', () => {
    const s = newState(R9);
    s.pawn[0] = { r: 4, c: 4 }; s.pawn[1] = { r: 3, c: 4 };
    let t = pawnMoves(s).map((p) => `${p.r},${p.c}`).sort();
    expect(t).toContain('2,4');
    expect(t).not.toContain('3,4');
    // Mauer hinter dem Gegner: waagerecht unter Zeile 2 über Spalten 4/5
    s.hw[2 * 8 + 4] = 1;
    t = pawnMoves(s).map((p) => `${p.r},${p.c}`).sort();
    expect(t).not.toContain('2,4');
    expect(t).toContain('3,3');
    expect(t).toContain('3,5');
  });

  it('Mauer: Überschneidung, Kreuzung, Rand', () => {
    const s = newState(R9);
    expect(wallLegal(s, { t: 'h', r: 3, c: 3 })).toBe(true);
    s.hw[3 * 8 + 3] = 1;
    expect(wallLegal(s, { t: 'h', r: 3, c: 3 })).toBe(false);
    expect(wallLegal(s, { t: 'h', r: 3, c: 2 })).toBe(false);
    expect(wallLegal(s, { t: 'h', r: 3, c: 4 })).toBe(false);
    expect(wallLegal(s, { t: 'h', r: 3, c: 5 })).toBe(true);
    expect(wallLegal(s, { t: 'v', r: 3, c: 3 })).toBe(false); // Kreuzung
    expect(wallLegal(s, { t: 'v', r: 2, c: 3 })).toBe(true);
    expect(wallLegal(s, { t: 'h', r: 8, c: 0 })).toBe(false);
  });

  it('Mauer darf den Weg nicht vollständig versperren', () => {
    const s = newState({ n: 5, walls: 9 });
    // Reihe unter Zeile 1 fast komplett zumauern: c=0 und c=2, dann c=... bleibt Lücke bei Spalte 4
    s.hw[1 * 4 + 0] = 1; s.hw[1 * 4 + 2] = 1;
    s.turn = 0;
    expect(wallLegal(s, { t: 'h', r: 1, c: 3 })).toBe(false);
  });

  it('Zug und Rücknahme', () => {
    const s = newState(R9);
    const before = JSON.stringify([s.pawn, s.left, Array.from(s.hw), Array.from(s.vw), s.turn]);
    const u1 = apply(s, { t: 'm', r: 7, c: 4 });
    const u2 = apply(s, { t: 'h', r: 3, c: 3 });
    expect(s.left[1]).toBe(9);
    undo(s, u2); undo(s, u1);
    expect(JSON.stringify([s.pawn, s.left, Array.from(s.hw), Array.from(s.vw), s.turn])).toBe(before);
  });

  it('Sieg bei Zielreihe', () => {
    const s = newState(R9);
    s.pawn[0] = { r: 1, c: 0 };
    apply(s, { t: 'm', r: 0, c: 0 });
    expect(winner(s)).toBe(0);
    expect(legal(s, { t: 'm', r: 1, c: 0 })).toBe(false);
  });

  it('Notation hin und zurück', () => {
    const s = newState(R9);
    for (const m of allWalls(s).slice(0, 40)) expect(parseMove(9, notate(9, m))).toEqual(m);
    for (const p of pawnMoves(s)) expect(parseMove(9, notate(9, { t: 'm', ...p }))).toEqual({ t: 'm', ...p });
    expect(notate(9, { t: 'm', r: 8, c: 4 })).toBe('e1');
    expect(parseMove(9, 'zz')).toBeNull();
  });

  it('Voreinstellungen sind spielbar', () => {
    for (const p of PRESETS) {
      const s = newState(p.rules);
      expect(distance(s, 0)).toBe(p.rules.n - 1);
      expect(shortestPath(s, 0).length).toBe(p.rules.n);
    }
  });

  it('Vorgebaute Mauern (Labyrinth) werden gesetzt', () => {
    const pre: Move[] = [{ t: 'h', r: 2, c: 2 }, { t: 'v', r: 4, c: 4 }];
    const s = newState({ n: 9, walls: 10, pre });
    expect(s.hw[2 * 8 + 2]).toBe(1);
    expect(s.vw[4 * 8 + 4]).toBe(1);
  });
});

describe('Mauerbau – KI', () => {
  it('jede Stufe liefert nur legale Züge', () => {
    const rnd = mulberry32(5);
    for (let lv = 1; lv <= 4; lv++) {
      const s = newState({ n: 5, walls: 3 });
      for (let i = 0; i < 14 && winner(s) === null; i++) {
        const m = aiMove(s, lv, rnd);
        expect(legal(s, m)).toBe(true);
        apply(s, m);
      }
    }
  });

  it('beendet Partien', () => {
    const rnd = mulberry32(11);
    const g = playOut({ n: 5, walls: 3 }, [1, 1], rnd);
    expect(g.winner).not.toBeNull();
  });

  it('nimmt den Sieg mit', () => {
    const s = newState(R9);
    s.pawn[0] = { r: 1, c: 2 };
    expect(aiMove(s, 3)).toEqual({ t: 'm', r: 0, c: 2 });
  });

  it('Stufe 3 schlägt Stufe 1 meistens', () => {
    const rnd = mulberry32(21);
    let w = 0;
    for (let i = 0; i < 6; i++) {
      const g = playOut({ n: 5, walls: 3 }, i % 2 ? [1, 3] : [3, 1], rnd);
      if (g.winner === (i % 2 ? 1 : 0)) w++;
    }
    expect(w).toBeGreaterThanOrEqual(5);
  }, 60000);

  it('Mauer setzen, wenn der Gegner einen Schritt vor dem Ziel steht', () => {
    const s = newState({ n: 7, walls: 6 });
    s.pawn[1] = { r: 5, c: 3 }; s.pawn[0] = { r: 3, c: 3 };
    s.turn = 0;
    const m = aiMove(s, 3);
    expect(m.t === 'm' ? false : true).toBe(true);
  });
});

describe('Mauerbau – Coach und Aufgaben', () => {
  it('bewertet Züge', () => {
    const s = newState({ n: 7, walls: 6 });
    const sc = scoreMoves(s, 2, 8, 800);
    expect(sc.length).toBeGreaterThanOrEqual(3);
    const g = gradeMove(s, sc[0].m, 2, 800);
    expect(g.grade).toBe('best');
  });

  it('Aufgaben sind reproduzierbar und gültig', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const a = makePuzzle(seed, 'race'), b = makePuzzle(seed, 'race');
      expect(a.answer).toBe(b.answer);
      const d0 = distance(a.state, 0), d1 = distance(a.state, 1);
      const w = d0 < d1 ? 0 : d1 < d0 ? 1 : a.state.turn;
      expect(a.answer).toBe(w);
      const p = makePuzzle(seed, 'wall');
      expect(p.best).toBe(bestWallGain(p.state));
      expect(p.best).toBeGreaterThanOrEqual(1);
    }
  });
});

import { LESSONS } from '../src/games/mauer/lessons';
import { allWalls as aw, labyrinth, wallDeltas } from '../src/games/mauer/engine';

describe('Mauerbau – Lektionen und Labyrinth', () => {
  it('jede Lektion ist lösbar und nicht trivial', () => {
    for (const L of LESSONS) {
      const s = L.setup();
      const moves: Move[] = [...pawnMoves(s).map((p) => ({ t: 'm' as const, r: p.r, c: p.c })), ...aw(s)];
      const good = moves.filter((m) => L.check(s, m));
      expect(good.length, L.id).toBeGreaterThan(0);
      expect(good.length, L.id).toBeLessThan(moves.length);
    }
  });

  it('Labyrinth ist punktsymmetrisch und lässt Wege offen', () => {
    for (const n of [7, 9, 11]) {
      const pre = labyrinth(n, 4, mulberry32(n));
      expect(pre.length).toBeGreaterThanOrEqual(4);
      const s = newState({ n, walls: 6, pre });
      expect(distance(s, 0)).toBeGreaterThan(0);
      expect(distance(s, 1)).toBeGreaterThan(0);
      for (const m of pre) expect(pre.some((x) => x.t === m.t && x.r === n - 2 - m.r && x.c === n - 2 - m.c)).toBe(true);
    }
  });

  it('wallDeltas misst Kosten', () => {
    const s = newState(R9);
    s.pawn[1] = { r: 7, c: 4 };
    const d = wallDeltas(s, { t: 'h', r: 7, c: 4 });
    expect(d.opp).toBeGreaterThanOrEqual(1);
  });
});
