import { generate } from '../src/games/sudoku/gen';
import { LEVELS } from '../src/games/sudoku/logic';
for (const v of ['klassik', 'mini', 'kinder', 'x', 'hyper', 'ritter', 'killer'] as const) {
  for (const l of LEVELS) {
    const t = Date.now();
    const p = generate(v, l.id, 4242, 3000);
    console.log(v.padEnd(8), l.id.padEnd(8), '->', p.level.padEnd(8), 'w', String(p.weight).padEnd(3), 'clues', String(p.givens.filter(Boolean).length).padEnd(3), (Date.now() - t) + 'ms');
  }
}
