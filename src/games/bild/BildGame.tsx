import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/jost/500.css';
import '@fontsource/jost/700.css';
import '@fontsource/jost/800.css';
import { useKeys, usePlaytime, useSecrets, useTicker } from '../shared/hooks';
import { dailySeed, freshSeed, todayKey } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, fmtTime, markDaily, toast, useGameData } from '../shared/store';
import { BILD_INIT, BLESSONS, type BSettings, type BTheme, type Custom, type SavedB, bitsToString, stringToBits } from './data';
import { type Nono, cluesOf, decodeNono, generateNono, lineClue, solveLine, solveLogic } from './engine';
import NonoCanvas, { type LineHint, PALETTES } from './NonoCanvas';
import { PICTURES } from './pictures';
import PixelEditor from './PixelEditor';
import './bild.css';

type View = 'menu' | 'spiel' | 'editor' | 'schule' | 'logik' | 'statistik';
type Tab = 'sammlung' | 'zufall' | 'eigene' | 'code';

const THEMES: { id: BTheme; name: string }[] = [{ id: 'mondrian', name: 'Mondrian' }, { id: 'blau', name: 'Blaupause' }, { id: 'nacht', name: 'Nacht' }];

export default function Bild({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('bild');
  const [data, upd] = useGameData('bild', BILD_INIT);
  const S: BSettings = { ...BILD_INIT.settings, ...data.settings };
  const setS = (p: Partial<BSettings>) => upd((d) => { d.settings = { ...BILD_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(data.current ? 'spiel' : 'menu');
  const [tab, setTab] = useState<Tab>('sammlung');
  const [game, setGame] = useState<SavedB | null>(data.current);
  const [ver, setVer] = useState(0);
  const uRef = useRef<Int8Array>(Int8Array.from(game?.u ?? []));
  const hist = useRef<Int8Array[]>([]);
  const redoSt = useRef<Int8Array[]>([]);
  const stroke = useRef<{ target: number; kind: 'fill' | 'cross'; snap: Int8Array } | null>(null);
  const timeRef = useRef(game?.time ?? 0);
  const [secs, setSecs] = useState(Math.floor(timeRef.current));
  const [paused, setPaused] = useState(false);
  const [won, setWon] = useState<null | { time: number; mistakes: number; hints: number; helped: boolean; best: boolean; name: string }>(null);
  const [hint, setHint] = useState<{ h: LineHint; text: string; stage: number } | null>(null);
  const [ghost, setGhost] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [wrongSet, setWrongSet] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState({ w: S.size, h: S.size });
  const [codeText, setCodeText] = useState('');
  const [wrapW, setWrapW] = useState(900);
  const wrap = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ w: number; h: number; bits: Uint8Array; name: string; id?: string } | null>(null);
  const [logicStep, setLogicStep] = useState(0);
  const [auto, setAuto] = useState(false);

  const nono: Nono | null = useMemo(() => (game ? cluesOf(game.w, game.h, stringToBits(game.bits)) : null), [game?.bits, game?.w, game?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const sol = useMemo(() => (game ? stringToBits(game.bits) : null), [game?.bits]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el); setWrapW(el.clientWidth);
    return () => ro.disconnect();
  }, [view]);
  const cell = useMemo(() => {
    if (!nono) return S.zoom;
    const maxRow = Math.max(...nono.rows.map((r) => r.length));
    const avail = wrapW - 36;
    const fit = Math.floor(avail / (nono.w + maxRow * 0.62 + 0.8));
    return Math.max(12, Math.min(S.zoom, fit));
  }, [nono, wrapW, S.zoom]);

  // ───── speichern ─────
  useEffect(() => {
    const id = setTimeout(() => { if (game && !won) upd((d) => { d.current = { ...game, u: Array.from(uRef.current), time: timeRef.current }; }); }, 600);
    return () => clearTimeout(id);
  }, [ver, game]); // eslint-disable-line react-hooks/exhaustive-deps
  useTicker(!!game && !won && !paused && view === 'spiel', (dt) => { timeRef.current += dt / 1000; setSecs(Math.floor(timeRef.current)); }, 500);
  useEffect(() => { const on = () => { if (document.hidden) setPaused(true); }; document.addEventListener('visibilitychange', on); return () => document.removeEventListener('visibilitychange', on); }, []);

  // ───── Fortschrittsanzeigen ─────
  const { rowDone, colDone } = useMemo(() => {
    if (!nono) return { rowDone: [] as boolean[], colDone: [] as boolean[] };
    const u = uRef.current;
    const rd = nono.rows.map((cl, y) => lineClue(Array.from({ length: nono.w }, (_, x) => (u[y * nono.w + x] === 1 ? 1 : 0))).join() === cl.join());
    const cd = nono.cols.map((cl, x) => lineClue(Array.from({ length: nono.h }, (_, y) => (u[y * nono.w + x] === 1 ? 1 : 0))).join() === cl.join());
    return { rowDone: rd, colDone: cd };
  }, [nono, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const progress = useMemo(() => {
    if (!sol) return 0;
    const u = uRef.current;
    let total = 0, ok = 0;
    for (let i = 0; i < sol.length; i++) if (sol[i]) { total++; if (u[i] === 1) ok++; }
    return total ? Math.round((ok / total) * 100) : 0;
  }, [sol, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── Spiel starten ─────
  const startGame = useCallback((g: Omit<SavedB, 'u' | 'time' | 'mistakes' | 'hints' | 'helped' | 'lives'>) => {
    uRef.current = new Int8Array(g.w * g.h).fill(-1);
    hist.current = []; redoSt.current = []; timeRef.current = 0; setSecs(0); setPaused(false); setWon(null); setHint(null); setWrongSet(new Set()); setCursor(-1); setGhost(false);
    setGame({ ...g, u: Array.from(uRef.current), time: 0, mistakes: 0, hints: 0, helped: false, lives: 3 });
    setVer((v) => v + 1);
    setView('spiel');
  }, []);
  const startRandom = (w: number, h: number, diff: BSettings['diff'], seed?: number, dailyKey?: string) => {
    setBusy(true);
    window.setTimeout(() => {
      const g = generateNono(w, h, diff, seed ?? freshSeed(), 2000);
      startGame({ w: g.w, h: g.h, bits: bitsToString(g.bits), name: `Zufallsbild ${w}×${h}`, daily: dailyKey });
      setBusy(false);
    }, 20);
  };
  const startDaily = useCallback(() => {
    const seed = dailySeed('bild', 'tag');
    setBusy(true);
    window.setTimeout(() => { const g = generateNono(15, 15, 'mittel', seed, 2500); startGame({ w: 15, h: 15, bits: bitsToString(g.bits), name: 'Tagesbild', daily: todayKey() }); setBusy(false); }, 20);
  }, [startGame]);
  useEffect(() => { if (daily) startDaily(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── Eingabe ─────
  const snapshot = () => { hist.current.push(uRef.current.slice()); if (hist.current.length > 300) hist.current.shift(); redoSt.current = []; };
  const checkWin = () => {
    if (!game || !sol) return false;
    const u = uRef.current;
    for (let i = 0; i < sol.length; i++) if ((sol[i] === 1) !== (u[i] === 1)) return false;
    return true;
  };
  const finishWin = () => {
    if (!game) return;
    const secsT = Math.max(1, Math.round(timeRef.current));
    const clean = game.mistakes === 0 && !game.helped;
    const key = `${game.w}x${game.h}`;
    let best = false;
    upd((d) => {
      const st = d.stats[key] ?? { played: 0, won: 0, best: 0 };
      st.played++; st.won++; if (!game.helped && (!st.best || secsT < st.best)) { st.best = secsT; best = true; }
      d.stats = { ...d.stats, [key]: st };
      if (game.pic && !game.helped) d.pics = { ...d.pics, [game.pic]: Math.min(d.pics[game.pic] ?? 99999, secsT) };
      if (game.lesson) d.lessons = { ...d.lessons, [game.lesson]: true };
      d.current = null;
    });
    // Rätsel aufdecken: Kreuze entfernen, Bild zeigen
    const u = uRef.current;
    for (let i = 0; i < u.length; i++) u[i] = sol![i] ? 1 : -1;
    setVer((v) => v + 1);
    sfx('win');
    setWon({ time: secsT, mistakes: game.mistakes, hints: game.hints, helped: game.helped, best, name: game.name });
    achieve('bild', 'first');
    if (clean) achieve('bild', 'clean');
    if (game.w >= 20 || game.h >= 20) achieve('bild', 'gross');
    if (S.hardcore) achieve('bild', 'hardcore');
    if (game.w === 10 && game.h === 10 && secsT < 120 && !game.helped) achieve('bild', 'schnell');
    if (game.daily) { achieve('bild', 'daily'); markDaily('bild', 'tag'); }
    if (game.name === 'Eigenes Bild' || game.name.startsWith('Eigenes')) achieve('bild', 'maler');
    if (game.pic && Object.keys({ ...data.pics, [game.pic]: 1 }).length >= 10) achieve('bild', 'sammler');
    if (game.lesson) { const done = BLESSONS.every((l) => l.id === game.lesson || data.lessons[l.id]); if (done) achieve('bild', 'schule'); }
    if (game.name.startsWith('Zufall')) { const n = Object.values(data.stats).reduce((a, s) => a + s.won, 0) + 1; if (n >= 10) achieve('bild', 'zufall'); }
  };
  const afterStroke = () => {
    const nn = nono, g = game;
    if (!nn || !g) return;
    const u = uRef.current;
    if (S.autoCross) {
      nn.rows.forEach((cl, y) => {
        const line = Array.from({ length: nn.w }, (_, x) => (u[y * nn.w + x] === 1 ? 1 : 0));
        if (lineClue(line).join() === cl.join()) for (let x = 0; x < nn.w; x++) if (u[y * nn.w + x] === -1) u[y * nn.w + x] = 0;
      });
      nn.cols.forEach((cl, x) => {
        const line = Array.from({ length: nn.h }, (_, y) => (u[y * nn.w + x] === 1 ? 1 : 0));
        if (lineClue(line).join() === cl.join()) for (let y = 0; y < nn.h; y++) if (u[y * nn.w + x] === -1) u[y * nn.w + x] = 0;
      });
    }
    setVer((v) => v + 1);
    if (checkWin()) finishWin();
  };

  const applyCell = (i: number) => {
    const s = stroke.current;
    if (!s || !game || !sol) return;
    const u = uRef.current;
    const cur = u[i];
    const want = s.kind === 'fill' ? 1 : 0;
    if (s.target === -1) { if (cur === want) u[i] = -1; return; }
    if (cur !== -1) return;
    // Fehlerprüfung
    if (S.errors === 'sofort') {
      const truth = sol[i];
      if ((s.kind === 'fill' && truth === 0) || (s.kind === 'cross' && truth === 1)) {
        u[i] = truth === 1 ? 1 : 0;
        const nm = game.mistakes + 1, lives = game.lives - (S.hardcore ? 1 : 0);
        setGame({ ...game, mistakes: nm, lives });
        sfx('bad'); toast(S.hardcore ? `Falsch! Noch ${Math.max(0, lives)} Leben` : 'Falsch – das Feld wurde korrigiert');
        if (S.hardcore && lives <= 0) { sfx('lose'); toast('Alle Leben verbraucht – Rätsel gelöst angezeigt'); for (let k = 0; k < u.length; k++) u[k] = sol[k] ? 1 : 0; upd((d) => { d.current = null; const key = `${game.w}x${game.h}`; const st = d.stats[key] ?? { played: 0, won: 0, best: 0 }; st.played++; d.stats = { ...d.stats, [key]: st }; }); setGame(null); setView('menu'); }
        return;
      }
    }
    u[i] = want;
    sfx(s.kind === 'fill' ? 'place' : 'tick');
  };
  const onStart = (i: number, kindIn: 'fill' | 'cross', e: React.PointerEvent) => {
    if (!game || won || paused) return;
    setHint(null);
    const kind = e.pointerType !== 'mouse' && S.touchMode === 'cross' && e.button === 0 ? 'cross' : kindIn;
    const cur = uRef.current[i];
    const want = kind === 'fill' ? 1 : 0;
    stroke.current = { kind, target: cur === want ? -1 : want, snap: uRef.current.slice() };
    snapshot();
    applyCell(i);
    setVer((v) => v + 1);
  };
  const onMove = (i: number) => { applyCell(i); setVer((v) => v + 1); };
  const onEnd = () => {
    const s = stroke.current;
    stroke.current = null;
    // Strich ohne Änderung nicht in die Historie aufnehmen
    if (s && s.snap.every((v, k) => v === uRef.current[k])) hist.current.pop();
    afterStroke();
  };
  const undo = () => { const s = hist.current.pop(); if (!s || won) return; redoSt.current.push(uRef.current.slice()); uRef.current = s; setWrongSet(new Set()); setVer((v) => v + 1); sfx('erase'); };
  const redo = () => { const s = redoSt.current.pop(); if (!s || won) return; hist.current.push(uRef.current.slice()); uRef.current = s; setVer((v) => v + 1); };
  const clearAll = () => { if (!game) return; snapshot(); uRef.current = new Int8Array(game.w * game.h).fill(-1); setHint(null); setWrongSet(new Set()); setVer((v) => v + 1); };

  // ───── Hinweise ─────
  const computeHint = (): { h: LineHint; text: string } | { msg: string } => {
    if (!game || !nono || !sol) return { msg: '' };
    const u = uRef.current;
    const known = new Int8Array(u.length);
    for (let i = 0; i < u.length; i++) known[i] = u[i] === -1 ? -1 : (u[i] === 1) === (sol[i] === 1) ? u[i] : -1;
    let bestScore = 0, best: LineHint | null = null, bestText = '';
    const consider = (line: 'row' | 'col', index: number) => {
      const cl = line === 'row' ? nono.rows[index] : nono.cols[index];
      const n = line === 'row' ? nono.w : nono.h;
      const cur = Int8Array.from({ length: n }, (_, k) => (line === 'row' ? known[index * nono.w + k] : known[k * nono.w + index]));
      const r = solveLine(cl, cur);
      if (!r) return;
      const fill: number[] = [], cross: number[] = [];
      for (let k = 0; k < n; k++) if (r[k] !== cur[k]) { const idx = line === 'row' ? index * nono.w + k : k * nono.w + index; if (r[k] === 1) fill.push(idx); else cross.push(idx); }
      const score = fill.length * 2 + cross.length;
      if (score > bestScore) {
        bestScore = score; best = { line, index, fill, cross };
        const sum = cl.reduce((a, b) => a + b, 0) + cl.length - 1;
        const slack = n - sum;
        const nm = line === 'row' ? `Zeile ${index + 1}` : `Spalte ${index + 1}`;
        const hasKnown = cur.some((v) => v !== -1);
        if (cl.length === 1 && cl[0] === 0) bestText = `${nm} hat den Hinweis 0 – alle Felder sind leer.`;
        else if (slack === 0) bestText = `${nm} (Hinweis ${cl.join(' ')}): Die Blöcke samt Lücken füllen alle ${n} Felder genau aus.`;
        else if (!hasKnown && slack < Math.max(...cl)) bestText = `${nm} (Hinweis ${cl.join(' ')}): Der größte Block (${Math.max(...cl)}) hat nur ${slack} Felder Spielraum – die mittleren ${Math.max(...cl) - slack} Felder sind in jedem Fall gefüllt (Überlappung).`;
        else bestText = `${nm} (Hinweis ${cl.join(' ')}): Mit den schon gesetzten Feldern passen die Blöcke nur auf eine Weise – dadurch sind ${fill.length} Felder gefüllt und ${cross.length} leer.`;
      }
    };
    for (let y = 0; y < nono.h; y++) consider('row', y);
    for (let x = 0; x < nono.w; x++) consider('col', x);
    if (!best) return { msg: 'Hier lässt sich allein durch Zeilenlogik nichts mehr bestimmen. Prüfe, ob du irgendwo einen Fehler hast („Prüfen“).' };
    return { h: best, text: bestText };
  };
  const applyHint = (h: LineHint) => {
    snapshot();
    const u = uRef.current;
    for (const i of h.fill) u[i] = 1;
    for (const i of h.cross) u[i] = 0;
    setGame((g) => (g ? { ...g, hints: g.hints + 1, helped: true } : g));
    setHint(null);
    afterStroke();
    sfx('good');
  };
  const doHint = () => {
    if (!game || won) return;
    if (hint) {
      if (hint.stage === 1) { setHint({ ...hint, stage: 2 }); return; }
      applyHint(hint.h); return;
    }
    const r = computeHint();
    if ('msg' in r) { toast(r.msg); return; }
    setHint({ h: r.h, text: r.text, stage: 1 });
  };
  const checkErrors = () => {
    if (!game || !sol) return;
    const u = uRef.current;
    const w = new Set<number>();
    for (let i = 0; i < u.length; i++) if (u[i] !== -1 && (u[i] === 1) !== (sol[i] === 1)) w.add(i);
    setWrongSet(w);
    toast(w.size ? `${w.size} Feld${w.size > 1 ? 'er' : ''} falsch (rot markiert)` : 'Bisher alles richtig!');
    if (w.size) setGame({ ...game, mistakes: game.mistakes + 1 });
  };

  // ───── Tastatur ─────
  useKeys((e) => {
    if (view !== 'spiel' || !game || !nono) return;
    const move = (dx: number, dy: number) => { e.preventDefault(); const cur = cursor < 0 ? 0 : cursor; const x = Math.max(0, Math.min(nono.w - 1, (cur % nono.w) + dx)), y = Math.max(0, Math.min(nono.h - 1, Math.floor(cur / nono.w) + dy)); setCursor(y * nono.w + x); };
    switch (e.key) {
      case 'ArrowLeft': return move(-1, 0);
      case 'ArrowRight': return move(1, 0);
      case 'ArrowUp': return move(0, -1);
      case 'ArrowDown': return move(0, 1);
      case ' ': case 'f': case 'F': case 'x': case 'X': {
        if (cursor < 0 || won || paused) return;
        e.preventDefault();
        const kind = e.key === 'x' || e.key === 'X' ? 'cross' : 'fill';
        const cur = uRef.current[cursor], want = kind === 'fill' ? 1 : 0;
        stroke.current = { kind, target: cur === want ? -1 : want, snap: uRef.current.slice() };
        snapshot(); applyCell(cursor); stroke.current = null; afterStroke(); return;
      }
      case 'z': case 'Z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); undo(); } return;
      case 'u': case 'U': return undo();
      case 'y': case 'Y': return redo();
      case 'h': case 'H': return doHint();
      case 'p': case 'P': return setPaused((x) => !x);
    }
  }, [cursor, game, nono, view, hint, paused, won, S.errors, S.autoCross]);

  // ───── Geheimnisse ─────
  useSecrets('bild', {
    'bild-picasso': () => { if (!game) return; setGame((g) => (g ? { ...g, helped: true } : g)); setGhost(true); setTimeout(() => setGhost(false), 3000); },
    'bild-mondrian': () => { const order = THEMES.map((t) => t.id); setS({ theme: order[(order.indexOf(S.theme) + 1) % order.length] }); },
    'bild-pixel': () => { if (!game || won) return; const r = computeHint(); if ('h' in r) applyHint(r.h); },
  });

  // ───── Lösungsweg ─────
  const logicData = useMemo(() => (view === 'logik' && nono ? solveLogic(nono, undefined, true) : null), [view, nono]);
  useEffect(() => {
    if (!auto || !logicData) return;
    const id = setInterval(() => setLogicStep((s) => { if (s >= logicData.steps.length) { setAuto(false); return s; } return s + 1; }), 550);
    return () => clearInterval(id);
  }, [auto, logicData]);
  const logicBoard = useMemo(() => {
    if (!logicData || !nono) return null;
    const g = new Int8Array(nono.w * nono.h).fill(-1);
    for (let k = 0; k < Math.min(logicStep, logicData.steps.length); k++) { const st = logicData.steps[k]; for (const i of st.changed) g[i] = logicData.grid[i]; }
    // nach dem letzten Schritt ist alles bestimmt – Zwischenwerte aus der Lösung
    return g;
  }, [logicData, logicStep, nono]);

  // ───── Rendering ─────
  const P = PALETTES[S.theme];
  const statSolved = Object.values(data.stats).reduce((a, s) => a + s.won, 0);

  const heading = (
    <header className="bd-head">
      <div className="bd-brand"><i className="r" /><i className="b" /><i className="y" /><h1>Bildrätsel</h1></div>
      <nav className="bd-nav">
        <button onClick={() => setView('menu')} className={view === 'menu' ? 'on' : ''}>Neu</button>
        <button onClick={startDaily} className={dailyDone('bild', 'tag') ? 'done' : ''}>Tagesbild{dailyDone('bild', 'tag') ? ' ✓' : ''}</button>
        <button onClick={() => setView('schule')} className={view === 'schule' ? 'on' : ''}>Schule</button>
        <button onClick={() => { setEditing({ w: 10, h: 10, bits: new Uint8Array(100), name: 'Eigenes Bild' }); setView('editor'); }} className={view === 'editor' ? 'on' : ''}>Zeichnen</button>
        <button onClick={() => setView('statistik')} className={view === 'statistik' ? 'on' : ''}>Statistik</button>
        <button className="bd-x" aria-label="Zurück zur Halle" onClick={onExit}>✕</button>
      </nav>
    </header>
  );

  if (view === 'editor' && editing) {
    return (
      <div className="bd" data-theme={S.theme}>
        {heading}
        <PixelEditor
          init={editing} theme={S.theme}
          onPlay={(w, h, bits, name) => { startGame({ w, h, bits: bitsToString(bits), name }); }}
          onSave={(c: Custom) => upd((d) => { d.custom = [c, ...d.custom.filter((x) => x.id !== c.id)]; })}
          onPhoto={() => achieve('bild', 'foto')}
        />
      </div>
    );
  }

  return (
    <div className="bd" data-theme={S.theme}>
      {heading}
      {view === 'menu' && (
        <main className="bd-menu">
          <div className="bd-tabs" role="tablist">
            {([['sammlung', 'Bilder'], ['zufall', 'Zufall'], ['eigene', 'Eigene'], ['code', 'Code']] as [Tab, string][]).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}
          </div>
          {busy && <div className="bd-busy">Rätsel wird gebaut …</div>}
          {tab === 'sammlung' && (
            <>
              <p className="bd-note">{PICTURES.length} Bilder. Welches Motiv sich versteckt, siehst du erst, wenn du es gelöst hast.</p>
              <div className="bd-pics">
                {PICTURES.map((p) => {
                  const done = data.pics[p.id];
                  return (
                    <button key={p.id} className={'bd-pic' + (done ? ' done' : '')} onClick={() => startGame({ w: p.w, h: p.h, bits: bitsToString(p.art.join('').split('').map((c) => (c === '#' ? 1 : 0))), name: p.name, pic: p.id })}>
                      <span className="bd-thumb">{done ? <Thumb art={p.art} colors={[P.c1, P.c2, P.c3, P.ink]} /> : <b>?</b>}</span>
                      <span>{done ? p.name : `Bild ${p.w}×${p.h}`}</span>
                      <small>{done ? `✓ ${fmtTime(done)}` : `${p.w}×${p.h}`}</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {tab === 'zufall' && (
            <section className="bd-card">
              <h2>Zufallsrätsel</h2>
              <p className="bd-note">Jedes Rätsel ist eindeutig und rein logisch lösbar – ganz ohne Raten.</p>
              <div className="bd-row">
                {[5, 10, 15, 20, 25].map((n) => <button key={n} className={size.w === n && size.h === n ? 'on' : ''} onClick={() => { setSize({ w: n, h: n }); setS({ size: n }); }}>{n}×{n}</button>)}
              </div>
              <div className="bd-row">
                <label>Breite {size.w}<input type="range" min={5} max={30} value={size.w} onChange={(e) => setSize({ ...size, w: +e.target.value })} /></label>
                <label>Höhe {size.h}<input type="range" min={5} max={30} value={size.h} onChange={(e) => setSize({ ...size, h: +e.target.value })} /></label>
              </div>
              <div className="bd-row">
                {(['leicht', 'mittel', 'schwer'] as const).map((d) => <button key={d} className={S.diff === d ? 'on' : ''} onClick={() => setS({ diff: d })}>{d[0].toUpperCase() + d.slice(1)}</button>)}
              </div>
              <button className="bd-primary" onClick={() => startRandom(size.w, size.h, S.diff)}>Würfeln</button>
            </section>
          )}
          {tab === 'eigene' && (
            <section className="bd-card">
              <h2>Eigene Bilder</h2>
              <div className="bd-row">
                <button className="bd-primary" onClick={() => { setEditing({ w: 10, h: 10, bits: new Uint8Array(100), name: 'Eigenes Bild' }); setView('editor'); }}>Neues Bild zeichnen</button>
              </div>
              {data.custom.length === 0 ? <p className="bd-note">Noch nichts gespeichert. Zeichne ein Bild oder lade ein Foto – daraus wird ein Rätsel.</p> : (
                <ul className="bd-list">{data.custom.map((c) => {
                  const d = decodeNono(c.code);
                  return d ? (
                    <li key={c.id}>
                      <span><b>{c.name}</b> <small>{d.w}×{d.h}</small></span>
                      <button onClick={() => startGame({ w: d.w, h: d.h, bits: bitsToString(d.bits), name: 'Eigenes: ' + c.name })}>Lösen</button>
                      <button onClick={() => { setEditing({ w: d.w, h: d.h, bits: d.bits, name: c.name, id: c.id }); setView('editor'); }}>Bearbeiten</button>
                      <button onClick={() => { if (confirm(`„${c.name}“ löschen?`)) upd((x) => { x.custom = x.custom.filter((y) => y.id !== c.id); }); }}>✕</button>
                    </li>
                  ) : null;
                })}</ul>
              )}
            </section>
          )}
          {tab === 'code' && (
            <section className="bd-card">
              <h2>Code laden</h2>
              <p className="bd-note">Rätsel-Codes kannst du im Zeichenmodus kopieren und anderen schicken.</p>
              <textarea rows={3} value={codeText} onChange={(e) => setCodeText(e.target.value)} spellCheck={false} placeholder="Code einfügen …" />
              <button className="bd-primary" onClick={() => { const d = decodeNono(codeText); if (!d) { toast('Code nicht lesbar'); return; } startGame({ w: d.w, h: d.h, bits: bitsToString(d.bits), name: 'Code-Rätsel' }); }}>Rätsel starten</button>
            </section>
          )}
          {game && <p><button className="bd-link" onClick={() => setView('spiel')}>Zurück zum laufenden Rätsel</button></p>}
        </main>
      )}

      {view === 'schule' && (
        <main className="bd-menu">
          <h2 className="bd-h2">Schule</h2>
          <p className="bd-note">Sechs kurze Lektionen mit Übungsrätseln. Der Knopf „Hinweis“ erklärt dir jederzeit, wo etwas sicher ist.</p>
          <div className="bd-lessons">
            {BLESSONS.map((l, i) => (
              <button key={l.id} className={data.lessons[l.id] ? 'done' : ''} onClick={() => startGame({ w: l.w, h: l.h, bits: bitsToString(l.art.join('').split('').map((c) => (c === '#' ? 1 : 0))), name: l.title, lesson: l.id })}>
                <span>{i + 1}</span><b>{l.title}</b><small>{l.tipp}</small><em>{data.lessons[l.id] ? '✓ geschafft' : `${l.w}×${l.h}`}</em>
              </button>
            ))}
          </div>
        </main>
      )}

      {view === 'statistik' && (
        <main className="bd-menu">
          <h2 className="bd-h2">Statistik</h2>
          <p className="bd-note">{statSolved} Rätsel gelöst · {Object.keys(data.pics).length} von {PICTURES.length} Bildern der Sammlung.</p>
          {Object.keys(data.stats).length === 0 ? <p>Noch nichts gelöst.</p> : (
            <table className="bd-table"><thead><tr><th>Größe</th><th>Gespielt</th><th>Gelöst</th><th>Bestzeit</th></tr></thead>
              <tbody>{Object.entries(data.stats).map(([k, s]) => <tr key={k}><td>{k}</td><td>{s.played}</td><td>{s.won}</td><td>{s.best ? fmtTime(s.best) : '–'}</td></tr>)}</tbody></table>
          )}
        </main>
      )}

      {view === 'spiel' && game && nono && sol && (
        <main className="bd-play">
          <section className="bd-stage" ref={wrap}>
            <div className="bd-bar">
              <b>{game.name}</b>
              <span>{S.showTimer ? fmtTime(secs) : '·'}</span>
              <span>{progress} %</span>
              <span>Fehler {game.mistakes}</span>
              {S.hardcore && <span>{'♥'.repeat(Math.max(0, game.lives))}</span>}
              <button className="bd-link" onClick={() => setPaused((p) => !p)}>{paused ? 'Weiter' : 'Pause'}</button>
            </div>
            <div className={'bd-canvaswrap' + (paused ? ' paused' : '')}>
              <NonoCanvas nono={nono} u={uRef.current} version={ver} cell={cell} theme={S.theme} sol={sol} wrong={wrongSet} hint={hint ? hint.h : null} won={!!won} colorWin={S.colorWin} ghost={ghost} cursor={cursor} rowDone={rowDone} colDone={colDone} disabled={paused || !!won} onStart={onStart} onMove={onMove} onEnd={onEnd} />
              {paused && <div className="bd-pause">Pause</div>}
            </div>
            {hint && <div className="bd-hint" role="status">{hint.stage === 1 ? `Hinweis 1/2: Schau dir ${hint.h.line === 'row' ? 'Zeile' : 'Spalte'} ${hint.h.index + 1} an – dort lässt sich etwas sicher bestimmen.` : `Hinweis 2/2: ${hint.text} Drücke „Hinweis“ noch einmal, um es einzutragen.`}</div>}
          </section>
          <aside className="bd-side">
            <div className="bd-tools">
              <button className={S.touchMode === 'fill' ? 'on' : ''} onClick={() => setS({ touchMode: 'fill' })} aria-pressed={S.touchMode === 'fill'}>■ Füllen</button>
              <button className={S.touchMode === 'cross' ? 'on' : ''} onClick={() => setS({ touchMode: 'cross' })} aria-pressed={S.touchMode === 'cross'}>✕ Kreuz</button>
              <button onClick={undo} disabled={!hist.current.length}>↶ Zurück</button>
              <button onClick={redo} disabled={!redoSt.current.length}>↷ Vor</button>
              <button onClick={doHint}>💡 Hinweis</button>
              {S.errors !== 'sofort' && <button onClick={checkErrors}>Prüfen</button>}
              <button onClick={() => { setView('logik'); setLogicStep(0); setAuto(false); }}>Lösungsweg</button>
              <button onClick={clearAll}>Leeren</button>
            </div>
            <div className="bd-opts">
              <h3>Optionen</h3>
              <div className="bd-seg">{THEMES.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}>{t.name}</button>)}</div>
              <div className="bd-seg">{([['sofort', 'Fehler sofort'], ['ende', 'Prüfen-Knopf'], ['aus', 'Ohne Prüfung']] as const).map(([v, l]) => <button key={v} className={S.errors === v ? 'on' : ''} onClick={() => setS({ errors: v })}>{l}</button>)}</div>
              <label><span>Hardcore (3 Leben)</span><input type="checkbox" checked={S.hardcore} onChange={(e) => setS({ hardcore: e.target.checked, errors: e.target.checked ? 'sofort' : S.errors })} /></label>
              <label><span>Fertige Zeilen automatisch kreuzen</span><input type="checkbox" checked={S.autoCross} onChange={(e) => setS({ autoCross: e.target.checked })} /></label>
              <label><span>Farbiges Siegerbild</span><input type="checkbox" checked={S.colorWin} onChange={(e) => setS({ colorWin: e.target.checked })} /></label>
              <label><span>Zeit anzeigen</span><input type="checkbox" checked={S.showTimer} onChange={(e) => setS({ showTimer: e.target.checked })} /></label>
              <label><span>Zellgröße {S.zoom}</span><input type="range" min={14} max={40} value={S.zoom} onChange={(e) => setS({ zoom: +e.target.value })} /></label>
            </div>
            <p className="bd-note">Links ziehen = füllen, Rechtsklick = Kreuz. Pfeile + Leertaste (füllen), X (Kreuz), H Hinweis, U zurück.</p>
          </aside>
        </main>
      )}

      {view === 'logik' && game && nono && logicData && logicBoard && (
        <main className="bd-play">
          <section className="bd-stage" ref={wrap}>
            <div className="bd-bar"><b>Lösungsweg: {game.name}</b><span>Schritt {Math.min(logicStep, logicData.steps.length)} / {logicData.steps.length}</span></div>
            <NonoCanvas nono={nono} u={logicBoard} version={logicStep} cell={cell} theme={S.theme} sol={null} wrong={new Set()} hint={logicStep > 0 && logicStep <= logicData.steps.length ? { line: logicData.steps[logicStep - 1].line, index: logicData.steps[logicStep - 1].index, fill: [], cross: [] } : null} won={false} colorWin={false} ghost={false} cursor={-1} rowDone={[]} colDone={[]} disabled onStart={() => {}} onMove={() => {}} onEnd={() => {}} />
            <div className="bd-hint">
              {logicStep === 0 ? 'Der Löser beginnt mit leerem Raster und arbeitet Zeilen und Spalten ab.' : logicStep <= logicData.steps.length ? `${logicData.steps[logicStep - 1].line === 'row' ? 'Zeile' : 'Spalte'} ${logicData.steps[logicStep - 1].index + 1} liefert ${logicData.steps[logicStep - 1].changed.length} neue Felder.` : 'Fertig.'}
              {logicData.status !== 'solved' && ' (Dieses Rätsel braucht mehr als reine Zeilenlogik.)'}
            </div>
          </section>
          <aside className="bd-side">
            <div className="bd-tools">
              <button onClick={() => { setAuto(false); setLogicStep((s) => Math.max(0, s - 1)); }}>◀ Zurück</button>
              <button onClick={() => { setAuto(false); setLogicStep((s) => Math.min(logicData.steps.length, s + 1)); }}>Weiter ▶</button>
              <button className={auto ? 'on' : ''} onClick={() => setAuto((a) => !a)}>{auto ? 'Stopp' : 'Automatisch'}</button>
              <button onClick={() => setLogicStep(0)}>Neu</button>
              <button onClick={() => { setAuto(false); setView('spiel'); }}>Zurück zum Rätsel</button>
            </div>
          </aside>
        </main>
      )}

      {won && (
        <div className="bd-modal" role="dialog" aria-label="Gelöst">
          <div className="bd-modal-box">
            <div className="bd-bars"><i className="r" /><i className="b" /><i className="y" /></div>
            <h2>{won.name}</h2>
            <p className="bd-big">{fmtTime(won.time)}</p>
            <p>{won.mistakes} Fehler · {won.hints} Hinweise{won.best ? ' · neue Bestzeit!' : ''}{won.helped ? ' · mit Hilfe (keine Wertung)' : ''}</p>
            <div className="bd-row">
              <button className="bd-primary" onClick={() => { setWon(null); setGame(null); setView('menu'); }}>Weiter</button>
              <button onClick={() => setWon(null)}>Bild ansehen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ art, colors }: { art: string[]; colors: string[] }) {
  const h = art.length, w = art[0].length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true">
      {art.flatMap((row, y) => row.split('').map((c, x) => {
        if (c !== '#') return null;
        const mb = Math.floor((x * 3) / w) + 3 * Math.floor((y * 3) / h);
        return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[[0, 3, 1, 3, 2, 3, 1, 3, 0][mb]]} />;
      }))}
    </svg>
  );
}
