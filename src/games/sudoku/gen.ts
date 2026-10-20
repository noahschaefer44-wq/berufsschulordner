// Sudoku-Erzeugung: eindeutige Rätsel für jede Variante und Stufe (Bewertung über die Techniken aus logic.ts).
import { type Cage, type Variant, buildSpec, makeCages, randomSolution, solve } from './engine';
import { type Level, levelIndex, levelOfWeight, rate } from './logic';
import { mulberry32, shuffled } from '../shared/rng';

export interface Puzzle {
  variant: Variant;
  n: number;
  givens: number[];
  solution: number[];
  cages: Cage[];
  /** Gewicht der schwersten nötigen Technik (11 = Raten nötig) */
  weight: number;
  level: Level;
  seed: number;
}

const TARGET: Record<string, Record<Level, number>> = {
  '9': { leicht: 40, mittel: 33, schwer: 28, experte: 25, teufel: 0 },
  '6': { leicht: 21, mittel: 17, schwer: 14, experte: 12, teufel: 0 },
  '4': { leicht: 9, mittel: 7, schwer: 6, experte: 5, teufel: 0 },
  k: { leicht: 16, mittel: 6, schwer: 3, experte: 1, teufel: 0 },
};

export function generate(variant: Variant, level: Level, seed: number, budgetMs = 2500): Puzzle {
  const rng = mulberry32(seed);
  const t0 = Date.now();
  const deadline = t0 + (variant === 'kinder' ? 0 : budgetMs);
  let best: Puzzle | null = null, bestDist = 99;
  for (let attempt = 0; ; attempt++) {
    const base = buildSpec(variant);
    const sol = randomSolution(base, rng);
    const cages = variant === 'killer' ? makeCages(base, sol, rng, 5) : [];
    const spec = variant === 'killer' ? buildSpec(variant, cages) : base;
    const N = spec.n * spec.n;
    const grid = Int8Array.from(sol);
    const targets = TARGET[variant === 'killer' ? 'k' : String(spec.n)];
    const target = targets[level];
    let clues = N;
    const order = shuffled(rng, Array.from({ length: N }, (_, i) => i));
    const sym = variant !== 'killer' && attempt % 2 === 0; // Drehsymmetrie, abwechselnd
    for (const c of order) {
      if (clues <= target) break;
      if (!grid[c]) continue;
      const partner = N - 1 - c;
      const pair = sym && partner !== c && grid[partner] ? [c, partner] : [c];
      const saved = pair.map((x) => grid[x]);
      pair.forEach((x) => { grid[x] = 0; });
      const r = solve(spec, grid, 2, deadline + 1500);
      if (r.count === 1 && !r.timedOut) clues -= pair.length;
      else pair.forEach((x, k) => { grid[x] = saved[k]; });
    }
    const rating = rate(spec, grid);
    const lvl = levelOfWeight(rating.weight, variant === 'killer');
    const dist = Math.abs(levelIndex(lvl) - levelIndex(level));
    const p: Puzzle = { variant, n: spec.n, givens: Array.from(grid), solution: Array.from(sol), cages, weight: rating.weight, level: lvl, seed };
    if (dist === 0) return p;
    if (dist < bestDist) { best = p; bestDist = dist; }
    if (Date.now() > deadline) break;
  }
  return best!;
}

/** Rätsel aus Texten (für Teilen/Laden): Ziffern 0–9, Punkt = leer. */
export function encodeGrid(givens: ArrayLike<number>): string {
  return Array.from(givens, (d) => (d ? String(d) : '.')).join('');
}
export function decodeGrid(s: string, n: number): number[] | null {
  const t = s.replace(/[\s\n\r]/g, '').replace(/[0_-]/g, '.');
  if (t.length !== n * n || /[^.1-9]/.test(t)) return null;
  const g = Array.from(t, (ch) => (ch === '.' ? 0 : +ch));
  return g.every((d) => d <= n) ? g : null;
}
