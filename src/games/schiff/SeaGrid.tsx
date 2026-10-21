import { useId, useMemo, useState } from 'react';
import type { Ship } from './engine';

export interface SeaGridProps {
  n: number;
  /** Schiffe, die gezeichnet werden (eigene Flotte oder aufgedeckte Schiffe) */
  ships: Ship[];
  /** Brett, auf das geschossen wurde (zeigt Treffer, Wasser und versenkte Schiffe) */
  shots: Uint8Array;
  ghost?: { cells: number[]; ok: boolean } | null;
  pending?: number[];
  heat?: Float64Array | null;
  radarReads?: Map<number, number>;
  lastShots?: number[];
  interactive?: boolean;
  coords?: boolean;
  sweep?: boolean;
  label: string;
  onCell?: (i: number) => void;
  onRight?: (i: number) => void;
  onHover?: (i: number) => void;
  /** Hervorgehobener Bereich (Radar-Vorschau) */
  hoverArea?: number[];
}

const C = 40;
const LET = 'ABCDEFGHIJKLMNOP';

function hullPath(n: number, ship: Ship, pad = 5): string {
  const cells = ship.cells;
  const horizontal = ship.len < 2 || (cells[1] - cells[0] === 1);
  const x0 = (cells[0] % n) * C, y0 = Math.floor(cells[0] / n) * C;
  const L = ship.len * C;
  if (horizontal) {
    const w = L - pad * 2, h = C - pad * 2, x = x0 + pad, y = y0 + pad;
    return `M${x + 8},${y} L${x + w - h * 0.7},${y} Q${x + w},${y + h / 2} ${x + w - h * 0.7},${y + h} L${x + 8},${y + h} Q${x},${y + h} ${x},${y + h - 8} L${x},${y + 8} Q${x},${y} ${x + 8},${y} Z`;
  }
  const w = C - pad * 2, h = L - pad * 2, x = x0 + pad, y = y0 + pad;
  return `M${x},${y + 8} Q${x},${y} ${x + 8},${y} L${x + w - 8},${y} Q${x + w},${y} ${x + w},${y + 8} L${x + w},${y + h - w * 0.7} Q${x + w / 2},${y + h} ${x},${y + h - w * 0.7} Z`;
}

export default function SeaGrid(p: SeaGridProps) {
  const { n } = p;
  const uid = useId().replace(/:/g, '');
  const pad = p.coords === false ? 6 : 30;
  const size = n * C + pad + 6;
  const [hover, setHover] = useState(-1);
  const heatMax = useMemo(() => (p.heat ? Math.max(1e-9, ...p.heat) : 1), [p.heat]);

  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = Math.floor((((e.clientX - r.left) / r.width) * size - pad) / C);
    const y = Math.floor((((e.clientY - r.top) / r.height) * size - pad) / C);
    return x < 0 || y < 0 || x >= n || y >= n ? -1 : y * n + x;
  };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < n * n; i++) {
    const x = pad + (i % n) * C, y = pad + Math.floor(i / n) * C;
    const v = p.shots[i];
    cells.push(<rect key={`c${i}`} x={x} y={y} width={C} height={C} className={`sg-cell${p.interactive && v === 0 ? ' live' : ''}`} />);
    if (p.heat && v === 0) {
      const t = p.heat[i] / heatMax;
      if (t > 0.02) cells.push(<rect key={`h${i}`} x={x + 1} y={y + 1} width={C - 2} height={C - 2} className="sg-heat" opacity={0.12 + t * 0.7} pointerEvents="none" />);
      if (t > 0.6) cells.push(<text key={`ht${i}`} x={x + C / 2} y={y + C / 2 + 4} textAnchor="middle" className="sg-heatnum" pointerEvents="none">{Math.round(t * 100)}</text>);
    }
  }

  const hulls = p.ships.map((s) => {
    const dead = isSunkOn(s, p.shots);
    const d = hullPath(n, s);
    const horizontal = s.len < 2 || s.cells[1] - s.cells[0] === 1;
    const x0 = pad + (s.cells[0] % n) * C, y0 = pad + Math.floor(s.cells[0] / n) * C;
    const deco: React.ReactNode[] = [];
    for (let k = 0; k < s.len; k++) {
      const cx = x0 + (horizontal ? k * C : 0) + C / 2, cy = y0 + (horizontal ? 0 : k * C) + C / 2;
      if (k % 2 === 0) deco.push(<circle key={k} cx={cx} cy={cy} r={5.5} className="sg-turret" />);
      else deco.push(<rect key={k} x={cx - 7} y={cy - 4} width={14} height={8} rx={2} className="sg-cabin" />);
    }
    return (
      <g key={`s${s.id}`} transform={`translate(${pad} ${pad})`} className={`sg-ship ${dead ? 'dead' : ''}`} pointerEvents="none">
        <path d={d} className="sg-hull" />
        <g transform={`translate(${-pad} ${-pad})`}>{deco}</g>
      </g>
    );
  });

  const marks: React.ReactNode[] = [];
  for (let i = 0; i < n * n; i++) {
    const v = p.shots[i];
    if (!v) continue;
    const cx = pad + (i % n) * C + C / 2, cy = pad + Math.floor(i / n) * C + C / 2;
    const last = p.lastShots?.includes(i);
    if (v === 1) marks.push(<g key={`m${i}`} className={`sg-miss${last ? ' last' : ''}`}><circle cx={cx} cy={cy} r={9} /><circle cx={cx} cy={cy} r={3.2} /></g>);
    else marks.push(
      <g key={`m${i}`} className={`sg-hit${last ? ' last' : ''}`}>
        <circle cx={cx} cy={cy} r={12} className="sg-glow" />
        <polygon points={`${cx},${cy - 11} ${cx + 4},${cy - 4} ${cx + 11},${cy} ${cx + 4},${cy + 4} ${cx},${cy + 11} ${cx - 4},${cy + 4} ${cx - 11},${cy} ${cx - 4},${cy - 4}`} />
        <circle cx={cx} cy={cy} r={3.5} className="sg-core" />
      </g>,
    );
  }

  const radar: React.ReactNode[] = [];
  if (p.radarReads) for (const [i, v] of p.radarReads) {
    const x = pad + (i % n) * C + C / 2, y = pad + Math.floor(i / n) * C + C / 2;
    radar.push(<g key={`r${i}`} pointerEvents="none"><rect x={x - C * 1.5} y={y - C * 1.5} width={C * 3} height={C * 3} className="sg-radar-box" /><circle cx={x} cy={y} r={11} className="sg-radar-dot" /><text x={x} y={y + 5} textAnchor="middle" className="sg-radar-n">{v}</text></g>);
  }

  const extra: React.ReactNode[] = [];
  const mark = (i: number, cls: string, key: string) => {
    const x = pad + (i % n) * C + C / 2, y = pad + Math.floor(i / n) * C + C / 2;
    return (
      <g key={key} className={cls} pointerEvents="none">
        <circle cx={x} cy={y} r={14} /><path d={`M${x - 19} ${y}H${x - 6}M${x + 6} ${y}H${x + 19}M${x} ${y - 19}V${y - 6}M${x} ${y + 6}V${y + 19}`} />
      </g>
    );
  };
  p.pending?.forEach((i) => extra.push(mark(i, 'sg-cross', `p${i}`)));
  if (hover >= 0 && p.interactive && !p.shots[hover]) extra.push(mark(hover, 'sg-cross hover', 'hv'));
  if (p.hoverArea) for (const i of p.hoverArea) extra.push(<rect key={`ha${i}`} x={pad + (i % n) * C} y={pad + Math.floor(i / n) * C} width={C} height={C} className="sg-area" pointerEvents="none" />);
  if (p.ghost) for (const i of p.ghost.cells) extra.push(<rect key={`g${i}`} x={pad + (i % n) * C + 2} y={pad + Math.floor(i / n) * C + 2} width={C - 4} height={C - 4} rx={5} className={`sg-ghost ${p.ghost.ok ? 'ok' : 'bad'}`} pointerEvents="none" />);

  const ticks: React.ReactNode[] = [];
  if (p.coords !== false) for (let i = 0; i < n; i++) {
    ticks.push(<text key={`tx${i}`} x={pad + i * C + C / 2} y={19} textAnchor="middle" className="sg-tick">{LET[i]}</text>);
    ticks.push(<text key={`ty${i}`} x={14} y={pad + i * C + C / 2 + 5} textAnchor="middle" className="sg-tick">{i + 1}</text>);
  }

  return (
    <svg
      className={`sg ${p.interactive ? 'live' : ''}`} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={p.label}
      onPointerMove={(e) => { const i = at(e); setHover(i); p.onHover?.(i); }}
      onPointerLeave={() => { setHover(-1); p.onHover?.(-1); }}
      onClick={(e) => { const i = at(e); if (i >= 0) p.onCell?.(i); }}
      onContextMenu={(e) => { e.preventDefault(); const i = at(e); if (i >= 0) p.onRight?.(i); }}
    >
      <defs>
        <clipPath id={`${uid}clip`}><rect x={pad} y={pad} width={n * C} height={n * C} /></clipPath>
        <linearGradient id={`${uid}sweep`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="var(--sea-sweep)" stopOpacity="0" /><stop offset="1" stopColor="var(--sea-sweep)" stopOpacity=".55" /></linearGradient>
      </defs>
      <rect x={0} y={0} width={size} height={size} className="sg-frame" />
      <g>{cells}</g>
      {p.sweep && <g clipPath={`url(#${uid}clip)`} pointerEvents="none"><g className="sg-sweep" style={{ transformOrigin: `${pad + (n * C) / 2}px ${pad + (n * C) / 2}px` }}><rect x={pad + (n * C) / 2} y={pad + (n * C) / 2 - 3} width={n * C * 0.75} height={6} fill={`url(#${uid}sweep)`} /></g></g>}
      {ticks}
      {hulls}
      {marks}
      {radar}
      {extra}
    </svg>
  );
}

const isSunkOn = (s: Ship, shots: Uint8Array) => s.cells.every((c) => shots[c] === 2);
