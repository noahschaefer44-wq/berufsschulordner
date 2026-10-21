import { useEffect, useRef, useState } from 'react';
import '@fontsource/special-elite/400.css';
import '@fontsource/alfa-slab-one/400.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import KniffelPlay, { type FinishInfo, type PlaySetup } from './KniffelPlay';
import { Die, Sheet } from './parts';
import { LESSONS } from './lessons';
import { KNIFFEL_INIT, THEMES_N, type HistGame, type KData, type KSettings } from './data';
import { askPuzzle } from './aiClient';
import { CATS, LEVELS, VARIANTS, analyze, evOfHold, heldValues, openCats, type CatId, type Puzzle, type Variant } from './engine';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { dailySeed, freshSeed } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './kniffel.css';

type View = 'menu' | 'play' | 'learn' | 'stats' | 'hist' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="kn-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);

const AI_NAMES = ['Anna', 'Bernd', 'Carla', 'Dieter'];
const playerName = (ai: number, i: number, solo: boolean) => (ai === 0 ? (solo ? 'Du' : i === 0 ? 'Du' : `Spieler ${i + 1}`) : `${AI_NAMES[i % 4]} (${LEVELS[ai - 1].name})`);

/** Würfelreihe zum Auswählen (Lektionen, Aufgaben). */
function Choice({ v, dice, held, setHeld, locked, label, onCheck }: { v: Variant; dice: number[]; held: boolean[]; setHeld: (h: boolean[]) => void; locked: boolean; label: string; onCheck: () => void }) {
  void v;
  return (
    <div className="kn-practice">
      <div className="kn-tray">{dice.map((d, i) => <Die key={i} index={i} value={d} held={held[i]} rolling={false} disabled={locked} onClick={() => setHeld(held.map((x, k) => (k === i ? !x : x)))} />)}</div>
      <div className="kn-small"><button className="primary" onClick={onCheck} disabled={locked}>{label}</button></div>
    </div>
  );
}

function Lessons({ data, upd }: { data: KData; upd: (fn: (d: KData) => void) => void }) {
  const [i, setI] = useState(0);
  const L = LESSONS[i];
  const [held, setHeld] = useState<boolean[]>(() => L.dice.map(() => false));
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => { setHeld(LESSONS[i].dice.map(() => false)); setRes(null); setPick(null); }, [i]);
  const solved = res?.ok === true;
  const win = () => {
    setRes({ ok: true, text: L.why }); sfx('good');
    if (!data.lessons[L.id]) {
      upd((d) => { d.lessons = { ...d.lessons, [L.id]: true }; });
      if (LESSONS.every((x) => x.id === L.id || data.lessons[x.id])) achieve('kniffel', 'lessons');
    }
  };
  const lose = () => { setRes({ ok: false, text: `Nicht ganz. ${L.hint}` }); sfx('bad'); };
  const card = L.card();
  const done = Object.values(data.lessons).filter(Boolean).length;
  return (
    <div className="kn-lessons">
      <ol className="kn-lessonlist">{LESSONS.map((x, k) => <li key={x.id}><button className={`${k === i ? 'on' : ''}${data.lessons[x.id] ? ' done' : ''}`} onClick={() => setI(k)}>{k + 1}. {x.title}</button></li>)}<li className="cnt">{done} / {LESSONS.length}</li></ol>
      <div className="kn-lesson">
        <article>
          <h3>{L.title}</h3>
          <p>{L.text}</p>
          <p className="kn-task"><b>Aufgabe:</b> {L.task}</p>
          {res && <p className={`kn-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
          <div className="kn-small">
            {solved && i + 1 < LESSONS.length && <button className="primary" onClick={() => setI(i + 1)}>Nächste Lektion</button>}
            {res && !solved && <button onClick={() => setRes(null)}>Nochmal</button>}
          </div>
        </article>
        <div className="kn-lessonpane">
          {L.kind === 'hold' && <Choice v={L.variant} dice={L.dice} held={held} setHeld={setHeld} locked={solved} label="Prüfen" onCheck={() => (L.checkHold!(heldValues(L.dice, held)) ? win() : lose())} />}
          {L.kind === 'cat' && <>
            <div className="kn-tray">{L.dice.map((d, k) => <Die key={k} index={k} value={d} held={false} rolling={false} disabled />)}</div>
            <Sheet v={L.variant} cards={[card]} names={['Dein Block']} active={0} dice={L.dice} clickable={!solved} onPick={(c: CatId) => (L.checkCat!(c) ? win() : lose())} />
          </>}
          {L.kind === 'quiz' && <>
            <div className="kn-tray">{L.dice.map((d, k) => <Die key={k} index={k} value={d} held={L.rollsLeft > 0 && k < 4} rolling={false} disabled />)}</div>
            <div className="kn-quiz">{L.options!.map((o, k) => <button key={k} className={pick === k ? (k === L.correct ? 'ok' : 'no') : ''} disabled={solved} onClick={() => { setPick(k); if (k === L.correct) win(); else lose(); }}>{o}</button>)}</div>
          </>}
        </div>
      </div>
    </div>
  );
}

function Puzzles({ data, upd, daily }: { data: KData; upd: (fn: (d: KData) => void) => void; daily: boolean }) {
  const [kind, setKind] = useState<'hold' | 'cat'>('hold');
  const [seed, setSeed] = useState(() => (daily ? dailySeed('kniffel', 'tag') : freshSeed()));
  const [isDaily, setIsDaily] = useState(daily);
  const [pz, setPz] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [held, setHeld] = useState<boolean[]>([]);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const failed = useRef(false);
  const solved = useRef(false);
  const v = VARIANTS[0];

  useEffect(() => {
    let live = true;
    setLoading(true); setPz(null); setRes(null); failed.current = false; solved.current = false;
    askPuzzle('classic', kind, seed).then((p) => { if (!live) return; setPz(p); setHeld((p?.dice ?? []).map(() => false)); setLoading(false); });
    return () => { live = false; };
  }, [seed, kind]);

  const reward = (ok: boolean) => {
    upd((d) => { const p = { ...d.puzzles }; if (ok) { p.solved++; p.streak++; p.best = Math.max(p.best, p.streak); } else p.streak = 0; d.puzzles = p; });
    if (ok) {
      if (data.puzzles.solved + 1 >= 10) achieve('kniffel', 'puzzle10');
      if (data.puzzles.streak + 1 >= 5) achieve('kniffel', 'streak5');
    }
  };
  const judgeHold = () => {
    if (!pz || solved.current) return;
    const a = analyze(v, pz.card, pz.dice, pz.rollsLeft);
    const h = heldValues(pz.dice, held);
    const loss = a.holds[0].ev - evOfHold(a, h);
    if (loss < 0.4) { solved.current = true; setRes({ ok: true, text: `Richtig – bestes Halten: ${a.holds[0].hold.length ? a.holds[0].hold.join(' ') : 'alles neu würfeln'}. Alles andere ist mindestens ${pz.margin.toFixed(1)} Punkte schlechter.` }); sfx('good'); if (!failed.current) reward(true); }
    else { setRes({ ok: false, text: `Das verschenkt etwa ${loss.toFixed(1)} Punkte gegenüber dem besten Halten.` }); sfx('bad'); if (!failed.current) { failed.current = true; reward(false); } }
  };
  const judgeCat = (c: CatId) => {
    if (!pz || solved.current) return;
    const a = analyze(v, pz.card, pz.dice, 0);
    const x = a.cats.find((q) => q.cat === c)!;
    const loss = a.cats[0].value - x.value;
    if (loss < 0.4) { solved.current = true; setRes({ ok: true, text: `Richtig – ${CATS[c].name} ist hier die beste Wahl (${pz.margin.toFixed(1)} Punkte vor der nächsten).` }); sfx('good'); if (!failed.current) reward(true); }
    else { setRes({ ok: false, text: `${CATS[c].name} verschenkt etwa ${loss.toFixed(1)} Punkte.` }); sfx('bad'); if (!failed.current) { failed.current = true; reward(false); } }
  };

  return (
    <div className="kn-puzzles">
      <div className="kn-small">
        {seg(kind, (k) => { setIsDaily(false); setKind(k); setSeed(freshSeed()); }, [{ v: 'hold', label: 'Was halten?' }, { v: 'cat', label: 'Welches Feld?' }])}
        <span className="kn-score">Gelöst: {data.puzzles.solved} · Serie {data.puzzles.streak} (Bestwert {data.puzzles.best})</span>
      </div>
      <div className="kn-lesson">
        <article>
          <h3>{kind === 'hold' ? 'Würfel halten' : 'Feld wählen'}{isDaily ? ' · Tagesaufgabe' : ''}</h3>
          {loading && <p>Aufgabe wird gebaut …</p>}
          {!loading && !pz && <p>Keine Aufgabe gefunden – <button className="kn-link" onClick={() => setSeed(freshSeed())}>neue versuchen</button>.</p>}
          {pz && <>
            <p>{pz.kind === 'hold' ? `Nach dem Wurf bleiben dir noch ${pz.rollsLeft} ${pz.rollsLeft === 1 ? 'Wurf' : 'Würfe'}. Welche Würfel behältst du?` : 'Das Ergebnis steht fest. In welches Feld trägst du ein?'}</p>
            <p className="kn-task">{openCats(v, pz.card).length} Felder sind noch offen (siehe Block).</p>
            {res && <p className={`kn-res ${res.ok ? 'ok' : 'no'}`}>{res.text}</p>}
            <div className="kn-small">
              <button className="primary" onClick={() => { setIsDaily(false); setSeed(freshSeed()); }}>Nächste Aufgabe</button>
            </div>
          </>}
        </article>
        <div className="kn-lessonpane">
          {pz && pz.kind === 'hold' && <Choice v={v} dice={pz.dice} held={held} setHeld={setHeld} locked={solved.current} label="Prüfen" onCheck={judgeHold} />}
          {pz && pz.kind === 'cat' && <div className="kn-tray">{pz.dice.map((d, k) => <Die key={k} index={k} value={d} held={false} rolling={false} disabled />)}</div>}
          {pz && <Sheet v={v} cards={[pz.card]} names={['Block']} active={0} dice={pz.dice} clickable={pz.kind === 'cat' && !solved.current} onPick={judgeCat} />}
        </div>
      </div>
    </div>
  );
}

export default function KniffelRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('kniffel');
  const [data, upd] = useGameData<KData>('kniffel', KNIFFEL_INIT);
  const S: KSettings = { ...KNIFFEL_INIT.settings, ...data.settings };
  const setS = (p: Partial<KSettings>) => upd((d) => { d.settings = { ...KNIFFEL_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>('menu');
  const [tab, setTab] = useState<'lessons' | 'puzzles'>('lessons');
  const [setup, setSetup] = useState<PlaySetup | null>(null);
  const [round, setRound] = useState(0);
  const [sec, setSec] = useState({ knobeln: false, schummeln: false, pasch: false });
  const [open, setOpen] = useState<HistGame | null>(null);
  const started = useRef(false);

  useSecrets('kniffel', {
    'kniffel-knobeln': () => setSec((x) => ({ ...x, knobeln: true })),
    'kniffel-schummeln': () => setSec((x) => ({ ...x, schummeln: true })),
    'kniffel-pasch': () => setSec((x) => ({ ...x, pasch: true })),
  });

  const variant = VARIANTS.find((v) => v.id === S.variant) ?? VARIANTS[0];
  const solo = S.players.length === 1;
  const begin = (cfg: Partial<PlaySetup> & { players: PlaySetup['players'] }) => {
    setSetup({ variant: S.variant, seed: freshSeed(), daily: false, coach: S.coach, odds: S.odds, fast: S.fast, secrets: { ...sec }, ...cfg });
    setSec({ knobeln: false, schummeln: false, pasch: false });
    setRound((r) => r + 1);
    setView('play');
  };
  const start = () => begin({ players: S.players.map((p, i) => ({ name: playerName(p.ai, i, solo), ai: p.ai })), coach: S.coach && S.players.some((p) => p.ai === 0) });
  const startDaily = () => begin({ variant: 'classic', players: [{ name: 'Du', ai: 0 }], seed: dailySeed('kniffel', 'tag'), daily: true, coach: S.coach });
  useEffect(() => { if (daily && !started.current) { started.current = true; startDaily(); } }, [daily]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFinish = (i: FinishInfo) => {
    const s = i.setup;
    const v = VARIANTS.find((x) => x.id === s.variant) ?? VARIANTS[0];
    const hs = i.humans;
    const mine = hs.length ? Math.max(...hs.map((h) => i.totals[h])) : 0;
    const won = hs.length > 0 && s.players.length > 1 && i.winners.some((w) => hs.includes(w));
    upd((d) => {
      const st = { ...d.stats };
      st.games++;
      if (won) st.wins++;
      if (hs.length) {
        st.best = { ...st.best, [v.id]: Math.max(st.best[v.id] ?? 0, mine) };
        st.sum = { ...st.sum, [v.id]: (st.sum[v.id] ?? 0) + mine };
        st.count = { ...st.count, [v.id]: (st.count[v.id] ?? 0) + 1 };
      }
      st.kniffels += i.stats.kniffels; st.straights += i.stats.ls; if (i.stats.bonus) st.bonuses++;
      d.stats = st;
      d.coach = { n: d.coach.n + i.coach.n, loss: d.coach.loss + i.coach.loss, perfect: d.coach.perfect + i.coach.perfect };
      const h: HistGame = { id: String(Date.now()), date: new Date().toLocaleDateString('de-DE'), variant: v.id, names: s.players.map((p) => p.name), totals: i.totals, cards: i.cards, daily: s.daily };
      d.hist = [h, ...d.hist].slice(0, 20);
    });
    if (s.daily && !dailyDone('kniffel', '')) { markDaily('kniffel', ''); achieve('kniffel', 'daily'); toast('Tageswurf gespielt'); }
    achieve('kniffel', 'first');
    if (i.usedSecret || !hs.length) return;
    if (i.stats.kniffels > 0) achieve('kniffel', 'kniffel');
    if (i.stats.ls > 0) achieve('kniffel', 'strasse');
    if (i.stats.bonus) achieve('kniffel', 'bonus');
    if (v.id === 'classic' && mine >= 200) achieve('kniffel', 'score200');
    if (v.id === 'classic' && mine >= 250) achieve('kniffel', 'score250');
    if (v.id === 'maxi' && mine >= 300) achieve('kniffel', 'maxi');
    if (i.stats.yzBonus > 0) achieve('kniffel', 'bonus100');
    if (won) {
      const best = Math.max(0, ...s.players.map((p) => p.ai));
      if (best >= 3) achieve('kniffel', 'sieg');
      if (best >= 5) achieve('kniffel', 'meister');
    }
    if (s.coach && i.coach.n >= 15 && i.coach.loss / i.coach.n <= 2 && !i.helped) achieve('kniffel', 'coach');
  };

  const themeCls = `kn kn-th-${S.theme}`;
  const back = () => setView('menu');
  const top = (title: string, sub: string, left: () => void, label: string) => (
    <header className="kn-top"><button onClick={left}>← {label}</button><h1>{title}</h1><span className="kn-top-sub">{sub}</span></header>
  );

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        {top('Kniffel', setup.daily ? 'Tageswurf' : (VARIANTS.find((x) => x.id === setup.variant)?.name ?? ''), back, 'Menü')}
        <KniffelPlay key={round} setup={setup} onFinish={onFinish} onExit={back} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    body = (
      <div className="kn-sub-view">
        <header className="kn-subhead"><button onClick={back}>← Menü</button><h2>Lernen</h2>
          {seg(tab, setTab, [{ v: 'lessons', label: 'Lektionen' }, { v: 'puzzles', label: 'Aufgaben' }])}
        </header>
        {tab === 'lessons' ? <Lessons data={data} upd={upd} /> : <Puzzles data={data} upd={upd} daily={false} />}
      </div>
    );
  } else if (view === 'hist') {
    body = open ? (
      <div className="kn-sub-view">
        <header className="kn-subhead"><button onClick={() => setOpen(null)}>← Zurück</button><h2>Block vom {open.date}</h2></header>
        <Sheet v={VARIANTS.find((x) => x.id === open.variant) ?? VARIANTS[0]} cards={open.cards} names={open.names} active={-1} dice={null} clickable={false} onPick={() => undefined} />
      </div>
    ) : (
      <div className="kn-sub-view">
        <header className="kn-subhead"><button onClick={back}>← Menü</button><h2>Alte Blöcke</h2></header>
        {data.hist.length === 0 && <p className="kn-note">Noch kein beendetes Spiel.</p>}
        <ul className="kn-replist">{data.hist.map((h) => <li key={h.id}><button onClick={() => setOpen(h)}><b>{h.date}</b><span>{VARIANTS.find((x) => x.id === h.variant)?.name}{h.daily ? ' · Tageswurf' : ''}</span><span>{h.names.map((n, i) => `${n.split(' ')[0]} ${h.totals[i]}`).join(' · ')}</span></button></li>)}</ul>
      </div>
    );
  } else if (view === 'stats') {
    const st = data.stats;
    const ct = data.coach;
    body = (
      <div className="kn-sub-view">
        <header className="kn-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="kn-statgrid">
          <div><b>{st.games}</b><span>Spiele</span></div><div><b>{st.wins}</b><span>Siege gegen andere</span></div>
          {VARIANTS.map((v) => <div key={v.id}><b>{st.best[v.id] ?? '–'}</b><span>Bestwert {v.name}{st.count[v.id] ? ` · Ø ${Math.round(st.sum[v.id] / st.count[v.id])}` : ''}</span></div>)}
          <div><b>{st.kniffels}</b><span>Kniffel gewürfelt</span></div><div><b>{st.straights}</b><span>Große Straßen</span></div><div><b>{st.bonuses}</b><span>Oberer Bonus</span></div>
          <div><b>{ct.n ? (ct.loss / ct.n).toFixed(1) : '–'}</b><span>Coach: Ø verschenkte Punkte</span></div><div><b>{data.puzzles.solved}</b><span>Aufgaben gelöst</span></div>
        </div>
      </div>
    );
  } else if (view === 'options') {
    body = (
      <div className="kn-sub-view">
        <header className="kn-subhead"><button onClick={back}>← Menü</button><h2>Optionen</h2></header>
        <div className="kn-opts">
          <section><h3>Tisch</h3>
            <div className="kn-swatches">{THEMES_N.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`kn kn-th-${t.id} kn-sw`}><i /><i /></span><span>{t.name}</span></button>)}</div>
          </section>
          <section><h3>Hilfen und Tempo</h3>
            <label className="kn-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Coach: Entscheidungen bewerten</label>
            <label className="kn-check"><input type="checkbox" checked={S.odds} onChange={(e) => setS({ odds: e.target.checked })} /> Chancen-Tabelle nach jedem Wurf</label>
            <label className="kn-check"><input type="checkbox" checked={S.fast} onChange={(e) => setS({ fast: e.target.checked })} /> Schnelle KI-Züge</label>
            <label className="kn-check"><input type="checkbox" checked={S.sound} onChange={(e) => setS({ sound: e.target.checked })} /> Geräusche</label>
            <h3>Daten</h3>
            <button className="danger" onClick={() => { if (confirm('Alle Kniffel-Daten löschen?')) { upd((d) => { Object.assign(d, { ...KNIFFEL_INIT, settings: d.settings }); }); toast('Daten gelöscht'); } }}>Kniffel-Daten löschen …</button>
          </section>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="kn-menu">
        <section className="kn-new">
          <div className="kn-hero" aria-hidden>
            <div className="kn-hero-dice">{[5, 5, 2, 5, 5].map((d, i) => <Die key={i} index={i} value={d} held={i !== 2} rolling={false} disabled />)}</div>
            <div className="kn-hero-pad"><b>Kniffel</b><span>Fünf Würfel · drei Würfe · dreizehn Felder</span><em>Kniffel!  50</em></div>
          </div>
          <div className="kn-setup">
            <h2>Neues Spiel</h2>
            <label><span>Spielart</span>{seg(S.variant, (v) => setS({ variant: v }), VARIANTS.map((v) => ({ v: v.id, label: v.name, title: v.info })))}<small>{variant.info}</small></label>
            <label><span>Spieler</span>{seg(S.players.length, (n) => setS({ players: Array.from({ length: n }, (_, i) => S.players[i] ?? { ai: 3 }) }), [1, 2, 3, 4].map((n) => ({ v: n, label: String(n) })))}</label>
            <div className="kn-pls">
              {S.players.map((p, i) => (
                <div key={i} className="kn-plsetup"><b>{playerName(p.ai, i, solo)}</b>
                  {seg(p.ai, (ai) => setS({ players: S.players.map((q, k) => (k === i ? { ai } : q)) }), [{ v: 0, label: 'Mensch' }, ...LEVELS.map((l) => ({ v: l.id, label: `KI ${l.id}`, title: `${l.name}: ${l.info}` }))])}
                </div>
              ))}
            </div>
            <label className="kn-check"><input type="checkbox" checked={S.coach} onChange={(e) => setS({ coach: e.target.checked })} /> Coach bewertet meine Entscheidungen</label>
            <button className="kn-start" onClick={start}>Spiel beginnen</button>
            {(sec.knobeln || sec.schummeln || sec.pasch) && <p className="kn-sub">Geheim aktiv: {[sec.knobeln && 'Knobeln', sec.schummeln && 'Schummeln', sec.pasch && 'Sechserpasch'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="kn-tiles">
          <button className="kn-tile" onClick={startDaily}><i>1</i><b>Tageswurf</b><span>{dailyDone('kniffel', '') ? 'gespielt ✓' : 'gleiche Würfel für alle'}</span></button>
          <button className="kn-tile" onClick={() => { setTab('lessons'); setView('learn'); }}><i>2</i><b>Lernen</b><span>{Object.values(data.lessons).filter(Boolean).length} / {LESSONS.length} Lektionen</span></button>
          <button className="kn-tile" onClick={() => { setTab('puzzles'); setView('learn'); }}><i>3</i><b>Aufgaben</b><span>Halten und Feld wählen</span></button>
          <button className="kn-tile" onClick={() => { setOpen(null); setView('hist'); }}><i>4</i><b>Alte Blöcke</b><span>{data.hist.length} gespeichert</span></button>
          <button className="kn-tile" onClick={() => setView('stats')}><i>5</i><b>Statistik</b><span>{data.stats.games} Spiele · Bestwert {data.stats.best.classic ?? '–'}</span></button>
          <button className="kn-tile" onClick={() => setView('options')}><i>6</i><b>Optionen</b><span>Tisch, Coach, Chancen</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      {top('Kniffel', 'Würfeln, halten, eintragen', view === 'menu' ? onExit : back, view === 'menu' ? 'Halle' : 'Menü')}
      {body}
    </div>
  );
}
