import { useEffect, useMemo, useState } from 'react';
import '@fontsource/shippori-mincho/400.css';
import '@fontsource/shippori-mincho/600.css';
import '@fontsource/shippori-mincho/700.css';
import { LEVELS } from './ai';
import { BOARDS, GO_INIT, SIZES, STONESETS, type GData, type GSettings, type GStat, type SavedGame } from './data';
import GoBoard from './GoBoard';
import { BLACK, type Color, DEFAULT_RULES, type Rules, WHITE, toSgf } from './engine';
import GoPlay, { type FinishInfo } from './GoPlay';
import { LessonView, ProblemHub, ProblemPlayer } from './GoLearn';
import { Archive, type Replay, ReviewView } from './GoReview';
import { genProblem } from './problems';
import type { Setup } from './types';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { newId } from '../shared/ids';
import { dailySeed } from '../shared/rng';
import { achieve, markDaily, toast, useGameData, dailyDone } from '../shared/store';
import './go.css';

type View = 'menu' | 'play' | 'learn' | 'problems' | 'daily' | 'archive' | 'review' | 'stats' | 'options';

const seg = <T extends string | number>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="go-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);

export default function GoGame({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('go');
  const [data, upd] = useGameData<GData>('go', GO_INIT);
  const S: GSettings = { ...GO_INIT.settings, ...data.settings };
  const setS = (p: Partial<GSettings>) => upd((d) => { d.settings = { ...GO_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(daily ? 'daily' : 'menu');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [round, setRound] = useState(0);
  const [reviewSgf, setReviewSgf] = useState<{ sgf: string; title: string } | null>(null);
  const [orakel, setOrakel] = useState(false);
  const [tengen, setTengen] = useState(false);
  const [nigiri, setNigiri] = useState(false);

  useSecrets('go', {
    'go-orakel': () => setOrakel(true),
    'go-tengen': () => { setTengen(true); toast('Wirkt ab der nächsten Partie.'); },
    'go-nigiri': () => { setNigiri(true); toast('Nächste Partie: Farbe wird ausgelost.'); },
  });

  // ───── Partie starten ─────
  const rulesOf = (): Rules => ({
    ...DEFAULT_RULES, n: S.size, komi: S.handicap >= 2 ? 0.5 : S.komi, scoring: S.scoring, ko: S.ko, suicide: false,
    torus: S.variant === 'torus', atari: S.variant === 'atari',
  });
  const start = (override?: Partial<Setup>) => {
    let human: Color | 0 = S.opp === 'zwei' ? 0 : S.color === 'schwarz' ? BLACK : S.color === 'weiss' ? WHITE : Math.random() < 0.5 ? BLACK : WHITE;
    if (nigiri && S.opp === 'ki') { human = Math.random() < 0.5 ? BLACK : WHITE; setNigiri(false); toast(`Ausgelost: Du spielst ${human === BLACK ? 'Schwarz' : 'Weiß'}.`); }
    const next: Setup = { opp: S.opp, variant: S.variant, level: S.level, human, rules: rulesOf(), handicap: S.variant === 'atari' ? 0 : S.handicap, ...override };
    setSetup(next); setRound((r) => r + 1); setView('play');
  };

  const onFinish = (i: FinishInfo) => {
    const s = i.setup;
    const win = s.opp === 'ki' && i.winner === s.human;
    const key = `${s.opp === 'ki' ? `L${s.level}` : '2P'}-${s.variant}-${s.rules.n}`;
    const sgf = toSgf(s.rules, i.moves, i.states[0].board.reduce<number[]>((a, v, k) => (v === BLACK && !i.moves.some((m) => m.idx === k) ? [...a, k] : a), []));
    const label = s.opp === 'ki' ? `KI ${LEVELS.find((l) => l.id === s.level)?.name}` : 'Zwei Spieler';
    const g: SavedGame = { id: newId(), date: new Date().toLocaleDateString('de-DE'), sgf, result: i.resultText, n: s.rules.n, mode: `${label}${s.variant === 'atari' ? ' · Atari-Go' : s.variant === 'torus' ? ' · Torus' : ''}`, level: s.level, moves: i.moves.length };
    upd((d) => {
      const st: GStat = d.stats[key] ?? { played: 0, won: 0, lost: 0, streak: 0, bestStreak: 0 };
      st.played++;
      if (s.opp === 'ki') { if (win) { st.won++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); } else { st.lost++; st.streak = 0; } }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + (win ? 1 : 0), captures: d.totals.captures + i.states[i.states.length - 1].caps[0] + i.states[i.states.length - 1].caps[1], moves: d.totals.moves + i.moves.length };
      d.games = [g, ...d.games].slice(0, 40);
    });
    achieve('go', 'first');
    if (s.opp === 'zwei') achieve('go', 'zwei');
    if (i.koSeen) achieve('go', 'ko');
    const last = i.states[i.states.length - 1];
    const myCaps = s.human === WHITE ? last.caps[1] : last.caps[0];
    if (s.opp === 'ki' && myCaps >= 10) achieve('go', 'capture10');
    if (win && !i.helped) {
      achieve('go', 'win');
      if (s.rules.n >= 13) achieve('go', 'win13');
      if (s.rules.n === 19) achieve('go', 'win19');
      if (s.level >= 4 && s.variant === 'normal') achieve('go', 'lv4');
      if (s.level === 6 && s.variant === 'normal') achieve('go', 'lv6');
      if (s.handicap >= 2 && s.human === WHITE) achieve('go', 'vorgabe');
      if (s.variant === 'atari') achieve('go', 'atari');
      if (s.variant === 'torus') achieve('go', 'torus');
    }
  };

  const onProblemSolved = (id: string, clean: boolean) => {
    upd((d) => {
      const first = !d.solved[id];
      d.solved = { ...d.solved, [id]: (d.solved[id] ?? 0) + 1 };
      if (first) {
        d.problemStreak = clean ? d.problemStreak + 1 : 0;
        d.bestProblemStreak = Math.max(d.bestProblemStreak, d.problemStreak);
      }
    });
    const cnt = Object.keys(data.solved).length + (data.solved[id] ? 0 : 1);
    if (cnt >= 10) achieve('go', 'tsumego10');
    if (cnt >= 50) achieve('go', 'tsumego50');
    if (clean && data.problemStreak + 1 >= 5) achieve('go', 'streak5');
  };

  const dailyProblem = useMemo(() => {
    const seed = dailySeed('go', 'tsumego');
    return genProblem(seed, 'capture', 2) ?? genProblem(seed + 1, 'capture', 2);
  }, []);

  useEffect(() => { if (daily) setView('daily'); }, [daily]);

  const back = () => setView('menu');

  // ───── Ansichten ─────
  if (view === 'play' && setup) {
    return (
      <div className={`go go-th-${S.board}`}>
        <header className="go-top"><button onClick={() => setView('menu')}>← Menü</button><h1>Go <span className="go-kanji">碁</span></h1><span className="go-top-sub">{setup.rules.n}×{setup.rules.n}{setup.rules.torus ? ' Torus' : ''}{setup.rules.atari ? ' Atari-Go' : ''}</span></header>
        <GoPlay key={round} setup={setup} S={S} orakel={orakel} tengen={tengen} onTengenUsed={() => setTengen(false)} onFinish={onFinish} onExit={() => setView('menu')} onAgain={() => start()} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    body = <LessonView S={S} done={data.lessons} onBack={back} onDone={(id) => { upd((d) => { d.lessons = { ...d.lessons, [id]: true }; }); }} onTaskSolved={onProblemSolved} />;
    if (Object.keys(data.lessons).length >= 8) achieve('go', 'lessons');
  } else if (view === 'problems') {
    body = <ProblemHub S={S} solved={data.solved} streak={data.problemStreak} best={data.bestProblemStreak} onSolved={onProblemSolved} onBack={back} onDaily={() => setView('daily')} />;
  } else if (view === 'daily') {
    body = (
      <div className="go-sub-view">
        <header className="go-subhead"><button onClick={back}>← Menü</button><h2>Aufgabe des Tages</h2><span>{dailyDone('go', '') ? 'heute gelöst ✓' : 'noch offen'}</span></header>
        {dailyProblem ? <ProblemPlayer problem={{ ...dailyProblem, title: 'Tagesaufgabe', text: 'Fange die markierte Gruppe in zwei Zügen – für alle heute gleich.' }} S={S} onSolved={() => { markDaily('go', ''); achieve('go', 'daily'); onProblemSolved(`daily-${new Date().toISOString().slice(0, 10)}`, true); }} /> : <p>Heute keine Aufgabe.</p>}
      </div>
    );
  } else if (view === 'archive') {
    body = <Archive S={S} games={data.games} onBack={back} onDelete={(id) => upd((d) => { d.games = d.games.filter((g) => g.id !== id); })} onOpen={(g) => { setReviewSgf({ sgf: g.sgf, title: `${g.mode} · ${g.n}×${g.n}` }); setView('review'); }} onImport={(t) => { achieve('go', 'sgf'); setReviewSgf({ sgf: t, title: 'Importierte Partie' }); setView('review'); }} />;
  } else if (view === 'review' && reviewSgf) {
    body = <ReviewView S={S} sgf={reviewSgf.sgf} title={reviewSgf.title} onBack={() => setView('archive')} onContinue={(r: Replay, at: number) => {
      const st = r.states.slice(0, at + 1);
      const cur = st[st.length - 1];
      start({ opp: 'ki', variant: 'normal', level: S.level, human: cur.turn, rules: { ...st[0].rules, scoring: S.scoring, ko: S.ko }, handicap: 0, resume: { states: st, moves: r.moves.slice(0, at), handicapPts: r.handicap } });
    }} />;
  } else if (view === 'stats') {
    body = <Stats data={data} onBack={back} />;
  } else if (view === 'options') {
    body = <Options S={S} setS={setS} onBack={back} onReset={() => { upd((d) => { Object.assign(d, { ...GO_INIT, settings: d.settings }); }); toast('Go-Daten zurückgesetzt'); }} />;
  } else {
    body = (
      <Menu S={S} setS={setS} data={data} start={() => start()} go={setView} orakel={orakel} tengen={tengen} nigiri={nigiri} dailyOk={dailyDone('go', '')} />
    );
  }

  return (
    <div className={`go go-th-${S.board}`}>
      <header className="go-top">
        <button onClick={view === 'menu' ? onExit : back}>← {view === 'menu' ? 'Halle' : 'Menü'}</button>
        <h1>Go <span className="go-kanji">碁</span></h1>
        <span className="go-top-sub">Das Spiel der Steine</span>
      </header>
      {body}
    </div>
  );
}

// ───────── Menü ─────────

function Menu({ S, setS, data, start, go, orakel, tengen, nigiri, dailyOk }: { S: GSettings; setS: (p: Partial<GSettings>) => void; data: GData; start: () => void; go: (v: View) => void; orakel: boolean; tengen: boolean; nigiri: boolean; dailyOk: boolean }) {
  const lv = LEVELS.find((l) => l.id === S.level) ?? LEVELS[1];
  const solved = Object.keys(data.solved).length;
  const lessons = Object.values(data.lessons).filter(Boolean).length;
  const demo = useMemo(() => {
    const b = new Uint8Array(81);
    const put = (x: number, y: number, c: number) => { b[y * 9 + x] = c; };
    [[2, 2, 1], [3, 2, 2], [2, 3, 2], [3, 3, 1], [4, 4, 1], [5, 3, 2], [6, 6, 2], [6, 5, 1], [5, 6, 1], [1, 5, 2], [2, 5, 1], [2, 6, 2]].forEach(([x, y, c]) => put(x, y, c));
    return b;
  }, []);
  return (
    <div className="go-menu">
      <section className="go-new">
        <div className="go-demo"><GoBoard n={9} board={demo} theme={S.board} stones={S.stones} coords={false} last={29} /></div>
        <div className="go-setup">
          <h2>Neue Partie</h2>
          <label><span>Gegner</span>{seg(S.opp, (v) => setS({ opp: v }), [{ v: 'ki', label: 'Computer' }, { v: 'zwei', label: 'Zu zweit' }])}</label>
          <label><span>Variante</span>{seg(S.variant, (v) => setS({ variant: v }), [{ v: 'normal', label: 'Standard' }, { v: 'atari', label: 'Atari-Go', title: 'Wer zuerst Steine fängt, gewinnt' }, { v: 'torus', label: 'Torus', title: 'Ränder sind verbunden' }])}</label>
          <label><span>Brett</span>{seg(S.size, (v) => setS({ size: v }), SIZES.map((v) => ({ v, label: `${v}` })))}</label>
          {S.opp === 'ki' && (
            <>
              <label><span>Stufe</span>{seg(S.level, (v) => setS({ level: v }), LEVELS.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name} – {lv.info}</small></label>
              <label><span>Farbe</span>{seg(S.color, (v) => setS({ color: v }), [{ v: 'schwarz', label: 'Schwarz' }, { v: 'weiss', label: 'Weiß' }, { v: 'los', label: 'Los' }])}</label>
              {S.variant !== 'atari' && <label><span>Vorgabe</span>{seg(S.handicap, (v) => setS({ handicap: v }), [0, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => ({ v, label: String(v) })))}<small>{S.handicap >= 2 ? `Schwarz setzt ${S.handicap} Steine vorab (Komi 0,5).` : 'Ohne Vorgabe, Schwarz beginnt.'}</small></label>}
            </>
          )}
          {S.variant !== 'atari' && (
            <div className="go-row2">
              <label><span>Zählweise</span>{seg(S.scoring, (v) => setS({ scoring: v }), [{ v: 'gebiet', label: 'Gebiet' }, { v: 'flaeche', label: 'Fläche' }])}</label>
              <label><span>Ko-Regel</span>{seg(S.ko, (v) => setS({ ko: v }), [{ v: 'einfach', label: 'Einfach' }, { v: 'superko', label: 'Superko' }])}</label>
              <label><span>Komi</span><input type="number" step={0.5} min={0} max={20} value={S.komi} onChange={(e) => setS({ komi: Math.max(0, Math.min(20, +e.target.value || 0)) })} /></label>
            </div>
          )}
          <button className="go-start" onClick={start}>Partie beginnen</button>
          {(orakel || tengen || nigiri) && <p className="go-sub">Geheim aktiv: {[orakel && 'Orakel', tengen && 'Tengen', nigiri && 'Nigiri'].filter(Boolean).join(', ')}</p>}
        </div>
      </section>
      <section className="go-tiles">
        <button className="go-tile" onClick={() => go('learn')}><i>学</i><b>Lernen</b><span>{lessons} / 8 Lektionen</span></button>
        <button className="go-tile" onClick={() => go('problems')}><i>問</i><b>Aufgaben</b><span>{solved} gelöst</span></button>
        <button className="go-tile" onClick={() => go('daily')}><i>日</i><b>Tagesaufgabe</b><span>{dailyOk ? 'gelöst ✓' : 'offen'}</span></button>
        <button className="go-tile" onClick={() => go('archive')}><i>譜</i><b>Archiv &amp; SGF</b><span>{data.games.length} Partien</span></button>
        <button className="go-tile" onClick={() => go('stats')}><i>計</i><b>Statistik</b><span>{data.totals.games} Partien · {data.totals.wins} Siege</span></button>
        <button className="go-tile" onClick={() => go('options')}><i>設</i><b>Optionen</b><span>Brett, Steine, Hilfen</span></button>
      </section>
    </div>
  );
}

// ───────── Statistik ─────────

function Stats({ data, onBack }: { data: GData; onBack: () => void }) {
  const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
  const name = (k: string) => {
    const [who, variant, n] = k.split('-');
    const lv = who.startsWith('L') ? LEVELS.find((l) => l.id === +who.slice(1))?.name : 'Zu zweit';
    return `${lv} · ${n}×${n}${variant === 'atari' ? ' · Atari-Go' : variant === 'torus' ? ' · Torus' : ''}`;
  };
  return (
    <div className="go-sub-view">
      <header className="go-subhead"><button onClick={onBack}>← Menü</button><h2>Statistik</h2></header>
      <div className="go-statgrid">
        <div><b>{data.totals.games}</b><span>Partien</span></div>
        <div><b>{data.totals.wins}</b><span>Siege</span></div>
        <div><b>{data.totals.moves}</b><span>Züge</span></div>
        <div><b>{data.totals.captures}</b><span>Steine gefangen</span></div>
        <div><b>{Object.keys(data.solved).length}</b><span>Aufgaben gelöst</span></div>
        <div><b>{data.bestProblemStreak}</b><span>Beste Serie</span></div>
      </div>
      <table className="go-table">
        <thead><tr><th>Partieart</th><th>Gespielt</th><th>Siege</th><th>Niederlagen</th><th>Serie</th></tr></thead>
        <tbody>{rows.length ? rows.map(([k, s]) => <tr key={k}><td>{name(k)}</td><td>{s.played}</td><td>{s.won}</td><td>{s.lost}</td><td>{s.streak} (Rekord {s.bestStreak})</td></tr>) : <tr><td colSpan={5}>Noch keine Partien.</td></tr>}</tbody>
      </table>
    </div>
  );
}

// ───────── Optionen ─────────

function Options({ S, setS, onBack, onReset }: { S: GSettings; setS: (p: Partial<GSettings>) => void; onBack: () => void; onReset: () => void }) {
  const demo = useMemo(() => { const b = new Uint8Array(25); b[6] = 1; b[7] = 2; b[12] = 1; b[13] = 2; b[18] = 1; return b; }, []);
  const [sure, setSure] = useState(false);
  return (
    <div className="go-sub-view">
      <header className="go-subhead"><button onClick={onBack}>← Menü</button><h2>Optionen</h2></header>
      <div className="go-opts">
        <section>
          <h3>Brett</h3>
          <div className="go-swatches">{BOARDS.map((b) => <button key={b.id} className={S.board === b.id ? 'on' : ''} onClick={() => setS({ board: b.id })}><GoBoard n={5} board={demo} theme={b.id} stones={S.stones} coords={false} /><span>{b.name}</span></button>)}</div>
          <h3>Steine</h3>
          <div className="go-swatches">{STONESETS.map((b) => <button key={b.id} className={S.stones === b.id ? 'on' : ''} onClick={() => setS({ stones: b.id })}><GoBoard n={5} board={demo} theme={S.board} stones={b.id} coords={false} /><span>{b.name}</span></button>)}</div>
        </section>
        <section>
          <h3>Anzeige &amp; Hilfen</h3>
          {([['coords', 'Koordinaten am Rand'], ['showLast', 'Letzten Zug markieren'], ['showLibs', 'Freiheiten beim Überfahren zeigen'], ['confirm', 'Zug erst bestätigen (zweiter Tipp setzt)'], ['sound', 'Klack-Geräusche']] as const).map(([k, label]) => (
            <label key={k} className="go-check"><input type="checkbox" checked={S[k]} onChange={(e) => setS({ [k]: e.target.checked } as Partial<GSettings>)} /> {label}</label>
          ))}
          <h3>Daten</h3>
          {!sure ? <button className="danger" onClick={() => setSure(true)}>Go-Daten löschen …</button> : <div className="go-actions"><button className="danger" onClick={() => { onReset(); setSure(false); }}>Wirklich löschen</button><button onClick={() => setSure(false)}>Abbrechen</button></div>}
        </section>
      </div>
    </div>
  );
}
