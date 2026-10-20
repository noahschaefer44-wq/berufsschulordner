import { useState, type CSSProperties } from 'react';
import '@fontsource/jetbrains-mono';
import Arcade from './Arcade';
import Cards from './Cards';
import Dictation from './Dictation';
import Lessons from './Lessons';
import Settings, { themeVars } from './Settings';
import Stats, { Progress } from './Stats';
import Texts from './Texts';
import Train, { Weak } from './Train';
import { buildLessons, layoutById } from './layouts';
import { dayKey, levelOf, streak, useData, xpForLevel } from './store';
import './typing.css';

type Page = 'start' | 'schule' | 'training' | 'schwach' | 'texte' | 'karten' | 'arcade' | 'diktat' | 'stats' | 'settings';
const NAV: { id: Page; name: string; icon: string }[] = [
  { id: 'start', name: 'Start', icon: '⌂' },
  { id: 'schule', name: 'Schreibschule', icon: '✎' },
  { id: 'training', name: 'Training', icon: '⚡' },
  { id: 'schwach', name: 'Schwachstellen', icon: '◎' },
  { id: 'texte', name: 'Eigene Texte', icon: '¶' },
  { id: 'karten', name: 'Lernkarten', icon: '▤' },
  { id: 'arcade', name: 'Arcade', icon: '▼' },
  { id: 'diktat', name: 'Diktat', icon: '♪' },
  { id: 'stats', name: 'Statistik', icon: '▥' },
  { id: 'settings', name: 'Einstellungen', icon: '⚙' },
];

function Home({ go }: { go: (p: Page, preset?: 'sprint' | 'daily' | 'race') => void }) {
  const d = useData();
  const lessons = buildLessons(layoutById(d.settings.layout));
  const next = lessons.find((l) => !d.lessons[l.id]);
  const lv = levelOf(d.xp);
  const today = Math.round(((d.days[dayKey()] ?? 0) / 60) * 10) / 10;
  const due = d.decks.reduce((a, dk) => a + dk.cards.filter((c) => c.due <= Date.now()).length, 0);
  return (
    <section>
      <h2>Tipptraining</h2>
      <p className="tp-sub">Lernen, Tempo aufbauen, Spaß haben – alles ohne Anmeldung, nur in deinem Browser.</p>
      <div className="tp-cards">
        <div><b>Level {lv}</b><small>{d.xp} XP</small></div>
        <div><b>{streak(d)} 🔥</b><small>Tage in Folge</small></div>
        <div><b>{d.runs.slice(-1)[0]?.wpm ?? 0}</b><small>letztes WPM</small></div>
        <div><b>{Math.round(d.runs.reduce((a, r) => Math.max(a, r.wpm), 0))}</b><small>bestes WPM</small></div>
      </div>
      <Progress value={d.xp - xpForLevel(lv)} max={xpForLevel(lv + 1) - xpForLevel(lv)} />
      <p className="tp-sub">Tagesziel: {today} / {d.settings.goalMin} min</p>
      <Progress value={today} max={d.settings.goalMin} />

      <h3>Los geht’s</h3>
      <div className="tp-tiles">
        <button onClick={() => go('schule')}><b>{next ? `Weiter: ${next.title}` : 'Schreibschule wiederholen'}</b><small>{d.lessons[lessons[0].id] ? `${Object.keys(d.lessons).length} von ${lessons.length} Lektionen` : 'Neu hier? Hier anfangen.'}</small></button>
        <button onClick={() => go('training', 'sprint')}><b>Sprint</b><small>15–120 Sekunden Tempo</small></button>
        <button onClick={() => go('training', 'daily')}><b>Tagestext</b><small>Heute für alle derselbe Text</small></button>
        <button onClick={() => go('training', 'race')}><b>Rennen</b><small>Gegen Bots und deinen Geist</small></button>
        <button onClick={() => go('schwach')}><b>Schwachstellen</b><small>Übungen aus deinen Fehlern</small></button>
        <button onClick={() => go('karten')}><b>Lernkarten</b><small>{due ? `${due} Karten fällig` : 'Nichts fällig'}</small></button>
        <button onClick={() => go('arcade')}><b>Arcade</b><small>Fallende Wörter, Bestwert {d.arcade}</small></button>
        <button onClick={() => go('diktat')}><b>Diktat</b><small>Hören und tippen</small></button>
      </div>
    </section>
  );
}

export default function TypingApp() {
  const s = useData().settings;
  const [page, setPage] = useState<Page>('start');
  const [preset, setPreset] = useState<'sprint' | 'daily' | 'race' | undefined>();
  const [menu, setMenu] = useState(false);
  const go = (p: Page, pr?: 'sprint' | 'daily' | 'race') => { setPage(p); setPreset(pr); setMenu(false); window.scrollTo(0, 0); };

  return (
    <div className="tp" style={themeVars(s) as CSSProperties}>
      <header className="tp-top">
        <button className="tp-burger" aria-label="Menü" onClick={() => setMenu((m) => !m)}>☰</button>
        <b className="tp-logo">Tipp<span>.</span></b>
        <button className="tp-link" onClick={() => window.dispatchEvent(new Event('chessty-lock'))}>Zu den Ordnern</button>
      </header>
      <div className="tp-layout">
        <nav className={'tp-nav' + (menu ? ' open' : '')} aria-label="Hauptmenü">
          {NAV.map((n) => (
            <button key={n.id} className={n.id === page ? 'on' : ''} onClick={() => go(n.id)}><span>{n.icon}</span>{n.name}</button>
          ))}
        </nav>
        <main className="tp-main" key={page + (preset ?? '')}>
          {page === 'start' && <Home go={go} />}
          {page === 'schule' && <Lessons />}
          {page === 'training' && <Train initial={preset} autoStart={preset !== undefined} />}
          {page === 'schwach' && <Weak />}
          {page === 'texte' && <Texts />}
          {page === 'karten' && <Cards />}
          {page === 'arcade' && <Arcade />}
          {page === 'diktat' && <Dictation />}
          {page === 'stats' && <Stats />}
          {page === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}
