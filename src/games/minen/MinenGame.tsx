import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useKeys, usePlaytime, useSecrets, useTicker } from '../shared/hooks';
import { dailySeed, freshSeed, todayKey } from '../shared/rng';
import { achieve, fmtTime, fmtTimeMs, markDaily, toast, useGameData } from '../shared/store';
import { sfx } from '../shared/sfx';
import { Face, Led, type FaceKind } from './Led';
import MineCanvas, { type Overlay } from './MineCanvas';
import MinenLessons from './MinenLessons';
import ReplayView from './ReplayView';
import { MINEN_INIT, MODE_INFO, type Mode, type MSettings, type Replay, cfgKey, cfgLabel } from './data';
import { type Board, type Cfg, FLAG, HIDDEN, OPEN, PRESETS, QUEST, type Topo, bbbv, chord, finishWin, isWon, layMines, maxMines, newBoard, reveal, toggleFlag } from './engine';
import { generate, type GenOpts, type GenResult } from './gen';
import { deduce, explain, probabilities, viewOf } from './solve';
import { mulberry32 } from '../shared/rng';
import './minen.css';

type Phase = 'ready' | 'generating' | 'play' | 'won' | 'lost';
type Dialog = null | 'stats' | 'custom' | 'replays' | 'help' | 'lessons';

interface Snap { st: Uint8Array; opened: number; flags: number; status: Board['status']; boom: number; lives: number }

// ───────── Erzeugung im Hintergrund ─────────
let worker: Worker | null = null;
let workerId = 0;
const pending = new Map<number, (r: GenResult | null) => void>();
function genAsync(cfg: Cfg, first: number, seed: number, opts: GenOpts): Promise<GenResult> {
  const sync = () => generate(cfg, first, mulberry32(seed), opts);
  if (!opts.noGuess) return Promise.resolve(sync());
  try {
    if (!worker) {
      worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; res: GenResult | null }>) => { pending.get(e.data.id)?.(e.data.res); pending.delete(e.data.id); };
      worker.onerror = () => { pending.forEach((f) => f(null)); pending.clear(); worker = null; };
    }
    const id = ++workerId;
    return new Promise<GenResult>((resolve) => {
      pending.set(id, (r) => resolve(r ?? sync()));
      worker!.postMessage({ id, cfg, first, seed, opts });
    });
  } catch { return Promise.resolve(sync()); }
}

const ZOOMS = [18, 22, 26, 32, 40];
const MIN_CELL = 15;

export default function Minen({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('minen');
  const [data, upd] = useGameData('minen', MINEN_INIT);
  const S: MSettings = { ...MINEN_INIT.settings, ...data.settings };
  const setS = (p: Partial<MSettings>) => upd((d) => { d.settings = { ...MINEN_INIT.settings, ...d.settings, ...p }; });

  const bref = useRef<Board>(newBoard(S.cfg, S.mode === 'leben' ? 3 : 0));
  const [ver, setVer] = useState(0);
  const bump = () => setVer((v) => v + 1);
  const g = useRef({ phase: 'ready' as Phase, t0: 0, ms: 0, ev: [] as [number, number, number][], flagsUsed: 0, clicks: 0, help: false, lives: 3, undo: [] as Snap[], mines: [] as number[], bbbv: 0, note: '' });
  const [secs, setSecs] = useState(0);
  const [face, setFace] = useState<FaceKind>('smile');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [hint, setHint] = useState<{ text: string; safe: number[]; mine: number[] } | null>(null);
  const [probOn, setProbOn] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());
  const [hov, setHov] = useState(-1);
  const [xray, setXray] = useState(false);
  const [plugh, setPlugh] = useState(false);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [wrapW, setWrapW] = useState(900);
  const wrap = useRef<HTMLDivElement>(null);
  const mouse = useRef({ armed: false, skip: false });
  const longT = useRef<number | undefined>(undefined);
  const longFired = useRef(false);
  const [msg, setMsg] = useState('');

  const b = bref.current;
  const phase = g.current.phase;
  const mode = S.mode;

  // ───── Größe an Platz anpassen ─────
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el);
    setWrapW(el.clientWidth);
    return () => ro.disconnect();
  }, [dialog, replay]);
  const widthUnits = b.cfg.topo === 'hex' ? b.cfg.w + 0.5 : b.cfg.w;
  const size = Math.max(MIN_CELL, Math.min(S.zoom, Math.floor((wrapW - 40) / widthUnits)));

  // ───── Uhr ─────
  useTicker(phase === 'play' && mode !== 'zen', () => setSecs(Math.min(999, Math.floor((performance.now() - g.current.t0) / 1000))), 200);

  // ───── Neues Spiel ─────
  const newGame = useCallback((over?: Partial<MSettings>) => {
    const s = { ...S, ...over };
    if (over) setS(over);
    const bb = newBoard(s.cfg, s.mode === 'leben' ? 3 : 0);
    bref.current = bb;
    g.current = { phase: 'ready', t0: 0, ms: 0, ev: [], flagsUsed: 0, clicks: 0, help: false, lives: 3, undo: [], mines: [], bbbv: 0, note: '' };
    setSecs(0); setFace('smile'); setHint(null); setProbOn(false); setMsg(''); setCursor(-1); setPressed(new Set());
    bump();
    if (s.mode === 'tagesfeld') {
      // Tagesfeld: Mitte ist vorgegeben
      const c = Math.floor(s.cfg.h / 2) * s.cfg.w + Math.floor(s.cfg.w / 2);
      window.setTimeout(() => void begin(c, s, true), 0);
    }
  }, [S]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (daily) newGame({ mode: 'tagesfeld' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rec = (code: number, idx: number) => { const gg = g.current; if (gg.t0) gg.ev.push([Math.round(performance.now() - gg.t0), code, idx]); };
  const pushUndo = () => {
    if (mode !== 'training') return;
    const bb = bref.current;
    g.current.undo.push({ st: bb.st.slice(), opened: bb.opened, flags: bb.flags, status: bb.status, boom: bb.boom, lives: g.current.lives });
    if (g.current.undo.length > 400) g.current.undo.shift();
  };
  const undo = () => {
    const u = g.current.undo.pop();
    if (!u || g.current.phase === 'ready') return;
    const bb = bref.current;
    bb.st.set(u.st); bb.opened = u.opened; bb.flags = u.flags; bb.status = u.status; bb.boom = u.boom; g.current.lives = u.lives;
    g.current.phase = 'play'; setFace('smile'); setHint(null); bump();
  };

  // ───── Spielstart (erster Klick) ─────
  async function begin(i: number, s: MSettings, daily = false) {
    const gg = g.current;
    if (gg.phase !== 'ready') return;
    gg.phase = 'generating';
    setMsg(s.noGuess ? 'Erzeuge ein Feld ohne Raten …' : '');
    bump();
    const seed = daily ? dailySeed('minen', cfgKey(s.cfg, s.mode, s.noGuess)) : freshSeed();
    const res = await genAsync(bref.current.cfg, i, seed, { noGuess: s.noGuess, opening: s.opening || daily, budgetMs: s.cfg.w * s.cfg.h > 300 ? 5500 : 3500 });
    const bb = bref.current;
    layMines(bb, res.mines);
    gg.mines = res.mines;
    gg.bbbv = bbbv(bb);
    gg.t0 = performance.now();
    gg.phase = 'play';
    setMsg(s.noGuess && !res.guessFree ? `Fast ohne Raten: ${res.left} Felder brauchen vielleicht einen Tipp.` : '');
    if (daily) setMsg('Tagesfeld: ' + todayKey());
    open(i, true);
  }

  // ───── Aktionen ─────
  const lose = (boomAt: number) => {
    const bb = bref.current, gg = g.current;
    bb.status = 'lost'; bb.boom = boomAt;
    gg.ms = performance.now() - gg.t0; gg.phase = 'lost';
    setFace('dead'); sfx('boom'); finalize(false); bump();
  };
  const win = () => {
    const bb = bref.current, gg = g.current;
    finishWin(bb);
    gg.ms = performance.now() - gg.t0; gg.phase = 'won';
    setFace('cool'); sfx('win'); finalize(true); bump();
  };
  const afterReveal = (booms: number[]) => {
    const bb = bref.current, gg = g.current;
    if (booms.length) {
      if (mode === 'leben') {
        for (const m of booms) { bb.st[m] = FLAG; bb.flags++; bb.boom = -1; gg.lives--; }
        sfx('boom'); toast(gg.lives > 0 ? `Mine! Noch ${gg.lives} ${gg.lives === 1 ? 'Leben' : 'Leben'}.` : 'Kein Leben mehr!');
        if (gg.lives <= 0) return lose(booms[0]);
      } else return lose(booms[0]);
    }
    if (isWon(bb)) return win();
    bump();
  };
  function open(i: number, force = false) {
    const bb = bref.current, gg = g.current;
    if (gg.phase === 'ready') { void begin(i, S); return; }
    if (gg.phase !== 'play' && !force) return;
    if (bb.st[i] !== HIDDEN && bb.st[i] !== QUEST) return;
    pushUndo(); rec(0, i); gg.clicks++;
    const r = reveal(bb, i);
    if (!r.boom && r.opened.length) sfx('tick');
    afterReveal(r.boom ? [i] : []);
    setHint(null);
  }
  function doChord(i: number) {
    const bb = bref.current, gg = g.current;
    if (gg.phase !== 'play' || bb.st[i] !== OPEN) return;
    pushUndo(); rec(2, i);
    const r = chord(bb, i);
    if (r.opened.length || r.boom.length) { gg.clicks++; sfx('tick'); afterReveal(r.boom); setHint(null); }
  }
  function flag(i: number) {
    const bb = bref.current, gg = g.current;
    if (gg.phase !== 'play' || mode === 'ohneflaggen') return;
    if (bb.st[i] === OPEN) return;
    pushUndo();
    const before = bb.st[i];
    const after = toggleFlag(bb, i, S.question);
    rec(after === QUEST ? 3 : 1, i);
    if (after === FLAG || before === FLAG) gg.flagsUsed++;
    sfx('flag'); bump();
  }

  // ───── Auswertung ─────
  function finalize(won: boolean) {
    const gg = g.current, bb = bref.current;
    const ms = gg.ms;
    const key = cfgKey(bb.cfg, mode, S.noGuess);
    const ranked = won && !gg.help && (mode === 'klassisch' || mode === 'ohneflaggen');
    const rp: Replay = { id: String(Date.now()), date: Date.now(), cfg: bb.cfg, mines: gg.mines, ev: gg.ev.slice(0, 6000), time: ms, won, bbbv: gg.bbbv, mode };
    upd((d) => {
      const st = d.stats[key] ?? { played: 0, won: 0, streak: 0 };
      st.played++; if (won) { st.won++; st.streak++; } else st.streak = 0;
      d.stats = { ...d.stats, [key]: st };
      if (ranked) d.best = { ...d.best, [key]: [...(d.best[key] ?? []), Math.round(ms)].sort((a, c) => a - c).slice(0, 5) };
      d.totals = { ...d.totals, games: d.totals.games + 1, wins: d.totals.wins + (won ? 1 : 0), streak: won ? d.totals.streak + 1 : 0 };
      d.totals.bestStreak = Math.max(d.totals.bestStreak, d.totals.streak);
      if (won && gg.flagsUsed === 0) d.totals.flagless++;
      if (!gg.help && mode !== 'training') d.replays = [rp, ...d.replays].slice(0, 8);
    });
    if (!won) return;
    achieve('minen', 'first');
    const c = bb.cfg, secsF = ms / 1000;
    const std = c.topo === 'quad';
    if (!gg.help) {
      if (std && c.w === 9 && c.h === 9 && c.mines === 10) { if (secsF < 60) achieve('minen', 'anf60'); if (secsF < 20) achieve('minen', 'anf20'); }
      if (std && c.w === 16 && c.h === 16 && c.mines === 40 && secsF < 150) achieve('minen', 'fort150');
      if (std && c.w === 30 && c.h === 16 && c.mines >= 99) { achieve('minen', 'experte'); if (S.noGuess) achieve('minen', 'expert_ng'); }
      if (gg.flagsUsed === 0 && mode !== 'ohneflaggen' && c.w * c.h >= 81) achieve('minen', 'flagless');
      if (secsF > 0 && gg.bbbv / secsF >= 3 && c.w * c.h >= 81) achieve('minen', 'speed3');
      if (c.topo === 'hex') achieve('minen', 'hex');
      if (c.topo === 'torus') achieve('minen', 'torus');
      if (mode === 'leben') achieve('minen', 'lives');
      if (mode === 'tagesfeld') { achieve('minen', 'daily'); markDaily('minen', key); }
    }
    if (data.totals.streak + 1 >= 5) achieve('minen', 'streak5');
  }

  // ───── Hinweise ─────
  const doHint = () => {
    const gg = g.current, bb = bref.current;
    if (gg.phase === 'ready') { setMsg('Klicke zuerst ein beliebiges Feld – der erste Klick ist immer sicher.'); return; }
    if (gg.phase !== 'play') return;
    gg.help = true;
    const v = viewOf(bb);
    const d = deduce(v, { enumerate: true });
    const safe = d.find((x) => !x.mine);
    const mine = d.find((x) => x.mine && bb.st[x.cell] !== FLAG);
    if (safe) { setHint({ text: explain(safe, bb.cfg.w, bb.cfg.topo), safe: [safe.cell], mine: [] }); return; }
    if (mine) { setHint({ text: explain(mine, bb.cfg.w, bb.cfg.topo), safe: [], mine: [mine.cell] }); return; }
    const p = probabilities(v);
    let best = -1, bp = 2;
    for (let i = 0; i < bb.n; i++) if (bb.st[i] !== OPEN && !Number.isNaN(p[i]) && p[i] < bp) { bp = p[i]; best = i; }
    if (best >= 0) setHint({ text: `Hier hilft keine Logik mehr. Der beste Tipp: Zeile ${Math.floor(best / bb.cfg.w) + 1}, Spalte ${(best % bb.cfg.w) + 1} – mit ${Math.round(bp * 100)} % Minenwahrscheinlichkeit.`, safe: [], mine: [] }), setCursor(best);
    else setHint({ text: 'Keine Hinweise verfügbar.', safe: [], mine: [] });
  };
  const probs = useMemo(() => (probOn && g.current.phase === 'play' ? probabilities(viewOf(bref.current)) : null), [probOn, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── Zeiger ─────
  const onDown = (i: number, btn: number, e: React.PointerEvent) => {
    if (i < 0) return;
    const m = mouse.current;
    const touch = e.pointerType !== 'mouse';
    setFace(g.current.phase === 'ready' || g.current.phase === 'play' ? 'ooh' : face);
    if (touch) {
      longFired.current = false;
      window.clearTimeout(longT.current);
      longT.current = window.setTimeout(() => {
        longFired.current = true;
        const st = bref.current.st[i];
        if (st === OPEN) doChord(i); else if (S.touchMode === 'dig') flag(i); else open(i);
        if (navigator.vibrate) navigator.vibrate(18);
      }, 380);
      setPressed(new Set([i]));
      return;
    }
    if (e.buttons === 3 || (btn === 2 && (e.buttons & 1)) || (btn === 0 && (e.buttons & 2))) { m.armed = true; }
    if (btn === 1) { m.armed = true; }
    const set = new Set<number>();
    if (m.armed || (btn === 0 && bref.current.st[i] === OPEN)) bref.current.nb[i].forEach((j) => set.add(j));
    if (btn === 0 && !m.armed) set.add(i);
    setPressed(set);
  };
  const onUp = (i: number, btn: number, e: React.PointerEvent) => {
    setPressed(new Set());
    if (g.current.phase === 'ready' || g.current.phase === 'play') setFace('smile');
    const touch = e.pointerType !== 'mouse';
    if (touch) {
      window.clearTimeout(longT.current);
      if (longFired.current || i < 0) return;
      const st = bref.current.st[i];
      if (st === OPEN) doChord(i); else if (S.touchMode === 'dig') open(i); else flag(i);
      return;
    }
    const m = mouse.current;
    if (i < 0) { if (e.buttons === 0) { m.armed = false; m.skip = false; } return; }
    if (m.armed) { if (!m.skip) { doChord(i); m.skip = true; } if (e.buttons === 0) { m.armed = false; m.skip = false; } return; }
    if (m.skip) { if (e.buttons === 0) m.skip = false; return; }
    if (btn === 0) { if (bref.current.st[i] === OPEN) { if (S.chordClick) doChord(i); } else open(i); }
    else if (btn === 2) flag(i);
  };
  const onMove = (i: number) => { if (i !== hov) setHov(i); };

  // ───── Tastatur ─────
  useKeys((e) => {
    if (dialog || replay) return;
    const bb = bref.current;
    const move = (dx: number, dy: number) => {
      const w = bb.cfg.w, h = bb.cfg.h;
      const cur = cursor < 0 ? Math.floor(h / 2) * w + Math.floor(w / 2) : cursor;
      const x = Math.max(0, Math.min(w - 1, (cur % w) + dx)), y = Math.max(0, Math.min(h - 1, Math.floor(cur / w) + dy));
      setCursor(y * w + x);
    };
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); return move(-1, 0);
      case 'ArrowRight': e.preventDefault(); return move(1, 0);
      case 'ArrowUp': e.preventDefault(); return move(0, -1);
      case 'ArrowDown': e.preventDefault(); return move(0, 1);
      case ' ': case 'Enter': { e.preventDefault(); const i = cursor < 0 ? Math.floor(bb.cfg.h / 2) * bb.cfg.w + Math.floor(bb.cfg.w / 2) : cursor; setCursor(i); if (bb.st[i] === OPEN) doChord(i); else open(i); return; }
      case 'f': case 'F': case 'x': case 'X': if (cursor >= 0) flag(cursor); return;
      case 'c': case 'C': if (cursor >= 0) doChord(cursor); return;
      case 'F2': case 'r': case 'R': e.preventDefault(); newGame(); return;
      case 'h': case 'H': doHint(); return;
      case 'p': case 'P': if (mode === 'training') setProbOn((x) => !x); return;
      case 'u': case 'U': if (mode === 'training') undo(); return;
      case 'Escape': setMenu(null); return;
    }
  }, [cursor, dialog, replay, ver, mode, S.chordClick]);

  // ───── Geheimnisse ─────
  useSecrets('minen', {
    'minen-xyzzy': () => { setXray((x) => !x); g.current.help = true; },
    'minen-plugh': () => setPlugh((x) => !x),
    'minen-abra': () => {
      const gg = g.current, bb = bref.current;
      if (gg.phase !== 'play') return;
      gg.help = true;
      const cands: number[] = [];
      for (let i = 0; i < bb.n; i++) if (!bb.mine[i] && bb.st[i] !== OPEN) cands.push(i);
      if (cands.length) open(cands[Math.floor(Math.random() * cands.length)]);
    },
  });

  // ───── Anzeige ─────
  const minesLeft = b.cfg.mines - b.flags;
  const safeLeft = b.n - b.cfg.mines - b.opened;
  const overlay: Overlay = useMemo(() => ({
    cursor: cursor >= 0 ? cursor : undefined,
    pressed,
    safe: hint?.safe, mine: hint?.mine,
    prob: probs,
    hoverNb: b.cfg.topo === 'torus' && hov >= 0 ? b.nb[hov] : undefined,
  }), [cursor, pressed, hint, probs, hov, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const xrayShade = xray && hov >= 0 && phase === 'play' ? (b.mine[hov] ? '#000' : '#fff') : 'transparent';
  const ledTime = mode === 'zen' ? 0 : phase === 'ready' || phase === 'generating' ? 0 : phase === 'play' ? secs : Math.min(999, Math.floor(g.current.ms / 1000));
  const resultText = phase === 'won' ? `Gewonnen in ${mode === 'zen' ? '–' : fmtTimeMs(g.current.ms)} · 3BV ${g.current.bbbv}${g.current.ms > 0 ? ` · ${(g.current.bbbv / (g.current.ms / 1000)).toFixed(2)} 3BV/s` : ''}${g.current.help ? ' · mit Hilfe (keine Wertung)' : ''}` : phase === 'lost' ? `Verloren · ${Math.max(0, b.n - b.cfg.mines - b.opened)} sichere Felder fehlten · 3BV ${g.current.bbbv}` : '';

  const setPreset = (id: string) => { const p = PRESETS.find((x) => x.id === id)!; newGame({ cfg: { ...p.cfg, topo: S.cfg.topo === 'hex' && id !== 'mini' ? 'quad' : p.cfg.topo }, presetId: id }); };
  const setTopo = (t: Topo) => {
    const base = S.presetId === 'custom' ? S.cfg : (PRESETS.find((x) => x.id === S.presetId)?.cfg ?? S.cfg);
    const cfg = { ...base, topo: t, mines: Math.min(base.mines, maxMines(base.w, base.h, t)) };
    newGame({ cfg });
  };

  const menus: Record<string, { label: string; checked?: boolean; sep?: boolean; run?: () => void }[]> = {
    Spiel: [
      { label: 'Neu\tF2', run: () => newGame() },
      { label: '', sep: true },
      ...PRESETS.map((p) => ({ label: p.name, checked: S.presetId === p.id, run: () => setPreset(p.id) })),
      { label: 'Benutzerdefiniert …', checked: S.presetId === 'custom', run: () => setDialog('custom') },
      { label: '', sep: true },
      { label: 'Ohne Raten (garantiert logisch)', checked: S.noGuess, run: () => setS({ noGuess: !S.noGuess }) },
      { label: 'Erster Klick öffnet eine Fläche', checked: S.opening, run: () => setS({ opening: !S.opening }) },
      { label: 'Fragezeichen (?)', checked: S.question, run: () => setS({ question: !S.question }) },
      { label: 'Klick auf Zahl öffnet Nachbarn', checked: S.chordClick, run: () => setS({ chordClick: !S.chordClick }) },
      { label: '', sep: true },
      { label: 'Bestzeiten …', run: () => setDialog('stats') },
      { label: 'Wiederholungen …', run: () => setDialog('replays') },
      { label: '', sep: true },
      { label: 'Beenden', run: onExit },
    ],
    Modus: (Object.keys(MODE_INFO) as Mode[]).map((m) => ({ label: MODE_INFO[m].name, checked: mode === m, run: () => newGame({ mode: m }) })),
    Brett: [
      { label: 'Quadrat (8 Nachbarn)', checked: S.cfg.topo === 'quad', run: () => setTopo('quad') },
      { label: 'Sechseck (6 Nachbarn)', checked: S.cfg.topo === 'hex', run: () => setTopo('hex') },
      { label: 'Torus (Ränder verbunden)', checked: S.cfg.topo === 'torus', run: () => setTopo('torus') },
      { label: 'Kreuz (4 Nachbarn)', checked: S.cfg.topo === 'cross', run: () => setTopo('cross') },
    ],
    Ansicht: [
      { label: 'Klassisch 98', checked: S.skin === 'win98', run: () => setS({ skin: 'win98' }) },
      { label: 'Flach hell', checked: S.skin === 'flach', run: () => setS({ skin: 'flach' }) },
      { label: 'Dunkel', checked: S.skin === 'dunkel', run: () => setS({ skin: 'dunkel' }) },
      { label: '', sep: true },
      ...ZOOMS.map((z) => ({ label: `Zellgröße ${z}`, checked: S.zoom === z, run: () => setS({ zoom: z }) })),
    ],
    Hilfe: [
      { label: 'Lernen …', run: () => setDialog('lessons') },
      { label: 'Hinweis\tH', run: doHint },
      { label: 'Wahrscheinlichkeiten\tP (Training)', checked: probOn, run: () => { g.current.help = true; setProbOn((x) => !x); } },
      { label: 'Rückgängig\tU (Training)', run: undo },
      { label: '', sep: true },
      { label: 'Regeln und Bedienung …', run: () => setDialog('help') },
    ],
  };

  if (dialog === 'lessons') return <MinenLessons skin={S.skin} size={Math.min(S.zoom, 34)} onClose={() => setDialog(null)} onTraining={() => { setDialog(null); newGame({ mode: 'training' }); setProbOn(true); }} />;

  return (
    <div className="mn" data-skin={S.skin} onClick={() => menu && setMenu(null)}>
      <div className="mn-win" style={{ width: 'fit-content', maxWidth: '100%' }}>
        {xray && <i className="mn-xray" style={{ background: xrayShade }} aria-hidden="true" />}
        <div className="mn-title">
          <span className="mn-title-ico" aria-hidden="true">✹</span>
          <b>Minenfeld{plugh && phase === 'play' ? ` – noch ${safeLeft} sichere Felder` : ''}</b>
          <span className="mn-wbtns"><button aria-label="Beenden" onClick={onExit}>✕</button></span>
        </div>
        <div className="mn-menubar" onClick={(e) => e.stopPropagation()}>
          {Object.keys(menus).map((k) => (
            <span key={k} className="mn-menu">
              <button className={menu === k ? 'on' : ''} onClick={() => setMenu(menu === k ? null : k)} onMouseEnter={() => menu && setMenu(k)}>{k}</button>
              {menu === k && (
                <div className="mn-drop" role="menu">
                  {menus[k].map((it, n) => it.sep ? <hr key={n} /> : (
                    <button key={n} role="menuitem" onClick={() => { setMenu(null); it.run?.(); }}>
                      <i>{it.checked ? '✓' : ''}</i>{it.label.split('\t')[0]}<kbd>{it.label.split('\t')[1] ?? ''}</kbd>
                    </button>
                  ))}
                </div>
              )}
            </span>
          ))}
        </div>
        <div className="mn-body" ref={wrap}>
          <div className="mn-panel mn-head">
            <Led value={minesLeft} label="Verbleibende Minen" />
            <button className="mn-facebtn" aria-label="Neues Spiel" onClick={() => newGame()}><Face kind={phase === 'generating' ? 'ooh' : face} /></button>
            <Led value={ledTime} label="Zeit" />
          </div>
          <div className="mn-panel mn-field">
            <div className="mn-board-wrap">
              <MineCanvas b={b} version={ver} size={size} skin={S.skin} overlay={overlay} onDown={onDown} onUp={onUp} onMove={onMove} onLeave={() => { setHov(-1); setPressed(new Set()); if (g.current.phase === 'play' || g.current.phase === 'ready') setFace('smile'); }} />
            </div>
          </div>
          <div className="mn-tools">
            <button className={'mn-btn' + (S.touchMode === 'flag' ? ' on' : '')} onClick={() => setS({ touchMode: S.touchMode === 'dig' ? 'flag' : 'dig' })} title="Tippen: Aufdecken oder Flagge">{S.touchMode === 'dig' ? '⛏ Aufdecken' : '⚑ Flagge'}</button>
            <button className="mn-btn" onClick={doHint}>💡 Hinweis</button>
            {mode === 'training' && <button className={'mn-btn' + (probOn ? ' on' : '')} onClick={() => setProbOn((x) => !x)}>% Wahrscheinlichkeit</button>}
            {mode === 'training' && <button className="mn-btn" onClick={undo}>↶ Zurück</button>}
            <button className="mn-btn" onClick={() => setDialog('lessons')}>🎓 Lernen</button>
          </div>
          <div className="mn-status">
            <span>{MODE_INFO[mode].name}{mode === 'leben' ? ` · ${'♥'.repeat(Math.max(0, g.current.lives))}` : ''} · {cfgLabel(b.cfg, S.noGuess)}</span>
            <span>{resultText || msg}</span>
          </div>
          {hint && <div className="mn-hint" role="status">{hint.text}</div>}
        </div>
      </div>

      {dialog === 'custom' && <CustomDialog cfg={S.cfg} onCancel={() => setDialog(null)} onOk={(cfg) => { setDialog(null); newGame({ cfg, presetId: 'custom' }); }} />}
      {dialog === 'help' && <Dialog title="Regeln und Bedienung" onClose={() => setDialog(null)}><HelpText /></Dialog>}
      {dialog === 'stats' && <StatsDialog data={data} onClose={() => setDialog(null)} onReset={() => upd((d) => { d.best = {}; d.stats = {}; d.totals = { ...MINEN_INIT.totals }; })} />}
      {dialog === 'replays' && <Dialog title="Wiederholungen" onClose={() => setDialog(null)} wide>
        {data.replays.length === 0 ? <p>Noch keine Wiederholungen. Jede gewertete Partie (ohne Hinweise) wird gespeichert.</p> : (
          <ul className="mn-list">{data.replays.map((r) => (
            <li key={r.id}>
              <span>{new Date(r.date).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {cfgLabel(r.cfg, false)} · {r.won ? 'Sieg' : 'Niederlage'} · {fmtTimeMs(r.time)} · 3BV {r.bbbv}</span>
              <button className="mn-btn" onClick={() => { setDialog(null); setReplay(r); }}>Ansehen</button>
            </li>))}</ul>)}
      </Dialog>}
      {replay && <div className="mn-modal-bg"><div className="mn-dialog wide"><div className="mn-dtitle"><b>Wiederholung</b></div><ReplayView replay={replay} skin={S.skin} size={S.zoom} onClose={() => setReplay(null)} /></div></div>}
    </div>
  );
}

// ───────── Dialoge ─────────
function Dialog({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="mn-modal-bg" onClick={onClose}>
      <div className={'mn-dialog' + (wide ? ' wide' : '')} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="mn-dtitle"><b>{title}</b><button aria-label="Schließen" onClick={onClose}>✕</button></div>
        <div className="mn-dbody">{children}</div>
        <div className="mn-dfoot"><button className="mn-btn" onClick={onClose} autoFocus>OK</button></div>
      </div>
    </div>
  );
}

function CustomDialog({ cfg, onOk, onCancel }: { cfg: Cfg; onOk: (c: Cfg) => void; onCancel: () => void }) {
  const [w, setW] = useState(cfg.w), [h, setH] = useState(cfg.h), [m, setM] = useState(cfg.mines), [t, setT] = useState<Topo>(cfg.topo);
  const W = Math.max(5, Math.min(60, w || 5)), H = Math.max(5, Math.min(40, h || 5));
  const M = Math.max(1, Math.min(maxMines(W, H, t), m || 1));
  return (
    <div className="mn-modal-bg" onClick={onCancel}>
      <div className="mn-dialog" role="dialog" aria-label="Benutzerdefiniert" onClick={(e) => e.stopPropagation()}>
        <div className="mn-dtitle"><b>Benutzerdefiniertes Feld</b><button aria-label="Schließen" onClick={onCancel}>✕</button></div>
        <div className="mn-dbody mn-form">
          <label>Breite (5–60)<input type="number" min={5} max={60} value={w} onChange={(e) => setW(+e.target.value)} /></label>
          <label>Höhe (5–40)<input type="number" min={5} max={40} value={h} onChange={(e) => setH(+e.target.value)} /></label>
          <label>Minen (1–{maxMines(W, H, t)})<input type="number" min={1} value={m} onChange={(e) => setM(+e.target.value)} /></label>
          <label>Brettform<select value={t} onChange={(e) => setT(e.target.value as Topo)}><option value="quad">Quadrat</option><option value="hex">Sechseck</option><option value="torus">Torus</option><option value="cross">Kreuz</option></select></label>
          <p className="mn-small">Dichte: {Math.round((M / (W * H)) * 100)} % · Zum Vergleich: Anfänger 12 %, Fortgeschritten 16 %, Experte 21 %.</p>
        </div>
        <div className="mn-dfoot"><button className="mn-btn" onClick={() => onOk({ topo: t, w: W, h: H, mines: M })}>OK</button><button className="mn-btn" onClick={onCancel}>Abbrechen</button></div>
      </div>
    </div>
  );
}

function StatsDialog({ data, onClose, onReset }: { data: typeof MINEN_INIT; onClose: () => void; onReset: () => void }) {
  const keys = Object.keys(data.stats);
  return (
    <Dialog title="Bestzeiten und Statistik" onClose={onClose} wide>
      <p><b>Gesamt:</b> {data.totals.games} Spiele, {data.totals.wins} Siege ({data.totals.games ? Math.round((data.totals.wins / data.totals.games) * 100) : 0} %), aktuelle Serie {data.totals.streak}, beste Serie {data.totals.bestStreak}.</p>
      {keys.length === 0 ? <p>Noch keine Spiele gewertet.</p> : (
        <table className="mn-table">
          <thead><tr><th>Feld</th><th>Gespielt</th><th>Siege</th><th>Serie</th><th>Beste Zeiten</th></tr></thead>
          <tbody>{keys.map((k) => {
            const [topo, dim, mines] = k.split('-');
            const lab = `${{ quad: 'Quadrat', hex: 'Sechseck', torus: 'Torus', cross: 'Kreuz' }[topo] ?? topo} ${dim}, ${mines.replace(/\D/g, '')} Minen${k.endsWith('-ng') || k.includes('-ng-') ? ', ohne Raten' : ''}${k.endsWith('-nf') ? ', ohne Flaggen' : ''}`;
            const s = data.stats[k];
            return <tr key={k}><td>{lab}</td><td>{s.played}</td><td>{s.won} ({s.played ? Math.round((s.won / s.played) * 100) : 0} %)</td><td>{s.streak}</td><td>{(data.best[k] ?? []).map((ms) => fmtTime(ms / 1000)).join(' · ') || '–'}</td></tr>;
          })}</tbody>
        </table>
      )}
      <p><button className="mn-btn" onClick={() => { if (confirm('Alle Bestzeiten und Statistiken löschen?')) onReset(); }}>Zurücksetzen</button></p>
    </Dialog>
  );
}

function HelpText() {
  return (
    <div className="mn-help">
      <p><b>Ziel:</b> Decke alle Felder ohne Mine auf. Eine Zahl zeigt, wie viele Minen in den angrenzenden Feldern liegen (Quadrat: 8, Sechseck: 6, Kreuz: 4, Torus: 8 mit verbundenen Rändern).</p>
      <p><b>Maus:</b> Linksklick deckt auf, Rechtsklick setzt eine Flagge (optional Fragezeichen). Ein Klick auf eine Zahl – oder beide Tasten gleichzeitig – öffnet alle Nachbarn, wenn schon genauso viele Flaggen liegen wie die Zahl.</p>
      <p><b>Touch:</b> Tippen deckt auf (oder setzt eine Flagge, je nach Schalter „Aufdecken/Flagge“). Langer Druck macht das Gegenteil.</p>
      <p><b>Tastatur:</b> Pfeile bewegen den Cursor, Leertaste deckt auf, F setzt eine Flagge, C öffnet die Nachbarn, F2 oder R startet neu, H zeigt einen Hinweis, im Training P = Wahrscheinlichkeiten und U = zurück.</p>
      <p><b>Ohne Raten:</b> Das Programm prüft mit einem Löser, dass sich das Feld nach deinem ersten Klick rein logisch räumen lässt. Das kann bei großen Feldern einige Sekunden dauern.</p>
      <p><b>3BV</b> ist die kleinste Zahl an Klicks, die du ohne Flaggen bräuchtest. 3BV pro Sekunde misst dein Tempo unabhängig vom Feld.</p>
      <p><b>Modi:</b> Zen ohne Uhr, Drei Leben, Ohne Flaggen, Training mit Hinweisen und Wahrscheinlichkeiten, Tagesfeld (jeden Tag dasselbe Feld für alle). Mit Hilfen gespielte Partien zählen nicht für Bestzeiten.</p>
    </div>
  );
}
