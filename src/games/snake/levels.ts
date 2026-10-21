// Level der Kampagne (erzeugt aus Formen), Editor-Codes und Prüfung auf Lösbarkeit.
import { type Rules, DEFAULT_RULES, idx, nextCell, type Dir } from './engine';

export interface Level { id: string; name: string; info: string; w: number; h: number; wrap: boolean; goal: number; obstacles: number[]; closing?: boolean; extras?: boolean }

const W = 22, H = 15;
const cell = (x: number, y: number) => y * W + x;
const rect = (x0: number, y0: number, x1: number, y1: number): number[] => { const o: number[] = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.push(cell(x, y)); return o; };
const frame = (m: number): number[] => { const o: number[] = []; for (let x = m; x < W - m; x++) { o.push(cell(x, m), cell(x, H - 1 - m)); } for (let y = m + 1; y < H - 1 - m; y++) { o.push(cell(m, y), cell(W - 1 - m, y)); } return o; };
const uniq = (a: number[]) => [...new Set(a)];

export const LEVELS: Level[] = [
  { id: 'l1', name: 'Wiese', info: 'Freies Feld. Iss 8 Äpfel.', w: W, h: H, wrap: false, goal: 8, obstacles: [] },
  { id: 'l2', name: 'Torus', info: 'Die Ränder sind verbunden.', w: W, h: H, wrap: true, goal: 10, obstacles: [] },
  { id: 'l3', name: 'Säulen', info: 'Vier Säulen im Weg.', w: W, h: H, wrap: false, goal: 12, obstacles: uniq([...rect(5, 4, 6, 5), ...rect(15, 4, 16, 5), ...rect(5, 9, 6, 10), ...rect(15, 9, 16, 10)]) },
  { id: 'l4', name: 'Rahmen', info: 'Ein Rahmen im Spielfeld.', w: W, h: H, wrap: true, goal: 12, obstacles: uniq(frame(3).filter((c) => { const x = c % W, y = Math.floor(c / W); return !(x === 11 || y === 7); })) },
  { id: 'l5', name: 'Kreuz', info: 'Zwei Mauern kreuzen sich – mit Lücken.', w: W, h: H, wrap: false, goal: 14, obstacles: uniq([...rect(10, 1, 11, 5), ...rect(10, 9, 11, 13), ...rect(2, 11, 7, 11), ...rect(14, 3, 19, 3)]) },
  { id: 'l6', name: 'Zähne', info: 'Zinken von oben und unten.', w: W, h: H, wrap: true, goal: 14, obstacles: uniq([2, 5, 8, 11, 14, 17].flatMap((x) => [...rect(x, 0, x, 5), ...rect(x + 1, 9, x + 1, 14)]).filter((c) => c % W < W)) },
  { id: 'l7', name: 'Inseln', info: 'Verstreute Blöcke.', w: W, h: H, wrap: false, goal: 16, obstacles: uniq([...rect(3, 3, 4, 4), ...rect(9, 2, 10, 3), ...rect(16, 3, 18, 4), ...rect(4, 10, 6, 11), ...rect(12, 8, 13, 9), ...rect(17, 11, 18, 12), ...rect(9, 12, 10, 12)]) },
  { id: 'l8', name: 'Korridore', info: 'Lange Gänge mit Durchlässen.', w: W, h: H, wrap: false, goal: 16, obstacles: uniq([...rect(2, 4, 17, 4).filter((c) => c % W !== 9), ...rect(4, 10, 19, 10).filter((c) => c % W !== 13)]) },
  { id: 'l9', name: 'Kammern', info: 'Vier Räume mit engen Türen.', w: W, h: H, wrap: false, goal: 18, obstacles: uniq([...rect(10, 0, 11, 14).filter((c) => { const y = Math.floor(c / W); return y !== 3 && y !== 11; }), ...rect(0, 10, 21, 10).filter((c) => { const x = c % W; return x !== 4 && x !== 17; })]) },
  { id: 'l10', name: 'Spirale', info: 'Ein langer Weg nach innen.', w: W, h: H, wrap: false, goal: 14, obstacles: uniq([...rect(2, 2, 19, 2), ...rect(19, 2, 19, 12), ...rect(4, 12, 19, 12), ...rect(4, 9, 4, 12), ...rect(4, 5, 15, 5), ...rect(15, 5, 15, 9), ...rect(4, 5, 4, 5)]) },
  { id: 'l11', name: 'Schrumpfkur', info: 'Die Wände rücken näher.', w: W, h: H, wrap: false, goal: 14, obstacles: [], closing: true },
  { id: 'l12', name: 'Das Labyrinth', info: 'Alles zusammen – viel Glück.', w: W, h: H, wrap: false, goal: 20, obstacles: uniq([...rect(3, 3, 3, 11), ...rect(7, 0, 7, 5), ...rect(7, 9, 7, 11), ...rect(11, 6, 11, 14), ...rect(15, 0, 15, 8), ...rect(18, 6, 18, 11), ...rect(3, 3, 6, 3), ...rect(8, 11, 10, 11), ...rect(12, 3, 14, 3)]) },
];

export function levelRules(l: Level, seed: number, extras = true): Rules {
  return { ...DEFAULT_RULES, w: l.w, h: l.h, wrap: l.wrap, obstacles: l.obstacles, closing: !!l.closing, extras: l.extras ?? extras, snakes: 1, zen: false, startLen: 3, seed };
}

/** Anteil der freien Felder, die von der Startposition der Schlange aus erreichbar sind (0–1). */
export function reachable(r: Rules): number {
  const blocked = new Set(r.obstacles);
  const start = idx(r, Math.floor(r.w / 4), Math.floor(r.h / 2));
  const seen = new Set<number>([start]);
  const q = [start];
  for (let k = 0; k < q.length; k++) for (const d of [0, 1, 2, 3] as Dir[]) {
    const n = nextCell(r, q[k], d);
    if (n < 0 || blocked.has(n) || seen.has(n)) continue;
    seen.add(n); q.push(n);
  }
  const free = r.w * r.h - blocked.size;
  return free ? seen.size / free : 0;
}

// ───────── Editor-Codes ─────────

/** „S1-22-15-wrap-<hex>“: Bitmap der Hindernisse. */
export function encodeLevel(w: number, h: number, wrap: boolean, obstacles: number[]): string {
  const bits = new Array<number>(w * h).fill(0);
  for (const o of obstacles) if (o >= 0 && o < w * h) bits[o] = 1;
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += ((bits[i] << 3) | ((bits[i + 1] ?? 0) << 2) | ((bits[i + 2] ?? 0) << 1) | (bits[i + 3] ?? 0)).toString(16);
  return `S1-${w}-${h}-${wrap ? 'w' : 'm'}-${hex}`;
}
export function decodeLevel(code: string): { w: number; h: number; wrap: boolean; obstacles: number[] } | null {
  const m = /^S1-(\d{1,2})-(\d{1,2})-([wm])-([0-9a-f]+)$/i.exec(code.trim());
  if (!m) return null;
  const w = +m[1], h = +m[2];
  if (w < 8 || h < 8 || w > 40 || h > 30) return null;
  const hex = m[4].toLowerCase();
  if (hex.length !== Math.ceil((w * h) / 4)) return null;
  const obstacles: number[] = [];
  for (let i = 0; i < hex.length; i++) { const v = parseInt(hex[i], 16); for (let b = 0; b < 4; b++) { const k = i * 4 + b; if (k < w * h && (v >> (3 - b)) & 1) obstacles.push(k); } }
  return { w, h, wrap: m[3].toLowerCase() === 'w', obstacles };
}
