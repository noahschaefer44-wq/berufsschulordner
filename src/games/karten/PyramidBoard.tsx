import { useMemo } from 'react';
import CardView from './CardView';
import type { KSettings } from './data';
import { type PMove, type PyrGame, isFree, slotsOf } from './pyramid';

interface Props {
  g: PyrGame;
  S: KSettings;
  width: number;
  selected: number | 'W' | null;
  hint: PMove | null;
  xray: boolean;
  onCard: (i: number) => void;
  onWaste: () => void;
  onStock: () => void;
}

export default function PyramidBoard({ g, S, width, selected, hint, xray, onCard, onWaste, onStock }: Props) {
  const slots = slotsOf(g.kind);
  const lay = useMemo(() => {
    const tri = g.kind === 'tripeaks';
    const cols = tri ? 10 : 7;
    const cw = Math.max(34, Math.min(tri ? 86 : 100, Math.floor((width - 24) / (cols + (tri ? 0.6 : 0.7)))));
    const ch = Math.round(cw * 1.42);
    const step = tri ? cw * 1.04 : cw * 1.1;
    const rowH = tri ? ch * 0.52 : ch * 0.5;
    const rows = tri ? 4 : 7;
    const cx = width / 2;
    const pos = slots.map((s) => ({ x: Math.round(tri ? 12 + s.x * step + (width - 24 - (cols - 1) * step - cw) / 2 : cx - cw / 2 + s.x * step), y: Math.round(10 + s.row * rowH) }));
    const baseY = Math.round(10 + (rows - 1) * rowH + ch + 24);
    return { cw, ch, pos, baseY, height: baseY + ch + 20, step };
  }, [g.kind, width, slots]);
  const hintIdx = new Set<number | 'W'>();
  if (hint) { if (hint.act === 'remove') { hintIdx.add(hint.a); if (hint.b !== undefined) hintIdx.add(hint.b); } else if (hint.act === 'play') hintIdx.add(hint.a); }
  const stockX = Math.round(width / 2 - lay.cw * (g.kind === 'tripeaks' ? 1.7 : 1.5));
  const wasteX = Math.round(width / 2 + lay.cw * (g.kind === 'tripeaks' ? 0.4 : 0.5));
  const top = g.waste[g.waste.length - 1];

  return (
    <div className="kb pyr" style={{ height: lay.height }} onContextMenu={(e) => e.preventDefault()}>
      {g.board.map((c, i) => {
        if (!c) return null;
        const free = isFree(g, i);
        return (
          <div key={c.uid} className="kcw" style={{ transform: `translate(${lay.pos[i].x}px, ${lay.pos[i].y}px)`, zIndex: slots[i].row * 4 + 1, width: lay.cw, cursor: free ? 'pointer' : 'default' }} onClick={() => free && onCard(i)}>
            <CardView id={c.id} up={c.up || xray} w={lay.cw} fourColor={S.fourColor} large={S.large} back={S.back} selected={selected === i} hint={hintIdx.has(i)} dim={!free && g.kind === 'pyramide'} />
          </div>
        );
      })}
      <div className="ks stock" style={{ left: stockX, top: lay.baseY, width: lay.cw, height: lay.ch }} onClick={onStock}><span>{g.stock.length ? g.stock.length : g.kind === 'pyramide' && g.redeals > 0 && g.waste.length ? '↻' : ''}</span></div>
      {g.stock.length > 0 && (
        <div className="kcw" style={{ transform: `translate(${stockX}px, ${lay.baseY}px)`, zIndex: 5, width: lay.cw, cursor: 'pointer' }} onClick={onStock}>
          <CardView id={g.stock[g.stock.length - 1].id} up={xray} w={lay.cw} fourColor={S.fourColor} large={S.large} back={S.back} dim={xray} hint={hint?.act === 'draw'} />
        </div>
      )}
      <div className="ks waste" style={{ left: wasteX, top: lay.baseY, width: lay.cw, height: lay.ch }} />
      {top && (
        <div key={top.uid} className="kcw" style={{ transform: `translate(${wasteX}px, ${lay.baseY}px)`, zIndex: 6, width: lay.cw, cursor: g.kind === 'pyramide' ? 'pointer' : 'default' }} onClick={onWaste}>
          <CardView id={top.id} up w={lay.cw} fourColor={S.fourColor} large={S.large} back={S.back} selected={selected === 'W'} hint={hintIdx.has('W')} />
        </div>
      )}
    </div>
  );
}
