import { useMemo, useRef, useState } from 'react';
import CardView from './CardView';
import type { KSettings } from './data';
import { type Move, type PileGame, canMove, draggable } from './piles';

interface Meta { uid: number; id: number; up: boolean; x: number; y: number; z: number; pile: string; idx: number }
interface Slot { id: string; x: number; y: number; w: number; h: number; kind: 'tab' | 'found' | 'cell' | 'stock' | 'waste' }

interface Props {
  g: PileGame;
  S: KSettings;
  width: number;
  availH: number;
  hint: Move | null;
  xray: boolean;
  onMove: (m: Move) => void;
  onAuto: (from: string, idx: number, dbl: boolean) => void;
  onStock: () => void;
}

export function layoutPile(g: PileGame, W: number, S: KSettings, availH: number) {
  const cols = g.kind === 'klondike' ? 7 : g.kind === 'freecell' ? 8 : 10;
  const gap = Math.max(6, Math.round(W / 90));
  const cw = Math.max(34, Math.min(S.large ? 140 : 118, Math.floor((W - 16 - (cols - 1) * gap) / cols)));
  const ch = Math.round(cw * 1.42);
  const colX = (c: number) => 8 + (S.leftHand ? cols - 1 - c : c) * (cw + gap);
  const cards: Meta[] = [];
  const slots: Slot[] = [];
  const top = 8;
  const tabY = top + ch + Math.round(ch * 0.22);
  let z = 1;
  const downOff = Math.round(ch * 0.1), upOff = Math.round(ch * (S.large ? 0.31 : 0.26));
  // Oberste Reihe
  const place = (p: string, c: number, y: number, kind: Slot['kind']) => { slots.push({ id: p, x: colX(c), y, w: cw, h: ch, kind }); return colX(c); };
  let bottom = 0;
  const addPile = (id: string, x: number, y: number, cards2: PileGame['tab'][number], fan: 'tab' | 'none' | 'waste3', availBottom: number) => {
    if (fan === 'none') { cards2.forEach((c, i) => cards.push({ uid: c.uid, id: c.id, up: c.up, x, y, z: z++, pile: id, idx: i })); bottom = Math.max(bottom, y + ch); return; }
    if (fan === 'waste3') {
      const n = cards2.length, vis = Math.min(3, n);
      cards2.forEach((c, i) => { const k = i - (n - vis); cards.push({ uid: c.uid, id: c.id, up: true, x: S.leftHand ? x - Math.max(0, k) * Math.round(cw * 0.22) : x + Math.max(0, k) * Math.round(cw * 0.22), y, z: z++, pile: id, idx: i }); });
      bottom = Math.max(bottom, y + ch);
      return;
    }
    // Tableau-Fächer
    let total = 0;
    cards2.forEach((c, i) => { if (i < cards2.length - 1) total += c.up ? upOff : downOff; });
    const room = availBottom - y - ch;
    const scale = total > 0 && total > room ? Math.max(0.35, room / total) : 1;
    let yy = y;
    cards2.forEach((c, i) => { cards.push({ uid: c.uid, id: c.id, up: c.up, x, y: Math.round(yy), z: z++, pile: id, idx: i }); yy += (c.up ? upOff : downOff) * scale; });
    bottom = Math.max(bottom, Math.round(yy) + ch);
  };
  const availBottom = Math.max(availH, tabY + ch * 3);
  if (g.kind === 'klondike') {
    const sx = place('S', 0, top, 'stock'); addPile('S', sx, top, g.stock, 'none', 0);
    const wx = place('W', 1, top, 'waste'); addPile('W', wx, top, g.waste, g.opts.draw === 3 ? 'waste3' : 'none', 0);
    for (let i = 0; i < 4; i++) { const x = place(`F${i}`, 3 + i, top, 'found'); addPile(`F${i}`, x, top, g.found[i], 'none', 0); }
  } else if (g.kind === 'freecell') {
    for (let i = 0; i < g.cells.length; i++) { const x = place(`C${i}`, i, top, 'cell'); addPile(`C${i}`, x, top, g.cells[i], 'none', 0); }
    for (let i = 0; i < 4; i++) { const x = place(`F${i}`, 4 + i, top, 'found'); addPile(`F${i}`, x, top, g.found[i], 'none', 0); }
  } else {
    const sx = place('S', 0, top, 'stock'); addPile('S', sx, top, g.stock, 'none', 0);
    for (let i = 0; i < 8; i++) { const x = colX(2 + i); slots.push({ id: `F${i}`, x, y: top, w: cw, h: ch, kind: 'found' }); if (g.found[i]) addPile(`F${i}`, x, top, g.found[i].slice(-1), 'none', 0); }
  }
  g.tab.forEach((p, i) => {
    const x = colX(i);
    slots.push({ id: `T${i}`, x, y: tabY, w: cw, h: availBottom - tabY, kind: 'tab' });
    addPile(`T${i}`, x, tabY, p, 'tab', availBottom);
  });
  return { cw, ch, cards, slots, height: Math.max(bottom + 12, tabY + ch + 20), cols };
}

export default function PileBoard({ g, S, width, availH, hint, xray, onMove, onAuto, onStock }: Props) {
  const lay = useMemo(() => layoutPile(g, width, S, availH), [g, width, S, availH]);
  const [drag, setDrag] = useState<null | { pile: string; idx: number; dx: number; dy: number; moved: boolean; sx: number; sy: number }>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const lastClick = useRef({ uid: -1, t: 0 });
  const box = useRef<HTMLDivElement>(null);

  const dragUids = useMemo(() => {
    if (!drag || !drag.moved) return new Set<number>();
    return new Set(lay.cards.filter((c) => c.pile === drag.pile && c.idx >= drag.idx).map((c) => c.uid));
  }, [drag, lay]);

  const hintFrom = hint && !('act' in hint) ? hint : null;
  const hintUids = useMemo(() => (hintFrom ? new Set(lay.cards.filter((c) => c.pile === hintFrom.from && c.idx >= hintFrom.idx).map((c) => c.uid)) : new Set<number>()), [hintFrom, lay]);
  const hintAct = hint && 'act' in hint ? hint.act : null;

  const onDown = (e: React.PointerEvent, meta: Meta) => {
    if (e.button === 2) { e.preventDefault(); onAuto(meta.pile, meta.idx, true); return; }
    if (meta.pile === 'S') { onStock(); return; }
    if (!draggable(g, meta.pile, meta.idx)) { return; }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ pile: meta.pile, idx: meta.idx, dx: 0, dy: 0, moved: false, sx: e.clientX, sy: e.clientY });
  };
  const onMoveEv = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    setDrag({ ...d, dx, dy, moved: d.moved || Math.hypot(dx, dy) > 6 });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const meta = lay.cards.find((c) => c.pile === d.pile && c.idx === d.idx)!;
    if (!d.moved) {
      const now = performance.now();
      const dbl = lastClick.current.uid === meta.uid && now - lastClick.current.t < 380;
      lastClick.current = { uid: meta.uid, t: now };
      onAuto(d.pile, d.idx, dbl);
      return;
    }
    const r = box.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best: Slot | null = null, bd = 1e9;
    for (const s of lay.slots) {
      if (s.id === 'S' || s.id === 'W') continue;
      if (!canMove(g, d.pile, d.idx, s.id)) continue;
      const cx = s.x + s.w / 2, cy = s.kind === 'tab' ? Math.min(Math.max(py, s.y), s.y + s.h) : s.y + s.h / 2;
      const dist = Math.hypot(px - cx, py - cy) + (px < s.x - s.w * 0.4 || px > s.x + s.w * 1.4 ? 400 : 0);
      if (dist < bd) { bd = dist; best = s; }
    }
    if (best && bd < lay.cw * 1.6) onMove({ from: d.pile, idx: d.idx, to: best.id });
  };

  return (
    <div className="kb" ref={box} style={{ height: lay.height }} onPointerMove={onMoveEv} onPointerUp={onUp} onPointerCancel={() => setDrag(null)} onContextMenu={(e) => e.preventDefault()}>
      {lay.slots.map((s) => (
        <div key={s.id} className={'ks ' + s.kind + (hint && !('act' in hint) && hint.to === s.id ? ' hint' : '') + (g.kind === 'klondike' && s.id === 'S' && !g.stock.length && g.waste.length ? ' recycle' : '')} style={{ left: s.x, top: s.y, width: s.w, height: s.kind === 'tab' ? lay.ch : s.h }}
          onClick={s.id === 'S' ? onStock : undefined}>
          {s.kind === 'found' && g.kind !== 'spider' && <span>A</span>}
          {s.id === 'S' && !g.stock.length && g.kind === 'klondike' && <span>↻</span>}
        </div>
      ))}
      {lay.cards.map((m) => {
        const dragging = dragUids.has(m.uid);
        const off = dragging && drag ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
        const stockHint = hintAct && m.pile === 'S' && m.idx === g.stock.length - 1;
        return (
          <div
            key={m.uid}
            className={'kcw' + (dragging ? ' dragging' : '') + (!S.anim ? ' noanim' : '')}
            style={{ transform: `translate(${m.x + off.x}px, ${m.y + off.y}px)`, zIndex: dragging ? 1000 + m.idx : m.z, width: lay.cw }}
            onPointerDown={(e) => onDown(e, m)}
          >
            <CardView id={m.id} up={m.up || xray} w={lay.cw} fourColor={S.fourColor} large={S.large} back={S.back} hint={hintUids.has(m.uid) || !!stockHint} dim={!m.up && xray} />
          </div>
        );
      })}
    </div>
  );
}
