import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import Board from './Board';
import WabePlay, { Tray, moveText, rebuild, type FinishInfo, type PlaySetup } from './WabePlay';
import { LESSONS } from './lessons';
import { THEMES_B, WABE_INIT, type BData, type BReplay, type BSettings, type BStat } from './data';
import { askPuzzle } from './aiClient';
import { LEVELS, SETS, aiMove, apply, cloneGame, legalMoves, newGame, result, winningMoves, type G, type Kind, type Move, type Puzzle } from './engine';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { dailySeed, freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './wabe.css';

type View = 'menu' | 'play' | 'learn' | 'stats' | 'replays' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="wb-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);
const NOOP = () => undefined;

/** Brett mit Vorrat zum Üben (Lektionen, Aufgaben). */
function PracticeBoard({ g, locked, onMove, hint }: { g: G; locked: boolean; onMove: (m: Move) => void; hint?: Move | null }) {
  const [selKind, setSelKind] = useState<Kind | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { setSelKind(null); setSel(null); }, [g]);
  const legal = useMemo(() => (locked ? [] : legalMoves(g)), [g, locked]);
  const targets = selKind ? legal.filter((m) => m.t === 'p' && m.kind === selKind).map((m) => (m as { to: number }).to)
    : sel !== null ? legal.filter((m) => m.t === 'm' && m.from === sel).map((m) => (m as { to: number }).to) : [];
  const onCell = (k: number) => {
    if (locked) return;
    if (targets.includes(k)) { onMove(selKind ? { t: 'p', kind: selKind, to: k } : { t: 'm', from: sel!, to: k }); return; }
    const st = g.cells.get(k);
    if (st && st[st.length - 1].color === g.turn && legal.some((m) => m.t === 'm' && m.from === k)) { setSel(sel === k ? null : k); setSelKind(null); } else setSel(null);
  };
  return (
    <div className="wb-practice">
      <Board g={g} targets={targets} sel={sel} onCell={onCell} interactive={!locked} hint={hint} />
      <Tray g={g} color={g.turn} selKind={selKind} onSelect={(k) => { setSelKind(selKind === k ? null : k); setSel(null); }} disabled={locked} />
    </div>
  );
}

function Lessons({ data, upd }: { data: BData; upd: (fn: (d: BData) => void) => void }) {
  const [i, setI] = useState(0);
  const L = LESSONS[i];
  const [g, setG] = useState<G>(() => L.setup());
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setG(LESSONS[i].setup()); setRes(null); }, [i]);
  const onMove = (m: Move) => {
    if (res?.ok) return;
    if (L.check(g, m)) {
      const n = cloneGame(g); apply(n, m); setG(n);
      setRes({ ok: true, text: L.why }); sfx('good');
      if (!data.lessons[L.id]) {
        upd((d) => { d.lessons = { ...d.lessons, [L.id]: true }; });
        if (LESSONS.every((x) => x.id === L.id || data.lessons[x.id])) achieve('wabe', 'lessons');
      }
    } else { setRes({ ok: false, text: `Nicht ganz. ${L.hint}` }); sfx('bad'); }
  };
  const done = Object.values(data.lessons).filter(Boolean).length;
  return (
    <div className="wb-lessons">
      <ol className="wb-lessonlist">{LESSONS.map((x, k) => <li key={x.id}><button className={`${k === i ? 'on' : ''}${data.lessons[x.id] ? ' done' : ''}`} onClick={() => setI(k)}>{k + 1}. {x.title}</button></li>)}<li className="cnt">{done} / {LESSONS.length}</li></ol>
      <div className="wb-lesson">
        <article>
          <h3>{L.title}</h3>
          <p>{L.text}</p>
          <p className="wb-task"><b>Aufgabe:</b> {L.task}</p>
          {res && <p className={`wb-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
          <div className="wb-tools">
            <button onClick={() => { setG(L.setup()); setRes(null); }}>Neu</button>
            {res?.ok && i + 1 < LESSONS.length && <button className="primary" onClick={() => setI(i + 1)}>Nächste Lektion</button>}
          </div>
        </article>
        <PracticeBoard g={g} locked={!!res?.ok} onMove={onMove} />
      </div>
    </div>
  );
}

function Puzzles({ data, upd, daily }: { data: BData; upd: (fn: (d: BData) => void) => void; daily: boolean }) {
  const [own, setOwn] = useState<1 | 2>(1);
  const [seed, setSeed] = useState(() => (daily ? dailySeed('wabe', 'tag') : freshSeed()));
  const [isDaily, setIsDaily] = useState(daily);
  const [pz, setPz] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [g, setG] = useState<G | null>(null);
  const [phase, setPhase] = useState<'first' | 'second' | 'done'>('first');
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState<Move | null>(null);
  const failed = useRef(false);
  const effOwn = isDaily ? 1 : own;

  useEffect(() => {
    let live = true;
    setLoading(true); setPz(null); setRes(null); setShow(null); setPhase('first'); failed.current = false;
    askPuzzle('basis', effOwn, seed).then((p) => { if (!live) return; setPz(p); setG(p ? cloneGame(p.g) : null); setLoading(false); });
    return () => { live = false; };
  }, [seed, effOwn]);

  const reward = (ok: boolean) => {
    upd((d) => { const p = { ...d.puzzles }; if (ok) { p.solved++; p.streak++; p.best = Math.max(p.best, p.streak); } else p.streak = 0; d.puzzles = p; });
    if (ok) {
      if (data.puzzles.solved + 1 >= 10) achieve('wabe', 'puzzle10');
      if (data.puzzles.streak + 1 >= 5) achieve('wabe', 'streak5');
      if (isDaily && !dailyDone('wabe', '')) { markDaily('wabe', ''); achieve('wabe', 'daily'); toast('Tagesaufgabe gelöst'); }
    }
  };
  const finishOk = () => { setPhase('done'); setRes({ ok: true, text: 'Gelöst! Der Gewinn war erzwungen.' }); sfx('good'); if (!failed.current) reward(true); };

  const onMove = (m: Move) => {
    if (!pz || !g || phase === 'done') return;
    const sameM = (a: Move, b: Move) => JSON.stringify(a) === JSON.stringify(b);
    if (phase === 'first') {
      if (!pz.solutions.some((s) => sameM(s, m))) {
        setRes({ ok: false, text: 'Das ist nicht der Gewinnzug. Versuche es noch einmal.' }); sfx('bad');
        if (!failed.current) { failed.current = true; reward(false); }
        return;
      }
      const n = cloneGame(g); apply(n, m); setG(n); setShow(null);
      if (result(n)) { finishOk(); return; }
      const reply = aiMove(n, 3, mulberry32(7));
      setTimeout(() => {
        const n2 = cloneGame(n); apply(n2, reply); setG(n2);
        const r = result(n2);
        if (r) { setRes({ ok: false, text: 'Der Gegner war schneller – schau dir die Stellung noch einmal an.' }); setPhase('done'); return; }
        setPhase('second'); setRes({ ok: true, text: 'Gut! Der Gegner wehrt sich – finde jetzt den Gewinnzug.' });
      }, 450);
    } else {
      const n = cloneGame(g); apply(n, m);
      if (result(n)?.winner === pz.g.turn) { setG(n); finishOk(); }
      else { setRes({ ok: false, text: 'Das gewinnt noch nicht. Es gibt einen direkten Gewinnzug.' }); sfx('bad'); }
    }
  };
  const showSolution = () => {
    if (!pz || !g) return;
    const sols = phase === 'first' ? pz.solutions : winningMoves(g, 1);
    if (sols.length) setShow(sols[0]);
    if (!failed.current) { failed.current = true; reward(false); }
  };

  return (
    <div className="wb-puzzles">
      <div className="wb-tools">
        {seg(isDaily ? 'tag' : String(own), (v) => { if (v === 'tag') { setIsDaily(true); setSeed(dailySeed('wabe', 'tag')); } else { setIsDaily(false); setOwn(v === '1' ? 1 : 2); setSeed(freshSeed()); } }, [{ v: '1', label: 'Matt in 1' }, { v: '2', label: 'Matt in 2' }, { v: 'tag', label: dailyDone('wabe', '') ? 'Tagesaufgabe ✓' : 'Tagesaufgabe' }])}
        <span className="wb-score">Gelöst: {data.puzzles.solved} · Serie {data.puzzles.streak} (Bestwert {data.puzzles.best})</span>
      </div>
      <div className="wb-lesson">
        <article>
          <h3>{isDaily ? 'Tagesaufgabe' : effOwn === 1 ? 'Einschließen in einem Zug' : 'Einschließen in zwei Zügen'}</h3>
          {loading && <p>Aufgabe wird gebaut …</p>}
          {!loading && !pz && <p>Keine Aufgabe gefunden – <button className="wb-link" onClick={() => setSeed(freshSeed())}>neue versuchen</button>.</p>}
          {pz && <>
            <p>{pz.title}</p>
            <p className="wb-task">{pz.g.turn === 0 ? 'Honig' : 'Nacht'} ist am Zug. Die gegnerische Königin muss ringsum besetzt werden.</p>
            {res && <p className={`wb-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
            {show && g && <p className="wb-res">Lösung: {moveText(g, show)}</p>}
            <div className="wb-tools">
              <button onClick={() => { setG(cloneGame(pz.g)); setPhase('first'); setRes(null); setShow(null); }}>Neu</button>
              {phase !== 'done' && <button onClick={showSolution}>Lösung zeigen</button>}
              <button className="primary" onClick={() => { setIsDaily(false); setSeed(freshSeed()); }}>Nächste Aufgabe</button>
            </div>
          </>}
        </article>
        {g && <PracticeBoard g={g} locked={phase === 'done' || (phase === 'second' && g.turn !== pz?.g.turn)} onMove={onMove} hint={show} />}
      </div>
      <p className="wb-keys">Aufgaben stammen aus Partien der KI; die Lösung wird von der Engine vollständig durchgerechnet.</p>
    </div>
  );
}

function Replay({ r, onBack }: { r: BReplay; onBack: () => void }) {
  const [k, setK] = useState(r.moves.length);
  const base = { set: r.set, secrets: { honig: false, stachel: false, schwarm: false }, side: r.side, mode: 'zwei' as const };
  const g = useMemo(() => rebuild(base, r.moves, k), [r, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = k > 0 ? r.moves[k - 1] : null;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setK((x) => Math.max(0, x - 1)); if (e.key === 'ArrowRight') setK((x) => Math.min(r.moves.length, x + 1)); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [r]);
  return (
    <div className="wb-sub-view">
      <header className="wb-subhead"><button onClick={onBack}>← Zurück</button><h2>Partie vom {r.date}</h2></header>
      <div className="wb-lesson">
        <article>
          <p>{SETS.find((s) => s.id === r.set)?.name} · {r.mode === 'ki' ? `Stufe ${r.level}` : 'zu zweit'} · {r.winner === null ? 'unbeendet' : r.winner === 'draw' ? 'Remis' : r.winner === 0 ? 'Honig gewinnt' : 'Nacht gewinnt'}</p>
          <input type="range" min={0} max={r.moves.length} value={k} onChange={(e) => setK(+e.target.value)} aria-label="Zug" />
          <div className="wb-tools"><button onClick={() => setK(0)}>⏮</button><button onClick={() => setK((x) => Math.max(0, x - 1))}>◀</button><span className="wb-score">{k} / {r.moves.length}</span><button onClick={() => setK((x) => Math.min(r.moves.length, x + 1))}>▶</button><button onClick={() => setK(r.moves.length)}>⏭</button></div>
          <p className="wb-keys">{r.why}</p>
        </article>
        <Board g={g} targets={[]} sel={null} onCell={NOOP} interactive={false} last={last} />
      </div>
    </div>
  );
}

export default function WabeRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('wabe');
  const [data, upd] = useGameData<BData>('wabe', WABE_INIT);
  const S: BSettings = { ...WABE_INIT.settings, ...data.settings };
  const setS = (p: Partial<BSettings>) => upd((d) => { d.settings = { ...WABE_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(daily ? 'learn' : 'menu');
  const [tab, setTab] = useState<'lessons' | 'puzzles'>(daily ? 'puzzles' : 'lessons');
  const [setup, setSetup] = useState<PlaySetup | null>(null);
  const [round, setRound] = useState(0);
  const [sec, setSec] = useState({ honig: false, stachel: false, schwarm: false });
  const [replay, setReplay] = useState<BReplay | null>(null);

  useSecrets('wabe', {
    'wabe-honig': () => setSec((x) => ({ ...x, honig: true })),
    'wabe-stachel': () => setSec((x) => ({ ...x, stachel: true })),
    'wabe-schwarm': () => setSec((x) => ({ ...x, schwarm: true })),
  });

  const set = SETS.find((x) => x.id === S.set) ?? SETS[0];
  const demo = useDemo();
  const start = () => {
    setSetup({ set: set.id, mode: S.mode, level: S.level, side: S.side, coach: S.coach && S.mode === 'ki', secrets: { ...sec }, seed: freshSeed() });
    setSec((x) => ({ ...x, stachel: false, schwarm: false }));
    setRound((r) => r + 1);
    setView('play');
  };

  const onFinish = (i: FinishInfo) => {
    const s = i.setup, r = i.result, human = i.human;
    const won = human !== null && r.winner === human;
    const key = `${s.mode}-${s.set}${s.mode === 'ki' ? '-' + s.level + '-' + s.side : ''}`;
    upd((d) => {
      const st: BStat = d.stats[key] ?? { played: 0, won: 0, plies: 0, best: 0 };
      st.played++;
      if (won) { st.won++; st.plies += i.moves.length; st.best = st.best ? Math.min(st.best, i.moves.length) : i.moves.length; }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + (won ? 1 : 0), beetles: d.totals.beetles + (i.stats.beetle3 ? 1 : 0), jumps: d.totals.jumps + (i.stats.jump4 ? 1 : 0) };
      d.coach = { best: d.coach.best + i.coach.best, good: d.coach.good + i.coach.good, bad: d.coach.bad + i.coach.bad };
      const rep: BReplay = { id: String(Date.now()), date: new Date().toLocaleDateString('de-DE'), set: s.set, mode: s.mode, level: s.level, side: s.side, moves: i.moves, winner: r.winner, why: r.why };
      d.replays = [rep, ...d.replays].slice(0, 20);
    });
    if (s.mode === 'zwei') achieve('wabe', 'zwei');
    if (r.winner === 'draw') achieve('wabe', 'remis');
    if (i.usedSecret) return;
    if (human !== null && i.stats.antFar) achieve('wabe', 'ameise');
    if (human !== null && i.stats.beetle3) achieve('wabe', 'kaefer');
    if (human !== null && i.stats.jump4) achieve('wabe', 'sprung');
    if (!won) return;
    achieve('wabe', 'first');
    if (s.level >= 3) achieve('wabe', 'waechterin');
    if (s.level >= 5) achieve('wabe', 'koenigin');
    if (s.set === 'plus' && s.level >= 3) achieve('wabe', 'plus');
    if (s.level >= 3 && Math.ceil(i.moves.length / 2) <= 10) achieve('wabe', 'schnell');
    const c = i.coach, tot = c.best + c.good + c.bad;
    if (s.coach && tot >= 6 && c.best / tot >= 0.8 && !i.helped) achieve('wabe', 'coach');
    if (s.level >= 2) {
      const have = new Set(Object.keys(data.stats).filter((k) => /^ki-/.test(k) && data.stats[k].won > 0 && +k.split('-')[2] >= 2).map((k) => k.split('-')[3]));
      have.add(String(human));
      if (have.has('0') && have.has('1')) achieve('wabe', 'beide');
    }
  };

  const themeCls = `wb wb-th-${S.theme}`;
  const back = () => setView('menu');
  const top = (title: string, sub: string, left: () => void, label: string) => (
    <header className="wb-top"><button onClick={left}>← {label}</button><h1>{title}</h1><span className="wb-top-sub">{sub}</span></header>
  );

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        {top('Wabe', set.name, back, 'Menü')}
        <WabePlay key={round} setup={setup} S={S} onFinish={onFinish} onExit={back} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    body = (
      <div className="wb-sub-view">
        <header className="wb-subhead"><button onClick={back}>← Menü</button><h2>Lernen</h2>
          {seg(tab, setTab, [{ v: 'lessons', label: 'Lektionen' }, { v: 'puzzles', label: 'Aufgaben' }])}
        </header>
        {tab === 'lessons' ? <Lessons data={data} upd={upd} /> : <Puzzles data={data} upd={upd} daily={!!daily} />}
      </div>
    );
  } else if (view === 'replays') {
    body = replay ? <Replay r={replay} onBack={() => setReplay(null)} /> : (
      <div className="wb-sub-view">
        <header className="wb-subhead"><button onClick={back}>← Menü</button><h2>Partien</h2></header>
        {data.replays.length === 0 && <p className="wb-note">Noch keine beendete Partie.</p>}
        <ul className="wb-replist">{data.replays.map((r) => <li key={r.id}><button onClick={() => setReplay(r)}><b>{r.date}</b><span>{SETS.find((x) => x.id === r.set)?.name}</span><span>{r.mode === 'ki' ? `Stufe ${r.level}` : 'zu zweit'} · {r.winner === 'draw' ? 'Remis' : r.winner === null ? '–' : r.mode === 'ki' ? (r.winner === r.side ? 'Sieg' : 'Niederlage') : r.winner === 0 ? 'Honig' : 'Nacht'} · {Math.ceil(r.moves.length / 2)} Züge</span></button></li>)}</ul>
      </div>
    );
  } else if (view === 'stats') {
    const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
    const nm = (k: string) => { const [m, sid, l, sd] = k.split('-'); return `${SETS.find((x) => x.id === sid)?.name ?? sid} · ${m === 'ki' ? `Stufe ${l} ${LEVELS[+l - 1]?.name ?? ''} · ${sd === '0' ? 'Honig' : 'Nacht'}` : 'zu zweit'}`; };
    const ct = data.coach.best + data.coach.good + data.coach.bad;
    body = (
      <div className="wb-sub-view">
        <header className="wb-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="wb-statgrid">
          <div><b>{data.totals.games}</b><span>Partien</span></div><div><b>{data.totals.wins}</b><span>Siege</span></div>
          <div><b>{data.totals.beetles}</b><span>Käferstapel (Höhe 3)</span></div><div><b>{data.totals.jumps}</b><span>Weitsprünge</span></div>
          <div><b>{data.puzzles.solved}</b><span>Aufgaben gelöst</span></div><div><b>{ct ? Math.round(((data.coach.best + data.coach.good) / ct) * 100) + ' %' : '–'}</b><span>Imkerin: gute Züge</span></div>
        </div>
        <table className="wb-table"><thead><tr><th>Art</th><th>Gespielt</th><th>Siege</th><th>Ø Züge beim Sieg</th><th>Kürzester Sieg</th></tr></thead>
          <tbody>{rows.length ? rows.map(([k, s]) => <tr key={k}><td>{nm(k)}</td><td>{s.played}</td><td>{s.won}</td><td>{s.won ? Math.round(s.plies / s.won / 2) : '–'}</td><td>{s.best ? Math.ceil(s.best / 2) : '–'}</td></tr>) : <tr><td colSpan={5}>Noch keine Partien.</td></tr>}</tbody></table>
      </div>
    );
  } else if (view === 'options') {
    body = (
      <div className="wb-sub-view">
        <header className="wb-subhead"><button onClick={back}>← Menü</button><h2>Optionen</h2></header>
        <div className="wb-opts">
          <section><h3>Aussehen</h3>
            <div className="wb-swatches">{THEMES_B.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`wb wb-th-${t.id} wb-sw`}><i /><i /></span><span>{t.name}</span></button>)}</div>
          </section>
          <section><h3>Hilfen</h3>
            <label className="wb-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Imkerin: jeden Zug bewerten (nur gegen KI)</label>
            <label className="wb-check"><input type="checkbox" checked={S.sound} onChange={(e) => setS({ sound: e.target.checked })} /> Geräusche</label>
            <h3>Daten</h3>
            <button className="danger" onClick={() => { if (confirm('Alle Wabe-Daten löschen?')) { upd((d) => { Object.assign(d, { ...WABE_INIT, settings: d.settings }); }); toast('Daten gelöscht'); } }}>Wabe-Daten löschen …</button>
          </section>
        </div>
      </div>
    );
  } else {
    const lv = LEVELS[S.level - 1];
    body = (
      <div className="wb-menu">
        <section className="wb-new">
          <div className="wb-hero" aria-hidden><Board g={demo} targets={[]} sel={null} onCell={NOOP} interactive={false} badges={false} /></div>
          <div className="wb-setup">
            <h2>Neue Partie</h2>
            <label><span>Gegner</span>{seg(S.mode, (v) => setS({ mode: v }), [{ v: 'ki', label: 'KI' }, { v: 'zwei', label: 'Zu zweit' }])}</label>
            <label><span>Tiere</span>{seg(S.set, (v) => setS({ set: v }), SETS.map((x) => ({ v: x.id, label: x.name, title: x.info })))}<small>{set.info}</small></label>
            {S.mode === 'ki' && <>
              <label><span>Stufe</span>{seg(S.level, (v) => setS({ level: v }), LEVELS.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name}: {lv.info}</small></label>
              <label><span>Du spielst</span>{seg(S.side, (v) => setS({ side: v }), [{ v: 0, label: 'Honig (beginnt)' }, { v: 1, label: 'Nacht' }])}</label>
            </>}
            {S.mode === 'ki' && <label className="wb-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Imkerin bewertet meine Züge</label>}
            <button className="wb-start" onClick={start}>Schwarm starten</button>
            {(sec.honig || sec.stachel || sec.schwarm) && <p className="wb-sub">Geheim aktiv: {[sec.honig && 'Honigtopf', sec.stachel && 'Stachel', sec.schwarm && 'Schwarmintelligenz'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="wb-tiles">
          <button className="wb-tile" onClick={() => { setTab('puzzles'); setView('learn'); }}><i>1</i><b>Tagesaufgabe</b><span>{dailyDone('wabe', '') ? 'gelöst ✓' : 'für alle dieselbe'}</span></button>
          <button className="wb-tile" onClick={() => { setTab('lessons'); setView('learn'); }}><i>2</i><b>Lernen</b><span>{Object.values(data.lessons).filter(Boolean).length} / {LESSONS.length} Lektionen · Aufgaben</span></button>
          <button className="wb-tile" onClick={() => { setReplay(null); setView('replays'); }}><i>3</i><b>Partien</b><span>{data.replays.length} gespeichert</span></button>
          <button className="wb-tile" onClick={() => setView('stats')}><i>4</i><b>Statistik</b><span>{data.totals.games} Partien · {data.totals.wins} Siege</span></button>
          <button className="wb-tile" onClick={() => setView('options')}><i>5</i><b>Optionen</b><span>Aussehen, Imkerin</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      {top('Wabe', 'Ein Spiel ohne Brett', view === 'menu' ? onExit : back, view === 'menu' ? 'Halle' : 'Menü')}
      {body}
    </div>
  );
}

function useDemo(): G {
  return useMemo(() => {
    const g = newGame(SETS[1]);
    const rnd = mulberry32(21);
    for (let i = 0; i < 16; i++) { const ms = legalMoves(g); apply(g, ms[Math.floor(rnd() * ms.length)]); if (result(g)) break; }
    return g;
  }, []);
}

