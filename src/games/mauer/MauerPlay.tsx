import { useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board';
import type { MSettings, ModeM } from './data';
import {
  GRADE_TXT, LEVELS, aiMove, apply, clone, distance, gradeMove, legal, newState, notate, pawnMoves, posKey, sameMove, scoreMoves, shortestPath, wallLegal, winner,
  type Grade, type Move, type Rules, type State,
} from './engine';
import { useKeys } from '../shared/hooks';
import { mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { fmtTime } from '../shared/store';

export interface PlaySetup {
  rules: Rules;
  presetKey: string;
  mode: ModeM;
  level: number;
  side: 0 | 1;
  coach: boolean;
  /** Wirkung der Geheimnisse */
  secrets: { ariadne: boolean; minotaurus: boolean; daedalus: boolean };
  seed?: number;
}

export interface FinishInfo {
  setup: PlaySetup;
  winner: 0 | 1;
  /** Seite des Menschen, bei „zu zweit“ null */
  human: 0 | 1 | null;
  plies: number;
  walls: number;
  jumps: number;
  maxDeficit: number;
  helped: boolean;
  usedSecret: boolean;
  coach: { best: number; good: number; bad: number };
  moves: Move[];
  seconds: number;
}

interface Entry { m: Move; by: 0 | 1; grade?: Grade; key: string }

const NAMES: [string, string] = ['Weiß', 'Orange'];

function rebuild(init: () => State, entries: Entry[], upTo: number): State {
  const s = init();
  for (let i = 0; i < upTo; i++) apply(s, entries[i].m);
  return s;
}

export default function MauerPlay({ setup, S, onFinish, onExit }: { setup: PlaySetup; S: MSettings; onFinish: (i: FinishInfo) => void; onExit: () => void }) {
  const { rules, mode, level, side } = setup;
  const human: 0 | 1 | null = mode === 'ki' ? side : null;
  const rulesNow = useMemo<Rules>(() => rules, [rules]);
  const init = () => {
    const st = newState(rulesNow);
    if (setup.secrets.minotaurus && human !== null) st.left[(1 - human) as 0 | 1] = Math.max(1, rulesNow.walls - 3);
    return st;
  };
  const sRef = useRef<State>(null as unknown as State);
  if (!sRef.current) sRef.current = init();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [, bump] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [wallMode, setWallMode] = useState(false);
  const [paths, setPaths] = useState(S.paths || setup.secrets.ariadne);
  const [hint, setHint] = useState<Move | null>(null);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<number | null>(null);
  const [fb, setFb] = useState<{ grade: Grade; text: string } | null>(null);
  const [done, setDone] = useState<FinishInfo | null>(null);
  const [secs, setSecs] = useState(0);
  const stats = useRef({ walls: 0, jumps: 0, maxDeficit: 0, helped: false, coach: { best: 0, good: 0, bad: 0 } });
  const seen = useRef(new Set<string>());
  const rnd = useRef(mulberry32((setup.seed ?? 1) ^ 0x9e3779b9));
  const finished = useRef(false);

  const s = sRef.current;
  const shown = view === null ? s : rebuild(init, entries, view);
  const win = winner(s);
  const myTurn = !win && !thinking && view === null && (human === null || s.turn === human);

  useEffect(() => { seen.current = new Set([posKey(init())]); }, [rulesNow]);
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [done]);

  const ownerOf = (m: Move): 0 | 1 | undefined => {
    const e = entries.find((x) => sameMove(x.m, m));
    return e ? e.by : undefined;
  };

  const finish = () => {
    if (finished.current) return;
    const w = winner(sRef.current);
    if (w === null) return;
    finished.current = true;
    const info: FinishInfo = {
      setup, winner: w, human, plies: sRef.current.plies, walls: stats.current.walls, jumps: stats.current.jumps, maxDeficit: stats.current.maxDeficit,
      helped: stats.current.helped, usedSecret: setup.secrets.ariadne || setup.secrets.minotaurus, coach: stats.current.coach, moves: entriesRef.current.map((e) => e.m), seconds: secs,
    };
    setDone(info);
    sfx(human === null || w === human ? 'win' : 'lose');
    onFinish(info);
  };
  const entriesRef = useRef<Entry[]>([]);
  entriesRef.current = entries;

  const play = (m: Move, grade?: Grade) => {
    const st = sRef.current, by = st.turn;
    const from = st.pawn[by];
    if (m.t === 'm') {
      if (Math.abs(m.r - from.r) + Math.abs(m.c - from.c) >= 2 && (human === null || by === human)) stats.current.jumps++;
    } else if (human === null || by === human) stats.current.walls++;
    apply(st, m);
    sfx(m.t === 'm' ? 'tick' : 'place');
    const key = posKey(st);
    seen.current.add(key);
    const e: Entry = { m, by, grade, key };
    entriesRef.current = [...entriesRef.current, e];
    setEntries(entriesRef.current);
    setHint(null);
    if (human !== null) {
      const d = distance(st, human) - distance(st, (1 - human) as 0 | 1);
      stats.current.maxDeficit = Math.max(stats.current.maxDeficit, d);
    }
    bump((x) => x + 1);
    if (winner(st) !== null) finish();
  };

  // KI am Zug
  useEffect(() => {
    if (human === null || win || done || view !== null) return;
    if (s.turn === human) return;
    setThinking(true);
    const id = setTimeout(() => {
      const m = aiMove(sRef.current, level, rnd.current, seen.current);
      setThinking(false);
      if (legal(sRef.current, m)) play(m);
    }, 380);
    return () => { clearTimeout(id); setThinking(false); };
  }, [entries.length, view, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const humanMove = (m: Move) => {
    if (!myTurn) return;
    if (!legal(s, m)) { setMsg(m.t === 'm' ? 'Dorthin darfst du nicht ziehen.' : 'Diese Mauer ist nicht erlaubt.'); sfx('bad'); return; }
    setMsg('');
    setFb(null);
    let grade: Grade | undefined;
    if (setup.coach && human !== null) {
      const g = gradeMove(clone(s), m, 3, 600);
      grade = g.grade;
      const t = stats.current.coach;
      if (g.grade === 'best') t.best++; else if (g.grade === 'good') t.good++; else t.bad++;
      setFb({ grade: g.grade, text: g.grade === 'best' || g.grade === 'good' ? GRADE_TXT[g.grade] : `${GRADE_TXT[g.grade]} – besser war ${notate(s.n, g.best)}` });
    }
    play(m, grade);
  };

  const undoMove = () => {
    if (done || thinking || !entriesRef.current.length) return;
    stats.current.helped = true;
    let list = entriesRef.current.slice();
    const drop = human === null ? 1 : (list[list.length - 1].by === human ? 1 : 2);
    list = list.slice(0, Math.max(0, list.length - drop));
    const st = rebuild(init, list, list.length);
    sRef.current = st;
    entriesRef.current = list;
    seen.current = new Set(list.map((e) => e.key));
    setEntries(list); setHint(null); setFb(null); setMsg(''); setView(null);
    bump((x) => x + 1);
  };

  const getHint = () => {
    if (!myTurn) return;
    stats.current.helped = true;
    const sc = scoreMoves(clone(s), 4, 10, 800);
    if (sc.length) { setHint(sc[0].m); setMsg(`Tipp: ${notate(s.n, sc[0].m)}`); }
  };

  useKeys((e) => {
    if (e.key === 'w' || e.key === 'W') { setWallMode((x) => !x); }
    else if (e.key === 'z' || e.key === 'Z') undoMove();
    else if (e.key === 'h' || e.key === 'H') getHint();
    else if (e.key === 'ArrowLeft' && done) setView((v) => Math.max(0, (v ?? entries.length) - 1));
    else if (e.key === 'ArrowRight' && done) setView((v) => (v === null || v + 1 >= entries.length ? null : v + 1));
  }, [entries.length, myTurn, done]);

  const targets = myTurn && view === null ? pawnMoves(s) : [];
  const pth: [ReturnType<typeof shortestPath>, ReturnType<typeof shortestPath>] | null = paths ? [shortestPath(shown, 0), shortestPath(shown, 1)] : null;
  const d0 = distance(shown, 0), d1 = distance(shown, 1);
  const lastM = view === null ? entries[entries.length - 1]?.m : view > 0 ? entries[view - 1].m : null;
  const whoName = (p: 0 | 1) => (human === null ? NAMES[p] : p === human ? `${NAMES[p]} (du)` : `${NAMES[p]} (${LEVELS[level - 1].name})`);

  const status = done
    ? (done.winner === human ? 'Gewonnen!' : human === null ? `${NAMES[done.winner]} gewinnt` : 'Verloren')
    : thinking ? 'Die KI überlegt …' : view !== null ? `Zug ${view} von ${entries.length}` : human === null ? `${NAMES[s.turn]} ist am Zug` : s.turn === human ? 'Du bist am Zug' : '…';

  return (
    <div className="mb-play">
      <div className="mb-boardwrap">
        <div className={`mb-plate top p1${shown.turn === 1 && !win ? ' turn' : ''}`}>
          <b>{whoName(1)}</b><Stock n={shown.left[1]} max={rulesNow.walls} /><span className="mb-dist">Weg {d1}</span>
        </div>
        <Board
          s={shown} targets={targets} canAct={myTurn && view === null} wallMode={wallMode}
          wallOk={(m) => wallLegal(s, m)} onMove={humanMove} last={lastM} hint={hint} paths={pth} owner={ownerOf} names={NAMES}
        />
        <div className={`mb-plate bot p0${shown.turn === 0 && !win ? ' turn' : ''}`}>
          <b>{whoName(0)}</b><Stock n={shown.left[0]} max={rulesNow.walls} /><span className="mb-dist">Weg {d0}</span>
        </div>
      </div>
      <aside className="mb-side">
        <div className={'mb-status' + (done ? (done.winner === human ? ' won' : ' lost') : '')}>
          <b>{status}</b>
          <span>{rulesNow.n}×{rulesNow.n} · {setup.mode === 'ki' ? `Stufe ${level} ${LEVELS[level - 1].name}` : 'zu zweit'} · {fmtTime(secs)}</span>
        </div>
        {msg && <p className="mb-msg">{msg}</p>}
        {fb && <p className={`mb-fb ${fb.grade}`}>{fb.text}</p>}
        {!done && (
          <div className="mb-tools">
            <button className={wallMode ? 'on' : ''} onClick={() => setWallMode((x) => !x)} title="Taste W">Mauer-Modus</button>
            <button onClick={getHint} disabled={!myTurn} title="Taste H">Tipp</button>
            <button onClick={undoMove} disabled={!entries.length || thinking} title="Taste Z">Zurück</button>
            <button className={paths ? 'on' : ''} onClick={() => setPaths((x) => !x)}>Wege</button>
          </div>
        )}
        <p className="mb-keys">Klicke ein markiertes Feld zum Ziehen. Eine Mauer setzt du, indem du auf eine Fuge zwischen den Feldern klickst (Rechtsklick oder Taste R dreht sie in Kreuzungen). Mit Mauer-Modus reicht ein Klick irgendwo.</p>
        <ol className="mb-moves" aria-label="Zugliste">
          {Array.from({ length: Math.ceil(entries.length / 2) }, (_, i) => (
            <li key={i}>
              <span className="no">{i + 1}.</span>
              {[entries[2 * i], entries[2 * i + 1]].map((e, j) => e && (
                <button key={j} className={`mv${view === 2 * i + j + 1 ? ' on' : ''}${e.grade ? ' ' + e.grade : ''}`} onClick={() => done && setView(2 * i + j + 1 === entries.length ? null : 2 * i + j + 1)} title={e.grade ? GRADE_TXT[e.grade] : undefined}>{notate(rulesNow.n, e.m)}</button>
              ))}
            </li>
          ))}
        </ol>
        {done && (
          <div className="mb-end">
            <p>{done.winner === human ? `Sieg nach ${Math.ceil(done.plies / 2)} Zügen.` : human === null ? `${NAMES[done.winner]} hat nach ${Math.ceil(done.plies / 2)} Zügen gewonnen.` : `Die KI war nach ${Math.ceil(done.plies / 2)} Zügen im Ziel.`} Mit ←/→ siehst du die Partie noch einmal.</p>
            {setup.coach && human !== null && (done.coach.best + done.coach.good + done.coach.bad > 0) && <p>Coach: {done.coach.best} beste, {done.coach.good} gute, {done.coach.bad} schwächere Züge.</p>}
            <div className="mb-tools"><button className="primary" onClick={onExit}>Menü</button></div>
          </div>
        )}
        {!done && <div className="mb-tools"><button className="danger" onClick={() => { if (confirm('Partie aufgeben?')) onExit(); }}>Aufgeben</button></div>}
      </aside>
    </div>
  );
}

function Stock({ n, max }: { n: number; max: number }) {
  return <span className="mb-stock" aria-label={`${n} Mauern übrig`}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}
