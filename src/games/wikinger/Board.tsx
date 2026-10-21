import { ATT, DEF, FILES, KING, clonePos, isCorner, isEdge, make, rc, throneOf, type Mv, type Pos, type Variant } from './engine';

const S = 54, M = 30;

export interface PieceView { id: number; x: number; i: number }

export interface BoardProps {
  v: Variant;
  pieces: PieceView[];
  sel: number | null;
  targets: number[];
  onSquare: (i: number) => void;
  last?: Mv | null;
  flash?: number[];
  danger?: number[];
  exits?: number[];
  hint?: Mv | null;
  /** Felder, auf die gezogen werden darf, die ein Fluchtfeld sind */
  interactive: boolean;
}

/** Figuren mit festen Nummern (für die Bewegung): Anfangsstellung und Züge nachspielen. */
export function trackPieces(p0: Pos, moves: Mv[], upTo: number): PieceView[] {
  const n = p0.n;
  const at = new Int16Array(n * n).fill(-1);
  let id = 0;
  for (let i = 0; i < n * n; i++) if (p0.b[i]) at[i] = id++;
  const p = clonePos(p0);
  for (let k = 0; k < upTo; k++) {
    const m = moves[k];
    const before = p.b.slice();
    const mid = at[m.from];
    at[m.from] = -1;
    make(p, m);
    at[m.to] = mid;
    for (let i = 0; i < n * n; i++) if (before[i] && !p.b[i] && i !== m.from) at[i] = -1;
  }
  const out: PieceView[] = [];
  for (let i = 0; i < n * n; i++) if (p.b[i] && at[i] >= 0) out.push({ id: at[i], x: p.b[i], i });
  return out;
}

const cx = (n: number, i: number) => M + (i % n) * S + S / 2;
const cy = (n: number, i: number) => M + Math.floor(i / n) * S + S / 2;

export default function Board({ v, pieces, sel, targets, onSquare, last, flash, danger, exits, hint, interactive }: BoardProps) {
  const n = v.n, size = M * 2 + n * S, th = throneOf(n);
  const tset = new Set(targets);
  const sq = [];
  for (let i = 0; i < n * n; i++) {
    const [r, c] = rc(n, i);
    const corner = v.escape === 'corner' && isCorner(n, i);
    const edge = v.escape === 'edge' && isEdge(n, i);
    sq.push(
      <g key={i} className={`wk-sq${(r + c) % 2 ? ' alt' : ''}${corner ? ' corner' : ''}${edge ? ' edge' : ''}${i === th ? ' throne' : ''}`}>
        <rect x={M + c * S} y={M + r * S} width={S} height={S} />
        {corner && (
          <g className="wk-rune" transform={`translate(${M + c * S + S / 2} ${M + r * S + S / 2})`}>
            <circle r="17" /><circle r="10" /><path d="M-17 0H17M0 -17V17" /><path d="M-12 -12L12 12M12 -12L-12 12" />
          </g>
        )}
        {i === th && (
          <g className="wk-rune" transform={`translate(${M + c * S + S / 2} ${M + r * S + S / 2})`}>
            <path d="M0 -19L19 0L0 19L-19 0Z" /><path d="M0 -10L10 0L0 10L-10 0Z" /><circle r="3" className="dot" />
          </g>
        )}
      </g>,
    );
  }
  return (
    <svg className="wk-board" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Spielbrett ${n} mal ${n}`}>
      <defs>
        <filter id="wk-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n" /><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .13 0" /></filter>
        <radialGradient id="wk-att" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#59616f" /><stop offset=".55" stopColor="#2a2f38" /><stop offset="1" stopColor="#14171c" /></radialGradient>
        <radialGradient id="wk-def" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#f7ecd0" /><stop offset=".6" stopColor="#dccaa0" /><stop offset="1" stopColor="#b69c6e" /></radialGradient>
        <radialGradient id="wk-king" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#fff1b8" /><stop offset=".55" stopColor="#e8c455" /><stop offset="1" stopColor="#a7781c" /></radialGradient>
      </defs>
      <rect className="wk-frame" width={size} height={size} />
      <rect className="wk-frame-in" x="8" y="8" width={size - 16} height={size - 16} />
      <path className="wk-knot" d={`M14 14H${size - 14}V${size - 14}H14Z`} />
      {Array.from({ length: n }, (_, k) => (
        <g key={k} className="wk-axis">
          <text x={M + k * S + S / 2} y={22} textAnchor="middle">{FILES[k]}</text>
          <text x={M + k * S + S / 2} y={size - 11} textAnchor="middle">{FILES[k]}</text>
          <text x={14} y={M + k * S + S / 2 + 4} textAnchor="middle">{n - k}</text>
          <text x={size - 14} y={M + k * S + S / 2 + 4} textAnchor="middle">{n - k}</text>
        </g>
      ))}
      {sq}
      <rect className="wk-grain" x={M} y={M} width={n * S} height={n * S} filter="url(#wk-grain)" />
      {last && <><rect className="wk-last" x={M + (last.from % n) * S + 2} y={M + Math.floor(last.from / n) * S + 2} width={S - 4} height={S - 4} /><rect className="wk-last to" x={M + (last.to % n) * S + 2} y={M + Math.floor(last.to / n) * S + 2} width={S - 4} height={S - 4} /></>}
      {exits?.map((i) => <rect key={'e' + i} className="wk-exit" x={M + (i % n) * S + 3} y={M + Math.floor(i / n) * S + 3} width={S - 6} height={S - 6} />)}
      {sel !== null && <rect className="wk-sel" x={M + (sel % n) * S + 1} y={M + Math.floor(sel / n) * S + 1} width={S - 2} height={S - 2} />}
      {hint && <>
        <rect className="wk-hint" x={M + (hint.from % n) * S + 1} y={M + Math.floor(hint.from / n) * S + 1} width={S - 2} height={S - 2} />
        <rect className="wk-hint" x={M + (hint.to % n) * S + 1} y={M + Math.floor(hint.to / n) * S + 1} width={S - 2} height={S - 2} />
      </>}
      {flash?.map((i) => <circle key={'f' + i + '-' + (last?.to ?? 0)} className="wk-flash" cx={cx(n, i)} cy={cy(n, i)} r="14" />)}
      {pieces.map((q) => (
        <g key={q.id} className={`wk-piece k${q.x}${danger?.includes(q.i) ? ' danger' : ''}${q.x === KING ? ' king' : ''}`} style={{ transform: `translate(${cx(n, q.i)}px, ${cy(n, q.i)}px)` }}>
          <circle className="shadow" cx="1.6" cy="2.4" r={q.x === KING ? 23 : 20} />
          {q.x === ATT && <>
            <circle r="20" fill="url(#wk-att)" className="rim" />
            <circle r="15" className="inner" />
            {[0, 45, 90, 135].map((a) => <line key={a} className="spoke" x1="0" y1="-15" x2="0" y2="15" transform={`rotate(${a})`} />)}
            <circle r="5.2" className="boss" />
          </>}
          {q.x === DEF && <>
            <circle r="20" fill="url(#wk-def)" className="rim" />
            <path className="quad" d="M0 0L0 -20A20 20 0 0 1 20 0Z" /><path className="quad" d="M0 0L0 20A20 20 0 0 1 -20 0Z" />
            <circle r="14" className="inner" />
            <circle r="5" className="boss" />
          </>}
          {q.x === KING && <>
            <circle r="23" fill="url(#wk-king)" className="rim" />
            <circle r="17" className="inner" />
            <path className="crown" d="M-10 5L-12 -8L-5 -2L0 -11L5 -2L12 -8L10 5Z" />
            <rect className="crown" x="-10" y="6" width="20" height="3.4" rx="1" />
          </>}
        </g>
      ))}
      {interactive && targets.map((i) => {
        const esc = v.escape === 'corner' ? isCorner(n, i) : isEdge(n, i);
        return <g key={'t' + i} className={'wk-target' + (esc && pieces.some((q) => q.i === sel && q.x === KING) ? ' esc' : '')}><circle cx={cx(n, i)} cy={cy(n, i)} r={esc ? 9 : 6.5} /></g>;
      })}
      {Array.from({ length: n * n }, (_, i) => <rect key={'h' + i} className={'wk-hit' + (tset.has(i) ? ' t' : '')} x={M + (i % n) * S} y={M + Math.floor(i / n) * S} width={S} height={S} onClick={() => onSquare(i)} />)}
    </svg>
  );
}
