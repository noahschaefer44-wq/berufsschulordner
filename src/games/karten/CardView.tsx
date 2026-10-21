import { memo } from 'react';
import { RANKS, RANKS_EN, SUITS, isRed, rankOf, suitOf } from './cards';

// Pip-Positionen (x: 0–2 Spalten, y: 0–6 Reihen) je Rang
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 3]],
  2: [[1, 0], [1, 6]],
  3: [[1, 0], [1, 3], [1, 6]],
  4: [[0, 0], [2, 0], [0, 6], [2, 6]],
  5: [[0, 0], [2, 0], [1, 3], [0, 6], [2, 6]],
  6: [[0, 0], [2, 0], [0, 3], [2, 3], [0, 6], [2, 6]],
  7: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [0, 6], [2, 6]],
  8: [[0, 0], [2, 0], [1, 1.5], [0, 3], [2, 3], [1, 4.5], [0, 6], [2, 6]],
  9: [[0, 0], [2, 0], [0, 2], [2, 2], [1, 3], [0, 4], [2, 4], [0, 6], [2, 6]],
  10: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [0, 4], [2, 4], [1, 5], [0, 6], [2, 6]],
};

export interface CardViewProps {
  id: number;
  up: boolean;
  w: number;
  fourColor: boolean;
  large: boolean;
  back: string;
  selected?: boolean;
  hint?: boolean;
  dim?: boolean;
  english?: boolean;
}

function suitClass(id: number, four: boolean) {
  const s = suitOf(id);
  if (!four) return isRed(id) ? 'red' : 'blk';
  return ['blk', 'red', 'blu', 'grn'][s];
}

function Face({ id, w, fourColor, large, english }: { id: number; w: number; fourColor: boolean; large: boolean; english?: boolean }) {
  const r = rankOf(id), s = suitOf(id), n = r + 1;
  const cls = suitClass(id, fourColor);
  const label = (english ? RANKS_EN : RANKS)[r];
  return (
    <div className={'kc-face ' + cls + (large ? ' large' : '')} style={{ fontSize: w * 0.2 }}>
      <span className="kc-corner tl"><b>{label}</b><i>{SUITS[s]}</i></span>
      <span className="kc-corner br"><b>{label}</b><i>{SUITS[s]}</i></span>
      {n <= 10 ? (
        <div className="kc-pips">
          {PIPS[n].map(([x, y], k) => (
            <span key={k} className={'kc-pip' + (n === 1 ? ' ace' : '') + (y > 3 ? ' flip' : '')} style={{ left: `${26 + x * 24}%`, top: `${10 + y * 13.3}%` }}>{SUITS[s]}</span>
          ))}
        </div>
      ) : (
        <div className="kc-court">
          <span className="kc-court-letter">{label}</span>
          <span className="kc-court-suit">{SUITS[s]}</span>
        </div>
      )}
    </div>
  );
}

function Impl({ id, up, w, fourColor, large, back, selected, hint, dim, english }: CardViewProps) {
  return (
    <div className={'kc' + (up ? ' up' : ' down') + (selected ? ' sel' : '') + (hint ? ' hint' : '') + (dim ? ' dim' : '')} style={{ width: w, height: Math.round(w * 1.42) }}>
      {up ? <Face id={id} w={w} fourColor={fourColor} large={large} english={english} /> : <div className={'kc-back b-' + back} />}
    </div>
  );
}
export default memo(Impl);
