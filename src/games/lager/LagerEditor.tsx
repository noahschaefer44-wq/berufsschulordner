import { useEffect, useRef, useState } from 'react';
import { toast } from '../shared/store';
import { type Level, parseXsb, reachableFrom, solve, toXsb } from './engine';

type Tool = 'wall' | 'floor' | 'goal' | 'box' | 'boxgoal' | 'player' | 'erase';
const TOOLS: { id: Tool; name: string; key: string }[] = [
  { id: 'wall', name: 'Wand', key: '#' }, { id: 'floor', name: 'Boden', key: '␣' }, { id: 'goal', name: 'Ziel', key: '.' },
  { id: 'box', name: 'Kiste', key: '$' }, { id: 'boxgoal', name: 'Kiste auf Ziel', key: '*' }, { id: 'player', name: 'Spieler', key: '@' }, { id: 'erase', name: 'Radierer', key: '×' },
];

/** Level-Editor: zeichnen, prüfen (geschlossen? lösbar?), spielen, teilen (Standardformat). */
export default function LagerEditor({ init, onPlay, onSave }: { init: Level | null; onPlay: (xsb: string, name: string) => void; onSave: (xsb: string, name: string) => void }) {
  const start = init ?? parseXsb('########\n#      #\n#  @   #\n#  $   #\n#  .   #\n#      #\n########')!;
  const [w, setW] = useState(start.w), [h, setH] = useState(start.h);
  const [grid, setGrid] = useState<string[]>(() => toXsb(start).split('\n').map((r) => r.padEnd(start.w, ' ')));
  const [tool, setTool] = useState<Tool>('wall');
  const [name, setName] = useState('Eigenes Level');
  const [report, setReport] = useState<{ ok: boolean; text: string } | null>(null);
  const [text, setText] = useState('');
  const cv = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const cell = Math.max(18, Math.min(44, Math.floor(620 / Math.max(w, h))));

  const set = (x: number, y: number) => {
    const g = grid.map((r) => r.split(''));
    const cur = g[y][x];
    const clearPlayer = () => { for (const row of g) for (let i = 0; i < row.length; i++) if (row[i] === '@') row[i] = ' '; else if (row[i] === '+') row[i] = '.'; };
    const onGoal = cur === '.' || cur === '*' || cur === '+';
    if (tool === 'wall') g[y][x] = '#';
    else if (tool === 'floor' || tool === 'erase') g[y][x] = ' ';
    else if (tool === 'goal') g[y][x] = '.';
    else if (tool === 'box') g[y][x] = '$';
    else if (tool === 'boxgoal') g[y][x] = '*';
    else if (tool === 'player') { clearPlayer(); g[y][x] = onGoal ? '+' : '@'; }
    setGrid(g.map((r) => r.join(''))); setReport(null);
  };
  const resize = (nw: number, nh: number) => {
    const g = Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => grid[y]?.[x] ?? (y === 0 || x === 0 || y === nh - 1 || x === nw - 1 ? '#' : ' ')).join(''));
    // Rand wieder schließen
    const gg = g.map((r) => r.split(''));
    for (let x = 0; x < nw; x++) { gg[0][x] = '#'; gg[nh - 1][x] = '#'; }
    for (let y = 0; y < nh; y++) { gg[y][0] = '#'; gg[y][nw - 1] = '#'; }
    setW(nw); setH(nh); setGrid(gg.map((r) => r.join(''))); setReport(null);
  };

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * cell * dpr; c.height = h * cell * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1c1c1a'; ctx.fillRect(0, 0, w * cell, h * cell);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = grid[y]?.[x] ?? ' ';
      const X = x * cell, Y = y * cell;
      if (ch === '#') { ctx.fillStyle = '#5d5c58'; ctx.fillRect(X, Y, cell, cell); ctx.fillStyle = '#7b7a74'; ctx.fillRect(X, Y, cell, cell * 0.18); }
      else { ctx.fillStyle = (x + y) % 2 ? '#a4a29a' : '#98968e'; ctx.fillRect(X, Y, cell, cell); }
      if (ch === '.' || ch === '*' || ch === '+') { ctx.strokeStyle = '#f5c400'; ctx.lineWidth = 2; ctx.strokeRect(X + cell * 0.18, Y + cell * 0.18, cell * 0.64, cell * 0.64); }
      if (ch === '$' || ch === '*') { ctx.fillStyle = ch === '*' ? '#e7b94a' : '#b8793a'; ctx.fillRect(X + cell * 0.1, Y + cell * 0.1, cell * 0.8, cell * 0.8); ctx.strokeStyle = '#7d4f22'; ctx.lineWidth = 2; ctx.strokeRect(X + cell * 0.1, Y + cell * 0.1, cell * 0.8, cell * 0.8); }
      if (ch === '@' || ch === '+') { ctx.fillStyle = '#f26b1d'; ctx.beginPath(); ctx.arc(X + cell / 2, Y + cell / 2, cell * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f5c400'; ctx.beginPath(); ctx.arc(X + cell / 2, Y + cell / 2, cell * 0.2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x++) { ctx.beginPath(); ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, h * cell); ctx.stroke(); }
    for (let y = 0; y <= h; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(w * cell, y * cell + 0.5); ctx.stroke(); }
  }, [grid, w, h, cell]);

  const cellAt = (e: React.PointerEvent): [number, number] | null => {
    const r = cv.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) * w) / r.width), y = Math.floor(((e.clientY - r.top) * h) / r.height);
    return x < 0 || y < 0 || x >= w || y >= h ? null : [x, y];
  };

  const validate = () => {
    const rows = grid.join('\n');
    const l = parseXsb(rows);
    if (!l) {
      const players = (rows.match(/[@+]/g) ?? []).length, boxes = (rows.match(/[$*]/g) ?? []).length, goals = (rows.match(/[.*+]/g) ?? []).length;
      const text = players !== 1 ? 'Es muss genau einen Spieler geben.' : boxes === 0 ? 'Setze mindestens eine Kiste.' : `Kisten (${boxes}) und Ziele (${goals}) müssen gleich viele sein.`;
      setReport({ ok: false, text }); return null;
    }
    // Geschlossenheit: der Spieler darf den Rand nicht erreichen (Wände fehlen)
    const reach = reachableFrom(l, l.player, []);
    let leaks = false;
    for (let i = 0; i < reach.length; i++) if (reach[i] && (i % l.w === 0 || i % l.w === l.w - 1 || Math.floor(i / l.w) === 0 || Math.floor(i / l.w) === l.h - 1)) leaks = true;
    if (leaks) { setReport({ ok: false, text: 'Die Halle ist nicht geschlossen: Der Spieler könnte am Rand hinauslaufen. Ziehe eine Wand um den Spielbereich.' }); return null; }
    const s = solve(l, undefined, { maxMs: 4000, maxNodes: 400000 });
    if (!s) { setReport({ ok: false, text: 'Der Löser findet keine Lösung (oder das Level ist zu komplex für die Prüfung). Prüfe, ob alle Kisten bewegt werden können.' }); return null; }
    setReport({ ok: true, text: `Lösbar! Kürzeste Lösung: ${s.pushes} Schiebezüge, ${s.steps} Schritte.` });
    return l;
  };

  return (
    <div className="lg-editor">
      <div className="lg-stage">
        <input className="lg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} aria-label="Name" />
        <canvas ref={cv} className="lg-canvas edit" style={{ width: w * cell, height: h * cell, touchAction: 'none' }} onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => { e.preventDefault(); painting.current = true; const c = cellAt(e); if (c) set(c[0], c[1]); }}
          onPointerMove={(e) => { if (!painting.current) return; const c = cellAt(e); if (c && tool !== 'player') set(c[0], c[1]); }}
          onPointerUp={() => { painting.current = false; }} />
        {report && <div className={'lg-note' + (report.ok ? ' ok' : ' bad')} role="status">{report.text}</div>}
      </div>
      <aside className="lg-side">
        <div className="lg-palette" role="radiogroup" aria-label="Werkzeug">
          {TOOLS.map((t) => <button key={t.id} role="radio" aria-checked={tool === t.id} className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)}><b>{t.key}</b>{t.name}</button>)}
        </div>
        <label className="lg-slide"><span>Breite {w}</span><input type="range" min={5} max={24} value={w} onChange={(e) => resize(+e.target.value, h)} /></label>
        <label className="lg-slide"><span>Höhe {h}</span><input type="range" min={5} max={24} value={h} onChange={(e) => resize(w, +e.target.value)} /></label>
        <div className="lg-btns">
          <button onClick={() => { validate(); }}>Prüfen</button>
          <button className="lg-primary" onClick={() => { const l = validate(); if (l) onPlay(toXsb(l), name); }}>Spielen</button>
          <button onClick={() => { const l = validate(); if (l) { onSave(toXsb(l), name); toast('Gespeichert'); } }}>Speichern</button>
        </div>
        <div className="lg-box">
          <h3>Standardformat (XSB)</h3>
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder={'#####\n#@$.#\n#####'} />
          <div className="lg-btns">
            <button onClick={() => { void navigator.clipboard?.writeText(grid.join('\n')); toast('Kopiert'); }}>Kopieren</button>
            <button onClick={() => { const l = parseXsb(text); if (!l) { toast('Kein gültiges Level'); return; } setW(l.w); setH(l.h); setGrid(toXsb(l).split('\n').map((r) => r.padEnd(l.w, ' '))); setReport(null); }}>Einfügen</button>
          </div>
          <p className="lg-small"># Wand · @ Spieler · $ Kiste · . Ziel · * Kiste auf Ziel · + Spieler auf Ziel</p>
        </div>
      </aside>
    </div>
  );
}
