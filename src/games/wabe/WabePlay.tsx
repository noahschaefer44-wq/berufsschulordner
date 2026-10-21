import { useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board';
import { Glyph } from './Glyph';
import type { BSettings, ModeB } from './data';
import { askHint, askJudge, askMove, cancelAi } from './aiClient';
import {
  COLOR_NAME, GRADE_TXT, KINDS, KIND_NAME, LEVELS, SETS, apply, cloneGame, height, legalMoves, newGame, posKey, queenSurround, result, unkey,
  type Color, type G, type Grade, type Kind, type Move, type Result,
} from './engine';
import { useKeys } from '../shared/hooks';
import { sfx } from '../shared/sfx';
import { fmtTime } from '../shared/store';

export interface PlaySetup {
  set: string;
  mode: ModeB;
  level: number;
  side: Color;
  coach: boolean;
  secrets: { honig: boolean; stachel: boolean; schwarm: boolean };
  seed: number;
}

export interface FinishInfo {
  setup: PlaySetup;
  result: NonNullable<Result>;
  human: Color | null;
  moves: Move[];
  helped: boolean;
  usedSecret: boolean;
  coach: { best: number; good: number; bad: number };
  stats: { antFar: boolean; beetle3: boolean; jump4: boolean };
  seconds: number;
}

interface Entry { m: Move; by: Color; grade?: Grade; key: string; label: string }

export const hexDist = (a: number, b: number) => {
  const [q1, r1] = unkey(a), [q2, r2] = unkey(b);
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

export const startGame = (setup: Pick<PlaySetup, 'set' | 'secrets' | 'side' | 'mode'>): G => {
  const g = newGame(SETS.find((s) => s.id === setup.set) ?? SETS[0]);
  if (setup.secrets.stachel) g.hand[setup.mode === 'ki' ? setup.side : 0].A++;
  return g;
};

export const rebuild = (setup: Pick<PlaySetup, 'set' | 'secrets' | 'side' | 'mode'>, moves: Move[], upTo: number): G => {
  const g = startGame(setup);
  for (let i = 0; i < upTo; i++) apply(g, moves[i]);
  return g;
};

export function moveText(g: G, m: Move): string {
  if (m.t === 'x') return 'passt';
  const [q, r] = unkey(m.to);
  if (m.t === 'p') return `${KIND_NAME[m.kind]} · ${q},${r}`;
  const p = g.cells.get(m.from)?.slice(-1)[0];
  const [q0, r0] = unkey(m.from);
  return `${p ? KIND_NAME[p.kind] : '?'} ${q0},${r0}→${q},${r}`;
}

export function Tray({ g, color, selKind, onSelect, disabled }: { g: G; color: Color; selKind: Kind | null; onSelect: (k: Kind) => void; disabled: boolean }) {
  const hand = g.hand[color];
  const mustQueen = g.turns[color] >= 3 && hand.Q > 0;
  return (
    <div className={`wb-tray c${color}`} aria-label={`Vorrat ${COLOR_NAME[color]}`}>
      {KINDS.filter((k) => g.set.counts[k] > 0 || hand[k] > 0).map((k) => {
        const n = hand[k];
        const off = disabled || n <= 0 || (mustQueen && k !== 'Q');
        return (
          <button key={k} className={`wb-hand c${color}${selKind === k ? ' sel' : ''}${n <= 0 ? ' empty' : ''}`} disabled={off} onClick={() => onSelect(k)} title={`${KIND_NAME[k]} (${n})`}>
            <svg viewBox="-24 -24 48 48"><polygon points="-0.01,-22 19,-11 19,11 -0.01,22 -19,11 -19,-11" className={`face k${k}`} fill={`url(#wb-t${color})`} /><g className={`wb-pc c${color} k${k}`}><Glyph kind={k} /></g></svg>
            <i>{n}</i>
          </button>
        );
      })}
    </div>
  );
}

export default function WabePlay({ setup, S, onFinish, onExit }: { setup: PlaySetup; S: BSettings; onFinish: (i: FinishInfo) => void; onExit: () => void }) {
  const { mode, level, side } = setup;
  const human: Color | null = mode === 'ki' ? side : null;
  const gRef = useRef<G>(null as unknown as G);
  if (!gRef.current) gRef.current = startGame(setup);
  const entriesRef = useRef<Entry[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [, bump] = useState(0);
  const [selKind, setSelKind] = useState<Kind | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<Move | null>(null);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<number | null>(null);
  const [fb, setFb] = useState<{ grade: Grade; text: string } | null>(null);
  const [done, setDone] = useState<FinishInfo | null>(null);
  const [secs, setSecs] = useState(0);
  const [inspect, setInspect] = useState<number | null>(null);
  const seen = useRef(new Set<string>([posKey(gRef.current)]));
  const stats = useRef({ helped: false, coach: { best: 0, good: 0, bad: 0 }, antFar: false, beetle3: false, jump4: false });
  const finished = useRef(false);
  const aiToken = useRef(0);

  const g = gRef.current;
  const shown = view === null ? g : rebuild(setup, entries.map((e) => e.m), view);
  const res = result(g);
  const myTurn = !res && !thinking && view === null && (human === null || g.turn === human);
  const aiLevel = Math.max(1, level - (setup.secrets.schwarm ? 1 : 0));

  useEffect(() => { if (done) return; const id = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(id); }, [done]);
  useEffect(() => () => cancelAi(), []);

  const finish = () => {
    if (finished.current) return;
    const r = result(gRef.current);
    if (!r) return;
    finished.current = true;
    const info: FinishInfo = {
      setup, result: r, human, moves: entriesRef.current.map((e) => e.m), helped: stats.current.helped, usedSecret: setup.secrets.honig || setup.secrets.stachel || setup.secrets.schwarm,
      coach: stats.current.coach, stats: { antFar: stats.current.antFar, beetle3: stats.current.beetle3, jump4: stats.current.jump4 }, seconds: secs,
    };
    setDone(info);
    const won = r.winner !== 'draw' && (human === null || r.winner === human);
    sfx(r.winner === 'draw' ? 'tick' : won ? 'win' : 'lose');
    onFinish(info);
  };

  const play = (m: Move, grade?: Grade) => {
    const st = gRef.current, by = st.turn;
    if (m.t === 'm' && (human === null || by === human)) {
      const p = st.cells.get(m.from)?.slice(-1)[0];
      if (p?.kind === 'A' && hexDist(m.from, m.to) >= 5) stats.current.antFar = true;
      if (p?.kind === 'B' && height(st, m.to) >= 2) stats.current.beetle3 = true;
      if (p?.kind === 'G' && hexDist(m.from, m.to) >= 5) stats.current.jump4 = true;
    }
    const label = m.t === 'p' ? KIND_NAME[m.kind] : m.t === 'x' ? 'passt' : KIND_NAME[st.cells.get(m.from)!.slice(-1)[0].kind];
    apply(st, m);
    sfx(m.t === 'p' ? 'place' : 'tick');
    const key = posKey(st);
    seen.current.add(key);
    entriesRef.current = [...entriesRef.current, { m, by, grade, key, label }];
    setEntries(entriesRef.current);
    setSel(null); setSelKind(null); setHint(null);
    bump((x) => x + 1);
    if (result(st)) finish();
  };

  // KI am Zug
  useEffect(() => {
    if (human === null || res || done || view !== null || g.turn === human) return;
    const token = ++aiToken.current;
    setThinking(true);
    const id = setTimeout(async () => {
      const m = await askMove(cloneGame(gRef.current), aiLevel, (setup.seed + entriesRef.current.length * 733) >>> 0, [...seen.current]);
      if (token !== aiToken.current) return;
      setThinking(false);
      play(m);
    }, 380);
    return () => clearTimeout(id);
  }, [entries.length, view, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Honigtopf: bester Zug ständig sichtbar
  useEffect(() => {
    if (!setup.secrets.honig || !myTurn) return;
    stats.current.helped = true;
    let live = true;
    askHint(cloneGame(gRef.current)).then((m) => { if (live && m) setHint(m); });
    return () => { live = false; };
  }, [entries.length, myTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  const humanMove = async (m: Move) => {
    if (!myTurn) return;
    setMsg(''); setFb(null);
    if (setup.coach && human !== null && m.t !== 'x') {
      setThinking(true);
      const before = cloneGame(gRef.current);
      const j = await askJudge(before, m);
      setThinking(false);
      const t = stats.current.coach;
      if (j.grade === 'best') t.best++; else if (j.grade === 'good') t.good++; else t.bad++;
      setFb({ grade: j.grade, text: j.grade === 'best' || j.grade === 'good' ? GRADE_TXT[j.grade] : `${GRADE_TXT[j.grade]} – besser war: ${moveText(before, j.best)}` });
      play(m, j.grade);
    } else play(m);
  };

  const legal = useMemo(() => (myTurn ? legalMoves(g) : []), [entries.length, myTurn, view]); // eslint-disable-line react-hooks/exhaustive-deps
  const mustPass = myTurn && legal.length === 1 && legal[0].t === 'x';

  const targets = useMemo(() => {
    if (!myTurn) return [];
    if (selKind) return legal.filter((m) => m.t === 'p' && m.kind === selKind).map((m) => (m as { to: number }).to);
    if (sel !== null) return legal.filter((m) => m.t === 'm' && m.from === sel).map((m) => (m as { to: number }).to);
    return [];
  }, [legal, selKind, sel, myTurn]);

  const onCell = (k: number) => {
    if (!myTurn) return;
    if (targets.includes(k)) {
      if (selKind) void humanMove({ t: 'p', kind: selKind, to: k });
      else if (sel !== null) void humanMove({ t: 'm', from: sel, to: k });
      return;
    }
    const st = g.cells.get(k);
    setInspect(st && st.length > 1 ? k : null);
    if (st && st[st.length - 1].color === g.turn && legal.some((m) => m.t === 'm' && m.from === k)) { setSel(sel === k ? null : k); setSelKind(null); return; }
    if (st && st[st.length - 1].color === g.turn) { setMsg('Dieses Plättchen darf jetzt nicht ziehen (Schwarm würde zerreißen, es ist bedeckt oder die Königin fehlt).'); sfx('bad'); }
    setSel(null);
  };

  const onKind = (k: Kind) => {
    if (!myTurn) return;
    setSelKind(selKind === k ? null : k); setSel(null);
  };

  const undoMove = () => {
    if (done || thinking || !entriesRef.current.length) return;
    stats.current.helped = true;
    aiToken.current++;
    const list = entriesRef.current.slice();
    const drop = human === null ? 1 : list[list.length - 1].by === human ? 1 : 2;
    const keep = list.slice(0, Math.max(0, list.length - drop));
    gRef.current = rebuild(setup, keep.map((e) => e.m), keep.length);
    entriesRef.current = keep;
    seen.current = new Set([posKey(startGame(setup)), ...keep.map((e) => e.key)]);
    setEntries(keep); setSel(null); setSelKind(null); setHint(null); setFb(null); setMsg(''); setView(null);
    bump((x) => x + 1);
  };

  const getHint = async () => {
    if (!myTurn) return;
    stats.current.helped = true;
    setThinking(true);
    const m = await askHint(cloneGame(gRef.current));
    setThinking(false);
    if (m) { setHint(m); setMsg(`Tipp: ${moveText(g, m)}`); }
  };

  useKeys((e) => {
    if (e.key === 'z' || e.key === 'Z') undoMove();
    else if (e.key === 'h' || e.key === 'H') void getHint();
    else if (e.key === 'ArrowLeft' && done) setView((v) => Math.max(0, (v ?? entries.length) - 1));
    else if (e.key === 'ArrowRight' && done) setView((v) => (v === null || v + 1 >= entries.length ? null : v + 1));
    else if (e.key === 'Escape') { setSel(null); setSelKind(null); }
  }, [entries.length, myTurn, done]);

  const lastM = view === null ? entries[entries.length - 1]?.m : view > 0 ? entries[view - 1].m : null;
  const who = (c: Color) => (human === null ? COLOR_NAME[c] : c === human ? `${COLOR_NAME[c]} (du)` : `${COLOR_NAME[c]} (${LEVELS[aiLevel - 1].name})`);
  const status = done
    ? (done.result.winner === 'draw' ? 'Remis' : human === null ? `${COLOR_NAME[done.result.winner]} gewinnt` : done.result.winner === human ? 'Gewonnen!' : 'Verloren')
    : thinking ? 'Die KI überlegt …' : view !== null ? `Zug ${view} von ${entries.length}` : human === null ? `${COLOR_NAME[g.turn]} am Zug` : g.turn === human ? 'Du bist am Zug' : '…';
  const stack = inspect !== null ? shown.cells.get(inspect) : undefined;
  const mustQ = myTurn && g.turns[g.turn] >= 3 && g.hand[g.turn].Q > 0;

  return (
    <div className="wb-play">
      <div className="wb-boardwrap">
        <div className={`wb-plate c1${shown.turn === 1 && !res ? ' turn' : ''}`}><b>{who(1)}</b><span>Königin {Math.max(0, queenSurround(shown, 1))}/6</span></div>
        <Tray g={shown} color={1} selKind={g.turn === 1 && view === null ? selKind : null} onSelect={onKind} disabled={!myTurn || g.turn !== 1} />
        <Board g={shown} targets={view === null ? targets : []} sel={sel} onCell={onCell} last={lastM} hint={hint} interactive={myTurn} />
        <Tray g={shown} color={0} selKind={g.turn === 0 && view === null ? selKind : null} onSelect={onKind} disabled={!myTurn || g.turn !== 0} />
        <div className={`wb-plate c0${shown.turn === 0 && !res ? ' turn' : ''}`}><b>{who(0)}</b><span>Königin {Math.max(0, queenSurround(shown, 0))}/6</span></div>
      </div>
      <aside className="wb-side">
        <div className={'wb-status' + (done ? (done.result.winner === 'draw' ? '' : human === null || done.result.winner === human ? ' won' : ' lost') : '')}>
          <b>{status}</b>
          <span>{g.set.name} · {mode === 'ki' ? `Stufe ${aiLevel} ${LEVELS[aiLevel - 1].name}` : 'zu zweit'} · {fmtTime(secs)}</span>
        </div>
        {mustQ && <p className="wb-alarm">Die Königin muss jetzt gesetzt werden (spätestens im vierten Zug).</p>}
        {mustPass && <div className="wb-tools"><button className="primary" onClick={() => void humanMove({ t: 'x' })}>Passen (kein Zug möglich)</button></div>}
        {msg && <p className="wb-msg">{msg}</p>}
        {fb && <p className={`wb-fb ${fb.grade}`}>{fb.text}</p>}
        {stack && <div className="wb-stack"><b>Stapel (unten → oben)</b>{stack.map((p, i) => <span key={i} className={`c${p.color}`}>{KIND_NAME[p.kind]}</span>)}</div>}
        {!done && (
          <div className="wb-tools">
            <button onClick={() => void getHint()} disabled={!myTurn} title="Taste H">Tipp</button>
            <button onClick={undoMove} disabled={!entries.length || thinking} title="Taste Z">Zurück</button>
          </div>
        )}
        <p className="wb-keys">Wähle ein Tier aus dem Vorrat oder auf dem Spielfeld und klicke ein gestricheltes Feld. Neue Tiere dürfen nur eigene Farbe berühren. Die Königin muss spätestens im vierten Zug gesetzt werden; vorher darf nichts ziehen. Wer die gegnerische Königin ringsum einschließt, gewinnt.</p>
        <ol className="wb-moves" aria-label="Zugliste">
          {Array.from({ length: Math.ceil(entries.length / 2) }, (_, i) => (
            <li key={i}>
              <span className="no">{i + 1}.</span>
              {[entries[2 * i], entries[2 * i + 1]].map((e, j) => e && (
                <button key={j} className={`mv${view === 2 * i + j + 1 ? ' on' : ''}${e.grade ? ' ' + e.grade : ''}`} onClick={() => done && setView(2 * i + j + 1 === entries.length ? null : 2 * i + j + 1)} title={e.grade ? GRADE_TXT[e.grade] : undefined}>{e.label}</button>
              ))}
            </li>
          ))}
        </ol>
        {done && (
          <div className="wb-end">
            <p>{done.result.why} Nach {Math.ceil(done.moves.length / 2)} Zügen. Mit ←/→ siehst du die Partie noch einmal.</p>
            {setup.coach && human !== null && (done.coach.best + done.coach.good + done.coach.bad > 0) && <p>Imkerin: {done.coach.best} beste, {done.coach.good} gute, {done.coach.bad} schwächere Züge.</p>}
            <div className="wb-tools"><button className="primary" onClick={onExit}>Menü</button></div>
          </div>
        )}
        {!done && <div className="wb-tools"><button className="danger" onClick={() => { if (confirm('Partie aufgeben?')) onExit(); }}>Aufgeben</button></div>}
      </aside>
    </div>
  );
}

