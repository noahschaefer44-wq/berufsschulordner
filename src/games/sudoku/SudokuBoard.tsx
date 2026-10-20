import { memo, useMemo } from 'react';
import type { Spec } from './engine';

export interface HintOverlay { cells: number[]; elim: { cell: number; d: number }[]; place?: { cell: number; d: number }; group?: number }

interface Props {
  spec: Spec;
  givens: readonly number[];
  vals: readonly number[];
  notes: readonly number[];
  marks: readonly number[];
  sel: ReadonlySet<number>;
  wrong?: ReadonlySet<number>;
  hint?: HintOverlay | null;
  showSame: boolean;
  showPeers: boolean;
  paused?: boolean;
  onDown: (i: number, e: React.PointerEvent) => void;
  onEnter: (i: number, e: React.PointerEvent) => void;
}

const noteCols = (n: number) => (n === 9 || n === 6 ? 3 : 2);

function BoardImpl({ spec, givens, vals, notes, marks, sel, wrong, hint, showSame, showPeers, paused, onDown, onEnter }: Props) {
  const n = spec.n;
  const peers = useMemo(() => {
    const s = new Set<number>();
    if (showPeers) for (const c of sel) for (const p of spec.peers[c]) s.add(p);
    return s;
  }, [sel, spec, showPeers]);
  const selVal = sel.size === 1 ? vals[[...sel][0]] : 0;
  const diag = useMemo(() => {
    const s = new Set<number>();
    spec.groups.forEach((g, i) => { if (spec.kinds[i] === 'diag1' || spec.kinds[i] === 'diag2') g.forEach((c) => s.add(c)); });
    return s;
  }, [spec]);
  const hyper = useMemo(() => {
    const s = new Set<number>();
    spec.groups.forEach((g, i) => { if (spec.kinds[i] === 'hyper') g.forEach((c) => s.add(c)); });
    return s;
  }, [spec]);
  const hintCells = useMemo(() => new Set(hint?.cells ?? []), [hint]);
  const hintGroup = useMemo(() => new Set(hint?.group !== undefined ? spec.groups[hint.group] : []), [hint, spec]);
  const elimMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of hint?.elim ?? []) m.set(e.cell, (m.get(e.cell) ?? 0) | (1 << (e.d - 1)));
    return m;
  }, [hint]);

  // Linien und Käfige in Zelleneinheiten
  const lines = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let i = 0; i <= n; i++) {
      const thickV = i % spec.bc === 0, thickH = i % spec.br === 0;
      out.push(<line key={`v${i}`} x1={i} y1={0} x2={i} y2={n} className={thickV ? 'sd-thick' : 'sd-thin'} vectorEffect="non-scaling-stroke" />);
      out.push(<line key={`h${i}`} x1={0} y1={i} x2={n} y2={i} className={thickH ? 'sd-thick' : 'sd-thin'} vectorEffect="non-scaling-stroke" />);
    }
    return out;
  }, [n, spec.bc, spec.br]);
  const cages = useMemo(() => {
    const out: React.ReactNode[] = [];
    const inset = 0.09;
    spec.cages.forEach((cg, k) => {
      const set = new Set(cg.cells);
      for (const c of cg.cells) {
        const r = Math.floor(c / n), col = c % n;
        const edge = (x1: number, y1: number, x2: number, y2: number, key: string) => out.push(<line key={`${k}-${c}-${key}`} x1={x1} y1={y1} x2={x2} y2={y2} className="sd-cage" vectorEffect="non-scaling-stroke" />);
        const up = r > 0 && set.has(c - n), down = r < n - 1 && set.has(c + n), left = col > 0 && set.has(c - 1), right = col < n - 1 && set.has(c + 1);
        const x0 = col + inset, x1 = col + 1 - inset, y0 = r + inset, y1 = r + 1 - inset;
        if (!up) edge(left ? col : x0, y0, right ? col + 1 : x1, y0, 't');
        if (!down) edge(left ? col : x0, y1, right ? col + 1 : x1, y1, 'b');
        if (!left) edge(x0, up ? r : y0, x0, down ? r + 1 : y1, 'l');
        if (!right) edge(x1, up ? r : y0, x1, down ? r + 1 : y1, 'r');
      }
      const first = Math.min(...cg.cells);
      out.push(<text key={`s${k}`} x={(first % n) + 0.13} y={Math.floor(first / n) + 0.3} className="sd-sum">{cg.sum}</text>);
    });
    return out;
  }, [spec.cages, n]);

  const cols = noteCols(n);
  return (
    <div className={'sd-board n' + n + (paused ? ' paused' : '')} style={{ ['--n' as string]: n }} onContextMenu={(e) => e.preventDefault()}>
      <div className="sd-cells">
        {Array.from({ length: n * n }, (_, i) => {
          const v = vals[i];
          const given = givens[i] > 0;
          const cls = ['sd-cell'];
          if (given) cls.push('given'); else if (v) cls.push('user');
          if (sel.has(i)) cls.push('sel');
          else if (peers.has(i)) cls.push('peer');
          if (showSame && selVal && v === selVal && !sel.has(i)) cls.push('same');
          if (wrong?.has(i)) cls.push('wrong');
          if (diag.has(i)) cls.push('diag');
          if (hyper.has(i)) cls.push('hyper');
          if (marks[i]) cls.push('mark' + marks[i]);
          if (hintCells.has(i)) cls.push('hint');
          else if (hintGroup.has(i)) cls.push('hintgroup');
          const nm = notes[i];
          const el = elimMap.get(i) ?? 0;
          return (
            <div key={i} data-i={i} className={cls.join(' ')} onPointerDown={(e) => onDown(i, e)} onPointerEnter={(e) => onEnter(i, e)}>
              {v ? (
                <span className="sd-val">{v}</span>
              ) : nm || el ? (
                <span className="sd-notes" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                  {Array.from({ length: n }, (_, k) => {
                    const bit = 1 << k;
                    const on = (nm & bit) !== 0;
                    return <i key={k} className={(selVal === k + 1 && showSame ? 'same ' : '') + (el & bit ? 'elim' : '') + (hint?.place && hint.place.cell === i && hint.place.d === k + 1 ? ' place' : '')}>{on ? k + 1 : ''}</i>;
                  })}
                </span>
              ) : null}
              {hint?.place && hint.place.cell === i && !v && !nm && <span className="sd-ghost">{hint.place.d}</span>}
            </div>
          );
        })}
      </div>
      <svg className="sd-lines" viewBox={`0 0 ${n} ${n}`} preserveAspectRatio="none" aria-hidden="true">{lines}{cages}</svg>
      {paused && <div className="sd-pause">Pause – Blatt umgedreht</div>}
    </div>
  );
}
export default memo(BoardImpl);
