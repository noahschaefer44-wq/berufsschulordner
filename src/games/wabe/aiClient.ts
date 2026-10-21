// Ruft die Wabe-KI im Hintergrund-Worker auf; ohne Worker rechnet der Hauptthread.
import { SETS, aiMove, gradeMove, makePuzzle, scoreRoot, type G, type Grade, type Move, type Puzzle } from './engine';
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

export const askMove = (g: G, level: number, seed: number, seen: string[]) => call<Move>({ op: 'move', g, level, seed, seen }, () => aiMove(g, level, mulberry32(seed), new Set(seen)));
export const askJudge = (g: G, m: Move) => call<{ grade: Grade; loss: number; best: Move }>({ op: 'judge', g, m }, () => gradeMove(g, m, 2, 1500));
export const askHint = (g: G) => call<Move | null>({ op: 'hint', g }, () => scoreRoot(g, 3, 2500)[0]?.m ?? null);
export const askPuzzle = (set: string, own: number, seed: number) => call<Puzzle | null>({ op: 'puzzle', set, own, seed }, () => makePuzzle(SETS.find((s) => s.id === set) ?? SETS[0], mulberry32(seed), own, 12));
