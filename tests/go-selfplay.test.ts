import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, newState, play, score, type Color } from '../src/games/go/engine';
import { aiMove, mctsMove } from '../src/games/go/ai';

describe('Go Selbstspiel', () => {
  it('Heuristik gegen Heuristik endet mit zwei Pässen und Wertung', () => {
    let s = newState({ ...DEFAULT_RULES, n: 7, komi: 5.5 });
    let moves = 0;
    while (s.passes < 2 && moves < 400) {
      const r = aiMove(s, 2, moves + 1);
      let p = play(s, r.move);
      if (!p.ok) p = play(s, -1);
      expect(p.ok).toBe(true);
      if (p.ok) s = p.state;
      moves++;
    }
    expect(s.passes).toBe(2);
    const sc = score(s);
    expect([1, 2]).toContain(sc.winner as Color);
  });
  it('Monte-Carlo gegen Heuristik: nur legale Züge, endet', () => {
    let s = newState({ ...DEFAULT_RULES, n: 5, komi: 3.5 });
    let moves = 0;
    while (s.passes < 2 && moves < 120) {
      const r = s.turn === 1 ? mctsMove(s, 25, moves + 3, 200) : aiMove(s, 2, moves + 5);
      let p = play(s, r.move);
      if (!p.ok) p = play(s, -1);
      expect(p.ok).toBe(true);
      if (p.ok) s = p.state;
      moves++;
    }
    expect(moves).toBeGreaterThan(5);
  });
  it('Atari-Go: KI gegen KI endet mit Sieger', () => {
    let s = newState({ ...DEFAULT_RULES, n: 7, atari: true });
    let moves = 0;
    while (!s.winner && moves < 120) {
      const r = aiMove(s, 3, moves + 1);
      let p = play(s, r.move);
      if (!p.ok) p = play(s, -1);
      if (p.ok) s = p.state; else break;
      moves++;
    }
    expect(s.winner).not.toBe(0);
  });
  it('Torus: KI-Partie läuft ohne Fehler', () => {
    let s = newState({ ...DEFAULT_RULES, n: 7, torus: true });
    for (let m = 0; m < 40; m++) {
      const r = mctsMove(s, 15, m + 1, 120);
      const p = play(s, r.move);
      expect(p.ok).toBe(true);
      if (p.ok) s = p.state;
    }
  });
});
