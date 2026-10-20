import { generate, type GenOpts, type GenResult } from './gen';
import type { Cfg } from './engine';
import { mulberry32 } from '../shared/rng';

self.onmessage = (e: MessageEvent<{ id: number; cfg: Cfg; first: number; seed: number; opts: GenOpts }>) => {
  const { id, cfg, first, seed, opts } = e.data;
  let res: GenResult | null = null;
  try { res = generate(cfg, first, mulberry32(seed), opts); } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id, res });
};
