import { useId, useMemo, useRef, useState } from 'react';
import type { Board, StoneSet } from './data';
import { BLACK, EMPTY, type Color, type Territory, WHITE, groupAt, neighbors } from './engine';

export type Mark = 'tri' | 'sq' | 'x' | 'lib' | 'a' | 'b' | 'c' | 'hint';

export interface GoBoardProps {
  n: number;
  board: Uint8Array;
  torus?: boolean;
  theme: Board;
  stones: StoneSet;
  coords: boolean;
  last?: number;
  ko?: number;
  /** Farbe des Geisterstein beim Überfahren (0 = keiner) */
  ghost?: Color | 0;
  marks?: Record<number, Mark>;
  own?: Float32Array | null;
  terr?: Territory | null;
  dead?: ReadonlySet<number>;
  libsOnHover?: boolean;
  /** Punkte, die als gültig hervorgehoben werden (Lektionen) */
  hot?: number[];
  isLegal?: (i: number) => boolean;
  onPlay?: (i: number) => void;
  onRight?: (i: number) => void;
  label?: string;
}

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

export function hoshi(n: number): number[] {
  if (n < 5) return [];
  const pts: number[][] = [];
  if (n === 5) pts.push([2, 2]);
  else {
    const e = n <= 11 ? 2 : 3;
    const a = e, b = n - 1 - e, m = (n - 1) / 2;
    if (n >= 7) pts.push([a, a], [b, a], [a, b], [b, b]);
    if (n % 2 === 1) pts.push([m, m]);
    if (n >= 13 && n % 2 === 1) pts.push([a, m], [b, m], [m, a], [m, b]);
  }
  return pts.map(([x, y]) => y * n + x);
}

const THEMES: Record<Board, { bg: string; line: string; edge: string; label: string; grain: string; frame: string }> = {
  kaya: { bg: '#dcb35c', line: '#3a2a10', edge: '#b88a38', label: '#5b4216', grain: '#a07424', frame: '#8a6320' },
  bambus: { bg: '#e8d59a', line: '#4a4a22', edge: '#c9b570', label: '#665f2d', grain: '#b5a15a', frame: '#8f8446' },
  schiefer: { bg: '#4d5658', line: '#cfd6d4', edge: '#3a4244', label: '#aeb8b6', grain: '#3a4143', frame: '#2c3335' },
  papier: { bg: '#f3eee1', line: '#2c2a26', edge: '#d9d1bb', label: '#6a645a', grain: '#d8d0bc', frame: '#bdb398' },
  nacht: { bg: '#161c2b', line: '#7d8db8', edge: '#0f1420', label: '#8190b5', grain: '#222c46', frame: '#0b0f19' },
};

const STONES: Record<StoneSet, { b: [string, string, string]; w: [string, string, string]; bs: string; ws: string }> = {
  'schiefer-muschel': { b: ['#4a4d57', '#17181c', '#050506'], w: ['#ffffff', '#efede6', '#cfcabb'], bs: '#000', ws: '#a9a38f' },
  glas: { b: ['#6e86b0', '#233250', '#0d1626'], w: ['#ffffff', '#e8f2f6', '#aac7d3'], bs: '#0a1220', ws: '#8aa8b4' },
  tinte: { b: ['#3d3d3d', '#111', '#000'], w: ['#fffdf5', '#f4f0e3', '#e3dcc6'], bs: '#000', ws: '#2a2a2a' },
  bunt: { b: ['#7ea2e8', '#2f5fc4', '#173a85'], w: ['#ff9b86', '#e0452d', '#9d2314'], bs: '#112a63', ws: '#6d1409' },
};

export default function GoBoard(p: GoBoardProps) {
  const { n, board, theme, stones, coords } = p;
  const uid = useId().replace(/:/g, '');
  const T = THEMES[theme], S = STONES[stones];
  const cell = 40, pad = coords ? 34 : 22;
  const size = (n - 1) * cell + pad * 2;
  const wrapRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState(-1);
  const nb = useMemo(() => neighbors(n, !!p.torus), [n, p.torus]);
  const hs = useMemo(() => hoshi(n), [n]);

  const pos = (i: number) => ({ x: pad + (i % n) * cell, y: pad + Math.floor(i / n) * cell });
  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const svg = wrapRef.current!;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * size, sy = ((e.clientY - r.top) / r.height) * size;
    const x = Math.round((sx - pad) / cell), y = Math.round((sy - pad) / cell);
    if (x < 0 || y < 0 || x >= n || y >= n) return -1;
    return y * n + x;
  };

  const libs = useMemo(() => {
    if (!p.libsOnHover || hover < 0 || !board[hover]) return null;
    return new Set(groupAt(board, nb, hover).libs);
  }, [p.libsOnHover, hover, board, nb]);

  const lines: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = pad + i * cell;
    const ext = p.torus ? cell * 0.6 : 0;
    lines.push(<line key={`h${i}`} x1={pad - ext} y1={a} x2={pad + (n - 1) * cell + ext} y2={a} stroke={T.line} strokeWidth={i === 0 || i === n - 1 ? 1.6 : 1} strokeDasharray={p.torus ? undefined : undefined} opacity={0.9} />);
    lines.push(<line key={`v${i}`} x1={a} y1={pad - ext} x2={a} y2={pad + (n - 1) * cell + ext} stroke={T.line} strokeWidth={i === 0 || i === n - 1 ? 1.6 : 1} opacity={0.9} />);
  }

  const stoneEl = (i: number, c: Color, ghost = false) => {
    const { x, y } = pos(i);
    const r = cell * 0.47;
    const isB = c === BLACK;
    const deadNow = p.dead?.has(i);
    return (
      <g key={`s${i}${ghost ? 'g' : ''}`} opacity={ghost ? 0.5 : deadNow ? 0.38 : 1} className={!ghost && i === p.last ? 'go-new' : undefined}>
        {!ghost && <circle cx={x + 1.6} cy={y + 2.4} r={r} fill="rgba(0,0,0,.34)" filter={`url(#${uid}blur)`} />}
        <circle cx={x} cy={y} r={r} fill={`url(#${uid}${isB ? 'b' : 'w'})`} stroke={isB ? S.bs : S.ws} strokeWidth={0.7} />
      </g>
    );
  };

  const marks: React.ReactNode[] = [];
  const markOf = (i: number, m: Mark) => {
    const { x, y } = pos(i);
    const c = board[i] === BLACK ? '#f2f0e6' : board[i] === WHITE ? '#171717' : T.line;
    switch (m) {
      case 'tri': return <path key={`m${i}`} d={`M${x} ${y - 10}L${x + 9} ${y + 6}L${x - 9} ${y + 6}Z`} fill="none" stroke={c} strokeWidth={2} />;
      case 'sq': return <rect key={`m${i}`} x={x - 7} y={y - 7} width={14} height={14} fill="none" stroke={c} strokeWidth={2} />;
      case 'x': return <path key={`m${i}`} d={`M${x - 8} ${y - 8}L${x + 8} ${y + 8}M${x + 8} ${y - 8}L${x - 8} ${y + 8}`} stroke="#c0392b" strokeWidth={2.4} strokeLinecap="round" />;
      case 'lib': return <circle key={`m${i}`} cx={x} cy={y} r={5} fill="#2a9d8f" opacity={0.85} />;
      case 'hint': return <circle key={`m${i}`} cx={x} cy={y} r={cell * 0.38} fill="none" stroke="#2a9d8f" strokeWidth={3} strokeDasharray="5 4" className="go-pulse" />;
      default: return <text key={`m${i}`} x={x} y={y + 6} textAnchor="middle" fontSize={17} fontWeight={700} fontFamily="'Shippori Mincho',serif" fill={m === 'a' ? '#b3261e' : m === 'b' ? '#1f5fae' : '#1b7a3d'}>{m.toUpperCase()}</text>;
    }
  };
  if (p.marks) for (const [k, m] of Object.entries(p.marks)) marks.push(markOf(+k, m));

  const overlay: React.ReactNode[] = [];
  if (p.own) {
    for (let i = 0; i < board.length; i++) {
      const v = p.own[i];
      if (Math.abs(v) < 0.25) continue;
      const { x, y } = pos(i);
      const s = 5 + Math.abs(v) * 9;
      overlay.push(<rect key={`o${i}`} x={x - s / 2} y={y - s / 2} width={s} height={s} fill={v > 0 ? '#111' : '#fafaf5'} stroke={v > 0 ? '#fff' : '#222'} strokeWidth={0.8} opacity={0.82} />);
    }
  }
  if (p.terr) {
    for (const [list, col] of [[p.terr.black, '#111'], [p.terr.white, '#fafaf5']] as const) for (const i of list) {
      const { x, y } = pos(i);
      overlay.push(<rect key={`t${col}${i}`} x={x - 6} y={y - 6} width={12} height={12} fill={col} stroke={col === '#111' ? '#fff' : '#222'} strokeWidth={0.8} opacity={0.9} />);
    }
  }
  if (p.hot) for (const i of p.hot) { const { x, y } = pos(i); overlay.push(<circle key={`h${i}`} cx={x} cy={y} r={cell * 0.2} fill="#c0392b" opacity={0.6} />); }

  const coordEls: React.ReactNode[] = [];
  if (coords) {
    for (let i = 0; i < n; i++) {
      const a = pad + i * cell;
      coordEls.push(<text key={`cx${i}`} x={a} y={14} textAnchor="middle" fontSize={12} fill={T.label}>{LETTERS[i]}</text>);
      coordEls.push(<text key={`cy${i}`} x={12} y={a + 4} textAnchor="middle" fontSize={12} fill={T.label}>{n - i}</text>);
    }
  }

  const ghostOk = hover >= 0 && p.ghost && board[hover] === EMPTY && hover !== p.ko && (!p.isLegal || p.isLegal(hover));

  return (
    <svg
      ref={wrapRef}
      className="go-svg"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={p.label ?? `Go-Brett ${n} mal ${n}`}
      onPointerMove={(e) => setHover(at(e))}
      onPointerLeave={() => setHover(-1)}
      onPointerDown={(e) => { if (e.pointerType !== 'mouse') setHover(at(e)); }}
      onClick={(e) => { const i = at(e); if (i >= 0) p.onPlay?.(i); }}
      onContextMenu={(e) => { e.preventDefault(); const i = at(e); if (i >= 0) p.onRight?.(i); }}
    >
      <defs>
        <radialGradient id={`${uid}b`} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor={S.b[0]} /><stop offset="0.55" stopColor={S.b[1]} /><stop offset="1" stopColor={S.b[2]} /></radialGradient>
        <radialGradient id={`${uid}w`} cx="35%" cy="30%" r="80%"><stop offset="0" stopColor={S.w[0]} /><stop offset="0.6" stopColor={S.w[1]} /><stop offset="1" stopColor={S.w[2]} /></radialGradient>
        <filter id={`${uid}blur`}><feGaussianBlur stdDeviation="1.6" /></filter>
        <filter id={`${uid}grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={theme === 'papier' ? '0.8 0.8' : theme === 'schiefer' ? '0.35 0.35' : '0.004 0.22'} numOctaves="3" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.05  0 0 0 0.9 -0.28" />
        </filter>
      </defs>
      <rect width={size} height={size} fill={T.frame} />
      <rect x={4} y={4} width={size - 8} height={size - 8} fill={T.bg} />
      <rect x={4} y={4} width={size - 8} height={size - 8} filter={`url(#${uid}grain)`} opacity={theme === 'nacht' ? 0.12 : theme === 'papier' ? 0.14 : 0.5} style={{ mixBlendMode: 'multiply' }} />
      <rect x={4} y={4} width={size - 8} height={size - 8} fill="none" stroke={T.edge} strokeWidth={2} />
      {coordEls}
      {lines}
      {p.torus && <g opacity={0.55} stroke={T.line} strokeDasharray="3 5">{[0, 1].flatMap((k) => [<line key={`tw${k}`} x1={pad - cell * 0.6} y1={pad + k * (n - 1) * cell} x2={pad - cell * 0.9} y2={pad + k * (n - 1) * cell} />])}</g>}
      {hs.map((i) => { const { x, y } = pos(i); return <circle key={`hs${i}`} cx={x} cy={y} r={3.2} fill={T.line} />; })}
      {overlay}
      {p.ko !== undefined && p.ko >= 0 && board[p.ko] === EMPTY && (() => { const { x, y } = pos(p.ko); return <rect x={x - 7} y={y - 7} width={14} height={14} fill="none" stroke="#c0392b" strokeWidth={2} />; })()}
      {Array.from(board).map((v, i) => (v ? stoneEl(i, v as Color) : null))}
      {p.last !== undefined && p.last >= 0 && board[p.last] && (() => { const { x, y } = pos(p.last); return <circle cx={x} cy={y} r={cell * 0.2} fill="none" stroke={board[p.last] === BLACK ? '#f2f0e6' : '#171717'} strokeWidth={2.2} />; })()}
      {p.dead && [...p.dead].map((i) => { const { x, y } = pos(i); return <path key={`d${i}`} d={`M${x - 9} ${y - 9}L${x + 9} ${y + 9}M${x + 9} ${y - 9}L${x - 9} ${y + 9}`} stroke="#c0392b" strokeWidth={2.6} strokeLinecap="round" />; })}
      {libs && [...libs].map((i) => { const { x, y } = pos(i); return <circle key={`l${i}`} cx={x} cy={y} r={5} fill="#2a9d8f" opacity={0.9} />; })}
      {marks}
      {ghostOk && p.ghost ? stoneEl(hover, p.ghost as Color, true) : null}
    </svg>
  );
}
