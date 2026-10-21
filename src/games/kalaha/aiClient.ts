// Ruft die Kalaha-KI im Hintergrund-Worker auf; ohne Worker rechnet der Hauptthread.
import { aiMove, gradeMove, makePuzzle, scoreMoves, type Grade, type Pos, type Puzzle, type Rules } from './engine';
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

export const askMove = (p: Pos, level: number, seed: number) => call<number>({ op: 'move', p, level, seed }, () => aiMove(p, level, mulberry32(seed)));
export const askJudge = (p: Pos, i: number) => call<{ grade: Grade; loss: number; best: number }>({ op: 'judge', p, i }, () => gradeMove(p, i, 9, 900));
export const askHint = (p: Pos) => call<number | null>({ op: 'hint', p }, () => scoreMoves(p, 10, 1200)[0]?.i ?? null);
export const askPuzzle = (r: Rules, seed: number) => call<Puzzle | null>({ op: 'puzzle', r, seed }, () => makePuzzle(r, mulberry32(seed), 120));
