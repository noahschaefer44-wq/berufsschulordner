import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/architects-daughter';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import Board from './Board';
import MauerPlay, { type FinishInfo, type PlaySetup } from './MauerPlay';
import { LESSONS } from './lessons';
import { MAUER_INIT, THEMES_M, type MData, type MReplay, type MSettings, type MStat } from './data';
import {
  LEVELS, PRESETS, allWalls, apply, clone, distance, labyrinth, legal, makePuzzle, netGain, newState, notate, pawnMoves, shortestPath, wallLegal,
  type Move, type Puzzle, type State,
} from './engine';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { dailySeed, freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './mauer.css';

type View = 'menu' | 'play' | 'learn' | 'stats' | 'replays' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="mb-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);

const NOOP = () => undefined;

function Lessons({ data, upd }: { data: MData; upd: (fn: (d: MData) => void) => void }) {
  const [i, setI] = useState(0);
  const L = LESSONS[i];
  const [st, setSt] = useState<State>(() => L.setup());
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [wallMode, setWallMode] = useState(false);
  useEffect(() => { setSt(LESSONS[i].setup()); setRes(null); }, [i]);
  const onMove = (m: Move) => {
    if (res?.ok) return;
    if (!legal(st, m)) return;
    if (L.check(st, m)) {
      const n = clone(st); apply(n, m); setSt(n);
      setRes({ ok: true, text: L.why });
      sfx('good');
      if (!data.lessons[L.id]) {
        upd((d) => { d.lessons = { ...d.lessons, [L.id]: true }; });
        if (LESSONS.every((x) => x.id === L.id || data.lessons[x.id])) achieve('mauer', 'lessons');
      }
    } else { setRes({ ok: false, text: `Nicht ganz. ${L.hint}` }); sfx('bad'); }
  };
  const done = Object.values(data.lessons).filter(Boolean).length;
  return (
    <div className="mb-lessons">
      <ol className="mb-lessonlist">{LESSONS.map((x, k) => <li key={x.id}><button className={`${k === i ? 'on' : ''}${data.lessons[x.id] ? ' done' : ''}`} onClick={() => setI(k)}>{k + 1}. {x.title}</button></li>)}<li className="cnt">{done} / {LESSONS.length}</li></ol>
      <div className="mb-lesson">
        <article>
          <h3>{L.title}</h3>
          <p>{L.text}</p>
          <p className="mb-task"><b>Aufgabe:</b> {L.task}</p>
          {res && <p className={`mb-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
          <div className="mb-tools">
            <button onClick={() => { setSt(L.setup()); setRes(null); }}>Neu</button>
            <button className={wallMode ? 'on' : ''} onClick={() => setWallMode((x) => !x)}>Mauer-Modus</button>
            {res?.ok && i + 1 < LESSONS.length && <button className="primary" onClick={() => setI(i + 1)}>Nächste Lektion</button>}
          </div>
        </article>
        <Board s={st} targets={res?.ok ? [] : pawnMoves(st)} canAct={!res?.ok} wallMode={wallMode} wallOk={(m) => wallLegal(st, m)} onMove={onMove} paths={null} />
      </div>
    </div>
  );
}

function Puzzles({ data, upd, daily }: { data: MData; upd: (fn: (d: MData) => void) => void; daily: boolean }) {
  const [kind, setKind] = useState<'race' | 'wall'>('wall');
  const [seed, setSeed] = useState(() => (daily ? dailySeed('mauer', 'tag') : freshSeed()));
  const [isDaily, setIsDaily] = useState(daily);
  const size = isDaily ? 9 : 7;
  const pz: Puzzle = useMemo(() => makePuzzle(seed, isDaily ? 'wall' : kind, size), [seed, kind, isDaily, size]);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState<Move | null>(null);
  const [wallMode, setWallMode] = useState(true);
  const solved = useRef(false);
  const sIn = pz.state;
  useEffect(() => { setRes(null); setShow(null); solved.current = false; }, [pz]);

  const reward = (ok: boolean) => {
    if (solved.current) return;
    upd((d) => {
      const p = { ...d.puzzles };
      if (ok) { p[pz.kind]++; p.streak++; p.best = Math.max(p.best, p.streak); } else p.streak = 0;
      d.puzzles = p;
    });
    if (ok) {
      solved.current = true;
      const tot = data.puzzles.race + data.puzzles.wall + 1;
      if (tot >= 10) achieve('mauer', 'puzzle10');
      if (data.puzzles.streak + 1 >= 5) achieve('mauer', 'streak5');
      if (isDaily && !dailyDone('mauer', '')) { markDaily('mauer', ''); achieve('mauer', 'daily'); toast('Tagesaufgabe gelöst'); }
    }
  };
  const bestWall = () => allWalls(sIn).map((m) => ({ m, g: netGain(sIn, m) })).sort((a, b) => b.g - a.g)[0]?.m ?? null;
  const answerRace = (p: 0 | 1) => {
    const ok = p === pz.answer;
    const d0 = distance(sIn, 0), d1 = distance(sIn, 1);
    setRes({ ok, text: `${ok ? 'Richtig.' : 'Leider nicht.'} Weiß braucht ${d0} Schritte, Orange ${d1}; ${sIn.turn === 0 ? 'Weiß' : 'Orange'} ist am Zug${d0 === d1 ? ' und gewinnt den Gleichstand.' : '.'}` });
    sfx(ok ? 'good' : 'bad');
    reward(ok);
  };
  const onWall = (m: Move) => {
    if (res?.ok || m.t === 'm') return;
    const g = netGain(sIn, m);
    const best = pz.best ?? 0;
    if (g >= best) { setRes({ ok: true, text: `Richtig – die Mauer kostet den Gegner netto ${g} Schritt${g === 1 ? '' : 'e'}. Das ist das Maximum.` }); sfx('good'); reward(true); }
    else { setRes({ ok: false, text: `Diese Mauer bringt netto ${g}. Es geht mehr (${best}).` }); sfx('bad'); reward(false); }
  };
  return (
    <div className="mb-puzzles">
      <div className="mb-tools">
        {seg(isDaily ? 'tag' : kind, (v) => { if (v === 'tag') { setIsDaily(true); setSeed(dailySeed('mauer', 'tag')); } else { setIsDaily(false); setKind(v); setSeed(freshSeed()); } }, [{ v: 'wall', label: 'Beste Mauer' }, { v: 'race', label: 'Wer gewinnt?' }, { v: 'tag', label: dailyDone('mauer', '') ? 'Tagesaufgabe ✓' : 'Tagesaufgabe' }])}
        <span className="mb-score">Gelöst: {data.puzzles.wall + data.puzzles.race} · Serie {data.puzzles.streak} (Bestwert {data.puzzles.best})</span>
      </div>
      <div className="mb-lesson">
        <article>
          <h3>{isDaily ? 'Tagesaufgabe' : pz.kind === 'race' ? 'Wettlauf' : 'Beste Mauer'}</h3>
          <p>{pz.title}</p>
          <p className="mb-task">{pz.kind === 'wall' ? `Weiß ${sIn.turn === 0 ? 'ist' : 'wäre'} am Zug. Nutze „Wege“ im Kopf: Zähle die Schritte, bevor du setzt.` : 'Mauern sind nicht mehr erlaubt. Zähle die Schritte beider Seiten.'}</p>
          {pz.kind === 'race' && !res?.ok && <div className="mb-tools"><button onClick={() => answerRace(0)}>Weiß gewinnt</button><button onClick={() => answerRace(1)}>Orange gewinnt</button></div>}
          {res && <p className={`mb-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
          <div className="mb-tools">
            {pz.kind === 'wall' && <button className={wallMode ? 'on' : ''} onClick={() => setWallMode((x) => !x)}>Mauer-Modus</button>}
            {pz.kind === 'wall' && !res?.ok && <button onClick={() => { const m = bestWall(); if (m) { setShow(m); reward(false); } }}>Lösung zeigen</button>}
            <button className="primary" onClick={() => { setIsDaily(false); setSeed(freshSeed()); }}>Nächste Aufgabe</button>
          </div>
          {show && <p className="mb-res">Beste Mauer: {notate(sIn.n, show)}</p>}
        </article>
        <Board s={sIn} targets={[]} canAct={pz.kind === 'wall' && !res?.ok} wallMode={wallMode} wallOk={(m) => wallLegal(sIn, m)} onMove={onWall} hint={show} paths={res ? [shortestPath(sIn, 0), shortestPath(sIn, 1)] : null} />
      </div>
      <p className="mb-keys">Aufgaben entstehen aus Zufallsstellungen; die richtige Antwort wird von der Engine berechnet.</p>
    </div>
  );
}

function Replay({ r, onBack }: { r: MReplay; onBack: () => void }) {
  const [k, setK] = useState(r.moves.length);
  const st = useMemo(() => { const s = newState({ n: r.n, walls: r.walls, pre: r.pre }); for (let i = 0; i < k; i++) apply(s, r.moves[i]); return s; }, [r, k]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setK((x) => Math.max(0, x - 1)); if (e.key === 'ArrowRight') setK((x) => Math.min(r.moves.length, x + 1)); };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [r]);
  return (
    <div className="mb-sub-view">
      <header className="mb-subhead"><button onClick={onBack}>← Zurück</button><h2>Partie vom {r.date}</h2></header>
      <div className="mb-lesson">
        <article>
          <p>{r.mode === 'ki' ? `Gegen Stufe ${r.level}` : 'Zu zweit'} · {r.n}×{r.n} · {r.winner === null ? 'unbeendet' : r.winner === 0 ? 'Weiß gewinnt' : 'Orange gewinnt'}</p>
          <input type="range" min={0} max={r.moves.length} value={k} onChange={(e) => setK(+e.target.value)} aria-label="Zug" />
          <div className="mb-tools"><button onClick={() => setK(0)}>⏮</button><button onClick={() => setK((x) => Math.max(0, x - 1))}>◀</button><span className="mb-score">{k} / {r.moves.length}</span><button onClick={() => setK((x) => Math.min(r.moves.length, x + 1))}>▶</button><button onClick={() => setK(r.moves.length)}>⏭</button></div>
          <p className="mb-moveline">{r.moves.map((m, i) => <span key={i} className={i < k ? 'on' : ''}>{i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{notate(r.n, m)} </span>)}</p>
        </article>
        <Board s={st} targets={[]} canAct={false} wallMode={false} wallOk={() => false} onMove={NOOP} last={k > 0 ? r.moves[k - 1] : null} owner={(m) => { const i = r.moves.findIndex((x, j) => j < k && x.t === m.t && x.r === m.r && x.c === m.c); return i < 0 ? undefined : ((i % 2) as 0 | 1); }} />
      </div>
    </div>
  );
}

export default function MauerRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('mauer');
  const [data, upd] = useGameData<MData>('mauer', MAUER_INIT);
  const S: MSettings = { ...MAUER_INIT.settings, ...data.settings };
  const setS = (p: Partial<MSettings>) => upd((d) => { d.settings = { ...MAUER_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(daily ? 'learn' : 'menu');
  const [tab, setTab] = useState<'lessons' | 'puzzles'>(daily ? 'puzzles' : 'lessons');
  const [setup, setSetup] = useState<PlaySetup | null>(null);
  const [round, setRound] = useState(0);
  const [sec, setSec] = useState({ ariadne: false, daedalus: false, minotaurus: false });
  const [replay, setReplay] = useState<MReplay | null>(null);

  useSecrets('mauer', {
    'mauer-ariadne': () => setSec((x) => ({ ...x, ariadne: true })),
    'mauer-daedalus': () => setSec((x) => ({ ...x, daedalus: true })),
    'mauer-minotaurus': () => setSec((x) => ({ ...x, minotaurus: true })),
  });

  const preset = PRESETS.find((p) => p.id === S.preset) ?? PRESETS[2];
  const start = () => {
    const seed = freshSeed();
    const pairs = sec.daedalus ? 2 : S.maze;
    const pre = pairs ? labyrinth(preset.rules.n, pairs, mulberry32(seed)) : [];
    setSetup({ rules: { ...preset.rules, pre }, presetKey: preset.id, mode: S.mode, level: S.level, side: S.side, coach: S.coach && S.mode === 'ki', secrets: { ...sec }, seed });
    setSec((x) => ({ ...x, daedalus: false, minotaurus: false }));
    setRound((r) => r + 1);
    setView('play');
  };

  const onFinish = (i: FinishInfo) => {
    const s = i.setup;
    const human = i.human;
    const won = human !== null && i.winner === human;
    const key = `${s.mode}-${s.presetKey}${s.mode === 'ki' ? '-' + s.level : ''}${(s.rules.pre?.length ?? 0) > 0 ? '-lab' : ''}`;
    upd((d) => {
      const st: MStat = d.stats[key] ?? { played: 0, won: 0, plies: 0, best: 0 };
      st.played++;
      if (won) { st.won++; st.plies += i.plies; st.best = st.best ? Math.min(st.best, i.plies) : i.plies; }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + (won ? 1 : 0), walls: d.totals.walls + i.walls, jumps: d.totals.jumps + i.jumps };
      d.coach = { best: d.coach.best + i.coach.best, good: d.coach.good + i.coach.good, bad: d.coach.bad + i.coach.bad };
      const rep: MReplay = { id: String(Date.now()), date: new Date().toLocaleDateString('de-DE'), n: s.rules.n, walls: s.rules.walls, pre: s.rules.pre ?? [], moves: i.moves, mode: s.mode, level: s.level, side: s.side, winner: i.winner };
      d.replays = [rep, ...d.replays].slice(0, 20);
    });
    if (s.mode === 'zwei') achieve('mauer', 'zwei');
    if (!won || i.usedSecret) return;
    achieve('mauer', 'first');
    if (s.level >= 3) achieve('mauer', 'meister');
    if (s.level >= 5) achieve('mauer', 'architekt');
    if (s.presetKey === 'mini' && s.level >= 3) achieve('mauer', 'mini');
    if (s.presetKey === 'gross' && s.level >= 3) achieve('mauer', 'gross');
    if (i.walls === 0) achieve('mauer', 'laeufer');
    if (i.walls >= s.rules.walls) achieve('mauer', 'maurer');
    if (i.jumps >= 3) achieve('mauer', 'springer');
    if (i.maxDeficit >= 4) achieve('mauer', 'aufholjagd');
    if ((s.rules.pre?.length ?? 0) > 0 && s.level >= 3) achieve('mauer', 'labyrinth');
    const c = i.coach, tot = c.best + c.good + c.bad;
    if (s.coach && tot >= 6 && c.best / tot >= 0.8 && !i.helped) achieve('mauer', 'coach');
  };

  const themeCls = `mb mb-th-${S.theme}`;
  const back = () => setView('menu');
  const top = (title: string, sub: string, left: () => void, label: string) => (
    <header className="mb-top"><button onClick={left}>← {label}</button><h1>{title}</h1><span className="mb-top-sub">{sub}</span></header>
  );

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        {top('Mauerbau', `${preset.name}`, back, 'Menü')}
        <MauerPlay key={round} setup={setup} S={S} onFinish={onFinish} onExit={back} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    body = (
      <div className="mb-sub-view">
        <header className="mb-subhead"><button onClick={back}>← Menü</button><h2>Lernen</h2>
          {seg(tab, setTab, [{ v: 'lessons', label: 'Lektionen' }, { v: 'puzzles', label: 'Aufgaben' }])}
        </header>
        {tab === 'lessons' ? <Lessons data={data} upd={upd} /> : <Puzzles data={data} upd={upd} daily={!!daily} />}
      </div>
    );
  } else if (view === 'replays') {
    body = replay ? <Replay r={replay} onBack={() => setReplay(null)} /> : (
      <div className="mb-sub-view">
        <header className="mb-subhead"><button onClick={back}>← Menü</button><h2>Partien</h2></header>
        {data.replays.length === 0 && <p className="mb-note">Noch keine beendete Partie.</p>}
        <ul className="mb-replist">{data.replays.map((r) => <li key={r.id}><button onClick={() => setReplay(r)}><b>{r.date}</b><span>{r.mode === 'ki' ? `Stufe ${r.level}` : 'zu zweit'} · {r.n}×{r.n}</span><span>{r.winner === null ? '–' : r.mode === 'ki' ? (r.winner === r.side ? 'Sieg' : 'Niederlage') : r.winner === 0 ? 'Weiß' : 'Orange'} · {Math.ceil(r.moves.length / 2)} Züge</span></button></li>)}</ul>
      </div>
    );
  } else if (view === 'stats') {
    const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
    const nm = (k: string) => { const [m, p, l, lab] = k.split('-'); return `${m === 'ki' ? `Stufe ${l} ${LEVELS[+l - 1]?.name ?? ''}` : 'Zu zweit'} · ${PRESETS.find((x) => x.id === p)?.name ?? p}${lab || l === 'lab' ? ' · Labyrinth' : ''}`; };
    const ct = data.coach.best + data.coach.good + data.coach.bad;
    body = (
      <div className="mb-sub-view">
        <header className="mb-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="mb-statgrid">
          <div><b>{data.totals.games}</b><span>Partien</span></div><div><b>{data.totals.wins}</b><span>Siege</span></div>
          <div><b>{data.totals.walls}</b><span>Mauern gesetzt</span></div><div><b>{data.totals.jumps}</b><span>Sprünge</span></div>
          <div><b>{data.puzzles.wall + data.puzzles.race}</b><span>Aufgaben gelöst</span></div><div><b>{ct ? Math.round(((data.coach.best + data.coach.good) / ct) * 100) + ' %' : '–'}</b><span>Coach: gute Züge</span></div>
        </div>
        <table className="mb-table"><thead><tr><th>Art</th><th>Gespielt</th><th>Siege</th><th>Ø Züge beim Sieg</th><th>Kürzester Sieg</th></tr></thead>
          <tbody>{rows.length ? rows.map(([k, s]) => <tr key={k}><td>{nm(k)}</td><td>{s.played}</td><td>{s.won}</td><td>{s.won ? Math.round(s.plies / s.won / 2) : '–'}</td><td>{s.best ? Math.ceil(s.best / 2) : '–'}</td></tr>) : <tr><td colSpan={5}>Noch keine Partien.</td></tr>}</tbody></table>
      </div>
    );
  } else if (view === 'options') {
    body = (
      <div className="mb-sub-view">
        <header className="mb-subhead"><button onClick={back}>← Menü</button><h2>Optionen</h2></header>
        <div className="mb-opts">
          <section><h3>Zeichenblatt</h3>
            <div className="mb-swatches">{THEMES_M.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`mb mb-th-${t.id} mb-sw`}><i /><i /><i /></span><span>{t.name}</span></button>)}</div>
          </section>
          <section><h3>Hilfen</h3>
            <label className="mb-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Coach: jeden Zug bewerten (nur gegen KI)</label>
            <label className="mb-check"><input type="checkbox" checked={S.paths} onChange={(e) => setS({ paths: e.target.checked })} /> Kürzeste Wege immer einzeichnen</label>
            <label className="mb-check"><input type="checkbox" checked={S.sound} onChange={(e) => setS({ sound: e.target.checked })} /> Geräusche</label>
            <h3>Daten</h3>
            <button className="danger" onClick={() => { if (confirm('Alle Mauerbau-Daten löschen?')) { upd((d) => { Object.assign(d, { ...MAUER_INIT, settings: d.settings }); }); toast('Mauerbau-Daten gelöscht'); } }}>Mauerbau-Daten löschen …</button>
          </section>
        </div>
      </div>
    );
  } else {
    const lv = LEVELS[S.level - 1];
    body = (
      <div className="mb-menu">
        <section className="mb-new">
          <div className="mb-hero" aria-hidden>
            <Hero />
            <div className="mb-titleblock"><b>Mauerbau</b><span>Zeichnung Nr. 9 · Maßstab 1 : 1</span><span>Wer zuerst drüben ist, hat gewonnen.</span></div>
          </div>
          <div className="mb-setup">
            <h2>Neue Partie</h2>
            <label><span>Gegner</span>{seg(S.mode, (v) => setS({ mode: v }), [{ v: 'ki', label: 'KI' }, { v: 'zwei', label: 'Zu zweit' }])}</label>
            <label><span>Brett</span>{seg(S.preset, (v) => setS({ preset: v }), PRESETS.map((p) => ({ v: p.id, label: p.name.split(' ')[1] ?? p.name, title: p.info })))}<small>{preset.name}: {preset.info}</small></label>
            {S.mode === 'ki' && <>
              <label><span>Stufe</span>{seg(S.level, (v) => setS({ level: v }), LEVELS.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name}: {lv.info}</small></label>
              <label><span>Du spielst</span>{seg(S.side, (v) => setS({ side: v }), [{ v: 0, label: 'Weiß (beginnt)' }, { v: 1, label: 'Orange' }])}</label>
            </>}
            <label><span>Start</span>{seg(S.maze, (v) => setS({ maze: v }), [{ v: 0, label: 'Leeres Brett' }, { v: 2, label: 'Labyrinth leicht' }, { v: 4, label: 'Labyrinth schwer' }])}<small>{S.maze ? `${S.maze * 2} Mauern stehen von Anfang an (punktsymmetrisch).` : 'Beide Seiten starten ohne Mauern.'}</small></label>
            {S.mode === 'ki' && <label className="mb-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Coach bewertet meine Züge</label>}
            <button className="mb-start" onClick={start}>Partie beginnen</button>
            {(sec.ariadne || sec.daedalus || sec.minotaurus) && <p className="mb-sub">Geheim aktiv: {[sec.ariadne && 'Ariadnefaden', sec.daedalus && 'Dädalus', sec.minotaurus && 'Minotaurus'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="mb-tiles">
          <button className="mb-tile" onClick={() => { setTab('puzzles'); setView('learn'); }}><i>1</i><b>Tagesaufgabe</b><span>{dailyDone('mauer', '') ? 'gelöst ✓' : 'für alle dieselbe'}</span></button>
          <button className="mb-tile" onClick={() => { setTab('lessons'); setView('learn'); }}><i>2</i><b>Lernen</b><span>{Object.values(data.lessons).filter(Boolean).length} / {LESSONS.length} Lektionen · Aufgaben</span></button>
          <button className="mb-tile" onClick={() => { setReplay(null); setView('replays'); }}><i>3</i><b>Partien</b><span>{data.replays.length} gespeichert</span></button>
          <button className="mb-tile" onClick={() => setView('stats')}><i>4</i><b>Statistik</b><span>{data.totals.games} Partien · {data.totals.wins} Siege</span></button>
          <button className="mb-tile" onClick={() => setView('options')}><i>5</i><b>Optionen</b><span>Design, Coach, Wege</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      {top('Mauerbau', 'Wettlauf mit Mauern', view === 'menu' ? onExit : back, view === 'menu' ? 'Halle' : 'Menü')}
      {body}
    </div>
  );
}

function Hero() {
  const s = useMemo(() => {
    const st = newState({ n: 7, walls: 6 });
    const mv: Move[] = [{ t: 'm', r: 5, c: 3 }, { t: 'm', r: 1, c: 3 }, { t: 'm', r: 4, c: 3 }, { t: 'h', r: 2, c: 2 }, { t: 'm', r: 4, c: 2 }, { t: 'v', r: 1, c: 3 }, { t: 'm', r: 3, c: 2 }, { t: 'h', r: 0, c: 4 }];
    for (const m of mv) apply(st, m);
    return st;
  }, []);
  return <Board s={s} targets={[]} canAct={false} wallMode={false} wallOk={() => false} onMove={NOOP} paths={[shortestPath(s, 0), shortestPath(s, 1)]} owner={(m) => (m.t === 'h' ? 1 : 0)} />;
}
