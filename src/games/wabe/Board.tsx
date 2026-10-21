import { Glyph } from './Glyph';
import { KIND_NAME, queenSurround, unkey, type Color, type G, type Move, type Piece } from './engine';

const R = 31, W = Math.sqrt(3) * R;
export const cellXY = (k: number): [number, number] => { const [q, r] = unkey(k); return [W * (q + r / 2), R * 1.5 * r]; };
const HEX = (r: number) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`; }).join(' ');

export interface BoardProps {
  g: G;
  targets: number[];
  sel: number | null;
  onCell: (k: number) => void;
  last?: Move | null;
  hint?: Move | null;
  /** Mitte der Sicht auf einen bestimmten Schlüssel zwingen (Lektionen) */
  interactive: boolean;
  /** Welche Farbe zeigt Zahlen der Königinnen-Umzingelung */
  badges?: boolean;
}

export default function Board({ g, targets, sel, onCell, last, hint, interactive, badges = true }: BoardProps) {
  const keys = [...g.cells.keys(), ...targets];
  if (!keys.length) keys.push(0 * 128 + 0 + 48 * 128 + 48);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const k of keys) { const [x, y] = cellXY(k); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const padX = W * 1.1, padY = R * 1.9;
  let w = Math.max(x1 - x0 + 2 * padX, W * 6), h = Math.max(y1 - y0 + 2 * padY, R * 6);
  const aspect = 4 / 3;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const tset = new Set(targets);

  const tiles: { p: Piece; k: number; z: number; top: boolean }[] = [];
  g.cells.forEach((st, k) => st.forEach((p, z) => tiles.push({ p, k, z, top: z === st.length - 1 })));
  tiles.sort((a, b) => a.z - b.z);

  return (
    <svg className="wb-board" viewBox={`${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`} role="img" aria-label="Spielfeld">
      <defs>
        <linearGradient id="wb-t0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff2c4" /><stop offset="1" stopColor="#f0c75a" /></linearGradient>
        <linearGradient id="wb-t1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4a4038" /><stop offset="1" stopColor="#1e1814" /></linearGradient>
      </defs>
      {last && last.t === 'm' && <polygon className="wb-last" points={HEX(R - 1)} transform={`translate(${cellXY(last.from).join(' ')})`} />}
      {last && last.t !== 'x' && <polygon className="wb-last to" points={HEX(R - 1)} transform={`translate(${cellXY(last.to).join(' ')})`} />}
      {targets.map((k) => {
        const [x, y] = cellXY(k);
        return <g key={'t' + k} className={'wb-target' + (g.cells.has(k) ? ' up' : '')} transform={`translate(${x} ${y})`}><polygon points={HEX(R - 3)} /><circle r="4.4" /></g>;
      })}
      {tiles.map(({ p, k, z, top }) => {
        const [x, y] = cellXY(k);
        const stackH = g.cells.get(k)!.length;
        return (
          <g key={p.id} className={`wb-pc c${p.color} k${p.kind}${top ? ' top' : ' under'}${sel === k && top ? ' sel' : ''}`} style={{ transform: `translate(${x}px, ${y - z * 4.5}px)` }}>
            <polygon className="shadow" points={HEX(R - 1)} transform="translate(2 3.5)" />
            <polygon className="face" points={HEX(R - 1.6)} fill={`url(#wb-t${p.color})`} />
            <polygon className="bevel" points={HEX(R - 5)} />
            {top && <g transform="scale(1.02)"><Glyph kind={p.kind} /></g>}
            {top && stackH > 1 && <g className="count" transform={`translate(${R * 0.62} ${-R * 0.62})`}><circle r="7.4" /><text y="3.6" textAnchor="middle">{stackH}</text></g>}
            <title>{`${KIND_NAME[p.kind]} (${p.color === 0 ? 'Honig' : 'Nacht'})`}</title>
          </g>
        );
      })}
      {badges && ([0, 1] as Color[]).map((c) => {
        const q = g.queen[c];
        if (q < 0) return null;
        const n = queenSurround(g, c);
        const [x, y] = cellXY(q);
        const st = g.cells.get(q)!;
        const lift = (st.length - 1) * 4.5;
        return (
          <g key={'b' + c} className={`wb-badge c${c}${n >= 5 ? ' hot' : ''}`} transform={`translate(${x - R * 0.7} ${y - R * 0.74 - lift})`} pointerEvents="none">
            <rect x="-11" y="-7" width="22" height="14" rx="7" /><text y="3.6" textAnchor="middle">{n}/6</text>
          </g>
        );
      })}
      {hint && <>
        {hint.t === 'm' && <polygon className="wb-hint" points={HEX(R - 1)} transform={`translate(${cellXY(hint.from).join(' ')})`} />}
        {hint.t !== 'x' && <polygon className="wb-hint" points={HEX(R - 1)} transform={`translate(${cellXY(hint.to).join(' ')})`} />}
      </>}
      {interactive && [...g.cells.keys(), ...targets].filter((k, i, a) => a.indexOf(k) === i).map((k) => {
        const [x, y] = cellXY(k);
        const st = g.cells.get(k);
        return <polygon key={'h' + k} className={'wb-hit' + (tset.has(k) ? ' t' : '')} points={HEX(R)} transform={`translate(${x} ${y - ((st?.length ?? 1) - 1) * 4.5})`} onClick={() => onCell(k)} />;
      })}
    </svg>
  );
}

