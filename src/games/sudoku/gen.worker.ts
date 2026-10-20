import { generate, type Puzzle } from './gen';
import type { Variant } from './engine';
import type { Level } from './logic';

self.onmessage = (e: MessageEvent<{ id: number; variant: Variant; level: Level; seed: number; budget: number }>) => {
  const { id, variant, level, seed, budget } = e.data;
  let puzzle: Puzzle | null = null;
  try { puzzle = generate(variant, level, seed, budget); } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id, puzzle });
};
