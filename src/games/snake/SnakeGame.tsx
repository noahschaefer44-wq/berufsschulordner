import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import { GRIDS, MODES, SKINS, SNAKE_INIT, SPEED_MS, type CustomLevel, type ModeS, type SavedReplay, type SnData, type SnSettings, type SnStat } from './data';
import { DEFAULT_RULES, type Rules } from './engine';
import { LEVELS, decodeLevel, encodeLevel, levelRules, reachable, type Level } from './levels';
import SnakePlay, { type FinishInfoN, type PlaySetupN } from './SnakePlay';
import SnakeCanvas from './SnakeCanvas';
import { newGame } from './engine';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { newId } from '../shared/ids';
import { dailySeed, freshSeed } from '../shared/rng';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './snake.css';

type View = 'menu' | 'play' | 'replay' | 'campaign' | 'editor' | 'custom' | 'replays' | 'stats' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="sn-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);

export default function SnakeRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('snake');
  const [data, upd] = useGameData<SnData>('snake', SNAKE_INIT);
  const S: SnSettings = { ...SNAKE_INIT.settings, ...data.settings };
  const setS = (p: Partial<SnSettings>) => upd((d) => { d.settings = { ...SNAKE_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>('menu');
  const [setup, setSetup] = useState<PlaySetupN | null>(null);
  const [round, setRound] = useState(0);
  const [replay, setReplay] = useState<SavedReplay | null>(null);
  const [boost, setBoost] = useState<{ geist?: boolean; len?: number }>({});
  const [nokia, setNokia] = useState(false);
  const [editLevel, setEditLevel] = useState<{ w: number; h: number; wrap: boolean; obstacles: number[]; name: string } | null>(null);
  const started = useRef(false);

  useSecrets('snake', {
    'snake-python': () => { setBoost((b) => ({ ...b, geist: true })); toast('Python: nächstes Spiel mit Geist-Start'); },
    'snake-anaconda': () => { setBoost((b) => ({ ...b, len: 12 })); toast('Anaconda: nächstes Spiel mit Länge 12'); },
    'snake-nokia': () => { setNokia(true); setS({ skin: 'lcd' }); toast('Nokia-Modus: Handy-Look aktiv'); },
  });

  const demo = useDemo(S.skin);
  const [gw, gh] = GRIDS[S.grid];
  const base = SPEED_MS[S.speed];
  const rulesFor = (mode: ModeS): Rules => {
    const r: Rules = { ...DEFAULT_RULES, w: gw, h: gh, extras: S.extras, seed: freshSeed() };
    if (mode === 'torus') r.wrap = true;
    if (mode === 'zen') { r.wrap = true; r.zen = true; }
    if (mode === 'ueberleben') r.closing = true;
    if (mode === 'zwei') { r.snakes = 2; r.wrap = true; }
    if (mode === 'duell') { r.snakes = 2; }
    return r;
  };

  const begin = (p: PlaySetupN) => { setSetup(p); setRound((r) => r + 1); setView('play'); };
  const takeBoost = () => { const b = boost; setBoost({}); return Object.keys(b).length ? b : undefined; };

  const startMode = (mode: ModeS) => {
    if (mode === 'kampagne') { setView('campaign'); return; }
    if (mode === 'eigen') { setView('custom'); return; }
    const info = MODES.find((m) => m.id === mode)!;
    begin({ mode, rules: rulesFor(mode), label: info.name, statKey: mode, baseMs: base, aiLevel: S.ai, timeLimitMs: mode === 'zeit' ? 90000 : undefined, boost: takeBoost() });
  };
  const startLevel = (l: Level) => begin({ mode: 'kampagne', rules: levelRules(l, freshSeed(), S.extras), label: l.name, statKey: `kampagne`, baseMs: base, goal: l.goal, levelId: l.id, parTicks: l.goal * 16, boost: takeBoost() });
  const startCustom = (c: { w: number; h: number; wrap: boolean; obstacles: number[] }, name: string) => begin({ mode: 'eigen', rules: { ...DEFAULT_RULES, w: c.w, h: c.h, wrap: c.wrap, obstacles: c.obstacles, extras: S.extras, seed: freshSeed() }, label: name, statKey: 'eigen', baseMs: base, boost: takeBoost() });
  const startDaily = () => {
    const seed = dailySeed('snake', 'tag');
    const l = LEVELS[seed % LEVELS.length];
    begin({ mode: 'klassisch', rules: { ...levelRules(l, seed, true), obstacles: l.obstacles }, label: `Tagesrunde: ${l.name}`, statKey: 'tag', baseMs: SPEED_MS[3], daily: true });
  };

  useEffect(() => { if (daily && !started.current) { started.current = true; startDaily(); } }, [daily]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFinish = (i: FinishInfoN) => {
    const s = i.setup;
    const clean = !i.boosted;
    const key = s.statKey;
    const prevBest = data.stats[key]?.best ?? 0;
    upd((d) => {
      const st: SnStat = d.stats[key] ?? { played: 0, best: 0, apples: 0, longest: 0, time: 0 };
      st.played++; st.apples += i.eaten; st.longest = Math.max(st.longest, i.length); st.time += Math.round(i.ms / 1000);
      if (clean) st.best = Math.max(st.best, i.score);
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, apples: d.totals.apples + i.eaten, gold: d.totals.gold + i.gold, ticks: d.totals.ticks + i.ticks };
      if (s.daily) { const k = new Date().toISOString().slice(0, 10); d.dailyBest = { ...d.dailyBest, [k]: Math.max(d.dailyBest[k] ?? 0, i.score) }; }
      if (s.levelId && i.won) {
        const stars = 1 + (s.parTicks && i.ticks <= s.parTicks ? 1 : 0) + (i.score >= (s.goal ?? 0) * 13 && s.parTicks && i.ticks <= s.parTicks * 1.4 ? 1 : 0);
        d.stars = { ...d.stars, [s.levelId]: Math.max(d.stars[s.levelId] ?? 0, stars) };
      }
      const worth = clean && (i.score > prevBest || (s.levelId && i.won));
      if (worth && i.score >= 40) {
        const rep: SavedReplay = { id: newId(), date: new Date().toLocaleDateString('de-DE'), mode: s.label, score: i.score, data: i.replay };
        d.replays = [rep, ...d.replays.filter((r) => r.mode !== s.label || r.score > i.score)].slice(0, 8);
      }
    });
    if (!clean) return;
    if (i.eaten >= 1) achieve('snake', 'first');
    if (i.score >= 100) achieve('snake', 'score100');
    if (i.score >= 500) achieve('snake', 'score500');
    if (i.length >= 20) achieve('snake', 'long20');
    if (i.length >= 50) achieve('snake', 'long50');
    if (i.gold >= 5) achieve('snake', 'gold');
    if (i.ghostWall) achieve('snake', 'ghost');
    if (s.mode === 'torus' && i.score >= 200) achieve('snake', 'torus');
    if (s.mode === 'zen' && data.stats.zen && data.stats.zen.time + i.ms / 1000 >= 600) achieve('snake', 'zen');
    if (s.mode === 'ueberleben' && i.score >= 300) achieve('snake', 'survive');
    if (s.mode === 'zeit' && i.score >= 300) achieve('snake', 'time');
    if (s.mode === 'duell' && i.won) achieve('snake', 'duell');
    if (s.mode === 'zwei') achieve('snake', 'zwei');
    if (s.mode === 'eigen') achieve('snake', 'editor');
    if (s.daily && !dailyDone('snake', '')) { markDaily('snake', ''); achieve('snake', 'daily'); }
    if (s.levelId && i.won) {
      const have = Object.keys({ ...data.stars, [s.levelId]: 1 }).filter((k) => (k === s.levelId ? 1 : data.stars[k]) > 0).length;
      if (have >= 6) achieve('snake', 'camp6');
      if (have >= LEVELS.length) achieve('snake', 'camp12');
      const all3 = LEVELS.every((l) => (l.id === s.levelId ? 3 : 0) === 3 || (data.stars[l.id] ?? 0) >= 3);
      if (all3) achieve('snake', 'stars');
    }
  };

  const back = () => setView('menu');
  const themeCls = `sn sn-th-${S.skin}`;

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        <header className="sn-top"><button onClick={back}>← Menü</button><h1>Schlange</h1><span className="sn-top-sub">{setup.label}</span></header>
        <SnakePlay key={round} setup={setup} S={S} onFinish={onFinish} onExit={() => setView(setup.mode === 'kampagne' ? 'campaign' : 'menu')} onAgain={() => begin({ ...setup, rules: { ...setup.rules, seed: setup.daily ? setup.rules.seed : freshSeed() }, boost: undefined })} />
      </div>
    );
  }
  if (view === 'replay' && replay) {
    return (
      <div className={themeCls}>
        <header className="sn-top"><button onClick={() => setView('replays')}>← Wiederholungen</button><h1>Schlange</h1><span className="sn-top-sub">{replay.mode} · {replay.score} Punkte</span></header>
        <SnakePlay key={replay.id} setup={{ mode: 'klassisch', rules: replay.data.rules, label: replay.mode, statKey: 'replay', baseMs: base }} S={S} replay={replay.data} onFinish={() => undefined} onExit={() => setView('replays')} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'campaign') {
    body = (
      <div className="sn-sub-view">
        <header className="sn-subhead"><button onClick={back}>← Menü</button><h2>Kampagne</h2><span>{Object.values(data.stars).reduce((a, b) => a + b, 0)} / {LEVELS.length * 3} ★</span></header>
        <ol className="sn-levels">
          {LEVELS.map((l, i) => {
            const locked = i > 0 && !(data.stars[LEVELS[i - 1].id] > 0);
            const st = data.stars[l.id] ?? 0;
            return (
              <li key={l.id}><button disabled={locked} onClick={() => startLevel(l)}>
                <LevelThumb level={l} skin={S.skin} />
                <b>{i + 1}. {l.name}</b><span>{l.info}</span><small>Ziel {l.goal} Äpfel</small><em>{locked ? '🔒' : '★'.repeat(st) + '☆'.repeat(3 - st)}</em>
              </button></li>
            );
          })}
        </ol>
        <p className="sn-sub">★ geschafft · ★★ in unter {16} Zügen je Apfel · ★★★ zusätzlich viele Bonuspunkte.</p>
      </div>
    );
  } else if (view === 'custom') {
    body = (
      <CustomView
        levels={data.custom}
        onBack={back}
        onPlay={(c, n) => startCustom(c, n)}
        onNew={() => { setEditLevel({ w: 22, h: 15, wrap: false, obstacles: [], name: 'Mein Level' }); setView('editor'); }}
        onEdit={(l) => { const d = decodeLevel(l.code); if (d) { setEditLevel({ ...d, name: l.name }); setView('editor'); } }}
        onDelete={(code) => upd((d) => { d.custom = d.custom.filter((x) => x.code !== code); })}
        onImport={(code) => { const d = decodeLevel(code); if (!d) { toast('Dieser Code ist ungültig.'); return; } if (reachable({ ...DEFAULT_RULES, ...d }) < 0.8) { toast('Das Level ist nicht spielbar (Bereiche abgeschnitten).'); return; } upd((x) => { x.custom = [{ name: 'Importiert', code }, ...x.custom.filter((c) => c.code !== code)].slice(0, 20); }); toast('Level importiert'); }}
        skin={S.skin}
      />
    );
  } else if (view === 'editor' && editLevel) {
    body = <Editor level={editLevel} skin={S.skin} onBack={() => setView('custom')} onTest={(l) => startCustom(l, l.name)} onSave={(l) => { const code = encodeLevel(l.w, l.h, l.wrap, l.obstacles); upd((d) => { const c: CustomLevel = { name: l.name, code }; d.custom = [c, ...d.custom.filter((x) => x.code !== code)].slice(0, 20); }); toast('Level gespeichert'); setView('custom'); }} />;
  } else if (view === 'replays') {
    body = (
      <div className="sn-sub-view">
        <header className="sn-subhead"><button onClick={back}>← Menü</button><h2>Wiederholungen</h2><span>{data.replays.length}</span></header>
        {data.replays.length === 0 && <p className="sn-sub">Noch nichts gespeichert. Neue Bestleistungen werden automatisch aufgezeichnet und lassen sich hier ansehen.</p>}
        <ul className="sn-list">{data.replays.map((r) => <li key={r.id}><button onClick={() => { setReplay(r); setView('replay'); }}><b>{r.mode}</b><span>{r.score} Punkte</span><small>{r.date}</small></button><button className="x" aria-label="Löschen" onClick={() => upd((d) => { d.replays = d.replays.filter((x) => x.id !== r.id); })}>×</button></li>)}</ul>
      </div>
    );
  } else if (view === 'stats') {
    const rows = Object.entries(data.stats).sort((a, b) => b[1].played - a[1].played);
    const nm = (k: string) => (k === 'tag' ? 'Tagesrunde' : MODES.find((m) => m.id === k)?.name ?? k);
    body = (
      <div className="sn-sub-view">
        <header className="sn-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="sn-statgrid"><div><b>{data.totals.games}</b><span>Spiele</span></div><div><b>{data.totals.apples}</b><span>Äpfel gefressen</span></div><div><b>{data.totals.gold}</b><span>Goldäpfel</span></div><div><b>{Math.round(data.totals.ticks / 60)}</b><span>Minuten gekrochen (ca.)</span></div></div>
        <table className="sn-table"><thead><tr><th>Modus</th><th>Gespielt</th><th>Bestwert</th><th>Längste</th><th>Äpfel</th><th>Zeit</th></tr></thead>
          <tbody>{rows.length ? rows.map(([k, s]) => <tr key={k}><td>{nm(k)}</td><td>{s.played}</td><td>{s.best}</td><td>{s.longest}</td><td>{s.apples}</td><td>{Math.floor(s.time / 60)}:{String(s.time % 60).padStart(2, '0')}</td></tr>) : <tr><td colSpan={6}>Noch keine Spiele.</td></tr>}</tbody></table>
      </div>
    );
  } else if (view === 'options') {
    body = <Options S={S} setS={setS} onBack={back} onReset={() => { upd((d) => { Object.assign(d, { ...SNAKE_INIT, settings: d.settings }); }); toast('Schlange-Daten zurückgesetzt'); }} nokia={nokia} />;
  } else {
    body = (
      <div className="sn-menu">
        <section className="sn-new">
          <div className="sn-handset"><div className="sn-lcd">{demo}</div><div className="sn-keys"><i /><i /><i /></div></div>
          <div className="sn-setup">
            <h2>Spielen</h2>
            <div className="sn-modes">{MODES.map((m) => <button key={m.id} className={S.mode === m.id ? 'on' : ''} onClick={() => setS({ mode: m.id })}><b>{m.name}</b><span>{m.info}</span></button>)}</div>
            <div className="sn-row2">
              <label><span>Tempo</span>{seg(S.speed, (v) => setS({ speed: v }), [1, 2, 3, 4, 5].map((v) => ({ v: v as 1 | 2 | 3 | 4 | 5, label: String(v) })))}</label>
              <label><span>Feld</span>{seg(S.grid, (v) => setS({ grid: v }), [{ v: 'klein', label: 'Klein' }, { v: 'mittel', label: 'Mittel' }, { v: 'gross', label: 'Groß' }])}</label>
              <label><span>Extras</span>{seg(S.extras, (v) => setS({ extras: v }), [{ v: true, label: 'An', title: 'Gold, Gift und Power-ups' }, { v: false, label: 'Aus' }])}</label>
              {S.mode === 'duell' && <label><span>KI-Stufe</span>{seg(S.ai, (v) => setS({ ai: v }), [1, 2, 3, 4].map((v) => ({ v, label: String(v) })))}</label>}
            </div>
            <button className="sn-start" onClick={() => startMode(S.mode)}>{S.mode === 'kampagne' ? 'Level wählen' : S.mode === 'eigen' ? 'Eigene Level' : 'Start'}</button>
            {(boost.geist || boost.len) && <p className="sn-sub">Geheim aktiv: {[boost.geist && 'Python', boost.len && 'Anaconda'].filter(Boolean).join(', ')} – zählt nicht für Bestwerte.</p>}
          </div>
        </section>
        <section className="sn-tiles">
          <button className="sn-tile" onClick={startDaily}><b>Tagesrunde</b><span>{dailyDone('snake', '') ? `gespielt ✓ · ${data.dailyBest[new Date().toISOString().slice(0, 10)] ?? 0}` : 'für alle gleich'}</span></button>
          <button className="sn-tile" onClick={() => setView('campaign')}><b>Kampagne</b><span>{Object.values(data.stars).reduce((a, b) => a + b, 0)} / {LEVELS.length * 3} ★</span></button>
          <button className="sn-tile" onClick={() => setView('custom')}><b>Eigene Level</b><span>{data.custom.length} gespeichert · Editor</span></button>
          <button className="sn-tile" onClick={() => setView('replays')}><b>Wiederholungen</b><span>{data.replays.length} Bestleistungen</span></button>
          <button className="sn-tile" onClick={() => setView('stats')}><b>Statistik</b><span>{data.totals.games} Spiele</span></button>
          <button className="sn-tile" onClick={() => setView('options')}><b>Optionen</b><span>Skin, Steuerung</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      <header className="sn-top">
        <button onClick={view === 'menu' ? onExit : back}>← {view === 'menu' ? 'Halle' : 'Menü'}</button>
        <h1>Schlange</h1>
        <span className="sn-top-sub">Snake · seit 1997</span>
      </header>
      {body}
    </div>
  );
}

function useDemo(skin: SnSettings['skin']) {
  const g = useMemo(() => {
    const game = newGame({ ...DEFAULT_RULES, w: 16, h: 10, seed: 9, obstacles: [] });
    const s = game.snakes[0];
    s.cells = [20, 21, 22, 23, 24, 25, 41, 57, 73].map((c) => c);
    return game;
  }, []);
  return <SnakeCanvas game={g} skin={skin} version={0} className="sn-canvas" />;
}

function LevelThumb({ level, skin }: { level: Level; skin: SnSettings['skin'] }) {
  const g = useMemo(() => { const game = newGame({ ...DEFAULT_RULES, w: level.w, h: level.h, obstacles: level.obstacles, wrap: level.wrap, seed: 1 }); game.foods = []; return game; }, [level]);
  return <SnakeCanvas game={g} skin={skin} version={0} className="sn-thumb" />;
}

// ───────── Editor ─────────

function Editor({ level, skin, onBack, onTest, onSave }: { level: { w: number; h: number; wrap: boolean; obstacles: number[]; name: string }; skin: SnSettings['skin']; onBack: () => void; onTest: (l: { w: number; h: number; wrap: boolean; obstacles: number[]; name: string }) => void; onSave: (l: { w: number; h: number; wrap: boolean; obstacles: number[]; name: string }) => void }) {
  const [w, setW] = useState(level.w), [h, setH] = useState(level.h);
  const [wrap, setWrap] = useState(level.wrap);
  const [name, setName] = useState(level.name);
  const [walls, setWalls] = useState<Set<number>>(() => new Set(level.obstacles));
  const [tool, setTool] = useState<'pinsel' | 'radierer'>('pinsel');
  const painting = useRef(false);
  const cvRef = useRef<HTMLDivElement>(null);
  const obstacles = useMemo(() => [...walls].filter((c) => c < w * h), [walls, w, h]);
  const rules: Rules = { ...DEFAULT_RULES, w, h, wrap, obstacles };
  const reach = reachable(rules);
  const startZone = useMemo(() => { const sx = Math.floor(w / 4), sy = Math.floor(h / 2); return [-1, 0, 1, 2, 3, 4].map((k) => sy * w + sx + k); }, [w, h]);
  const startBlocked = startZone.some((c) => walls.has(c));
  const ok = reach >= 0.9 && !startBlocked;
  const game = useMemo(() => { const g = newGame({ ...rules, seed: 1 }); g.foods = []; g.snakes[0].cells = startZone.slice(1, 4); return g; }, [w, h, wrap, walls]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (e: React.PointerEvent) => {
    const el = cvRef.current?.querySelector('canvas');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * w), y = Math.floor(((e.clientY - r.top) / r.height) * h);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const c = y * w + x;
    setWalls((s) => { const n = new Set(s); if (tool === 'pinsel') n.add(c); else n.delete(c); return n; });
  };
  const code = encodeLevel(w, h, wrap, obstacles);
  return (
    <div className="sn-sub-view">
      <header className="sn-subhead"><button onClick={onBack}>← Eigene Level</button><h2>Editor</h2><span>{obstacles.length} Hindernisse</span></header>
      <div className="sn-editor">
        <div ref={cvRef} className="sn-edit-canvas" onPointerDown={(e) => { painting.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); apply(e); }} onPointerMove={(e) => { if (painting.current) apply(e); }} onPointerUp={() => { painting.current = false; }}>
          <SnakeCanvas game={game} skin={skin} version={walls.size} className="sn-canvas" />
        </div>
        <div className="sn-edit-panel">
          <label><span>Name</span><input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label="Name" /></label>
          <label><span>Werkzeug</span>{seg(tool, setTool, [{ v: 'pinsel', label: 'Pinsel' }, { v: 'radierer', label: 'Radierer' }])}</label>
          <label><span>Größe</span>{seg(`${w}x${h}`, (v) => { const [a, b] = v.split('x').map(Number); setW(a); setH(b); setWalls((s) => new Set([...s].filter((c) => (c % w) < a && Math.floor(c / w) < b).map((c) => Math.floor(c / w) * a + (c % w)))); }, [{ v: '16x11', label: '16×11' }, { v: '22x15', label: '22×15' }, { v: '30x20', label: '30×20' }])}</label>
          <label><span>Ränder</span>{seg(wrap, setWrap, [{ v: false, label: 'Wände' }, { v: true, label: 'Torus' }])}</label>
          <div className="sn-actions"><button onClick={() => setWalls(new Set())}>Leeren</button><button onClick={() => { const n = new Set<number>(); for (let x = 0; x < w; x++) { n.add(x); n.add((h - 1) * w + x); } for (let y = 0; y < h; y++) { n.add(y * w); n.add(y * w + w - 1); } setWalls(n); }}>Rahmen</button><button onClick={() => { const n = new Set<number>(); let s = (Date.now() & 0xffff) | 1; for (let i = 0; i < Math.floor((w * h) / 14); i++) { s = (s * 16807) % 2147483647; const c = s % (w * h); if (!startZone.includes(c)) n.add(c); } setWalls(n); }}>Zufall</button></div>
          <p className={`sn-msg ${ok ? 'ok' : 'bad'}`}>{ok ? `Spielbar (${Math.round(reach * 100)} % der Fläche erreichbar).` : startBlocked ? 'Die Startzeile der Schlange muss frei bleiben.' : `Zu viele abgeschnittene Bereiche (${Math.round(reach * 100)} % erreichbar).`}</p>
          <div className="sn-actions"><button className="primary" disabled={!ok} onClick={() => onTest({ w, h, wrap, obstacles, name })}>Testen</button><button disabled={!ok} onClick={() => onSave({ w, h, wrap, obstacles, name })}>Speichern</button></div>
          <label><span>Code zum Teilen</span><input readOnly value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Level-Code" /></label>
          <button onClick={() => { void navigator.clipboard?.writeText(code); toast('Code kopiert'); }}>Code kopieren</button>
        </div>
      </div>
    </div>
  );
}

function CustomView({ levels, skin, onBack, onPlay, onNew, onEdit, onDelete, onImport }: { levels: CustomLevel[]; skin: SnSettings['skin']; onBack: () => void; onPlay: (l: { w: number; h: number; wrap: boolean; obstacles: number[] }, name: string) => void; onNew: () => void; onEdit: (l: CustomLevel) => void; onDelete: (code: string) => void; onImport: (code: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div className="sn-sub-view">
      <header className="sn-subhead"><button onClick={onBack}>← Menü</button><h2>Eigene Level</h2><span>{levels.length}</span></header>
      <div className="sn-actions"><button className="primary" onClick={onNew}>Neues Level bauen</button></div>
      <ul className="sn-list">
        {levels.map((l) => { const d = decodeLevel(l.code); return d ? (
          <li key={l.code}><button onClick={() => onPlay(d, l.name)}><LevelThumbRaw d={d} skin={skin} /><b>{l.name}</b><span>{d.w}×{d.h} · {d.wrap ? 'Torus' : 'Wände'} · {d.obstacles.length} Hindernisse</span></button><button className="x" onClick={() => onEdit(l)} aria-label="Bearbeiten">✎</button><button className="x" onClick={() => onDelete(l.code)} aria-label="Löschen">×</button></li>
        ) : null; })}
      </ul>
      <h3>Code importieren</h3>
      <div className="sn-actions"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="S1-22-15-m-…" aria-label="Level-Code" /><button onClick={() => { onImport(text.trim()); setText(''); }} disabled={!text.trim()}>Importieren</button></div>
    </div>
  );
}

function LevelThumbRaw({ d, skin }: { d: { w: number; h: number; wrap: boolean; obstacles: number[] }; skin: SnSettings['skin'] }) {
  const g = useMemo(() => { const game = newGame({ ...DEFAULT_RULES, w: d.w, h: d.h, obstacles: d.obstacles, wrap: d.wrap, seed: 1 }); game.foods = []; return game; }, [d]);
  return <SnakeCanvas game={g} skin={skin} version={0} className="sn-thumb" />;
}

function Options({ S, setS, onBack, onReset, nokia }: { S: SnSettings; setS: (p: Partial<SnSettings>) => void; onBack: () => void; onReset: () => void; nokia: boolean }) {
  const [sure, setSure] = useState(false);
  void nokia;
  const demo = useMemo(() => { const g = newGame({ ...DEFAULT_RULES, w: 10, h: 6, seed: 3 }); g.snakes[0].cells = [13, 14, 15, 16, 26, 36]; return g; }, []);
  return (
    <div className="sn-sub-view">
      <header className="sn-subhead"><button onClick={onBack}>← Menü</button><h2>Optionen</h2></header>
      <div className="sn-opts">
        <section>
          <h3>Aussehen</h3>
          <div className="sn-swatches">{SKINS.map((k) => <button key={k.id} className={S.skin === k.id ? 'on' : ''} onClick={() => setS({ skin: k.id })}><SnakeCanvas game={demo} skin={k.id} version={0} className="sn-thumb" /><span>{k.name}</span></button>)}</div>
        </section>
        <section>
          <h3>Steuerung und Ton</h3>
          <label className="sn-check"><input type="checkbox" checked={S.dpad} onChange={(e) => setS({ dpad: e.target.checked })} /> Bildschirm-Steuerkreuz (Touch)</label>
          <label className="sn-check"><input type="checkbox" checked={S.sound} onChange={(e) => setS({ sound: e.target.checked })} /> Geräusche</label>
          <p className="sn-sub">Pfeiltasten oder WASD steuern, Leertaste pausiert. Am Handy reicht Wischen auf dem Spielfeld.</p>
          <p className="sn-sub"><b>Extras:</b> Goldapfel (+50, wächst um 2) · Gift (−2 Länge) · G = Geist (durch Hindernisse und dich selbst) · Z = Zeitlupe · ×2 = doppelte Punkte · S = Schild (überlebt einen Aufprall).</p>
          <h3>Daten</h3>
          {!sure ? <button className="danger" onClick={() => setSure(true)}>Schlange-Daten löschen …</button> : <div className="sn-actions"><button className="danger" onClick={() => { onReset(); setSure(false); }}>Wirklich löschen</button><button onClick={() => setSure(false)}>Abbrechen</button></div>}
        </section>
      </div>
    </div>
  );
}
