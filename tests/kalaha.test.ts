import { describe, expect, it } from 'vitest';
import { LEVELS, VARIANTS, aiMove, buildPos, clone, gradeMove, legalMoves, makePuzzle, newPos, pitIdx, play, playOut, scoreMoves, scores, sowLength, winner, type Pos, type Rules } from '../src/games/kalaha/engine';
import { mulberry32 } from '../src/games/shared/rng';

const K: Rules = { v: 'kalah', n: 6, seeds: 4 };
const O: Rules = { v: 'oware', n: 6, seeds: 4 };
const L: Rules = { v: 'lawine', n: 6, seeds: 4 };
const total = (p: Pos) => p.b.reduce((a, b) => a + b, 0);

describe('Kalaha – Kalah', () => {
  it('Startstellung und Extrazug', () => {
    const p = newPos(K);
    expect(total(p)).toBe(48);
    expect(legalMoves(p)).toEqual([0, 1, 2, 3, 4, 5]);
    const r = play(p, 2);
    expect(r.extra).toBe(true);
    expect(r.pos.turn).toBe(0);
    expect(r.pos.b[6]).toBe(1);
    const r2 = play(p, 0);
    expect(r2.extra).toBe(false);
    expect(r2.pos.turn).toBe(1);
  });

  it('Fangen: letzter Samen in leerer eigener Mulde', () => {
    const p = buildPos(K, 0, [1, 0, 0, 0, 0, 3], [0, 0, 0, 0, 5, 2]);
    const r = play(p, 0);
    expect(r.captured).toBe(6);
    expect(r.pos.b[6]).toBe(6);
    expect(r.pos.b[1]).toBe(0);
    expect(r.pos.b[pitIdx(6, 1, 4)]).toBe(0);
  });

  it('kein Fang, wenn die gegenüberliegende Mulde leer ist', () => {
    const p = buildPos(K, 0, [1, 0, 0, 0, 0, 3], [0, 0, 0, 0, 0, 5]);
    const r = play(p, 0);
    expect(r.captured).toBe(0);
    expect(r.pos.b[1]).toBe(1);
  });

  it('der gegnerische Speicher wird übersprungen', () => {
    const p = buildPos(K, 0, [1, 0, 0, 0, 0, 8], [1, 1, 1, 1, 1, 1]);
    const r = play(p, 5);
    expect(r.pos.b[13]).toBe(0);
    expect(r.pos.b[6]).toBe(1);
    expect(r.pos.b[0]).toBe(2);
    expect(total(r.pos)).toBe(15);
  });

  it('Spielende: Rest wandert zum Besitzer', () => {
    const p = buildPos(K, 0, [0, 0, 0, 0, 0, 1], [3, 0, 0, 0, 0, 2], 10, 8);
    const r = play(p, 5); // letzter Samen in den Speicher, Seite leer
    expect(r.pos.over).toBe(true);
    expect(scores(r.pos)).toEqual([11, 13]);
    expect(winner(r.pos)).toBe(1);
  });

  it('Samen bleiben erhalten (Zufallsspiele)', () => {
    for (const rules of [K, O, L]) {
      const rnd = mulberry32(5);
      for (let g = 0; g < 20; g++) {
        let p = newPos(rules);
        for (let i = 0; i < 120 && !p.over; i++) {
          const ms = legalMoves(p);
          expect(ms.length).toBeGreaterThan(0);
          p = play(p, ms[Math.floor(rnd() * ms.length)]).pos;
          expect(total(p)).toBe(48);
        }
      }
    }
  });
});

describe('Kalaha – Oware', () => {
  it('Schlagen von 2 und 3 samt Kette', () => {
    // P0 sät aus Mulde 4 (3 Samen) in 5, P1:0, P1:1 → P1:1 hat 2, P1:0 hat 3 (waren 1 und 2)
    const p = buildPos(O, 0, [0, 0, 0, 0, 3, 0], [1, 1, 4, 0, 0, 5]);
    const r = play(p, 4);
    // letzte Samen: Mulde 5 (P0), P1:0, P1:1 → P1:0 = 2, P1:1 = 2 → beide geschlagen
    expect(r.captured).toBe(4);
    expect(r.pos.b[6]).toBe(4);
    expect(r.pos.b[pitIdx(6, 1, 0)]).toBe(0);
    expect(r.pos.b[pitIdx(6, 1, 1)]).toBe(0);
    expect(r.pos.b[pitIdx(6, 1, 2)]).toBe(4);
  });

  it('Grand Slam: keine Beute, wenn alles geschlagen würde', () => {
    const p = buildPos(O, 0, [0, 0, 0, 0, 3, 2], [1, 1, 0, 0, 0, 0]);
    const r = play(p, 5);
    expect(r.captured).toBe(0);
    expect(r.pos.b[pitIdx(6, 1, 0)]).toBe(2);
  });

  it('Mulde mit zwölf oder mehr Samen: Ursprungsmulde wird übersprungen', () => {
    const p = buildPos(O, 0, [12, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1]);
    const r = play(p, 0);
    expect(r.pos.b[0]).toBe(0);
    expect(total(r.pos)).toBe(13);
    expect(r.pos.b[1]).toBe(2);
  });

  it('Aushungern verboten: nur Züge, die dem Gegner Samen geben', () => {
    const p = buildPos(O, 0, [1, 0, 0, 0, 0, 3], [0, 0, 0, 0, 0, 0], 0, 0);
    expect(legalMoves(p)).toEqual([5]);
  });

  it('Sieg ab mehr als der Hälfte', () => {
    const p = buildPos(O, 0, [0, 0, 0, 0, 0, 3], [0, 0, 0, 0, 0, 1], 22, 20);
    // keine Beute möglich: Spiel läuft; mit 25 Beute endet es
    const q = buildPos(O, 0, [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 2, 5], 24, 5);
    const r = play(q, 4);
    expect(p.over).toBe(false);
    expect(r.pos.b[6]).toBeGreaterThanOrEqual(24);
  });
});

describe('Kalaha – Lawine', () => {
  it('weitergesät, wenn der letzte Samen in eine volle Mulde fällt', () => {
    const p = buildPos(L, 0, [1, 2, 0, 0, 0, 0], [0, 0, 0, 0, 0, 5]);
    const r = play(p, 0); // landet in Mulde 1 (2→3), nimmt 3 auf und sät 2,3,4
    expect(r.relays).toBe(1);
    expect(r.pos.b[1]).toBe(0);
    expect(r.pos.b[2]).toBe(1);
    expect(r.pos.b[3]).toBe(1);
    expect(r.pos.b[4]).toBe(1);
    expect(total(r.pos)).toBe(8);
  });
});

describe('Kalaha – KI', () => {
  it('liefert nur legale Züge, jede Stufe und Variante', () => {
    for (const rules of [K, O, L]) {
      for (let lv = 1; lv <= 4; lv++) {
        const rnd = mulberry32(lv);
        let p = newPos(rules);
        for (let i = 0; i < 30 && !p.over; i++) {
          const m = aiMove(p, lv, rnd);
          expect(legalMoves(p)).toContain(m);
          p = play(p, m).pos;
        }
      }
    }
  }, 60000);

  it('Stufe 4 schlägt Stufe 1 (alle Varianten, beide Seiten)', () => {
    for (const rules of [K, O, L]) {
      const rnd = mulberry32(9);
      let w = 0;
      for (let i = 0; i < 4; i++) {
        const lv: [number, number] = i % 2 ? [1, 4] : [4, 1];
        const g = playOut(rules, lv, rnd, 300);
        if (g.winner === (i % 2 ? 1 : 0)) w++;
      }
      expect(w, rules.v).toBeGreaterThanOrEqual(3);
    }
  }, 120000);

  it('Coach bewertet', () => {
    const p = newPos(K);
    const sc = scoreMoves(p, 6, 600);
    expect(sc.length).toBe(6);
    expect(gradeMove(p, sc[0].i, 6, 600).grade).toBe('best');
  });

  it('Spieldauer und Stufenliste', () => {
    expect(LEVELS.length).toBe(5);
    expect(VARIANTS.length).toBe(3);
    const g = playOut(K, [3, 3], mulberry32(3), 300);
    expect(g.winner).not.toBeNull();
    expect(g.scores[0] + g.scores[1]).toBe(48);
  }, 60000);

  it('Aufgaben sind reproduzierbar', () => {
    const a = makePuzzle(K, mulberry32(4));
    const b = makePuzzle(K, mulberry32(4));
    expect(a).not.toBeNull();
    expect(a!.best).toEqual(b!.best);
    expect(legalMoves(a!.pos)).toContain(a!.best[0]);
  }, 120000);

  it('Hilfsfunktionen', () => {
    const p = newPos(K);
    expect(sowLength(p, 0)).toBe(4);
    expect(clone(p).b).toEqual(p.b);
  });
});

import { LESSONS } from '../src/games/kalaha/lessons';

describe('Kalaha – Lektionen', () => {
  it('jede Lektion ist lösbar und nicht trivial', () => {
    for (const Ls of LESSONS) {
      const p = Ls.setup();
      expect(p.turn, Ls.id).toBe(Ls.side);
      const ms = legalMoves(p);
      const good = ms.filter((i) => Ls.check(p, i));
      expect(good.length, Ls.id).toBeGreaterThan(0);
      expect(good.length, Ls.id).toBeLessThan(ms.length);
    }
  });
});
