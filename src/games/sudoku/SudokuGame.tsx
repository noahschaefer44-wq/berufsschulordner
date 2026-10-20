import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/source-serif-4/700.css';
import { useKeys, usePlaytime, useSecrets, useTicker } from '../shared/hooks';
import { dailySeed, freshSeed, todayKey } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, fmtTime, markDaily, toast, useGameData, useHall } from '../shared/store';
import Academy from './Academy';
import Editor from './Editor';
import SudokuBoard, { type HintOverlay } from './SudokuBoard';
import { SUDOKU_INIT, THEMES, type Saved, type SSettings, type Theme } from './data';
import { VARIANTS, buildSpec, solve, type Variant } from './engine';
import { decodeGrid, encodeGrid, generate, type Puzzle } from './gen';
import { LEVELS, type Level, type Step, TECH_INFO, initState, nextStep } from './logic';
import './sudoku.css';

// ───────── Erzeugung im Hintergrund ─────────
let worker: Worker | null = null;
let wid = 0;
const waiting = new Map<number, (p: Puzzle | null) => void>();
function genAsync(variant: Variant, level: Level, seed: number, budget = 3000): Promise<Puzzle> {
  const sync = () => generate(variant, level, seed, budget);
  try {
    if (!worker) {
      worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; puzzle: Puzzle | null }>) => { waiting.get(e.data.id)?.(e.data.puzzle); waiting.delete(e.data.id); };
      worker.onerror = () => { waiting.forEach((f) => f(null)); waiting.clear(); worker = null; };
    }
    const id = ++wid;
    return new Promise<Puzzle>((res) => { waiting.set(id, (p) => res(p ?? sync())); worker!.postMessage({ id, variant, level, seed, budget }); });
  } catch { return Promise.resolve(sync()); }
}

const MARKS = ['', '#f6d860', '#f0a35e', '#e07a7a', '#7fb8e8', '#8fd19a', '#c3a0e3'];
type View = 'spiel' | 'schule' | 'editor' | 'statistik';
interface Snap { user: number[]; notes: number[]; marks: number[]; mistakes: number }

const digitFromEvent = (e: KeyboardEvent): number => {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  return m ? +m[1] : /^[0-9]$/.test(e.key) ? +e.key : -1;
};

export default function Sudoku({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('sudoku');
  const hall = useHall();
  const [data, upd] = useGameData('sudoku', SUDOKU_INIT);
  const S: SSettings = { ...SUDOKU_INIT.settings, ...data.settings };
  const setS = (p: Partial<SSettings>) => upd((d) => { d.settings = { ...SUDOKU_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>('spiel');
  const [game, setGame] = useState<Saved | null>(data.current);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<null | 'neu' | 'optionen' | 'code'>(data.current ? null : 'neu');
  const [sel, setSel] = useState<ReadonlySet<number>>(new Set());
  const [notesMode, setNotesMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [secs, setSecs] = useState(game?.time ?? 0);
  const [hint, setHint] = useState<{ step: Step | null; stage: number; msg?: string } | null>(null);
  const [showWrong, setShowWrong] = useState(false);
  const [done, setDone] = useState<null | { time: number; mistakes: number; hints: number; helped: boolean; puzzle: Puzzle; best: boolean }>(null);
  const [codeText, setCodeText] = useState('');
  const hist = useRef<Snap[]>([]);
  const redo = useRef<Snap[]>([]);
  const dragging = useRef(false);
  const timeRef = useRef(game?.time ?? 0);

  const spec = useMemo(() => (game ? buildSpec(game.puzzle.variant, game.puzzle.cages) : null), [game?.puzzle]); // eslint-disable-line react-hooks/exhaustive-deps
  const vals = useMemo(() => (game ? game.puzzle.givens.map((g, i) => g || game.user[i]) : []), [game]);

  // ───── speichern ─────
  useEffect(() => {
    const id = setTimeout(() => { if (game && !done) upd((d) => { d.current = { ...game, time: timeRef.current }; }); }, 500);
    return () => clearTimeout(id);
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  useTicker(!!game && !done && !paused && !busy && view === 'spiel' && !panel, (dt) => { timeRef.current += dt / 1000; setSecs(Math.floor(timeRef.current)); }, 500);
  useEffect(() => {
    const on = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // ───── neues Rätsel ─────
  const begin = useCallback(async (variant: Variant, level: Level, opts: { seed?: number; daily?: string } = {}) => {
    setBusy(true); setPanel(null); setDone(null); setHint(null); setShowWrong(false); setSel(new Set());
    const p = await genAsync(variant, level, opts.seed ?? freshSeed());
    hist.current = []; redo.current = [];
    timeRef.current = 0; setSecs(0); setPaused(false);
    const N = p.n * p.n;
    setGame({ puzzle: p, user: new Array(N).fill(0), notes: new Array(N).fill(0), marks: new Array(N).fill(0), time: 0, mistakes: 0, hints: 0, helped: false, daily: opts.daily });
    setBusy(false);
    setS({ variant, level });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startDaily = useCallback(() => {
    const v: Variant = 'klassik', l: Level = 'mittel';
    void begin(v, l, { seed: dailySeed('sudoku', `${v}-${l}`), daily: todayKey() });
  }, [begin]);
  useEffect(() => { if (daily) startDaily(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startFromPuzzle = (p: Puzzle, custom = false) => {
    hist.current = []; redo.current = []; timeRef.current = 0; setSecs(0); setPaused(false); setDone(null); setHint(null); setShowWrong(false); setSel(new Set()); setPanel(null); setView('spiel');
    const N = p.n * p.n;
    setGame({ puzzle: p, user: new Array(N).fill(0), notes: new Array(N).fill(0), marks: new Array(N).fill(0), time: 0, mistakes: 0, hints: 0, helped: false, custom });
  };

  // ───── Änderungen ─────
  const commit = (fn: (g: Saved) => Saved, record = true) => {
    setGame((g) => {
      if (!g) return g;
      if (record) { hist.current.push({ user: g.user, notes: g.notes, marks: g.marks, mistakes: g.mistakes }); if (hist.current.length > 300) hist.current.shift(); redo.current = []; }
      return fn(g);
    });
    setHint(null);
  };
  const undo = () => {
    const s = hist.current.pop();
    if (!s || !game) return;
    redo.current.push({ user: game.user, notes: game.notes, marks: game.marks, mistakes: game.mistakes });
    setGame({ ...game, user: s.user, notes: s.notes, marks: s.marks, mistakes: s.mistakes });
    sfx('erase');
  };
  const redoIt = () => {
    const s = redo.current.pop();
    if (!s || !game) return;
    hist.current.push({ user: game.user, notes: game.notes, marks: game.marks, mistakes: game.mistakes });
    setGame({ ...game, user: s.user, notes: s.notes, marks: s.marks, mistakes: s.mistakes });
  };

  const peersOf = (i: number) => spec!.peers[i];
  const enter = (d: number) => {
    if (!game || !spec || done || paused || sel.size === 0) return;
    const targets = [...sel].filter((i) => !game.puzzle.givens[i]);
    if (!targets.length) return;
    let wrongAdded = 0;
    commit((g) => {
      const user = g.user.slice(), notes = g.notes.slice();
      if (notesMode) {
        const allHave = targets.every((i) => !user[i] && (notes[i] & (1 << (d - 1))));
        for (const i of targets) { if (user[i]) continue; notes[i] = allHave ? notes[i] & ~(1 << (d - 1)) : notes[i] | (1 << (d - 1)); }
      } else {
        const same = targets.length === 1 && user[targets[0]] === d;
        for (const i of targets) {
          if (same) { user[i] = 0; continue; }
          user[i] = d; notes[i] = 0;
          if (S.autoClean) for (const p of peersOf(i)) notes[p] &= ~(1 << (d - 1));
          if (S.check === 'sofort' && d !== g.puzzle.solution[i]) wrongAdded++;
        }
      }
      return { ...g, user, notes, mistakes: g.mistakes + wrongAdded };
    });
    if (!notesMode) { sfx(wrongAdded ? 'bad' : 'place'); if (wrongAdded) toast('Das passt hier nicht.'); } else sfx('tick');
  };
  const erase = () => {
    if (!game || done || paused) return;
    const targets = [...sel].filter((i) => !game.puzzle.givens[i] && (game.user[i] || game.notes[i] || game.marks[i]));
    if (!targets.length) return;
    commit((g) => { const user = g.user.slice(), notes = g.notes.slice(); for (const i of targets) { user[i] = 0; notes[i] = 0; } return { ...g, user, notes }; });
    sfx('erase');
  };
  const setMark = (m: number) => {
    if (!game || sel.size === 0) return;
    commit((g) => { const marks = g.marks.slice(); for (const i of sel) marks[i] = marks[i] === m ? 0 : m; return { ...g, marks }; });
  };
  const autoNotes = (free = false) => {
    if (!game || !spec) return;
    const st = initState(spec, vals);
    commit((g) => ({ ...g, notes: g.notes.map((x, i) => (g.puzzle.givens[i] || g.user[i] ? 0 : st.cand[i])), helped: g.helped || free }));
    sfx('good');
  };

  // ───── Hinweise ─────
  const doHint = () => {
    if (!game || !spec || done) return;
    if (hint && hint.step) {
      if (hint.stage < 3) { setHint({ ...hint, stage: hint.stage + 1 }); return; }
      // Schritt ausführen
      const step = hint.step;
      commit((g) => {
        const user = g.user.slice(), notes = g.notes.slice();
        const st = initState(spec, g.puzzle.givens.map((x, i) => x || g.user[i]));
        if (step.place) { user[step.place.cell] = step.place.d; notes[step.place.cell] = 0; for (const p of peersOf(step.place.cell)) notes[p] &= ~(1 << (step.place.d - 1)); }
        else for (const e of step.elim) { if (!notes[e.cell]) notes[e.cell] = st.cand[e.cell]; notes[e.cell] &= ~(1 << (e.d - 1)); }
        return { ...g, user, notes, hints: g.hints + 1, helped: true };
      });
      sfx('good');
      return;
    }
    const wrongCells = game.user.map((u, i) => (u && u !== game.puzzle.solution[i] ? i : -1)).filter((i) => i >= 0);
    if (wrongCells.length) { setShowWrong(true); setHint({ step: null, stage: 0, msg: `Irgendwo steckt ein Fehler (${wrongCells.length} falsche Zahl${wrongCells.length > 1 ? 'en' : ''}, rot markiert). Korrigiere ihn, dann bekommst du einen Hinweis.` }); return; }
    const st = initState(spec, vals);
    const step = nextStep(spec, st);
    if (!step) {
      setHint({ step: null, stage: 0, msg: 'Hier reichen die bekannten Techniken nicht – das Rätsel verlangt Ausprobieren. Tipp: Suche eine Zelle mit nur zwei Kandidaten und probiere beide durch.' });
      return;
    }
    setHint({ step, stage: 1 });
  };
  const hintOverlay: HintOverlay | null = hint?.step && hint.stage >= 2 ? { cells: hint.step.cells, elim: hint.stage >= 3 ? hint.step.elim : [], place: hint.stage >= 3 ? hint.step.place : undefined, group: hint.step.group } : hint?.step && hint.stage === 1 && hint.step.group !== undefined ? { cells: [], elim: [], group: hint.step.group } : null;
  const hintText = hint?.msg ?? (hint?.step
    ? hint.stage === 1 ? `Hinweis 1/3: Hier hilft die Technik „${TECH_INFO[hint.step.tech].name}“. ${TECH_INFO[hint.step.tech].short}`
      : hint.stage === 2 ? `Hinweis 2/3: ${hint.step.text}`
      : `Hinweis 3/3: ${hint.step.place ? `Trage die ${hint.step.place.d} in ${`Z${Math.floor(hint.step.place.cell / game!.puzzle.n) + 1}S${(hint.step.place.cell % game!.puzzle.n) + 1}`} ein.` : `Streiche die rot markierten Kandidaten (${hint.step.elim.length}).`} Drücke noch einmal, um es auszuführen.`
    : '');

  // ───── Fertig? ─────
  useEffect(() => {
    if (!game || done) return;
    const solved = vals.every((v, i) => v === game.puzzle.solution[i]);
    if (!solved) return;
    const p = game.puzzle;
    const secsT = Math.max(1, Math.round(timeRef.current));
    const key = `${p.variant}-${p.level}`;
    const clean = game.mistakes === 0 && !game.helped;
    let best = false;
    upd((d) => {
      const st = d.stats[key] ?? { played: 0, won: 0, best: 0, total: 0, clean: 0 };
      st.played++; st.won++; st.total += secsT; if (!game.helped && (!st.best || secsT < st.best)) { st.best = secsT; best = true; } if (clean) st.clean++;
      d.stats = { ...d.stats, [key]: st };
      if (game.daily && !game.helped) d.dailyBest = { ...d.dailyBest, [game.daily]: Math.min(d.dailyBest[game.daily] ?? 99999, secsT) };
      d.current = null;
    });
    sfx('win');
    setDone({ time: secsT, mistakes: game.mistakes, hints: game.hints, helped: game.helped, puzzle: p, best });
    // Erfolge
    achieve('sudoku', 'first');
    if (clean) achieve('sudoku', 'clean');
    if (!game.helped) {
      if (p.level === 'leicht' && secsT < 300 && p.n === 9) achieve('sudoku', 'fast');
      if (p.level === 'experte') achieve('sudoku', 'experte');
      if (p.level === 'teufel') achieve('sudoku', 'teufel');
    }
    if (p.variant === 'killer') achieve('sudoku', 'killer');
    if (game.custom) achieve('sudoku', 'eigenes');
    if (game.daily) { achieve('sudoku', 'daily'); markDaily('sudoku', `${p.variant}-${p.level}`); }
    const all = Object.entries({ ...data.stats, [key]: { won: 1 } }).filter(([, v]) => (v as { won: number }).won > 0).map(([k]) => k.split('-')[0]);
    if (VARIANTS.every((v) => all.includes(v.id))) achieve('sudoku', 'alle');
    const totalWon = Object.values(data.stats).reduce((a, s) => a + s.won, 0) + 1;
    if (totalWon >= 10) achieve('sudoku', 'zehn');
    if (totalWon >= 50) achieve('sudoku', 'fuenfzig');
  }, [vals]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── Zeiger & Tastatur ─────
  const onDown = (i: number, e: React.PointerEvent) => {
    if (paused || done) return;
    dragging.current = true;
    if (e.ctrlKey || e.metaKey || e.shiftKey) setSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
    else setSel(new Set([i]));
  };
  const onEnter = (i: number, e: React.PointerEvent) => { if (dragging.current && e.buttons) setSel((s) => (s.has(i) ? s : new Set(s).add(i))); };
  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);
  const onBoardMove = (e: React.PointerEvent) => {
    if (!dragging.current || e.pointerType === 'mouse') return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-i]') as HTMLElement | null;
    if (el) { const i = +el.dataset.i!; setSel((s) => (s.has(i) ? s : new Set(s).add(i))); }
  };

  useKeys((e) => {
    if (view !== 'spiel' || !game || panel) return;
    const n = game.puzzle.n;
    const dgt = digitFromEvent(e);
    if (dgt > 0 && dgt <= n && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) { const was = notesMode; setNotesMode(true); enterNote(dgt); setNotesMode(was); } else enter(dgt);
      return;
    }
    if (dgt === 0 || e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); erase(); return; }
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      const cur = sel.size ? [...sel][sel.size - 1] : 0;
      const r = Math.max(0, Math.min(n - 1, Math.floor(cur / n) + dr)), c = Math.max(0, Math.min(n - 1, (cur % n) + dc));
      const nx = r * n + c;
      setSel(e.shiftKey ? new Set([...sel, nx]) : new Set([nx]));
    };
    switch (e.key) {
      case 'ArrowUp': return move(-1, 0);
      case 'ArrowDown': return move(1, 0);
      case 'ArrowLeft': return move(0, -1);
      case 'ArrowRight': return move(0, 1);
      case 'n': case 'N': return setNotesMode((x) => !x);
      case 'u': case 'U': return undo();
      case 'y': case 'Y': return redoIt();
      case 'z': case 'Z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.shiftKey ? redoIt() : undo(); } return;
      case 'h': case 'H': return doHint();
      case 'p': case 'P': return setPaused((x) => !x);
      case 'Escape': setSel(new Set()); setHint(null); return;
    }
  }, [game, sel, notesMode, view, panel, hint, paused, done, S.check, S.autoClean]);
  const enterNote = (d: number) => {
    if (!game || done || paused || !sel.size) return;
    const targets = [...sel].filter((i) => !game.puzzle.givens[i] && !game.user[i]);
    if (!targets.length) return;
    const allHave = targets.every((i) => game.notes[i] & (1 << (d - 1)));
    commit((g) => { const notes = g.notes.slice(); for (const i of targets) notes[i] = allHave ? notes[i] & ~(1 << (d - 1)) : notes[i] | (1 << (d - 1)); return { ...g, notes }; });
  };

  // ───── Geheimnisse ─────
  useSecrets('sudoku', {
    'sudoku-magic': () => {
      if (!game || !sel.size || done) return;
      const i = [...sel][0];
      if (game.puzzle.givens[i]) return;
      commit((g) => { const user = g.user.slice(); user[i] = g.puzzle.solution[i]; return { ...g, user, helped: true }; });
    },
    'sudoku-oracle': () => autoNotes(true),
    'sudoku-ink': () => { const order = THEMES.map((t) => t.id); setS({ theme: order[(order.indexOf(S.theme) + 1) % order.length] as Theme }); },
  });

  // ───── Anzeige ─────
  const wrong = useMemo(() => {
    const s = new Set<number>();
    if (!game) return s;
    if (S.check === 'sofort' || showWrong) game.user.forEach((u, i) => { if (u && u !== game.puzzle.solution[i]) s.add(i); });
    return s;
  }, [game, S.check, showWrong]);
  const counts = useMemo(() => {
    const c: number[] = new Array((game?.puzzle.n ?? 9) + 1).fill(0);
    vals.forEach((v) => { if (v) c[v]++; });
    return c;
  }, [vals, game]);

  const info = game ? VARIANTS.find((v) => v.id === game.puzzle.variant)! : null;
  const lvlName = game ? LEVELS.find((l) => l.id === game.puzzle.level)?.name : '';
  const stats = data.stats;

  if (view === 'schule') return <div className="sd" data-theme={S.theme}><Academy onBack={() => setView('spiel')} progress={data.academy} onDone={(t) => { upd((d) => { d.academy = { ...d.academy, [t]: (d.academy[t] ?? 0) + 1 }; }); }} /></div>;
  if (view === 'editor') return <div className="sd" data-theme={S.theme}><Editor onBack={() => setView('spiel')} onPlay={(p) => startFromPuzzle(p, true)} /></div>;

  return (
    <div className="sd" data-theme={S.theme}>
      <header className="sd-head">
        <div className="sd-masthead">
          <h1>Rätselheft</h1>
          <span className="sd-issue">{game ? `${info?.name} · ${lvlName}${game.daily ? ' · Tagesrätsel' : ''}${game.custom ? ' · Eigenes Rätsel' : ''}` : 'Bitte ein Rätsel wählen'}</span>
        </div>
        <nav className="sd-nav">
          <button onClick={() => setPanel(panel === 'neu' ? null : 'neu')}>Neu</button>
          <button onClick={startDaily} className={dailyDone('sudoku', 'klassik-mittel') ? 'done' : ''}>Tagesrätsel{dailyDone('sudoku', 'klassik-mittel') ? ' ✓' : ''}</button>
          <button onClick={() => setView('schule')}>Schule</button>
          <button onClick={() => setView('editor')}>Eigenes</button>
          <button onClick={() => setView(view === 'statistik' ? 'spiel' : 'statistik')}>Statistik</button>
          <button onClick={() => setPanel(panel === 'optionen' ? null : 'optionen')}>Optionen</button>
          <button className="sd-x" onClick={onExit} aria-label="Zurück zur Halle">✕</button>
        </nav>
      </header>

      {panel === 'neu' && (
        <section className="sd-panel" aria-label="Neues Rätsel">
          <h2>Neues Rätsel</h2>
          <div className="sd-variants">
            {VARIANTS.map((v) => <button key={v.id} className={S.variant === v.id ? 'on' : ''} onClick={() => setS({ variant: v.id, level: v.id === 'kinder' ? 'leicht' : S.level })}><b>{v.name}</b><small>{v.info}</small></button>)}
          </div>
          <div className="sd-levels" role="radiogroup" aria-label="Stufe">
            {LEVELS.filter((l) => S.variant !== 'kinder' || l.id === 'leicht').map((l) => <button key={l.id} role="radio" aria-checked={S.level === l.id} className={S.level === l.id ? 'on' : ''} onClick={() => setS({ level: l.id })}>{l.name}</button>)}
          </div>
          <p className="sd-small">Jedes Rätsel hat genau eine Lösung und ist mit Logik lösbar{S.level === 'teufel' ? ' – nur „Teufel“ verlangt manchmal Ausprobieren' : ''}.</p>
          <div className="sd-row">
            <button className="sd-primary" onClick={() => void begin(S.variant, S.level)}>Rätsel setzen</button>
            <button onClick={() => setPanel('code')}>Code laden</button>
            {game && <button onClick={() => setPanel(null)}>Zurück zum Rätsel</button>}
          </div>
        </section>
      )}
      {panel === 'code' && (
        <section className="sd-panel">
          <h2>Rätsel-Code</h2>
          <p className="sd-small">Füge einen Code ein (81 Zeichen für klassische Rätsel: Ziffern, Punkt für leere Zellen) oder kopiere den Code des aktuellen Rätsels.</p>
          <textarea value={codeText} onChange={(e) => setCodeText(e.target.value)} rows={3} spellCheck={false} placeholder="53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79" />
          <div className="sd-row">
            <button className="sd-primary" onClick={() => {
              const grid = decodeGrid(codeText, 9) ?? decodeGrid(codeText, 6) ?? decodeGrid(codeText, 4);
              if (!grid) { toast('Code nicht lesbar'); return; }
              const n = Math.round(Math.sqrt(grid.length));
              const variant: Variant = n === 9 ? 'klassik' : n === 6 ? 'mini' : 'kinder';
              const sp = buildSpec(variant);
              const r = solve(sp, grid, 2);
              if (r.count !== 1) { toast(r.count === 0 ? 'Dieses Rätsel hat keine Lösung.' : 'Dieses Rätsel hat mehrere Lösungen.'); return; }
              startFromPuzzle({ variant, n, givens: grid, solution: Array.from(r.solution!), cages: [], weight: 0, level: 'mittel', seed: 0 }, true);
            }}>Laden</button>
            {game && <button onClick={() => { void navigator.clipboard?.writeText(encodeGrid(game.puzzle.givens)); toast('Code kopiert'); }}>Code des Rätsels kopieren</button>}
            <button onClick={() => setPanel('neu')}>Zurück</button>
          </div>
        </section>
      )}
      {panel === 'optionen' && (
        <section className="sd-panel" aria-label="Optionen">
          <h2>Optionen</h2>
          <div className="sd-opt"><span>Design</span><span className="sd-seg">{THEMES.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}>{t.name}</button>)}</span></div>
          <div className="sd-opt"><span>Fehler anzeigen</span><span className="sd-seg">{([['sofort', 'Sofort'], ['ende', 'Auf Knopfdruck'], ['aus', 'Nie']] as const).map(([v, l]) => <button key={v} className={S.check === v ? 'on' : ''} onClick={() => setS({ check: v })}>{l}</button>)}</span></div>
          <label className="sd-opt"><span>Notizen automatisch bereinigen</span><input type="checkbox" checked={S.autoClean} onChange={(e) => setS({ autoClean: e.target.checked })} /></label>
          <label className="sd-opt"><span>Gleiche Zahlen hervorheben</span><input type="checkbox" checked={S.highlightSame} onChange={(e) => setS({ highlightSame: e.target.checked })} /></label>
          <label className="sd-opt"><span>Zeile, Spalte und Block hervorheben</span><input type="checkbox" checked={S.highlightPeers} onChange={(e) => setS({ highlightPeers: e.target.checked })} /></label>
          <label className="sd-opt"><span>Zeit anzeigen</span><input type="checkbox" checked={S.showTimer} onChange={(e) => setS({ showTimer: e.target.checked })} /></label>
          <div className="sd-row"><button className="sd-primary" onClick={() => setPanel(null)}>Fertig</button></div>
        </section>
      )}

      {view === 'statistik' && (
        <section className="sd-panel">
          <h2>Statistik</h2>
          {Object.keys(stats).length === 0 ? <p>Noch keine gelösten Rätsel.</p> : (
            <table className="sd-table">
              <thead><tr><th>Variante</th><th>Stufe</th><th>Gelöst</th><th>Beste Zeit</th><th>Ø Zeit</th><th>Fehlerfrei</th></tr></thead>
              <tbody>{Object.entries(stats).map(([k, s]) => {
                const [v, l] = k.split('-');
                return <tr key={k}><td>{VARIANTS.find((x) => x.id === v)?.name ?? v}</td><td>{LEVELS.find((x) => x.id === l)?.name ?? l}</td><td>{s.won}</td><td>{s.best ? fmtTime(s.best) : '–'}</td><td>{s.won ? fmtTime(s.total / s.won) : '–'}</td><td>{s.clean}</td></tr>;
              })}</tbody>
            </table>
          )}
          <h3>Tagesrätsel-Kalender</h3>
          <Calendar daily={hall.daily} best={data.dailyBest} />
          <h3>Schule</h3>
          <p className="sd-small">{Object.keys(data.academy).length} von 11 Techniken geübt.</p>
        </section>
      )}

      {view === 'spiel' && (
        <main className="sd-main">
          {busy && <div className="sd-busy" role="status">Das Rätsel wird gesetzt …</div>}
          {game && spec && (
            <>
              <section className="sd-gridwrap" onPointerMove={onBoardMove}>
                <div className="sd-bar">
                  <span>{S.showTimer ? fmtTime(secs) : '·'}</span>
                  <span>Fehler: {game.mistakes}</span>
                  <span>Hinweise: {game.hints}</span>
                  <button className="sd-link" onClick={() => setPaused((p) => !p)}>{paused ? 'Weiter' : 'Pause'}</button>
                </div>
                <SudokuBoard spec={spec} givens={game.puzzle.givens} vals={vals} notes={game.notes} marks={game.marks} sel={sel} wrong={wrong} hint={hintOverlay} showSame={S.highlightSame} showPeers={S.highlightPeers} paused={paused} onDown={onDown} onEnter={onEnter} />
                {hintText && <div className="sd-hint" role="status">{hintText}</div>}
              </section>
              <aside className="sd-side">
                <div className="sd-keys" role="group" aria-label="Zahlen">
                  {Array.from({ length: game.puzzle.n }, (_, k) => k + 1).map((d) => (
                    <button key={d} className={counts[d] >= game.puzzle.n ? 'full' : ''} onClick={() => enter(d)} aria-label={`Zahl ${d}`}><b>{d}</b><small>{Math.max(0, game.puzzle.n - counts[d])}</small></button>
                  ))}
                </div>
                <div className="sd-tools">
                  <button className={notesMode ? 'on' : ''} onClick={() => setNotesMode((x) => !x)} aria-pressed={notesMode}>✎ Notizen</button>
                  <button onClick={erase}>⌫ Löschen</button>
                  <button onClick={undo} disabled={!hist.current.length}>↶ Zurück</button>
                  <button onClick={redoIt} disabled={!redo.current.length}>↷ Vor</button>
                  <button onClick={doHint}>💡 Hinweis</button>
                  <button onClick={() => autoNotes(false)}>Auto-Notizen</button>
                  {S.check !== 'sofort' && <button onClick={() => { setShowWrong(true); const w = game.user.filter((u, i) => u && u !== game.puzzle.solution[i]).length; toast(w ? `${w} falsche Zahl${w > 1 ? 'en' : ''}` : 'Bisher alles richtig!'); }}>Prüfen</button>}
                </div>
                <div className="sd-marks" aria-label="Markierfarben">
                  {MARKS.map((c, k) => <button key={k} onClick={() => setMark(k)} style={{ background: c || 'transparent' }} aria-label={k ? `Farbe ${k}` : 'Farbe entfernen'}>{k === 0 ? '∅' : ''}</button>)}
                </div>
                <p className="sd-small">Tastatur: Zahlen, <kbd>Umschalt</kbd>+Zahl = Notiz, <kbd>N</kbd> Notizmodus, Pfeile, <kbd>H</kbd> Hinweis, <kbd>U</kbd> zurück, <kbd>P</kbd> Pause.</p>
              </aside>
            </>
          )}
        </main>
      )}

      {done && (
        <div className="sd-modal" role="dialog" aria-label="Gelöst">
          <div className="sd-modal-box">
            <h2>Gelöst!</h2>
            <p className="sd-big">{fmtTime(done.time)}</p>
            <p>{done.mistakes === 0 && !done.helped ? 'Fehlerfrei und ohne Hilfe – ' : ''}{done.mistakes} Fehler, {done.hints} Hinweise{done.best ? ' · Neue Bestzeit!' : ''}</p>
            <div className="sd-row">
              <button className="sd-primary" onClick={() => void begin(done.puzzle.variant, done.puzzle.level)}>Nächstes Rätsel</button>
              <button onClick={() => { setDone(null); setPanel('neu'); }}>Anderes Rätsel</button>
              <button onClick={() => { setDone(null); setGame(null); }}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Calendar({ daily, best }: { daily: Record<string, string[]>; best: Record<string, number> }) {
  const days: { k: string; on: boolean; t?: number }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 69);
  for (let i = 0; i < 70; i++) {
    const k = todayKey(d);
    days.push({ k, on: (daily[k] ?? []).some((x) => x.startsWith('sudoku:')), t: best[k] });
    d.setDate(d.getDate() + 1);
  }
  return <div className="sd-cal">{days.map((x) => <i key={x.k} className={x.on ? 'on' : ''} title={`${x.k}${x.t ? ` – ${fmtTime(x.t)}` : ''}`} />)}</div>;
}
