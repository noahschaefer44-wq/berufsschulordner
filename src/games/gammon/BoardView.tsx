import { useMemo } from 'react';
import { type BG, type Mv, type Side, opp, own } from './engine';

export interface CubeState { v: number; owner: -1 | Side }

export interface BoardViewProps {
  s: BG;
  /** Aus wessen Sicht gezeichnet wird (eigene Heimat unten rechts). */
  viewer: Side;
  selected: number | null;
  /** Zielpunkte in Betrachter-Koordinaten (0 = Auswürfeln, 25 = Bar) */
  targets: number[];
  dice: number[];
  usedDice: number[];
  /** Wer gewürfelt hat / am Zug ist */
  turn: Side;
  cube: CubeState;
  lastMoves?: { p: Side; moves: Mv[] } | null;
  hintMoves?: Mv[] | null;
  pipLabels?: boolean;
  onPoint: (q: number) => void;
  onDouble?: (q: number) => void;
  onDice?: () => void;
  canRoll?: boolean;
  onCube?: () => void;
  canCube?: boolean;
  mirror?: boolean;
}

const W = 1080, H = 700;
const LEFT = 40, TRI = 70, BAR = 60;
const TOP_Y = 40, BOT_Y = H - 40, TRI_H = 290;
const R = 29;

/** Spalte (0…11 von links) → x-Mitte */
const colX = (i: number, mirror: boolean) => {
  const j = mirror ? 11 - i : i;
  return j < 6 ? LEFT + TRI / 2 + j * TRI : LEFT + 6 * TRI + BAR + TRI / 2 + (j - 6) * TRI;
};
/** Betrachter-Punkt q → { oben?, Spalte } */
const slotOf = (q: number): { top: boolean; col: number } => (q >= 13 ? { top: true, col: q - 13 } : { top: false, col: 12 - q });

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export default function BoardView(p: BoardViewProps) {
  const { s, viewer } = p;
  const mirror = !!p.mirror;
  const mine = viewer, theirs = opp(viewer);
  const tgt = useMemo(() => new Set(p.targets), [p.targets]);

  const triangles: React.ReactNode[] = [];
  for (const top of [true, false]) for (let i = 0; i < 12; i++) {
    const q = top ? 13 + i : 12 - i;
    const x = colX(i, mirror);
    const y0 = top ? TOP_Y : BOT_Y, y1 = top ? TOP_Y + TRI_H : BOT_Y - TRI_H;
    const dark = (i + (top ? 1 : 0)) % 2 === 0;
    const isTarget = tgt.has(q);
    triangles.push(
      <g key={`t${q}`} onClick={() => p.onPoint(q)} className={`bgv-pt ${isTarget ? 'target' : ''}`}>
        <rect x={x - TRI / 2} y={top ? TOP_Y : BOT_Y - 330} width={TRI} height={330} fill="transparent" />
        <polygon points={`${x - TRI / 2 + 3},${y0} ${x + TRI / 2 - 3},${y0} ${x},${y1}`} className={dark ? 'bgv-tri-a' : 'bgv-tri-b'} />
        {isTarget && <polygon points={`${x - TRI / 2 + 3},${y0} ${x + TRI / 2 - 3},${y0} ${x},${y1}`} className="bgv-glow" />}
        {isTarget && <circle cx={x} cy={top ? y0 + 36 : y0 - 36} r={11} className="bgv-dot" />}
        {p.pipLabels !== false && <text x={x} y={top ? TOP_Y - 14 : BOT_Y + 28} textAnchor="middle" className="bgv-num">{q}</text>}
      </g>,
    );
  }

  const checkers: React.ReactNode[] = [];
  const stack = (q: number, n: number, who: Side) => {
    const { top, col } = slotOf(q);
    const x = colX(col, mirror);
    const space = TRI_H + 10;
    const step = Math.min(2 * R, (space - 2 * R) / Math.max(1, n - 1));
    for (let k = 0; k < n; k++) {
      const y = top ? TOP_Y + R + 2 + k * step : BOT_Y - R - 2 - k * step;
      const sel = p.selected === q && who === mine && k === n - 1;
      checkers.push(
        <g key={`c${q}-${k}-${who}`} className={`bgv-ch ${who === mine ? 'mine' : 'theirs'}${sel ? ' sel' : ''}`} onClick={(e) => { e.stopPropagation(); p.onPoint(q); }} onDoubleClick={(e) => { e.stopPropagation(); p.onDouble?.(q); }}>
          <circle cx={x + 1.5} cy={y + 3} r={R} className="bgv-shadow" />
          <circle cx={x} cy={y} r={R} className={who === 0 ? 'bgv-w' : 'bgv-b'} />
          <circle cx={x} cy={y} r={R - 7} className="bgv-ring" />
          {sel && <circle cx={x} cy={y} r={R + 4} className="bgv-selring" />}
          {k === n - 1 && n > 5 && <text x={x} y={y + 6} textAnchor="middle" className={who === 0 ? 'bgv-cnt-w' : 'bgv-cnt-b'}>{n}</text>}
        </g>,
      );
    }
  };
  for (let q = 1; q <= 24; q++) {
    const a = own(s, mine, q), b = own(s, theirs, 25 - q);
    if (a) stack(q, a, mine);
    if (b) stack(q, b, theirs);
  }

  // Bar
  const barX = LEFT + 6 * TRI + BAR / 2;
  const barStack = (n: number, who: Side, top: boolean) => {
    for (let k = 0; k < n; k++) {
      const y = top ? H / 2 - 70 - k * 56 : H / 2 + 70 + k * 56;
      const sel = p.selected === 25 && who === mine && k === n - 1;
      checkers.push(
        <g key={`bar${who}${k}`} className={`bgv-ch ${who === mine ? 'mine' : 'theirs'}${sel ? ' sel' : ''}`} onClick={(e) => { e.stopPropagation(); p.onPoint(25); }}>
          <circle cx={barX + 1.5} cy={y + 3} r={R} className="bgv-shadow" />
          <circle cx={barX} cy={y} r={R} className={who === 0 ? 'bgv-w' : 'bgv-b'} />
          <circle cx={barX} cy={y} r={R - 7} className="bgv-ring" />
          {sel && <circle cx={barX} cy={y} r={R + 4} className="bgv-selring" />}
        </g>,
      );
    }
  };
  barStack(s.bar[mine], mine, false);
  barStack(s.bar[theirs], theirs, true);

  // Ablage
  const trayX = LEFT + 12 * TRI + BAR + 18;
  const tray = (n: number, who: Side, top: boolean) => {
    const els: React.ReactNode[] = [];
    for (let k = 0; k < n; k++) {
      const y = top ? TOP_Y + 6 + k * 15 : BOT_Y - 20 - k * 15;
      els.push(<rect key={`o${who}${k}`} x={trayX} y={y} width={64} height={12} rx={3} className={who === 0 ? 'bgv-w' : 'bgv-b'} />);
    }
    return els;
  };

  // Würfel
  const diceEls: React.ReactNode[] = [];
  const dx0 = p.turn === mine ? LEFT + 6 * TRI + BAR + 3 * TRI : LEFT + 3 * TRI;
  const slotsDice = p.dice.length === 2 && p.dice[0] === p.dice[1] ? [...p.dice, ...p.dice] : p.dice;
  const usedLeft = [...p.usedDice];
  const used = slotsDice.map((d) => { const i = usedLeft.indexOf(d); if (i >= 0) { usedLeft.splice(i, 1); return true; } return false; });
  slotsDice.forEach((d, i) => {
    const n = slotsDice.length;
    const x = dx0 + (i - (n - 1) / 2) * 76, y = H / 2;
    diceEls.push(
      <g key={`d${i}`} transform={`translate(${x} ${y})`}><g className={`bgv-die ${used[i] ? 'used' : ''}`}>
        <rect x={-33} y={-33} width={66} height={66} rx={13} className={p.turn === 0 ? 'bgv-die-w' : 'bgv-die-b'} />
        {PIPS[d].map(([a, b], k) => <circle key={k} cx={a * 18} cy={b * 18} r={6.2} className={p.turn === 0 ? 'bgv-pip-w' : 'bgv-pip-b'} />)}
      </g></g>,
    );
  });

  // Würfel-Knopf
  const rollBtn = p.canRoll && !p.dice.length ? (
    <g className="bgv-roll" onClick={p.onDice} transform={`translate(${LEFT + 6 * TRI + BAR + 3 * TRI} ${H / 2})`}>
      <rect x={-96} y={-30} width={192} height={60} rx={30} />
      <text x={0} y={8} textAnchor="middle">Würfeln</text>
    </g>
  ) : null;

  // Doppelwürfel
  const cubeX = 20 + 0, cubeYs = { top: TOP_Y + 20, mid: H / 2 - 28, bot: BOT_Y - 76 };
  const cy = p.cube.owner === -1 ? cubeYs.mid : p.cube.owner === mine ? cubeYs.bot : cubeYs.top;
  const cubeEl = (
    <g className={`bgv-cube ${p.canCube ? 'can' : ''}`} onClick={p.canCube ? p.onCube : undefined} transform={`translate(${cubeX - 4} ${cy})`}>
      <rect x={-6} y={0} width={56} height={56} rx={9} />
      <text x={22} y={38} textAnchor="middle">{p.cube.owner === -1 ? 64 : p.cube.v}</text>
    </g>
  );

  // Pfeile des letzten Zugs
  const arrows: React.ReactNode[] = [];
  const addArrows = (moves: Mv[], mover: Side, cls: string) => {
    moves.forEach((m, i) => {
      const f = mover === mine ? m.from : m.from === 25 ? 25 : 25 - m.from;
      const t = mover === mine ? m.to : m.to === 0 ? 0 : 25 - m.to;
      const pt = (q: number, from: boolean): [number, number] => {
        if (q === 25) return [barX, from ? (mover === mine ? H / 2 + 70 : H / 2 - 70) : H / 2];
        if (q === 0) return [trayX + 32, mover === mine ? BOT_Y - 40 : TOP_Y + 40];
        const { top, col } = slotOf(q);
        return [colX(col, mirror), top ? TOP_Y + 120 : BOT_Y - 120];
      };
      const [x1, y1] = pt(f, true), [x2, y2] = pt(t, false);
      arrows.push(<path key={`${cls}${i}`} d={`M${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - 40} ${x2} ${y2}`} className={cls} markerEnd={`url(#bgv-arrow-${cls === 'bgv-arrow-last' ? 'l' : 'h'})`} />);
    });
  };
  if (p.lastMoves) addArrows(p.lastMoves.moves, p.lastMoves.p, 'bgv-arrow-last');
  if (p.hintMoves) addArrows(p.hintMoves, mine, 'bgv-arrow-hint');

  return (
    <svg className="bgv" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Backgammon-Brett">
      <defs>
        <radialGradient id="bgv-gw" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="var(--bg-w1)" /><stop offset="1" stopColor="var(--bg-w2)" /></radialGradient>
        <radialGradient id="bgv-gb" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="var(--bg-b1)" /><stop offset="1" stopColor="var(--bg-b2)" /></radialGradient>
        <marker id="bgv-arrow-l" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#e8c25a" /></marker>
        <marker id="bgv-arrow-h" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5fc8b4" /></marker>
        <filter id="bgv-grain"><feTurbulence type="fractalNoise" baseFrequency="0.015 0.4" numOctaves="3" seed="4" /><feColorMatrix type="matrix" values="0 0 0 0 .1  0 0 0 0 .05  0 0 0 0 0  0 0 0 .55 -.12" /></filter>
      </defs>
      <rect x={0} y={0} width={W} height={H} className="bgv-frame" />
      <rect x={LEFT - 14} y={TOP_Y - 28} width={6 * TRI * 2 + BAR + 28} height={H - 2 * (TOP_Y - 28)} className="bgv-field" />
      <rect x={LEFT - 14} y={TOP_Y - 28} width={6 * TRI * 2 + BAR + 28} height={H - 2 * (TOP_Y - 28)} filter="url(#bgv-grain)" opacity=".5" style={{ mixBlendMode: 'multiply' }} pointerEvents="none" />
      <rect x={LEFT + 6 * TRI} y={TOP_Y - 28} width={BAR} height={H - 2 * (TOP_Y - 28)} className="bgv-bar" onClick={() => p.onPoint(25)} />
      <rect x={trayX - 12} y={TOP_Y - 28} width={88} height={H / 2 - TOP_Y + 20} className="bgv-tray" onClick={() => p.onPoint(0)} />
      <rect x={trayX - 12} y={H / 2 + 8} width={88} height={H / 2 - TOP_Y + 20} className={`bgv-tray ${tgt.has(0) ? 'target' : ''}`} onClick={() => p.onPoint(0)} />
      <text x={trayX + 32} y={H / 2 + 4} textAnchor="middle" className="bgv-num">AUS</text>
      {triangles}
      {tray(s.off[theirs], theirs, true)}
      {tray(s.off[mine], mine, false)}
      {checkers}
      {arrows}
      {diceEls}
      {rollBtn}
      {cubeEl}
    </svg>
  );
}
