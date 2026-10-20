// Computergegner für das Duell: bewertet alle Platzierungen (mit Halten) nach einer klassischen Formel.
import { type Game, BUFFER, PIECES, ROT, doHold, fits, hardDrop } from './engine';
import type { Rng } from '../shared/rng';

export interface Plan { type: number; x: number; rot: number; hold: boolean; score: number }

function evaluate(board: Uint8Array, W: number, R: number): number {
  // Zeilen räumen (gedanklich)
  let lines = 0;
  const rows: boolean[] = [];
  for (let y = 0; y < R; y++) { let f = true; for (let x = 0; x < W; x++) if (!board[y * W + x]) { f = false; break; } rows.push(f); if (f) lines++; }
  const heights = new Array<number>(W).fill(0);
  let holes = 0, maxH = 0;
  for (let x = 0; x < W; x++) {
    let seen = false, hgt = 0, ry = 0;
    for (let y = 0; y < R; y++) {
      if (rows[y]) continue; // geräumte Zeile zählt nicht
      ry++;
      const filled = board[y * W + x] !== 0;
      if (filled && !seen) { seen = true; hgt = R - y - rows.slice(y).filter(Boolean).length; }
      else if (!filled && seen) holes++;
    }
    void ry;
    heights[x] = hgt; maxH = Math.max(maxH, hgt);
  }
  let agg = 0, bump = 0;
  for (let x = 0; x < W; x++) { agg += heights[x]; if (x) bump += Math.abs(heights[x] - heights[x - 1]); }
  return -0.51 * agg + 0.76 * lines * 1.4 - 0.36 * holes * 1.6 - 0.18 * bump - (maxH > 14 ? 0.8 * (maxH - 14) : 0);
}

function candidates(g: Game, type: number, hold: boolean): Plan[] {
  const out: Plan[] = [];
  const def = PIECES[type - 1];
  for (let rot = 0; rot < 4; rot++) {
    const cells = ROT[type][rot];
    const minX = Math.min(...cells.map((c) => c[0])), maxX = Math.max(...cells.map((c) => c[0]));
    for (let x = -minX; x + maxX < g.W; x++) {
      if (!fits(g, type, rot, x, BUFFER - 2)) continue;
      let y = BUFFER - 2;
      while (fits(g, type, rot, x, y + 1)) y++;
      const nb = g.board.slice();
      let above = false;
      for (const [cx, cy] of cells) { const yy = y + cy; if (yy >= BUFFER) above = true; nb[yy * g.W + x + cx] = type; }
      if (!above) continue;
      out.push({ type, x, rot, hold, score: evaluate(nb, g.W, g.R) });
    }
  }
  void def;
  return out;
}

/** Beste Platzierung. skill 0..1: je kleiner, desto eher ein schwächerer Zug. */
export function planMove(g: Game, skill: number, rng: Rng): Plan | null {
  if (!g.cur) return null;
  let cands = candidates(g, g.cur.type, false);
  if (g.cfg.hold && !g.holdUsed) {
    const other = g.hold || g.queue[0];
    if (other) cands = cands.concat(candidates(g, other, true));
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  // Fehlerquote
  const spread = Math.max(1, Math.round((1 - skill) * 6));
  const pick = rng() < skill + 0.25 ? 0 : Math.floor(rng() * Math.min(cands.length, spread));
  return cands[pick];
}

/** Führt den Plan aus: gegebenenfalls halten, Stein setzen, fallen lassen. */
export function executePlan(g: Game, p: Plan) {
  if (p.hold) doHold(g);
  const c = g.cur;
  if (!c) return;
  if (fits(g, c.type, p.rot, p.x, c.y)) { c.rot = p.rot; c.x = p.x; }
  hardDrop(g);
}
