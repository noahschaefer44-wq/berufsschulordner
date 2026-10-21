import { describe, expect, it } from 'vitest';
import { ATT, DEF, EMPTY, KING, VARIANTS, aiMove, clearTable, fullHash, gradeMove, kingDistance, kingExits, legalMoves, make, makePuzzle, movesFrom, newPos, notate, parseMove, playOut, result, scoreRoot, throneOf, unmake, winningMoves, type Pos } from '../src/games/wikinger/engine';
import { mulberry32 } from '../src/games/shared/rng';

const V = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));
const empty = (id: string, turn: 0 | 1 = 0): Pos => { const p = newPos(V[id]); p.b.fill(EMPTY); p.turn = turn; return p; };
const put = (p: Pos, r: number, c: number, x: number) => { p.b[r * p.n + c] = x; return p; };
const at = (p: Pos, r: number, c: number) => p.b[r * p.n + c];
const mv = (p: Pos, r1: number, c1: number, r2: number, c2: number) => ({ from: r1 * p.n + c1, to: r2 * p.n + c2 });

describe('Wikingerschach – Aufstellung', () => {
  it('Figurenzahlen', () => {
    const cnt = (p: Pos, x: number) => Array.from(p.b).filter((y) => y === x).length;
    const exp: Record<string, [number, number]> = { brandubh: [8, 4], tablut: [16, 8], kopenhagen: [24, 12] };
    for (const v of VARIANTS) {
      const p = newPos(v);
      expect(cnt(p, ATT), v.id).toBe(exp[v.id][0]);
      expect(cnt(p, DEF), v.id).toBe(exp[v.id][1]);
      expect(cnt(p, KING)).toBe(1);
      expect(p.b[throneOf(v.n)]).toBe(KING);
    }
  });

  it('Aufstellung ist punktsymmetrisch', () => {
    for (const v of VARIANTS) {
      const p = newPos(v), n = v.n;
      for (let i = 0; i < n * n; i++) expect(p.b[i]).toBe(p.b[n * n - 1 - i]);
    }
  });

  it('Angreifer beginnen und haben Züge', () => {
    for (const v of VARIANTS) { const p = newPos(v); expect(p.turn).toBe(0); expect(legalMoves(p).length).toBeGreaterThan(10); }
  });
});

describe('Wikingerschach – Regeln', () => {
  it('Figuren ziehen wie Türme und springen nicht', () => {
    const p = empty('brandubh');
    put(p, 0, 0 + 1, ATT); put(p, 0, 4, DEF);
    const to = movesFrom(p, 1).sort((a, b) => a - b);
    expect(to).toEqual([2, 3, 8, 15, 22, 29, 36, 43].sort((a, b) => a - b).filter((i) => i !== 0));
  });

  it('Nur der König betritt Thron und Ecken', () => {
    const p = empty('brandubh');
    put(p, 3, 0, ATT); put(p, 0, 3, DEF); put(p, 0, 5, KING);
    expect(movesFrom(p, 3 * 7)).not.toContain(3 * 7 + 3); // Thron (3,3)
    expect(movesFrom(p, 3 * 7)).toContain(3 * 7 + 2);
    expect(movesFrom(p, 3 * 7)).not.toContain(0); // Ecke
    expect(movesFrom(p, 5)).toContain(6); // König in die Ecke
    // über den leeren Thron darf gezogen werden
    expect(movesFrom(p, 3 * 7)).toContain(3 * 7 + 4);
  });

  it('Schlagen zwischen zwei Gegnern', () => {
    const p = empty('kopenhagen');
    put(p, 5, 3, DEF); put(p, 5, 2, ATT); put(p, 8, 4, ATT); put(p, 0, 5, KING);
    make(p, mv(p, 8, 4, 5, 4));
    expect(at(p, 5, 3)).toBe(EMPTY);
  });

  it('Eigener Zug zwischen zwei Gegner ist sicher', () => {
    const p = empty('kopenhagen');
    put(p, 5, 2, ATT); put(p, 5, 4, ATT); put(p, 8, 3, DEF); put(p, 0, 5, KING);
    p.turn = 1;
    make(p, mv(p, 8, 3, 5, 3));
    expect(at(p, 5, 3)).toBe(DEF);
  });

  it('Der König schlägt mit (bewaffnet)', () => {
    const q = empty('kopenhagen', 1);
    put(q, 5, 4, ATT); put(q, 5, 5, KING); put(q, 4, 3, DEF); put(q, 9, 9, ATT);
    make(q, mv(q, 4, 3, 5, 3));
    expect(at(q, 5, 4)).toBe(EMPTY);
  });

  it('Leerer Thron ist feindlich für beide Seiten', () => {
    const p = empty('kopenhagen');
    // Verteidiger am Thron (5,5)-Nachbar (5,4); Angreifer zieht auf (5,3) → Thron als Amboss
    put(p, 5, 4, DEF); put(p, 9, 3, ATT); put(p, 0, 5, KING);
    make(p, mv(p, 9, 3, 5, 3));
    expect(at(p, 5, 4)).toBe(EMPTY);
    // Angreifer neben leerem Thron wird von einem Verteidiger geschlagen
    const q = empty('kopenhagen', 1);
    put(q, 5, 4, ATT); put(q, 9, 3, DEF); put(q, 0, 5, KING);
    make(q, mv(q, 9, 3, 5, 3));
    expect(at(q, 5, 4)).toBe(EMPTY);
  });

  it('Ecken sind feindlich', () => {
    const q = empty('kopenhagen');
    put(q, 0, 1, DEF); put(q, 0, 4, ATT); put(q, 5, 5, KING);
    make(q, mv(q, 0, 4, 0, 2));
    expect(at(q, 0, 1)).toBe(EMPTY);
  });

  it('König: vier Seiten in Kopenhagen', () => {
    const p = empty('kopenhagen');
    put(p, 2, 2, KING); put(p, 2, 1, ATT); put(p, 2, 3, ATT); put(p, 1, 2, ATT); put(p, 6, 2, ATT);
    make(p, mv(p, 6, 2, 3, 2));
    expect(p.b.indexOf(KING)).toBe(-1);
    expect(result(p)?.winner).toBe(0);
    // nur zwei Seiten genügen nicht
    const q = empty('kopenhagen');
    put(q, 2, 2, KING); put(q, 2, 1, ATT); put(q, 6, 3, ATT);
    make(q, mv(q, 6, 3, 2, 3));
    expect(q.b.indexOf(KING)).toBeGreaterThanOrEqual(0);
  });

  it('König: zwei Seiten in Brandubh, vier am Thron', () => {
    const p = empty('brandubh');
    put(p, 1, 1, KING); put(p, 1, 0, ATT); put(p, 6, 2, ATT);
    make(p, mv(p, 6, 2, 1, 2));
    expect(p.b.indexOf(KING)).toBe(-1);
    const q = empty('brandubh');
    put(q, 3, 3, KING); put(q, 3, 2, ATT); put(q, 3, 4, ATT);
    put(q, 6, 3, ATT);
    make(q, mv(q, 6, 3, 4, 3));
    expect(q.b.indexOf(KING)).toBeGreaterThanOrEqual(0); // noch drei Seiten
  });

  it('König neben dem Thron: drei Angreifer', () => {
    const p = empty('kopenhagen');
    put(p, 5, 4, KING); put(p, 4, 4, ATT); put(p, 6, 4, ATT); put(p, 9, 3, ATT);
    make(p, mv(p, 9, 3, 5, 3));
    expect(p.b.indexOf(KING)).toBe(-1);
  });

  it('Flucht: Ecke (Brandubh) bzw. Rand (Tablut)', () => {
    const p = empty('brandubh', 1);
    put(p, 0, 3, KING); put(p, 6, 6, ATT);
    const u = make(p, mv(p, 0, 3, 0, 0));
    expect(result(p)?.winner).toBe(1);
    unmake(p, u);
    expect(result(p)).toBeNull();
    const t = empty('tablut', 1);
    put(t, 3, 3, KING); put(t, 8, 8, ATT);
    make(t, mv(t, 3, 3, 3, 0));
    expect(result(t)?.winner).toBe(1);
  });

  it('Zug und Rücknahme stellen alles wieder her', () => {
    const p = newPos(V.kopenhagen);
    for (let i = 0; i < 40; i++) {
      const ms = legalMoves(p);
      const m = ms[(i * 7) % ms.length];
      const before = Array.from(p.b), h = p.hash, tr = p.turn;
      const u = make(p, m);
      unmake(p, u);
      expect(Array.from(p.b)).toEqual(before);
      expect(p.hash).toBe(h);
      expect(p.turn).toBe(tr);
      make(p, m);
    }
  });

  it('Hash wird inkrementell richtig geführt', () => {
    const p = newPos(V.kopenhagen);
    const rnd = mulberry32(31);
    for (let i = 0; i < 80 && !result(p); i++) {
      const ms = legalMoves(p);
      make(p, ms[Math.floor(rnd() * ms.length)]);
      expect(p.hash).toBe(fullHash(p));
    }
  });

  it('keine Züge → Gegner gewinnt', () => {
    const p = empty('brandubh', 0);
    put(p, 0, 0 + 3, KING); put(p, 3, 3 + 0, EMPTY);
    put(p, 6, 6, EMPTY);
    // Angreifer ohne Figuren
    expect(result(p)?.winner).toBe(1);
  });

  it('Notation hin und zurück', () => {
    const p = newPos(V.kopenhagen);
    for (const m of legalMoves(p).slice(0, 30)) expect(parseMove(11, notate(p, m))).toEqual(m);
    expect(parseMove(11, 'xx')).toBeNull();
  });
});

describe('Wikingerschach – König und Bewertung', () => {
  it('Fluchtfelder und Distanz', () => {
    const p = empty('brandubh', 1);
    put(p, 0, 3, KING);
    expect(kingExits(p).sort()).toEqual([0, 6]);
    expect(kingDistance(p)).toBe(1);
    const q = empty('brandubh', 1);
    put(q, 3, 3, KING);
    expect(kingDistance(q)).toBe(2);
  });
});

describe('Wikingerschach – KI', () => {
  it('nimmt die Flucht mit', () => {
    for (let lv = 1; lv <= 3; lv++) {
      const p = empty('brandubh', 1);
      put(p, 0, 3, KING); put(p, 6, 6, ATT); put(p, 4, 4, ATT);
      const m = aiMove(p, lv, mulberry32(3));
      expect(m.from).toBe(3);
      expect([0, 6]).toContain(m.to);
    }
  });

  it('fängt den König, wenn möglich', () => {
    const p = empty('brandubh', 0);
    put(p, 1, 1, KING); put(p, 1, 0, ATT); put(p, 6, 2, ATT);
    expect(aiMove(p, 2, mulberry32(1))).toEqual(mv(p, 6, 2, 1, 2));
  });

  it('jede Stufe zieht nur legal, auch auf 11×11', () => {
    const rnd = mulberry32(8);
    for (const lv of [1, 2, 3]) {
      const p = newPos(V.kopenhagen);
      clearTable();
      for (let i = 0; i < 6; i++) {
        const m = aiMove(p, lv, rnd);
        expect(legalMoves(p).some((x) => x.from === m.from && x.to === m.to)).toBe(true);
        make(p, m);
      }
    }
  }, 60000);

  it('Partien enden (Brandubh)', () => {
    const rnd = mulberry32(2);
    const g = playOut(V.brandubh, [2, 2], rnd, 160);
    expect(g.plies).toBeGreaterThan(5);
  }, 120000);

  it('Stufe 3 schlägt Stufe 1 (Brandubh, beide Seiten)', () => {
    const rnd = mulberry32(5);
    let w = 0;
    for (let i = 0; i < 4; i++) {
      const lv: [number, number] = i % 2 ? [1, 3] : [3, 1];
      const g = playOut(V.brandubh, lv, rnd, 200);
      if (g.winner === (i % 2 ? 1 : 0)) w++;
    }
    expect(w).toBeGreaterThanOrEqual(3);
  }, 180000);

  it('Coach bewertet', () => {
    const p = newPos(V.brandubh);
    const sc = scoreRoot(p, 2, 800);
    expect(sc.length).toBeGreaterThan(5);
    expect(gradeMove(p, sc[0].mv, 2, 800).grade).toBe('best');
  });
});

describe('Wikingerschach – Aufgaben', () => {
  it('winningMoves findet Ein-Zug-Fluchten und Königsfang', () => {
    const p = empty('brandubh', 1);
    put(p, 0, 3, KING); put(p, 6, 6, ATT);
    expect(winningMoves(p, 1).length).toBe(2);
    const q = empty('brandubh', 0);
    put(q, 1, 1, KING); put(q, 1, 0, ATT); put(q, 6, 2, ATT);
    expect(winningMoves(q, 1)).toEqual([mv(q, 6, 2, 1, 2)]);
  });

  it('Gabel: König bedroht zwei Fluchtfelder – gewinnt in zwei Zügen', () => {
    const p = empty('brandubh', 1);
    put(p, 2, 3, KING); put(p, 6, 5, ATT);
    const w = winningMoves(p, 2);
    expect(w.length).toBeGreaterThan(0);
  });

  it('Aufgaben sind reproduzierbar und gelöst', () => {
    const a = makePuzzle(V.brandubh, mulberry32(4), 2, 800);
    const b = makePuzzle(V.brandubh, mulberry32(4), 2, 800);
    expect(a).not.toBeNull();
    expect(Array.from(a!.pos.b)).toEqual(Array.from(b!.pos.b));
    expect(a!.solutions.length).toBeGreaterThan(0);
    for (const s of a!.solutions) expect(legalMoves(a!.pos).some((m) => m.from === s.from && m.to === s.to)).toBe(true);
  }, 120000);
});

import { LESSONS } from '../src/games/wikinger/lessons';
import { exposed } from '../src/games/wikinger/engine';

describe('Wikingerschach – Lektionen', () => {
  it('jede Lektion ist lösbar und nicht trivial', () => {
    for (const L of LESSONS) {
      const p = L.setup();
      expect(p.turn, L.id).toBe(L.side);
      const ms = legalMoves(p);
      const good = ms.filter((m) => L.check(p, m));
      expect(good.length, L.id).toBeGreaterThan(0);
      expect(good.length, L.id).toBeLessThan(ms.length);
      expect(result(p), L.id).toBeNull();
    }
  });

  it('exposed findet bedrohte Figuren', () => {
    const p = empty('kopenhagen');
    put(p, 5, 3, DEF); put(p, 5, 2, ATT); put(p, 8, 4, ATT); put(p, 0, 5, KING);
    expect(exposed(p, 1)).toEqual([5 * 11 + 3]);
  });
});
