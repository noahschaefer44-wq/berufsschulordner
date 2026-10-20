import { useEffect, useMemo, useRef, useState } from 'react';
import { type Rng, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { fmtTimeMs } from '../shared/store';
import { executePlan, planMove } from './bot';
import { type FlashRow, drawBoard, drawMini, skinBg, useAnimationFrame } from './BlockCanvas';
import { type Action, type BSettings } from './data';
import { type Cfg, type Game, FRAME_MS, K_180, K_CCW, K_CW, K_DOWN, K_HARD, K_HOLD, K_LEFT, K_RIGHT, ROT, TETRO_IDS, addIncoming, minimalInputs, newGame, spawn, step } from './engine';
import { type Puzzle, puzzleGame } from './puzzles';

export interface Result {
  mode: string;
  won: boolean;
  reason: string;
  score: number;
  lines: number;
  level: number;
  time: number;
  pieces: number;
  pps: number;
  kpp: number;
  apm: number;
  maxCombo: number;
  tspins: number;
  tetrises: number;
  pcs: number;
  rle: [number, number][];
  seed: number;
  puzzleOk?: boolean;
  finesse?: { total: number; perfect: number; best: number };
}

interface Props {
  kind: 'normal' | 'duell' | 'puzzle' | 'finesse' | 'replay';
  cfg: Cfg;
  seed: number;
  S: BSettings;
  puzzle?: Puzzle;
  replay?: [number, number][];
  /** Zeitlupe-Geheimnis */
  slow?: boolean;
  onFinish: (r: Result) => void;
  onRestart: () => void;
  onExit: () => void;
  onAchieve: (key: string) => void;
}

const botSkill = [0.35, 0.65, 0.88, 1];

export default function BlockPlay({ kind, cfg, seed, S, puzzle, replay, slow, onFinish, onRestart, onExit, onAchieve }: Props) {
  const game = useRef<Game>(kind === 'puzzle' && puzzle ? puzzleGame(puzzle, seed) : newGame(kind === 'finesse' ? { ...cfg, mode: 'zen', noGravity: true, hold: false, startLevel: 1 } : cfg, seed));
  const opp = useRef<Game | null>(kind === 'duell' ? newGame({ ...cfg, mode: 'duell' }, seed ^ 0x9e3779b9) : null);
  const botRng = useRef<Rng>(mulberry32(seed + 17));
  const canvas = useRef<HTMLCanvasElement>(null);
  const oppCanvas = useRef<HTMLCanvasElement>(null);
  const holdCv = useRef<HTMLCanvasElement>(null);
  const nextCvs = useRef<(HTMLCanvasElement | null)[]>([]);
  const keys = useRef(new Set<string>());
  const virt = useRef(0);
  const acc = useRef(0);
  const last = useRef(0);
  const countdown = useRef(kind === 'replay' ? 0 : 2400);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const flashes = useRef<FlashRow[]>([]);
  const shake = useRef(0);
  const seenAt = useRef<Float64Array | null>(null);
  const prevBoard = useRef<Uint8Array | null>(null);
  const rle = useRef<[number, number][]>([]);
  const lastMask = useRef(-1);
  const rIdx = useRef(0);
  const rLeft = useRef(0);
  const botAcc = useRef(0);
  const done = useRef(false);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null);
  const [hud, setHud] = useState({ score: 0, lines: 0, level: 1, time: 0, pps: 0, kpp: 0, apm: 0, combo: -1, b2b: -1, left: 0, incoming: 0, oppIncoming: 0, cheese: 0, count: 3 });
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [target, setTarget] = useState<{ type: number; x: number; rot: number; min: number } | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const [fin, setFin] = useState({ total: 0, perfect: 0, streak: 0, best: 0, msg: '' });
  const finRef = useRef(fin);
  finRef.current = fin;
  const kStart = useRef(0);
  const [outcome, setOutcome] = useState<null | { text: string; ok: boolean }>(null);
  const [size, setSize] = useState({ w: 1000, h: 800 });

  const slowFactor = slow ? 0.5 : 1;

  // ───── Größe ─────
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const g0 = game.current;
  const sideW = kind === 'duell' ? 640 : 420;
  const cell = Math.max(14, Math.min(36, Math.floor(Math.min((size.h - 150) / g0.cfg.h, (size.w - sideW) / g0.W) * S.scale)));
  const oppCell = Math.max(8, Math.floor(cell * 0.5));

  // ───── Finesse: neues Ziel ─────
  const nextTarget = () => {
    const g = game.current;
    const type = TETRO_IDS[Math.floor(Math.random() * TETRO_IDS.length)];
    const rot = type === 2 ? 0 : Math.floor(Math.random() * 4);
    const cells = ROT[type][rot];
    const minX = Math.min(...cells.map((c) => c[0])), maxX = Math.max(...cells.map((c) => c[0]));
    const x = -minX + Math.floor(Math.random() * (g.W - (maxX - minX)));
    g.board.fill(0);
    spawn(g, type);
    kStart.current = g.keys;
    const empty = newGame({ ...g.cfg }, 1);
    empty.board.fill(0);
    setTarget({ type, x, rot, min: minimalInputs(empty, type, x, rot) });
  };
  useEffect(() => { if (kind === 'finesse') nextTarget(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── Tastatur ─────
  const actionOf = useMemo(() => {
    const m = new Map<string, Action>();
    (Object.keys(S.keys) as Action[]).forEach((a) => S.keys[a].forEach((c) => m.set(c, a)));
    return m;
  }, [S.keys]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const a = actionOf.get(e.code);
      if (!a) return;
      e.preventDefault();
      if (a === 'pause') { if (!e.repeat) setPaused((p) => !p); return; }
      if (a === 'restart') { if (!e.repeat) onRestart(); return; }
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.code); };
    const blur = () => { keys.current.clear(); if (kind !== 'replay') setPaused(true); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [actionOf, onRestart, kind]);

  const maskNow = (): number => {
    let m = virt.current;
    for (const c of keys.current) {
      switch (actionOf.get(c)) {
        case 'left': m |= K_LEFT; break; case 'right': m |= K_RIGHT; break; case 'down': m |= K_DOWN; break;
        case 'cw': m |= K_CW; break; case 'ccw': m |= K_CCW; break; case 'r180': m |= K_180; break; case 'hard': m |= K_HARD; break; case 'hold': m |= K_HOLD; break;
      }
    }
    return m;
  };

  // ───── Ereignisse ─────
  const handle = (g: Game, mine: boolean, now: number) => {
    for (const ev of g.events) {
      if (!mine) { if (ev.kind === 'clear' && (ev.attack ?? 0) > 0) addIncoming(game.current, ev.attack!); continue; }
      switch (ev.kind) {
        case 'rotate': sfx('rotate'); break;
        case 'hold': sfx('hold'); break;
        case 'drop': sfx('drop'); if (S.shake && S.effects) shake.current = 5; break;
        case 'level': sfx('level'); break;
        case 'garbage': sfx('bad'); if (S.shake) shake.current = 8; break;
        case 'clear':
          if (ev.rows?.length) { flashes.current.push({ rows: ev.rows, t: now }); sfx('clear'); if (S.shake && S.effects && ev.lines! >= 4) shake.current = 10; }
          if (ev.label) setBanner({ text: `${ev.pc ? 'Perfect Clear! ' : ''}${ev.label}${ev.b2b ? ' · B2B' : ''}${(ev.combo ?? 0) > 0 ? ` · ${ev.combo}× Combo` : ''}`, key: now });
          if ((ev.lines ?? 0) >= 1) onAchieve('first');
          if (ev.lines === 4) onAchieve('tetris');
          if (ev.tspin && (ev.lines ?? 0) > 0) onAchieve('tspin');
          if (ev.tspin && ev.lines === 2 && !ev.mini) onAchieve('tsd');
          if (ev.b2b) onAchieve('b2b');
          if ((ev.combo ?? 0) >= 5) onAchieve('combo5');
          if (ev.pc) onAchieve('pc');
          if (kind === 'duell' && opp.current && (ev.attack ?? 0) > 0) addIncoming(opp.current, ev.attack!);
          if (kind === 'puzzle' && puzzle && ev.label === puzzle.goal) { setOutcome({ text: `Geschafft: ${puzzle.goal}!`, ok: true }); sfx('win'); }
          break;
        case 'lock':
          if (kind === 'finesse') finesseCheck(g);
          break;
        case 'win': sfx('win'); break;
        case 'over': sfx('lose'); break;
        default: break;
      }
    }
    g.events = [];
  };

  const finesseCheck = (g: Game) => {
    const t = targetRef.current;
    const p = g.lastPlaced;
    if (!t || !p) return;
    const sig = (type: number, rot: number, x: number) => ROT[type][rot & 3].map(([cx, cy]) => `${x + cx},${cy}`).sort().join('|');
    // gleiche Form unabhängig von der Drehungsbezeichnung (z. B. I, S, Z, O)
    const norm = (cells: [number, number][]) => { const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1])); return cells.map(([x, y]) => `${x - mx},${y - my}`).sort().join('|') + '@' + Math.min(...cells.map((c) => c[0])); };
    const cellsA = ROT[p.type][p.rot & 3].map(([cx, cy]) => [p.x + cx, cy] as [number, number]);
    const cellsB = ROT[t.type][t.rot & 3].map(([cx, cy]) => [t.x + cx, cy] as [number, number]);
    void sig;
    const ok = norm(cellsA) === norm(cellsB);
    const used = g.keys - kStart.current;
    const f = finRef.current;
    let msg = '', streak = f.streak, perfect = f.perfect;
    if (!ok) { msg = 'Falsche Stelle – das Ziel war die grüne Lage.'; streak = 0; }
    else if (used <= t.min) { msg = `Optimal! ${used} Tasten.`; streak++; perfect++; sfx('good'); }
    else { msg = `${used} Tasten – es geht mit ${t.min}.`; streak = 0; sfx('tick'); }
    const total = f.total + 1;
    const best = Math.max(f.best, streak);
    setFin({ total, perfect, streak, best, msg });
    if (streak >= 20) onAchieve('finesse');
    window.setTimeout(nextTarget, 350);
  };

  // ───── Hauptschleife ─────
  useAnimationFrame((t) => {
    const g = game.current;
    const dt = last.current ? Math.min(100, t - last.current) : 0;
    last.current = t;
    if (!pausedRef.current && !done.current) {
      if (countdown.current > 0) {
        const before = Math.ceil(countdown.current / 800);
        countdown.current -= dt;
        const after = Math.ceil(Math.max(0, countdown.current) / 800);
        if (after !== before) sfx(after === 0 ? 'good' : 'tick');
      } else {
        acc.current += dt * (kind === 'replay' ? speedRef.current : 1) * slowFactor;
        let guard = 0;
        while (acc.current >= FRAME_MS && g.status === 'play' && guard++ < 12) {
          acc.current -= FRAME_MS;
          let m: number;
          if (kind === 'replay' && replay) {
            if (rLeft.current <= 0) { const e = replay[rIdx.current++]; if (e) { lastMask.current = e[0]; rLeft.current = e[1]; } else { lastMask.current = 0; rLeft.current = 1e9; } }
            m = lastMask.current;
            rLeft.current--;
          } else {
            m = maskNow();
            const r = rle.current;
            if (r.length && lastMask.current === m) r[r.length - 1][1]++; else { r.push([m, 1]); lastMask.current = m; }
          }
          step(g, m);
          handle(g, true, t);
          if (opp.current) {
            const o = opp.current;
            botAcc.current += FRAME_MS;
            if (o.status === 'play' && botAcc.current >= 1000 / S.botPps) {
              botAcc.current = 0;
              const plan = planMove(o, botSkill[S.bot] ?? 0.65, botRng.current);
              if (plan) executePlan(o, plan);
              handle(o, false, t);
            }
            if (o.status === 'over' && g.status === 'play') { g.status = 'win'; g.reason = 'Der Computer ist am Ende.'; g.events.push({ kind: 'win' }); }
          }
        }
        // Zeit für Duell-Anzeige
      }
    }
    // Sichtbarkeit (unsichtbar)
    if (g.cfg.invisible) {
      if (!seenAt.current || seenAt.current.length !== g.board.length) { seenAt.current = new Float64Array(g.board.length); prevBoard.current = new Uint8Array(g.board.length); }
      for (let i = 0; i < g.board.length; i++) { if (g.board[i] !== prevBoard.current![i]) { if (g.board[i]) seenAt.current[i] = t; prevBoard.current![i] = g.board[i]; } }
    }
    shake.current = Math.max(0, shake.current - 0.8);
    flashes.current = flashes.current.filter((f) => t - f.t < 300);
    if (canvas.current) drawBoard(canvas.current, g, S.skin, cell, S.ghost, S.grid, { flashes: flashes.current, target: kind === 'finesse' ? targetRef.current : null, seenAt: seenAt.current, invisible: g.cfg.invisible, shake: shake.current }, t);
    if (opp.current && oppCanvas.current) drawBoard(oppCanvas.current, opp.current, S.skin, oppCell, false, false, { flashes: [], invisible: false, shake: 0 }, t);
    if (holdCv.current) drawMini(holdCv.current, g.hold, S.skin, Math.max(14, Math.round(cell * 0.7)), g.holdUsed);
    nextCvs.current.forEach((cv, i) => { if (cv) drawMini(cv, g.queue[i] ?? 0, S.skin, Math.max(12, Math.round(cell * (i === 0 ? 0.7 : 0.55)))); });
    // HUD ca. 8×/s
    if (Math.floor(t / 120) !== Math.floor((t - dt) / 120)) {
      const secs = g.t / 1000;
      const goal = g.cfg.mode === 'sprint' || g.cfg.mode === 'marathon' ? Math.max(0, g.cfg.goal - g.lines) : g.cfg.mode === 'ultra' ? Math.max(0, 120 - secs) : 0;
      setHud({
        score: g.score, lines: g.lines, level: g.level, time: g.t, pps: secs > 0 ? g.pieces / secs : 0, kpp: g.pieces ? g.keys / g.pieces : 0, apm: secs > 0 ? (g.attack / secs) * 60 : 0,
        combo: g.combo, b2b: g.b2b, left: goal, incoming: g.incoming.reduce((a, b) => a + b, 0), oppIncoming: opp.current ? opp.current.incoming.reduce((a, b) => a + b, 0) : 0, cheese: g.cheeseLeft,
        count: Math.max(0, Math.ceil(countdown.current / 800)),
      });
    }
    // Ende
    if (g.status !== 'play' && !done.current) {
      done.current = true;
      const secs = g.t / 1000;
      const res: Result = {
        mode: kind === 'puzzle' ? 'puzzle' : kind === 'duell' ? 'duell' : g.cfg.mode, won: g.status === 'win', reason: g.reason, score: g.score, lines: g.lines, level: g.level, time: g.t, pieces: g.pieces,
        pps: secs > 0 ? g.pieces / secs : 0, kpp: g.pieces ? g.keys / g.pieces : 0, apm: secs > 0 ? (g.attack / secs) * 60 : 0, maxCombo: g.maxCombo, tspins: g.tspins, tetrises: g.tetrises, pcs: g.pcs, rle: rle.current, seed,
        puzzleOk: kind === 'puzzle' ? outcomeRef.current?.ok === true : undefined,
      };
      if (kind === 'puzzle' && !res.puzzleOk) setOutcome({ text: 'Nicht geschafft – versuche es noch einmal.', ok: false });
      if (kind !== 'replay') window.setTimeout(() => onFinish(res), 600);
    }
    if (kind === 'puzzle' && outcomeRef.current?.ok && !done.current) {
      done.current = true;
      onFinish({ mode: 'puzzle', won: true, reason: '', score: 0, lines: g.lines, level: 1, time: g.t, pieces: g.pieces, pps: 0, kpp: 0, apm: 0, maxCombo: 0, tspins: g.tspins, tetrises: 0, pcs: 0, rle: [], seed, puzzleOk: true });
    }
  }, true);
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;

  // ───── Touch ─────
  const press = (m: number, on: boolean) => { virt.current = on ? virt.current | m : virt.current & ~m; };
  const tbtn = (m: number, label: string, cls = '') => (
    <button className={'bk-tbtn ' + cls} onPointerDown={(e) => { e.preventDefault(); press(m, true); }} onPointerUp={() => press(m, false)} onPointerCancel={() => press(m, false)} onPointerLeave={() => press(m, false)} onContextMenu={(e) => e.preventDefault()}>{label}</button>
  );

  const g = game.current;
  const B = skinBg(S.skin);
  const garbageBar = Math.min(1, hud.incoming / g.cfg.h);
  const timeText = fmtTimeMs(hud.time);

  return (
    <div className="bk-play" data-skin={S.skin}>
      <div className="bk-col bk-left">
        <div className="bk-box"><span className="bk-lab">Halten</span><canvas ref={holdCv} className="bk-mini" /></div>
        <div className="bk-stats">
          {g.cfg.mode !== 'zen' && kind !== 'finesse' && <div><span>Punkte</span><b>{hud.score.toLocaleString('de-DE')}</b></div>}
          <div><span>Zeilen</span><b>{hud.lines}{g.cfg.mode === 'sprint' || g.cfg.mode === 'marathon' ? ` / ${g.cfg.goal}` : ''}</b></div>
          {(g.cfg.mode === 'marathon' || g.cfg.mode === 'ultra' || g.cfg.mode === 'sprint') && <div><span>Level</span><b>{hud.level}</b></div>}
          <div><span>Zeit</span><b>{g.cfg.mode === 'ultra' ? fmtTimeMs(Math.max(0, 120000 - hud.time)) : timeText}</b></div>
          <div><span>Steine/s</span><b>{hud.pps.toFixed(2)}</b></div>
          <div><span>Tasten/Stein</span><b>{hud.kpp.toFixed(2)}</b></div>
          {kind === 'duell' && <div><span>Angriff/min</span><b>{hud.apm.toFixed(0)}</b></div>}
          {g.cfg.mode === 'kaese' && <div><span>Käse übrig</span><b>{hud.cheese}</b></div>}
          {hud.combo > 0 && <div className="hot"><span>Combo</span><b>{hud.combo}×</b></div>}
          {hud.b2b > 0 && <div className="hot"><span>Back-to-Back</span><b>{hud.b2b}</b></div>}
        </div>
      </div>

      <div className="bk-col bk-mid">
        <div className="bk-boardwrap" style={{ borderColor: B.frame }}>
          <div className="bk-garbage" aria-hidden="true"><i style={{ height: `${garbageBar * 100}%` }} /></div>
          <canvas ref={canvas} className="bk-board" style={{ width: g.W * cell, height: g.cfg.h * cell }} />
          {banner && <div className="bk-banner" key={banner.key}>{banner.text}</div>}
          {hud.count > 0 && countdown.current > 0 && kind !== 'replay' && <div className="bk-count" key={hud.count}>{hud.count}</div>}
          {paused && (
            <div className="bk-overlay" role="dialog" aria-label="Pause">
              <h3>Pause</h3>
              <button onClick={() => setPaused(false)} autoFocus>Weiter</button>
              <button onClick={onRestart}>Neustart</button>
              <button onClick={onExit}>Beenden</button>
            </div>
          )}
          {outcome && kind === 'puzzle' && (
            <div className="bk-overlay" role="dialog">
              <h3>{outcome.text}</h3>
              <button onClick={onRestart}>{outcome.ok ? 'Nochmal' : 'Neu versuchen'}</button>
              <button onClick={onExit}>Zurück</button>
            </div>
          )}
        </div>
        {kind === 'finesse' && target && (
          <div className="bk-fin">
            <b>Ziel: grüne Lage mit möglichst wenigen Tasten</b>
            <span>Optimum {target.min} · Serie {fin.streak} (Best {fin.best}) · {fin.perfect}/{fin.total} optimal</span>
            <em>{fin.msg || 'Platziere den Stein auf dem grünen Feld und lass ihn fallen.'}</em>
          </div>
        )}
        {S.touch && (
          <div className="bk-touch">
            <div>{tbtn(K_LEFT, '◀')}{tbtn(K_DOWN, '▼')}{tbtn(K_RIGHT, '▶')}</div>
            <div>{tbtn(K_HOLD, 'Halten')}{tbtn(K_CCW, '⟲')}{tbtn(K_CW, '⟳')}{tbtn(K_HARD, 'Drop', 'main')}</div>
          </div>
        )}
      </div>

      <div className="bk-col bk-right">
        <div className="bk-box"><span className="bk-lab">Nächste</span>
          {Array.from({ length: Math.min(6, g.cfg.nextCount) }, (_, i) => <canvas key={i} ref={(el) => { nextCvs.current[i] = el; }} className="bk-mini" />)}
        </div>
        {kind === 'duell' && opp.current && (
          <div className="bk-box bk-opp">
            <span className="bk-lab">Computer · {hud.oppIncoming > 0 ? `+${hud.oppIncoming} Müll` : 'bereit'}</span>
            <canvas ref={oppCanvas} className="bk-board small" style={{ width: opp.current.W * oppCell, height: opp.current.cfg.h * oppCell }} />
          </div>
        )}
        {kind === 'replay' && (
          <div className="bk-box"><span className="bk-lab">Wiederholung</span>
            <div className="bk-speed">{[0.5, 1, 2, 4].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
            <button className="bk-link" onClick={onRestart}>Von vorn</button>
          </div>
        )}
        <button className="bk-link" onClick={() => setPaused(true)}>Pause (Esc)</button>
        <button className="bk-link" onClick={onExit}>Beenden</button>
      </div>
    </div>
  );
}
