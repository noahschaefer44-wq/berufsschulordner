// Ruft die Wikinger-KI im Hintergrund-Worker auf; ohne Worker rechnet der Hauptthread.
import { aiMove, gradeMove, makePuzzle, scoreRoot, VARIANTS, type Grade, type Mv, type Pos, type Puzzle } from './engine';
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

export const askMove = (p: Pos, level: number, seed: number, seen: number[]) => call<Mv>({ op: 'move', p, level, seed, seen }, () => aiMove(p, level, mulberry32(seed), new Set(seen)));
export const askJudge = (p: Pos, mv: Mv) => call<{ grade: Grade; loss: number; best: Mv }>({ op: 'judge', p, mv }, () => gradeMove(p, mv, 3, 1200));
export const askHint = (p: Pos) => call<Mv | null>({ op: 'hint', p }, () => scoreRoot(p, 4, 1800)[0]?.mv ?? null);
export const askPuzzle = (variant: string, seed: number) => call<Puzzle | null>({ op: 'puzzle', variant, seed }, () => makePuzzle(VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0], mulberry32(seed), 2, 600));
