import { CATS, cellScore, jokerActive, legalCats, openCats, totals, type Card, type CatId, type Variant } from './engine';

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export function Die({ value, held, rolling, onClick, disabled, hint, index }: { value: number; held: boolean; rolling: boolean; onClick?: () => void; disabled?: boolean; hint?: boolean; index: number }) {
  return (
    <button className={`kn-die${held ? ' held' : ''}${rolling ? ' rolling' : ''}${hint ? ' hint' : ''}`} onClick={onClick} disabled={disabled} aria-label={`Würfel ${index + 1}: ${value}${held ? ', gehalten' : ''}`} style={{ ['--r' as string]: `${(index * 37) % 11 - 5}deg` }}>
      <svg viewBox="-50 -50 100 100">
        <rect className="body" x="-42" y="-42" width="84" height="84" rx="16" />
        <rect className="shine" x="-38" y="-38" width="76" height="40" rx="14" />
        {PIPS[value].map(([x, y], i) => <circle key={i} className="pip" cx={x * 20} cy={y * 20} r="8.4" />)}
      </svg>
      {held && <span className="tag">gehalten</span>}
    </button>
  );
}

export interface SheetProps {
  v: Variant;
  cards: Card[];
  names: string[];
  active: number;
  /** aktuelle Würfel des aktiven Spielers (für die Punkte-Vorschau) */
  dice: number[] | null;
  clickable: boolean;
  onPick: (c: CatId) => void;
  bestCat?: CatId | null;
  flashCat?: CatId | null;
}

export function Sheet({ v, cards, names, active, dice, clickable, onPick, bestCat, flashCat }: SheetProps) {
  const upper = v.cats.filter((c) => CATS[c].upper);
  const lower = v.cats.filter((c) => !CATS[c].upper);
  const legal = dice ? legalCats(v, cards[active], dice) : [];
  const cell = (c: CatId, p: number) => {
    const val = cards[p].s[c];
    const open = val === undefined;
    const isActive = p === active;
    const preview = open && isActive && dice ? cellScore(v, cards[p], c, dice) : null;
    const can = clickable && isActive && open && legal.includes(c);
    return (
      <td key={p} className={`${isActive ? 'act' : ''}${open ? ' open' : ''}${can ? ' can' : ''}${bestCat === c && isActive ? ' best' : ''}${flashCat === c && isActive ? ' flash' : ''}`} onClick={can ? () => onPick(c) : undefined}>
        {open ? (preview !== null && (isActive) ? <span className="pre">{preview}</span> : '') : <span className={'ink' + (val === 0 ? ' zero' : '')}>{val === 0 ? '✕' : val}</span>}
      </td>
    );
  };
  const t = cards.map((c) => totals(v, c));
  return (
    <div className="kn-sheet">
      <table>
        <thead><tr><th /> {names.map((n, p) => <th key={p} className={p === active ? 'act' : ''}>{n}</th>)}</tr></thead>
        <tbody>
          {upper.map((c) => <tr key={c} title={CATS[c].info}><th className="cat">{CATS[c].name}</th>{cards.map((_, p) => cell(c, p))}</tr>)}
          <tr className="sum"><th>Summe oben</th>{t.map((x, p) => <td key={p}>{x.upper}</td>)}</tr>
          <tr className="sum"><th>Bonus ab {v.bonusNeed} (+{v.bonusPts})</th>{t.map((x, p) => <td key={p} className={x.bonus ? 'yes' : ''}>{x.bonus || (x.upper >= v.bonusNeed ? '' : `${Math.max(0, v.bonusNeed - x.upper)} fehlen`)}</td>)}</tr>
          {lower.map((c) => <tr key={c} title={CATS[c].info}><th className="cat">{CATS[c].name}</th>{cards.map((_, p) => cell(c, p))}</tr>)}
          {v.yzBonus > 0 && <tr className="sum"><th>Kniffel-Bonus (+{v.yzBonus})</th>{t.map((x, p) => <td key={p}>{x.yz || ''}</td>)}</tr>}
          <tr className="total"><th>Gesamt</th>{t.map((x, p) => <td key={p}>{x.total}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

export const catsLeft = (v: Variant, card: Card) => openCats(v, card).length;
export const hasJoker = (v: Variant, card: Card, d: number[]) => jokerActive(v, card, d);
