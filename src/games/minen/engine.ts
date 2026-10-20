// Minenfeld: Spielfeld, Nachbarschaften (Quadrat, Sechseck, Torus, Kreuz), Aufdecken, Doppelklick, 3BV.
import type { Rng } from '../shared/rng';
import { shuffled } from '../shared/rng';

export type Topo = 'quad' | 'hex' | 'torus' | 'cross';
export interface Cfg { topo: Topo; w: number; h: number; mines: number }

export const HIDDEN = 0, OPEN = 1, FLAG = 2, QUEST = 3;

const nbCache = new Map<string, number[][]>();

/** Nachbarn jeder Zelle (Index = y·w + x). */
export function neighborsOf(topo: Topo, w: number, h: number): number[][] {
  const key = `${topo}|${w}|${h}`;
  const hit = nbCache.get(key);
  if (hit) return hit;
  const out: number[][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const list: number[] = [];
      const add = (nx: number, ny: number) => {
        if (topo === 'torus') {
          nx = (nx + w) % w; ny = (ny + h) % h;
        } else if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const j = ny * w + nx;
        if (j !== y * w + x && !list.includes(j)) list.push(j);
      };
      if (topo === 'hex') {
        // „odd-r“: ungerade Reihen sind nach rechts verschoben
        const d = y % 2 === 0
          ? [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]]
          : [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]];
        for (const [dx, dy] of d) add(x + dx, y + dy);
      } else if (topo === 'cross') {
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) add(x + dx, y + dy);
      } else {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) add(x + dx, y + dy);
      }
      out.push(list);
    }
  }
  nbCache.set(key, out);
  return out;
}

export interface Board {
  cfg: Cfg;
  n: number;
  nb: number[][];
  mine: Uint8Array;
  num: Uint8Array;
  st: Uint8Array;
  placed: boolean;
  opened: number;
  flags: number;
  status: 'play' | 'won' | 'lost';
  /** Index der ausgelösten Mine (−1 = keine) */
  boom: number;
  lives: number;
}

export function newBoard(cfg: Cfg, lives = 0): Board {
  const n = cfg.w * cfg.h;
  return { cfg, n, nb: neighborsOf(cfg.topo, cfg.w, cfg.h), mine: new Uint8Array(n), num: new Uint8Array(n), st: new Uint8Array(n), placed: false, opened: 0, flags: 0, status: 'play', boom: -1, lives };
}

export function layMines(b: Board, positions: readonly number[]) {
  b.mine.fill(0);
  for (const p of positions) b.mine[p] = 1;
  for (let i = 0; i < b.n; i++) {
    let c = 0;
    for (const j of b.nb[i]) c += b.mine[j];
    b.num[i] = c;
  }
  b.placed = true;
}

/** Zellen, die beim ersten Klick garantiert minenfrei sind. */
export function safeZone(b: Board, first: number, opening: boolean): Set<number> {
  const s = new Set<number>([first]);
  if (opening) for (const j of b.nb[first]) s.add(j);
  return s;
}

export function randomMines(cfg: Cfg, rng: Rng, forbid: ReadonlySet<number>): number[] {
  const free: number[] = [];
  for (let i = 0; i < cfg.w * cfg.h; i++) if (!forbid.has(i)) free.push(i);
  const take = Math.min(cfg.mines, free.length);
  return shuffled(rng, free).slice(0, take);
}

export const maxMines = (w: number, h: number, topo: Topo = 'quad') => {
  const around = topo === 'hex' ? 6 : topo === 'cross' ? 4 : 8;
  return Math.max(1, w * h - (around + 1));
};

/** Deckt eine Zelle auf (mit Ausbreitung bei 0). Gibt alle neu geöffneten Zellen zurück. */
export function reveal(b: Board, i: number): { opened: number[]; boom: boolean } {
  const opened: number[] = [];
  if (b.status !== 'play' || b.st[i] === OPEN || b.st[i] === FLAG) return { opened, boom: false };
  if (b.mine[i]) {
    b.boom = i;
    return { opened, boom: true };
  }
  const stack = [i];
  b.st[i] = OPEN; b.opened++; opened.push(i);
  while (stack.length) {
    const c = stack.pop()!;
    if (b.num[c] !== 0) continue;
    for (const j of b.nb[c]) {
      if (b.st[j] === OPEN || b.st[j] === FLAG) continue;
      b.st[j] = OPEN; b.opened++; opened.push(j);
      stack.push(j);
    }
  }
  return { opened, boom: false };
}

/** Doppelklick auf eine Zahl: Wenn genau so viele Flaggen liegen wie die Zahl, werden die übrigen Nachbarn aufgedeckt. */
export function chord(b: Board, i: number): { opened: number[]; boom: number[] } {
  const res = { opened: [] as number[], boom: [] as number[] };
  if (b.status !== 'play' || b.st[i] !== OPEN || b.num[i] === 0) return res;
  let f = 0;
  for (const j of b.nb[i]) if (b.st[j] === FLAG) f++;
  if (f !== b.num[i]) return res;
  for (const j of b.nb[i]) {
    if (b.st[j] === HIDDEN || b.st[j] === QUEST) {
      const r = reveal(b, j);
      res.opened.push(...r.opened);
      if (r.boom) res.boom.push(j);
    }
  }
  return res;
}

export function toggleFlag(b: Board, i: number, useQuest: boolean): number {
  if (b.status !== 'play' || b.st[i] === OPEN) return b.st[i];
  const s = b.st[i];
  if (s === HIDDEN) { b.st[i] = FLAG; b.flags++; }
  else if (s === FLAG) { b.flags--; b.st[i] = useQuest ? QUEST : HIDDEN; }
  else b.st[i] = HIDDEN;
  return b.st[i];
}

export const isWon = (b: Board) => b.opened === b.n - b.cfg.mines;

/** Setzt am Ende alle Minen als Flaggen (Sieg). */
export function finishWin(b: Board) {
  b.status = 'won';
  for (let i = 0; i < b.n; i++) if (b.mine[i] && b.st[i] !== FLAG) { b.st[i] = FLAG; b.flags++; }
}

/** 3BV: kleinste Zahl an Klicks, die ohne Flaggen zum Sieg nötig ist. */
export function bbbv(b: Board): number {
  const seen = new Uint8Array(b.n);
  let count = 0;
  for (let i = 0; i < b.n; i++) {
    if (b.mine[i] || b.num[i] !== 0 || seen[i]) continue;
    count++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      for (const j of b.nb[c]) {
        if (b.mine[j] || seen[j]) continue;
        seen[j] = 1;
        if (b.num[j] === 0) stack.push(j);
      }
    }
  }
  for (let i = 0; i < b.n; i++) if (!b.mine[i] && !seen[i]) count++;
  return count;
}

/** Spielfeld aus Minenliste (z. B. aus einem Replay oder Teilcode). */
export function boardFromMines(cfg: Cfg, mines: readonly number[]): Board {
  const b = newBoard(cfg);
  layMines(b, mines);
  return b;
}

export const PRESETS: { id: string; name: string; cfg: Cfg }[] = [
  { id: 'mini', name: 'Mini (5×5)', cfg: { topo: 'quad', w: 5, h: 5, mines: 3 } },
  { id: 'anf', name: 'Anfänger (9×9)', cfg: { topo: 'quad', w: 9, h: 9, mines: 10 } },
  { id: 'fort', name: 'Fortgeschritten (16×16)', cfg: { topo: 'quad', w: 16, h: 16, mines: 40 } },
  { id: 'exp', name: 'Experte (30×16)', cfg: { topo: 'quad', w: 30, h: 16, mines: 99 } },
];
