import { describe, expect, it } from 'vitest';
import { PRESETS, allCodes, chooseGuess, consistent, countLeft, entropy, feedback, filterConsistent, genPuzzle, isValid, randomCode, solveGame, spaceSize, type Cfg } from '../src/games/code/engine';
import { mulberry32 } from '../src/games/shared/rng';

const C: Cfg = PRESETS.klassisch.cfg;

describe('Code-Knacker: Auswertung', () => {
  it('Standardbeispiele', () => {
    expect(feedback([0, 1, 2, 3], [0, 1, 2, 3])).toEqual([4, 0]);
    expect(feedback([0, 1, 2, 3], [3, 2, 1, 0])).toEqual([0, 4]);
    expect(feedback([0, 0, 1, 1], [0, 1, 0, 1])).toEqual([2, 2]);
    expect(feedback([0, 0, 0, 1], [0, 0, 1, 1])).toEqual([3, 0]);
    expect(feedback([1, 2, 3, 4], [5, 5, 5, 5])).toEqual([0, 0]);
    expect(feedback([0, 0, 1, 2], [1, 1, 0, 0])).toEqual([0, 3]);
  });
  it('Nur-Schwarz liefert keine weißen Stifte', () => {
    expect(feedback([0, 1, 2, 3], [3, 2, 1, 0], PRESETS.schwarz.cfg)).toEqual([0, 0]);
    expect(feedback([0, 1, 2, 3], [0, 2, 1, 0], PRESETS.schwarz.cfg)).toEqual([1, 0]);
  });
  it('Auswertung ist symmetrisch in der Summe', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 300; i++) {
      const a = randomCode(C, rnd), b = randomCode(C, rnd);
      const f = feedback(a, b), g = feedback(b, a);
      expect(f).toEqual(g);
    }
  });
});

describe('Code-Knacker: Räume', () => {
  it('Größen stimmen', () => {
    expect(spaceSize(C)).toBe(1296);
    expect(allCodes(C).length).toBe(1296);
    expect(allCodes(PRESETS.bullen.cfg).length).toBe(5040);
    expect(allCodes(PRESETS.mini.cfg).length).toBe(125);
    expect(spaceSize(PRESETS.mega.cfg)).toBe(9 * 8 * 7 * 6 * 5);
  });
  it('gültige Zufallscodes', () => {
    const rnd = mulberry32(4);
    for (const p of Object.values(PRESETS)) for (let i = 0; i < 50; i++) expect(isValid(randomCode(p.cfg, rnd), p.cfg)).toBe(true);
  });
  it('Kandidatenfilter behält das Geheimnis', () => {
    const rnd = mulberry32(5);
    const all = allCodes(C);
    const secret = randomCode(C, rnd);
    const hist = [0, 1, 2].map(() => { const g = randomCode(C, rnd); return { guess: g, fb: feedback(secret, g) }; });
    const left = filterConsistent(all, hist, C);
    expect(left.some((c) => c.join() === secret.join())).toBe(true);
    expect(countLeft(all, hist, C)).toBe(left.length);
    expect(consistent(secret, hist, C)).toBe(true);
  });
});

describe('Code-Knacker: Löser', () => {
  const avg = (method: 'zufall' | 'erster' | 'entropie' | 'minimax', cfg: Cfg, n: number) => {
    const rnd = mulberry32(11);
    let t = 0, mx = 0;
    for (let i = 0; i < n; i++) { const r = solveGame(randomCode(cfg, rnd), cfg, method, rnd); t += r; mx = Math.max(mx, r); }
    return { avg: t / n, max: mx };
  };
  it('Entropie-Strategie löst klassisch im Schnitt in unter 5 Zügen', () => {
    const r = avg('entropie', C, 40);
    expect(r.avg).toBeLessThan(5);
    expect(r.max).toBeLessThanOrEqual(7);
  }, 60000);
  it('Minimax ist mindestens so gut wie Zufall', () => {
    const a = avg('minimax', C, 25), z = avg('zufall', C, 25);
    expect(a.avg).toBeLessThan(z.avg + 0.05);
    expect(a.avg).toBeLessThan(4.9);
  }, 90000);
  it('löst auch Bullen & Kühe, Super und Nur-Schwarz', () => {
    for (const key of ['bullen', 'super', 'schwarz']) {
      const cfg = PRESETS[key].cfg;
      const r = avg('entropie', cfg, 4);
      expect(r.max).toBeLessThanOrEqual(cfg.rows + 6);
    }
  }, 120000);
  it('letzter Kandidat wird sofort geraten', () => {
    expect(chooseGuess([[1, 2, 3, 4]], [], [{ guess: [0, 0, 1, 1], fb: [0, 0] }], C, 'entropie', mulberry32(1))).toEqual([1, 2, 3, 4]);
  });
  it('Entropie ist nicht negativ und höher für gute Versuche', () => {
    const all = allCodes(C);
    expect(entropy([0, 0, 1, 1], all, C)).toBeGreaterThan(entropy([0, 0, 0, 0], all, C));
  });
});

describe('Code-Knacker: Rätsel', () => {
  it('Rätsel haben genau eine Lösung', () => {
    for (const key of ['klassisch', 'mini', 'bullen']) {
      const cfg = PRESETS[key].cfg;
      const p = genPuzzle(cfg, mulberry32(7))!;
      expect(p).not.toBeNull();
      const left = filterConsistent(allCodes(cfg), p.history, cfg);
      expect(left.length).toBe(1);
      expect(left[0]).toEqual(p.secret);
    }
  });
});
