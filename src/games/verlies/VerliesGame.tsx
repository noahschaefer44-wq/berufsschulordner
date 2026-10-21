import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/vt323/400.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/700.css';
import VerliesPlay, { type EndInfo, type RunInfo } from './VerliesPlay';
import { THEMES_V, VERLIES_INIT, type HallEntry, type VData, type VSettings } from './data';
import { CLASS, CLASSES, MAX_DEPTH, MONSTERS } from './content';
import { newGame, score } from './engine';
import { clearRun, loadRun, saveRun } from './save';
import type { State } from './types';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { freshSeed, todayKey } from '../shared/rng';
import { hashString } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './verlies.css';

type View = 'menu' | 'play' | 'hall' | 'bestiary' | 'stats' | 'options' | 'manual';

const FLAG_TEXT: Record<string, string> = { erratic: 'flattert unberechenbar', poison: 'vergiftet', split: 'teilt sich', pass: 'schwebt durch Wände', regen: 'regeneriert', ranged: 'greift aus der Ferne an', coward: 'flieht bei wenig Leben', boss: 'Endgegner', drain: 'saugt Leben' };

export default function VerliesRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('verlies');
  const [data, upd] = useGameData<VData>('verlies', VERLIES_INIT);
  const S: VSettings = { ...VERLIES_INIT.settings, ...data.settings };
  const setS = (p: Partial<VSettings>) => upd((d) => { d.settings = { ...VERLIES_INIT.settings, ...d.settings, ...p }; });
  const [view, setView] = useState<View>('menu');
  const [run, setRun] = useState<RunInfo | null>(null);
  const [round, setRound] = useState(0);
  const [seedTxt, setSeedTxt] = useState('');
  const [end, setEnd] = useState<EndInfo | null>(null);
  const [sec, setSec] = useState({ xyzzy: false, plugh: false, nethack: false });
  const saved = useMemo(() => loadRun(), [view, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const started = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  useSecrets('verlies', {
    'verlies-xyzzy': () => setSec((x) => ({ ...x, xyzzy: true })),
    'verlies-plugh': () => setSec((x) => ({ ...x, plugh: true })),
    'verlies-nethack': () => setSec((x) => ({ ...x, nethack: true })),
  });

  const begin = (seed: string, cls: string, isDaily: boolean, label: string) => {
    const s = newGame(seed, cls, sec);
    setSec({ xyzzy: false, plugh: false, nethack: false });
    setEnd(null);
    setRun({ s, daily: isDaily, label });
    setRound((r) => r + 1);
    setView('play');
    saveRun({ s, daily: isDaily, label, saved: Date.now() });
  };
  const startNew = () => { const seed = seedTxt.trim() || `lauf-${freshSeed().toString(36)}`; begin(seed, S.cls, false, `Startwert ${seed}`); };
  const startDaily = () => {
    const seed = `tag-${todayKey()}`;
    const cls = CLASSES[hashString(seed) % CLASSES.length].id;
    begin(seed, cls, true, `Tag ${todayKey()}`);
  };
  const resume = () => { const r = loadRun(); if (!r) return; setRun({ s: r.s, daily: r.daily, label: r.label }); setEnd(null); setRound((x) => x + 1); setView('play'); };
  useEffect(() => { if (daily && !started.current) { started.current = true; startDaily(); } }, [daily]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ereignisse aus dem Lauf: Erfolge und Bestiarium
  const onEvent = (ev: string, s: State) => {
    if (ev.startsWith('kill:')) { const k = ev.slice(5); upd((d) => { d.bestiary = { ...d.bestiary, [k]: (d.bestiary[k] ?? 0) + 1 }; }); if (!s.assisted) { const b = { ...dataRef.current.bestiary, [k]: 1 }; if (MONSTERS.filter((m) => !m.flags.includes('boss')).every((m) => (b[m.id] ?? 0) > 0)) achieve('verlies', 'bestiarium'); } }
    if (s.assisted) return;
    if (ev === 'depth:2') achieve('verlies', 'abstieg');
    if (ev === 'depth:3' && s.p.kills === 0) achieve('verlies', 'pazifist');
    if (ev === 'depth:4') achieve('verlies', 'tief4');
    if (ev === 'depth:7') achieve('verlies', 'tief7');
    if (ev === 'boss') achieve('verlies', 'drache');
    if (ev === 'levelup:8') achieve('verlies', 'stufe8');
    if (ev === 'gold' && s.p.gold >= 400) achieve('verlies', 'reich');
    if (ev.startsWith('idcount:') && +ev.slice(8) >= 5) achieve('verlies', 'alchemist');
    if (ev.startsWith('trapcount:') && +ev.slice(10) >= 3) achieve('verlies', 'fallen');
  };

  const onEnd = (e: EndInfo) => {
    const s = e.s;
    const win = !!s.over?.win;
    const sc = score(s);
    clearRun();
    setEnd(e);
    upd((d) => {
      const st = { ...d.stats };
      st.runs++; if (win) st.wins++;
      st.deepest = Math.max(st.deepest, s.stats.maxDepth); st.kills += s.p.kills; st.gold += s.p.gold; st.bestScore = Math.max(st.bestScore, s.assisted ? 0 : sc); st.turns += s.turn; st.levelups += s.p.lvl - 1;
      d.stats = st;
      const h: HallEntry = { id: String(Date.now()), date: new Date().toLocaleDateString('de-DE'), cls: s.p.cls, depth: s.stats.maxDepth, score: sc, win, cause: s.over?.cause ?? '', turns: s.turn, kills: s.p.kills, seed: s.seed, assisted: s.assisted, daily: e.daily };
      d.hall = [h, ...d.hall].sort((a, b) => b.score - a.score).slice(0, 25);
      if (win && !s.assisted) d.wins = { ...d.wins, [s.p.cls]: true };
      if (e.daily) d.dailyBest = { ...d.dailyBest, [todayKey()]: Math.max(d.dailyBest[todayKey()] ?? 0, sc) };
    });
    if (e.daily && !dailyDone('verlies', '')) { markDaily('verlies', ''); if (!s.assisted) achieve('verlies', 'daily'); toast('Tageslauf gespielt'); }
    if (win && !s.assisted) {
      achieve('verlies', 'sieg');
      if (s.turn <= 4000) achieve('verlies', 'schnell');
      const w = { ...dataRef.current.wins, [s.p.cls]: true };
      if (CLASSES.every((c) => w[c.id])) achieve('verlies', 'sieg3');
    }
  };

  const themeCls = `vl vl-th-${S.theme}`;
  const back = () => setView('menu');
  const top = (title: string, sub: string, left: () => void, label: string) => (
    <header className="vl-head"><button onClick={left}>← {label}</button><h1>{title}</h1><span>{sub}</span></header>
  );

  if (view === 'play' && run) {
    return (
      <div className={themeCls}>
        {top('Verlies', run.label, () => setView('menu'), 'Menü')}
        <VerliesPlay key={round} run={run} S={S} hooks={{ onEvent }} onEnd={onEnd} onExit={() => setView('menu')} />
        {end && (
          <div className="vl-modal">
            <div className="vl-panel end">
              <h2>{end.s.over?.win ? 'Du hast das Amulett!' : 'Das Ende deines Laufs'}</h2>
              <p className="vl-big">{score(end.s)} Punkte</p>
              <p>{CLASS[end.s.p.cls].name} · Ebene {end.s.stats.maxDepth} von {MAX_DEPTH} · Stufe {end.s.p.lvl} · {end.s.p.kills} Monster · {end.s.p.gold} Gold · {end.s.turn} Züge</p>
              <p className="vl-cause">{end.s.over?.win ? 'Der Keller gehört dir – und die Legende wird erzählt.' : `Todesursache: ${end.s.over?.cause}.`}</p>
              {end.s.assisted && <p className="vl-note">Mit Zauberwort-Hilfe gespielt – zählt nicht für Erfolge.</p>}
              <div className="vl-btns">
                <button className="primary" onClick={() => { sfx('tick'); begin(`lauf-${freshSeed().toString(36)}`, end.s.p.cls, false, 'Neuer Lauf'); }}>Neuer Lauf</button>
                <button onClick={() => { setEnd(null); setView('hall'); }}>Gedenktafel</button>
                <button onClick={() => { setEnd(null); setView('menu'); }}>Menü</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'hall') {
    body = (
      <div className="vl-sub">
        <header><button onClick={back}>← Menü</button><h2>Gedenktafel</h2></header>
        {data.hall.length === 0 ? <p className="vl-note">Noch niemand ist im Verlies gewesen.</p> : (
          <table className="vl-table"><thead><tr><th>#</th><th>Punkte</th><th>Held</th><th>Tiefe</th><th>Ende</th><th>Züge</th><th>Datum</th></tr></thead>
            <tbody>{data.hall.map((h, i) => <tr key={h.id} className={h.win ? 'win' : ''}><td>{i + 1}</td><td>{h.score}{h.assisted ? ' *' : ''}</td><td>{CLASS[h.cls]?.name}{h.daily ? ' (Tag)' : ''}</td><td>{h.depth}</td><td>{h.win ? 'Sieg' : h.cause}</td><td>{h.turns}</td><td>{h.date}</td></tr>)}</tbody></table>
        )}
        <p className="vl-note">* mit Zauberwort-Hilfe</p>
      </div>
    );
  } else if (view === 'bestiary') {
    body = (
      <div className="vl-sub">
        <header><button onClick={back}>← Menü</button><h2>Bestiarium</h2></header>
        <div className="vl-beasts">{MONSTERS.map((m) => {
          const k = data.bestiary[m.id] ?? 0;
          return (
            <div key={m.id} className={k ? 'known' : ''}>
              <b style={{ color: S.theme === 'farbe' && k ? m.color : undefined }}>{k ? m.glyph : '?'}</b>
              <span>{k ? m.name : 'Unbekannt'}</span>
              {k ? <small>{m.hp} LP · Schaden {m.atk[0]}–{m.atk[1]} · Ebene {m.minD}–{m.maxD}{m.flags.length ? ' · ' + m.flags.map((f) => FLAG_TEXT[f]).join(', ') : ''}<br />{k}× besiegt</small> : <small>Erscheint ab Ebene {m.minD}. Besiege eines, um es zu kennen.</small>}
            </div>
          );
        })}</div>
      </div>
    );
  } else if (view === 'stats') {
    const st = data.stats;
    body = (
      <div className="vl-sub">
        <header><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="vl-statgrid">
          <div><b>{st.runs}</b><span>Läufe</span></div><div><b>{st.wins}</b><span>Siege</span></div><div><b>{st.deepest || '–'}</b><span>Tiefste Ebene</span></div>
          <div><b>{st.bestScore}</b><span>Beste Punktzahl</span></div><div><b>{st.kills}</b><span>Monster besiegt</span></div><div><b>{st.gold}</b><span>Gold gesammelt</span></div>
          <div><b>{st.turns}</b><span>Züge gesamt</span></div><div><b>{CLASSES.filter((c) => data.wins[c.id]).length}/3</b><span>Berufe gewonnen</span></div>
        </div>
      </div>
    );
  } else if (view === 'options') {
    body = (
      <div className="vl-sub">
        <header><button onClick={back}>← Menü</button><h2>Optionen</h2></header>
        <div className="vl-opts">
          <section><h3>Monitor</h3>
            <div className="vl-swatches">{THEMES_V.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`vl vl-th-${t.id} vl-sw`}>@·&gt;</span><span>{t.name}</span></button>)}</div>
          </section>
          <section><h3>Spiel</h3>
            <label className="vl-check"><input type="checkbox" checked={S.confirmStairs} onChange={(e) => setS({ confirmStairs: e.target.checked })} /> Nachfragen, bevor du das Verlies verlässt</label>
            <label className="vl-check"><input type="checkbox" checked={S.sound} onChange={(e) => setS({ sound: e.target.checked })} /> Geräusche</label>
            <h3>Daten</h3>
            <button className="danger" onClick={() => { if (confirm('Alle Verlies-Daten und den laufenden Lauf löschen?')) { clearRun(); upd((d) => { Object.assign(d, { ...VERLIES_INIT, settings: d.settings }); }); toast('Verlies-Daten gelöscht'); } }}>Verlies-Daten löschen …</button>
          </section>
        </div>
      </div>
    );
  } else if (view === 'manual') {
    body = (
      <div className="vl-sub vl-manual">
        <header><button onClick={back}>← Menü</button><h2>Handbuch</h2></header>
        <h3>Worum geht es?</h3>
        <p>Du steigst durch acht Ebenen eines zufällig erzeugten Verlieses hinab. Auf der letzten wartet ein Drache und das Zeitamulett. Jeder Lauf ist neu; stirbst du, ist alles vorbei – nur die Gedenktafel merkt sich dich.</p>
        <h3>Die drei Berufe</h3>
        {CLASSES.map((c) => <p key={c.id}><b>{c.name}:</b> {c.info}</p>)}
        <h3>Regeln im Überblick</h3>
        <ul>
          <li>Alles läuft in Runden: Jede Handlung kostet einen Zug, dann ziehen die Monster.</li>
          <li>Schlafende Monster erleiden doppelten Schaden, wenn du sie angreifst (Schurkin: dreifach).</li>
          <li>Mit jeder Charakterstufe wächst deine Lebenskraft. Magier regenerieren zusätzlich Mana.</li>
          <li>Fallen sind verborgen. Suchen (Z) deckt sie in der Nähe auf; bekannte Fallen meidet das Spiel.</li>
          <li>Tränke, Schriftrollen und Stäbe tragen in jedem Lauf andere Namen. Ausprobieren verrät den Inhalt – oder eine Gefahr.</li>
          <li>Truhen öffnest du, indem du hineinläufst. Das Amulett auf Ebene {MAX_DEPTH} beendet den Lauf mit einem Sieg.</li>
        </ul>
        <h3>Tipps</h3>
        <ul>
          <li>Kämpfe in Türen und Gängen, nicht im offenen Raum.</li>
          <li>Heiltränke sind der beste Notausgang – trinke sie früh genug.</li>
          <li>Der Magier-Adept schießt aus der Ferne: Geh um die Ecke und lass ihn zu dir kommen.</li>
          <li>Der Tageslauf ist für alle gleich: gleiche Ebenen, gleiche Namen der Tränke.</li>
        </ul>
      </div>
    );
  } else {
    const hasSave = !!saved;
    body = (
      <div className="vl-menu">
        <section className="vl-new">
          <pre className="vl-art" aria-hidden>{`#########  ####################
#.......#  #..................#
#..@....+##+...r...!.....D....#
#.......#  #..................#
####+####  ####+################
   #...#      #....#   (Ebene 8)
   #.>.#      #..$.#
   #####      ######`}</pre>
          <div className="vl-setup">
            <h2>Neuer Lauf</h2>
            <div className="vl-classes">
              {CLASSES.map((c) => (
                <button key={c.id} className={S.cls === c.id ? 'on' : ''} onClick={() => setS({ cls: c.id })}>
                  <b>{c.name}{data.wins[c.id] ? ' ★' : ''}</b>
                  <small>{c.info}</small>
                  <span>LP {c.hp}{c.mp ? ` · Mana ${c.mp}` : ''}</span>
                </button>
              ))}
            </div>
            <label className="vl-seed"><span>Startwert (leer = Zufall)</span><input value={seedTxt} onChange={(e) => setSeedTxt(e.target.value)} placeholder="z. B. mein-lauf" maxLength={30} /></label>
            <div className="vl-btns">
              <button className="primary" onClick={startNew}>Hinab ins Verlies</button>
              <button onClick={startDaily}>{dailyDone('verlies', '') ? 'Tageslauf ✓' : 'Tageslauf'}</button>
              {hasSave && <button onClick={resume}>Lauf fortsetzen</button>}
            </div>
            {hasSave && saved && <p className="vl-note">Gespeichert: {CLASS[saved.s.p.cls]?.name}, Ebene {saved.s.depth}, Zug {saved.s.turn}.</p>}
            {(sec.xyzzy || sec.plugh || sec.nethack) && <p className="vl-note">Geheim aktiv: {[sec.xyzzy && 'XYZZY', sec.plugh && 'PLUGH', sec.nethack && 'Vorbild'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="vl-tiles">
          <button onClick={() => setView('manual')}><i>?</i><b>Handbuch</b><span>Regeln, Berufe, Tipps</span></button>
          <button onClick={() => setView('hall')}><i>†</i><b>Gedenktafel</b><span>{data.hall.length} Einträge · Bestwert {data.stats.bestScore}</span></button>
          <button onClick={() => setView('bestiary')}><i>r</i><b>Bestiarium</b><span>{Object.keys(data.bestiary).length} von {MONSTERS.length} Arten</span></button>
          <button onClick={() => setView('stats')}><i>#</i><b>Statistik</b><span>{data.stats.runs} Läufe · {data.stats.wins} Siege</span></button>
          <button onClick={() => setView('options')}><i>&gt;</i><b>Optionen</b><span>Monitor, Nachfragen</span></button>
        </section>
      </div>
    );
  }

  return (
    <div className={themeCls}>
      {top('Verlies', 'Ein Abstieg in acht Ebenen', view === 'menu' ? onExit : back, view === 'menu' ? 'Halle' : 'Menü')}
      {body}
    </div>
  );
}
