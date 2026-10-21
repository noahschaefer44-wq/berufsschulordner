import { useEffect, useMemo, useState } from 'react';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import { CODE_INIT, LEVELS_C, THEMES_C, type CData, type CSettings, type CStat } from './data';
import { type Cfg, PRESETS, allCodes, consistent, feedback, randomCode, spaceSize, type Code, type Turn } from './engine';
import CodePlay, { type FinishInfo, type PlaySetup } from './CodePlay';
import { Fbk, Peg } from './Pegs';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { dailySeed, freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './code.css';

type View = 'menu' | 'play' | 'learn' | 'stats' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="cd-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);

const LESSONS: { id: string; title: string; text: string }[] = [
  { id: 'regeln', title: 'Die Regeln', text: 'Ein Spieler denkt sich einen geheimen Code aus Farben (oder Ziffern) aus, der andere muss ihn erraten. Nach jedem Versuch gibt es eine Auswertung: Ein schwarzer Stift bedeutet „Farbe und Platz stimmen“, ein weißer „die Farbe kommt vor, sitzt aber an einer anderen Stelle“. Die Stifte sagen nie, welcher deiner Stifte gemeint ist.' },
  { id: 'auswertung', title: 'Auswerten ohne Fehler', text: 'Zuerst werden die Schwarzen gezählt. Aus den übrigen Stiften zählst du die Weißen: für jede Farbe das Minimum aus „wie oft im Code“ und „wie oft im Versuch“ (ohne die schon als schwarz gezählten). Beispiel: Code ROT ROT BLAU GELB, Versuch ROT BLAU ROT ROT → 1 schwarz, 2 weiß, denn ein drittes Rot findet keinen Partner.' },
  { id: 'ersterzug', title: 'Der erste Versuch', text: 'Bei vier Stiften und sechs Farben lohnt sich ein Versuch wie AABB (zwei Farben doppelt): Er teilt die 1296 Möglichkeiten in möglichst gleichmäßige Gruppen. Ein Versuch mit vier verschiedenen Farben ist schwächer, einer mit nur einer Farbe sogar schlecht – er verrät fast nur, wie oft diese Farbe vorkommt.' },
  { id: 'eliminieren', title: 'Möglichkeiten streichen', text: 'Nach jeder Auswertung bleiben nur Codes übrig, die zu allen bisherigen Versuchen passen. Spiele am besten selbst nur Codes, die noch möglich sind – dann kannst du jederzeit zufällig richtig liegen. Der Trick der Profis: manchmal ist ein „unmöglicher“ Versuch klüger, weil er mehr Möglichkeiten trennt.' },
  { id: 'info', title: 'Informationsgewinn', text: 'Ein Versuch ist gut, wenn die möglichen Auswertungen ähnlich wahrscheinlich sind. Die Zugqualität im Spiel misst genau das: den Informationsgewinn (Entropie) deines Versuchs im Vergleich zum besten möglichen. 100 % heißt: Besser ging es nicht.' },
  { id: 'knuth', title: 'Das Knuth-Verfahren', text: 'Donald Knuth zeigte 1977, dass sich jeder klassische Code (4 Stifte, 6 Farben) in höchstens fünf Versuchen finden lässt: Wähle immer den Versuch, bei dem die größte übrig bleibende Gruppe möglichst klein ist („Minimax“). Die KI-Stufe „Optimal“ nutzt diese Idee.' },
];

/** Übung: Welche Codes passen zu den bisherigen Versuchen? */
function Eliminator({ S, onDone }: { S: CSettings; onDone: () => void }) {
  const cfg: Cfg = PRESETS.mini.cfg;
  const [seed, setSeed] = useState(() => freshSeed());
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [res, setRes] = useState<null | boolean>(null);
  const q = useMemo(() => {
    const rnd = mulberry32(seed);
    const secret = randomCode(cfg, rnd);
    const hist: Turn[] = [0, 1].map(() => { const g = randomCode(cfg, rnd); return { guess: g, fb: feedback(secret, g, cfg) }; });
    const all = allCodes(cfg);
    const good = all.filter((c) => consistent(c, hist, cfg));
    const bad = all.filter((c) => !consistent(c, hist, cfg));
    const pool: Code[] = [];
    const take = Math.min(good.length, 3);
    for (let i = 0; i < take; i++) pool.push(good.splice(Math.floor(rnd() * good.length), 1)[0]);
    while (pool.length < 6) pool.push(bad.splice(Math.floor(rnd() * bad.length), 1)[0]);
    pool.sort(() => rnd() - 0.5);
    return { hist, pool };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const truth = q.pool.map((c) => consistent(c, q.hist, cfg));
  return (
    <div className="cd-eli">
      <h3>Übung: Wer passt?</h3>
      <p>Zwei Versuche mit Auswertung sind gegeben. Markiere alle Codes, die zu <b>beiden</b> passen (Mini-Spiel: 3 Stifte, 5 Farben).</p>
      <div className="cd-hist">{q.hist.map((t, i) => <div key={i} className="cd-row done"><span className="cd-n">{i + 1}</span><span className="cd-pegs">{t.guess.map((c, k) => <Peg key={k} color={c} size={34} symbols={S.symbols} />)}</span><Fbk fb={t.fb} cfg={cfg} /></div>)}</div>
      <div className="cd-cands">{q.pool.map((c, i) => (
        <button key={i} className={`cd-cand${chosen.has(i) ? ' on' : ''}${res !== null ? (truth[i] ? ' yes' : ' no') : ''}`} onClick={() => { if (res !== null) return; setChosen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }}>
          {c.map((x, k) => <Peg key={k} color={x} size={30} symbols={S.symbols} />)}
        </button>
      ))}</div>
      <div className="cd-actions">
        {res === null && <button className="primary" onClick={() => { const ok = truth.every((t, i) => t === chosen.has(i)); setRes(ok); sfx(ok ? 'good' : 'bad'); if (ok) onDone(); }}>Prüfen</button>}
        {res !== null && <><span className={`cd-msg ${res ? 'ok' : 'bad'}`}>{res ? 'Richtig!' : 'Nicht ganz – grün umrandete Codes passen zu beiden Versuchen.'}</span><button className="primary" onClick={() => { setSeed(freshSeed()); setChosen(new Set()); setRes(null); }}>Nächste Übung</button></>}
      </div>
    </div>
  );
}

export default function CodeRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('code');
  const [data, upd] = useGameData<CData>('code', CODE_INIT);
  const S: CSettings = { ...CODE_INIT.settings, ...data.settings };
  const setS = (p: Partial<CSettings>) => upd((d) => { d.settings = { ...CODE_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>('menu');
  const [setup, setSetup] = useState<PlaySetup | null>(null);
  const [round, setRound] = useState(0);
  const [lesson, setLesson] = useState(0);
  const [sec, setSec] = useState({ enigma: false, turing: false, bletchley: false });
  const [started, setStarted] = useState(false);

  useSecrets('code', {
    'code-enigma': () => setSec((x) => ({ ...x, enigma: true })),
    'code-turing': () => setSec((x) => ({ ...x, turing: true })),
    'code-bletchley': () => setSec((x) => ({ ...x, bletchley: true })),
  });

  const cfgNow: Cfg = S.useCustom ? S.custom : PRESETS[S.preset]?.cfg ?? PRESETS.klassisch.cfg;
  const presetKey = S.useCustom ? 'eigen' : S.preset;
  const begin = (p: PlaySetup) => { setSetup(p); setRound((r) => r + 1); setView('play'); };
  const start = () => begin({ mode: S.mode, cfg: cfgNow, presetKey, level: S.level });
  const startDaily = () => begin({ mode: 'knacken', cfg: PRESETS.klassisch.cfg, presetKey: 'klassisch', level: 3, seed: dailySeed('code', 'tag'), daily: true });

  useEffect(() => { if (daily && !started) { setStarted(true); startDaily(); } }, [daily]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFinish = (i: FinishInfo) => {
    const s = i.setup;
    const key = `${s.mode}-${s.presetKey}`;
    upd((d) => {
      const st: CStat = d.stats[key] ?? { played: 0, won: 0, guesses: 0, best: 0, dist: new Array(16).fill(0) };
      st.played++;
      if (s.mode !== 'raetsel' && s.mode !== 'duell') {
        if (i.won && s.mode === 'knacken') { st.won++; st.guesses += i.guesses; st.best = st.best ? Math.min(st.best, i.guesses) : i.guesses; st.dist = st.dist.slice(); st.dist[Math.min(15, i.guesses)]++; }
        else if (s.mode === 'verstecken' && i.won) st.won++;
      }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + (i.won ? 1 : 0) };
      if (s.mode === 'knacken' && i.rating > 0) d.ratings = { sum: d.ratings.sum + i.rating, n: d.ratings.n + 1 };
      if (i.refereeRight || i.refereeWrong) d.referee = { right: d.referee.right + i.refereeRight, wrong: d.referee.wrong + i.refereeWrong };
      if (s.mode === 'duell' && i.duel) d.duel = { played: d.duel.played + 1, won: d.duel.won + (i.duel.won ? 1 : 0) };
      if (i.puzzle) { d.puzzles = { solved: d.puzzles.solved + (i.won ? 1 : 0), streak: i.won ? d.puzzles.streak + 1 : 0, best: Math.max(d.puzzles.best, i.won ? d.puzzles.streak + 1 : 0) }; }
    });
    if (s.mode === 'knacken' && i.won && !i.helped) {
      achieve('code', 'first');
      if (s.presetKey === 'klassisch' && i.guesses <= 4) achieve('code', 'fast4');
      if (s.presetKey === 'klassisch' && i.guesses <= 3) achieve('code', 'fast3');
      if (s.presetKey === 'super') achieve('code', 'super');
      if (s.presetKey === 'mega') achieve('code', 'mega');
      if (s.presetKey === 'bullen') achieve('code', 'bullen');
      if (s.presetKey === 'schwarz') achieve('code', 'schwarz');
      if (i.rating >= 0.9 && i.guesses >= 3) achieve('code', 'perfect');
      if (data.totals.wins + 1 >= 10) achieve('code', 'ten');
      if (s.daily && !dailyDone('code', '')) { markDaily('code', ''); achieve('code', 'daily'); toast('Tagescode geknackt'); }
    }
    if (s.mode === 'verstecken' && i.won && s.level >= 4 && i.guesses >= 6) achieve('code', 'hide');
    if (i.refereeRight && data.referee.right + i.refereeRight >= 20) achieve('code', 'referee');
    if (s.mode === 'duell' && i.duel?.won) achieve('code', 'duel');
    if (i.puzzle && i.won) {
      if (data.puzzles.solved + 1 >= 10) achieve('code', 'puzzle10');
      if (data.puzzles.streak + 1 >= 5) achieve('code', 'puzzle5s');
    }
  };

  const back = () => setView('menu');
  const themeCls = `cd cd-th-${S.theme}`;

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        <header className="cd-top"><button onClick={() => setView('menu')}>← Menü</button><h1>Code-Knacker</h1><span className="cd-top-sub">{PRESETS[setup.presetKey]?.name ?? 'Eigene Regeln'}</span></header>
        <CodePlay key={round} setup={setup} S={S} secrets={sec} onFinish={onFinish} onExit={() => setView('menu')} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    const l = LESSONS[lesson];
    body = (
      <div className="cd-sub-view">
        <header className="cd-subhead"><button onClick={back}>← Menü</button><h2>Lernen</h2><span>{Object.values(data.lessons).filter(Boolean).length} / {LESSONS.length}</span></header>
        <div className="cd-lessonlist">{LESSONS.map((x, i) => <button key={x.id} className={`${i === lesson ? 'on' : ''}${data.lessons[x.id] ? ' done' : ''}`} onClick={() => setLesson(i)}>{i + 1}. {x.title}</button>)}</div>
        <article className="cd-lesson"><h3>{l.title}</h3><p>{l.text}</p>
          <div className="cd-actions"><button disabled={lesson === 0} onClick={() => setLesson(lesson - 1)}>← Zurück</button><button className="primary" onClick={() => { upd((d) => { d.lessons = { ...d.lessons, [l.id]: true }; }); if (Object.keys(data.lessons).length + (data.lessons[l.id] ? 0 : 1) >= LESSONS.length) achieve('code', 'lessons'); if (lesson + 1 < LESSONS.length) setLesson(lesson + 1); }}>{lesson + 1 < LESSONS.length ? 'Gelesen – weiter' : 'Abschließen'}</button></div>
        </article>
        <Eliminator S={S} onDone={() => undefined} />
      </div>
    );
  } else if (view === 'stats') {
    const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
    const nm = (k: string) => { const [m, p] = k.split('-'); return `${({ knacken: 'Knacken', verstecken: 'Verstecken', duell: 'Duell', raetsel: 'Rätsel' } as Record<string, string>)[m]} · ${PRESETS[p]?.name ?? 'Eigene Regeln'}`; };
    body = (
      <div className="cd-sub-view">
        <header className="cd-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="cd-statgrid">
          <div><b>{data.totals.games}</b><span>Spiele</span></div><div><b>{data.totals.wins}</b><span>Siege</span></div><div><b>{data.puzzles.solved}</b><span>Rätsel gelöst</span></div>
          <div><b>{data.ratings.n ? `${Math.round((data.ratings.sum / data.ratings.n) * 100)} %` : '–'}</b><span>Ø Zugqualität</span></div>
          <div><b>{data.duel.won}/{data.duel.played}</b><span>Duelle gewonnen</span></div><div><b>{data.referee.right}/{data.referee.right + data.referee.wrong}</b><span>Richtig bewertet</span></div>
        </div>
        <table className="cd-table"><thead><tr><th>Art</th><th>Gespielt</th><th>Siege</th><th>Ø Versuche</th><th>Beste</th><th>Verteilung</th></tr></thead>
          <tbody>{rows.length ? rows.map(([k, s]) => (
            <tr key={k}><td>{nm(k)}</td><td>{s.played}</td><td>{s.won}</td><td>{s.won && k.startsWith('knacken') ? (s.guesses / s.won).toFixed(1) : '–'}</td><td>{s.best || '–'}</td>
              <td className="cd-dist">{s.dist.slice(1, 13).map((n, i) => <i key={i} title={`${i + 1} Versuche: ${n}`} style={{ height: `${Math.min(26, 3 + n * 4)}px` }} />)}</td></tr>
          )) : <tr><td colSpan={6}>Noch keine Spiele.</td></tr>}</tbody></table>
      </div>
    );
  } else if (view === 'options') {
    body = <Options S={S} setS={setS} onBack={back} onReset={() => { upd((d) => { Object.assign(d, { ...CODE_INIT, settings: d.settings }); }); toast('Code-Knacker-Daten zurückgesetzt'); }} />;
  } else {
    const lv = LEVELS_C.find((l) => l.id === S.level) ?? LEVELS_C[2];
    const c = S.custom;
    body = (
      <div className="cd-menu">
        <section className="cd-new">
          <div className="cd-hero" aria-hidden>
            <div className="cd-hero-row">{[0, 3, 1, 4].map((c2, i) => <Peg key={i} color={c2} size={46} symbols />)}<Fbk fb={[2, 1]} cfg={{ pegs: 4, colors: 6, dup: true, rows: 10 }} /></div>
            <div className="cd-hero-row">{[2, 2, 5, 0].map((c2, i) => <Peg key={i} color={c2} size={46} symbols />)}<Fbk fb={[1, 2]} cfg={{ pegs: 4, colors: 6, dup: true, rows: 10 }} /></div>
            <div className="cd-hero-row">{[null, null, null, null].map((c2, i) => <Peg key={i} color={c2} size={46} symbols />)}<Fbk fb={null} cfg={{ pegs: 4, colors: 6, dup: true, rows: 10 }} /></div>
          </div>
          <div className="cd-setup">
            <h2>Neues Spiel</h2>
            <label><span>Modus</span>{seg(S.mode, (v) => setS({ mode: v }), [{ v: 'knacken', label: 'Knacken', title: 'Du errätst den Code der KI' }, { v: 'verstecken', label: 'Verstecken', title: 'Die KI errät deinen Code' }, { v: 'duell', label: 'Duell', title: 'Wer braucht weniger Versuche?' }, { v: 'raetsel', label: 'Rätsel', title: 'Finde den einzigen passenden Code' }])}</label>
            <label><span>Regeln</span>{seg(S.useCustom ? 'eigen' : S.preset, (v) => (v === 'eigen' ? setS({ useCustom: true }) : setS({ useCustom: false, preset: v })), [...Object.entries(PRESETS).map(([k, p]) => ({ v: k, label: p.name, title: p.info })), { v: 'eigen', label: 'Eigene' }])}<small>{S.useCustom ? 'Eigene Regeln – siehe unten.' : PRESETS[S.preset].info}</small></label>
            {S.useCustom && (
              <div className="cd-row2">
                <label><span>Stifte</span>{seg(c.pegs, (v) => setS({ custom: { ...c, pegs: v, dup: c.dup || c.colors < v } }), [3, 4, 5, 6].map((v) => ({ v, label: String(v) })))}</label>
                <label><span>Farben</span>{seg(c.colors, (v) => setS({ custom: { ...c, colors: v, dup: c.dup || v < c.pegs } }), [4, 5, 6, 7, 8, 9, 10].map((v) => ({ v, label: String(v) })))}</label>
                <label><span>Doppelte</span>{seg(c.dup, (v) => setS({ custom: { ...c, dup: v || c.colors < c.pegs } }), [{ v: true, label: 'Erlaubt' }, { v: false, label: 'Nein' }])}</label>
                <label><span>Versuche</span>{seg(c.rows, (v) => setS({ custom: { ...c, rows: v } }), [6, 8, 10, 12, 14].map((v) => ({ v, label: String(v) })))}</label>
              </div>
            )}
            <p className="cd-sub">{spaceSize(cfgNow).toLocaleString('de-DE')} mögliche Codes.</p>
            {(S.mode === 'verstecken' || S.mode === 'duell') && <label><span>KI-Löser</span>{seg(S.level, (v) => setS({ level: v }), LEVELS_C.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name} – {lv.info}</small></label>}
            <button className="cd-start" onClick={start}>Los geht’s</button>
            {(sec.enigma || sec.turing || sec.bletchley) && <p className="cd-sub">Geheim aktiv: {[sec.enigma && 'Enigma', sec.turing && 'Turing', sec.bletchley && 'Bletchley Park'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="cd-tiles">
          <button className="cd-tile" onClick={startDaily}><i>1</i><b>Tagescode</b><span>{dailyDone('code', '') ? 'geknackt ✓' : 'für alle derselbe'}</span></button>
          <button className="cd-tile" onClick={() => setView('learn')}><i>2</i><b>Lernen</b><span>{Object.values(data.lessons).filter(Boolean).length} / {LESSONS.length} Lektionen</span></button>
          <button className="cd-tile" onClick={() => setView('stats')}><i>3</i><b>Statistik</b><span>{data.totals.games} Spiele · {data.totals.wins} Siege</span></button>
          <button className="cd-tile" onClick={() => setView('options')}><i>4</i><b>Optionen</b><span>Design, Hilfen, Schiedsrichter</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      <header className="cd-top">
        <button onClick={view === 'menu' ? onExit : back}>← {view === 'menu' ? 'Halle' : 'Menü'}</button>
        <h1>Code-Knacker</h1>
        <span className="cd-top-sub">Mastermind · Bullen &amp; Kühe</span>
      </header>
      {body}
    </div>
  );
}

function Options({ S, setS, onBack, onReset }: { S: CSettings; setS: (p: Partial<CSettings>) => void; onBack: () => void; onReset: () => void }) {
  const [sure, setSure] = useState(false);
  const flags: [keyof CSettings, string][] = [['symbols', 'Symbole auf den Stiften (für Farbenblindheit)'], ['showLeft', 'Zahl der noch möglichen Codes zeigen (Hilfe)'], ['manual', 'Beim Verstecken selbst bewerten (Schiedsrichter-Training)'], ['sound', 'Geräusche']];
  return (
    <div className="cd-sub-view">
      <header className="cd-subhead"><button onClick={onBack}>← Menü</button><h2>Optionen</h2></header>
      <div className="cd-opts">
        <section>
          <h3>Design</h3>
          <div className="cd-swatches">{THEMES_C.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`cd cd-th-${t.id} cd-sw`}><Peg color={0} size={22} symbols={false} /><Peg color={3} size={22} symbols={false} /><Peg color={1} size={22} symbols={false} /></span><span>{t.name}</span></button>)}</div>
        </section>
        <section>
          <h3>Bedienung und Hilfen</h3>
          {flags.map(([k, label]) => <label key={k} className="cd-check"><input type="checkbox" checked={S[k] as boolean} onChange={(e) => setS({ [k]: e.target.checked } as Partial<CSettings>)} /> {label}</label>)}
          <h3>Daten</h3>
          {!sure ? <button className="danger" onClick={() => setSure(true)}>Code-Knacker-Daten löschen …</button> : <div className="cd-actions"><button className="danger" onClick={() => { onReset(); setSure(false); }}>Wirklich löschen</button><button onClick={() => setSure(false)}>Abbrechen</button></div>}
        </section>
      </div>
    </div>
  );
}
