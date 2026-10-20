import { useMemo, useState } from 'react';
import { useKeys } from '../shared/hooks';
import { toast } from '../shared/store';
import { VARIANTS, buildSpec, solve, type Variant } from './engine';
import { decodeGrid, encodeGrid, type Puzzle } from './gen';
import { levelOfWeight, rate } from './logic';
import SudokuBoard from './SudokuBoard';

const EDITABLE = VARIANTS.filter((v) => v.id !== 'killer');

/** Eigene Rätsel: Zahlen eintragen, prüfen (eindeutig? wie schwer?), spielen und teilen. */
export default function Editor({ onBack, onPlay }: { onBack: () => void; onPlay: (p: Puzzle) => void }) {
  const [variant, setVariant] = useState<Variant>('klassik');
  const spec = useMemo(() => buildSpec(variant), [variant]);
  const n = spec.n;
  const [grid, setGrid] = useState<number[]>(() => new Array(81).fill(0));
  const [sel, setSel] = useState<ReadonlySet<number>>(new Set([0]));
  const [report, setReport] = useState<null | { count: number; text: string; solution?: number[]; weight?: number }>(null);
  const [code, setCode] = useState('');
  const g = grid.slice(0, n * n);

  const changeVariant = (v: Variant) => { setVariant(v); const nn = VARIANTS.find((x) => x.id === v)!.n; setGrid(new Array(nn * nn).fill(0)); setReport(null); setSel(new Set([0])); };
  const put = (d: number) => {
    const i = [...sel][0];
    if (i === undefined) return;
    const next = grid.slice(); next[i] = d; setGrid(next); setReport(null);
  };
  useKeys((e) => {
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (m && +m[1] <= n) { e.preventDefault(); put(+m[1]); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { put(0); return; }
    const cur = [...sel][0] ?? 0;
    const move = (dr: number, dc: number) => { e.preventDefault(); const r = Math.max(0, Math.min(n - 1, Math.floor(cur / n) + dr)), c = Math.max(0, Math.min(n - 1, (cur % n) + dc)); setSel(new Set([r * n + c])); };
    if (e.key === 'ArrowUp') move(-1, 0); else if (e.key === 'ArrowDown') move(1, 0); else if (e.key === 'ArrowLeft') move(0, -1); else if (e.key === 'ArrowRight') move(0, 1);
  }, [sel, grid, n]);

  const check = () => {
    const clues = g.filter(Boolean).length;
    if (clues < 5) { setReport({ count: -1, text: 'Trage zuerst ein paar Zahlen ein.' }); return; }
    const r = solve(spec, g, 2);
    if (r.count === 0) { setReport({ count: 0, text: 'Dieses Rätsel hat keine Lösung. Prüfe die Zahlen auf Widersprüche (gleiche Zahl in einer Reihe, Spalte oder einem Block).' }); return; }
    if (r.count > 1) { setReport({ count: 2, text: 'Dieses Rätsel hat mehrere Lösungen. Füge weitere Zahlen hinzu, bis es eindeutig ist.', solution: Array.from(r.solution!) }); return; }
    const rt = rate(spec, g);
    const lv = levelOfWeight(rt.weight);
    setReport({ count: 1, text: `Eindeutig lösbar! ${clues} Zahlen vorgegeben · Stufe ${lv === 'leicht' ? 'Leicht' : lv === 'mittel' ? 'Mittel' : lv === 'schwer' ? 'Schwer' : lv === 'experte' ? 'Experte' : 'Teufel (Ausprobieren nötig)'}.`, solution: Array.from(r.solution!), weight: rt.weight });
  };
  const vals = report?.solution && report.count === 1 ? g.map((x, i) => x || report.solution![i]) : g;
  const givens = g;

  return (
    <div className="sd-academy">
      <header className="sd-head"><div className="sd-masthead"><h1>Eigenes Rätsel</h1><span className="sd-issue">Selbst setzen, prüfen, teilen</span></div><nav className="sd-nav"><button onClick={onBack}>Zurück zum Rätsel</button></nav></header>
      <main className="sd-main">
        <section className="sd-gridwrap">
          <div className="sd-levels" role="radiogroup" aria-label="Variante">
            {EDITABLE.map((v) => <button key={v.id} role="radio" aria-checked={variant === v.id} className={variant === v.id ? 'on' : ''} onClick={() => changeVariant(v.id)}>{v.name}</button>)}
          </div>
          <SudokuBoard spec={spec} givens={givens} vals={vals} notes={new Array(n * n).fill(0)} marks={new Array(n * n).fill(0)} sel={sel} showSame showPeers paused={false} onDown={(i) => setSel(new Set([i]))} onEnter={() => {}} />
          {report && <div className={'sd-hint' + (report.count === 1 ? ' ok' : '')} role="status">{report.text}</div>}
        </section>
        <aside className="sd-side">
          <div className="sd-keys">{Array.from({ length: n }, (_, k) => k + 1).map((d) => <button key={d} onClick={() => put(d)}><b>{d}</b></button>)}</div>
          <div className="sd-tools">
            <button onClick={() => put(0)}>⌫ Löschen</button>
            <button onClick={check}>Prüfen</button>
            <button className="sd-primary" disabled={report?.count !== 1} onClick={() => {
              if (report?.count !== 1 || !report.solution) return;
              onPlay({ variant, n, givens: g, solution: report.solution, cages: [], weight: report.weight ?? 0, level: levelOfWeight(report.weight ?? 5), seed: 0 });
            }}>Spielen</button>
            <button onClick={() => { setGrid(new Array(81).fill(0)); setReport(null); }}>Alles leeren</button>
            <button onClick={() => { void navigator.clipboard?.writeText(encodeGrid(g)); toast('Code kopiert'); }}>Code kopieren</button>
          </div>
          <textarea rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code einfügen …" spellCheck={false} />
          <div className="sd-tools"><button onClick={() => { const d = decodeGrid(code, n); if (!d) { toast('Code passt nicht zur Variante'); return; } setGrid([...d, ...new Array(81 - d.length).fill(0)]); setReport(null); }}>Code laden</button></div>
          <p className="sd-small">Tipp: Ein sauberes Rätsel hat genau eine Lösung. „Prüfen“ zeigt dir auch die Schwierigkeit anhand der nötigen Techniken.</p>
        </aside>
      </main>
    </div>
  );
}
