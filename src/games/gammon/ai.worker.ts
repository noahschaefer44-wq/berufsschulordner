import { chooseMove, judge, preRollProb, shouldDouble, shouldTake } from './ai';
import type { BG, Seq, Side } from './engine';
import { genPuzzle } from './puzzles';
import { mulberry32 } from '../shared/rng';

type Req =
  | { id: number; op: 'move'; s: BG; p: Side; dice: number[]; level: number; seed: number }
  | { id: number; op: 'double'; s: BG; p: Side; level: number; seed: number }
  | { id: number; op: 'take'; s: BG; p: Side; level: number; seed: number }
  | { id: number; op: 'judge'; s: BG; p: Side; dice: number[]; played: Seq }
  | { id: number; op: 'prob'; s: BG; p: Side }
  | { id: number; op: 'puzzle'; seed: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  let res: unknown = null;
  try {
    if (r.op === 'move') res = chooseMove(r.s, r.p, r.dice, r.level, mulberry32(r.seed));
    else if (r.op === 'double') res = shouldDouble(r.s, r.p, r.level, mulberry32(r.seed));
    else if (r.op === 'take') res = shouldTake(r.s, r.p, r.level, mulberry32(r.seed));
    else if (r.op === 'judge') { const j = judge(r.s, r.p, r.dice, r.played); res = { loss: j.loss, bestP: j.best.p, best: j.best.seq, top: j.list.slice(0, 5).map((x) => ({ seq: x.seq, p: x.p })) }; }
    else if (r.op === 'prob') res = preRollProb(r.s, r.p);
    else res = genPuzzle(r.seed);
  } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id: r.id, res });
};
