import { useEffect, useMemo, useRef, useState } from 'react';
import Board, { trackPieces } from './Board';
import type { WSettings, ModeW } from './data';
import { askHint, askJudge, askMove, cancelAi } from './aiClient';
import {
  ATT, DEF, GRADE_TXT, KING, LEVELS, VARIANTS, clonePos, exposed, kingExits, legalMoves, make, movesFrom, newPos, notate, result, sideOf,
  type Grade, type Mv, type Pos, type Result, type Side,
} from './engine';
import { useKeys } from '../shared/hooks';
import { sfx } from '../shared/sfx';
import { fmtTime } from '../shared/store';
import { mulberry32 } from '../shared/rng';

export interface PlaySetup {
  variant: string;
  mode: ModeW;
  level: number;
  side: Side;
  coach: boolean;
  threats: boolean;
  secrets: { odin: boolean; mjoelnir: boolean; ragnarok: boolean };
  seed: number;
}

export interface FinishInfo {
  setup: PlaySetup;
  result: NonNullable<Result>;
  human: Side | null;
  moves: Mv[];
  removed: number[];
  /** Schläge des Menschen, verlorene Verteidiger des Menschen */
  captures: number;
  lostDefenders: number;
  helped: boolean;
  usedSecret: boolean;
  coach: { best: number; good: number; bad: number };
  seconds: number;
}

interface Entry { mv: Mv; by: Side; capKinds: number[]; grade?: Grade; hash: number }

export const startPos = (setup: Pick<PlaySetup, 'variant' | 'secrets' | 'seed'>): { pos: Pos; removed: number[] } => {
  const v = VARIANTS.find((x) => x.id === setup.variant) ?? VARIANTS[0];
  const pos = newPos(v);
  const removed: number[] = [];
  if (setup.secrets.mjoelnir) {
    const rnd = mulberry32(setup.seed ^ 0x5bd1e995);
    const atts: number[] = [];
    for (let i = 0; i < pos.b.length; i++) if (pos.b[i] === ATT) atts.push(i);
    for (let k = 0; k < 4 && atts.length; k++) { const j = Math.floor(rnd() * atts.length); const i = atts.splice(j, 1)[0]; pos.b[i] = 0; removed.push(i); }
  }
  return { pos, removed };
};

export const rebuildPos = (v: string, removed: number[], moves: Mv[], upTo: number): Pos => {
  const vv = VARIANTS.find((x) => x.id === v) ?? VARIANTS[0];
  const p = newPos(vv);
  for (const i of removed) p.b[i] = 0;
  for (let k = 0; k < upTo; k++) make(p, moves[k]);
  return p;
};

const SIDE_NAME = ['Angreifer', 'Verteidiger'] as const;

export default function WikPlay({ setup, S, onFinish, onExit }: { setup: PlaySetup; S: WSettings; onFinish: (i: FinishInfo) => void; onExit: () => void }) {
  const { mode, level, side } = setup;
  const human: Side | null = mode === 'ki' ? side : null;
  const variant = VARIANTS.find((x) => x.id === setup.variant) ?? VARIANTS[0];
  const start = useMemo(() => startPos(setup), []); // eslint-disable-line react-hooks/exhaustive-deps
  const posRef = useRef<Pos>(clonePos(start.pos));
  const entriesRef = useRef<Entry[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [, bump] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<Mv | null>(null);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<number | null>(null);
  const [fb, setFb] = useState<{ grade: Grade; text: string } | null>(null);
  const [done, setDone] = useState<FinishInfo | null>(null);
  const [secs, setSecs] = useState(0);
  const [showThreats, setShowThreats] = useState(setup.threats || setup.secrets.ragnarok);
  const seen = useRef(new Set<number>([start.pos.hash]));
  const stats = useRef({ captures: 0, lostDef: 0, helped: false, coach: { best: 0, good: 0, bad: 0 } });
  const finished = useRef(false);
  const aiToken = useRef(0);

  const pos = posRef.current;
  const shown = view === null ? pos : rebuildPos(setup.variant, start.removed, entries.map((e) => e.mv), view);
  const res = result(pos);
  const myTurn = !res && !thinking && view === null && (human === null || pos.turn === human);

  useEffect(() => { if (done) return; const id = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(id); }, [done]);
  useEffect(() => () => cancelAi(), []);

  const finish = () => {
    if (finished.current) return;
    const r = result(posRef.current);
    if (!r) return;
    finished.current = true;
    const info: FinishInfo = {
      setup, result: r, human, moves: entriesRef.current.map((e) => e.mv), removed: start.removed, captures: stats.current.captures, lostDefenders: stats.current.lostDef,
      helped: stats.current.helped, usedSecret: setup.secrets.odin || setup.secrets.mjoelnir || setup.secrets.ragnarok, coach: stats.current.coach, seconds: secs,
    };
    setDone(info);
    const won = r.winner !== 'draw' && (human === null || r.winner === human);
    sfx(r.winner === 'draw' ? 'tick' : won ? 'win' : 'lose');
    onFinish(info);
  };

  const play = (m: Mv, grade?: Grade) => {
    const st = posRef.current, by = st.turn;
    const u = make(st, m);
    const kinds = u.captured.map((c) => c.x);
    if (human === null || by === human) stats.current.captures += kinds.filter((k) => k !== KING).length;
    if (human !== null) stats.current.lostDef += by !== human && human === 1 ? kinds.filter((k) => k === DEF).length : 0;
    sfx(kinds.length ? 'boom' : 'tick');
    seen.current.add(st.hash);
    const e: Entry = { mv: m, by, capKinds: kinds, grade, hash: st.hash };
    entriesRef.current = [...entriesRef.current, e];
    setEntries(entriesRef.current);
    setSel(null); setHint(null);
    bump((x) => x + 1);
    if (result(st)) finish();
  };

  // KI am Zug
  useEffect(() => {
    if (human === null || res || done || view !== null || pos.turn === human) return;
    const token = ++aiToken.current;
    setThinking(true);
    const id = setTimeout(async () => {
      const m = await askMove(clonePos(posRef.current), level, (setup.seed + entriesRef.current.length * 977) >>> 0, [...seen.current]);
      if (token !== aiToken.current) return;
      setThinking(false);
      if (legalMoves(posRef.current).some((x) => x.from === m.from && x.to === m.to)) play(m);
    }, 350);
    return () => { clearTimeout(id); };
  }, [entries.length, view, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Odins Auge: bester Zug ständig sichtbar
  useEffect(() => {
    if (!setup.secrets.odin || !myTurn) return;
    stats.current.helped = true;
    let live = true;
    askHint(clonePos(posRef.current)).then((m) => { if (live && m) setHint(m); });
    return () => { live = false; };
  }, [entries.length, myTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  const humanMove = async (m: Mv) => {
    if (!myTurn) return;
    setMsg(''); setFb(null);
    if (setup.coach && human !== null) {
      setThinking(true);
      const before = clonePos(posRef.current);
      const g = await askJudge(before, m);
      setThinking(false);
      const t = stats.current.coach;
      if (g.grade === 'best') t.best++; else if (g.grade === 'good') t.good++; else t.bad++;
      setFb({ grade: g.grade, text: g.grade === 'best' || g.grade === 'good' ? GRADE_TXT[g.grade] : `${GRADE_TXT[g.grade]} – besser war ${notate(before, g.best)}` });
      play(m, g.grade);
    } else play(m);
  };

  const onSquare = (i: number) => {
    if (!myTurn) return;
    const x = pos.b[i];
    if (sel !== null && movesFrom(pos, sel).includes(i)) { void humanMove({ from: sel, to: i }); return; }
    if (x && sideOf(x) === pos.turn) { setSel(sel === i ? null : i); return; }
    setSel(null);
  };

  const undoMove = () => {
    if (done || thinking || !entriesRef.current.length) return;
    stats.current.helped = true;
    aiToken.current++;
    const list = entriesRef.current.slice();
    const drop = human === null ? 1 : list[list.length - 1].by === human ? 1 : 2;
    const keep = list.slice(0, Math.max(0, list.length - drop));
    posRef.current = rebuildPos(setup.variant, start.removed, keep.map((e) => e.mv), keep.length);
    entriesRef.current = keep;
    seen.current = new Set([start.pos.hash, ...keep.map((e) => e.hash)]);
    setEntries(keep); setSel(null); setHint(null); setFb(null); setMsg(''); setView(null);
    bump((x) => x + 1);
  };

  const getHint = async () => {
    if (!myTurn) return;
    stats.current.helped = true;
    setThinking(true);
    const m = await askHint(clonePos(posRef.current));
    setThinking(false);
    if (m) { setHint(m); setMsg(`Tipp: ${notate(pos, m)}`); }
  };

  useKeys((e) => {
    if (e.key === 'z' || e.key === 'Z') undoMove();
    else if (e.key === 'h' || e.key === 'H') void getHint();
    else if (e.key === 'ArrowLeft' && done) setView((v) => Math.max(0, (v ?? entries.length) - 1));
    else if (e.key === 'ArrowRight' && done) setView((v) => (v === null || v + 1 >= entries.length ? null : v + 1));
    else if (e.key === 'Escape') setSel(null);
  }, [entries.length, myTurn, done]);

  const pieces = useMemo(() => trackPieces(start.pos, entries.map((e) => e.mv), view ?? entries.length), [entries, view, start]);
  const lastMv = view === null ? entries[entries.length - 1]?.mv : view > 0 ? entries[view - 1].mv : null;
  const lastEntry = view === null ? entries[entries.length - 1] : view > 0 ? entries[view - 1] : undefined;
  const flash = useMemo(() => {
    if (!lastEntry || !lastEntry.capKinds.length) return [];
    // geschlagene Felder: Unterschied zwischen vorherigem und jetzigem Brett
    const idx = view === null ? entries.length - 1 : view - 1;
    const prev = rebuildPos(setup.variant, start.removed, entries.map((e) => e.mv), idx);
    const now = idx + 1 === entries.length && view === null ? posRef.current : rebuildPos(setup.variant, start.removed, entries.map((e) => e.mv), idx + 1);
    const out: number[] = [];
    for (let i = 0; i < prev.b.length; i++) if (prev.b[i] && !now.b[i] && i !== lastEntry.mv.from) out.push(i);
    return out;
  }, [entries, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const targets = sel !== null && myTurn ? movesFrom(pos, sel) : [];
  const watch = human ?? pos.turn;
  const danger = showThreats && view === null && !res ? exposed(pos, watch as Side) : [];
  const exits = view === null && !res && kingExits(pos).length ? kingExits(pos) : [];
  const exitWarn = exits.length > 0 && (pos.turn === 0 || (human === 0));
  const counts = { a: 0, d: 0 };
  for (let i = 0; i < shown.b.length; i++) { if (shown.b[i] === ATT) counts.a++; else if (shown.b[i] === DEF) counts.d++; }
  const startCounts = { a: 0, d: 0 };
  for (let i = 0; i < start.pos.b.length; i++) { if (start.pos.b[i] === ATT) startCounts.a++; else if (start.pos.b[i] === DEF) startCounts.d++; }

  const winnerName = done && done.result.winner !== 'draw' ? SIDE_NAME[done.result.winner] : '';
  const status = done
    ? (done.result.winner === 'draw' ? 'Remis' : human === null ? `${winnerName} gewinnen` : done.result.winner === human ? 'Gewonnen!' : 'Verloren')
    : thinking ? (setup.coach && human !== null && myTurn === false && pos.turn === human ? 'Der Skalde bewertet …' : 'Die KI überlegt …')
      : view !== null ? `Zug ${view} von ${entries.length}` : human === null ? `${SIDE_NAME[pos.turn]} am Zug` : pos.turn === human ? 'Du bist am Zug' : '…';
  const whoLabel = (s: Side) => (human === null ? SIDE_NAME[s] : s === human ? `${SIDE_NAME[s]} (du)` : `${SIDE_NAME[s]} (${LEVELS[level - 1].name})`);

  return (
    <div className="wk-play">
      <div className="wk-boardwrap">
        <div className={`wk-plate a${shown.turn === 0 && !res ? ' turn' : ''}`}><i /><b>{whoLabel(0)}</b><span>{counts.a} / {startCounts.a}</span></div>
        <Board v={variant} pieces={pieces} sel={sel} targets={targets} onSquare={onSquare} last={lastMv} flash={flash} danger={danger} exits={exitWarn ? exits : undefined} hint={hint} interactive={myTurn} />
        <div className={`wk-plate d${shown.turn === 1 && !res ? ' turn' : ''}`}><i /><b>{whoLabel(1)}</b><span>{counts.d} / {startCounts.d} + König</span></div>
      </div>
      <aside className="wk-side">
        <div className={'wk-status' + (done ? (done.result.winner === human || (human === null && done.result.winner !== 'draw') ? ' won' : done.result.winner === 'draw' ? '' : ' lost') : '')}>
          <b>{status}</b>
          <span>{variant.name} · {mode === 'ki' ? `Stufe ${level} ${LEVELS[level - 1].name}` : 'zu zweit'} · {fmtTime(secs)}</span>
        </div>
        {exitWarn && !done && view === null && <p className="wk-alarm">{human === 0 || (human === null && pos.turn === 0) ? 'Der König droht zu entkommen – blockiere die Linie!' : 'Fluchtweg frei!'}</p>}
        {msg && <p className="wk-msg">{msg}</p>}
        {fb && <p className={`wk-fb ${fb.grade}`}>{fb.text}</p>}
        {!done && (
          <div className="wk-tools">
            <button onClick={() => void getHint()} disabled={!myTurn} title="Taste H">Tipp</button>
            <button onClick={undoMove} disabled={!entries.length || thinking} title="Taste Z">Zurück</button>
            <button className={showThreats ? 'on' : ''} onClick={() => setShowThreats((x) => !x)}>Bedrohungen</button>
          </div>
        )}
        <p className="wk-keys">Klicke eine Figur an, dann ein Zielfeld. Rot umrandete Figuren können im nächsten Zug geschlagen werden. {variant.escape === 'corner' ? 'Der König muss in eine Ecke' : 'Der König muss an den Rand'}; die Angreifer müssen ihn einklemmen.</p>
        <ol className="wk-moves" aria-label="Zugliste">
          {Array.from({ length: Math.ceil(entries.length / 2) }, (_, i) => (
            <li key={i}>
              <span className="no">{i + 1}.</span>
              {[entries[2 * i], entries[2 * i + 1]].map((e, j) => e && (
                <button key={j} className={`mv${view === 2 * i + j + 1 ? ' on' : ''}${e.grade ? ' ' + e.grade : ''}`} onClick={() => done && setView(2 * i + j + 1 === entries.length ? null : 2 * i + j + 1)} title={e.grade ? GRADE_TXT[e.grade] : undefined}>{notate(variant, e.mv, e.capKinds.length > 0)}{e.capKinds.length > 1 ? '×' + e.capKinds.length : ''}</button>
              ))}
            </li>
          ))}
        </ol>
        {done && (
          <div className="wk-end">
            <p>{done.result.why} Nach {Math.ceil(done.moves.length / 2)} Zügen. Mit ←/→ siehst du die Partie noch einmal.</p>
            {setup.coach && human !== null && (done.coach.best + done.coach.good + done.coach.bad > 0) && <p>Skalde: {done.coach.best} beste, {done.coach.good} gute, {done.coach.bad} schwächere Züge.</p>}
            <div className="wk-tools"><button className="primary" onClick={onExit}>Menü</button></div>
          </div>
        )}
        {!done && <div className="wk-tools"><button className="danger" onClick={() => { if (confirm('Partie aufgeben?')) onExit(); }}>Aufgeben</button></div>}
      </aside>
    </div>
  );
}

