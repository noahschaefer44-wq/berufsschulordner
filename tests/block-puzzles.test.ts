// Blockfall: Jedes T-Spin-Rätsel ist lösbar (Suche über Bewegungen und Drehungen).
import { describe, expect, it } from 'vitest';
import { PUZZLES, reachableLabels } from '../src/games/block/puzzles';

describe('Blockfall: T-Spin-Rätsel', () => {
  for (const p of PUZZLES) {
    it(`${p.name} ist lösbar`, () => {
      const labels = reachableLabels(p);
      expect(labels.has(p.goal)).toBe(true);
    });
  }
});
