import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/marcellus/400.css';
import '@fontsource/josefin-sans/400.css';
import '@fontsource/josefin-sans/700.css';
import Board from './Board';
import KalahaPlay, { rebuild, type FinishInfo, type PlaySetup } from './KalahaPlay';
import { LESSONS } from './lessons';
import { KALAHA_INIT, THEMES_K, type KData, type KReplay, type KSettings, type KStat } from './data';
import { askPuzzle } from './aiClient';
import { LEVELS, VARIANTS, clone, legalMoves, newPos, pitIdx, play, type Pos, type Puzzle, type Rules } from './engine';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { dailySeed, freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './kalaha.css';

type View = 'menu' | 'play' | 'learn' | 'stats' | 'replays' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="kl-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);
const NOOP = () => undefined;

/** Brett zum Üben: Klick auf eine Mulde ruft `onPit` mit der Muldennummer 0..n-1. */
function PracticeBoard({ pos, locked, onPit, hint }: { pos: Pos; locked: boolean; onPit: (i: number) => void; hint?: number | null }) {
  const n = pos.r.n;
  const playable = locked ? [] : legalMoves(pos).map((i) => pitIdx(n, pos.turn, i));
  return <Board n={n} b={pos.b} turn={pos.turn} playable={playable} onPit={(k) => onPit(k - (pos.turn === 0 ? 0 : n + 1))} hint={hint === null || hint === undefined ? null : pitIdx(n, pos.turn, hint)} names={['', '']} />;
}

function Lessons({ data, upd }: { data: KData; upd: (fn: (d: KData) => void) => void }) {
  const [i, setI] = useState(0);
  const L = LESSONS[i];
  const [pos, setPos] = useState<Pos>(() => L.setup());
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setPos(LESSONS[i].setup()); setRes(null); }, [i]);
  const onPit = (k: number) => {
    if (res?.ok) return;
    if (L.check(pos, k)) {
      setPos(play(pos, k).pos);
      setRes({ ok: true, text: L.why }); sfx('good');
      if (!data.lessons[L.id]) {
        upd((d) => { d.lessons = { ...d.lessons, [L.id]: true }; });
        if (LESSONS.every((x) => x.id === L.id || data.lessons[x.id])) achieve('kalaha', 'lessons');
      }
    } else { setRes({ ok: false, text: `Nicht ganz. ${L.hint}` }); sfx('bad'); }
  };
  const done = Object.values(data.lessons).filter(Boolean).length;
  return (
    <div className="kl-lessons">
      <ol className="kl-lessonlist">{LESSONS.map((x, k) => <li key={x.id}><button className={`${k === i ? 'on' : ''}${data.lessons[x.id] ? ' done' : ''}`} onClick={() => setI(k)}>{k + 1}. {x.title}</button></li>)}<li className="cnt">{done} / {LESSONS.length}</li></ol>
      <div className="kl-lesson">
        <article>
          <h3>{L.title}</h3>
          <p>{L.text}</p>
          <p className="kl-task"><b>Aufgabe:</b> {L.task}</p>
          {res && <p className={`kl-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
          <div className="kl-tools">
            <button onClick={() => { setPos(L.setup()); setRes(null); }}>Neu</button>
            {res?.ok && i + 1 < LESSONS.length && <button className="primary" onClick={() => setI(i + 1)}>Nächste Lektion</button>}
          </div>
        </article>
        <PracticeBoard pos={pos} locked={!!res?.ok} onPit={onPit} />
      </div>
    </div>
  );
}

function Puzzles({ data, upd, daily }: { data: KData; upd: (fn: (d: KData) => void) => void; daily: boolean }) {
  const [variant, setVariant] = useState<'kalah' | 'oware' | 'lawine'>('kalah');
  const [seed, setSeed] = useState(() => (daily ? dailySeed('kalaha', 'tag') : freshSeed()));
  const [isDaily, setIsDaily] = useState(daily);
  const rules: Rules = { v: isDaily ? 'kalah' : variant, n: 6, seeds: 4 };
  const [pz, setPz] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState<number | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const failed = useRef(false);
  const solved = useRef(false);

  useEffect(() => {
    let live = true;
    setLoading(true); setPz(null); setRes(null); setShow(null); failed.current = false; solved.current = false;
    askPuzzle(rules, seed).then((p) => { if (!live) return; setPz(p); setPos(p ? clone(p.pos) : null); setLoading(false); });
    return () => { live = false; };
  }, [seed, variant, isDaily]); // eslint-disable-line react-hooks/exhaustive-deps

  const reward = (ok: boolean) => {
    upd((d) => { const p = { ...d.puzzles }; if (ok) { p.solved++; p.streak++; p.best = Math.max(p.best, p.streak); } else p.streak = 0; d.puzzles = p; });
    if (ok) {
      if (data.puzzles.solved + 1 >= 10) achieve('kalaha', 'puzzle10');
      if (data.puzzles.streak + 1 >= 5) achieve('kalaha', 'streak5');
      if (isDaily && !dailyDone('kalaha', '')) { markDaily('kalaha', ''); achieve('kalaha', 'daily'); toast('Tagesaufgabe gelöst'); }
    }
  };
  const onPit = (i: number) => {
    if (!pz || !pos || solved.current) return;
    if (pz.best.includes(i)) {
      solved.current = true;
      setPos(play(pos, i).pos);
      setRes({ ok: true, text: `Richtig – Mulde ${i + 1} ist hier ${pz.margin.toFixed(1)} Samen besser als jede Alternative.` }); sfx('good');
      if (!failed.current) reward(true);
    } else {
      setRes({ ok: false, text: 'Das ist nicht der beste Zug. Rechne die Möglichkeiten noch einmal durch.' }); sfx('bad');
      if (!failed.current) { failed.current = true; reward(false); }
    }
  };
  return (
    <div className="kl-puzzles">
      <div className="kl-tools">
        {seg(isDaily ? 'tag' : variant, (v) => { if (v === 'tag') { setIsDaily(true); setSeed(dailySeed('kalaha', 'tag')); } else { setIsDaily(false); setVariant(v); setSeed(freshSeed()); } }, [{ v: 'kalah', label: 'Kalah' }, { v: 'oware', label: 'Oware' }, { v: 'lawine', label: 'Lawine' }, { v: 'tag', label: dailyDone('kalaha', '') ? 'Tagesaufgabe ✓' : 'Tagesaufgabe' }])}
        <span className="kl-score">Gelöst: {data.puzzles.solved} · Serie {data.puzzles.streak} (Bestwert {data.puzzles.best})</span>
      </div>
      <div className="kl-lesson">
        <article>
          <h3>{isDaily ? 'Tagesaufgabe' : 'Bester Zug'}</h3>
          {loading && <p>Aufgabe wird berechnet …</p>}
          {!loading && !pz && <p>Keine Aufgabe gefunden – <button className="kl-link" onClick={() => setSeed(freshSeed())}>neue versuchen</button>.</p>}
          {pz && <>
            <p>{pz.title}</p>
            <p className="kl-task">{pz.pos.turn === 0 ? 'Unten' : 'Oben'} ist am Zug. Eine Mulde ist deutlich besser als alle anderen.</p>
            {res && <p className={`kl-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
            {show !== null && <p className="kl-res">Beste Mulde: {show + 1}</p>}
            <div className="kl-tools">
              <button onClick={() => { setPos(clone(pz.pos)); setRes(null); setShow(null); solved.current = false; }}>Neu</button>
              {!solved.current && <button onClick={() => { setShow(pz.best[0]); if (!failed.current) { failed.current = true; reward(false); } }}>Lösung zeigen</button>}
              <button className="primary" onClick={() => { setIsDaily(false); setSeed(freshSeed()); }}>Nächste Aufgabe</button>
            </div>
          </>}
        </article>
        {pos && <PracticeBoard pos={pos} locked={solved.current} onPit={onPit} hint={show} />}
      </div>
      <p className="kl-keys">Aufgaben entstehen aus Zufallsstellungen; der beste Zug wird tief durchgerechnet.</p>
    </div>
  );
}

function Replay({ r, onBack }: { r: KReplay; onBack: () => void }) {
  const rules: Rules = { v: r.variant, n: r.pits, seeds: r.seeds };
  const [k, setK] = useState(r.moves.length);
  const p = useMemo(() => rebuild(r.start, rules, r.moves, k), [r, k]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setK((x) => Math.max(0, x - 1)); if (e.key === 'ArrowRight') setK((x) => Math.min(r.moves.length, x + 1)); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [r]);
  return (
    <div className="kl-sub-view">
      <header className="kl-subhead"><button onClick={onBack}>← Zurück</button><h2>Partie vom {r.date}</h2></header>
      <div className="kl-lesson">
        <article>
          <p>{VARIANTS.find((v) => v.id === r.variant)?.name} · {r.mode === 'ki' ? `Stufe ${r.level}` : 'zu zweit'} · Endstand {r.scores[0]} : {r.scores[1]}</p>
          <input type="range" min={0} max={r.moves.length} value={k} onChange={(e) => setK(+e.target.value)} aria-label="Zug" />
          <div className="kl-tools"><button onClick={() => setK(0)}>⏮</button><button onClick={() => setK((x) => Math.max(0, x - 1))}>◀</button><span className="kl-score">{k} / {r.moves.length}</span><button onClick={() => setK((x) => Math.min(r.moves.length, x + 1))}>▶</button><button onClick={() => setK(r.moves.length)}>⏭</button></div>
        </article>
        <Board n={rules.n} b={p.b} turn={p.turn} playable={[]} onPit={NOOP} names={['', '']} />
      </div>
    </div>
  );
}

export default function KalahaRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('kalaha');
  const [data, upd] = useGameData<KData>('kalaha', KALAHA_INIT);
  const S: KSettings = { ...KALAHA_INIT.settings, ...data.settings };
  const setS = (p: Partial<KSettings>) => upd((d) => { d.settings = { ...KALAHA_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(daily ? 'learn' : 'menu');
  const [tab, setTab] = useState<'lessons' | 'puzzles'>(daily ? 'puzzles' : 'lessons');
  const [setup, setSetup] = useState<PlaySetup | null>(null);
  const [round, setRound] = useState(0);
  const [sec, setSec] = useState({ kauri: false, wuestenwind: false, oase: false });
  const [replay, setReplay] = useState<KReplay | null>(null);

  useSecrets('kalaha', {
    'kalaha-kauri': () => setSec((x) => ({ ...x, kauri: true })),
    'kalaha-wuestenwind': () => setSec((x) => ({ ...x, wuestenwind: true })),
    'kalaha-oase': () => setSec((x) => ({ ...x, oase: true })),
  });

  const variant = VARIANTS.find((v) => v.id === S.variant) ?? VARIANTS[0];
  const demo = useMemo(() => { let p = newPos({ v: 'kalah', n: 6, seeds: 4 }); const rnd = mulberry32(14); for (let i = 0; i < 9 && !p.over; i++) { const ms = legalMoves(p); p = play(p, ms[Math.floor(rnd() * ms.length)]).pos; } return p; }, []);
  const start = () => {
    setSetup({ rules: { v: S.variant, n: S.pits, seeds: S.seeds }, mode: S.mode, level: S.level, side: S.side, coach: S.coach && S.mode === 'ki', preview: S.preview, fast: S.fast, secrets: { ...sec }, seed: freshSeed() });
    setSec((x) => ({ ...x, kauri: false, oase: false }));
    setRound((r) => r + 1);
    setView('play');
  };

  const onFinish = (i: FinishInfo) => {
    const s = i.setup, human = i.human;
    const won = human !== null && i.winner === human;
    const key = `${s.mode}-${s.rules.v}-${s.rules.n}x${s.rules.seeds}${s.mode === 'ki' ? '-' + s.level + '-' + s.side : ''}`;
    const diff = human === null ? 0 : (i.scores[human] - i.scores[1 - human]);
    upd((d) => {
      const st: KStat = d.stats[key] ?? { played: 0, won: 0, seeds: 0, best: 0 };
      st.played++;
      if (won) { st.won++; st.seeds += diff; st.best = Math.max(st.best, diff); }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + (won ? 1 : 0), extras: d.totals.extras + i.extras, captured: d.totals.captured + i.captured };
      d.coach = { best: d.coach.best + i.coach.best, good: d.coach.good + i.coach.good, bad: d.coach.bad + i.coach.bad };
      const rep: KReplay = { id: String(Date.now()), date: new Date().toLocaleDateString('de-DE'), variant: s.rules.v, pits: s.rules.n, seeds: s.rules.seeds, start: i.start, moves: i.moves, mode: s.mode, level: s.level, side: s.side, winner: i.winner, scores: i.scores };
      d.replays = [rep, ...d.replays].slice(0, 20);
    });
    if (s.mode === 'zwei') achieve('kalaha', 'zwei');
    if (i.winner === 'draw') achieve('kalaha', 'remis');
    if (i.usedSecret) return;
    if (human !== null && i.maxChain >= 3) achieve('kalaha', 'extra3');
    if (human !== null && i.maxCapture >= 10) achieve('kalaha', 'fang10');
    if (!won) return;
    achieve('kalaha', 'first');
    if (s.level >= 3) achieve('kalaha', 'karawane');
    if (s.level >= 5) achieve('kalaha', 'sultanin');
    if (s.rules.v === 'oware' && s.level >= 3) achieve('kalaha', 'oware');
    if (s.rules.v === 'lawine' && s.level >= 3) achieve('kalaha', 'lawine');
    if (diff >= 20 && s.level >= 3) achieve('kalaha', 'deutlich');
    if (diff === 1) achieve('kalaha', 'knapp');
    const c = i.coach, tot = c.best + c.good + c.bad;
    if (s.coach && tot >= 6 && c.best / tot >= 0.8 && !i.helped) achieve('kalaha', 'coach');
    if (s.level >= 2) {
      const have = new Set(Object.keys(data.stats).filter((k) => /^ki-/.test(k) && data.stats[k].won > 0 && +k.split('-')[3] >= 2).map((k) => k.split('-')[4]));
      have.add(String(human));
      if (have.has('0') && have.has('1')) achieve('kalaha', 'beide');
    }
  };

  const themeCls = `kl kl-th-${S.theme}`;
  const back = () => setView('menu');
  const top = (title: string, sub: string, left: () => void, label: string) => (
    <header className="kl-top"><button onClick={left}>← {label}</button><h1>{title}</h1><span className="kl-top-sub">{sub}</span></header>
  );

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        {top('Kalaha', VARIANTS.find((v) => v.id === setup.rules.v)?.name ?? '', back, 'Menü')}
        <KalahaPlay key={round} setup={setup} S={S} onFinish={onFinish} onExit={back} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    body = (
      <div className="kl-sub-view">
        <header className="kl-subhead"><button onClick={back}>← Menü</button><h2>Lernen</h2>
          {seg(tab, setTab, [{ v: 'lessons', label: 'Lektionen' }, { v: 'puzzles', label: 'Aufgaben' }])}
        </header>
        {tab === 'lessons' ? <Lessons data={data} upd={upd} /> : <Puzzles data={data} upd={upd} daily={!!daily} />}
      </div>
    );
  } else if (view === 'replays') {
    body = replay ? <Replay r={replay} onBack={() => setReplay(null)} /> : (
      <div className="kl-sub-view">
        <header className="kl-subhead"><button onClick={back}>← Menü</button><h2>Partien</h2></header>
        {data.replays.length === 0 && <p className="kl-note">Noch keine beendete Partie.</p>}
        <ul className="kl-replist">{data.replays.map((r) => <li key={r.id}><button onClick={() => setReplay(r)}><b>{r.date}</b><span>{VARIANTS.find((v) => v.id === r.variant)?.name} {r.pits}×{r.seeds}</span><span>{r.mode === 'ki' ? `Stufe ${r.level}` : 'zu zweit'} · {r.scores[0]} : {r.scores[1]} · {r.moves.length} Züge</span></button></li>)}</ul>
      </div>
    );
  } else if (view === 'stats') {
    const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
    const nm = (k: string) => { const [m, v, pk, l, sd] = k.split('-'); return `${VARIANTS.find((x) => x.id === v)?.name ?? v} ${pk} · ${m === 'ki' ? `Stufe ${l} ${LEVELS[+l - 1]?.name ?? ''} · ${sd === '0' ? 'unten' : 'oben'}` : 'zu zweit'}`; };
    const ct = data.coach.best + data.coach.good + data.coach.bad;
    body = (
      <div className="kl-sub-view">
        <header className="kl-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="kl-statgrid">
          <div><b>{data.totals.games}</b><span>Partien</span></div><div><b>{data.totals.wins}</b><span>Siege</span></div>
          <div><b>{data.totals.extras}</b><span>Extrazüge</span></div><div><b>{data.totals.captured}</b><span>Samen gefangen</span></div>
          <div><b>{data.puzzles.solved}</b><span>Aufgaben gelöst</span></div><div><b>{ct ? Math.round(((data.coach.best + data.coach.good) / ct) * 100) + ' %' : '–'}</b><span>Kluge Hand: gute Züge</span></div>
        </div>
        <table className="kl-table"><thead><tr><th>Art</th><th>Gespielt</th><th>Siege</th><th>Ø Vorsprung</th><th>Höchster Vorsprung</th></tr></thead>
          <tbody>{rows.length ? rows.map(([k, s]) => <tr key={k}><td>{nm(k)}</td><td>{s.played}</td><td>{s.won}</td><td>{s.won ? (s.seeds / s.won).toFixed(1) : '–'}</td><td>{s.best || '–'}</td></tr>) : <tr><td colSpan={5}>Noch keine Partien.</td></tr>}</tbody></table>
      </div>
    );
  } else if (view === 'options') {
    body = (
      <div className="kl-sub-view">
        <header className="kl-subhead"><button onClick={back}>← Menü</button><h2>Optionen</h2></header>
        <div className="kl-opts">
          <section><h3>Tageszeit</h3>
            <div className="kl-swatches">{THEMES_K.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`kl kl-th-${t.id} kl-sw`}><i /><i /><i /></span><span>{t.name}</span></button>)}</div>
          </section>
          <section><h3>Hilfen und Tempo</h3>
            <label className="kl-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Kluge Hand: jeden Zug bewerten (nur gegen KI)</label>
            <label className="kl-check"><input type="checkbox" checked={S.preview} onChange={(e) => setS({ preview: e.target.checked })} /> Vorschau: zeigt Endfeld, Extrazug und Fang beim Darüberfahren</label>
            <label className="kl-check"><input type="checkbox" checked={S.fast} onChange={(e) => setS({ fast: e.target.checked })} /> Schnelles Säen</label>
            <label className="kl-check"><input type="checkbox" checked={S.sound} onChange={(e) => setS({ sound: e.target.checked })} /> Geräusche</label>
            <h3>Daten</h3>
            <button className="danger" onClick={() => { if (confirm('Alle Kalaha-Daten löschen?')) { upd((d) => { Object.assign(d, { ...KALAHA_INIT, settings: d.settings }); }); toast('Daten gelöscht'); } }}>Kalaha-Daten löschen …</button>
          </section>
        </div>
      </div>
    );
  } else {
    const lv = LEVELS[S.level - 1];
    body = (
      <div className="kl-menu">
        <section className="kl-new">
          <div className="kl-hero" aria-hidden><Board n={6} b={demo.b} turn={0} playable={[]} onPit={NOOP} names={['', '']} /></div>
          <div className="kl-setup">
            <h2>Neue Partie</h2>
            <label><span>Gegner</span>{seg(S.mode, (v) => setS({ mode: v }), [{ v: 'ki', label: 'KI' }, { v: 'zwei', label: 'Zu zweit' }])}</label>
            <label><span>Spielart</span>{seg(S.variant, (v) => setS({ variant: v }), VARIANTS.map((x) => ({ v: x.id, label: x.name })))}<small>{variant.info}</small></label>
            <div className="kl-row2">
              <label><span>Mulden je Seite</span>{seg(S.pits, (v) => setS({ pits: v }), [4, 5, 6].map((v) => ({ v: v as 4 | 5 | 6, label: String(v) })))}</label>
              <label><span>Samen je Mulde</span>{seg(S.seeds, (v) => setS({ seeds: v }), [3, 4, 5, 6].map((v) => ({ v: v as 3 | 4 | 5 | 6, label: String(v) })))}</label>
            </div>
            {S.mode === 'ki' && <>
              <label><span>Stufe</span>{seg(S.level, (v) => setS({ level: v }), LEVELS.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name}: {lv.info}</small></label>
              <label><span>Du sitzt</span>{seg(S.side, (v) => setS({ side: v }), [{ v: 0, label: 'Unten (beginnt)' }, { v: 1, label: 'Oben' }])}</label>
              <label className="kl-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Kluge Hand bewertet meine Züge</label>
            </>}
            <button className="kl-start" onClick={start}>Spiel beginnen</button>
            {(sec.kauri || sec.wuestenwind || sec.oase) && <p className="kl-sub">Geheim aktiv: {[sec.kauri && 'Kaurimuschel', sec.wuestenwind && 'Wüstenwind', sec.oase && 'Oase'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="kl-tiles">
          <button className="kl-tile" onClick={() => { setTab('puzzles'); setView('learn'); }}><i>1</i><b>Tagesaufgabe</b><span>{dailyDone('kalaha', '') ? 'gelöst ✓' : 'für alle dieselbe'}</span></button>
          <button className="kl-tile" onClick={() => { setTab('lessons'); setView('learn'); }}><i>2</i><b>Lernen</b><span>{Object.values(data.lessons).filter(Boolean).length} / {LESSONS.length} Lektionen · Aufgaben</span></button>
          <button className="kl-tile" onClick={() => { setReplay(null); setView('replays'); }}><i>3</i><b>Partien</b><span>{data.replays.length} gespeichert</span></button>
          <button className="kl-tile" onClick={() => setView('stats')}><i>4</i><b>Statistik</b><span>{data.totals.games} Partien · {data.totals.wins} Siege</span></button>
          <button className="kl-tile" onClick={() => setView('options')}><i>5</i><b>Optionen</b><span>Tageszeit, Vorschau, Tempo</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      {top('Kalaha', 'Samen säen, fangen, gewinnen', view === 'menu' ? onExit : back, view === 'menu' ? 'Halle' : 'Menü')}
      {body}
    </div>
  );
}

