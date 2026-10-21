import { describe, expect, it } from 'vitest';
import { HAND_NAMES, bestHand, score5 } from '../src/games/poker/engine';
import { eval7 } from '../src/games/poker/equity';
import { genDecisionQuiz, genEquityQuiz, genOddsQuiz, genOutsQuiz, genRankQuiz, genWinnerQuiz, makeHand } from '../src/games/poker/trainer';
import { mulberry32 } from '../src/games/shared/rng';

describe('Poker: Trainer', () => {
  it('makeHand liefert für jede Kategorie die richtige Hand', () => {
    const rnd = mulberry32(21);
    for (let cat = 0; cat <= 8; cat++) for (let i = 0; i < 30; i++) {
      const h = makeHand(cat, rnd);
      expect(h.length).toBe(5);
      expect(new Set(h).size).toBe(5);
      expect(Math.floor(score5(h) / 13 ** 5)).toBe(cat);
    }
  });
  it('Rang-Aufgabe: Antwort passt zu den Karten', () => {
    for (let s = 1; s <= 40; s++) {
      const q = genRankQuiz(s);
      expect(q.options[q.answer]).toBe(HAND_NAMES[Math.floor(score5(q.cards) / 13 ** 5)]);
      expect(new Set(q.options).size).toBe(4);
    }
  });
  it('Showdown-Aufgabe: Sieger stimmt', () => {
    for (let s = 1; s <= 40; s++) {
      const q = genWinnerQuiz(s);
      const a = bestHand(q.a, q.board).score, b = bestHand(q.b, q.board).score;
      expect(q.answer).toBe(a > b ? 0 : b > a ? 1 : 2);
    }
  });
  it('Pot-Quote: b / (p + 2b)', () => {
    const q = genOddsQuiz(3);
    expect(q.need).toBeCloseTo(q.bet / (q.pot + 2 * q.bet), 8);
    expect(q.need).toBeGreaterThan(0.1);
    expect(q.need).toBeLessThan(0.4);
  });
  it('Gewinnchance-Aufgabe ist deterministisch', () => {
    const a = genEquityQuiz(4), b = genEquityQuiz(4);
    expect(a.eq).toBe(b.eq);
    expect(a.eq).toBeGreaterThan(0);
    expect(a.eq).toBeLessThan(1);
  });
  it('Outs-Aufgabe: Outs ziehen die Hand wirklich auf Straße oder besser', () => {
    for (let s = 1; s <= 6; s++) {
      const q = genOutsQuiz(s)!;
      expect(q).not.toBeNull();
      for (const c of q.outs) expect(Math.floor(eval7([...q.hole, ...q.board, c]) / 13 ** 5)).toBeGreaterThanOrEqual(4);
    }
  });
  it('Entscheidungs-Aufgabe hat einen klaren Abstand', () => {
    for (let s = 1; s <= 8; s++) {
      const q = genDecisionQuiz(s);
      expect(Math.abs(q.eq - q.need)).toBeGreaterThanOrEqual(0.06);
      expect(q.answer).toBe(q.eq > q.need ? 'call' : 'fold');
    }
  }, 60000);
});
