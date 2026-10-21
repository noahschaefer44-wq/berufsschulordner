import { aiMove, gradeMove, makePuzzle, scoreRoot, VARIANTS, type Mv, type Pos } from './engine';
import { mulberry32 } from '../shared/rng';

type Req =
  | { id: number; op: 'move'; p: Pos; level: number; seed: number; seen: number[] }
  | { id: number; op: 'judge'; p: Pos; mv: Mv }
  | { id: number; op: 'hint'; p: Pos }
  | { id: number; op: 'puzzle'; variant: string; seed: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  let res: unknown = null;
  try {
    if (r.op === 'move') res = aiMove(r.p, r.level, mulberry32(r.seed), new Set(r.seen));
    else if (r.op === 'judge') res = gradeMove(r.p, r.mv, 3, 1200);
    else if (r.op === 'hint') res = scoreRoot(r.p, 4, 1800)[0]?.mv ?? null;
    else {
      const v = VARIANTS.find((x) => x.id === r.variant) ?? VARIANTS[0];
      const pz = makePuzzle(v, mulberry32(r.seed), 2, 600);
      res = pz;
    }
  } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id: r.id, res });
};
