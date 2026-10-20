import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import { useKeys, usePlaytime, useSecrets, useTicker } from '../shared/hooks';
import { newId } from '../shared/ids';
import { todayKey } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, fmtTime, markDaily, toast, useGameData } from '../shared/store';
import { LAGER_INIT, MODE_INFO, type LMode, type LSettings, type LSkin, type LStat } from './data';
import { type Dir, type GenParams, type Level, type State, deadBoxes, deadSquares, generateLevel, isSolved, parseXsb, planBoxMove, solve, step, toXsb, tryMove, walkPath } from './engine';
import LagerCanvas from './LagerCanvas';
import LagerEditor from './LagerEditor';
import { INTRO, PACKS, levelId, seedFor } from './levels';
import './lager.css';

type View = 'menu' | 'spiel' | 'editor';
interface Cur { id: string; name: string; level: Level; par: number }

// ───────── Erzeugung im Hintergrund ─────────
let worker: Worker | null = null;
let wid = 0;
const waiting = new Map<number, (r: { xsb: string; par: number } | null) => void>();
function genAsync(seed: string, params: GenParams): Promise<{ xsb: string; par: number }> {
  const sync = () => { const lv = generateLevel(seed, params, 3000); return { xsb: toXsb(lv), par: lv.par }; };
  try {
    if (!worker) {
      worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; res: { xsb: string; par: number } | null }>) => { waiting.get(e.data.id)?.(e.data.res); waiting.delete(e.data.id); };
      worker.onerror = () => { waiting.forEach((f) => f(null)); waiting.clear(); worker = null; };
    }
    const id = ++wid;
    return new Promise<{ xsb: string; par: number }>((res) => { waiting.set(id, (r) => res(r ?? sync())); worker!.postMessage({ id, seed, params }); });
  } catch { return Promise.resolve(sync()); }
}

const KEYDIR: Record<string, Dir> = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r', W: 'u', S: 'd', A: 'l', D: 'r' };
const SKINS: { id: LSkin; name: string }[] = [{ id: 'lager', name: 'Lagerhalle' }, { id: 'pixel', name: 'Pixel' }, { id: 'blau', name: 'Blaupause' }];

export default function Lager({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('lager');
  const [data, upd] = useGameData('lager', LAGER_INIT);
  const S: LSettings = { ...LAGER_INIT.settings, ...data.settings };
  const setS = (p: Partial<LSettings>) => upd((d) => { d.settings = { ...LAGER_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>('menu');
  const [cur, setCur] = useState<Cur | null>(null);
  const [st, setSt] = useState<State | null>(null);
  const [facing, setFacing] = useState<Dir>('d');
  const [log, setLog] = useState('');
  const hist = useRef<{ state: State; log: string }[]>([]);
  const redoSt = useRef<{ state: State; log: string }[]>([]);
  const [selected, setSelected] = useState(-1);
  const [hint, setHint] = useState<{ box: number; dir: Dir }[] | null>(null);
  const [busy, setBusy] = useState('');
  const [secs, setSecs] = useState(0);
  const timeRef = useRef(0);
  const [pull, setPull] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const flags = useRef({ undo: false, keys: false, helped: false });
  const queue = useRef<Dir[]>([]);
  const [solved, setSolved] = useState<null | { moves: number; pushes: number; time: number; stars: number; best: boolean; next: string | null }>(null);
  const [wrapW, setWrapW] = useState(900);
  const wrap = useRef<HTMLDivElement>(null);
  const [editorInit, setEditorInit] = useState<Level | null>(null);
  const [importText, setImportText] = useState('');
  const [tab, setTab] = useState<'pakete' | 'eigene' | 'import'>('pakete');
  const [warned, setWarned] = useState(false);

  const level = cur?.level ?? null;
  const dead = useMemo(() => (level ? deadSquares(level) : new Uint8Array(0)), [level]);
  const deadSet = useMemo(() => { const s = new Set<number>(); dead.forEach((v, i) => { if (v) s.add(i); }); return s; }, [dead]);
  const stuck = useMemo(() => (level && st ? deadBoxes(level, st, dead) : []), [level, st, dead]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el); setWrapW(el.clientWidth);
    return () => ro.disconnect();
  }, [view]);
  const cell = level ? Math.max(20, Math.min(S.zoom, Math.floor((wrapW - 30) / level.w), Math.floor((window.innerHeight - 220) / level.h))) : S.zoom;

  useTicker(!!cur && !solved && view === 'spiel', (dt) => { timeRef.current += dt / 1000; setSecs(Math.floor(timeRef.current)); }, 500);

  const counts = useMemo(() => ({ moves: log.length, pushes: log.replace(/[a-z]/g, '').length }), [log]);

  // ───── Level laden ─────
  const startLevel = useCallback((id: string, name: string, xsb: string, par: number, resume?: { moves: string; time: number }) => {
    const l = parseXsb(xsb, name);
    if (!l) { toast('Level konnte nicht gelesen werden'); return; }
    queue.current = [];
    hist.current = []; redoSt.current = [];
    flags.current = { undo: false, keys: false, helped: false };
    let state: State = { player: l.player, boxes: l.boxes.slice() };
    let lg = '';
    if (resume) for (const ch of resume.moves) { const r = tryMove(l, state, ch.toLowerCase() as Dir, S.mode === 'zieher'); if (!r) break; hist.current.push({ state, log: lg }); state = r.state; lg += ch; }
    timeRef.current = resume?.time ?? 0; setSecs(Math.floor(timeRef.current));
    setCur({ id, name, level: l, par }); setSt(state); setLog(lg); setSelected(-1); setHint(null); setSolved(null); setWarned(false); setView('spiel');
  }, [S.mode]);

  const openById = useCallback(async (id: string) => {
    const [pk, nStr] = id.split('-');
    const n = +nStr - 1;
    if (pk === 'i') { const lv = INTRO[n]; const l = parseXsb(lv.xsb)!; const sol = solve(l, undefined, { maxMs: 2000 }); startLevel(id, lv.name, lv.xsb, sol?.pushes ?? 0); return; }
    if (pk === 'c') { const c = data.custom.find((x) => x.id === nStr || x.id === id.slice(2)); if (c) { const l = parseXsb(c.xsb)!; const sol = solve(l, undefined, { maxMs: 2500 }); startLevel(id, c.name, c.xsb, sol?.pushes ?? 0); } return; }
    const pack = PACKS.find((p) => p.id === pk);
    if (!pack) return;
    const cached = data.cache[id];
    if (cached) { startLevel(id, `${pack.name.split(' – ')[0]} · ${n + 1}`, cached.xsb, cached.par); return; }
    setBusy(`${pack.name.split(' – ')[0]} · ${n + 1} wird eingerichtet …`);
    const r = await genAsync(seedFor(pk, n), pack.params(n));
    upd((d) => { d.cache = { ...d.cache, [id]: r }; });
    setBusy('');
    startLevel(id, `${pack.name.split(' – ')[0]} · ${n + 1}`, r.xsb, r.par);
  }, [data.cache, data.custom, startLevel, upd]);

  const startDaily = useCallback(async () => {
    setBusy('Tageslevel wird eingerichtet …');
    const r = await genAsync(`lager|tag|${todayKey()}`, { w: 8, h: 8, boxes: 3, pulls: 38, walls: 0.1, minPushes: 12 });
    setBusy('');
    startLevel(`d-${todayKey()}`, 'Tageslevel', r.xsb, r.par);
  }, [startLevel]);
  useEffect(() => { if (daily) void startDaily(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fortsetzen
  useEffect(() => {
    const c = data.current;
    if (c && !cur) startLevel(c.id, c.name, c.xsb, c.par, { moves: c.moves, time: c.time });
    else if (!c) setView('menu');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cur || solved || !st) return;
    const id = setTimeout(() => upd((d) => { d.current = { id: cur.id, name: cur.name, xsb: toXsb(cur.level), par: cur.par, moves: log, time: timeRef.current, mode: S.mode, helped: flags.current.helped }; }), 500);
    return () => clearTimeout(id);
  }, [log]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── Zug ─────
  const doMove = useCallback((d: Dir, byKey = false): boolean => {
    if (!cur || !st || solved) return false;
    const usePull = S.mode === 'zieher' && (pull || shiftHeld);
    const r = tryMove(cur.level, st, d, usePull);
    setFacing(d);
    if (!r) { sfx('tick'); return false; }
    if (byKey) flags.current.keys = true;
    hist.current.push({ state: st, log });
    redoSt.current = [];
    const ch = r.push || r.pull ? d.toUpperCase() : d;
    const nl = log + ch;
    setSt(r.state); setLog(nl); setHint(null); setSelected(-1);
    sfx(r.push || r.pull ? 'drop' : 'tick');
    if (isSolved(cur.level, r.state)) finish(nl);
    else if (!warned && S.showDead && deadBoxes(cur.level, r.state, dead).length) { setWarned(true); toast('Sackgasse! Eine Kiste kann nie mehr ins Ziel – mit „Zurück“ rückgängig machen.'); }
    return true;
  }, [cur, st, solved, S.mode, S.showDead, pull, shiftHeld, log, warned, dead]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = () => {
    const h = hist.current.pop();
    if (!h || !st || solved) return;
    redoSt.current.push({ state: st, log });
    setSt(h.state); setLog(h.log); setHint(null); setSelected(-1);
    flags.current.undo = true; sfx('erase');
  };
  const redo = () => {
    const h = redoSt.current.pop();
    if (!h || !st || solved) return;
    hist.current.push({ state: st, log });
    setSt(h.state); setLog(h.log);
  };
  const restart = () => { if (!cur) return; queue.current = []; startLevel(cur.id, cur.name, toXsb(cur.level), cur.par); };

  // Warteschlange (Klick-Wege, Lösung abspielen)
  useEffect(() => {
    if (!cur || solved) return;
    const id = setInterval(() => { const d = queue.current.shift(); if (d) doMove(d); }, 85);
    return () => clearInterval(id);
  }, [cur, solved, doMove]);

  const finish = (finalLog: string) => {
    if (!cur) return;
    const pushes = finalLog.replace(/[a-z]/g, '').length, moves = finalLog.length;
    const secsT = Math.round(timeRef.current);
    const par = cur.par;
    const stars = !par || flags.current.helped ? 1 : pushes <= par ? 3 : pushes <= Math.ceil(par * 1.3) + 1 ? 2 : 1;
    const prevBest: LStat | undefined = data.levels[cur.id];
    const better = !prevBest || pushes < prevBest.pushes || (pushes === prevBest.pushes && moves < prevBest.moves);
    upd((d) => {
      const old = d.levels[cur.id];
      d.levels = { ...d.levels, [cur.id]: better || !old ? { moves, pushes, time: secsT, stars: Math.max(stars, old?.stars ?? 0) } : { ...old, stars: Math.max(stars, old.stars) } };
      d.totals = { levels: d.totals.levels + (old ? 0 : 1), pushes: d.totals.pushes + pushes };
      d.current = null;
    });
    sfx('win');
    // nächstes Level
    let next: string | null = null;
    const [pk, nStr] = cur.id.split('-');
    const n = +nStr;
    if (pk === 'i') next = n < INTRO.length ? levelId.intro(n) : levelId.pack('p1', 0);
    else { const p = PACKS.find((x) => x.id === pk); if (p) next = n < p.count ? levelId.pack(pk, n) : null; }
    setSolved({ moves, pushes, time: secsT, stars, best: better, next });
    // Erfolge
    achieve('lager', 'first');
    const total = Object.keys(data.levels).length + (data.levels[cur.id] ? 0 : 1);
    if (total >= 10) achieve('lager', 'zehn');
    if (stars === 3 && par) achieve('lager', 'dreisterne');
    if (!flags.current.undo && pk !== 'i' && pk !== 'c') achieve('lager', 'ohneundo');
    if (S.mode === 'zieher') achieve('lager', 'zieher');
    if (S.mode === 'nebel') achieve('lager', 'nebel');
    if (pk === 'c') achieve('lager', 'editor');
    if (pk === 'd') { achieve('lager', 'daily'); markDaily('lager', 'tag'); }
    if (!flags.current.keys && moves > 4) achieve('lager', 'klick');
    if (pk === 'i' && INTRO.every((_, i) => data.levels[levelId.intro(i)] || levelId.intro(i) === cur.id)) achieve('lager', 'intro');
    if (pk === 'p1' && Array.from({ length: PACKS[0].count }, (_, i) => levelId.pack('p1', i)).every((x) => data.levels[x] || x === cur.id)) achieve('lager', 'paket1');
  };

  // ───── Klicks & Wischen ─────
  const onCell = (i: number) => {
    if (!cur || !st || solved) return;
    queue.current = [];
    if (st.boxes.includes(i)) { setSelected(selected === i ? -1 : i); return; }
    if (selected >= 0) {
      const plan = planBoxMove(cur.level, st, selected, i);
      if (plan) { queue.current = plan.slice(); setSelected(-1); return; }
      toast('Dorthin lässt sich diese Kiste nicht schieben.');
      setSelected(-1);
      return;
    }
    const path = walkPath(cur.level, st, i);
    if (path) queue.current = path.slice(); else sfx('bad');
  };

  // ───── Hinweis ─────
  const pushList = (l: Level, from: State, moves: string, max: number) => {
    const out: { box: number; dir: Dir }[] = [];
    let s = from;
    for (const ch of moves) {
      const d = ch.toLowerCase() as Dir;
      if (ch !== ch.toLowerCase()) { out.push({ box: step(l, s.player, d), dir: d }); if (out.length >= max) break; }
      s = tryMove(l, s, d)!.state;
    }
    return out;
  };
  const doHint = (max = 1) => {
    if (!cur || !st || solved) return;
    if (S.mode === 'zieher') { toast('Im Zieher-Modus gibt es keine Löser-Hinweise.'); return; }
    setBusy('Der Löser denkt nach …');
    window.setTimeout(() => {
      const s = solve(cur.level, st, { maxMs: 3000, maxNodes: 300000 });
      setBusy('');
      if (!s) { toast('Von hier aus finde ich keine Lösung – geh ein Stück zurück.'); return; }
      flags.current.helped = true;
      setHint(pushList(cur.level, st, s.moves, max));
    }, 15);
  };
  const autoSolve = () => {
    if (!cur || !st || solved) return;
    setBusy('Der Löser denkt nach …');
    window.setTimeout(() => {
      const s = solve(cur.level, st, { maxMs: 4000, maxNodes: 400000 });
      setBusy('');
      if (!s) { toast('Keine Lösung gefunden.'); return; }
      flags.current.helped = true;
      queue.current = s.moves.toLowerCase().split('') as Dir[];
    }, 15);
  };

  // ───── Tastatur ─────
  useKeys((e) => {
    if (e.key === 'Shift') setShiftHeld(true);
    if (view !== 'spiel') return;
    const d = KEYDIR[e.key];
    if (d) { e.preventDefault(); queue.current = []; doMove(d, true); return; }
    switch (e.key) {
      case 'z': case 'Z': case 'u': case 'U': case 'Backspace': e.preventDefault(); return undo();
      case 'y': case 'Y': return redo();
      case 'r': case 'R': return restart();
      case 'h': case 'H': return doHint();
      case 'n': case 'N': if (solved?.next) void openById(solved.next); return;
    }
  }, [view, cur, st, log, solved, S.mode, pull, shiftHeld, warned]);
  useEffect(() => {
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    window.addEventListener('keyup', up);
    return () => window.removeEventListener('keyup', up);
  }, []);

  // ───── Geheimnisse ─────
  useSecrets('lager', {
    'lager-ghost': () => doHint(3),
    'lager-stapler': () => { const o = SKINS.map((s) => s.id); setS({ skin: o[(o.indexOf(S.skin) + 1) % o.length] }); },
    'lager-feierabend': autoSolve,
  });

  // ───── Import ─────
  const importLevels = () => {
    const blocks = importText.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => !/^\s*(;|title|author|comment)/i.test(l)).join('\n'));
    let n = 0;
    for (const b of blocks) {
      const l = parseXsb(b);
      if (l) { n++; upd((d) => { d.custom = [{ id: newId(), name: `Import ${d.custom.length + 1}`, xsb: toXsb(l) }, ...d.custom]; }); }
    }
    if (n) { toast(`${n} Level geladen`); achieve('lager', 'import'); setImportText(''); setTab('eigene'); } else toast('Kein gültiges Level gefunden');
  };

  const stars = (id: string) => data.levels[id]?.stars ?? 0;
  const Stars = ({ n }: { n: number }) => <span className="lg-stars">{[1, 2, 3].map((k) => <i key={k} className={k <= n ? 'on' : ''}>★</i>)}</span>;

  const header = (
    <header className="lg-head">
      <div className="lg-tape" aria-hidden="true" />
      <div className="lg-title">
        <h1>Lagerhaus</h1>
        <span>{cur && view === 'spiel' ? cur.name : 'Kisten schieben'}</span>
      </div>
      <nav>
        <button onClick={() => setView('menu')} className={view === 'menu' ? 'on' : ''}>Level</button>
        <button onClick={() => void startDaily()} className={dailyDone('lager', 'tag') ? 'done' : ''}>Tageslevel{dailyDone('lager', 'tag') ? ' ✓' : ''}</button>
        <button onClick={() => { setEditorInit(null); setView('editor'); }} className={view === 'editor' ? 'on' : ''}>Editor</button>
        <button className="x" onClick={onExit} aria-label="Zurück zur Halle">✕</button>
      </nav>
    </header>
  );

  return (
    <div className="lg" data-skin={S.skin}>
      {header}
      {busy && <div className="lg-busy" role="status">{busy}</div>}

      {view === 'menu' && (
        <main className="lg-menu">
          <div className="lg-tabs" role="tablist">
            {([['pakete', 'Pakete'], ['eigene', `Eigene (${data.custom.length})`], ['import', 'Import']] as const).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}
          </div>
          {tab === 'pakete' && (
            <>
              <section className="lg-pack">
                <h2>Einführung <small>8 Level mit Erklärungen im Spiel</small></h2>
                <div className="lg-levels">{INTRO.map((l, i) => { const id = levelId.intro(i); return <button key={id} onClick={() => void openById(id)}><b>{i + 1}</b><small>{l.name}</small><Stars n={stars(id)} /></button>; })}</div>
              </section>
              {PACKS.map((p) => (
                <section className="lg-pack" key={p.id}>
                  <h2>{p.name} <small>{p.info}</small></h2>
                  <div className="lg-levels">{Array.from({ length: p.count }, (_, i) => { const id = levelId.pack(p.id, i); const s = data.levels[id]; return <button key={id} onClick={() => void openById(id)}><b>{i + 1}</b><small>{s ? `${s.pushes} Schübe` : data.cache[id] ? `Par ${data.cache[id].par}` : '—'}</small><Stars n={stars(id)} /></button>; })}</div>
                </section>
              ))}
            </>
          )}
          {tab === 'eigene' && (
            <section className="lg-pack">
              <h2>Eigene Level</h2>
              {data.custom.length === 0 ? <p className="lg-small">Noch keine. Baue im Editor eines oder importiere Level im Standardformat.</p> : (
                <ul className="lg-list">{data.custom.map((c) => (
                  <li key={c.id}>
                    <span><b>{c.name}</b> <Stars n={stars('c-' + c.id)} /></span>
                    <button onClick={() => { const l = parseXsb(c.xsb)!; startLevel('c-' + c.id, c.name, c.xsb, solve(l, undefined, { maxMs: 2500 })?.pushes ?? 0); }}>Spielen</button>
                    <button onClick={() => { setEditorInit(parseXsb(c.xsb)); setView('editor'); }}>Bearbeiten</button>
                    <button onClick={() => { if (confirm(`„${c.name}“ löschen?`)) upd((d) => { d.custom = d.custom.filter((x) => x.id !== c.id); }); }}>✕</button>
                  </li>
                ))}</ul>
              )}
            </section>
          )}
          {tab === 'import' && (
            <section className="lg-pack">
              <h2>Level importieren</h2>
              <p className="lg-small">Füge Level im Standardformat (XSB) ein – mehrere Level durch eine Leerzeile trennen. Zeichen: <code>#</code> Wand, <code>@</code> Spieler, <code>$</code> Kiste, <code>.</code> Ziel, <code>*</code> Kiste auf Ziel, <code>+</code> Spieler auf Ziel.</p>
              <textarea rows={10} value={importText} onChange={(e) => setImportText(e.target.value)} spellCheck={false} placeholder={'#####\n#@$.#\n#####'} />
              <div className="lg-btns"><button className="lg-primary" onClick={importLevels}>Importieren</button></div>
            </section>
          )}
          {cur && <p><button className="lg-link" onClick={() => setView('spiel')}>Zurück zum laufenden Level</button></p>}
        </main>
      )}

      {view === 'editor' && (
        <LagerEditor key={editorInit ? 'e' + toXsb(editorInit) : 'new'} init={editorInit}
          onPlay={(xsb, name) => { const l = parseXsb(xsb)!; startLevel('c-' + newId(), name, xsb, solve(l, undefined, { maxMs: 2500 })?.pushes ?? 0); }}
          onSave={(xsb, name) => upd((d) => { d.custom = [{ id: newId(), name, xsb }, ...d.custom]; })} />
      )}

      {view === 'spiel' && cur && st && level && (
        <main className="lg-play">
          <section className="lg-stage" ref={wrap}>
            <div className="lg-bar">
              <b>{cur.name}</b>
              <span>Schritte {counts.moves}</span>
              <span>Schübe {counts.pushes}{cur.par ? ` / Par ${cur.par}` : ''}</span>
              <span>{fmtTime(secs)}</span>
              {S.mode !== 'klassisch' && <span className="lg-mode">{MODE_INFO[S.mode].name}</span>}
            </div>
            <div className="lg-canvaswrap">
              <LagerCanvas level={level} state={st} cell={cell} skin={S.skin} facing={facing} animate={S.animate} selected={selected} hint={hint} dead={deadSet} fog={S.mode === 'nebel'} showDead={S.showDead && S.mode !== 'nebel'} onCell={onCell} onSwipe={(d) => { queue.current = []; doMove(d, true); }} />
            </div>
            {stuck.length > 0 && S.showDead && <div className="lg-note bad">Sackgasse: {stuck.length === 1 ? 'Eine Kiste kann' : `${stuck.length} Kisten können`} nie mehr ins Ziel. Mit „Zurück“ korrigieren.</div>}
            {cur.id === 'i-1' && <div className="lg-note">So geht’s: Laufe mit den Pfeiltasten (oder WASD) gegen die Kiste, um sie zu schieben. Alle Kisten müssen auf ein gelbes Zielfeld.</div>}
            {cur.id === 'i-2' && <div className="lg-note">Kisten kann man nur schieben, nicht ziehen. Gehe erst auf die richtige Seite der Kiste.</div>}
            {cur.id === 'i-3' && <div className="lg-note">Tipp: Klicke eine Kiste an und dann ein Zielfeld – der Spieler plant den Weg selbst.</div>}
          </section>
          <aside className="lg-side">
            <div className="lg-btns">
              <button onClick={undo} disabled={!hist.current.length}>↶ Zurück</button>
              <button onClick={redo} disabled={!redoSt.current.length}>↷ Vor</button>
              <button onClick={restart}>⟲ Neu</button>
              <button onClick={() => doHint()}>💡 Hinweis</button>
              <button onClick={autoSolve}>▶ Lösung zeigen</button>
              {S.mode === 'zieher' && <button className={pull ? 'on' : ''} onClick={() => setPull((p) => !p)}>Ziehen {pull || shiftHeld ? 'an' : 'aus'}</button>}
            </div>
            <div className="lg-box">
              <h3>Modus</h3>
              <div className="lg-seg">{(Object.keys(MODE_INFO) as LMode[]).map((m) => <button key={m} className={S.mode === m ? 'on' : ''} onClick={() => { setS({ mode: m }); if (cur) startLevel(cur.id, cur.name, toXsb(cur.level), cur.par); }}>{MODE_INFO[m].name}</button>)}</div>
              <p className="lg-small">{MODE_INFO[S.mode].info}</p>
              <h3>Design</h3>
              <div className="lg-seg">{SKINS.map((s) => <button key={s.id} className={S.skin === s.id ? 'on' : ''} onClick={() => setS({ skin: s.id })}>{s.name}</button>)}</div>
              <label><span>Bewegung animieren</span><input type="checkbox" checked={S.animate} onChange={(e) => setS({ animate: e.target.checked })} /></label>
              <label><span>Sackgassen anzeigen</span><input type="checkbox" checked={S.showDead} onChange={(e) => setS({ showDead: e.target.checked })} /></label>
              <label><span>Größe {S.zoom}</span><input type="range" min={28} max={72} value={S.zoom} onChange={(e) => setS({ zoom: +e.target.value })} /></label>
            </div>
            <p className="lg-small">Pfeile/WASD laufen · Z zurück · Y vor · R neu · H Hinweis · N nächstes Level · Klick auf Kiste dann Ziel = schieben · Klick auf Boden = hinlaufen.</p>
          </aside>
        </main>
      )}

      {solved && cur && (
        <div className="lg-modal" role="dialog" aria-label="Level geschafft">
          <div className="lg-modal-box">
            <div className="lg-tape" aria-hidden="true" />
            <h2>Level geschafft!</h2>
            <Stars n={solved.stars} />
            <p className="lg-big">{solved.pushes} Schübe</p>
            <p>{solved.moves} Schritte · {fmtTime(solved.time)}{cur.par ? ` · Par ${cur.par}` : ''}{solved.best ? ' · Neuer Rekord!' : ''}{flags.current.helped ? ' · mit Hilfe (höchstens 1 Stern)' : ''}</p>
            <div className="lg-btns center">
              {solved.next && <button className="lg-primary" onClick={() => void openById(solved.next!)}>Nächstes Level ↵</button>}
              <button onClick={restart}>Nochmal</button>
              <button onClick={() => { setSolved(null); setCur(null); setView('menu'); }}>Zur Auswahl</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
