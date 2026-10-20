import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cancelAi, askDead, askEstimate, askMove } from './aiClient';
import { LEVELS } from './ai';
import type { GSettings } from './data';
import GoBoard, { type Mark } from './GoBoard';
import { BLACK, type Color, type GoState, WHITE, coord, groupAt, handicapPoints, neighbors, newState, other, play, score, setStones, territoryOf, toSgf } from './engine';
import type { Mv, Setup } from './types';
import { useKeys, useTicker } from '../shared/hooks';
import { freshSeed } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, fmtTime, toast } from '../shared/store';

export interface FinishInfo { setup: Setup; moves: Mv[]; states: GoState[]; resultText: string; winner: Color | 0; resigned: boolean; helped: boolean; dead: number[]; seconds: number; koSeen: boolean }

interface Game { states: GoState[]; moves: Mv[]; phase: 'play' | 'score' | 'over'; dead: number[]; result: string; winner: Color | 0 }

const cname = (c: Color) => (c === BLACK ? 'Schwarz' : 'Weiß');

export function initialGame(setup: Setup, tengen: boolean): { game: Game; handicapPts: number[] } {
  if (setup.resume) {
    const st = setup.resume.states;
    return { game: { states: st.slice(), moves: setup.resume.moves.slice(), phase: 'play', dead: [], result: '', winner: 0 }, handicapPts: setup.resume.handicapPts };
  }
  const n = setup.rules.n;
  let pts = setup.handicap >= 2 ? handicapPoints(n, setup.handicap) : [];
  if (tengen && !pts.length) pts = [Math.floor(n / 2) * n + Math.floor(n / 2)];
  const s0 = newState(setup.rules);
  const s = pts.length ? setStones(s0, pts, [], WHITE) : s0;
  return { game: { states: [s], moves: [], phase: 'play', dead: [], result: '', winner: 0 }, handicapPts: pts };
}

export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/x-go-sgf;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function GoPlay({ setup, S, orakel, tengen, onTengenUsed, onFinish, onExit, onAgain }: { orakel: boolean; tengen: boolean; onTengenUsed: () => void; setup: Setup; S: GSettings; onFinish: (i: FinishInfo) => void; onExit: () => void; onAgain: () => void }) {
  const flags = useRef({ helped: tengen, koSeen: false });
  const secsRef = useRef(0);
  const init = useMemo(() => initialGame(setup, tengen), [setup]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tengen) onTengenUsed(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [game, setGameState] = useState<Game>(init.game);
  const gref = useRef(game);
  const setGame = (g: Game) => { gref.current = g; setGameState(g); };
  const handicapPts = init.handicapPts;
  const [thinking, setThinking] = useState(false);
  const [est, setEst] = useState<{ own: Float32Array; winrate: number; lead: number } | null>(null);
  const [hint, setHint] = useState(-1);
  const [msg, setMsg] = useState('');
  const [secs, setSecs] = useState(0);
  const [pending, setPending] = useState(-1);
  const aiTok = useRef(0);
  const doneRef = useRef(false);

  const states = game.states;
  const cur = states[states.length - 1];
  const n = setup.rules.n;
  const nb = useMemo(() => neighbors(n, setup.rules.torus), [n, setup.rules.torus]);
  const humanTurn = setup.opp === 'zwei' || cur.turn === setup.human;

  useTicker(game.phase === 'play', (dt) => { secsRef.current += dt / 1000; setSecs(secsRef.current); }, 1000);

  const record = (g: Game, extra: Partial<FinishInfo>) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinish({ setup, moves: g.moves, states: g.states, resultText: g.result, winner: g.winner, resigned: false, helped: flags.current.helped, dead: g.dead, seconds: Math.round(secsRef.current), koSeen: flags.current.koSeen, ...extra });
  };

  const finishScore = (g: Game, dead: number[]) => {
    const last = g.states[g.states.length - 1];
    const sc = score(last, new Set(dead));
    const ng: Game = { ...g, phase: 'over', dead, winner: sc.winner, result: sc.text + ` (Schwarz ${fmt(sc.black)} : Weiß ${fmt(sc.white)})` };
    setGame(ng);
    sfx(setup.human === 0 || sc.winner === setup.human ? 'win' : 'lose');
    record(ng, {});
  };

  const enterScoring = (g: Game) => {
    const ng: Game = { ...g, phase: 'score', dead: [] };
    setGame(ng);
    setEst(null); setHint(-1);
    askDead(ng.states[ng.states.length - 1]).then((d) => {
      const c = gref.current;
      if (c.phase !== 'score' || c.states.length !== ng.states.length) return;
      setGame({ ...c, dead: d });
      setMsg(d.length ? 'Die KI schlägt tote Steine vor (rot gekreuzt). Klicke auf Gruppen, um sie zu ändern.' : 'Keine toten Steine erkannt. Klicke auf Gruppen, um welche zu markieren.');
    });
    setMsg('Beide haben gepasst. Markiere tote Steine …');
  };

  const commit = useCallback((idx: number, color: Color) => {
    const g = gref.current;
    if (g.phase !== 'play') return false;
    const cur0 = g.states[g.states.length - 1];
    const r = play(cur0, idx, color);
    if (!r.ok) { setMsg(r.reason); sfx('bad'); return false; }
    if (r.state.ko >= 0) flags.current.koSeen = true;
    const ng: Game = { ...g, states: [...g.states, r.state], moves: [...g.moves, { idx, color }] };
    setMsg('');
    setHint(-1);
    if (S.sound) { if (r.captured.length) { sfx('pop'); } else sfx(idx < 0 ? 'tick' : 'place'); }
    if (r.state.winner) {
      const w = r.state.winner;
      const res: Game = { ...ng, phase: 'over', winner: w, result: `${cname(w)} fängt zuerst – ${cname(w)} gewinnt.` };
      setGame(res);
      sfx(setup.human === 0 || w === setup.human ? 'win' : 'lose');
      record(res, {});
      return true;
    }
    setGame(ng);
    if (r.state.passes >= 2) { enterScoring(ng); return true; }
    if (orakel) refreshEst(r.state);
    else setEst(null);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.sound, orakel]);

  const refreshEst = (s: GoState) => {
    askEstimate(s, n >= 13 ? 140 : 260).then((e) => { if (gref.current.states[gref.current.states.length - 1] === s) setEst({ own: e.own, winrate: e.winrate, lead: e.lead }); });
  };

  // KI-Zug
  useEffect(() => {
    if (game.phase !== 'play' || setup.opp !== 'ki' || humanTurn || cur.winner) return;
    const tok = ++aiTok.current;
    setThinking(true);
    const t0 = performance.now();
    const s = cur;
    askMove(s, setup.level, freshSeed()).then((r) => {
      if (tok !== aiTok.current) return;
      const wait = Math.max(0, 420 - (performance.now() - t0));
      setTimeout(() => {
        if (tok !== aiTok.current) return;
        setThinking(false);
        if (!commit(r.move, s.turn)) commit(-1, s.turn);
      }, wait);
    });
    return () => { aiTok.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states.length, game.phase]);

  useEffect(() => () => { cancelAi(); }, []);

  const clickPoint = (i: number) => {
    if (game.phase === 'score') { toggleDead(i); return; }
    if (game.phase !== 'play' || !humanTurn || thinking) return;
    if (S.confirm && pending !== i) { if (cur.board[i] === 0) { setPending(i); } return; }
    setPending(-1);
    commit(i, cur.turn);
  };

  const toggleDead = (i: number) => {
    const g = gref.current;
    if (!cur.board[i]) return;
    const grp = groupAt(cur.board, nb, i).stones;
    const has = grp.some((x) => g.dead.includes(x));
    const dead = has ? g.dead.filter((x) => !grp.includes(x)) : [...g.dead, ...grp];
    setGame({ ...g, dead });
    sfx('tick');
  };

  const pass = () => { if (game.phase === 'play' && humanTurn && !thinking) { setPending(-1); commit(-1, cur.turn); } };

  const undo = () => {
    const g = gref.current;
    if (g.phase === 'over') return;
    aiTok.current++; cancelAi(); setThinking(false);
    let k = setup.opp === 'ki' ? (g.states.length > 1 && g.states[g.states.length - 1].turn !== setup.human ? 1 : 2) : 1;
    if (g.phase === 'score') k = setup.opp === 'ki' ? 2 : 1;
    const lenMin = init.game.states.length;
    const target = Math.max(lenMin, g.states.length - k);
    if (target === g.states.length) return;
    setGame({ ...g, states: g.states.slice(0, target), moves: g.moves.slice(0, target - lenMin), phase: 'play', dead: [] });
    setEst(null); setHint(-1); setMsg('');
    flags.current.helped = flags.current.helped || false;
    sfx('erase');
  };

  const giveHint = () => {
    if (game.phase !== 'play' || !humanTurn || thinking) return;
    flags.current.helped = true;
    setMsg('Die KI überlegt …');
    askMove(cur, 4, freshSeed()).then((r) => { setHint(r.move); setMsg(r.move < 0 ? 'Tipp: Passen.' : `Tipp: ${coord(n, r.move)}`); });
  };
  const estimateNow = () => {
    flags.current.helped = true;
    setMsg('Schätze …');
    askEstimate(cur, n >= 13 ? 220 : 500).then((e) => { setEst({ own: e.own, winrate: e.winrate, lead: e.lead }); setMsg(''); });
  };
  const resign = () => {
    if (game.phase === 'over') return;
    const loser = setup.opp === 'ki' ? (setup.human as Color) : cur.turn;
    const w = other(loser);
    aiTok.current++; cancelAi(); setThinking(false);
    const ng: Game = { ...gref.current, phase: 'over', winner: w, result: `${cname(loser)} gibt auf – ${cname(w)} gewinnt.` };
    setGame(ng);
    sfx('lose');
    record(ng, { resigned: true });
  };
  const resumePlay = () => {
    const g = gref.current;
    const s = g.states[g.states.length - 1];
    const t: GoState = { ...s, passes: 0, board: s.board, seen: s.seen, caps: s.caps };
    setGame({ ...g, phase: 'play', dead: [], states: [...g.states.slice(0, -1), t] });
    setMsg('');
  };

  const sgf = () => toSgf(setup.rules, game.moves, handicapPts);

  useKeys((e) => {
    if (e.key === 'p' || e.key === 'P') pass();
    else if (e.key === 'u' || e.key === 'U' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) undo();
    else if (e.key === 'h' || e.key === 'H') giveHint();
    else if (e.key === 'e' || e.key === 'E') estimateNow();
    else if (e.key === 'Escape') { setPending(-1); setEst(null); }
  }, [game, humanTurn, thinking]);

  const marks = useMemo(() => {
    const m: Record<number, Mark> = {};
    if (hint >= 0) m[hint] = 'hint';
    if (pending >= 0) m[pending] = 'sq';
    return m;
  }, [hint, pending]);

  const terr = game.phase !== 'play' ? territoryOf(cur, new Set(game.dead)) : null;
  const sc = game.phase !== 'play' ? score(cur, new Set(game.dead)) : null;
  const wr = est ? Math.round(est.winrate * 100) : null;
  const lastMove = game.moves.length ? game.moves[game.moves.length - 1] : null;

  const players: { c: Color; name: string; caps: number }[] = [
    { c: BLACK, name: setup.opp === 'ki' ? (setup.human === BLACK ? 'Du' : `KI · ${LEVELS.find((l) => l.id === setup.level)?.name}`) : 'Spieler Schwarz', caps: cur.caps[0] },
    { c: WHITE, name: setup.opp === 'ki' ? (setup.human === WHITE ? 'Du' : `KI · ${LEVELS.find((l) => l.id === setup.level)?.name}`) : 'Spieler Weiß', caps: cur.caps[1] },
  ];

  return (
    <div className="go-play">
      <div className="go-stage">
        <div className="go-boardwrap">
          <GoBoard
            n={n} board={cur.board} torus={setup.rules.torus} theme={S.board} stones={S.stones} coords={S.coords}
            last={S.showLast ? cur.last : undefined} ko={cur.ko}
            ghost={game.phase === 'play' && humanTurn && !thinking ? cur.turn : 0}
            marks={marks} own={game.phase === 'play' ? est?.own : undefined} terr={terr} dead={game.phase !== 'play' ? new Set(game.dead) : undefined}
            libsOnHover={S.showLibs} onPlay={clickPoint} isLegal={(i) => play(cur, i).ok}
          />
        </div>
        <aside className="go-panel">
          {players.map((p) => (
            <div key={p.c} className={`go-player ${cur.turn === p.c && game.phase === 'play' ? 'on' : ''}`}>
              <span className={`go-dot ${p.c === BLACK ? 'b' : 'w'}`} />
              <div><b>{p.name}</b><small>{setup.rules.atari ? 'Atari-Go' : `Gefangen: ${p.caps}`}{p.c === WHITE && !setup.rules.atari ? ` · Komi ${setup.rules.komi}` : ''}</small></div>
              {cur.turn === p.c && game.phase === 'play' && <em>{thinking ? 'denkt …' : 'am Zug'}</em>}
            </div>
          ))}
          <div className="go-info">
            <span>Zug {game.moves.length}{lastMove ? ` · ${lastMove.idx < 0 ? 'Pass' : coord(n, lastMove.idx)}` : ''}</span>
            <span>{fmtTime(secs)}</span>
            {setup.rules.torus && <span>Torus</span>}
            {handicapPts.length > 0 && <span>Vorgabe {handicapPts.length}</span>}
          </div>
          {wr !== null && game.phase === 'play' && (
            <div className="go-wr" title="Gewinnchance nach Monte-Carlo-Schätzung">
              <div style={{ width: `${wr}%` }} />
              <span>Schwarz {wr}% · {est!.lead > 0 ? 'Schwarz' : 'Weiß'} +{Math.abs(est!.lead).toFixed(1)}</span>
            </div>
          )}
          {msg && <p className="go-msg" role="status">{msg}</p>}
          {game.phase === 'play' && (
            <div className="go-actions">
              <button onClick={pass} disabled={!humanTurn || thinking}>Passen <kbd>P</kbd></button>
              <button onClick={undo} disabled={game.states.length <= init.game.states.length}>Zurück <kbd>U</kbd></button>
              {setup.opp === 'ki' && <button onClick={giveHint} disabled={!humanTurn || thinking}>Tipp <kbd>H</kbd></button>}
              <button onClick={estimateNow}>Schätzung <kbd>E</kbd></button>
              <button className="danger" onClick={resign}>Aufgeben</button>
            </div>
          )}
          {game.phase === 'score' && sc && (
            <div className="go-score">
              <h3>Zählen</h3>
              <p>Schwarz <b>{fmt(sc.black)}</b> · Weiß <b>{fmt(sc.white)}</b> <small>({setup.rules.scoring === 'flaeche' ? 'Fläche' : 'Gebiet'}, Komi {setup.rules.komi})</small></p>
              <p className="go-sub">{sc.text}</p>
              <div className="go-actions">
                <button className="primary" onClick={() => finishScore(gref.current, gref.current.dead)}>Ergebnis bestätigen</button>
                <button onClick={resumePlay}>Weiterspielen</button>
                <button onClick={() => askDead(cur).then((d) => setGame({ ...gref.current, dead: d }))}>KI-Vorschlag</button>
                <button onClick={() => setGame({ ...gref.current, dead: [] })}>Alle lebendig</button>
              </div>
            </div>
          )}
          {game.phase === 'over' && (
            <div className="go-over">
              <h3>{game.winner === 0 ? 'Ende' : setup.opp === 'ki' ? (game.winner === setup.human ? 'Sieg' : 'Niederlage') : `${cname(game.winner)} gewinnt`}</h3>
              <p>{game.result}</p>
              <div className="go-actions">
                <button className="primary" onClick={onAgain}>Nochmal</button>
                <button onClick={() => { achieve('go', 'sgf'); download(`partie-${new Date().toISOString().slice(0, 10)}.sgf`, sgf()); }}>SGF laden</button>
                <button onClick={() => { void navigator.clipboard?.writeText(sgf()); toast("SGF kopiert"); }}>SGF kopieren</button>
                <button onClick={onExit}>Menü</button>
              </div>
            </div>
          )}
          <details className="go-moves">
            <summary>Zugliste</summary>
            <ol>{game.moves.map((m, i) => <li key={i} className={m.color === BLACK ? 'b' : 'w'}>{m.idx < 0 ? 'Pass' : coord(n, m.idx)}</li>)}</ol>
          </details>
        </aside>
      </div>
    </div>
  );
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
