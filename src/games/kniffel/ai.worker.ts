import { VARIANTS, analyze, chances, decide, makePuzzle, type Card } from './engine';
import { mulberry32 } from '../shared/rng';

type Req =
  | { id: number; op: 'decide'; v: string; card: Card; dice: number[]; rollsLeft: number; level: number; seed: number }
  | { id: number; op: 'analyze'; v: string; card: Card; dice: number[]; rollsLeft: number }
  | { id: number; op: 'chances'; v: string; card: Card; dice: number[]; rollsLeft: number }
  | { id: number; op: 'puzzle'; v: string; kind: 'hold' | 'cat'; seed: number };

const vr = (id: string) => VARIANTS.find((x) => x.id === id) ?? VARIANTS[0];

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  let res: unknown = null;
  try {
    if (r.op === 'decide') res = decide(vr(r.v), r.card, r.dice, r.rollsLeft, r.level, mulberry32(r.seed));
    else if (r.op === 'analyze') res = analyze(vr(r.v), r.card, r.dice, r.rollsLeft);
    else if (r.op === 'chances') res = chances(vr(r.v), r.card, r.dice, r.rollsLeft);
    else res = makePuzzle(vr(r.v), mulberry32(r.seed), r.kind);
  } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id: r.id, res });
};
