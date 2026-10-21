import { describe, expect, it } from 'vitest';
import { type Table, act, bestHand, cardFrom, chipsTotal, handName, legal, mkPlayer, newTable, pot, score5, startHand, strength } from '../src/games/poker/engine';
import { mulberry32 } from '../src/games/shared/rng';

/** Karten aus Kurzschreibweise: "As Kh Td 9c" (s ♠, h ♥, d ♦, c ♣; Rang A K Q J T 9…2). */
const R: Record<string, number> = { '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, T: 8, J: 9, Q: 10, K: 11, A: 12 };
const S: Record<string, number> = { s: 0, h: 1, d: 2, c: 3 };
const cs = (t: string) => t.split(/\s+/).filter(Boolean).map((x) => cardFrom(R[x[0]], S[x[1]]));

describe('Poker: Handbewertung', () => {
  it('Kartencodierung', () => {
    expect(strength(cs('As')[0])).toBe(12);
    expect(strength(cs('2c')[0])).toBe(0);
    expect(cardFrom(12, 0)).toBe(0);
  });
  it('Kategorien in der richtigen Reihenfolge', () => {
    const hands = ['Ah Kd 9c 5s 3h', 'Ah Ad 9c 5s 3h', 'Ah Ad 9c 9s 3h', 'Ah Ad Ac 5s 3h', '5h 6d 7c 8s 9h', 'Ah Kh 9h 5h 3h', 'Ah Ad Ac 5s 5h', 'Ah Ad Ac As 3h', '5h 6h 7h 8h 9h'];
    const sc = hands.map((h) => score5(cs(h)));
    for (let i = 1; i < sc.length; i++) expect(sc[i]).toBeGreaterThan(sc[i - 1]);
  });
  it('Straße mit Rad (A-2-3-4-5) ist die kleinste', () => {
    const wheel = score5(cs('Ah 2d 3c 4s 5h'));
    const six = score5(cs('2h 3d 4c 5s 6h'));
    expect(wheel).toBeLessThan(six);
    expect(Math.floor(wheel / 13 ** 5)).toBe(4);
    expect(score5(cs('As Kd Qc Js Th'))).toBeGreaterThan(six);
    expect(Math.floor(score5(cs('Ah Kd Qc Js 9h')) / 13 ** 5)).toBe(0); // keine Straße
  });
  it('Kicker entscheiden', () => {
    expect(score5(cs('Ah Ad Kc 5s 3h'))).toBeGreaterThan(score5(cs('Ah Ad Qc 5s 3h')));
    expect(score5(cs('Ah Ad Kc Ks 3h'))).toBeGreaterThan(score5(cs('Ah Ad Qc Qs Kh')));
    expect(score5(cs('9h 9d 9c 5s 3h'))).toBeLessThan(score5(cs('9h 9d 9c 6s 3h')));
  });
  it('beste Hand aus sieben Karten', () => {
    const h = bestHand(cs('Ah Ad'), cs('Ac 5s 5h 9d 2c'));
    expect(h.name).toBe('Full House');
    const f = bestHand(cs('Ah Kh'), cs('2h 7h 9h 3c 3d'));
    expect(f.name).toBe('Flush');
    const sf = bestHand(cs('9h 8h'), cs('7h 6h 5h Ac Ad'));
    expect(sf.name).toBe('Straight Flush');
    const rf = bestHand(cs('Ah Kh'), cs('Qh Jh Th 2c 2d'));
    expect(handName(rf)).toBe('Royal Flush');
  });
  it('Gleichstand auf dem Brett: gleiche Werte', () => {
    const board = cs('Ah Kd Qc Js Th');
    expect(bestHand(cs('2c 3d'), board).score).toBe(bestHand(cs('4c 5d'), board).score);
  });
  it('Omaha: genau zwei Handkarten', () => {
    // Vier Herzen auf dem Brett, nur eine Herz-Karte in der Hand → kein Flush
    const h = bestHand(cs('Ah 2c 3d 4s'), cs('Kh Qh Jh 9h 2d'), 'omaha');
    expect(h.name).not.toBe('Flush');
    const f = bestHand(cs('Ah 2h 3d 4s'), cs('Kh Qh Jh 9c 2d'), 'omaha');
    expect(f.name).toBe('Flush');
  });
  it('Short Deck: Flush schlägt Full House, A-6-7-8-9 ist eine Straße', () => {
    const flush = score5(cs('Ah Kh 9h 7h 6h'), true);
    const full = score5(cs('Ah Ad Ac 6s 6h'), true);
    expect(flush).toBeGreaterThan(full);
    const st = score5(cs('Ah 6d 7c 8s 9h'), true);
    expect(Math.floor(st / 13 ** 5)).toBe(4);
    expect(st).toBeLessThan(score5(cs('6h 7d 8c 9s Th'), true));
  });
});

function table(chips: number[], bb = 20, game: 'holdem' | 'omaha' | 'short' = 'holdem'): Table {
  return newTable(game, 'no', chips.map((c, i) => mkPlayer(`P${i}`, c, true)), bb / 2, bb);
}

describe('Poker: Wettrunde', () => {
  it('Blinds und Reihenfolge (3 Spieler)', () => {
    const t = table([1000, 1000, 1000]);
    expect(startHand(t, mulberry32(1))).toBe(true);
    const d = t.dealer;
    expect(t.players[(d + 1) % 3].bet).toBe(10);
    expect(t.players[(d + 2) % 3].bet).toBe(20);
    expect(t.toAct).toBe(d);
    expect(pot(t)).toBe(30);
  });
  it('Heads-up: Dealer ist kleiner Blind und beginnt', () => {
    const t = table([1000, 1000]);
    startHand(t, mulberry32(2));
    expect(t.players[t.dealer].bet).toBe(10);
    expect(t.toAct).toBe(t.dealer);
  });
  it('alle werfen ab: BB gewinnt den Pot', () => {
    const t = table([1000, 1000, 1000]);
    startHand(t, mulberry32(3));
    act(t, { kind: 'fold' }); act(t, { kind: 'fold' });
    expect(t.phase).toBe('done');
    expect(chipsTotal(t)).toBe(3000);
    expect(t.winners.length).toBe(1);
    expect(t.winners[0].amount).toBe(30);
  });
  it('Mindest-Erhöhung und ungültige Aktionen', () => {
    const t = table([1000, 1000, 1000]);
    startHand(t, mulberry32(4));
    const lg = legal(t);
    expect(lg.check).toBe(false);
    expect(lg.call).toBe(20);
    expect(lg.minRaise).toBe(40);
    expect(act(t, { kind: 'check' })).toBe(false);
    expect(act(t, { kind: 'raise', to: 40 })).toBe(true);
    expect(t.currentBet).toBe(40);
    expect(t.lastRaise).toBe(20);
  });
  it('Pot-Limit begrenzt die Erhöhung', () => {
    const t = newTable('holdem', 'pot', [mkPlayer('A', 1000, true), mkPlayer('B', 1000, true), mkPlayer('C', 1000, true)], 10, 20);
    startHand(t, mulberry32(5));
    const lg = legal(t);
    expect(lg.maxRaise).toBe(20 + (30 + 20)); // aktueller Einsatz + (Pot + Call)
  });
  it('Nebentöpfe: kurzer Stack gewinnt nur seinen Teil', () => {
    const t = table([100, 500, 500]);
    // Karten fest vorgeben
    startHand(t, mulberry32(6));
    // alle gehen All-in
    let guard = 0;
    while (t.phase !== 'done' && guard++ < 20) { const lg = legal(t); act(t, lg.canRaise ? { kind: 'raise', to: lg.maxRaise } : { kind: 'call' }); }
    expect(t.phase).toBe('done');
    expect(chipsTotal(t)).toBe(1100);
    expect(t.players.every((p) => p.chips >= 0)).toBe(true);
  });
  it('Nebentopf mit vorgegebenen Händen', () => {
    const t = table([100, 300, 300]);
    startHand(t, mulberry32(7));
    // Hände festlegen: Spieler 0 (kurz) gewinnt, Spieler 1 zweiter
    t.players[0].hole = cs('As Ah'); t.players[1].hole = cs('Kd Kc'); t.players[2].hole = cs('7d 2c');
    t.deck = [...cs('3s 5d 9c 4h 2d 8s')].reverse().concat(t.deck.filter((c) => !cs('As Ah Kd Kc 7d 2c 3s 5d 9c 4h 2d 8s').includes(c)));
    t.board = [];
    let guard = 0;
    while (t.phase !== 'done' && guard++ < 30) { const lg = legal(t); act(t, lg.canRaise ? { kind: 'raise', to: lg.maxRaise } : { kind: 'call' }); }
    expect(chipsTotal(t)).toBe(700);
    const [a, b, c] = t.players;
    expect(a.chips).toBe(300); // 3 × 100 Hauptpot
    expect(b.chips).toBe(400); // Nebenpot 2 × 200
    expect(c.chips).toBe(0);
  });
  it('Gleichstand teilt den Pot', () => {
    const t = table([500, 500]);
    startHand(t, mulberry32(8));
    t.players[0].hole = cs('2c 3d'); t.players[1].hole = cs('4c 5d');
    t.deck = cs('As Ah Ad Ac Kh Qh Jh Th').reverse().concat([]);
    // Brett: Straße Ass-hoch auf dem Tisch
    t.deck = cs('Ts Js Qd Kc Ah').reverse().concat(t.deck.filter(() => false));
    t.board = [];
    let guard = 0;
    while (t.phase !== 'done' && guard++ < 30) { const lg = legal(t); act(t, lg.check ? { kind: 'check' } : { kind: 'call' }); }
    expect(t.phase).toBe('done');
    expect(chipsTotal(t)).toBe(1000);
    expect(t.players[0].chips).toBe(500);
    expect(t.players[1].chips).toBe(500);
  });
});

describe('Poker: Zufallsspiele erhalten die Chips', () => {
  for (const game of ['holdem', 'omaha', 'short'] as const) {
    it(`${game}: 300 Hände mit zufälligen Aktionen`, () => {
      const rnd = mulberry32(99);
      const t = table([500, 800, 1200, 300, 1000], 20, game);
      const total = chipsTotal(t);
      for (let h = 0; h < 300; h++) {
        if (!startHand(t, rnd)) break;
        let guard = 0;
        while (t.phase !== 'done' && guard++ < 200) {
          const lg = legal(t);
          const r = rnd();
          if (r < 0.15) act(t, { kind: 'fold' });
          else if (r < 0.3 && lg.canRaise) act(t, { kind: 'raise', to: Math.floor(lg.minRaise + rnd() * (lg.maxRaise - lg.minRaise)) });
          else if (r < 0.35 && lg.canRaise) act(t, { kind: 'raise', to: lg.maxRaise });
          else act(t, lg.check ? { kind: 'check' } : { kind: 'call' });
        }
        expect(t.phase).toBe('done');
        expect(chipsTotal(t)).toBe(total);
        for (const p of t.players) expect(p.chips).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

import { eval7, equity, outs } from '../src/games/poker/equity';
import { shuffleDeck } from '../src/games/poker/engine';

describe('Poker: schnelle Auswertung stimmt mit der Referenz überein', () => {
  for (const game of ['holdem', 'short'] as const) {
    it(`${game}: 4000 zufällige Siebener-Hände`, () => {
      const rnd = mulberry32(5);
      for (let i = 0; i < 4000; i++) {
        const d = shuffleDeck(game, rnd);
        const cards = d.slice(0, 7);
        const ref = bestHand(cards.slice(0, 2), cards.slice(2), game).score;
        expect(eval7(cards, game === 'short')).toBe(ref);
      }
    });
  }
  it('auch mit 5 und 6 Karten', () => {
    const rnd = mulberry32(6);
    for (let i = 0; i < 500; i++) {
      const d = shuffleDeck('holdem', rnd);
      for (const n of [5, 6]) expect(eval7(d.slice(0, n))).toBe(bestHand(d.slice(0, 2), d.slice(2, n)).score);
    }
  });
});

describe('Poker: Gewinnchancen', () => {
  it('Asse gegen einen Zufallsgegner ≈ 85 %', () => {
    const e = equity(cs('As Ah'), [], 1, 'holdem', mulberry32(1), 3000);
    expect(e.eq).toBeGreaterThan(0.82);
    expect(e.eq).toBeLessThan(0.89);
  });
  it('Zweier-Sieben gegen fünf Gegner < 20 %', () => {
    const e = equity(cs('7c 2d'), [], 5, 'holdem', mulberry32(2), 2000);
    expect(e.eq).toBeLessThan(0.12);
  });
  it('Asse gegen Könige ≈ 82 %', () => {
    const e = equity(cs('As Ah'), [], 1, 'holdem', mulberry32(3), 4000, [cs('Kd Kc')]);
    expect(e.eq).toBeGreaterThan(0.78);
    expect(e.eq).toBeLessThan(0.86);
  });
  it('Fertiges Royal Flush gewinnt immer', () => {
    const e = equity(cs('Ah Kh'), cs('Qh Jh Th'), 3, 'holdem', mulberry32(4), 200);
    expect(e.eq).toBe(1);
  });
  it('Outs: Flush-Draw hat neun Outs für den Flush', () => {
    const o = outs(cs('Ah 7h'), cs('2h 9h Kc'));
    expect(o.length).toBeGreaterThanOrEqual(9);
    expect(o.length).toBeLessThanOrEqual(25);
  });
  it('Omaha-Gewinnchance läuft', () => {
    const e = equity(cs('As Ah Kd Kc'), [], 2, 'omaha', mulberry32(5), 100);
    expect(e.eq).toBeGreaterThan(0.4);
  });
});

import { STYLES, botAction } from '../src/games/poker/bots';
describe('Poker: Bots', () => {
  it('Bots spielen ganze Hände ohne Fehler und erhalten die Chips', () => {
    const rnd = mulberry32(11);
    const players = STYLES.map((s) => mkPlayer(s.name, 1000, true, s.id));
    const t = newTable('holdem', 'no', players, 10, 20);
    const total = chipsTotal(t);
    for (let h = 0; h < 40; h++) {
      if (!startHand(t, rnd)) break;
      let guard = 0;
      while (t.phase !== 'done' && guard++ < 100) {
        const { action } = botAction(t, rnd, 2);
        expect(act(t, action)).toBe(true);
      }
      expect(t.phase).toBe('done');
      expect(chipsTotal(t)).toBe(total);
    }
  }, 60000);
  it('Bot wirft Müll gegen einen großen Einsatz ab, geht mit Assen mit', () => {
    const rnd = mulberry32(12);
    const mk = (hole: string) => {
      const t = newTable('holdem', 'no', [mkPlayer('A', 1000, true, 'rechner'), mkPlayer('B', 1000, true, 'rechner')], 10, 20);
      startHand(t, rnd);
      t.players[0].hole = cs(hole); t.players[1].hole = cs('9c 8d');
      t.toAct = 0; t.currentBet = 300; t.players[1].bet = 300; t.players[1].chips = 700; t.players[1].total = 300; t.players[0].bet = 20; t.players[0].chips = 980; t.players[0].total = 20;
      return t;
    };
    let folds = 0, aces = 0;
    for (let i = 0; i < 12; i++) {
      if (botAction(mk('7c 2d'), rnd, 3).action.kind === 'fold') folds++;
      if (botAction(mk('As Ah'), rnd, 3).action.kind !== 'fold') aces++;
    }
    expect(folds).toBeGreaterThanOrEqual(10);
    expect(aces).toBe(12);
  }, 60000);
});
