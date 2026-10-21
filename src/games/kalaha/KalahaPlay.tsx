import { useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board';
import type { KSettings, ModeK } from './data';
import { askHint, askJudge, askMove, cancelAi } from './aiClient';
import {
  GRADE_TXT, LEVELS, VARIANTS, clone, legalMoves, newPos, pitIdx, play, scores, winner,
  type Grade, type Pos, type Rules, type Side, type Step,
} from './engine';
import { useKeys } from '../shared/hooks';
import { sfx } from '../shared/sfx';
import { fmtTime } from '../shared/store';

export interface PlaySetup {
  rules: Rules;
  mode: ModeK;
  level: number;
  side: Side;
  coach: boolean;
  preview: boolean;
  fast: boolean;
  secrets: { kauri: boolean; wuestenwind: boolean; oase: boolean };
  seed: number;
}

export interface FinishInfo {
  setup: PlaySetup;
  winner: Side | 'draw';
  human: Side | null;
  scores: [number, number];
  start: number[];
  moves: number[];
  extras: number;
  maxChain: number;
  maxCapture: number;
  captured: number;
  helped: boolean;
  usedSecret: boolean;
  coach: { best: number; good: number; bad: number };
  seconds: number;
}

interface Entry { pit: number; by: Side; extra: boolean; captured: number; grade?: Grade; before: Pos }
interface Anim { b: number[]; hand: { idx: number; n: number } | null; flash: { idx: number; k: number } | null; cap: number[] }

export const startPos = (setup: Pick<PlaySetup, 'rules' | 'secrets' | 'side' | 'mode'>): Pos => {
  const p = newPos(setup.rules);
  if (setup.secrets.kauri) {
    const s: Side = setup.mode === 'ki' ? setup.side : 0;
    for (let i = 0; i < setup.rules.n; i++) { p.b[pitIdx(setup.rules.n, s, i)]++; p.total++; }
  }
  return p;
};

export const rebuild = (start: number[], rules: Rules, moves: number[], upTo: number): Pos => {
  let p = newPos(rules);
  p.b = start.slice();
  p.total = start.reduce((a, c) => a + c, 0);
  for (let i = 0; i < upTo; i++) p = play(p, moves[i]).pos;
  return p;
};

/** Spielt die Schritte eines Zuges nacheinander ab. */
export function useSowing() {
  const timers = useRef<number[]>([]);
  const stop = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => stop, []);
  const run = (b0: number[], steps: Step[], fast: boolean, set: (a: Anim | null) => void): Promise<void> => new Promise((resolve) => {
    stop();
    const b = b0.slice();
    let hand: { idx: number; n: number } | null = null;
    let at = 0, k = 0;
    const sp = fast ? 0.4 : 1;
    const push = (fn: () => void, d: number) => { at += d * sp; timers.current.push(window.setTimeout(fn, at)); };
    for (const s of steps) {
      if (s.k === 'pick') push(() => { b[s.i] = 0; hand = { idx: s.i, n: s.n }; set({ b: b.slice(), hand, flash: null, cap: [] }); sfx('pop'); }, 240);
      else if (s.k === 'drop') push(() => { b[s.i]++; if (hand) hand = { idx: s.i, n: hand.n - 1 }; set({ b: b.slice(), hand: hand && hand.n > 0 ? hand : null, flash: { idx: s.i, k: ++k }, cap: [] }); sfx('tick'); }, 170);
      else if (s.k === 'capture') push(() => { for (const q of s.from) b[q] = 0; b[s.to] += s.n; set({ b: b.slice(), hand: null, flash: { idx: s.to, k: ++k }, cap: [...s.from, s.to] }); sfx('good'); }, 420);
      else if (s.k === 'extra') push(() => { sfx('level'); }, 120);
      else push(() => { for (const m of s.moves) { b[m.from] = 0; b[m.to] += m.n; } set({ b: b.slice(), hand: null, flash: null, cap: s.moves.map((m) => m.to) }); sfx('clear'); }, 500);
    }
    push(() => { set(null); resolve(); }, 160);
  });
  return { run, stop };
}

export default function KalahaPlay({ setup, S, onFinish, onExit }: { setup: PlaySetup; S: KSettings; onFinish: (i: FinishInfo) => void; onExit: () => void }) {
  const { rules, mode, level, side } = setup;
  const n = rules.n;
  const human: Side | null = mode === 'ki' ? side : null;
  const aiLevel = Math.max(1, level - (setup.secrets.oase ? 1 : 0));
  const start = useMemo(() => startPos(setup), []); // eslint-disable-line react-hooks/exhaustive-deps
  const posRef = useRef<Pos>(clone(start));
  const entriesRef = useRef<Entry[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [, bump] = useState(0);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [fb, setFb] = useState<{ grade: Grade; text: string } | null>(null);
  const [done, setDone] = useState<FinishInfo | null>(null);
  const [secs, setSecs] = useState(0);
  const [view, setView] = useState<number | null>(null);
  const stats = useRef({ helped: false, coach: { best: 0, good: 0, bad: 0 }, extras: 0, chain: 0, maxChain: 0, maxCap: 0, captured: 0 });
  const finished = useRef(false);
  const token = useRef(0);
  const sow = useSowing();

  const pos = posRef.current;
  const shownPos = view === null ? pos : rebuild(start.b, rules, entries.map((e) => e.pit), view);
  const myTurn = !pos.over && !busy && view === null && (human === null || pos.turn === human);

  useEffect(() => { if (done) return; const id = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(id); }, [done]);
  useEffect(() => () => cancelAi(), []);

  const finish = () => {
    if (finished.current) return;
    const p = posRef.current;
    if (!p.over) return;
    finished.current = true;
    const w = winner(p) as Side | 'draw';
    const info: FinishInfo = {
      setup, winner: w, human, scores: scores(p), start: start.b, moves: entriesRef.current.map((e) => e.pit), extras: stats.current.extras, maxChain: stats.current.maxChain, maxCapture: stats.current.maxCap,
      captured: stats.current.captured, helped: stats.current.helped, usedSecret: setup.secrets.kauri || setup.secrets.wuestenwind || setup.secrets.oase, coach: stats.current.coach, seconds: secs,
    };
    setDone(info);
    const won = w !== 'draw' && (human === null || w === human);
    sfx(w === 'draw' ? 'tick' : won ? 'win' : 'lose');
    onFinish(info);
  };

  const doMove = async (i: number, grade?: Grade) => {
    const st = posRef.current;
    const by = st.turn;
    const before = clone(st);
    const r = play(st, i);
    setBusy(true); setHint(null); setMsg('');
    const mine = human === null || by === human;
    if (mine) {
      if (r.extra) { stats.current.extras++; stats.current.chain++; stats.current.maxChain = Math.max(stats.current.maxChain, stats.current.chain); } else stats.current.chain = 0;
      if (r.captured > 0) { stats.current.captured += r.captured; stats.current.maxCap = Math.max(stats.current.maxCap, r.captured); }
    } else stats.current.chain = 0;
    const my = token.current;
    await sow.run(st.b, r.steps, S.fast || setup.fast, setAnim);
    if (my !== token.current) return;
    posRef.current = r.pos;
    entriesRef.current = [...entriesRef.current, { pit: i, by, extra: r.extra, captured: r.captured, grade, before }];
    setEntries(entriesRef.current);
    setBusy(false);
    bump((x) => x + 1);
    if (r.pos.over) finish();
  };

  // KI am Zug
  useEffect(() => {
    if (human === null || pos.over || done || busy || view !== null || pos.turn === human) return;
    const my = ++token.current;
    const id = setTimeout(async () => {
      const m = await askMove(clone(posRef.current), aiLevel, (setup.seed + entriesRef.current.length * 917) >>> 0);
      if (my !== token.current) return;
      void doMove(m);
    }, 420);
    return () => clearTimeout(id);
  }, [entries.length, busy, view, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wüstenwind: bester Zug ständig sichtbar
  useEffect(() => {
    if (!setup.secrets.wuestenwind || !myTurn) return;
    stats.current.helped = true;
    let live = true;
    askHint(clone(posRef.current)).then((m) => { if (live && m !== null) setHint(pitIdx(n, posRef.current.turn, m)); });
    return () => { live = false; };
  }, [entries.length, myTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  const humanMove = async (i: number) => {
    if (!myTurn) return;
    if (!legalMoves(pos).includes(i)) { setMsg('Diese Mulde ist leer oder darf nicht gespielt werden.'); sfx('bad'); return; }
    setFb(null);
    if (setup.coach && human !== null) {
      setBusy(true);
      const j = await askJudge(clone(pos), i);
      const t = stats.current.coach;
      if (j.grade === 'best') t.best++; else if (j.grade === 'good') t.good++; else t.bad++;
      setFb({ grade: j.grade, text: j.grade === 'best' || j.grade === 'good' ? GRADE_TXT[j.grade] : `${GRADE_TXT[j.grade]} – besser war Mulde ${j.best + 1}` });
      setBusy(false);
      await doMove(i, j.grade);
    } else await doMove(i);
  };

  const undoMove = () => {
    if (done || busy || !entriesRef.current.length) return;
    stats.current.helped = true;
    token.current++;
    const list = entriesRef.current.slice();
    let k = list.length - 1;
    if (human === null) k = list.length - 1;
    else {
      while (k >= 0 && list[k].by !== human) k--;
      if (k < 0) { token.current++; return; }
      while (k >= 0 && list[k].by === human) k--;
      k++;
    }
    const keep = list.slice(0, k);
    posRef.current = clone(list[k].before);
    entriesRef.current = keep;
    setEntries(keep); setHint(null); setFb(null); setMsg(''); setView(null); setAnim(null);
    bump((x) => x + 1);
  };

  const getHint = async () => {
    if (!myTurn) return;
    stats.current.helped = true;
    setBusy(true);
    const m = await askHint(clone(pos));
    setBusy(false);
    if (m !== null) { setHint(pitIdx(n, pos.turn, m)); setMsg(`Tipp: Mulde ${m + 1}`); }
  };

  useKeys((e) => {
    if (/^[1-9]$/.test(e.key) && +e.key <= n) { const me = human ?? pos.turn; if (pos.turn === me) void humanMove(+e.key - 1); }
    else if (e.key === 'z' || e.key === 'Z') undoMove();
    else if (e.key === 'h' || e.key === 'H') void getHint();
    else if (e.key === 'ArrowLeft' && done) setView((v) => Math.max(0, (v ?? entries.length) - 1));
    else if (e.key === 'ArrowRight' && done) setView((v) => (v === null || v + 1 >= entries.length ? null : v + 1));
  }, [entries.length, myTurn, done]);

  const b = anim ? anim.b : shownPos.b;
  const playable = myTurn ? legalMoves(pos).map((i) => pitIdx(n, pos.turn, i)) : [];
  const preview = useMemo(() => {
    if (!S.preview || hover === null || !myTurn) return null;
    const i = hover - (pos.turn === 0 ? 0 : n + 1);
    if (i < 0 || i >= n) return null;
    const r = play(pos, i);
    const drops = r.steps.filter((s) => s.k === 'drop') as { k: 'drop'; i: number }[];
    const last = drops.length ? drops[drops.length - 1].i : hover;
    return { land: last, extra: r.extra, cap: r.captured };
  }, [hover, myTurn, S.preview, entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sc0, sc1] = scores(shownPos);
  const nm = (s: Side) => (human === null ? (s === 0 ? 'Unten' : 'Oben') : s === human ? 'Du' : LEVELS[aiLevel - 1].name);
  const status = done
    ? (done.winner === 'draw' ? 'Unentschieden' : human === null ? `${nm(done.winner)} gewinnt` : done.winner === human ? 'Gewonnen!' : 'Verloren')
    : busy && !anim ? 'Überlege …' : anim ? 'Es wird gesät …' : view !== null ? `Zug ${view} von ${entries.length}` : human === null ? `${nm(pos.turn)} am Zug` : pos.turn === human ? 'Du bist am Zug' : '…';
  const vinfo = VARIANTS.find((v) => v.id === rules.v)!;

  return (
    <div className="kl-play">
      <div className="kl-boardwrap">
        <div className={`kl-plate p1${shownPos.turn === 1 && !pos.over ? ' turn' : ''}`}><b>{nm(1)}</b><span>Speicher {sc1} · Mulden {shownPos.b.slice(n + 1, 2 * n + 1).reduce((a, c) => a + c, 0)}</span></div>
        <Board n={n} b={b} turn={shownPos.turn} playable={playable} onPit={(k) => void humanMove(k - (pos.turn === 0 ? 0 : n + 1))} hand={anim?.hand} flash={anim?.flash} capture={anim?.cap} preview={preview} onHover={setHover} hint={hint} names={['', '']} />
        <div className={`kl-plate p0${shownPos.turn === 0 && !pos.over ? ' turn' : ''}`}><b>{nm(0)}</b><span>Speicher {sc0} · Mulden {shownPos.b.slice(0, n).reduce((a, c) => a + c, 0)}</span></div>
      </div>
      <aside className="kl-side">
        <div className={'kl-status' + (done ? (done.winner === 'draw' ? '' : human === null || done.winner === human ? ' won' : ' lost') : '')}>
          <b>{status}</b>
          <span>{vinfo.name} · {n} Mulden · {rules.seeds} Samen · {mode === 'ki' ? `Stufe ${aiLevel} ${LEVELS[aiLevel - 1].name}` : 'zu zweit'} · {fmtTime(secs)}</span>
        </div>
        {!done && pos.turn === (human ?? pos.turn) && entries.length > 0 && entries[entries.length - 1].extra && !busy && <p className="kl-extra">Extrazug! Du bist noch einmal dran.</p>}
        {msg && <p className="kl-msg">{msg}</p>}
        {fb && <p className={`kl-fb ${fb.grade}`}>{fb.text}</p>}
        {!done && (
          <div className="kl-tools">
            <button onClick={() => void getHint()} disabled={!myTurn} title="Taste H">Tipp</button>
            <button onClick={undoMove} disabled={!entries.length || busy} title="Taste Z">Zurück</button>
            <button onClick={() => { if (confirm('Partie aufgeben?')) onExit(); }} className="danger">Aufgeben</button>
          </div>
        )}
        <p className="kl-keys">Klicke eine leuchtende Mulde oder drücke ihre Ziffer. {rules.v === 'oware' ? 'Beute: Mulden mit 2 oder 3 Samen im gegnerischen Feld.' : 'Landet der letzte Samen im eigenen Speicher, bist du nochmal dran.'}</p>
        <ol className="kl-moves" aria-label="Zugliste">
          {entries.map((e, i) => (
            <li key={i} className={e.by === 0 ? 'a' : 'b'}>
              <button className={`mv${view === i + 1 ? ' on' : ''}${e.grade ? ' ' + e.grade : ''}`} onClick={() => done && setView(i + 1 === entries.length ? null : i + 1)}>
                <span className="no">{i + 1}.</span> {e.by === 0 ? 'Unten' : 'Oben'} · Mulde {e.pit + 1}{e.extra ? ' ★' : ''}{e.captured > 0 ? ` +${e.captured}` : ''}
              </button>
            </li>
          ))}
        </ol>
        {done && (
          <div className="kl-end">
            <p>Endstand {done.scores[0]} : {done.scores[1]} nach {done.moves.length} Zügen. Mit ←/→ siehst du die Partie noch einmal.</p>
            {setup.coach && human !== null && (done.coach.best + done.coach.good + done.coach.bad > 0) && <p>Kluge Hand: {done.coach.best} beste, {done.coach.good} gute, {done.coach.bad} schwächere Züge.</p>}
            <div className="kl-tools"><button className="primary" onClick={onExit}>Menü</button></div>
          </div>
        )}
      </aside>
    </div>
  );
}
