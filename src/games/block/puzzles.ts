// T-Spin-Rätsel: feste Stellung, feste Steinfolge, ein Ziel. Jedes Rätsel ist per Suche als lösbar geprüft (siehe Test).
import { DEFAULT_CFG, type Game, type PuzzleSetup, T_ID, cloneGame, fits, hardDrop, lock, newGame, tryMove, tryRotate } from './engine';

export interface Puzzle { id: string; name: string; goal: 'T-Spin Single' | 'T-Spin Double' | 'T-Spin Triple'; text: string; rows: string[]; queue: number[] }

export const PUZZLES: Puzzle[] = [
  { id: 't1', name: 'T-Spin Double · Überhang links', goal: 'T-Spin Double', text: 'Schiebe das T seitlich unter den Überhang und drehe es in die Lücke.', rows: ['...X......', 'XXX...XXXX', 'XXXX.XXXXX'], queue: [3, 1, 2] },
  { id: 't2', name: 'T-Spin Double · Überhang rechts', goal: 'T-Spin Double', text: 'Das Spiegelbild: Von links unter den Überhang schieben, dann drehen.', rows: ['......X...', 'XXXX...XXX', 'XXXXX.XXXX'], queue: [3, 1, 2] },
  { id: 't3', name: 'T-Spin Single · Kniffelig', goal: 'T-Spin Single', text: 'Eine einzige Räumung per T-Spin: Finde die Lücke, in die sich das T hineindrehen lässt.', rows: ['X.X..XXX.X', 'XXX...XXXX', 'XXXX.XX.XX'], queue: [3, 1, 2] },
  { id: 't4', name: 'T-Spin Single · Zickzack', goal: 'T-Spin Single', text: 'Mehrere Lücken sehen verlockend aus – nur eine ergibt einen T-Spin.', rows: ['XXX..X.X.X', 'XX...XXXXX', 'XXX.XX.XXX', 'XXX.X.XXXX'], queue: [3, 1, 2] },
];

const idx =(g: Game, x: number, y: number) => y * g.W + x;

/** Erzeugt das Spiel zum Rätsel. */
export function puzzleGame(p: Puzzle, seed = 1): Game {
  const cfg = { ...DEFAULT_CFG, mode: 'puzzle' as const, hold: true, random: 'zufall' as const };
  const setup: PuzzleSetup = { rows: p.rows, queue: p.queue };
  return newGame(cfg, seed, setup);
}

/** Breitensuche über Bewegungen und Drehungen des ersten Steins: Gibt die beste erreichbare Räumungs-Bezeichnung zurück. */
export function reachableLabels(p: Puzzle): Set<string> {
  const g0 = puzzleGame(p);
  const out = new Set<string>();
  const c0 = g0.cur!;
  type S = { x: number; y: number; rot: number; lr: boolean; lk: number };
  const key = (s: S) => `${s.x},${s.y},${s.rot},${s.lr ? 1 : 0}`;
  const seen = new Set<string>();
  const q: S[] = [{ x: c0.x, y: c0.y, rot: c0.rot, lr: false, lk: 0 }];
  seen.add(key(q[0]));
  const tryLock = (s: S, drop: boolean) => {
    const g = cloneGame(g0);
    g.cur = { type: c0.type, x: s.x, y: s.y, rot: s.rot };
    g.lastRot = s.lr; g.lastKick = s.lk;
    if (drop) hardDrop(g); else if (fits(g, c0.type, s.rot, s.x, s.y + 1)) return;
    if (!drop) lock(g);
    if (g.lastClear) out.add(g.lastClear.label);
  };
  for (let i = 0; i < q.length && i < 20000; i++) {
    const s = q[i];
    tryLock(s, false); tryLock(s, true);
    const g = cloneGame(g0);
    const push = (nx: S) => { if (!seen.has(key(nx))) { seen.add(key(nx)); q.push(nx); } };
    g.cur = { type: c0.type, x: s.x, y: s.y, rot: s.rot };
    for (const dx of [-1, 1]) { const h = cloneGame(g0); h.cur = { type: c0.type, x: s.x, y: s.y, rot: s.rot }; if (tryMove(h, dx)) push({ x: h.cur!.x, y: h.cur!.y, rot: h.cur!.rot, lr: false, lk: 0 }); }
    if (fits(g, c0.type, s.rot, s.x, s.y + 1)) push({ x: s.x, y: s.y + 1, rot: s.rot, lr: false, lk: 0 });
    for (const d of [1, -1] as const) { const h = cloneGame(g0); h.cur = { type: c0.type, x: s.x, y: s.y, rot: s.rot }; if (tryRotate(h, d)) push({ x: h.cur!.x, y: h.cur!.y, rot: h.cur!.rot, lr: true, lk: h.lastKick }); }
  }
  void idx;
  return out;
}

export const isTType = (p: Puzzle) => p.queue[0] === T_ID;
