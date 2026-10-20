// Ruft die KI im Hintergrund-Worker auf; ohne Worker läuft sie im Hauptthread.
import { type AiResult, type Estimate, aiMove, estimate, suggestDead } from './ai';
import type { GoState } from './engine';

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

/** Bricht laufende Berechnungen ab (Worker neu starten), z. B. bei „Zug zurück“. */
export function cancelAi() {
  if (worker) { worker.terminate(); worker = null; }
  waiting.clear();
}

export const askMove = (state: GoState, level: number, seed: number) => call<AiResult>({ op: 'move', state, level, seed }, () => aiMove(state, level, seed));
export const askEstimate = (state: GoState, playouts: number, seed = 5) => call<Estimate>({ op: 'estimate', state, playouts, seed }, () => estimate(state, playouts, seed));
export const askDead = (state: GoState) => call<number[]>({ op: 'dead', state }, () => suggestDead(state));
