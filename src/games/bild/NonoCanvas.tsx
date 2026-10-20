import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Nono } from './engine';
import type { BTheme } from './data';

export interface Palette { paper: string; grid: string; ink: string; thin: string; thick: string; hover: string; done: string; fill: string; cross: string; wrong: string; clue: string; c1: string; c2: string; c3: string }
export const PALETTES: Record<BTheme, Palette> = {
  mondrian: { paper: '#f4f0e6', grid: '#ffffff', ink: '#111111', thin: '#cfc9b9', thick: '#111111', hover: '#fdeea0', done: '#b4ad9a', fill: '#111111', cross: '#8d8776', wrong: '#d6222a', clue: '#111111', c1: '#d6222a', c2: '#1f49a3', c3: '#f7d417' },
  blau: { paper: '#123a6b', grid: '#0e3160', ink: '#dbe9ff', thin: '#2a5791', thick: '#dbe9ff', hover: '#1f4f8c', done: '#5f86b8', fill: '#f5faff', cross: '#5f86b8', wrong: '#ff7a7a', clue: '#dbe9ff', c1: '#ffd166', c2: '#7ad7f0', c3: '#ffffff' },
  nacht: { paper: '#14161b', grid: '#1b1e25', ink: '#e8e8ea', thin: '#2c303a', thick: '#6b7080', hover: '#2a2f3b', done: '#5a5f6e', fill: '#ececf0', cross: '#6b7080', wrong: '#ff6b6b', clue: '#d8d8de', c1: '#f5b942', c2: '#6ec1ff', c3: '#f27d7d' },
};

export interface LineHint { line: 'row' | 'col'; index: number; fill: number[]; cross: number[] }

interface Props {
  nono: Nono;
  u: Int8Array;
  version: number;
  cell: number;
  theme: BTheme;
  sol: Uint8Array | null;
  wrong: ReadonlySet<number>;
  hint: LineHint | null;
  won: boolean;
  colorWin: boolean;
  ghost: boolean;
  cursor: number;
  rowDone: readonly boolean[];
  colDone: readonly boolean[];
  disabled?: boolean;
  onStart: (i: number, kind: 'fill' | 'cross', e: React.PointerEvent) => void;
  onMove: (i: number) => void;
  onEnd: () => void;
}

export const clueMetrics = (nono: Nono, cell: number) => {
  const maxRow = Math.max(...nono.rows.map((r) => r.length));
  const maxCol = Math.max(...nono.cols.map((c) => c.length));
  const fs = Math.max(9, Math.round(cell * 0.56));
  const left = Math.round(maxRow * fs * 0.95 + cell * 0.7);
  const top = Math.round(maxCol * fs * 1.15 + cell * 0.5);
  return { left, top, fs };
};

function Impl({ nono, u, version, cell, theme, sol, wrong, hint, won, colorWin, ghost, cursor, rowDone, colDone, disabled, onStart, onMove, onEnd }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = nono;
  const m = useMemo(() => clueMetrics(nono, cell), [nono, cell]);
  const W = m.left + w * cell + 2, H = m.top + h * cell + 2;
  const [hover, setHover] = useState(-1);
  const stroke = useRef<{ kind: 'fill' | 'cross'; start: number; axis: 'row' | 'col' | null; last: number } | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = PALETTES[theme];
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
    const gx = m.left, gy = m.top;
    // Rasterfläche
    ctx.fillStyle = P.grid; ctx.fillRect(gx, gy, w * cell, h * cell);
    const hr = hover >= 0 ? Math.floor(hover / w) : -1, hc = hover >= 0 ? hover % w : -1;
    if (hover >= 0 && !won) {
      ctx.fillStyle = P.hover;
      ctx.fillRect(gx, gy + hr * cell, w * cell, cell);
      ctx.fillRect(gx + hc * cell, gy, cell, h * cell);
      ctx.fillRect(0, gy + hr * cell, gx, cell);
      ctx.fillRect(gx + hc * cell, 0, cell, gy);
    }
    if (hint) {
      ctx.fillStyle = 'rgba(40, 170, 90, .18)';
      if (hint.line === 'row') ctx.fillRect(0, gy + hint.index * cell, gx + w * cell, cell);
      else ctx.fillRect(gx + hint.index * cell, 0, cell, gy + h * cell);
    }
    // Zellen
    const pal = [P.c1, P.c2, P.c3, P.ink];
    for (let i = 0; i < w * h; i++) {
      const x = gx + (i % w) * cell, y = gy + Math.floor(i / w) * cell;
      const v = u[i];
      if (ghost && sol && sol[i] && v !== 1) { ctx.fillStyle = 'rgba(120,120,120,.28)'; ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4); }
      if (v === 1) {
        if (won && colorWin) {
          const mb = Math.floor(((i % w) * 3) / w) + 3 * Math.floor((Math.floor(i / w) * 3) / h);
          ctx.fillStyle = pal[[0, 3, 1, 3, 2, 3, 1, 3, 0][mb]];
        } else ctx.fillStyle = wrong.has(i) ? P.wrong : P.fill;
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      } else if (v === 0) {
        ctx.strokeStyle = wrong.has(i) ? P.wrong : P.cross; ctx.lineWidth = Math.max(1.4, cell / 14);
        const p = cell * 0.28;
        ctx.beginPath(); ctx.moveTo(x + p, y + p); ctx.lineTo(x + cell - p, y + cell - p); ctx.moveTo(x + cell - p, y + p); ctx.lineTo(x + p, y + cell - p); ctx.stroke();
      }
    }
    if (hint) {
      for (const i of hint.fill) { const x = gx + (i % w) * cell, y = gy + Math.floor(i / w) * cell; ctx.strokeStyle = '#1fa35a'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4); }
      for (const i of hint.cross) { const x = gx + (i % w) * cell, y = gy + Math.floor(i / w) * cell; ctx.strokeStyle = '#1fa35a'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6); ctx.setLineDash([]); }
    }
    // Linien
    for (let i = 0; i <= w; i++) { ctx.strokeStyle = i % 5 === 0 || i === w ? P.thick : P.thin; ctx.lineWidth = i % 5 === 0 || i === w ? 2 : 1; ctx.beginPath(); ctx.moveTo(gx + i * cell, gy); ctx.lineTo(gx + i * cell, gy + h * cell); ctx.stroke(); }
    for (let i = 0; i <= h; i++) { ctx.strokeStyle = i % 5 === 0 || i === h ? P.thick : P.thin; ctx.lineWidth = i % 5 === 0 || i === h ? 2 : 1; ctx.beginPath(); ctx.moveTo(gx, gy + i * cell); ctx.lineTo(gx + w * cell, gy + i * cell); ctx.stroke(); }
    // Hinweise
    ctx.font = `800 ${m.fs}px Jost, 'Futura', 'Century Gothic', sans-serif`;
    ctx.textBaseline = 'middle';
    nono.rows.forEach((cl, r) => {
      ctx.textAlign = 'right';
      let x = gx - cell * 0.28;
      for (let k = cl.length - 1; k >= 0; k--) {
        ctx.fillStyle = rowDone[r] ? P.done : P.clue;
        const t = String(cl[k]);
        ctx.fillText(t, x, gy + r * cell + cell / 2 + 1);
        x -= ctx.measureText(t).width + m.fs * 0.35;
      }
    });
    nono.cols.forEach((cl, c) => {
      ctx.textAlign = 'center';
      let y = gy - cell * 0.28;
      for (let k = cl.length - 1; k >= 0; k--) {
        ctx.fillStyle = colDone[c] ? P.done : P.clue;
        ctx.fillText(String(cl[k]), gx + c * cell + cell / 2, y);
        y -= m.fs * 1.12;
      }
    });
    if (cursor >= 0) { const x = gx + (cursor % w) * cell, y = gy + Math.floor(cursor / w) * cell; ctx.strokeStyle = P.c2; ctx.lineWidth = 2.5; ctx.setLineDash([5, 3]); ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4); ctx.setLineDash([]); }
  }, [nono, u, version, cell, theme, sol, wrong, hint, won, colorWin, ghost, cursor, rowDone, colDone, hover, m, W, H, w, h]);

  const idxAt = (e: React.PointerEvent): number => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) * W) / r.width - m.left, y = ((e.clientY - r.top) * H) / r.height - m.top;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    return cx < 0 || cy < 0 || cx >= w || cy >= h ? -1 : cy * w + cx;
  };
  return (
    <canvas
      ref={ref}
      className="bd-canvas"
      style={{ width: W, height: H, touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (disabled) return;
        const i = idxAt(e);
        if (i < 0) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const kind: 'fill' | 'cross' = e.button === 2 ? 'cross' : 'fill';
        stroke.current = { kind, start: i, axis: null, last: i };
        onStart(i, kind, e);
      }}
      onPointerMove={(e) => {
        const i = idxAt(e);
        if (i !== hover) setHover(i);
        const s = stroke.current;
        if (!s || i < 0) return;
        if (!s.axis) {
          if (i === s.start) return;
          s.axis = Math.floor(i / w) === Math.floor(s.start / w) ? 'row' : 'col';
        }
        const sr = Math.floor(s.start / w), sc = s.start % w;
        const target = s.axis === 'row' ? sr * w + (i % w) : Math.floor(i / w) * w + sc;
        const step = s.axis === 'row' ? 1 : w;
        let a = s.last;
        const dir = target > a ? step : -step;
        let guard = 0;
        while (a !== target && guard++ < 200) { a += dir; onMove(a); }
        s.last = target;
      }}
      onPointerUp={() => { if (stroke.current) { stroke.current = null; onEnd(); } }}
      onPointerCancel={() => { if (stroke.current) { stroke.current = null; onEnd(); } }}
      onPointerLeave={() => setHover(-1)}
    />
  );
}
export default memo(Impl);
