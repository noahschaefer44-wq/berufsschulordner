import { SETS, aiMove, gradeMove, makePuzzle, scoreRoot, type G, type Move } from './engine';
import { mulberry32 } from '../shared/rng';

type Req =
  | { id: number; op: 'move'; g: G; level: number; seed: number; seen: string[] }
  | { id: number; op: 'judge'; g: G; m: Move }
  | { id: number; op: 'hint'; g: G }
  | { id: number; op: 'puzzle'; set: string; own: number; seed: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  let res: unknown = null;
  try {
    if (r.op === 'move') res = aiMove(r.g, r.level, mulberry32(r.seed), new Set(r.seen));
    else if (r.op === 'judge') res = gradeMove(r.g, r.m, 2, 1500);
    else if (r.op === 'hint') res = scoreRoot(r.g, 3, 2500)[0]?.m ?? null;
    else res = makePuzzle(SETS.find((s) => s.id === r.set) ?? SETS[0], mulberry32(r.seed), r.own, 12);
  } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id: r.id, res });
};
