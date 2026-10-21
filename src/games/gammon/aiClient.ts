// Ruft die Backgammon-KI im Hintergrund-Worker auf; ohne Worker rechnet der Hauptthread.
import { type Choice, chooseMove, judge, preRollProb, shouldDouble, shouldTake } from './ai';
import type { BG, Seq, Side } from './engine';
import { type Puzzle, genPuzzle } from './puzzles';
import { mulberry32 } from '../shared/rng';

let worker: Worker | null = null;
let wid = 0;
const waiting = new Map<number, (r: unknown) => void>();

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

export interface Judged { loss: number; bestP: number; best: Seq; top: { seq: Seq; p: number }[] }
const judgeSync = (s: BG, p: Side, dice: number[], played: Seq): Judged => {
  const j = judge(s, p, dice, played);
  return { loss: j.loss, bestP: j.best.p, best: j.best.seq, top: j.list.slice(0, 5).map((x) => ({ seq: x.seq, p: x.p })) };
};

export const askMove = (s: BG, p: Side, dice: number[], level: number, seed: number) => call<Choice>({ op: 'move', s, p, dice, level, seed }, () => chooseMove(s, p, dice, level, mulberry32(seed)));
export const askDouble = (s: BG, p: Side, level: number, seed: number) => call<boolean>({ op: 'double', s, p, level, seed }, () => shouldDouble(s, p, level, mulberry32(seed)));
export const askTake = (s: BG, p: Side, level: number, seed: number) => call<boolean>({ op: 'take', s, p, level, seed }, () => shouldTake(s, p, level, mulberry32(seed)));
export const askProb = (s: BG, p: Side) => call<number>({ op: 'prob', s, p }, () => preRollProb(s, p));
export const askJudge = (s: BG, p: Side, dice: number[], played: Seq) => call<Judged>({ op: 'judge', s, p, dice, played }, () => judgeSync(s, p, dice, played));
export const askPuzzle = (seed: number) => call<Puzzle | null>({ op: 'puzzle', seed }, () => genPuzzle(seed));
