import { useEffect, useRef } from 'react';
import { BUFFER, type Game, GARBAGE, ROT, ghostY } from './engine';
import type { BSkin } from './data';

const COLORS: Record<BSkin, Record<number, string>> = {
  klar: { 1: '#35b6d9', 2: '#e8c13c', 3: '#a35bd0', 4: '#4aa86a', 5: '#e85a4f', 6: '#4f6fe0', 7: '#e0873a', 8: '#d96aa7', 9: '#7fd6c2', 10: '#f08d49', 11: '#9ed36a', 12: '#c9a0f0', 13: '#f0c04d', 14: '#6aa9d9', 15: '#e07a7a', 16: '#6bd0a1', 17: '#f2a65a', 18: '#8fa0ff', 19: '#d0d86a', 20: '#6b7080' },
  retro: { 1: '#00e0ff', 2: '#ffe600', 3: '#c04bff', 4: '#27d24a', 5: '#ff3b3b', 6: '#3b5bff', 7: '#ff9a1a', 8: '#ff6ec7', 9: '#4fffd0', 10: '#ffb347', 11: '#b6ff5a', 12: '#d9a8ff', 13: '#ffd84f', 14: '#6cc4ff', 15: '#ff7a7a', 16: '#5affb0', 17: '#ffc07a', 18: '#a0b0ff', 19: '#e6ff6a', 20: '#8a8a92' },
  gb: { 1: '#0f380f', 2: '#306230', 3: '#0f380f', 4: '#306230', 5: '#0f380f', 6: '#306230', 7: '#0f380f', 8: '#306230', 9: '#0f380f', 10: '#306230', 11: '#0f380f', 12: '#306230', 13: '#0f380f', 14: '#306230', 15: '#0f380f', 16: '#306230', 17: '#0f380f', 18: '#306230', 19: '#0f380f', 20: '#5a7a2a' },
  pastell: { 1: '#8fd3e8', 2: '#f4dc8a', 3: '#c9a8e8', 4: '#9ed9b0', 5: '#f2a3a0', 6: '#9db4f0', 7: '#f3bd8a', 8: '#f0b0d2', 9: '#b0e8da', 10: '#f6c79c', 11: '#c6e8a0', 12: '#dcc6f4', 13: '#f6e0a0', 14: '#a8cdea', 15: '#f0b8b8', 16: '#a8e6c8', 17: '#f6d0a8', 18: '#bcc6f8', 19: '#e6eca0', 20: '#b4b8c4' },
  kontrast: { 1: '#56b4e9', 2: '#f0e442', 3: '#cc79a7', 4: '#009e73', 5: '#d55e00', 6: '#0072b2', 7: '#e69f00', 8: '#999999', 9: '#8ad0f0', 10: '#f0b060', 11: '#60c0a0', 12: '#e0a0c8', 13: '#f8f080', 14: '#4090d0', 15: '#e08040', 16: '#40b890', 17: '#f0c870', 18: '#8090f0', 19: '#d0e060', 20: '#707070' },
};
export const pieceColor = (skin: BSkin, id: number) => COLORS[skin][id] ?? '#888';

const BG: Record<BSkin, { bg: string; grid: string; frame: string }> = {
  klar: { bg: '#0c0f14', grid: 'rgba(255,255,255,.05)', frame: '#2a313d' },
  retro: { bg: '#05060d', grid: 'rgba(120,140,255,.10)', frame: '#3b4cff' },
  gb: { bg: '#9bbc0f', grid: 'rgba(15,56,15,.12)', frame: '#0f380f' },
  pastell: { bg: '#f6f1ea', grid: 'rgba(0,0,0,.06)', frame: '#d8cfc2' },
  kontrast: { bg: '#000000', grid: 'rgba(255,255,255,.12)', frame: '#ffffff' },
};
export const skinBg = (s: BSkin) => BG[s];

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * (amt > 0 ? 255 - v : v))));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export function drawBlock(ctx: CanvasRenderingContext2D, skin: BSkin, id: number, x: number, y: number, s: number, alpha = 1) {
  const c = pieceColor(skin, id);
  ctx.globalAlpha = alpha;
  if (skin === 'retro') {
    ctx.fillStyle = shade(c, -0.45); ctx.fillRect(x, y, s, s);
    ctx.fillStyle = c; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 2, y + 2, Math.max(2, s * 0.24), Math.max(2, s * 0.24));
    ctx.fillStyle = shade(c, -0.3); ctx.fillRect(x + s * 0.5, y + s * 0.5, s * 0.45, s * 0.45);
  } else if (skin === 'gb') {
    ctx.fillStyle = '#0f380f'; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = c === '#0f380f' ? '#8bac0f' : '#9bbc0f'; ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.fillStyle = c; ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
  } else if (skin === 'pastell') {
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x + 1, y + 1, s - 2, s - 2, s * 0.22); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.roundRect(x + 3, y + 3, s - 6, s * 0.28, s * 0.12); ctx.fill();
  } else if (skin === 'kontrast') {
    ctx.fillStyle = c; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
  } else {
    ctx.fillStyle = c; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = shade(c, 0.32); ctx.fillRect(x, y, s, Math.max(2, s * 0.12)); ctx.fillRect(x, y, Math.max(2, s * 0.12), s);
    ctx.fillStyle = shade(c, -0.32); ctx.fillRect(x, y + s - Math.max(2, s * 0.12), s, Math.max(2, s * 0.12)); ctx.fillRect(x + s - Math.max(2, s * 0.12), y, Math.max(2, s * 0.12), s);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }
  ctx.globalAlpha = 1;
}

export interface FlashRow { rows: number[]; t: number }
export interface Overlay { flashes: FlashRow[]; target?: { type: number; x: number; rot: number } | null; seenAt?: Float64Array | null; invisible: boolean; shake: number }

/** Zeichnet das Spielfeld (sichtbarer Teil) in `cv`. */
export function drawBoard(cv: HTMLCanvasElement, g: Game, skin: BSkin, cell: number, ghost: boolean, grid: boolean, ov: Overlay, now: number) {
  const W = g.W, H = g.cfg.h, s = cell;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.ceil(W * s * dpr) || cv.height !== Math.ceil(H * s * dpr)) { cv.width = Math.ceil(W * s * dpr); cv.height = Math.ceil(H * s * dpr); }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const B = BG[skin];
  ctx.fillStyle = B.bg; ctx.fillRect(0, 0, W * s, H * s);
  if (grid) {
    ctx.strokeStyle = B.grid; ctx.lineWidth = 1;
    for (let x = 1; x < W; x++) { ctx.beginPath(); ctx.moveTo(x * s + 0.5, 0); ctx.lineTo(x * s + 0.5, H * s); ctx.stroke(); }
    for (let y = 1; y < H; y++) { ctx.beginPath(); ctx.moveTo(0, y * s + 0.5); ctx.lineTo(W * s, y * s + 0.5); ctx.stroke(); }
  }
  const ox = ov.shake ? (Math.random() - 0.5) * ov.shake : 0, oy = ov.shake ? (Math.random() - 0.5) * ov.shake : 0;
  ctx.save(); ctx.translate(ox, oy);
  for (let y = BUFFER; y < g.R; y++) for (let x = 0; x < W; x++) {
    const v = g.board[y * W + x];
    if (!v) continue;
    let a = 1;
    if (ov.invisible && v !== GARBAGE) { const t = ov.seenAt?.[y * W + x] ?? 0; a = Math.max(0, 1 - (now - t) / 1200); if (a <= 0.02) continue; }
    drawBlock(ctx, skin, v, x * s, (y - BUFFER) * s, s, a);
  }
  // Zielvorgabe (Finesse)
  if (ov.target) {
    const cells = ROT[ov.target.type][ov.target.rot & 3];
    let y0 = BUFFER - 2;
    const fitsAt = (yy: number) => cells.every(([cx, cy]) => { const px = ov.target!.x + cx, py = yy + cy; return px >= 0 && px < g.W && py < g.R && !(py >= 0 && g.board[py * g.W + px]); });
    while (fitsAt(y0 + 1)) y0++;
    ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 3]);
    for (const [cx, cy] of cells) ctx.strokeRect((ov.target.x + cx) * s + 3, (y0 + cy - BUFFER) * s + 3, s - 6, s - 6);
    ctx.setLineDash([]);
  }
  // Geist
  const c = g.cur;
  if (c) {
    const gy = ghostY(g);
    if (ghost && gy !== c.y) {
      for (const [cx, cy] of ROT[c.type][c.rot & 3]) {
        const px = c.x + cx, py = gy + cy - BUFFER;
        if (py < 0) continue;
        ctx.strokeStyle = pieceColor(skin, c.type); ctx.globalAlpha = skin === 'kontrast' ? 0.9 : 0.55; ctx.lineWidth = 2;
        ctx.strokeRect(px * s + 2, py * s + 2, s - 4, s - 4);
        ctx.globalAlpha = 1;
      }
    }
    for (const [cx, cy] of ROT[c.type][c.rot & 3]) {
      const py = c.y + cy - BUFFER;
      if (py < -1) continue;
      drawBlock(ctx, skin, c.type, (c.x + cx) * s, py * s, s);
    }
  }
  ctx.restore();
  // Zeilen-Blitz
  for (const f of ov.flashes) {
    const k = (now - f.t) / 260;
    if (k >= 1) continue;
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - k)})`;
    for (const r of f.rows) { const py = r - BUFFER; if (py >= 0 && py < H) ctx.fillRect(0, py * s, W * s, s); }
  }
}

/** Kleines Feld für Halten/Vorschau. */
export function drawMini(cv: HTMLCanvasElement, type: number, skin: BSkin, size: number, dim = false) {
  const dpr = window.devicePixelRatio || 1;
  const w = size * 4, h = size * 3;
  if (cv.width !== Math.ceil(w * dpr)) { cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!type) return;
  const cells = ROT[type][0];
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.min(size, Math.floor(Math.min(w / (maxX - minX + 2), h / (maxY - minY + 2))));
  const offX = (w - (maxX - minX + 1) * k) / 2, offY = (h - (maxY - minY + 1) * k) / 2;
  for (const [cx, cy] of cells) drawBlock(ctx, skin, type, offX + (cx - minX) * k, offY + (cy - minY) * k, k, dim ? 0.4 : 1);
}

export function useAnimationFrame(cb: (t: number) => void, active: boolean) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = (t: number) => { ref.current(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
