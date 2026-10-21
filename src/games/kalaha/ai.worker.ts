import { aiMove, gradeMove, makePuzzle, scoreMoves, type Pos, type Rules } from './engine';
import { mulberry32 } from '../shared/rng';

type Req =
  | { id: number; op: 'move'; p: Pos; level: number; seed: number }
  | { id: number; op: 'judge'; p: Pos; i: number }
  | { id: number; op: 'hint'; p: Pos }
  | { id: number; op: 'puzzle'; r: Rules; seed: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  let res: unknown = null;
  try {
    if (r.op === 'move') res = aiMove(r.p, r.level, mulberry32(r.seed));
    else if (r.op === 'judge') res = gradeMove(r.p, r.i, 9, 900);
    else if (r.op === 'hint') res = scoreMoves(r.p, 10, 1200)[0]?.i ?? null;
    else res = makePuzzle(r.r, mulberry32(r.seed), 120);
  } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id: r.id, res });
};
