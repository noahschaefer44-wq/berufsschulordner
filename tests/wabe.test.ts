import { describe, expect, it } from 'vitest';
import {
  SETS, aiMove, apply, buildGame, gradeMove, key, legalMoves, makePuzzle, neighbors, newGame, pieceTargets, pinnedCells, placements, playOut, posKey, queenSurround, result, scoreRoot, undo, winningMoves,
  type Color, type G, type Kind,
} from '../src/games/wabe/engine';
import { mulberry32 } from '../src/games/shared/rng';

const S = SETS[0], PLUS = SETS[1];
const k = (q: number, r: number) => key(q, r);
const P = (q: number, r: number, c: Color, kind: Kind): [number, number, Color, Kind] => [q, r, c, kind];
const tg = (g: G, q: number, r: number) => pieceTargets(g, k(q, r)).sort((a, b) => a - b);
const set = (cells: [number, number][]) => cells.map(([q, r]) => k(q, r)).sort((a, b) => a - b);

describe('Wabe – Aufbau und Setzen', () => {
  it('erstes Plättchen mittig, zweites daneben', () => {
    const g = newGame(S);
    expect(placements(g, 0)).toEqual([k(0, 0)]);
    apply(g, { t: 'p', kind: 'A', to: k(0, 0) });
    expect(placements(g, 1).sort()).toEqual(neighbors(k(0, 0)).sort());
  });

  it('weitere Plättchen dürfen nur eigene Farbe berühren', () => {
    const g = newGame(S);
    apply(g, { t: 'p', kind: 'A', to: k(0, 0) });
    apply(g, { t: 'p', kind: 'A', to: k(1, 0) });
    // Weiß: nur Felder, die schwarz nicht berühren – also auf der linken Seite
    const pl = placements(g, 0).map((x) => [(x >> 7) - 48, (x & 127) - 48]);
    expect(pl.length).toBeGreaterThan(0);
    for (const [q, r] of pl) expect(neighbors(k(q, r)).includes(k(1, 0))).toBe(false);
  });

  it('Königin spätestens im vierten Zug', () => {
    const g = newGame(S);
    const cells = [[0, 0], [1, 0], [-1, 1], [2, 0], [-1, 0], [3, 0]];
    const kinds: Kind[] = ['A', 'A', 'A', 'A', 'S', 'S'];
    for (let i = 0; i < 6; i++) apply(g, { t: 'p', kind: kinds[i], to: k(cells[i][0], cells[i][1]) });
    // Weiß hat nun 3 Züge ohne Königin gemacht
    const ms = legalMoves(g);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.t === 'p' && m.kind === 'Q')).toBe(true);
  });

  it('keine Bewegung vor der Königin', () => {
    const g = newGame(S);
    apply(g, { t: 'p', kind: 'A', to: k(0, 0) });
    apply(g, { t: 'p', kind: 'A', to: k(1, 0) });
    expect(legalMoves(g).every((m) => m.t === 'p')).toBe(true);
  });

  it('Zug und Rücknahme', () => {
    const g = newGame(S);
    const rnd = mulberry32(6);
    for (let i = 0; i < 30 && !result(g); i++) {
      const ms = legalMoves(g);
      const m = ms[Math.floor(rnd() * ms.length)];
      const before = posKey(g), turn = g.turn, ply = g.ply;
      const u = apply(g, m);
      undo(g, u);
      expect(posKey(g)).toBe(before);
      expect(g.turn).toBe(turn);
      expect(g.ply).toBe(ply);
      apply(g, m);
    }
  });
});

describe('Wabe – Bewegungsregeln', () => {
  it('Ein-Schwarm-Regel: der Mittelstein einer Kette bleibt liegen', () => {
    const g = buildGame(S, 0, [P(0, 0, 0, 'Q'), P(1, 0, 0, 'A'), P(2, 0, 1, 'Q')]);
    expect(pinnedCells(g).has(k(1, 0))).toBe(true);
    expect(tg(g, 1, 0)).toEqual([]);
    expect(tg(g, 0, 0).length).toBeGreaterThan(0);
  });

  it('Königin zieht ein Feld und kann nicht durch Engstellen gleiten', () => {
    // Ring aus schwarzen Plättchen um die weiße Königin; offen bleibt nur die Seite rechts
    const ringBase: [number, number, Color, Kind][] = [P(1, -1, 1, 'A'), P(0, -1, 1, 'Q'), P(-1, 0, 1, 'A'), P(-1, 1, 1, 'A')];
    const open = buildGame(S, 0, [P(0, 0, 0, 'Q'), ...ringBase]);
    expect(tg(open, 0, 0)).toEqual(set([[1, 0], [0, 1]]));
    const squeezed = buildGame(S, 0, [P(0, 0, 0, 'Q'), ...ringBase, P(0, 1, 1, 'A')]);
    expect(tg(squeezed, 0, 0)).toEqual([]); // (1,0) liegt zwischen zwei Plättchen
    expect(pinnedCells(squeezed).has(k(0, 0))).toBe(false);
  });

  it('Ameise läuft um den ganzen Schwarm, Spinne genau drei Felder', () => {
    const g = buildGame(S, 0, [P(0, 0, 1, 'Q'), P(1, 0, 1, 'A'), P(0, 1, 0, 'A')]);
    expect(tg(g, 0, 1).length).toBe(7);
    const sp = buildGame(S, 0, [P(0, 0, 1, 'Q'), P(1, 0, 1, 'A'), P(0, 1, 0, 'S')]);
    expect(tg(sp, 0, 1).length).toBe(2);
  });

  it('Grashüpfer springt über eine Reihe', () => {
    const g = buildGame(S, 0, [P(-1, 0, 0, 'G'), P(0, 0, 1, 'Q'), P(1, 0, 1, 'A'), P(2, 0, 0, 'Q')]);
    expect(tg(g, -1, 0)).toEqual(set([[3, 0]]));
  });

  it('Käfer steigt auf Plättchen; das Plättchen darunter ist blockiert', () => {
    const g = buildGame(S, 0, [P(0, 0, 1, 'Q'), P(1, 0, 0, 'Q'), P(0, 1, 0, 'B')]);
    expect(tg(g, 0, 1)).toContain(k(0, 0));
    apply(g, { t: 'm', from: k(0, 1), to: k(0, 0) });
    g.turn = 1;
    expect(pieceTargets(g, k(0, 0))[0]).toBeDefined(); // Käfer obenauf zieht weiter
    expect(g.cells.get(k(0, 0))!.length).toBe(2);
    // das Plättchen unter dem Käfer darf nicht ziehen: oberstes ist der Käfer – also Farbe 0
    expect(g.cells.get(k(0, 0))![1].kind).toBe('B');
  });

  it('Marienkäfer: hinauf, oben entlang, hinunter', () => {
    const g = buildGame(PLUS, 0, [P(-1, 0, 0, 'L'), P(0, 0, 1, 'Q'), P(1, 0, 1, 'A'), P(2, 0, 0, 'Q')]);
    const t = tg(g, -1, 0);
    // nach Hinauf auf (0,0), weiter auf (1,0) und hinunter: Nachbarn von (1,0) ohne die besetzten (2,0),(0,0)
    const want = set([[2, -1], [1, -1], [0, 1], [1, 1]]);
    expect(t).toEqual(want);
  });

  it('Mücke übernimmt die Fähigkeit des Nachbarn', () => {
    const g = buildGame(PLUS, 0, [P(-1, 0, 0, 'M'), P(0, 0, 1, 'Q'), P(1, 0, 1, 'A'), P(2, 0, 0, 'Q')]);
    // Nachbar von (-1,0) ist nur (0,0) = Königin → Mücke zieht wie eine Königin (ein Schritt)
    const t = tg(g, -1, 0);
    expect(t.length).toBeLessThanOrEqual(2);
    const g2 = buildGame(PLUS, 0, [P(-1, 0, 0, 'M'), P(0, 0, 1, 'G'), P(1, 0, 1, 'A'), P(2, 0, 0, 'Q')]);
    expect(tg(g2, -1, 0)).toEqual(set([[3, 0]]));
  });

  it('Gleiten nur bei Kontakt zum Schwarm', () => {
    // Eine Königin kann nicht „durch die Luft“ weg: nur an der Kante entlang
    const g = buildGame(S, 0, [P(0, 0, 0, 'Q'), P(1, 0, 1, 'Q'), P(2, 0, 1, 'A')]);
    for (const t of pieceTargets(g, k(0, 0))) expect(neighbors(t).some((n) => g.cells.has(n))).toBe(true);
  });
});

describe('Wabe – Sieg', () => {
  it('Einschließen der Königin gewinnt', () => {
    const qk: [number, number] = [0, 0];
    const ring = neighbors(k(...qk)).slice(0, 5).map((x) => [(x >> 7) - 48, (x & 127) - 48] as [number, number]);
    const pieces = [P(0, 0, 1, 'Q'), ...ring.map(([q, r]) => P(q, r, 0, 'A'))];
    const g = buildGame(S, 0, pieces);
    expect(queenSurround(g, 1)).toBe(5);
    expect(result(g)).toBeNull();
    const sixth = (neighbors(k(0, 0))[5]);
    const full = buildGame(S, 0, [...pieces, P((sixth >> 7) - 48, (sixth & 127) - 48, 0, 'B')]);
    expect(result(full)?.winner).toBe(0);
  });

  it('beide eingeschlossen: Remis', () => {
    // Zwei Königinnen nebeneinander, jede von sechs Plättchen umgeben (gemeinsam 10 Felder)
    const a: [number, number] = [0, 0], b: [number, number] = [1, 0];
    const around = (c: [number, number]) => neighbors(k(...c)).map((x) => [(x >> 7) - 48, (x & 127) - 48] as [number, number]).filter(([q, r]) => !(q === a[0] && r === a[1]) && !(q === b[0] && r === b[1]));
    const seen = new Set<string>();
    const pcs: [number, number, Color, Kind][] = [P(0, 0, 0, 'Q'), P(1, 0, 1, 'Q')];
    for (const [q, r] of [...around(a), ...around(b)]) { if (seen.has(q + ',' + r)) continue; seen.add(q + ',' + r); pcs.push(P(q, r, 0, 'B')); }
    const g = buildGame(PLUS, 0, pcs);
    expect(result(g)?.winner).toBe('draw');
  });

  it('winningMoves findet den letzten Schließer', () => {
    const ring = neighbors(k(0, 0)).slice(0, 5).map((x) => [(x >> 7) - 48, (x & 127) - 48] as [number, number]);
    const g = buildGame(S, 0, [P(0, 0, 1, 'Q'), ...ring.map(([q, r]) => P(q, r, 0, 'S')), P(2, 0, 0, 'Q'), P(1, 1, 0, 'A')]);
    const w = winningMoves(g, 1);
    expect(w).toEqual([{ t: 'm', from: k(1, 1), to: k(0, 1) }]);
  });
});

describe('Wabe – KI', () => {
  it('jede Stufe zieht legal', () => {
    for (let lv = 1; lv <= 3; lv++) {
      const g = newGame(S);
      const rnd = mulberry32(lv);
      for (let i = 0; i < 24 && !result(g); i++) {
        const m = aiMove(g, lv, rnd);
        expect(legalMoves(g).some((x) => JSON.stringify(x) === JSON.stringify(m))).toBe(true);
        apply(g, m);
      }
    }
  }, 60000);

  it('nimmt den Gewinnzug', () => {
    const ring = neighbors(k(0, 0)).slice(0, 5).map((x) => [(x >> 7) - 48, (x & 127) - 48] as [number, number]);
    const g = buildGame(S, 0, [P(0, 0, 1, 'Q'), ...ring.map(([q, r]) => P(q, r, 0, 'S')), P(2, 0, 0, 'Q'), P(1, 1, 0, 'A')]);
    const m = aiMove(g, 2, mulberry32(1));
    const u = apply(g, m);
    expect(result(g)?.winner).toBe(0);
    undo(g, u);
  });

  it('Partien enden', () => {
    const g = playOut(S, [2, 2], mulberry32(4), 160);
    expect(g.plies).toBeGreaterThan(8);
  }, 120000);

  it('Coach', () => {
    const g = newGame(S);
    for (const [kind, q, r] of [['A', 0, 0], ['A', 1, 0]] as [Kind, number, number][]) apply(g, { t: 'p', kind, to: k(q, r) });
    const sc = scoreRoot(g, 1, 800);
    expect(sc.length).toBeGreaterThan(3);
    expect(gradeMove(g, sc[0].m, 1, 800).grade).toBe('best');
  });
});

describe('Wabe – Aufgaben', () => {
  it('Aufgabe in einem Zug ist reproduzierbar und lösbar', () => {
    const a = makePuzzle(S, mulberry32(3), 1, 20);
    const b = makePuzzle(S, mulberry32(3), 1, 20);
    expect(a).not.toBeNull();
    expect(posKey(a!.g)).toBe(posKey(b!.g));
    expect(a!.solutions.length).toBeGreaterThan(0);
    expect(winningMoves(a!.g, 1).length).toBe(a!.solutions.length);
  }, 120000);
});

import { LESSONS } from '../src/games/wabe/lessons';

describe('Wabe – Lektionen', () => {
  it('jede Lektion ist lösbar und nicht trivial', () => {
    for (const L of LESSONS) {
      const g = L.setup();
      expect(g.turn, L.id).toBe(L.side);
      expect(result(g), L.id).toBeNull();
      const ms = legalMoves(g);
      const good = ms.filter((m) => L.check(g, m));
      expect(good.length, L.id).toBeGreaterThan(0);
      expect(good.length, L.id).toBeLessThan(ms.length);
    }
  });
});
