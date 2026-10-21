// Sichtfeld per rekursivem Schattenwurf.
import { H, T, W, idx } from './types';

const MULT = [
  [1, 0, 0, -1, -1, 0, 0, 1],
  [0, 1, -1, 0, 0, -1, 1, 0],
  [0, 1, 1, 0, 0, -1, -1, 0],
  [1, 0, 0, 1, -1, 0, 0, -1],
];

const blocks = (tiles: number[], x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || tiles[idx(x, y)] === T.WALL || tiles[idx(x, y)] === T.DOOR;

/** Sichtbare Felder ab (cx, cy) im Radius `r`. Geschlossene Türen blockieren, stehen aber selbst im Sichtfeld. */
export function computeFov(tiles: number[], cx: number, cy: number, r: number): Set<number> {
  const vis = new Set<number>([idx(cx, cy)]);
  const cast = (row: number, start: number, end: number, xx: number, xy: number, yx: number, yy: number) => {
    if (start < end) return;
    let s = start;
    const r2 = r * r;
    for (let j = row; j <= r; j++) {
      let dx = -j - 1, dy = -j, blocked = false, ns = s;
      while (dx <= 0) {
        dx++;
        const X = cx + dx * xx + dy * xy, Y = cy + dx * yx + dy * yy;
        const ls = (dx - 0.5) / (dy + 0.5), rs = (dx + 0.5) / (dy - 0.5);
        if (s < rs) continue;
        if (end > ls) break;
        if (dx * dx + dy * dy <= r2 && X >= 0 && Y >= 0 && X < W && Y < H) vis.add(idx(X, Y));
        const b = blocks(tiles, X, Y);
        if (blocked) {
          if (b) ns = rs; else { blocked = false; s = ns; }
        } else if (b && j < r) {
          blocked = true;
          cast(j + 1, s, ls, xx, xy, yx, yy);
          ns = rs;
        }
      }
      if (blocked) break;
    }
  };
  for (let o = 0; o < 8; o++) cast(1, 1, 0, MULT[0][o], MULT[1][o], MULT[2][o], MULT[3][o]);
  return vis;
}

/** Freie Sichtlinie zwischen zwei Feldern (Bresenham, Wände und geschlossene Türen blockieren). */
export function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let n = 0; n < 200; n++) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

export function hasLos(tiles: number[], x0: number, y0: number, x1: number, y1: number): boolean {
  const path = line(x0, y0, x1, y1);
  for (let i = 1; i < path.length - 1; i++) if (blocks(tiles, path[i][0], path[i][1])) return false;
  return true;
}
