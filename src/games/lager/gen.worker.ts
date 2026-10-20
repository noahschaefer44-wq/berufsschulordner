import { type GenParams, generateLevel, toXsb } from './engine';

self.onmessage = (e: MessageEvent<{ id: number; seed: string; params: GenParams }>) => {
  const { id, seed, params } = e.data;
  let res: { xsb: string; par: number } | null = null;
  try {
    const lv = generateLevel(seed, params, 3000);
    res = { xsb: toXsb(lv), par: lv.par };
  } catch (err) { console.error(err); }
  (self as unknown as Worker).postMessage({ id, res });
};
