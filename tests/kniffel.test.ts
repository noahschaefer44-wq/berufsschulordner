import { describe, expect, it } from 'vitest';
import {
  CATS, LEVELS, VARIANTS, analyze, baseline, chances, decide, emptyCard, fill, gameOver, heldValues, isKniffel, jokerActive, legalCats, makePuzzle, maskFor, openCats, playSolo, scoreCat, totals, cellScore,
  type Card, type CatId,
} from '../src/games/kniffel/engine';
import { mulberry32 } from '../src/games/shared/rng';

const C = VARIANTS[0], M = VARIANTS[1];
const sc = (cat: CatId, d: number[], v = C) => scoreCat(v, cat, d);

describe('Kniffel – Wertung', () => {
  it('oberer Block', () => {
    expect(sc('n1', [1, 1, 3, 5, 1])).toBe(3);
    expect(sc('n5', [5, 5, 3, 5, 1])).toBe(15);
    expect(sc('n6', [1, 2, 3, 4, 5])).toBe(0);
  });
  it('Pasch', () => {
    expect(sc('three', [3, 3, 3, 4, 5])).toBe(18);
    expect(sc('three', [3, 3, 4, 4, 5])).toBe(0);
    expect(sc('four', [4, 4, 4, 4, 6])).toBe(22);
    expect(sc('four', [4, 4, 4, 2, 6])).toBe(0);
    expect(sc('three', [6, 6, 6, 6, 6])).toBe(30);
  });
  it('Full House, Straßen, Kniffel, Chance', () => {
    expect(sc('fh', [2, 2, 5, 5, 5])).toBe(25);
    expect(sc('fh', [5, 5, 5, 5, 5])).toBe(0);
    expect(sc('fh', [2, 2, 3, 5, 5])).toBe(0);
    expect(sc('ss', [1, 2, 3, 4, 6])).toBe(30);
    expect(sc('ss', [2, 3, 4, 5, 5])).toBe(30);
    expect(sc('ss', [1, 2, 3, 5, 6])).toBe(0);
    expect(sc('ls', [2, 3, 4, 5, 6])).toBe(40);
    expect(sc('ls', [1, 2, 3, 4, 6])).toBe(0);
    expect(sc('kniffel', [4, 4, 4, 4, 4])).toBe(50);
    expect(sc('kniffel', [4, 4, 4, 4, 3])).toBe(0);
    expect(sc('chance', [1, 2, 3, 4, 6])).toBe(16);
    expect(isKniffel([2, 2, 2, 2, 2])).toBe(true);
  });
  it('Bonus ab 63 und Summen', () => {
    let card: Card = emptyCard();
    for (const [c, d] of [['n1', [1, 1, 1, 2, 3]], ['n2', [2, 2, 2, 5, 6]], ['n3', [3, 3, 3, 1, 4]], ['n4', [4, 4, 4, 1, 2]], ['n5', [5, 5, 5, 2, 3]], ['n6', [6, 6, 6, 1, 2]]] as [CatId, number[]][]) card = fill(C, card, c, d);
    const t = totals(C, card);
    expect(t.upper).toBe(63);
    expect(t.bonus).toBe(35);
    expect(t.total).toBe(98);
  });
  it('Joker und Kniffel-Bonus', () => {
    let card = fill(C, emptyCard(), 'kniffel', [3, 3, 3, 3, 3]);
    expect(card.s.kniffel).toBe(50);
    const d = [4, 4, 4, 4, 4];
    expect(jokerActive(C, card, d)).toBe(true);
    expect(legalCats(C, card, d)).toEqual(['n4']); // oberes Feld Pflicht
    card = fill(C, card, 'n4', d);
    expect(card.bonusYz).toBe(1);
    expect(totals(C, card).yz).toBe(100);
    // jetzt Joker im unteren Block: Full House zählt voll
    expect(legalCats(C, card, d).every((c) => !CATS[c].upper)).toBe(true);
    expect(cellScore(C, card, 'fh', d)).toBe(25);
    expect(cellScore(C, card, 'ls', d)).toBe(40);
  });
  it('Maxi-Wertung', () => {
    expect(sc('pair', [2, 2, 5, 5, 1, 6], M)).toBe(10);
    expect(sc('two_pairs', [2, 2, 5, 5, 1, 6], M)).toBe(14);
    expect(sc('three_pairs', [2, 2, 5, 5, 6, 6], M)).toBe(26);
    expect(sc('three', [3, 3, 3, 1, 5, 6], M)).toBe(9);
    expect(sc('five', [6, 6, 6, 6, 6, 1], M)).toBe(30);
    expect(sc('fh', [4, 4, 4, 2, 2, 6], M)).toBe(16);
    expect(sc('villa', [4, 4, 4, 2, 2, 2], M)).toBe(18);
    expect(sc('tower', [4, 4, 4, 4, 2, 2], M)).toBe(20);
    expect(sc('ss', [1, 2, 3, 4, 5, 5], M)).toBe(15);
    expect(sc('ls', [2, 3, 4, 5, 6, 6], M)).toBe(20);
    expect(sc('fs', [1, 2, 3, 4, 5, 6], M)).toBe(30);
    expect(sc('kniffel', [3, 3, 3, 3, 3, 3], M)).toBe(100);
    expect(M.cats.length).toBe(20);
    expect(C.cats.length).toBe(13);
  });
});

describe('Kniffel – Wahrscheinlichkeit und Entscheidung', () => {
  it('Drilling behalten', () => {
    const a = analyze(C, emptyCard(), [6, 6, 6, 2, 3], 2);
    expect(a.holds[0].hold).toEqual([6, 6, 6]);
  });
  it('Straße anstreben: 1,2,3,4 halten', () => {
    const a = analyze(C, emptyCard(), [1, 2, 3, 4, 6], 1);
    expect(a.holds[0].hold).toEqual([1, 2, 3, 4]);
  });
  it('Fertige Große Straße eintragen statt weiterwürfeln', () => {
    const a = analyze(C, emptyCard(), [2, 3, 4, 5, 6], 2);
    expect(a.cats[0].cat).toBe('ls');
    const d = decide(C, emptyCard(), [2, 3, 4, 5, 6], 2, 5, mulberry32(1));
    expect(d.cat).toBe('ls');
  });
  it('Kniffel mit Vierling: Vierling behalten', () => {
    const a = analyze(C, emptyCard(), [5, 5, 5, 5, 1], 1);
    expect(a.holds[0].hold).toEqual([5, 5, 5, 5]);
  });
  it('Chancen-Tabelle: Kniffel mit vier Gleichen und einem Wurf = 11/36', () => {
    const ch = chances(C, emptyCard(), [5, 5, 5, 5, 1], 1);
    const k = ch.find((x) => x.cat === 'kniffel')!;
    expect(k.kind).toBe('p');
    expect(k.value).toBeCloseTo(1 / 6, 6);
    const ls = chances(C, emptyCard(), [1, 2, 3, 4, 6], 1).find((x) => x.cat === 'ls')!;
    expect(ls.value).toBeCloseTo(1 / 6, 6);
    const ss = chances(C, emptyCard(), [1, 2, 3, 4, 6], 0).find((x) => x.cat === 'ss')!;
    expect(ss.value).toBe(1);
  });
  it('Maske zu Halte-Menge', () => {
    const m = maskFor([6, 2, 6, 3, 6], [6, 6]);
    expect(heldValues([6, 2, 6, 3, 6], m)).toEqual([6, 6]);
  });
  it('Basiswerte', () => {
    expect(Object.keys(baseline(C)).length).toBe(13);
    const b = baseline(M);
    expect(b.kniffel).toBeGreaterThan(0);
    expect(b.n6!).toBeGreaterThan(b.n1!);
  });
});

describe('Kniffel – KI', () => {
  it('Spiele enden mit 13 Zügen, Punkte stimmen', () => {
    const g = playSolo(C, 4, mulberry32(3));
    expect(g.turns).toBe(13);
    expect(gameOver(C, g.card)).toBe(true);
    expect(g.score).toBe(totals(C, g.card).total);
    expect(openCats(C, g.card)).toEqual([]);
  });
  it('Stufen sind geordnet (Mittel über Spiele)', () => {
    const avg = (lv: number, v = C, n = 40) => { const r = mulberry32(100 + lv); let s = 0; for (let i = 0; i < n; i++) s += playSolo(v, lv, r).score; return s / n; };
    const a1 = avg(1), a2 = avg(2), a4 = avg(4), a5 = avg(5);
    expect(a2).toBeGreaterThan(a1);
    expect(a4).toBeGreaterThan(a2 + 15);
    expect(a5).toBeGreaterThan(190);
  }, 120000);
  it('Maxi-Spiel läuft durch', () => {
    const g = playSolo(M, 4, mulberry32(5));
    expect(g.turns).toBe(20);
    expect(g.score).toBeGreaterThan(80);
  }, 120000);
  it('Stufenliste', () => { expect(LEVELS.length).toBe(5); });
});

describe('Kniffel – Aufgaben', () => {
  it('Halte- und Feld-Aufgaben sind reproduzierbar', () => {
    const a = makePuzzle(C, mulberry32(7), 'hold');
    const b = makePuzzle(C, mulberry32(7), 'hold');
    expect(a).not.toBeNull();
    expect(a!.dice).toEqual(b!.dice);
    expect(a!.best.hold).toEqual(b!.best.hold);
    const c = makePuzzle(C, mulberry32(8), 'cat');
    expect(c).not.toBeNull();
    expect(openCats(C, c!.card)).toContain(c!.best.cat);
  }, 60000);
});

import { LESSONS } from '../src/games/kniffel/lessons';

describe('Kniffel – Lektionen', () => {
  it('jede Lektion ist lösbar und nicht trivial', () => {
    for (const L of LESSONS) {
      if (L.kind === 'quiz') { expect(L.options!.length, L.id).toBeGreaterThan(1); expect(L.correct!, L.id).toBeLessThan(L.options!.length); continue; }
      if (L.kind === 'hold') {
        const a = analyze(L.variant, L.card(), L.dice, L.rollsLeft);
        const good = a.holds.filter((h) => L.checkHold!(h.hold));
        expect(good.length, L.id).toBeGreaterThan(0);
        expect(good.length, L.id).toBeLessThan(a.holds.length);
      } else {
        const open = openCats(L.variant, L.card());
        const good = open.filter((c) => L.checkCat!(c));
        expect(good.length, L.id).toBeGreaterThan(0);
        expect(good.length, L.id).toBeLessThan(open.length);
      }
    }
  });
});
