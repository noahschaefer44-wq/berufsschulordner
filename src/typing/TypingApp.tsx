import { useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import '@fontsource/jetbrains-mono';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/900.css';
import Cards from './Cards';
import Dictation from './Dictation';
import Games from './Games';
import Lessons from './Lessons';
import Settings, { themeVars } from './Settings';
import Stats, { Ring } from './Stats';
import Texts from './Texts';
import Train, { Weak } from './Train';
import { buildLessons } from './layouts';
import { dayKey, levelOf, streak, useData, xpForLevel } from './store';
import './typing.css';
import './wiiu.css';
import './polish.css';
import './wiiu2.css';

type Page = 'start' | 'schule' | 'training' | 'spiele' | 'schwach' | 'texte' | 'karten' | 'diktat' | 'stats' | 'settings';
type Preset = 'sprint' | 'daily' | 'copy';

const ICONS: Record<Page | 'mehr', ReactNode> = {
  start: <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  schule: <><path d="M3 8.5 12 4l9 4.5-9 4.5z" /><path d="M7 11v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5" /></>,
  training: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  spiele: <><rect x="3" y="7" width="18" height="11" rx="5" /><path d="M8 10.5v4M6 12.5h4" /><circle cx="15.5" cy="11.5" r="1" /><circle cx="17.8" cy="13.8" r="1" /></>,
  schwach: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" /></>,
  texte: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  karten: <><rect x="3" y="8" width="14" height="10" rx="2" /><path d="M7 5h12a2 2 0 0 1 2 2v9" /></>,
  diktat: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  stats: <path d="M5 20V11M12 20V4M19 20v-6" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" /></>,
  mehr: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
};
function Icon({ n }: { n: Page | 'mehr' }) {
  return <svg viewBox="0 0 24 24" className="tp-ico" aria-hidden="true">{ICONS[n]}</svg>;
}

const NAV: { id: Page; name: string }[] = [
  { id: 'start', name: 'Start' },
  { id: 'schule', name: 'Schreibschule' },
  { id: 'training', name: 'Training' },
  { id: 'spiele', name: 'Spiele' },
  { id: 'schwach', name: 'Schwachstellen' },
  { id: 'texte', name: 'Eigene Texte' },
  { id: 'karten', name: 'Lernkarten' },
  { id: 'diktat', name: 'Diktat' },
  { id: 'stats', name: 'Statistik' },
  { id: 'settings', name: 'Einstellungen' },
];
const TABS: Page[] = ['start', 'schule', 'training', 'spiele'];

function Home({ go }: { go: (p: Page, preset?: Preset) => void }) {
  const d = useData();
  const lessons = buildLessons();
  const next = lessons.find((l) => !d.lessons[l.id]);
  const lv = levelOf(d.xp);
  const today = Math.round(((d.days[dayKey()] ?? 0) / 60) * 10) / 10;
  const due = d.decks.reduce((a, dk) => a + dk.cards.filter((c) => c.due <= Date.now()).length, 0);
  const tile = (p: Page, title: string, sub: string, preset?: Preset) => (
    <button className="tp-tile glass" onClick={() => go(p, preset)}>
      <span className="tp-tile-ico"><Icon n={p} /></span>
      <b>{title}</b><small>{sub}</small>
    </button>
  );
  return (
    <section>
      <h2>{new Date().getHours() < 11 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Hallo' : 'Guten Abend'}</h2>
      <p className="tp-sub">Schneller und sicherer schreiben – mit echten Texten, Rennen und Karteikarten. Alles bleibt in deinem Browser.</p>
      <div className="tp-hero glass">
        <div className="rings">
          <Ring value={today} max={d.settings.goalMin} label="Tagesziel" />
          <Ring value={d.xp - xpForLevel(lv)} max={xpForLevel(lv + 1) - xpForLevel(lv)} label={`Level ${lv}`} />
        </div>
        <div><small>Serie</small><b>{streak(d)} 🔥</b></div>
        <div><small>Letztes Tempo</small><b>{d.runs.slice(-1)[0]?.wpm ?? 0}</b></div>
        <div><small>Bestes Tempo</small><b>{Math.round(d.runs.reduce((acc, r) => Math.max(acc, r.wpm), 0))}</b></div>
        <div><small>Heute</small><b>{today} min</b></div>
        <div className="wide"><small>Noch {xpForLevel(lv + 1) - d.xp} XP bis Level {lv + 1} · Tagesziel {d.settings.goalMin} min</small></div>
      </div>
      <h3>Los geht’s</h3>
      <div className="tp-tiles">
        {tile('schule', next ? `Weiter: ${next.title}` : 'Schreibschule', `${Object.keys(d.lessons).length} von ${lessons.length} Stufen`)}
        {tile('training', 'Sprint', '15–120 Sekunden Tempo', 'sprint')}
        {tile('training', 'Abschreiben', 'Fließtext oben, du schreibst unten ab', 'copy')}
        {tile('training', 'Tagestext', 'Heute für alle derselbe Text', 'daily')}
        {tile('spiele', 'Spiele', `Grand Prix · ${d.wins} Siege`)}
        {tile('schwach', 'Schwachstellen', 'Texte passend zu deinen Fehlern')}
        {tile('karten', 'Lernkarten', due ? `${due} Karten fällig` : 'Nichts fällig')}
        {tile('diktat', 'Diktat', 'Hören und tippen')}
        {tile('stats', 'Statistik', 'Verlauf & Abzeichen')}
      </div>
    </section>
  );
}

export default function TypingApp() {
  const s = useData().settings;
  const [page, setPage] = useState<Page>('start');
  const [preset, setPreset] = useState<Preset | undefined>();
  const [more, setMore] = useState(false);
  const go = (p: Page, pr?: Preset) => { setPage(p); setPreset(pr); setMore(false); document.querySelector('.tp')?.scrollTo(0, 0); };

  // Glas-Glanz folgt dem Zeiger
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.glass');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <div className="tp" data-appearance={s.appearance} data-wall={s.wallpaper} style={themeVars(s) as CSSProperties} onPointerMove={onMove}>
      <div className="tp-wall-bg" aria-hidden="true" />
      <div className="tp-shell">
        <nav className="tp-side glass" aria-label="Hauptmenü">
          <div className="tp-brand"><b>Tipp</b><span>.</span></div>
          {NAV.map((n) => (
            <button key={n.id} className={n.id === page ? 'on' : ''} onClick={() => go(n.id)}><Icon n={n.id} />{n.name}</button>
          ))}
          <button className="tp-exit" onClick={() => window.dispatchEvent(new Event('chessty-lock'))}>Zu den Ordnern</button>
        </nav>
        <main className="tp-main" key={page + (preset ?? '')}>
          {page === 'start' && <Home go={go} />}
          {page === 'schule' && <Lessons />}
          {page === 'training' && <Train initial={preset} autoStart={preset === 'sprint' || preset === 'daily'} />}
          {page === 'spiele' && <Games />}
          {page === 'schwach' && <Weak />}
          {page === 'texte' && <Texts />}
          {page === 'karten' && <Cards />}
          {page === 'diktat' && <Dictation />}
          {page === 'stats' && <Stats />}
          {page === 'settings' && <Settings />}
        </main>
      </div>

      <nav className="tp-tabbar glass" aria-label="Tab-Leiste">
        {TABS.map((id) => <button key={id} className={id === page ? 'on' : ''} onClick={() => go(id)}><Icon n={id} /><span>{NAV.find((n) => n.id === id)!.name.replace('Schreibschule', 'Schule')}</span></button>)}
        <button className={more ? 'on' : ''} onClick={() => setMore((m) => !m)}><Icon n="mehr" /><span>Mehr</span></button>
      </nav>
      {more && (
        <div className="tp-sheet-bg" onClick={() => setMore(false)}>
          <div className="tp-sheet glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mehr">
            {NAV.filter((n) => !TABS.includes(n.id) && n.id !== 'start').map((n) => <button key={n.id} onClick={() => go(n.id)}><Icon n={n.id} />{n.name}</button>)}
            <button onClick={() => window.dispatchEvent(new Event('chessty-lock'))}>Zu den Ordnern</button>
          </div>
        </div>
      )}
    </div>
  );
}
