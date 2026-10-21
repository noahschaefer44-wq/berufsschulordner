// Ruft Analyse und KI im Hintergrund-Worker auf; ohne Worker rechnet der Hauptthread.
import { VARIANTS, analyze, chances, decide, makePuzzle, type Analysis, type Card, type Chance, type Decision, type Puzzle } from './engine';
import { mulberry32 } from '../shared/rng';

let worker: Worker | null = null;
let wid = 0;
const waiting = new Map<number, (r: unknown) => void>();
const vr = (id: string) => VARIANTS.find((x) => x.id === id) ?? VARIANTS[0];

function call<T>(msg: Record<string, unknown>, sync: () => T): Promise<T> {
  try {
    if (!worker) {
      worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; res: unknown }>) => { waiting.get(e.data.id)?.(e.data.res); waiting.delete(e.data.id); };
      worker.onerror = () => { waiting.forEach((f) => f(null)); waiting.clear(); worker = null; };
    }
    const id = ++wid;
    return new Promise<T>((res) => { waiting.set(id, (r) => res((r as T | null) ?? sync())); worker!.postMessage({ id, ...msg }); });
  } catch { return Promise.resolve(sync()); }
}

export function cancelAi() { if (worker) { worker.terminate(); worker = null; } waiting.clear(); }

export const askDecide = (v: string, card: Card, dice: number[], rollsLeft: number, level: number, seed: number) =>
  call<Decision>({ op: 'decide', v, card, dice, rollsLeft, level, seed }, () => decide(vr(v), card, dice, rollsLeft, level, mulberry32(seed)));
export const askAnalyze = (v: string, card: Card, dice: number[], rollsLeft: number) => call<Analysis>({ op: 'analyze', v, card, dice, rollsLeft }, () => analyze(vr(v), card, dice, rollsLeft));
export const askChances = (v: string, card: Card, dice: number[], rollsLeft: number) => call<Chance[]>({ op: 'chances', v, card, dice, rollsLeft }, () => chances(vr(v), card, dice, rollsLeft));
export const askPuzzle = (v: string, kind: 'hold' | 'cat', seed: number) => call<Puzzle | null>({ op: 'puzzle', v, kind, seed }, () => makePuzzle(vr(v), mulberry32(seed), kind));
