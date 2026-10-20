import { FINGER_COLORS, FINGER_ROWS, locate, type Layout } from './layouts';

interface Props {
  layout: Layout;
  /** nächstes zu tippendes Zeichen (hebt Taste, Shift und Finger hervor) */
  next?: string | null;
  /** Wärmekarte: Wert 0–1 je Grundzeichen */
  heat?: (ch: string) => number;
  compact?: boolean;
}

export default function Keyboard({ layout, next, heat, compact }: Props) {
  const pos = next ? locate(layout, next) : null;
  const shiftRight = pos && pos.finger >= 0 && pos.finger < 4;
  return (
    <div className={'tp-kb' + (compact ? ' compact' : '')} aria-hidden="true">
      {layout.base.map((row, r) => (
        <div key={r} className={'tp-kb-row r' + r}>
          {r === 3 && <span className={'tp-key wide' + (pos?.shift && !shiftRight ? ' hit' : '')}>⇧</span>}
          {row.split('').map((ch, c) => {
            const on = pos && pos.row === r && pos.col === c;
            const h = heat ? heat(ch.toLowerCase()) : 0;
            return (
              <span
                key={c}
                className={'tp-key' + (on ? ' hit' : '')}
                style={{
                  borderBottomColor: FINGER_COLORS[FINGER_ROWS[r][c] ?? 7],
                  background: heat && h > 0 ? `color-mix(in srgb, #e5604e ${Math.round(h * 85)}%, var(--tp-key))` : undefined,
                }}
              >
                {ch}
              </span>
            );
          })}
          {r === 3 && <span className={'tp-key wide' + (pos?.shift && shiftRight ? ' hit' : '')}>⇧</span>}
        </div>
      ))}
      <div className="tp-kb-row r4">
        <span className={'tp-key space' + (pos?.row === 4 ? ' hit' : '')} />
        <span className={'tp-key wide' + (pos?.altgr ? ' hit' : '')}>AltGr</span>
      </div>
    </div>
  );
}
