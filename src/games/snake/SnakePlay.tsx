import { useCallback, useEffect, useRef, useState } from 'react';
import { type SnSettings } from './data';
import { type Dir, type FoodKind, type Game, type ReplayData, type Rules, aiDir, newGame, step, steer, tickMs } from './engine';
import SnakeCanvas from './SnakeCanvas';
import { freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';

export interface PlaySetupN {
  mode: 'klassisch' | 'torus' | 'zen' | 'ueberleben' | 'zeit' | 'kampagne' | 'zwei' | 'duell' | 'eigen';
  rules: Rules;
  label: string;
  statKey: string;
  baseMs: number;
  goal?: number;
  levelId?: string;
  aiLevel?: number;
  daily?: boolean;
  timeLimitMs?: number;
  boost?: { geist?: boolean; len?: number };
  parTicks?: number;
}

export interface FinishInfoN {
  setup: PlaySetupN;
  score: number;
  score2: number;
  length: number;
  eaten: number;
  gold: number;
  ticks: number;
  ms: number;
  won: boolean;
  winner: number;
  goalReached: boolean;
  ghostWall: boolean;
  deathReason: string;
  replay: ReplayData;
  boosted: boolean;
}

const KEY1: Record<string, Dir> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
const KEY2: Record<string, Dir> = { w: 0, W: 0, d: 1, D: 1, s: 2, S: 2, a: 3, A: 3 };

export default function SnakePlay({ setup, S, onFinish, onExit, onAgain, replay }: { setup: PlaySetupN; S: SnSettings; onFinish: (i: FinishInfoN) => void; onExit: () => void; onAgain?: () => void; replay?: ReplayData }) {
  const rules = replay ? replay.rules : setup.rules;
  const gref = useRef<Game>(null as unknown as Game);
  if (!gref.current) {
    const g = newGame({ ...rules, seed: rules.seed || freshSeed() });
    if (!replay && setup.boost) {
      if (setup.boost.geist) g.snakes[0].effects.geist = 60;
      if (setup.boost.len && setup.boost.len > g.snakes[0].cells.length) {
        const s = g.snakes[0];
        for (let i = 0; i < setup.boost.len - 3; i++) s.grow++;
      }
    }
    gref.current = g;
  }
  const g = gref.current;
  const [ver, setVer] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'play' | 'paused' | 'over'>(replay ? 'play' : 'ready');
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<FinishInfoN | null>(null);
  const [ms, setMs] = useState(0);
  const rec = useRef<[number, number, Dir][]>([]);
  const acc = useRef(0);
  const msTotal = useRef(0);
  const gold = useRef(0);
  const ghostWall = useRef(false);
  const rnd = useRef(mulberry32(freshSeed()));
  const repIdx = useRef(0);
  const doneRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const aiLevel = setup.aiLevel ?? 3;

  const interval = useCallback(() => {
    const s0 = g.snakes[0];
    if (g.snakes.length === 2) return Math.round(setup.baseMs * (1 - Math.min(0.4, (g.snakes[0].eaten + g.snakes[1].eaten) * 0.009)));
    return tickMs(setup.baseMs, s0);
  }, [g, setup.baseMs]);

  const finish = useCallback((won: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const s0 = g.snakes[0];
    const info: FinishInfoN = {
      setup, score: s0.score, score2: g.snakes[1]?.score ?? 0, length: s0.cells.length, eaten: s0.eaten, gold: gold.current, ticks: g.tick, ms: msTotal.current, won,
      winner: g.winner, goalReached: setup.goal ? s0.eaten >= setup.goal : false, ghostWall: ghostWall.current, deathReason: s0.deathReason,
      replay: { rules: { ...g.rules, obstacles: g.rules.obstacles }, inputs: rec.current.slice(), ticks: g.tick }, boosted: !!setup.boost && (!!setup.boost.geist || !!setup.boost.len),
    };
    setResult(info);
    setPhase('over');
    sfx(won ? 'win' : 'lose');
    if (!replay) onFinish(info);
  }, [g, setup, onFinish, replay]);

  const doStep = useCallback(() => {
    if (g.over) return;
    const dirs: (Dir | null)[] = g.snakes.map(() => null);
    if (replay) {
      while (repIdx.current < replay.inputs.length && replay.inputs[repIdx.current][0] <= g.tick + 1) { const [, si, d] = replay.inputs[repIdx.current++]; dirs[si] = d; }
      if (g.tick >= replay.ticks) { finish(true); return; }
    } else if (setup.mode === 'duell') {
      const d = aiDir(g, 1, aiLevel, rnd.current);
      dirs[1] = d;
      rec.current.push([g.tick + 1, 1, d]);
    }
    const res = step(g, dirs);
    for (const s of g.snakes) if (s.alive && s.effects.geist > 0 && g.walls.has(s.cells[s.cells.length - 1])) ghostWall.current = true;
    for (const a of res.ate) {
      if (a.kind === 'gold') gold.current++;
      if (a.snake === 0 || setup.mode === 'zwei') sfx(a.kind === 'gift' ? 'bad' : a.kind === 'gold' ? 'good' : a.kind === 'apfel' ? 'pop' : 'level');
    }
    if (res.died.length) sfx('boom');
    setVer((v) => v + 1);
    // Ziele
    if (!replay) {
      if (setup.goal && g.snakes[0].eaten >= setup.goal) { finish(true); return; }
      if (g.over) {
        const won = setup.mode === 'duell' ? g.winner === 0 : setup.mode === 'zwei' ? true : false;
        finish(won);
      }
    } else if (g.over) finish(true);
  }, [g, setup, replay, finish, aiLevel]);

  // Spielschleife
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (phaseRef.current === 'play' && !g.over) {
        acc.current += dt; msTotal.current += dt;
        setMs(msTotal.current);
        if (setup.timeLimitMs && msTotal.current >= setup.timeLimitMs) { finish(true); return; }
        let guard = 0;
        const iv = interval();
        while (acc.current >= iv && guard++ < 4 && !g.over && phaseRef.current === 'play') { acc.current -= iv; doStep(); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [g, interval, doStep, setup.timeLimitMs, finish]);

  // Eingaben
  const press = useCallback((idx: number, d: Dir) => {
    if (replay || g.over) return;
    if (phaseRef.current === 'ready') { setPhase('play'); setMsg(''); }
    if (phaseRef.current === 'paused') return;
    const s = g.snakes[idx];
    if (!s || !s.alive) return;
    const before = s.queue.length;
    steer(s, d);
    if (s.queue.length > before) rec.current.push([g.tick + 1, idx, d]);
  }, [g, replay]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'play') { setPhase('paused'); setMsg('Pause'); }
    else if (phaseRef.current === 'paused') { setPhase('play'); setMsg(''); }
    else if (phaseRef.current === 'ready') setPhase('play');
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
      if (e.key in KEY1 || e.key in KEY2) {
        if (e.key in KEY1) e.preventDefault();
        if (setup.mode === 'zwei') { if (e.key in KEY1) press(1, KEY1[e.key]); else press(0, KEY2[e.key]); }
        else press(0, (KEY1[e.key] ?? KEY2[e.key]) as Dir);
      }
    };
    const blur = () => { if (phaseRef.current === 'play') { setPhase('paused'); setMsg('Pause'); } };
    window.addEventListener('keydown', on);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('blur', blur); };
  }, [press, togglePause, setup.mode]);

  const s0 = g.snakes[0], s1 = g.snakes[1];
  const remaining = setup.timeLimitMs ? Math.max(0, Math.ceil((setup.timeLimitMs - ms) / 1000)) : null;
  const fx = (s: typeof s0) => (['geist', 'zeitlupe', 'doppel', 'schild'] as const).filter((k) => s.effects[k] > 0);
  const FXL: Record<string, string> = { geist: 'Geist', zeitlupe: 'Zeitlupe', doppel: 'Doppelt', schild: 'Schild' };

  return (
    <div className={`sn-play sn-skin-${S.skin}`}>
      <div className="sn-hud">
        <div><small>{setup.mode === 'zwei' ? 'Spieler 1 (WASD)' : 'Punkte'}</small><b>{s0.score}</b></div>
        {s1 && <div><small>{setup.mode === 'zwei' ? 'Spieler 2 (Pfeile)' : 'KI'}</small><b>{s1.score}</b></div>}
        <div><small>Länge</small><b>{s0.cells.length}</b></div>
        {setup.goal ? <div><small>Ziel</small><b>{Math.min(s0.eaten, setup.goal)} / {setup.goal}</b></div> : <div><small>Äpfel</small><b>{s0.eaten}</b></div>}
        {remaining !== null ? <div><small>Zeit</small><b>{remaining}s</b></div> : <div><small>Zeit</small><b>{Math.floor(ms / 60000)}:{String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}</b></div>}
        <div className="sn-fx">{fx(s0).map((k) => <em key={k} className={`fx-${k}`}>{FXL[k]} {k === 'schild' ? '' : Math.ceil(s0.effects[k] / 8)}</em>)}</div>
      </div>
      <div className="sn-screen">
        <SnakeCanvas game={g} skin={S.skin} version={ver} className="sn-canvas" onSwipe={(d) => press(0, d)} />
        {phase === 'ready' && !replay && (
          <div className="sn-overlay"><h2>{setup.label}</h2><p>{setup.goal ? `Ziel: ${setup.goal} Äpfel.` : 'Iss Äpfel, wachse, überlebe.'}</p><p className="sn-sub">Pfeiltasten{setup.mode === 'zwei' ? ' / WASD' : ' oder WASD'} · Leertaste: Pause · Wischen am Handy</p><button className="primary" onClick={() => setPhase('play')}>Start</button></div>
        )}
        {phase === 'paused' && <div className="sn-overlay"><h2>Pause</h2><button className="primary" onClick={togglePause}>Weiter</button><button onClick={onExit}>Beenden</button></div>}
        {phase === 'over' && result && (
          <div className="sn-overlay">
            <h2>{replay ? 'Ende der Wiedergabe' : setup.goal ? (result.won ? 'Level geschafft!' : 'Gescheitert') : setup.mode === 'duell' ? (result.won ? 'Du gewinnst!' : result.winner === -1 ? 'Unentschieden' : 'Die KI gewinnt') : setup.mode === 'zwei' ? (result.winner === 0 ? 'Spieler 1 gewinnt' : result.winner === 1 ? 'Spieler 2 gewinnt' : 'Unentschieden') : 'Game over'}</h2>
            <p>{result.score} Punkte · Länge {result.length} · {result.eaten} Äpfel{result.deathReason ? ` · ${result.deathReason}` : ''}</p>
            {setup.mode === 'zwei' || setup.mode === 'duell' ? <p>{result.score} : {result.score2}</p> : null}
            <div className="sn-actions">{onAgain && !replay && <button className="primary" onClick={onAgain}>Nochmal</button>}<button className={onAgain && !replay ? '' : 'primary'} onClick={onExit}>Menü</button></div>
          </div>
        )}
      </div>
      {msg && phase !== 'paused' && <p className="sn-msg">{msg}</p>}
      {S.dpad && !replay && (
        <div className="sn-dpad" aria-label="Steuerkreuz">
          <button onClick={() => press(0, 0)} aria-label="Hoch">▲</button>
          <button onClick={() => press(0, 3)} aria-label="Links">◀</button>
          <button onClick={() => press(0, 1)} aria-label="Rechts">▶</button>
          <button onClick={() => press(0, 2)} aria-label="Runter">▼</button>
        </div>
      )}
      <div className="sn-actions"><button onClick={togglePause} disabled={phase === 'over'}>{phase === 'paused' ? 'Weiter' : 'Pause'} <kbd>␣</kbd></button><button onClick={onExit}>{replay ? 'Schließen' : 'Aufgeben'}</button></div>
    </div>
  );
}

export type { FoodKind };
