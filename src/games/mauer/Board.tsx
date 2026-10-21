import { useEffect, useRef, useState } from 'react';
import { FILES, sameMove, type Move, type Pos, type State } from './engine';

const C = 52, G = 12, P = C + G, M = 26;

export interface BoardProps {
  s: State;
  /** Felder, auf die der Bauer des Spielers am Zug ziehen darf */
  targets: Pos[];
  /** Spieler darf klicken */
  canAct: boolean;
  /** Jede Mausposition wählt die nächste Mauerfuge (für Touch) */
  wallMode: boolean;
  /** Mauern, die gesetzt werden dürfen, prüft der Aufrufer */
  wallOk: (m: Move) => boolean;
  onMove: (m: Move) => void;
  last?: Move | null;
  hint?: Move | null;
  paths?: [Pos[], Pos[]] | null;
  /** Besitzer gesetzter Mauern (undefined = vorgebaut) */
  owner?: (m: Move) => 0 | 1 | undefined;
  /** Zusätzliche Hervorhebung (Lektionen) */
  mark?: Pos[];
  names?: [string, string];
}

const cx = (c: number) => M + c * P + C / 2;
const cy = (r: number) => M + r * P + C / 2;

function wallRect(m: Move) {
  return m.t === 'h'
    ? { x: M + m.c * P, y: M + m.r * P + C, w: 2 * C + G, h: G }
    : { x: M + m.c * P + C, y: M + m.r * P, w: G, h: 2 * C + G };
}

export default function Board({ s, targets, canAct, wallMode, wallOk, onMove, last, hint, paths, owner, mark, names }: BoardProps) {
  const n = s.n, w = n - 1, size = M * 2 + n * C + (n - 1) * G;
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ wall?: Move; cell?: Pos } | null>(null);
  const flip = useRef<'h' | 'v'>('h');
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'r' || e.key === 'R') flip.current = flip.current === 'h' ? 'v' : 'h'; };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const locate = (e: React.PointerEvent | React.MouseEvent) => {
    const el = svg.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * size - M;
    const y = ((e.clientY - b.top) / b.height) * size - M;
    const gx = (c: number) => c * P + C + G / 2;
    const ci = Math.max(0, Math.min(w - 1, Math.round((x - C - G / 2) / P)));
    const ri = Math.max(0, Math.min(w - 1, Math.round((y - C - G / 2) / P)));
    const onH = Math.abs(y - gx(ri)) <= G / 2 + 2 && y > 0 && y < n * P; // auf einer waagerechten Fuge
    const onV = Math.abs(x - gx(ci)) <= G / 2 + 2 && x > 0 && x < n * P;
    const hdist = Math.abs(y - gx(ri)), vdist = Math.abs(x - gx(ci));
    let wall: Move | undefined;
    if (wallMode) {
      let t: 'h' | 'v' = hdist < vdist ? 'h' : 'v';
      if (Math.abs(hdist - vdist) < 4) t = flip.current;
      wall = { t, r: ri, c: ci };
    } else if (onH || onV) {
      let t: 'h' | 'v' = onH && !onV ? 'h' : onV && !onH ? 'v' : flip.current;
      if (onH && onV) t = flip.current;
      wall = { t, r: ri, c: ci };
    }
    const col = Math.floor(x / P), row = Math.floor(y / P);
    const inCell = x >= 0 && y >= 0 && col < n && row < n && x - col * P <= C && y - row * P <= C;
    return { wall, cell: inCell ? { r: row, c: col } : undefined };
  };

  const onMoveP = (e: React.PointerEvent) => {
    if (!canAct) { if (hover) setHover(null); return; }
    const l = locate(e);
    if (!l) return;
    if (wallMode || (l.wall && !l.cell)) setHover({ wall: l.wall && wallOk(l.wall) ? l.wall : undefined, cell: undefined });
    else setHover({ cell: l.cell });
  };
  const onClick = (e: React.MouseEvent) => {
    if (!canAct) return;
    const l = locate(e);
    if (!l) return;
    if (l.cell && !wallMode) {
      const t = targets.find((p) => p.r === l.cell!.r && p.c === l.cell!.c);
      if (t) { onMove({ t: 'm', r: t.r, c: t.c }); setHover(null); return; }
      return;
    }
    if (wallMode && l.cell) {
      const t = targets.find((p) => p.r === l.cell!.r && p.c === l.cell!.c);
      if (t && !(l.wall && wallOk(l.wall))) { onMove({ t: 'm', r: t.r, c: t.c }); return; }
    }
    if (l.wall && wallOk(l.wall)) { onMove(l.wall); setHover(null); }
  };
  const onCtx = (e: React.MouseEvent) => { e.preventDefault(); flip.current = flip.current === 'h' ? 'v' : 'h'; const l = locate(e); if (l?.wall) setHover({ wall: { ...l.wall, t: flip.current } }); };

  const walls: Move[] = [];
  for (let r = 0; r < w; r++) for (let c = 0; c < w; c++) { if (s.hw[r * w + c]) walls.push({ t: 'h', r, c }); if (s.vw[r * w + c]) walls.push({ t: 'v', r, c }); }

  const poly = (pts: Pos[]) => pts.map((p) => `${cx(p.c)},${cy(p.r)}`).join(' ');
  const hw = hover?.wall;

  return (
    <svg ref={svg} className={'mb-board' + (canAct ? ' act' : '')} viewBox={`0 0 ${size} ${size}`} onPointerMove={onMoveP} onPointerLeave={() => setHover(null)} onClick={onClick} onContextMenu={onCtx} role="img" aria-label={`Spielbrett ${n} mal ${n}`}>
      <rect className="mb-paper" x="0" y="0" width={size} height={size} />
      {/* Maßlinien */}
      {Array.from({ length: n }, (_, i) => (
        <g key={i} className="mb-axis">
          <text x={cx(i)} y={M - 9} textAnchor="middle">{FILES[i]}</text>
          <text x={cx(i)} y={size - 9} textAnchor="middle">{FILES[i]}</text>
          <text x={11} y={cy(i) + 4} textAnchor="middle">{n - i}</text>
          <text x={size - 11} y={cy(i) + 4} textAnchor="middle">{n - i}</text>
        </g>
      ))}
      {/* Zielzeilen */}
      <rect className="mb-goal g1" x={M - 4} y={M - 4} width={n * P - G + 8} height={C + 8} />
      <rect className="mb-goal g0" x={M - 4} y={M + (n - 1) * P - 4} width={n * P - G + 8} height={C + 8} />
      {/* Felder */}
      {Array.from({ length: n * n }, (_, k) => {
        const r = (k / n) | 0, c = k % n;
        return <rect key={k} className="mb-cell" x={M + c * P} y={M + r * P} width={C} height={C} />;
      })}
      {Array.from({ length: n * n }, (_, k) => {
        const r = (k / n) | 0, c = k % n;
        return <g key={'t' + k} className="mb-tick"><path d={`M${M + c * P + 6} ${M + r * P + 6}h6M${M + c * P + 9} ${M + r * P + 3}v6`} /></g>;
      })}
      {/* Fugenkreuze */}
      {Array.from({ length: w * w }, (_, k) => {
        const r = (k / w) | 0, c = k % w;
        return <circle key={k} className="mb-node" cx={M + c * P + C + G / 2} cy={M + r * P + C + G / 2} r="1.8" />;
      })}
      {mark?.map((p, i) => <rect key={i} className="mb-mark" x={M + p.c * P - 2} y={M + p.r * P - 2} width={C + 4} height={C + 4} />)}
      {paths && [0, 1].map((p) => paths[p].length > 1 && <polyline key={p} className={`mb-path p${p}`} points={poly(paths[p])} />)}
      {/* letzter Zug */}
      {last && last.t === 'm' && <rect className="mb-last" x={M + last.c * P - 3} y={M + last.r * P - 3} width={C + 6} height={C + 6} />}
      {/* Mauern */}
      {walls.map((m) => {
        const q = wallRect(m), o = owner?.(m);
        const isLast = last && sameMove(last, m);
        return (
          <g key={m.t + m.r + ',' + m.c} className={`mb-wall ${o === undefined ? 'pre' : 'p' + o}${isLast ? ' new' : ''}`}>
            <rect x={q.x} y={q.y} width={q.w} height={q.h} rx="1" />
            <line x1={m.t === 'h' ? q.x + 6 : q.x + q.w / 2} y1={m.t === 'h' ? q.y + q.h / 2 : q.y + 6} x2={m.t === 'h' ? q.x + q.w - 6 : q.x + q.w / 2} y2={m.t === 'h' ? q.y + q.h / 2 : q.y + q.h - 6} />
          </g>
        );
      })}
      {hint && (hint.t === 'm'
        ? <rect className="mb-hint" x={M + hint.c * P - 2} y={M + hint.r * P - 2} width={C + 4} height={C + 4} />
        : (() => { const q = wallRect(hint); return <rect className="mb-hint wall" x={q.x - 1} y={q.y - 1} width={q.w + 2} height={q.h + 2} />; })())}
      {/* Ziele */}
      {canAct && targets.map((p, i) => (
        <g key={i} className={'mb-target' + (hover?.cell && hover.cell.r === p.r && hover.cell.c === p.c ? ' on' : '')}>
          <rect x={M + p.c * P} y={M + p.r * P} width={C} height={C} />
          <circle cx={cx(p.c)} cy={cy(p.r)} r="6" />
        </g>
      ))}
      {hw && canAct && (() => { const q = wallRect(hw); return <rect className={`mb-ghost p${s.turn}`} x={q.x} y={q.y} width={q.w} height={q.h} rx="1" />; })()}
      {/* Bauern */}
      {[0, 1].map((p) => {
        const q = s.pawn[p];
        return (
          <g key={p} className={`mb-pawn p${p}` + (s.turn === p ? ' turn' : '')} style={{ transform: `translate(${cx(q.c)}px, ${cy(q.r)}px)` }}>
            <circle className="shadow" cx="1.5" cy="2.5" r="17" />
            <circle className="body" r="17" />
            <circle className="ring" r="11" />
            <path className="cross" d="M-7 0h14M0 -7v14" />
            <title>{names?.[p] ?? (p === 0 ? 'Weiß' : 'Orange')}</title>
          </g>
        );
      })}
    </svg>
  );
}
