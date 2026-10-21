import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/almendra/400.css';
import '@fontsource/almendra/700.css';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/noto-sans-runic/400.css';
import Board, { trackPieces } from './Board';
import WikPlay, { startPos, type FinishInfo, type PlaySetup } from './WikPlay';
import { LESSONS } from './lessons';
import { THEMES_W, WIK_INIT, type WData, type WReplay, type WSettings, type WStat } from './data';
import { askPuzzle } from './aiClient';
import {
  LEVELS, VARIANTS, aiMove, clonePos, legalMoves, make, movesFrom, newPos, notate, result, sideOf, winningMoves,
  type Mv, type Pos, type Puzzle,
} from './engine';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { dailySeed, freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './wikinger.css';

type View = 'menu' | 'play' | 'learn' | 'stats' | 'replays' | 'options';
const RUNES = 'ᚠᚢᚦᚨᚱᚲ';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="wk-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);
const NOOP = () => undefined;

/** Brett mit Auswahl für Lektionen und Aufgaben. */
function PracticeBoard({ pos, locked, onMove, hint, mark }: { pos: Pos; locked: boolean; onMove: (m: Mv) => void; hint?: Mv | null; mark?: number[] }) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [pos]);
  const pieces = useMemo(() => trackPieces(pos, [], 0), [pos]);
  const v = pos.v;
  const onSquare = (i: number) => {
    if (locked) return;
    if (sel !== null && movesFrom(pos, sel).includes(i)) { onMove({ from: sel, to: i }); return; }
    const x = pos.b[i];
    if (x && sideOf(x) === pos.turn) setSel(sel === i ? null : i); else setSel(null);
  };
  return <Board v={v} pieces={pieces} sel={sel} targets={sel !== null && !locked ? movesFrom(pos, sel) : []} onSquare={onSquare} interactive={!locked} hint={hint} exits={mark} />;
}

function Lessons({ data, upd }: { data: WData; upd: (fn: (d: WData) => void) => void }) {
  const [i, setI] = useState(0);
  const L = LESSONS[i];
  const [pos, setPos] = useState<Pos>(() => L.setup());
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setPos(LESSONS[i].setup()); setRes(null); }, [i]);
  const onMove = (m: Mv) => {
    if (res?.ok) return;
    if (L.check(pos, m)) {
      const n = clonePos(pos); make(n, m); setPos(n);
      setRes({ ok: true, text: L.why }); sfx('good');
      if (!data.lessons[L.id]) {
        upd((d) => { d.lessons = { ...d.lessons, [L.id]: true }; });
        if (LESSONS.every((x) => x.id === L.id || data.lessons[x.id])) achieve('wikinger', 'lessons');
      }
    } else { setRes({ ok: false, text: `Nicht ganz. ${L.hint}` }); sfx('bad'); }
  };
  const done = Object.values(data.lessons).filter(Boolean).length;
  return (
    <div className="wk-lessons">
      <ol className="wk-lessonlist">{LESSONS.map((x, k) => <li key={x.id}><button className={`${k === i ? 'on' : ''}${data.lessons[x.id] ? ' done' : ''}`} onClick={() => setI(k)}>{k + 1}. {x.title}</button></li>)}<li className="cnt">{done} / {LESSONS.length}</li></ol>
      <div className="wk-lesson">
        <article>
          <h3>{L.title}</h3>
          <p>{L.text}</p>
          <p className="wk-task"><b>Aufgabe:</b> {L.task}</p>
          {res && <p className={`wk-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
          <div className="wk-tools">
            <button onClick={() => { setPos(L.setup()); setRes(null); }}>Neu</button>
            {res?.ok && i + 1 < LESSONS.length && <button className="primary" onClick={() => setI(i + 1)}>Nächste Lektion</button>}
          </div>
        </article>
        <PracticeBoard pos={pos} locked={!!res?.ok} onMove={onMove} />
      </div>
    </div>
  );
}

function Puzzles({ data, upd, daily }: { data: WData; upd: (fn: (d: WData) => void) => void; daily: boolean }) {
  const [seed, setSeed] = useState(() => (daily ? dailySeed('wikinger', 'tag') : freshSeed()));
  const [isDaily, setIsDaily] = useState(daily);
  const [pz, setPz] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState<Pos | null>(null);
  const [phase, setPhase] = useState<'first' | 'second' | 'done'>('first');
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState<Mv | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    let live = true;
    setLoading(true); setPz(null); setRes(null); setShow(null); setPhase('first'); failed.current = false;
    askPuzzle('brandubh', seed).then((p) => { if (!live) return; setPz(p); setPos(p ? clonePos(p.pos) : null); setLoading(false); });
    return () => { live = false; };
  }, [seed]);

  const reward = (ok: boolean) => {
    upd((d) => { const p = { ...d.puzzles }; if (ok) { p.solved++; p.streak++; p.best = Math.max(p.best, p.streak); } else p.streak = 0; d.puzzles = p; });
    if (ok) {
      if (data.puzzles.solved + 1 >= 10) achieve('wikinger', 'puzzle10');
      if (data.puzzles.streak + 1 >= 5) achieve('wikinger', 'streak5');
      if (isDaily && !dailyDone('wikinger', '')) { markDaily('wikinger', ''); achieve('wikinger', 'daily'); toast('Tagesaufgabe gelöst'); }
    }
  };

  const onMove = (m: Mv) => {
    if (!pz || !pos || phase === 'done') return;
    if (phase === 'first') {
      if (!pz.solutions.some((s) => s.from === m.from && s.to === m.to)) {
        setRes({ ok: false, text: 'Das ist nicht der Gewinnzug. Versuche es noch einmal.' }); sfx('bad');
        if (!failed.current) { failed.current = true; reward(false); }
        return;
      }
      const n = clonePos(pos); make(n, m);
      setPos(n); setShow(null);
      if (result(n)) { finishOk(); return; }
      // Gegner wehrt sich mit seinem besten Zug
      const reply = aiMove(n, 4, mulberry32(7));
      setTimeout(() => {
        const n2 = clonePos(n); make(n2, reply); setPos(n2);
        if (result(n2)) { setRes({ ok: false, text: 'Der Gegner war schneller – schau dir die Stellung noch einmal an.' }); setPhase('done'); return; }
        setPhase('second'); setRes({ ok: true, text: 'Gut! Der Gegner wehrt sich – finde jetzt den Gewinnzug.' });
      }, 450);
    } else {
      const n = clonePos(pos); make(n, m);
      setPos(n);
      if (result(n)?.winner === pz.side) finishOk();
      else { setRes({ ok: false, text: 'Das gewinnt noch nicht. Es gibt einen direkten Gewinnzug.' }); sfx('bad'); setPos(pos); }
    }
  };
  const finishOk = () => {
    setPhase('done'); setRes({ ok: true, text: 'Gelöst! Der Gewinn war erzwungen.' }); sfx('good');
    if (!failed.current) reward(true);
  };
  const showSolution = () => {
    if (!pz || !pos) return;
    const sols = phase === 'first' ? pz.solutions : winningMoves(pos, 1);
    if (sols.length) setShow(sols[0]);
    if (!failed.current) { failed.current = true; reward(false); }
  };

  return (
    <div className="wk-puzzles">
      <div className="wk-tools">
        {seg(isDaily ? 'tag' : 'zufall', (v) => { if (v === 'tag') { setIsDaily(true); setSeed(dailySeed('wikinger', 'tag')); } else { setIsDaily(false); setSeed(freshSeed()); } }, [{ v: 'zufall', label: 'Zufall' }, { v: 'tag', label: dailyDone('wikinger', '') ? 'Tagesaufgabe ✓' : 'Tagesaufgabe' }])}
        <span className="wk-score">Gelöst: {data.puzzles.solved} · Serie {data.puzzles.streak} (Bestwert {data.puzzles.best})</span>
      </div>
      <div className="wk-lesson">
        <article>
          <h3>{isDaily ? 'Tagesaufgabe' : 'Aufgabe'}</h3>
          {loading && <p>Aufgabe wird gebaut …</p>}
          {!loading && !pz && <p>Keine Aufgabe gefunden – <button className="wk-link" onClick={() => setSeed(freshSeed())}>neue versuchen</button>.</p>}
          {pz && <>
            <p>{pz.title}</p>
            <p className="wk-task">{pz.side === 1 ? 'Verteidiger am Zug.' : 'Angreifer am Zug.'} Gewinn in zwei eigenen Zügen – der Gegner wehrt sich nach Kräften.</p>
            {res && <p className={`wk-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
            {show && <p className="wk-res">Lösung: {notate(pz.pos, show)}</p>}
            <div className="wk-tools">
              <button onClick={() => { setPos(clonePos(pz.pos)); setPhase('first'); setRes(null); setShow(null); }}>Neu</button>
              {phase !== 'done' && <button onClick={showSolution}>Lösung zeigen</button>}
              <button className="primary" onClick={() => { setIsDaily(false); setSeed(freshSeed()); }}>Nächste Aufgabe</button>
            </div>
          </>}
        </article>
        {pos && <PracticeBoard pos={pos} locked={phase === 'done' || (phase === 'second' && pos.turn !== pz?.side)} onMove={onMove} hint={show} />}
      </div>
      <p className="wk-keys">Aufgaben entstehen aus Zufallsstellungen (Brandubh). Die Lösung wird von der Engine vollständig durchgerechnet.</p>
    </div>
  );
}

function Replay({ r, onBack }: { r: WReplay; onBack: () => void }) {
  const [k, setK] = useState(r.moves.length);
  const [v0, start] = useMemo(() => { const v = VARIANTS.find((x) => x.id === r.variant) ?? VARIANTS[0]; const p = newPos(v); for (const i of r.removed ?? []) p.b[i] = 0; return [v, p] as const; }, [r]);
  const pieces = useMemo(() => trackPieces(start, r.moves, k), [start, r, k]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setK((x) => Math.max(0, x - 1)); if (e.key === 'ArrowRight') setK((x) => Math.min(r.moves.length, x + 1)); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [r]);
  return (
    <div className="wk-sub-view">
      <header className="wk-subhead"><button onClick={onBack}>← Zurück</button><h2>Partie vom {r.date}</h2></header>
      <div className="wk-lesson">
        <article>
          <p>{v0.name} · {r.mode === 'ki' ? `Stufe ${r.level}` : 'zu zweit'} · {r.winner === null ? 'unbeendet' : r.winner === 'draw' ? 'Remis' : r.winner === 0 ? 'Angreifer gewinnen' : 'Verteidiger gewinnen'}</p>
          <input type="range" min={0} max={r.moves.length} value={k} onChange={(e) => setK(+e.target.value)} aria-label="Zug" />
          <div className="wk-tools"><button onClick={() => setK(0)}>⏮</button><button onClick={() => setK((x) => Math.max(0, x - 1))}>◀</button><span className="wk-score">{k} / {r.moves.length}</span><button onClick={() => setK((x) => Math.min(r.moves.length, x + 1))}>▶</button><button onClick={() => setK(r.moves.length)}>⏭</button></div>
          <p className="wk-moveline">{r.moves.map((m, i) => <span key={i} className={i < k ? 'on' : ''}>{i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{notate(v0, m)} </span>)}</p>
          <p className="wk-keys">{r.why}</p>
        </article>
        <Board v={v0} pieces={pieces} sel={null} targets={[]} onSquare={NOOP} interactive={false} last={k > 0 ? r.moves[k - 1] : null} />
      </div>
    </div>
  );
}

export default function WikRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('wikinger');
  const [data, upd] = useGameData<WData>('wikinger', WIK_INIT);
  const S: WSettings = { ...WIK_INIT.settings, ...data.settings };
  const setS = (p: Partial<WSettings>) => upd((d) => { d.settings = { ...WIK_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(daily ? 'learn' : 'menu');
  const [tab, setTab] = useState<'lessons' | 'puzzles'>(daily ? 'puzzles' : 'lessons');
  const [setup, setSetup] = useState<PlaySetup | null>(null);
  const [round, setRound] = useState(0);
  const [sec, setSec] = useState({ odin: false, mjoelnir: false, ragnarok: false });
  const [replay, setReplay] = useState<WReplay | null>(null);

  useSecrets('wikinger', {
    'wikinger-odin': () => setSec((x) => ({ ...x, odin: true })),
    'wikinger-mjoelnir': () => setSec((x) => ({ ...x, mjoelnir: true })),
    'wikinger-ragnarok': () => setSec((x) => ({ ...x, ragnarok: true })),
  });

  const variant = VARIANTS.find((x) => x.id === S.variant) ?? VARIANTS[0];
  const sample = useSample();
  const start = () => {
    setSetup({ variant: variant.id, mode: S.mode, level: S.level, side: S.side, coach: S.coach && S.mode === 'ki', threats: S.threats, secrets: { ...sec }, seed: freshSeed() });
    setSec((x) => ({ ...x, mjoelnir: false }));
    setRound((r) => r + 1);
    setView('play');
  };

  const onFinish = (i: FinishInfo) => {
    const s = i.setup;
    const r = i.result;
    const human = i.human;
    const won = human !== null && r.winner === human;
    const key = `${s.mode}-${s.variant}${s.mode === 'ki' ? '-' + s.level + '-' + s.side : ''}`;
    upd((d) => {
      const st: WStat = d.stats[key] ?? { played: 0, won: 0, plies: 0, best: 0 };
      st.played++;
      if (won) { st.won++; st.plies += i.moves.length; st.best = st.best ? Math.min(st.best, i.moves.length) : i.moves.length; }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + (won ? 1 : 0), captures: d.totals.captures + i.captures, escapes: d.totals.escapes + (won && human === 1 && r.winner === 1 ? 1 : 0) };
      d.coach = { best: d.coach.best + i.coach.best, good: d.coach.good + i.coach.good, bad: d.coach.bad + i.coach.bad };
      const rep: WReplay = { id: String(Date.now()), date: new Date().toLocaleDateString('de-DE'), variant: s.variant, mode: s.mode, level: s.level, side: s.side, moves: i.moves, removed: i.removed, winner: r.winner, why: r.why };
      d.replays = [rep, ...d.replays].slice(0, 20);
    });
    if (s.mode === 'zwei') achieve('wikinger', 'zwei');
    if (!won || i.usedSecret) return;
    achieve('wikinger', 'first');
    if (s.level >= 4) achieve('wikinger', 'jarl');
    if (s.level >= 5) achieve('wikinger', 'odin');
    if (s.variant === 'tablut' && s.level >= 3) achieve('wikinger', 'tablut');
    if (s.variant === 'kopenhagen' && s.level >= 3) achieve('wikinger', 'kopenhagen');
    if (human === 1 && i.lostDefenders === 0) achieve('wikinger', 'flucht');
    if (i.captures >= 5) achieve('wikinger', 'schlag5');
    if (human === 0 && r.winner === 0 && r.why.includes('König')) achieve('wikinger', 'koenigsfang');
    if (s.level >= 3 && Math.ceil(i.moves.length / 2) <= 12) achieve('wikinger', 'blitz');
    const c = i.coach, tot = c.best + c.good + c.bad;
    if (s.coach && tot >= 6 && c.best / tot >= 0.8 && !i.helped) achieve('wikinger', 'coach');
    if (s.level >= 2) {
      const sd = (human === 0 ? 'a' : 'd');
      const have = new Set(Object.keys(data.stats).filter((k) => /^ki-/.test(k) && data.stats[k].won > 0 && +k.split('-')[2] >= 2).map((k) => k.split('-')[3]));
      have.add(sd === 'a' ? '0' : '1');
      if (have.has('0') && have.has('1')) achieve('wikinger', 'beide');
    }
  };

  const themeCls = `wk wk-th-${S.theme}`;
  const back = () => setView('menu');
  const top = (title: string, sub: string, left: () => void, label: string) => (
    <header className="wk-top"><button onClick={left}>← {label}</button><h1>{title}</h1><span className="wk-top-sub">{sub}</span></header>
  );

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        {top('Wikingerschach', variant.name, back, 'Menü')}
        <WikPlay key={round} setup={setup} S={S} onFinish={onFinish} onExit={back} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    body = (
      <div className="wk-sub-view">
        <header className="wk-subhead"><button onClick={back}>← Menü</button><h2>Lernen</h2>
          {seg(tab, setTab, [{ v: 'lessons', label: 'Lektionen' }, { v: 'puzzles', label: 'Aufgaben' }])}
        </header>
        {tab === 'lessons' ? <Lessons data={data} upd={upd} /> : <Puzzles data={data} upd={upd} daily={!!daily} />}
      </div>
    );
  } else if (view === 'replays') {
    body = replay ? <Replay r={replay} onBack={() => setReplay(null)} /> : (
      <div className="wk-sub-view">
        <header className="wk-subhead"><button onClick={back}>← Menü</button><h2>Partien</h2></header>
        {data.replays.length === 0 && <p className="wk-note">Noch keine beendete Partie.</p>}
        <ul className="wk-replist">{data.replays.map((r) => <li key={r.id}><button onClick={() => setReplay(r)}><b>{r.date}</b><span>{VARIANTS.find((x) => x.id === r.variant)?.name ?? r.variant}</span><span>{r.mode === 'ki' ? `Stufe ${r.level}` : 'zu zweit'} · {r.winner === 'draw' ? 'Remis' : r.winner === null ? '–' : r.mode === 'ki' ? (r.winner === r.side ? 'Sieg' : 'Niederlage') : r.winner === 0 ? 'Angreifer' : 'Verteidiger'} · {Math.ceil(r.moves.length / 2)} Züge</span></button></li>)}</ul>
      </div>
    );
  } else if (view === 'stats') {
    const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
    const nm = (k: string) => { const [m, vv, l, sd] = k.split('-'); return `${VARIANTS.find((x) => x.id === vv)?.name ?? vv} · ${m === 'ki' ? `Stufe ${l} ${LEVELS[+l - 1]?.name ?? ''} · ${sd === '0' ? 'Angreifer' : 'Verteidiger'}` : 'zu zweit'}`; };
    const ct = data.coach.best + data.coach.good + data.coach.bad;
    body = (
      <div className="wk-sub-view">
        <header className="wk-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="wk-statgrid">
          <div><b>{data.totals.games}</b><span>Partien</span></div><div><b>{data.totals.wins}</b><span>Siege</span></div>
          <div><b>{data.totals.captures}</b><span>Figuren geschlagen</span></div><div><b>{data.totals.escapes}</b><span>Königsfluchten</span></div>
          <div><b>{data.puzzles.solved}</b><span>Aufgaben gelöst</span></div><div><b>{ct ? Math.round(((data.coach.best + data.coach.good) / ct) * 100) + ' %' : '–'}</b><span>Skalde: gute Züge</span></div>
        </div>
        <table className="wk-table"><thead><tr><th>Art</th><th>Gespielt</th><th>Siege</th><th>Ø Züge beim Sieg</th><th>Kürzester Sieg</th></tr></thead>
          <tbody>{rows.length ? rows.map(([k, s]) => <tr key={k}><td>{nm(k)}</td><td>{s.played}</td><td>{s.won}</td><td>{s.won ? Math.round(s.plies / s.won / 2) : '–'}</td><td>{s.best ? Math.ceil(s.best / 2) : '–'}</td></tr>) : <tr><td colSpan={5}>Noch keine Partien.</td></tr>}</tbody></table>
      </div>
    );
  } else if (view === 'options') {
    body = (
      <div className="wk-sub-view">
        <header className="wk-subhead"><button onClick={back}>← Menü</button><h2>Optionen</h2></header>
        <div className="wk-opts">
          <section><h3>Himmel</h3>
            <div className="wk-swatches">{THEMES_W.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`wk wk-th-${t.id} wk-sw`}><i /><i /><i /></span><span>{t.name}</span></button>)}</div>
          </section>
          <section><h3>Hilfen</h3>
            <label className="wk-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Skalde: jeden Zug bewerten (nur gegen KI)</label>
            <label className="wk-check"><input type="checkbox" checked={S.threats} onChange={(e) => setS({ threats: e.target.checked })} /> Bedrohte Figuren rot umranden</label>
            <label className="wk-check"><input type="checkbox" checked={S.sound} onChange={(e) => setS({ sound: e.target.checked })} /> Geräusche</label>
            <h3>Daten</h3>
            <button className="danger" onClick={() => { if (confirm('Alle Wikingerschach-Daten löschen?')) { upd((d) => { Object.assign(d, { ...WIK_INIT, settings: d.settings }); }); toast('Daten gelöscht'); } }}>Wikingerschach-Daten löschen …</button>
          </section>
        </div>
      </div>
    );
  } else {
    const lv = LEVELS[S.level - 1];
    body = (
      <div className="wk-menu">
        <section className="wk-new">
          <div className="wk-hero" aria-hidden>
            <Board v={VARIANTS[0]} pieces={sample.pieces} sel={null} targets={[]} onSquare={NOOP} interactive={false} />
            <div className="wk-runes">{RUNES}</div>
          </div>
          <div className="wk-setup">
            <h2>Neue Partie</h2>
            <label><span>Gegner</span>{seg(S.mode, (v) => setS({ mode: v }), [{ v: 'ki', label: 'KI' }, { v: 'zwei', label: 'Zu zweit' }])}</label>
            <label><span>Brett</span>{seg(S.variant, (v) => setS({ variant: v }), VARIANTS.map((x) => ({ v: x.id, label: x.name.split(' ')[1], title: x.info })))}<small>{variant.name}: {variant.info}</small></label>
            {S.mode === 'ki' && <>
              <label><span>Stufe</span>{seg(S.level, (v) => setS({ level: v }), LEVELS.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name}: {lv.info}</small></label>
              <label><span>Du führst</span>{seg(S.side, (v) => setS({ side: v }), [{ v: 1, label: 'Verteidiger (König)' }, { v: 0, label: 'Angreifer (beginnen)' }])}</label>
            </>}
            {S.mode === 'ki' && <label className="wk-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Skalde bewertet meine Züge</label>}
            <button className="wk-start" onClick={start}>Zum Kampf</button>
            {(sec.odin || sec.mjoelnir || sec.ragnarok) && <p className="wk-sub">Geheim aktiv: {[sec.odin && 'Odins Auge', sec.mjoelnir && 'Mjölnir', sec.ragnarok && 'Ragnarök'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="wk-tiles">
          <button className="wk-tile" onClick={() => { setTab('puzzles'); setView('learn'); }}><i>ᚠ</i><b>Tagesaufgabe</b><span>{dailyDone('wikinger', '') ? 'gelöst ✓' : 'für alle dieselbe'}</span></button>
          <button className="wk-tile" onClick={() => { setTab('lessons'); setView('learn'); }}><i>ᚢ</i><b>Lernen</b><span>{Object.values(data.lessons).filter(Boolean).length} / {LESSONS.length} Lektionen · Aufgaben</span></button>
          <button className="wk-tile" onClick={() => { setReplay(null); setView('replays'); }}><i>ᚦ</i><b>Partien</b><span>{data.replays.length} gespeichert</span></button>
          <button className="wk-tile" onClick={() => setView('stats')}><i>ᚨ</i><b>Statistik</b><span>{data.totals.games} Partien · {data.totals.wins} Siege</span></button>
          <button className="wk-tile" onClick={() => setView('options')}><i>ᚱ</i><b>Optionen</b><span>Himmel, Skalde, Warnungen</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      {top('Wikingerschach', 'Hnefatafl – Jarl gegen Räuber', view === 'menu' ? onExit : back, view === 'menu' ? 'Halle' : 'Menü')}
      {body}
    </div>
  );
}

function useSample() {
  return useMemo(() => {
    const v = VARIANTS[0];
    const { pos } = startPos({ variant: v.id, secrets: { odin: false, mjoelnir: false, ragnarok: false }, seed: 1 });
    const rnd = mulberry32(12);
    const moves: Mv[] = [];
    const p = clonePos(pos);
    for (let i = 0; i < 6; i++) {
      const ms = legalMoves(p);
      const m = ms[Math.floor(rnd() * ms.length)];
      moves.push(m); make(p, m);
      if (result(p)) break;
    }
    return { pieces: trackPieces(pos, moves, moves.length) };
  }, []);
}

