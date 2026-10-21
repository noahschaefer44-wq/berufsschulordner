import { useEffect, useRef } from 'react';
import type { Skin } from './data';
import { type FoodKind, type Game, type Snake, xy } from './engine';

const C = 30;

const FOOD_LABEL: Record<FoodKind, string> = { apfel: '', gold: '', gift: '', geist: 'G', zeitlupe: 'Z', doppel: '×2', schild: 'S' };
const FOOD_COLOR: Record<FoodKind, string> = { apfel: '#e7471d', gold: '#ffc83d', gift: '#8a3fc7', geist: '#9fd8ff', zeitlupe: '#5ac8a0', doppel: '#ff8a3d', schild: '#6aa0ff' };

interface Palette { bg: string; bg2: string; grid: string; snake: string[]; head: string; foe: string[]; foeHead: string; wall: string; wall2: string }
const PALETTES: Record<Skin, Palette> = {
  lcd: { bg: '#b9c99b', bg2: '#aebf8f', grid: 'rgba(40,52,30,.12)', snake: ['#26331d'], head: '#18220f', foe: ['#4a5a39'], foeHead: '#2d3a22', wall: '#26331d', wall2: '#3b4a2c' },
  neon: { bg: '#070a16', bg2: '#070a16', grid: 'rgba(90,130,255,.09)', snake: ['#20f0c8', '#35a0ff', '#8a5cff'], head: '#e8fffb', foe: ['#ff9a3c', '#ff4a7a'], foeHead: '#fff1e0', wall: '#ff3d8b', wall2: '#2a0a1a' },
  papier: { bg: '#f6efdd', bg2: '#f6efdd', grid: 'rgba(80,130,200,.28)', snake: ['#2f7d4f'], head: '#1f5a37', foe: ['#c0661f'], foeHead: '#8a4310', wall: '#6d6a62', wall2: '#a9a59a' },
  pixel: { bg: '#a8d948', bg2: '#9ccf3c', grid: 'rgba(0,0,0,0)', snake: ['#4a76e8'], head: '#3860d0', foe: ['#e8923a'], foeHead: '#d07a22', wall: '#7a5230', wall2: '#9a6a3c' },
};

function drawFood(ctx: CanvasRenderingContext2D, skin: Skin, kind: FoodKind, x: number, y: number, tick: number, ttl: number) {
  const cx = x + C / 2, cy = y + C / 2;
  const blink = ttl > 0 && ttl < 14 && tick % 2 === 0;
  if (blink) return;
  if (skin === 'lcd') {
    ctx.fillStyle = '#18220f';
    if (kind === 'apfel') { ctx.fillRect(cx - 5, cy - 3, 10, 9); ctx.fillRect(cx - 1, cy - 8, 3, 5); }
    else if (kind === 'gold') { if (tick % 2) ctx.fillRect(cx - 7, cy - 7, 14, 14); else { ctx.fillRect(cx - 5, cy - 5, 10, 10); } ctx.clearRect(cx - 2, cy - 2, 4, 4); }
    else if (kind === 'gift') { ctx.fillRect(cx - 8, cy - 2, 16, 4); ctx.fillRect(cx - 2, cy - 8, 4, 16); }
    else { ctx.fillRect(cx - 9, cy - 9, 18, 18); ctx.fillStyle = '#b9c99b'; ctx.font = 'bold 14px "Silkscreen", monospace'; ctx.textAlign = 'center'; ctx.fillText(FOOD_LABEL[kind], cx, cy + 5); }
    return;
  }
  const col = FOOD_COLOR[kind];
  if (skin === 'neon') { ctx.shadowColor = col; ctx.shadowBlur = 14; }
  if (kind === 'apfel' || kind === 'gold' || kind === 'gift') {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy + 1, kind === 'apfel' ? 10 : 9, 0, Math.PI * 2); ctx.fill();
    if (skin !== 'neon') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(cx - 3.5, cy - 3, 3, 0, Math.PI * 2); ctx.fill(); }
    if (kind === 'apfel') { ctx.fillStyle = skin === 'papier' ? '#2f7d4f' : '#3fa34d'; ctx.fillRect(cx - 1, cy - 12, 3, 5); ctx.beginPath(); ctx.ellipse(cx + 5, cy - 9, 5, 2.6, -0.5, 0, Math.PI * 2); ctx.fill(); }
    if (kind === 'gift') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx - 4, cy - 3); ctx.lineTo(cx + 4, cy + 5); ctx.moveTo(cx + 4, cy - 3); ctx.lineTo(cx - 4, cy + 5); ctx.stroke(); }
  } else {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(cx - 11, cy - 11, 22, 22, 6); ctx.fill();
    ctx.fillStyle = '#0b1020'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(FOOD_LABEL[kind], cx, cy + 5);
  }
  ctx.shadowBlur = 0;
}

function drawSnake(ctx: CanvasRenderingContext2D, g: Game, s: Snake, skin: Skin, pal: Palette, tick: number) {
  const cols = s.id === 0 ? pal.snake : pal.foe;
  const headCol = s.id === 0 ? pal.head : pal.foeHead;
  const r = g.rules;
  const n = s.cells.length;
  const dead = !s.alive;
  ctx.globalAlpha = dead ? 0.45 : s.effects.geist > 0 ? 0.6 + 0.3 * Math.sin(tick / 2) : 1;
  for (let i = 0; i < n; i++) {
    const [cx, cy] = xy(r, s.cells[i]);
    const x = cx * C, y = cy * C;
    const isHead = i === n - 1;
    const col = isHead ? headCol : cols[Math.min(cols.length - 1, Math.floor((i / Math.max(1, n)) * cols.length))];
    if (skin === 'lcd') {
      ctx.fillStyle = col; ctx.fillRect(x + 3, y + 3, C - 6, C - 6);
      if (isHead) { ctx.fillStyle = '#b9c99b'; const d = s.moved; const ex = d === 1 ? 17 : d === 3 ? 8 : 12, ey = d === 0 ? 8 : d === 2 ? 17 : 11; ctx.fillRect(x + ex, y + ey, 3, 3); }
    } else if (skin === 'neon') {
      const hue = cols.length > 1 ? cols[i % cols.length] : col;
      ctx.shadowColor = hue; ctx.shadowBlur = isHead ? 20 : 10;
      ctx.fillStyle = isHead ? headCol : hue;
      ctx.beginPath(); ctx.roundRect(x + 3, y + 3, C - 6, C - 6, isHead ? 10 : 7); ctx.fill();
      ctx.shadowBlur = 0;
    } else if (skin === 'papier') {
      ctx.fillStyle = col; ctx.strokeStyle = '#1b3a28'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.roundRect(x + 3, y + 3, C - 6, C - 6, 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 7, y + 12); ctx.lineTo(x + C - 9, y + 8); ctx.stroke();
    } else {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(x + 2, y + 2, C - 4, C - 4, isHead ? 10 : 8); ctx.fill();
      if (!isHead && i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x + 6, y + 6, C - 12, 6); }
    }
    if (isHead && skin !== 'lcd') {
      const d = s.moved;
      const fx = d === 1 ? 1 : d === 3 ? -1 : 0, fy = d === 2 ? 1 : d === 0 ? -1 : 0;
      const px = fy !== 0 ? 1 : 0, py = fx !== 0 ? 1 : 0;
      for (const sgn of [-1, 1]) {
        const ex = x + C / 2 + fx * 5 + px * sgn * 5, ey = y + C / 2 + fy * 5 + py * sgn * 5;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#10131c'; ctx.beginPath(); ctx.arc(ex + fx * 1.2, ey + fy * 1.2, 1.7, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // Effekte um den Kopf
  const [hx, hy] = xy(r, s.cells[n - 1]);
  const ring = (color: string, rad: number) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx * C + C / 2, hy * C + C / 2, rad, 0, Math.PI * 2); ctx.stroke(); };
  if (s.alive) {
    if (s.effects.schild > 0) ring(skin === 'lcd' ? '#18220f' : '#6aa0ff', 20);
    if (s.effects.doppel > 0) ring(skin === 'lcd' ? '#18220f' : '#ff8a3d', 24);
    if (s.effects.zeitlupe > 0) ring(skin === 'lcd' ? '#18220f' : '#5ac8a0', 28);
  }
  ctx.globalAlpha = 1;
}

export function drawGame(ctx: CanvasRenderingContext2D, g: Game, skin: Skin) {
  const r = g.rules;
  const pal = PALETTES[skin];
  const W = r.w * C, H = r.h * C;
  ctx.clearRect(0, 0, W, H);
  // Hintergrund
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { ctx.fillStyle = skin === 'pixel' && (x + y) % 2 ? pal.bg2 : pal.bg; ctx.fillRect(x * C, y * C, C, C); }
  if (skin === 'papier' || skin === 'neon' || skin === 'lcd') {
    ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= r.w; x++) { ctx.moveTo(x * C + .5, 0); ctx.lineTo(x * C + .5, H); }
    for (let y = 0; y <= r.h; y++) { ctx.moveTo(0, y * C + .5); ctx.lineTo(W, y * C + .5); }
    ctx.stroke();
  }
  // Wände und Hindernisse
  for (const c of g.walls) {
    const [cx, cy] = xy(r, c);
    const x = cx * C, y = cy * C;
    if (skin === 'lcd') { ctx.fillStyle = pal.wall; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); ctx.fillStyle = '#b9c99b'; ctx.fillRect(x + 8, y + 8, C - 16, C - 16); ctx.fillStyle = pal.wall; ctx.fillRect(x + 11, y + 11, C - 22, C - 22); }
    else if (skin === 'neon') { ctx.shadowColor = pal.wall; ctx.shadowBlur = 10; ctx.fillStyle = pal.wall2; ctx.strokeStyle = pal.wall; ctx.lineWidth = 2; ctx.fillRect(x + 2, y + 2, C - 4, C - 4); ctx.strokeRect(x + 3, y + 3, C - 6, C - 6); ctx.shadowBlur = 0; }
    else if (skin === 'papier') { ctx.fillStyle = pal.wall2; ctx.fillRect(x + 1, y + 1, C - 2, C - 2); ctx.strokeStyle = pal.wall; ctx.lineWidth = 1.2; ctx.strokeRect(x + 1.5, y + 1.5, C - 3, C - 3); ctx.beginPath(); for (let k = -C; k < C; k += 7) { ctx.moveTo(x + k, y + C); ctx.lineTo(x + k + C, y); } ctx.save(); ctx.beginPath(); ctx.rect(x, y, C, C); ctx.clip(); ctx.stroke(); ctx.restore(); }
    else { ctx.fillStyle = pal.wall; ctx.fillRect(x, y, C, C); ctx.fillStyle = pal.wall2; ctx.fillRect(x + 2, y + 2, C - 4, 8); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, y + C - 4, C, 4); }
  }
  for (const f of g.foods) { const [cx, cy] = xy(r, f.cell); drawFood(ctx, skin, f.kind, cx * C, cy * C, g.tick, f.ttl); }
  for (const s of g.snakes) drawSnake(ctx, g, s, skin, pal, g.tick);
}

export default function SnakeCanvas({ game, skin, version, className, onSwipe }: { game: Game; skin: Skin; version: number; className?: string; onSwipe?: (d: 0 | 1 | 2 | 3) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const r = game.rules;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    drawGame(ctx, game, skin);
  }, [game, skin, version, r.w, r.h]);
  return (
    <canvas
      ref={ref} className={className} width={r.w * C} height={r.h * C}
      style={{ aspectRatio: `${r.w} / ${r.h}` }}
      aria-label="Spielfeld"
      onPointerDown={(e) => { touch.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const s = touch.current; touch.current = null;
        if (!s || !onSwipe) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
      }}
    />
  );
}
