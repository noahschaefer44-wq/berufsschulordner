import { useMemo, useState } from 'react';
import '@fontsource/share-tech-mono';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import { LEVELS_S, MISSIONS, SCHIFF_INIT, THEMES, type Mission, type SData, type SSaved, type SSettings, type SStat } from './data';
import { DEFAULT_RULES, FLEETS, type Rules, aiFleet } from './engine';
import SchiffPlay, { type GameInfo, type PlaySetup } from './SchiffPlay';
import { ReplayView, TacticView, TipsView } from './SchiffLearn';
import SeaGrid from './SeaGrid';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { newId } from '../shared/ids';
import { dailySeed, mulberry32 } from '../shared/rng';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './schiff.css';

type View = 'menu' | 'play' | 'missions' | 'tactic' | 'daily' | 'tips' | 'archive' | 'replay' | 'stats' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="ss-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);

const rulesOf = (S: SSettings): Rules => {
  const f = FLEETS[S.fleet] ?? FLEETS.klassisch;
  return { ...DEFAULT_RULES, n: f.n, lens: f.lens, spacing: S.spacing, salvo: S.salvo, fog: S.fog, radar: S.radar, chain: S.chain };
};

export default function SchiffRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('schiff');
  const [data, upd] = useGameData<SData>('schiff', SCHIFF_INIT);
  const S: SSettings = { ...SCHIFF_INIT.settings, ...data.settings };
  const setS = (p: Partial<SSettings>) => upd((d) => { d.settings = { ...SCHIFF_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(daily ? 'daily' : 'menu');
  const [setup, setSetup] = useState<PlaySetup | null>(null);
  const [round, setRound] = useState(0);
  const [replay, setReplay] = useState<SSaved | null>(null);
  const [sec, setSec] = useState({ sonar: false, torpedo: false, nebelhorn: false });
  const [dailyJagd, setDailyJagd] = useState(false);

  useSecrets('schiff', {
    'schiff-sonar': () => setSec((x) => ({ ...x, sonar: true })),
    'schiff-torpedo': () => setSec((x) => ({ ...x, torpedo: true })),
    'schiff-nebelhorn': () => setSec((x) => ({ ...x, nebelhorn: true })),
  });

  const begin = (p: PlaySetup) => { setSetup(p); setRound((r) => r + 1); setView('play'); };
  const startBattle = () => begin({ mode: S.mode, level: S.level, rules: rulesOf(S), fleetKey: S.fleet });
  const startMission = (m: Mission) => {
    const f = FLEETS[m.fleet];
    begin({ mode: 'ki', level: m.level, fleetKey: m.fleet, mission: m, rules: { ...DEFAULT_RULES, n: f.n, lens: f.lens, ...m.rules } });
  };
  const startDailyJagd = () => { setDailyJagd(true); begin({ mode: 'jagd', level: 0, fleetKey: 'klassisch', rules: { ...DEFAULT_RULES }, seed: dailySeed('schiff', 'jagd'), daily: true }); };

  const starsFor = (i: GameInfo): number => (!i.humanWon ? 0 : 1 + (i.lostShips <= 2 ? 1 : 0) + (i.accuracy >= 0.7 && !i.helped ? 1 : 0));

  const onFinish = (i: GameInfo): string | undefined => {
    const s = i.setup;
    const key = s.mode === 'jagd' ? `jagd-${s.fleetKey}` : `${s.mode === 'ki' ? `L${s.level}` : '2P'}-${s.fleetKey}`;
    const label = s.mode === 'jagd' ? `Jagd${s.daily ? ' (Tag)' : ''}` : s.mode === 'zwei' ? 'Zwei Spieler' : s.mission ? `Mission: ${s.mission.title}` : `KI ${LEVELS_S.find((l) => l.id === s.level)?.name}`;
    const rtxt = s.mode === 'jagd' ? `${i.shots} Schüsse` : s.mode === 'zwei' ? `Spieler ${i.winner + 1} gewinnt` : i.humanWon ? 'Sieg' : 'Niederlage';
    const saved: SSaved = { id: newId(), date: new Date().toLocaleDateString('de-DE'), mode: label, result: rtxt, rules: s.rules, fleets: i.fleets, log: i.log };
    let extra = '';
    upd((d) => {
      const st: SStat = d.stats[key] ?? { played: 0, won: 0, shots: 0, bestShots: 0, streak: 0, bestStreak: 0 };
      st.played++;
      if (s.mode === 'jagd') {
        st.shots += i.shots; st.won++;
        st.bestShots = st.bestShots ? Math.min(st.bestShots, i.shots) : i.shots;
        const jk = s.daily ? `tag-${new Date().toISOString().slice(0, 10)}` : `${s.fleetKey}-${s.rules.spacing ? 'a' : 'x'}-${s.rules.fog ? 'n' : 'x'}`;
        d.jagdBest = { ...d.jagdBest, [jk]: d.jagdBest[jk] ? Math.min(d.jagdBest[jk], i.shots) : i.shots };
      } else if (s.mode === 'ki') {
        st.shots += i.shots;
        if (i.humanWon) { st.won++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); st.bestShots = st.bestShots ? Math.min(st.bestShots, i.shots) : i.shots; } else st.streak = 0;
      }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + (i.humanWon && s.mode === 'ki' ? 1 : 0), shots: d.totals.shots + i.shots, hits: d.totals.hits + i.hits, sunk: d.totals.sunk + i.sunkEnemy };
      if (i.accuracy > 0) d.accuracy = { sum: d.accuracy.sum + i.accuracy * i.shots, shots: d.accuracy.shots + i.shots };
      d.saved = [saved, ...d.saved].slice(0, 15);
      if (s.mission && i.humanWon) {
        const st3 = starsFor(i);
        d.stars = { ...d.stars, [s.mission.id]: Math.max(d.stars[s.mission.id] ?? 0, st3) };
      }
    });
    achieve('schiff', 'first');
    if (s.mode === 'zwei') achieve('schiff', 'zwei');
    if (s.mode === 'jagd') {
      achieve('schiff', 'jagd');
      if (s.fleetKey === 'klassisch' && i.shots <= 50) achieve('schiff', 'jagd50');
      if (s.daily && !dailyDone('schiff', '')) { markDaily('schiff', ''); achieve('schiff', 'daily'); }
    }
    if (s.mode === 'ki' && i.humanWon && !i.helped) {
      achieve('schiff', 'win');
      if (s.level >= 4) achieve('schiff', 'lv4');
      if (s.level >= 5) achieve('schiff', 'lv5');
      if (i.lostShips === 0) achieve('schiff', 'flawless');
      if (i.shots <= 45 && s.fleetKey === 'klassisch') achieve('schiff', 'fast');
      if (s.rules.salvo) achieve('schiff', 'salvo');
      if (s.rules.fog) achieve('schiff', 'fog');
      if (s.rules.radar > 0 && i.log.some((l) => l.by === 0 && l.kind === 'radar')) achieve('schiff', 'radar');
    }
    if (s.mission && i.humanWon) {
      const stars = starsFor(i);
      extra = `Mission ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
      const all = { ...data.stars, [s.mission.id]: Math.max(data.stars[s.mission.id] ?? 0, stars) };
      if (MISSIONS.every((m) => (all[m.id] ?? 0) >= 1)) achieve('schiff', 'campaign');
      if (MISSIONS.every((m) => (all[m.id] ?? 0) >= 3)) achieve('schiff', 'stars');
    }
    return extra || undefined;
  };

  const back = () => setView('menu');
  const themeCls = `ss ss-th-${S.theme}`;
  const dailySeedNo = useMemo(() => dailySeed('schiff', 'taktik') % 100000, []);
  const demo = useMemo(() => {
    const n = 10;
    const fleet = aiFleet({ ...DEFAULT_RULES }, mulberry32(7));
    const shots = new Uint8Array(n * n);
    for (const s of fleet.slice(0, 2)) for (const c of s.cells.slice(0, 2)) shots[c] = 2;
    [3, 17, 44, 58, 62, 91, 25, 70].forEach((i) => { if (!fleet.some((s) => s.cells.includes(i))) shots[i] = 1; });
    return { n, fleet, shots };
  }, []);

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        <header className="ss-top"><button onClick={() => setView(setup.mission ? 'missions' : 'menu')}>← {setup.mission ? 'Kampagne' : 'Menü'}</button><h1>Seeschlacht</h1><span className="ss-top-sub">{setup.mission ? setup.mission.title : setup.mode === 'jagd' ? 'Jagd' : setup.mode === 'zwei' ? 'Zwei Spieler' : LEVELS_S.find((l) => l.id === setup.level)?.name}</span></header>
        <SchiffPlayWrap key={round} setup={setup} S={S} secrets={sec} layouts={data.layouts} onSaveLayout={(l) => { upd((d) => { d.layouts = [l, ...d.layouts].slice(0, 12); }); toast('Aufstellung gemerkt'); }} onFinish={onFinish} onExit={() => setView(setup.mission ? 'missions' : 'menu')} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'missions') {
    body = (
      <div className="ss-sub-view">
        <header className="ss-subhead"><button onClick={back}>← Menü</button><h2>Kampagne</h2><span>{Object.values(data.stars).reduce((a, b) => a + b, 0)} / {MISSIONS.length * 3} ★</span></header>
        <ol className="ss-missions">
          {MISSIONS.map((m, i) => {
            const locked = i > 0 && !(data.stars[MISSIONS[i - 1].id] > 0);
            const st = data.stars[m.id] ?? 0;
            return (
              <li key={m.id}><button className={locked ? 'locked' : ''} disabled={locked} onClick={() => startMission(m)}>
                <i>{i + 1}</i><b>{m.title}</b><span>{m.brief}</span><small>{LEVELS_S.find((l) => l.id === m.level)?.name} · {FLEETS[m.fleet].name}</small>
                <em>{locked ? '🔒' : '★'.repeat(st) + '☆'.repeat(3 - st)}</em>
              </button></li>
            );
          })}
        </ol>
        <p className="ss-sub">★ Sieg · ★★ höchstens 2 Schiffe verloren · ★★★ Zielgenauigkeit ab 70 % ohne Hilfen.</p>
      </div>
    );
  } else if (view === 'tactic' || view === 'daily') {
    const isDaily = view === 'daily';
    body = (
      <>
        {isDaily && <div className="ss-jagdbar"><button onClick={startDailyJagd}>Tagesjagd starten (jeder bekommt dieselbe Flotte)</button><span>{data.jagdBest[`tag-${new Date().toISOString().slice(0, 10)}`] ? `Dein Bestwert heute: ${data.jagdBest[`tag-${new Date().toISOString().slice(0, 10)}`]} Schüsse` : ''}</span></div>}
        <TacticView key={view} S={S} daily={isDaily} seedStart={isDaily ? dailySeedNo : Math.floor(Math.random() * 1e6)} solved={data.tactic.solved} streak={data.tactic.streak} best={data.tactic.best} onBack={back}
          onResult={(ok) => {
            upd((d) => { d.tactic = { solved: d.tactic.solved + (ok ? 1 : 0), streak: ok ? d.tactic.streak + 1 : 0, best: Math.max(d.tactic.best, ok ? d.tactic.streak + 1 : 0) }; });
            if (ok) {
              if (data.tactic.solved + 1 >= 10) achieve('schiff', 'tactic10');
              if (data.tactic.streak + 1 >= 5) achieve('schiff', 'tactic5s');
              if (isDaily && !dailyDone('schiff', 'taktik')) { markDaily('schiff', 'taktik'); achieve('schiff', 'daily'); }
            }
          }} />
      </>
    );
  } else if (view === 'tips') body = <TipsView onBack={back} />;
  else if (view === 'archive') {
    body = (
      <div className="ss-sub-view">
        <header className="ss-subhead"><button onClick={back}>← Menü</button><h2>Logbuch</h2><span>{data.saved.length} Gefechte</span></header>
        {data.saved.length === 0 && <p className="ss-sub">Noch nichts im Logbuch. Beendete Gefechte lassen sich hier Schuss für Schuss nachspielen.</p>}
        <ul className="ss-archive">
          {data.saved.map((g) => (
            <li key={g.id}><button onClick={() => { setReplay(g); setView('replay'); }}><b>{g.mode}</b><span>{g.result}</span><small>{g.date} · {g.log.length} Einträge · {g.rules.n}×{g.rules.n}</small></button><button className="x" aria-label="Löschen" onClick={() => upd((d) => { d.saved = d.saved.filter((x) => x.id !== g.id); })}>×</button></li>
          ))}
        </ul>
      </div>
    );
  } else if (view === 'replay' && replay) body = <ReplayView saved={replay} S={S} onBack={() => setView('archive')} />;
  else if (view === 'stats') {
    const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
    const nm = (k: string) => { const [who, f] = k.split('-'); return `${who === 'jagd' ? 'Jagd' : who.startsWith('L') ? LEVELS_S.find((l) => l.id === +who.slice(1))?.name : 'Zwei Spieler'} · ${FLEETS[f]?.name ?? f}`; };
    const acc = data.accuracy.shots ? Math.round((data.accuracy.sum / data.accuracy.shots) * 100) : 0;
    body = (
      <div className="ss-sub-view">
        <header className="ss-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="ss-statgrid">
          <div><b>{data.totals.games}</b><span>Gefechte</span></div><div><b>{data.totals.wins}</b><span>Siege gegen KI</span></div><div><b>{data.totals.shots}</b><span>Schüsse</span></div>
          <div><b>{data.totals.shots ? Math.round((data.totals.hits / data.totals.shots) * 100) : 0} %</b><span>Trefferquote</span></div><div><b>{data.totals.sunk}</b><span>Schiffe versenkt</span></div>
          <div><b>{data.accuracy.shots ? `${acc} %` : '–'}</b><span>Zielgenauigkeit</span></div><div><b>{data.tactic.solved}</b><span>Taktik gelöst</span></div>
        </div>
        <table className="ss-table"><thead><tr><th>Partieart</th><th>Gespielt</th><th>Siege</th><th>Beste Schusszahl</th><th>Serie</th></tr></thead>
          <tbody>{rows.length ? rows.map(([k, s]) => <tr key={k}><td>{nm(k)}</td><td>{s.played}</td><td>{s.won}</td><td>{s.bestShots || '–'}</td><td>{s.streak} (Rekord {s.bestStreak})</td></tr>) : <tr><td colSpan={5}>Noch keine Gefechte.</td></tr>}</tbody></table>
        {Object.keys(data.jagdBest).length > 0 && <p className="ss-sub">Jagd-Bestwerte: {Object.entries(data.jagdBest).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
      </div>
    );
  } else if (view === 'options') {
    body = <Options S={S} setS={setS} onBack={back} onReset={() => { upd((d) => { Object.assign(d, { ...SCHIFF_INIT, settings: d.settings }); }); toast('Seeschlacht-Daten zurückgesetzt'); }} demo={demo} />;
  } else {
    const lv = LEVELS_S.find((l) => l.id === S.level) ?? LEVELS_S[2];
    body = (
      <div className="ss-menu">
        <section className="ss-new">
          <div className="ss-demo"><SeaGrid n={demo.n} ships={[]} shots={demo.shots} coords={false} sweep={S.sweep} label="Vorschau" /></div>
          <div className="ss-setup">
            <h2>Neues Gefecht</h2>
            <label><span>Modus</span>{seg(S.mode, (v) => setS({ mode: v }), [{ v: 'ki', label: 'Gegen KI' }, { v: 'zwei', label: 'Zu zweit' }, { v: 'jagd', label: 'Jagd (allein)', title: 'Finde die versteckte Flotte mit möglichst wenigen Schüssen' }])}</label>
            {S.mode === 'ki' && <label><span>Gegner</span>{seg(S.level, (v) => setS({ level: v }), LEVELS_S.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name} – {lv.info}</small></label>}
            <label><span>Flotte</span>{seg(S.fleet, (v) => setS({ fleet: v }), Object.entries(FLEETS).map(([k, f]) => ({ v: k, label: f.name.split(' ')[0] })))}<small>{FLEETS[S.fleet].name} · Feld {FLEETS[S.fleet].n}×{FLEETS[S.fleet].n}</small></label>
            <div className="ss-row2">
              <label><span>Abstandsregel</span>{seg(S.spacing, (v) => setS({ spacing: v }), [{ v: false, label: 'Aus' }, { v: true, label: 'An' }])}</label>
              {S.mode !== 'jagd' && <label><span>Salven</span>{seg(S.salvo, (v) => setS({ salvo: v }), [{ v: false, label: 'Aus' }, { v: true, label: 'An' }])}</label>}
              <label><span>Nebel</span>{seg(S.fog, (v) => setS({ fog: v }), [{ v: false, label: 'Aus' }, { v: true, label: 'An' }])}</label>
              {S.mode !== 'jagd' && <label><span>Treffer = nochmal</span>{seg(S.chain, (v) => setS({ chain: v }), [{ v: false, label: 'Aus' }, { v: true, label: 'An' }])}</label>}
            </div>
            {S.mode !== 'jagd' && <label><span>Radar-Aufklärungen</span>{seg(S.radar, (v) => setS({ radar: v }), [0, 2, 3, 5].map((v) => ({ v, label: v ? String(v) : 'Keine' })))}</label>}
            <button className="ss-start" onClick={startBattle}>Gefecht beginnen</button>
            {(sec.sonar || sec.torpedo || sec.nebelhorn) && <p className="ss-sub">Geheim aktiv: {[sec.sonar && 'Sonar', sec.torpedo && 'Torpedo', sec.nebelhorn && 'Nebelhorn'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="ss-tiles">
          <button className="ss-tile" onClick={() => setView('missions')}><i>01</i><b>Kampagne</b><span>{Object.values(data.stars).reduce((a, b) => a + b, 0)} / 24 ★</span></button>
          <button className="ss-tile" onClick={() => setView('tactic')}><i>02</i><b>Taktik</b><span>{data.tactic.solved} Aufgaben gelöst</span></button>
          <button className="ss-tile" onClick={() => setView('daily')}><i>03</i><b>Tagesaufgabe</b><span>{dailyDone('schiff', 'taktik') ? 'gelöst ✓' : 'offen'} · Tagesjagd</span></button>
          <button className="ss-tile" onClick={() => setView('tips')}><i>04</i><b>Handbuch</b><span>Sechs Kapitel Strategie</span></button>
          <button className="ss-tile" onClick={() => setView('archive')}><i>05</i><b>Logbuch</b><span>{data.saved.length} Gefechte</span></button>
          <button className="ss-tile" onClick={() => setView('stats')}><i>06</i><b>Statistik</b><span>{data.totals.games} Gefechte · {data.totals.wins} Siege</span></button>
          <button className="ss-tile" onClick={() => setView('options')}><i>07</i><b>Optionen</b><span>Anzeige und Hilfen</span></button>
        </section>
      </div>
    );
  }

  void dailyJagd;
  return (
    <div className={themeCls}>
      <header className="ss-top">
        <button onClick={view === 'menu' ? onExit : back}>← {view === 'menu' ? 'Halle' : 'Menü'}</button>
        <h1>Seeschlacht</h1>
        <span className="ss-top-sub">Flottenkommando</span>
      </header>
      {body}
    </div>
  );
}

/** Spielansicht; Rückgabewert von onFinish (z. B. Sterne) wird im Abschlussfenster angezeigt. */
function SchiffPlayWrap(props: Omit<React.ComponentProps<typeof SchiffPlay>, 'onFinish'> & { onFinish: (i: GameInfo) => string | undefined }) {
  const [extra, setExtra] = useState('');
  return (
    <>
      <SchiffPlay {...props} onFinish={(i) => { const r = props.onFinish(i); if (r) setExtra(r); }} />
      {extra && <div className="ss-extra" role="status">{extra}</div>}
    </>
  );
}

function Options({ S, setS, onBack, onReset, demo }: { S: SSettings; setS: (p: Partial<SSettings>) => void; onBack: () => void; onReset: () => void; demo: { n: number; shots: Uint8Array } }) {
  const [sure, setSure] = useState(false);
  const flags: [keyof SSettings, string][] = [['coords', 'Koordinaten am Rand'], ['sweep', 'Radar-Animation'], ['confirm', 'Schüsse erst mit „Feuer!“ auslösen'], ['sound', 'Geräusche']];
  return (
    <div className="ss-sub-view">
      <header className="ss-subhead"><button onClick={onBack}>← Menü</button><h2>Optionen</h2></header>
      <div className="ss-opts">
        <section>
          <h3>Anzeige</h3>
          <div className="ss-swatches">{THEMES.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`ss ss-th-${t.id} ss-mini`}><SeaGrid n={demo.n} ships={[]} shots={demo.shots} coords={false} sweep={false} label={t.name} /></span><span>{t.name}</span></button>)}</div>
        </section>
        <section>
          <h3>Bedienung</h3>
          {flags.map(([k, label]) => <label key={k} className="ss-check"><input type="checkbox" checked={S[k] as boolean} onChange={(e) => setS({ [k]: e.target.checked } as Partial<SSettings>)} /> {label}</label>)}
          <p className="ss-sub">Tasten: Enter feuert die gewählten Felder, R schaltet das Radar um, Esc bricht ab. Rechtsklick dreht ein Schiff beim Aufstellen.</p>
          <h3>Daten</h3>
          {!sure ? <button className="danger" onClick={() => setSure(true)}>Seeschlacht-Daten löschen …</button> : <div className="ss-actions"><button className="danger" onClick={() => { onReset(); setSure(false); }}>Wirklich löschen</button><button onClick={() => setSure(false)}>Abbrechen</button></div>}
        </section>
      </div>
    </div>
  );
}
