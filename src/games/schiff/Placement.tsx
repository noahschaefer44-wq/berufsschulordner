import { useEffect, useMemo, useState } from 'react';
import type { SSettings } from './data';
import { type Ship, canPlace, newSide, randomFleet, shipCells } from './engine';
import SeaGrid from './SeaGrid';
import { freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';

export interface Layout { name: string; n: number; lens: number[]; ships: number[][] }

/** Eigene Flotte aufstellen: Schiff wählen, drehen (R), setzen; gesetzte Schiffe lassen sich wieder aufnehmen. */
export default function Placement({ n, lens, spacing, S, title, layouts, onSaveLayout, onDone }: {
  n: number; lens: number[]; spacing: boolean; S: SSettings; title: string;
  layouts: Layout[]; onSaveLayout: (l: Layout) => void; onDone: (ships: Ship[]) => void;
}) {
  const [placed, setPlaced] = useState<(Ship | null)[]>(() => lens.map(() => null));
  const [sel, setSel] = useState(0);
  const [horizontal, setHorizontal] = useState(true);
  const [hover, setHover] = useState(-1);
  const empty = useMemo(() => new Uint8Array(n * n), [n]);
  const ships = placed.filter((s): s is Ship => !!s);
  const all = ships.length === lens.length;

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'r' || e.key === 'R') setHorizontal((h) => !h); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const nextFree = (from: (Ship | null)[], start = 0) => { for (let k = 0; k < from.length; k++) { const i = (start + k) % from.length; if (!from[i]) return i; } return -1; };

  const cellsFor = (i: number, len: number): number[] | null => {
    // Beim Rand so verschieben, dass das Schiff noch passt
    let x = i % n, y = Math.floor(i / n);
    if (horizontal) x = Math.min(x, n - len); else y = Math.min(y, n - len);
    return shipCells(n, Math.max(0, x), Math.max(0, y), len, horizontal);
  };

  const ghost = useMemo(() => {
    if (hover < 0 || sel < 0 || placed[sel]) return null;
    const cells = cellsFor(hover, lens[sel]);
    if (!cells) return null;
    return { cells, ok: canPlace(n, ships, cells, spacing) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, sel, horizontal, placed]);

  const click = (i: number) => {
    // Gesetztes Schiff aufnehmen
    const hit = placed.findIndex((s) => s && s.cells.includes(i));
    if (hit >= 0) { setPlaced((p) => p.map((s, k) => (k === hit ? null : s))); setSel(hit); sfx('erase'); return; }
    if (sel < 0 || placed[sel]) return;
    const cells = cellsFor(i, lens[sel]);
    if (!cells || !canPlace(n, ships, cells, spacing)) { sfx('bad'); return; }
    const next = placed.map((s, k) => (k === sel ? { id: sel, len: lens[sel], cells } : s));
    setPlaced(next);
    setSel(nextFree(next, sel + 1));
    sfx('place');
  };

  const randomize = () => {
    const f = randomFleet(n, lens, spacing, mulberry32(freshSeed()));
    if (f) { setPlaced(f); setSel(-1); sfx('card'); }
  };
  const clear = () => { setPlaced(lens.map(() => null)); setSel(0); };
  const matching = layouts.filter((l) => l.n === n && l.lens.join() === lens.join());
  const load = (l: Layout) => {
    const f = l.ships.map((cells, id) => ({ id, len: lens[id], cells }));
    setPlaced(f); setSel(-1);
  };

  return (
    <div className="ss-place">
      <div className="ss-gridwrap">
        <SeaGrid n={n} ships={ships} shots={empty} ghost={ghost} interactive coords={S.coords} label="Aufstellung" onCell={click} onHover={setHover} onRight={() => setHorizontal((h) => !h)} />
      </div>
      <div className="ss-dock">
        <h3>{title}</h3>
        <p className="ss-sub">Wähle ein Schiff, drehe es mit <kbd>R</kbd> oder Rechtsklick und setze es. Ein Klick auf ein gesetztes Schiff nimmt es wieder auf.{spacing ? ' Die Schiffe dürfen sich nicht berühren.' : ''}</p>
        <ul className="ss-ships">
          {lens.map((len, i) => (
            <li key={i}>
              <button className={`${sel === i ? 'on' : ''} ${placed[i] ? 'done' : ''}`} onClick={() => { if (placed[i]) { setPlaced((p) => p.map((s, k) => (k === i ? null : s))); } setSel(i); }}>
                <span className="ss-len">{Array.from({ length: len }, (_, k) => <i key={k} />)}</span><b>{len}er</b>{placed[i] && <em>✓</em>}
              </button>
            </li>
          ))}
        </ul>
        <div className="ss-actions">
          <button onClick={() => setHorizontal((h) => !h)}>{horizontal ? '↔ waagerecht' : '↕ senkrecht'} <kbd>R</kbd></button>
          <button onClick={randomize}>Zufällig</button>
          <button onClick={clear}>Leeren</button>
        </div>
        {matching.length > 0 && <div className="ss-layouts"><span>Gespeichert:</span>{matching.slice(0, 5).map((l, i) => <button key={i} onClick={() => load(l)}>{l.name}</button>)}</div>}
        <div className="ss-actions">
          <button className="primary" disabled={!all} onClick={() => onDone(ships.sort((a, b) => a.id - b.id))}>Fertig – Gefecht beginnen</button>
          <button disabled={!all} onClick={() => onSaveLayout({ name: `Aufstellung ${matching.length + 1}`, n, lens, ships: ships.sort((a, b) => a.id - b.id).map((s) => s.cells) })}>Aufstellung merken</button>
        </div>
      </div>
    </div>
  );
}

export const emptySide = newSide;
