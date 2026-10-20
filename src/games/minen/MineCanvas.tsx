import { memo, useEffect, useMemo, useRef } from 'react';
import { type Board, FLAG, HIDDEN, OPEN, QUEST } from './engine';

export type Skin = 'win98' | 'flach' | 'dunkel';

interface SkinColors {
  face: string; light: string; shade: string; dark: string; openFill: string; openLine: string; boom: string; nums: string[]; flag: string; mine: string; text: string; cursor: string;
}
const SKINS: Record<Skin, SkinColors> = {
  win98: { face: '#c0c0c0', light: '#ffffff', shade: '#808080', dark: '#404040', openFill: '#c0c0c0', openLine: '#808080', boom: '#ff0000', nums: ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'], flag: '#ff0000', mine: '#000000', text: '#000', cursor: '#000' },
  flach: { face: '#dfe5ea', light: '#f4f7f9', shade: '#b4bec6', dark: '#8f9ba5', openFill: '#f8fafb', openLine: '#d5dce1', boom: '#ff8c82', nums: ['', '#1a6fd1', '#2b8a3e', '#d9363e', '#5a3fb5', '#a8541a', '#0f8b8d', '#222', '#777'], flag: '#d9363e', mine: '#222', text: '#222', cursor: '#1a6fd1' },
  dunkel: { face: '#3a4150', light: '#566074', shade: '#232833', dark: '#141820', openFill: '#1c2029', openLine: '#2a303c', boom: '#a8322d', nums: ['', '#5aa9ff', '#5fd08a', '#ff6b6b', '#b08cff', '#ffa94d', '#4dd4d4', '#eaeaea', '#9aa4b5'], flag: '#ff5d5d', mine: '#eee', text: '#eee', cursor: '#5aa9ff' },
};

export interface Geometry {
  width: number; height: number;
  center: (i: number) => [number, number];
  hit: (x: number, y: number) => number;
}

const SQ3 = Math.sqrt(3);

export function geometry(topo: string, w: number, h: number, s: number): Geometry {
  if (topo === 'hex') {
    const H = (2 / SQ3) * s;
    const center = (i: number): [number, number] => {
      const x = i % w, y = Math.floor(i / w);
      return [x * s + s / 2 + (y % 2 ? s / 2 : 0), y * 0.75 * H + H / 2];
    };
    return {
      width: (w + 0.5) * s, height: (h - 1) * 0.75 * H + H, center,
      hit: (px, py) => {
        const y0 = Math.floor(py / (0.75 * H));
        let best = -1, bd = Infinity;
        for (let y = y0 - 1; y <= y0 + 1; y++) {
          if (y < 0 || y >= h) continue;
          const x0 = Math.floor((px - (y % 2 ? s / 2 : 0)) / s);
          for (let x = x0 - 1; x <= x0 + 1; x++) {
            if (x < 0 || x >= w) continue;
            const [cx, cy] = center(y * w + x);
            const d = (cx - px) ** 2 + (cy - py) ** 2;
            if (d < bd) { bd = d; best = y * w + x; }
          }
        }
        return bd < (H / 2) ** 2 * 1.05 ? best : -1;
      },
    };
  }
  return {
    width: w * s, height: h * s,
    center: (i) => [(i % w) * s + s / 2, Math.floor(i / w) * s + s / 2],
    hit: (px, py) => {
      const x = Math.floor(px / s), y = Math.floor(py / s);
      return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
    },
  };
}

export interface Overlay {
  cursor?: number;
  pressed?: ReadonlySet<number>;
  safe?: readonly number[];
  mine?: readonly number[];
  prob?: Float64Array | null;
  /** Wrap-Nachbarn eines Zeigers zeigen (Torus) */
  hoverNb?: readonly number[];
  xray?: boolean;
  showAll?: boolean;
}

interface Props {
  b: Board;
  version: number;
  size: number;
  skin: Skin;
  overlay: Overlay;
  onDown: (i: number, button: number, e: React.PointerEvent) => void;
  onUp: (i: number, button: number, e: React.PointerEvent) => void;
  onMove: (i: number, e: React.PointerEvent) => void;
  onLeave: () => void;
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 30) * Math.PI) / 180;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawMine(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: SkinColors) {
  ctx.strokeStyle = c.mine; ctx.fillStyle = c.mine; ctx.lineWidth = Math.max(1, r * 0.18);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * r * 1.25, cy - Math.sin(a) * r * 1.25);
    ctx.lineTo(cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 1.25);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - r * 0.42, cy - r * 0.42, Math.max(1, r * 0.3), Math.max(1, r * 0.3));
}

function drawFlag(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: SkinColors) {
  ctx.fillStyle = c.mine;
  ctx.fillRect(cx - r * 0.1, cy - r * 0.8, Math.max(1.5, r * 0.2), r * 1.5);
  ctx.fillRect(cx - r * 0.65, cy + r * 0.6, r * 1.3, Math.max(1.5, r * 0.28));
  ctx.fillStyle = c.flag;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.05, cy - r * 0.85);
  ctx.lineTo(cx - r * 0.85, cy - r * 0.4);
  ctx.lineTo(cx - r * 0.05, cy + r * 0.05);
  ctx.closePath();
  ctx.fill();
}

function MineCanvasImpl({ b, version, size, skin, overlay, onDown, onUp, onMove, onLeave }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useMemo(() => geometry(b.cfg.topo, b.cfg.w, b.cfg.h, size), [b.cfg.topo, b.cfg.w, b.cfg.h, size]);
  const pad = 0;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.ceil(geo.width * dpr); cv.height = Math.ceil(geo.height * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = SKINS[skin];
    const s = size;
    const bev = Math.max(2, Math.round(s / 9));
    const hex = b.cfg.topo === 'hex';
    const H = hex ? (2 / SQ3) * s : s;
    ctx.fillStyle = skin === 'win98' ? c.openLine : c.openLine;
    ctx.fillRect(0, 0, geo.width, geo.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(s * 0.66)}px Tahoma, Verdana, 'Segoe UI', sans-serif`;
    const lost = b.status === 'lost';
    const probs = overlay.prob;
    for (let i = 0; i < b.n; i++) {
      const [cx, cy] = geo.center(i);
      const st = b.st[i];
      const pressed = overlay.pressed?.has(i) && (st === HIDDEN || st === QUEST);
      const reveal = st === OPEN || pressed || (lost && b.mine[i] && st !== FLAG) || overlay.showAll;
      const x0 = cx - s / 2, y0 = cy - s / 2;
      // Grund
      if (hex) {
        const R = H / 2 - 0.6;
        hexPath(ctx, cx, cy, R);
        ctx.fillStyle = reveal && !(overlay.showAll && st !== OPEN && !b.mine[i]) ? (b.boom === i ? c.boom : c.openFill) : c.face;
        ctx.fill();
        if (!(st === OPEN || pressed)) {
          const pts: [number, number][] = [];
          for (let k = 0; k < 6; k++) { const a = ((60 * k - 30) * Math.PI) / 180; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
          const edge = (a: number, bb: number, col: string) => { ctx.strokeStyle = col; ctx.lineWidth = bev; ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[bb][0], pts[bb][1]); ctx.stroke(); };
          if (!reveal || st === HIDDEN || st === FLAG || st === QUEST) {
            edge(3, 4, c.light); edge(4, 5, c.light); edge(5, 0, c.light);
            edge(0, 1, c.shade); edge(1, 2, c.shade); edge(2, 3, c.shade);
          }
        } else { hexPath(ctx, cx, cy, R); ctx.strokeStyle = c.openLine; ctx.lineWidth = 1; ctx.stroke(); }
      } else {
        const open = st === OPEN || pressed || (lost && b.mine[i] && st !== FLAG) || overlay.showAll;
        ctx.fillStyle = open ? (b.boom === i ? c.boom : c.openFill) : c.face;
        ctx.fillRect(x0 + pad, y0 + pad, s, s);
        if (open) {
          ctx.fillStyle = c.openLine;
          ctx.fillRect(x0, y0, s, 1); ctx.fillRect(x0, y0, 1, s);
          if (skin !== 'win98') { ctx.fillRect(x0 + s - 1, y0, 1, s); ctx.fillRect(x0, y0 + s - 1, s, 1); }
        } else {
          ctx.fillStyle = c.light;
          ctx.fillRect(x0, y0, s, bev); ctx.fillRect(x0, y0, bev, s);
          ctx.fillStyle = c.shade;
          ctx.fillRect(x0, y0 + s - bev, s, bev); ctx.fillRect(x0 + s - bev, y0, bev, s);
          if (skin === 'win98') { ctx.fillStyle = c.dark; ctx.fillRect(x0 + 1, y0 + s - 1, s - 1, 1); ctx.fillRect(x0 + s - 1, y0 + 1, 1, s - 1); }
        }
      }
      // Inhalt
      const r = s * 0.28;
      if (st === OPEN) {
        const n = b.num[i];
        if (n > 0) { ctx.fillStyle = c.nums[n] ?? c.text; ctx.fillText(String(n), cx, cy + s * 0.04); }
      } else if (st === FLAG) {
        if (lost && !b.mine[i]) { drawMine(ctx, cx, cy, r, c); ctx.strokeStyle = '#ff0000'; ctx.lineWidth = Math.max(2, s / 9); ctx.beginPath(); ctx.moveTo(cx - s * 0.36, cy - s * 0.36); ctx.lineTo(cx + s * 0.36, cy + s * 0.36); ctx.moveTo(cx + s * 0.36, cy - s * 0.36); ctx.lineTo(cx - s * 0.36, cy + s * 0.36); ctx.stroke(); }
        else drawFlag(ctx, cx, cy, s * 0.3, c);
      } else if (st === QUEST) {
        ctx.fillStyle = c.text; ctx.fillText('?', cx, cy + s * 0.04);
      } else if ((lost && b.mine[i]) || (overlay.showAll && b.mine[i])) {
        drawMine(ctx, cx, cy, r, c);
      } else if (overlay.showAll && !b.mine[i] && b.num[i] > 0) {
        ctx.fillStyle = c.nums[b.num[i]] ?? c.text; ctx.globalAlpha = 0.55; ctx.fillText(String(b.num[i]), cx, cy + s * 0.04); ctx.globalAlpha = 1;
      }
      // Überlagerungen
      if (st !== OPEN && probs && !Number.isNaN(probs[i]) && st !== FLAG) {
        const p = probs[i];
        const hue = 120 - 120 * p;
        ctx.fillStyle = `hsla(${hue}, 80%, 48%, 0.55)`;
        if (hex) { hexPath(ctx, cx, cy, H / 2 - 1.5); ctx.fill(); } else ctx.fillRect(x0 + 2, y0 + 2, s - 4, s - 4);
        if (s >= 22) { ctx.fillStyle = '#000'; ctx.font = `bold ${Math.round(s * 0.34)}px Tahoma, Verdana, sans-serif`; ctx.fillText(`${Math.round(p * 100)}`, cx, cy + s * 0.04); ctx.font = `bold ${Math.round(s * 0.66)}px Tahoma, Verdana, 'Segoe UI', sans-serif`; }
      }
      if (overlay.safe?.includes(i)) { ctx.strokeStyle = '#00c040'; ctx.lineWidth = 3; if (hex) { hexPath(ctx, cx, cy, H / 2 - 2); ctx.stroke(); } else ctx.strokeRect(x0 + 2, y0 + 2, s - 4, s - 4); }
      if (overlay.mine?.includes(i)) { ctx.strokeStyle = '#e00000'; ctx.lineWidth = 3; if (hex) { hexPath(ctx, cx, cy, H / 2 - 2); ctx.stroke(); } else ctx.strokeRect(x0 + 2, y0 + 2, s - 4, s - 4); }
      if (overlay.hoverNb?.includes(i)) { ctx.fillStyle = 'rgba(80,160,255,.28)'; if (hex) { hexPath(ctx, cx, cy, H / 2 - 1); ctx.fill(); } else ctx.fillRect(x0, y0, s, s); }
    }
    if (overlay.cursor !== undefined && overlay.cursor >= 0) {
      const [cx, cy] = geo.center(overlay.cursor);
      ctx.strokeStyle = c.cursor; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      if (hex) { hexPath(ctx, cx, cy, H / 2 - 3); ctx.stroke(); } else ctx.strokeRect(cx - s / 2 + 3, cy - s / 2 + 3, s - 6, s - 6);
      ctx.setLineDash([]);
    }
  }, [b, version, size, skin, overlay, geo, pad]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return geo.hit(((e.clientX - r.left) * geo.width) / r.width, ((e.clientY - r.top) * geo.height) / r.height);
  };
  return (
    <canvas
      ref={ref}
      className="mn-canvas"
      style={{ width: geo.width, height: geo.height, touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onDown(pos(e), e.button, e); }}
      onPointerUp={(e) => onUp(pos(e), e.button, e)}
      onPointerMove={(e) => onMove(pos(e), e)}
      onPointerLeave={onLeave}
    />
  );
}
export default memo(MineCanvasImpl);
