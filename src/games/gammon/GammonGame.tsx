import { useMemo, useState } from 'react';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/600.css';
import { LEVELS_G } from './levels';
import BoardView from './BoardView';
import { BOARD_THEMES, CHECKER_SETS, GAMMON_INIT, VARIANTS, type MData, type MSaved, type MSettings, type MStat } from './data';
import { startPosition } from './engine';
import GammonPlay, { type GameEnd, type PlaySetup } from './GammonPlay';
import { LessonView, OpeningTrainer, PuzzleView, ReplayView } from './GammonLearn';
import { LESSONS } from './lessons';
import { OPENINGS } from './openings';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { newId } from '../shared/ids';
import { dailySeed } from '../shared/rng';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './gammon.css';

type View = 'menu' | 'play' | 'learn' | 'openings' | 'puzzles' | 'daily' | 'archive' | 'replay' | 'stats' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="gm-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);

export default function GammonGameRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('gammon');
  const [data, upd] = useGameData<MData>('gammon', GAMMON_INIT);
  const S: MSettings = { ...GAMMON_INIT.settings, ...data.settings };
  const setS = (p: Partial<MSettings>) => upd((d) => { d.settings = { ...GAMMON_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(daily ? 'daily' : 'menu');
  const [setup, setSetup] = useState<PlaySetup | null>(null);
  const [round, setRound] = useState(0);
  const [replay, setReplay] = useState<MSaved | null>(null);
  const [sec, setSec] = useState({ wuerfel: false, glueck: 0, pythia: false });

  useSecrets('gammon', {
    'gammon-wuerfel': () => setSec((x) => ({ ...x, wuerfel: true })),
    'gammon-glueck': () => setSec((x) => ({ ...x, glueck: x.glueck + 1 })),
    'gammon-pythia': () => setSec((x) => ({ ...x, pythia: true })),
  });

  const start = () => {
    const human = S.color === 'weiss' ? 0 : S.color === 'schwarz' ? 1 : Math.random() < 0.5 ? 0 : 1;
    const next: PlaySetup = { opp: S.opp, level: S.level, variant: S.variant, match: S.match, cube: S.cube, human, jacoby: S.jacoby };
    setSetup(next); setRound((r) => r + 1); setView('play');
  };

  const onGameEnd = (e: GameEnd) => {
    const s = e.setup;
    const humanWon = s.opp === 'ki' ? e.winner === s.human : true;
    const me = s.opp === 'ki' ? s.human : e.winner;
    const key = `${s.opp === 'ki' ? `L${s.level}` : '2P'}-${s.variant}-${s.match}`;
    const label = `${s.opp === 'ki' ? `KI Stufe ${s.level}` : 'Zwei Spieler'} · ${VARIANTS.find((v) => v.id === s.variant)?.name}${s.match ? ` · Match ${s.match}` : ''}`;
    const saved: MSaved = { id: newId(), date: new Date().toLocaleDateString('de-DE'), result: `${e.winner === 0 ? 'Weiß' : 'Schwarz'} gewinnt ${e.points} Punkt${e.points === 1 ? '' : 'e'}`, mode: label, variant: s.variant, entries: e.entries };
    upd((d) => {
      const st: MStat = d.stats[key] ?? { played: 0, won: 0, gammons: 0, backgammons: 0, points: 0, streak: 0, bestStreak: 0 };
      st.played++;
      if (s.opp === 'ki') {
        if (humanWon) { st.won++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); st.points += e.points; if (e.kind === 'gammon') st.gammons++; if (e.kind === 'backgammon') st.backgammons++; } else { st.streak = 0; }
      }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + (humanWon && s.opp === 'ki' ? 1 : 0), hits: d.totals.hits + e.hits[me] };
      d.saved = [saved, ...d.saved].slice(0, 25);
    });
    achieve('gammon', 'first');
    if (s.opp === 'zwei') achieve('gammon', 'zwei');
    if (e.hits[me] >= 5) achieve('gammon', 'hits5');
    if (e.doubles[me] >= 3) achieve('gammon', 'doubles');
    if (humanWon && s.opp === 'ki' && !e.helped) {
      achieve('gammon', 'win');
      if (e.kind === 'gammon') achieve('gammon', 'gammon');
      if (e.kind === 'backgammon') { achieve('gammon', 'backgammon'); achieve('gammon', 'gammon'); }
      if (s.level >= 5) achieve('gammon', 'lv5');
      if (e.matchOver && s.match >= 3) achieve('gammon', 'match');
      if (e.cubeValue >= 8) achieve('gammon', 'cube8');
      if (s.variant === 'hyper') achieve('gammon', 'hyper');
      if (S.coach && e.worstLoss < 0.1) achieve('gammon', 'clean');
    }
  };

  const onCoach = (loss: number) => upd((d) => { d.coach = { turns: d.coach.turns + 1, lossSum: d.coach.lossSum + loss, blunders: d.coach.blunders + (loss >= 0.1 ? 1 : 0) }; });

  const dailySeedNo = useMemo(() => dailySeed('gammon', 'rätsel') % 100000, []);
  const back = () => setView('menu');
  const themeCls = `gm gm-th-${S.board} gm-ck-${S.checkers}`;

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        <header className="gm-top"><button onClick={() => setView('menu')}>← Menü</button><h1>Backgammon</h1><span className="gm-top-sub">{VARIANTS.find((v) => v.id === setup.variant)?.name}</span></header>
        <GammonPlay key={round} setup={setup} S={S} secrets={sec} onGameEnd={onGameEnd} onCoach={onCoach} onExit={() => setView('menu')} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    body = <LessonView S={S} done={data.lessons} onBack={back} onDone={(id) => { upd((d) => { d.lessons = { ...d.lessons, [id]: true }; }); if (Object.keys(data.lessons).length + 1 >= LESSONS.length) achieve('gammon', 'lessons'); }} />;
  } else if (view === 'openings') {
    body = <OpeningTrainer S={S} counts={data.opening} onBack={back} onResult={(roll) => { upd((d) => { d.opening = { ...d.opening, [roll]: (d.opening[roll] ?? 0) + 1 }; }); if (Object.keys(data.opening).length + (data.opening[roll] ? 0 : 1) >= OPENINGS.length) achieve('gammon', 'book'); }} />;
  } else if (view === 'puzzles' || view === 'daily') {
    const isDaily = view === 'daily';
    body = <PuzzleView key={view} S={S} daily={isDaily} seedStart={isDaily ? dailySeedNo : Math.floor(Math.random() * 100000)} solved={data.puzzlesSolved} streak={data.puzzleStreak} best={data.bestPuzzleStreak}
      onBack={back} onResult={(ok, first) => {
        upd((d) => { if (ok) { d.puzzlesSolved++; d.puzzleStreak = first ? d.puzzleStreak + 1 : 0; d.bestPuzzleStreak = Math.max(d.bestPuzzleStreak, d.puzzleStreak); } else d.puzzleStreak = 0; });
        if (ok) {
          if (data.puzzlesSolved + 1 >= 10) achieve('gammon', 'puzzle10');
          if (first && data.puzzleStreak + 1 >= 5) achieve('gammon', 'puzzle5s');
          if (isDaily && !dailyDone('gammon', '')) { markDaily('gammon', ''); achieve('gammon', 'daily'); toast('Rätsel des Tages gelöst'); }
        }
      }} />;
  } else if (view === 'archive') {
    body = (
      <div className="gm-sub-view">
        <header className="gm-subhead"><button onClick={back}>← Menü</button><h2>Archiv</h2><span>{data.saved.length} Partien</span></header>
        {data.saved.length === 0 && <p className="gm-sub">Noch nichts gespeichert. Beendete Spiele erscheinen hier und lassen sich Zug für Zug nachspielen.</p>}
        <ul className="gm-archive">
          {data.saved.map((g) => (
            <li key={g.id}>
              <button onClick={() => { setReplay(g); setView('replay'); }}><b>{g.mode}</b><span>{g.result}</span><small>{g.date} · {g.entries.filter((e) => e.kind === 'zug').length} Züge</small></button>
              <button className="x" aria-label="Löschen" onClick={() => upd((d) => { d.saved = d.saved.filter((x) => x.id !== g.id); })}>×</button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (view === 'replay' && replay) {
    body = <ReplayView saved={replay} S={S} onBack={() => setView('archive')} />;
  } else if (view === 'stats') {
    const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
    const name = (k: string) => { const [who, v, m] = k.split('-'); return `${who.startsWith('L') ? `KI Stufe ${who.slice(1)}` : 'Zwei Spieler'} · ${VARIANTS.find((x) => x.id === v)?.name ?? v}${+m ? ` · Match ${m}` : ''}`; };
    const avg = data.coach.turns ? (data.coach.lossSum / data.coach.turns) * 100 : 0;
    body = (
      <div className="gm-sub-view">
        <header className="gm-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="gm-statgrid">
          <div><b>{data.totals.games}</b><span>Spiele</span></div><div><b>{data.totals.wins}</b><span>Siege gegen KI</span></div><div><b>{data.totals.hits}</b><span>Steine geschlagen</span></div>
          <div><b>{data.puzzlesSolved}</b><span>Rätsel gelöst</span></div><div><b>{data.bestPuzzleStreak}</b><span>Beste Rätsel-Serie</span></div>
          <div><b>{data.coach.turns ? `${avg.toFixed(1)} %` : '–'}</b><span>Ø Fehler je Zug (Coach)</span></div><div><b>{data.coach.blunders}</b><span>Patzer (≥ 10 %)</span></div>
        </div>
        <table className="gm-table"><thead><tr><th>Partieart</th><th>Gespielt</th><th>Siege</th><th>Gammons</th><th>Punkte</th><th>Serie</th></tr></thead>
          <tbody>{rows.length ? rows.map(([k, s]) => <tr key={k}><td>{name(k)}</td><td>{s.played}</td><td>{s.won}</td><td>{s.gammons + s.backgammons}</td><td>{s.points}</td><td>{s.streak} (Rekord {s.bestStreak})</td></tr>) : <tr><td colSpan={6}>Noch keine Partien.</td></tr>}</tbody></table>
      </div>
    );
  } else if (view === 'options') {
    body = <Options S={S} setS={setS} onBack={back} onReset={() => { upd((d) => { Object.assign(d, { ...GAMMON_INIT, settings: d.settings }); }); toast('Backgammon-Daten zurückgesetzt'); }} />;
  } else {
    const lv = LEVELS_G.find((l) => l.id === S.level) ?? LEVELS_G[2];
    const lessons = Object.values(data.lessons).filter(Boolean).length;
    body = (
      <div className="gm-menu">
        <section className="gm-new">
          <div className="gm-demo"><BoardView s={startPosition()} viewer={0} selected={null} targets={[]} dice={[5, 3]} usedDice={[]} turn={0} cube={{ v: 1, owner: -1 }} pipLabels={false} mirror={S.mirror} onPoint={() => undefined} /></div>
          <div className="gm-setup">
            <h2>Neue Partie</h2>
            <label><span>Gegner</span>{seg(S.opp, (v) => setS({ opp: v }), [{ v: 'ki', label: 'Computer' }, { v: 'zwei', label: 'Zu zweit' }])}</label>
            {S.opp === 'ki' && <label><span>Stufe</span>{seg(S.level, (v) => setS({ level: v }), LEVELS_G.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name} – {lv.info}</small></label>}
            {S.opp === 'ki' && <label><span>Farbe</span>{seg(S.color, (v) => setS({ color: v }), [{ v: 'weiss', label: 'Weiß' }, { v: 'schwarz', label: 'Schwarz' }, { v: 'los', label: 'Los' }])}</label>}
            <label><span>Variante</span>{seg(S.variant, (v) => setS({ variant: v }), VARIANTS.map((v) => ({ v: v.id, label: v.name, title: v.info })))}<small>{VARIANTS.find((v) => v.id === S.variant)?.info}</small></label>
            <label><span>Spielende</span>{seg(S.match, (v) => setS({ match: v }), [{ v: 0, label: 'Einzelspiel' }, { v: 1, label: '1' }, { v: 3, label: '3' }, { v: 5, label: '5' }, { v: 7, label: '7' }, { v: 11, label: '11' }])}<small>{S.match ? `Match bis ${S.match} Punkte (mit Crawford-Regel).` : 'Ein Spiel, Punkte werden nur gezählt.'}</small></label>
            <div className="gm-row2">
              <label><span>Doppelwürfel</span>{seg(S.cube, (v) => setS({ cube: v }), [{ v: true, label: 'An' }, { v: false, label: 'Aus' }])}</label>
              <label><span>Jacoby-Regel</span>{seg(S.jacoby, (v) => setS({ jacoby: v }), [{ v: false, label: 'Aus' }, { v: true, label: 'An' }])}</label>
            </div>
            <button className="gm-start" onClick={start}>Spiel beginnen</button>
            {(sec.wuerfel || sec.pythia || sec.glueck > 0) && <p className="gm-sub">Geheim aktiv: {[sec.wuerfel && 'Gezinkte Würfel', sec.glueck > 0 && 'Glückssträhne', sec.pythia && 'Pythia'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="gm-tiles">
          <button className="gm-tile" onClick={() => setView('learn')}><i>I</i><b>Lernen</b><span>{lessons} / {LESSONS.length} Lektionen</span></button>
          <button className="gm-tile" onClick={() => setView('openings')}><i>II</i><b>Eröffnungsbuch</b><span>{Object.keys(data.opening).length} / 21 Würfe gekonnt</span></button>
          <button className="gm-tile" onClick={() => setView('puzzles')}><i>III</i><b>Zug-Rätsel</b><span>{data.puzzlesSolved} gelöst</span></button>
          <button className="gm-tile" onClick={() => setView('daily')}><i>IV</i><b>Rätsel des Tages</b><span>{dailyDone('gammon', '') ? 'gelöst ✓' : 'offen'}</span></button>
          <button className="gm-tile" onClick={() => setView('archive')}><i>V</i><b>Archiv</b><span>{data.saved.length} Partien</span></button>
          <button className="gm-tile" onClick={() => setView('stats')}><i>VI</i><b>Statistik</b><span>{data.totals.games} Spiele · {data.totals.wins} Siege</span></button>
          <button className="gm-tile" onClick={() => setView('options')}><i>VII</i><b>Optionen</b><span>Brett, Steine, Coach</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      <header className="gm-top">
        <button onClick={view === 'menu' ? onExit : back}>← {view === 'menu' ? 'Halle' : 'Menü'}</button>
        <h1>Backgammon</h1>
        <span className="gm-top-sub">Tavla · Tric-Trac · Backgammon</span>
      </header>
      {body}
    </div>
  );
}

function Options({ S, setS, onBack, onReset }: { S: MSettings; setS: (p: Partial<MSettings>) => void; onBack: () => void; onReset: () => void }) {
  const [sure, setSure] = useState(false);
  const demo = useMemo(() => startPosition(), []);
  const flags: [keyof MSettings, string][] = [['pipLabels', 'Punktnummern zeigen'], ['mirror', 'Brett spiegeln (Heimfeld links)'], ['autoRoll', 'Automatisch würfeln'], ['confirmEnd', 'Zug mit „Fertig“ bestätigen'], ['coach', 'Coach: Züge bewerten'], ['sound', 'Geräusche']];
  return (
    <div className="gm-sub-view">
      <header className="gm-subhead"><button onClick={onBack}>← Menü</button><h2>Optionen</h2></header>
      <div className="gm-opts">
        <section>
          <h3>Brett</h3>
          <div className="gm-swatches">{BOARD_THEMES.map((b) => <button key={b.id} className={S.board === b.id ? 'on' : ''} onClick={() => setS({ board: b.id })}><span className={`gm gm-th-${b.id} gm-ck-${S.checkers} gm-mini`}><BoardView s={demo} viewer={0} selected={null} targets={[]} dice={[]} usedDice={[]} turn={0} cube={{ v: 1, owner: -1 }} pipLabels={false} mirror={false} onPoint={() => undefined} /></span><span>{b.name}</span></button>)}</div>
          <h3>Steine</h3>
          <div className="gm-swatches">{CHECKER_SETS.map((b) => <button key={b.id} className={S.checkers === b.id ? 'on' : ''} onClick={() => setS({ checkers: b.id })}><span className={`gm gm-th-${S.board} gm-ck-${b.id} gm-mini`}><BoardView s={demo} viewer={0} selected={null} targets={[]} dice={[]} usedDice={[]} turn={0} cube={{ v: 1, owner: -1 }} pipLabels={false} mirror={false} onPoint={() => undefined} /></span><span>{b.name}</span></button>)}</div>
        </section>
        <section>
          <h3>Bedienung</h3>
          {flags.map(([k, label]) => <label key={k} className="gm-check"><input type="checkbox" checked={S[k] as boolean} onChange={(e) => setS({ [k]: e.target.checked } as Partial<MSettings>)} /> {label}</label>)}
          <p className="gm-sub">Tasten: Leertaste würfeln/bestätigen, U zurück, H Tipp, D verdoppeln. Doppelklick auf einen Stein zieht ihn mit dem größten Würfel.</p>
          <h3>Daten</h3>
          {!sure ? <button className="danger" onClick={() => setSure(true)}>Backgammon-Daten löschen …</button> : <div className="gm-actions"><button className="danger" onClick={() => { onReset(); setSure(false); }}>Wirklich löschen</button><button onClick={() => setSure(false)}>Abbrechen</button></div>}
        </section>
      </div>
    </div>
  );
}
