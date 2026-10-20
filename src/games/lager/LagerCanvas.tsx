import { memo, useEffect, useMemo, useRef } from 'react';
import { type Dir, type Level, type State, reachableFrom } from './engine';
import type { LSkin } from './data';

interface Colors { bg: string; floor: string; floor2: string; wall: string; wallTop: string; wallDark: string; goal: string; box: string; boxDark: string; boxGoal: string; boxGoalDark: string; player: string; helmet: string; dead: string }
const SKINS: Record<LSkin, Colors> = {
  lager: { bg: '#1c1c1a', floor: '#a4a29a', floor2: '#98968e', wall: '#5d5c58', wallTop: '#7b7a74', wallDark: '#3e3d3a', goal: '#f5c400', box: '#b8793a', boxDark: '#7d4f22', boxGoal: '#e7b94a', boxGoalDark: '#9a741f', player: '#f26b1d', helmet: '#f5c400', dead: '#d62b1f' },
  pixel: { bg: '#10131a', floor: '#2a3550', floor2: '#26304a', wall: '#7a5cff', wallTop: '#a08bff', wallDark: '#4a3a99', goal: '#4cf0a8', box: '#ff9d3c', boxDark: '#b4631a', boxGoal: '#4cf0a8', boxGoalDark: '#1f9a6c', player: '#ff4f7b', helmet: '#ffe45c', dead: '#ff3b3b' },
  blau: { bg: '#0d2a52', floor: '#17407a', floor2: '#153a70', wall: '#dbe9ff', wallTop: '#ffffff', wallDark: '#9fbbe0', goal: '#ffd166', box: '#7ad7f0', boxDark: '#3a9ab5', boxGoal: '#ffd166', boxGoalDark: '#b98f2c', player: '#ffffff', helmet: '#ffd166', dead: '#ff7a7a' },
};

interface Props {
  level: Level;
  state: State;
  cell: number;
  skin: LSkin;
  facing: Dir;
  animate: boolean;
  selected: number;
  hint: { box: number; dir: Dir }[] | null;
  dead: ReadonlySet<number>;
  fog: boolean;
  showDead: boolean;
  onCell: (i: number, e: React.PointerEvent) => void;
  onSwipe: (d: Dir) => void;
}

function Impl({ level, state, cell, skin, facing, animate, selected, hint, dead, fog, showDead, onCell, onSwipe }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const prev = useRef<{ state: State; t: number } | null>(null);
  const cur = useRef(state);
  const { w, h } = level;
  const C = SKINS[skin];
  const floor = useMemo(() => {
    const r = reachableFrom(level, level.player, []);
    for (const b of level.boxes) r[b] = 1;
    for (let i = 0; i < r.length; i++) if (level.goals[i] && !level.walls[i]) r[i] = r[i] || 0;
    return r;
  }, [level]);

  useEffect(() => {
    prev.current = { state: cur.current, t: performance.now() };
    cur.current = state;
  }, [state]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.ceil(w * cell * dpr); cv.height = Math.ceil(h * cell * dpr);
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = cell;
      const dur = animate ? 95 : 0;
      const k = prev.current && dur ? Math.min(1, (now - prev.current.t) / dur) : 1;
      const e = k < 1 ? 1 - (1 - k) * (1 - k) : 1;
      const at = (i: number): [number, number] => [(i % w) * s, Math.floor(i / w) * s];
      const lerpPos = (a: number, b: number): [number, number] => { const [ax, ay] = at(a), [bx, by] = at(b); return [ax + (bx - ax) * e, ay + (by - ay) * e]; };
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w * s, h * s);
      // Boden
      for (let i = 0; i < w * h; i++) {
        if (level.walls[i] || !floor[i]) continue;
        const [x, y] = at(i);
        ctx.fillStyle = (Math.floor(i / w) + (i % w)) % 2 ? C.floor : C.floor2;
        ctx.fillRect(x, y, s, s);
        if (skin === 'lager') { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(x + s * 0.12, y + s * 0.2, 2, 2); ctx.fillRect(x + s * 0.7, y + s * 0.6, 2, 2); ctx.fillRect(x + s * 0.4, y + s * 0.85, 2, 2); }
      }
      // Ziele
      for (let i = 0; i < w * h; i++) if (level.goals[i]) {
        const [x, y] = at(i);
        ctx.strokeStyle = C.goal; ctx.lineWidth = Math.max(2, s / 12);
        ctx.strokeRect(x + s * 0.16, y + s * 0.16, s * 0.68, s * 0.68);
        ctx.beginPath(); ctx.moveTo(x + s * 0.16, y + s * 0.16); ctx.lineTo(x + s * 0.84, y + s * 0.84); ctx.moveTo(x + s * 0.84, y + s * 0.16); ctx.lineTo(x + s * 0.16, y + s * 0.84); ctx.stroke();
      }
      // Sackgassen-Felder (Hilfe)
      if (showDead) for (const i of dead) { if (!floor[i]) continue; const [x, y] = at(i); ctx.fillStyle = 'rgba(214,43,31,.07)'; ctx.fillRect(x, y, s, s); }
      // Wände
      for (let i = 0; i < w * h; i++) if (level.walls[i]) {
        const [x, y] = at(i);
        const x0 = i % w, y0 = Math.floor(i / w);
        const nearFloor = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => { const nx = x0 + dx, ny = y0 + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && floor[ny * w + nx]; }));
        if (!nearFloor) continue;
        ctx.fillStyle = C.wall; ctx.fillRect(x, y, s, s);
        ctx.fillStyle = C.wallTop; ctx.fillRect(x, y, s, s * 0.18);
        ctx.fillStyle = C.wallDark; ctx.fillRect(x, y + s * 0.86, s, s * 0.14);
        // Ziegelfugen
        ctx.fillStyle = C.wallDark;
        ctx.fillRect(x, y + s * 0.5, s, 1.5);
        ctx.fillRect(x + s * ((y0 % 2) ? 0.3 : 0.7), y + s * 0.18, 1.5, s * 0.32);
        ctx.fillRect(x + s * ((y0 % 2) ? 0.7 : 0.3), y + s * 0.5, 1.5, s * 0.36);
      }
      // Hinweis (Pfeil an der Kiste)
      // Kisten
      const sv = prev.current?.state ?? state;
      const px = state.player, ppx = sv.player;
      const near = (i: number) => !fog || Math.hypot((i % w) - (px % w), Math.floor(i / w) - Math.floor(px / w)) <= 3.9;
      state.boxes.forEach((b, idx) => {
        if (!near(b)) return;
        const [x, y] = lerpPos(sv.boxes[idx] ?? b, b);
        const onGoal = level.goals[b] === 1;
        const pad = s * 0.08;
        ctx.fillStyle = onGoal ? C.boxGoalDark : C.boxDark; ctx.fillRect(x + pad, y + pad + s * 0.04, s - pad * 2, s - pad * 2);
        ctx.fillStyle = onGoal ? C.boxGoal : C.box; ctx.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2 - s * 0.04);
        ctx.strokeStyle = onGoal ? C.boxGoalDark : C.boxDark; ctx.lineWidth = Math.max(1.5, s / 16);
        ctx.strokeRect(x + pad + 1, y + pad + 1, s - pad * 2 - 2, s - pad * 2 - s * 0.04 - 2);
        ctx.beginPath(); ctx.moveTo(x + pad + 2, y + pad + 2); ctx.lineTo(x + s - pad - 2, y + s - pad - s * 0.04 - 2); ctx.moveTo(x + s - pad - 2, y + pad + 2); ctx.lineTo(x + pad + 2, y + s - pad - s * 0.04 - 2); ctx.stroke();
        if (dead.has(b) && !onGoal && showDead) { ctx.strokeStyle = C.dead; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, s - 4, s - 4); }
        if (b === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([5, 3]); ctx.strokeRect(x + 3, y + 3, s - 6, s - 6); ctx.setLineDash([]); }
      });
      // Spieler (Arbeiter von oben mit Helm)
      {
        const [x, y] = lerpPos(ppx, px);
        const cx = x + s / 2, cy = y + s / 2, r = s * 0.31;
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx + 2, cy + 3, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.player; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.helmet; ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        const fx = facing === 'l' ? -1 : facing === 'r' ? 1 : 0, fy = facing === 'u' ? -1 : facing === 'd' ? 1 : 0;
        ctx.beginPath();
        ctx.moveTo(cx + fx * r * 0.95 - fy * r * 0.28, cy + fy * r * 0.95 + fx * r * 0.28);
        ctx.lineTo(cx + fx * r * 0.95 + fy * r * 0.28, cy + fy * r * 0.95 - fx * r * 0.28);
        ctx.lineTo(cx + fx * r * 1.35, cy + fy * r * 1.35);
        ctx.closePath(); ctx.fill();
      }
      // Hinweis-Pfeile
      if (hint) hint.forEach((hh, n) => {
        const b = hh.box;
        const [x, y] = at(b);
        const ax = x + s / 2, ay = y + s / 2;
        const dx = hh.dir === 'l' ? -1 : hh.dir === 'r' ? 1 : 0, dy = hh.dir === 'u' ? -1 : hh.dir === 'd' ? 1 : 0;
        ctx.fillStyle = n === 0 ? '#2ecc71' : 'rgba(46,204,113,.55)';
        ctx.beginPath();
        ctx.moveTo(ax + dx * s * 0.45, ay + dy * s * 0.45);
        ctx.lineTo(ax + dx * s * 0.1 - dy * s * 0.28, ay + dy * s * 0.1 + dx * s * 0.28);
        ctx.lineTo(ax + dx * s * 0.1 + dy * s * 0.28, ay + dy * s * 0.1 - dx * s * 0.28);
        ctx.closePath(); ctx.fill();
      });
      // Nebel
      if (fog) {
        const [x, y] = lerpPos(ppx, px);
        const g = ctx.createRadialGradient(x + s / 2, y + s / 2, s * 2.2, x + s / 2, y + s / 2, s * 4.6);
        g.addColorStop(0, 'rgba(10,10,10,0)'); g.addColorStop(1, 'rgba(10,10,10,.82)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w * s, h * s);
      }
      if (k < 1) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [level, state, cell, skin, facing, animate, selected, hint, dead, fog, showDead, w, h, floor, C]);

  const down = useRef<{ x: number; y: number; i: number; t: number } | null>(null);
  const idxAt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) * w) / r.width), y = Math.floor(((e.clientY - r.top) * h) / r.height);
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };
  return (
    <canvas
      ref={ref}
      className="lg-canvas"
      style={{ width: w * cell, height: h * cell, touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { e.preventDefault(); down.current = { x: e.clientX, y: e.clientY, i: idxAt(e), t: performance.now() }; }}
      onPointerUp={(e) => {
        const d = down.current; down.current = null;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.hypot(dx, dy) > 28) { onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u'); return; }
        if (d.i >= 0) onCell(d.i, e);
      }}
    />
  );
}
export default memo(Impl);
