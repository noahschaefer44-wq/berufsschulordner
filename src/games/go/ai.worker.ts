import { type AiResult, type Estimate, aiMove, estimate, suggestDead } from './ai';
import type { GoState } from './engine';

type Req = { id: number; op: 'move'; state: GoState; level: number; seed: number } | { id: number; op: 'estimate'; state: GoState; playouts: number; seed: number } | { id: number; op: 'dead'; state: GoState };

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  let res: AiResult | Estimate | number[] | null = null;
  try {
    if (r.op === 'move') res = aiMove(r.state, r.level, r.seed);
    else if (r.op === 'estimate') res = estimate(r.state, r.playouts, r.seed);
    else res = suggestDead(r.state);
  } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id: r.id, res });
};
