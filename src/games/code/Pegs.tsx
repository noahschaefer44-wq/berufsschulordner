import { PALETTE } from './data';
import type { Cfg, Fb } from './engine';

export function Peg({ color, size = 44, symbols, digits, selected, dim, onClick, onRight, title, hole }: {
  color: number | null; size?: number; symbols: boolean; digits?: boolean; selected?: boolean; dim?: boolean; hole?: boolean;
  onClick?: () => void; onRight?: () => void; title?: string;
}) {
  const p = color !== null ? PALETTE[color] : null;
  return (
    <button
      type="button"
      className={`cd-peg${color === null ? ' empty' : ''}${selected ? ' sel' : ''}${dim ? ' dim' : ''}${hole ? ' hole' : ''}`}
      style={{ width: size, height: size, background: p ? `radial-gradient(circle at 34% 28%, ${p.c1}, ${p.c2} 72%)` : undefined }}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onRight?.(); }}
      title={title ?? (p ? p.name : 'leer')}
      aria-label={title ?? (p ? p.name : 'leer')}
      disabled={!onClick && !onRight}
    >
      {p && (symbols || digits) && <span className="cd-sym" style={{ fontSize: size * 0.42 }}>{digits ? color : p.sym}</span>}
    </button>
  );
}

/** Rückmeldung als kleines Raster aus schwarzen/weißen Stiften. */
export function Fbk({ fb, cfg }: { fb: Fb | null; cfg: Cfg }) {
  const cells: ('b' | 'w' | 'e')[] = [];
  for (let i = 0; i < cfg.pegs; i++) cells.push(fb ? (i < fb[0] ? 'b' : i < fb[0] + fb[1] ? 'w' : 'e') : 'e');
  const cols = Math.ceil(cfg.pegs / 2);
  return (
    <span className="cd-fb" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-label={fb ? `${fb[0]} richtig, ${fb[1]} Farbe stimmt` : 'noch nicht gewertet'}>
      {cells.map((c, i) => <i key={i} className={c} />)}
    </span>
  );
}
