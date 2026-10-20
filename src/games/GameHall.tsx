import { Suspense, lazy, useEffect, useRef, useState, type ComponentType } from 'react';
import '@fontsource/dm-serif-display';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/700.css';
import { BildCover, BlockCover, GoCover, KartenCover, LagerCover, MinenCover, SudokuCover } from './Covers';
import { ACHIEVEMENTS, GAMES, SECRETS } from './shared/meta';
import { dailyDone, dailyStreak, fmtTime, hallReplace, hallReset, toast, useHall, hallData, hallUpdate } from './shared/store';
import { sfx } from './shared/sfx';
import './hall.css';

export interface GameProps { onExit: () => void; daily?: boolean }

const LOADERS: Record<string, () => Promise<{ default: ComponentType<GameProps> }>> = {
  minen: () => import('./minen/MinenGame'),
  sudoku: () => import('./sudoku/SudokuGame'),
  bild: () => import('./bild/BildGame'),
  lager: () => import('./lager/LagerGame'),
  block: () => import('./block/BlockGame'),
  karten: () => import('./karten/KartenGame'),
};
const LAZY: Record<string, ComponentType<GameProps>> = Object.fromEntries(Object.entries(LOADERS).map(([k, f]) => [k, lazy(f)]));

const COVERS: Record<string, () => React.ReactElement> = { minen: MinenCover, sudoku: SudokuCover, bild: BildCover, lager: LagerCover, block: BlockCover, karten: KartenCover, go: GoCover };
const DAILY = ['minen', 'sudoku', 'bild', 'lager'];
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

type View = 'regal' | 'erfolge' | 'geheimnisse' | 'optionen';

export default function GameHall() {
  const h = useHall();
  const [view, setView] = useState<View>('regal');
  const [game, setGame] = useState<{ id: string; daily: boolean } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const kon = useRef(0);

  // Meldungen
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const msg = String((e as CustomEvent).detail);
      const id = ++n;
      setToasts((t) => [...t.slice(-2), { id, msg }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    };
    window.addEventListener('hall-toast', on);
    return () => window.removeEventListener('hall-toast', on);
  }, []);

  // Konami-Code → Entwicklermenü (alle Zauberwörter sichtbar)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const want = KONAMI[kon.current];
      if (e.key === want || e.key.toLowerCase() === want) {
        kon.current++;
        if (kon.current === KONAMI.length) {
          kon.current = 0;
          hallUpdate((d) => { d.dev = !d.dev; });
          sfx('secret');
          toast(hallData().dev ? 'Entwicklermenü an: Zauberwörter sichtbar' : 'Entwicklermenü aus');
        }
      } else kon.current = e.key === KONAMI[0] ? 1 : 0;
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const Game = game ? LAZY[game.id] : null;
  if (game && Game) {
    return (
      <div className="gh gh-playing">
        <Suspense fallback={<div className="gh-loading">Lade {GAMES.find((g) => g.id === game.id)?.name} …</div>}>
          <Game onExit={() => setGame(null)} daily={game.daily} />
        </Suspense>
        <Toasts items={toasts} />
      </div>
    );
  }

  const open = (id: string, daily = false) => { if (LAZY[id]) { sfx('tick'); setGame({ id, daily }); } else toast('Dieses Spiel ist noch nicht im Regal.'); };
  const streak = dailyStreak();
  const unlocked = Object.keys(h.ach).length;

  return (
    <div className="gh">
      <header className="gh-top">
        <div>
          <h1>Spielhalle</h1>
          <p>Sieben klassische Spiele – lokal gespeichert, kein Konto.</p>
        </div>
        <nav className="gh-tabs" aria-label="Bereiche">
          {([['regal', 'Regal'], ['erfolge', `Erfolge ${unlocked}/${Math.max(ACHIEVEMENTS.length, unlocked)}`], ['geheimnisse', 'Geheimnisse'], ['optionen', 'Optionen']] as [View, string][]).map(([v, l]) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>
          ))}
          <button className="gh-exit" onClick={() => window.dispatchEvent(new Event('chessty-lock'))}>Zu den Ordnern</button>
        </nav>
      </header>

      {view === 'regal' && (
        <main className="gh-main">
          <section className="gh-daily" aria-label="Tagesrätsel">
            <div><b>Tagesrätsel</b><span>{streak > 0 ? `${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge` : 'Für alle jeden Tag dasselbe'}</span></div>
            <div className="gh-daily-btns">
              {DAILY.filter((id) => LAZY[id]).map((id) => {
                const done = dailyDone(id, '') || (h.daily[new Date().toLocaleDateString('sv-SE')] ?? []).some((x) => x.startsWith(id + ':'));
                return <button key={id} className={done ? 'done' : ''} onClick={() => open(id, true)}>{GAMES.find((g) => g.id === id)?.name}{done ? ' ✓' : ''}</button>;
              })}
            </div>
          </section>
          <div className="gh-shelf">
            {GAMES.map((g) => {
              const Cover = COVERS[g.id];
              const t = h.playtime[g.id] ?? 0;
              const ready = !!LAZY[g.id];
              return (
                <button key={g.id} className={'gh-box' + (ready ? '' : ' soon')} onClick={() => open(g.id)} data-game={g.id}>
                  <span className="gh-cover"><Cover /></span>
                  <span className="gh-label"><b>{g.name}</b><small>{ready ? g.tagline : 'Kommt bald'}</small><em>{g.genre}{t > 60 ? ` · ${fmtTime(t)} gespielt` : ''}</em></span>
                </button>
              );
            })}
          </div>
        </main>
      )}

      {view === 'erfolge' && (
        <main className="gh-main gh-list">
          {GAMES.map((g) => {
            const list = ACHIEVEMENTS.filter((a) => a.game === g.id);
            if (!list.length) return null;
            return (
              <section key={g.id}>
                <h2>{g.name}</h2>
                <div className="gh-ach">
                  {list.map((a) => {
                    const t = h.ach[`${a.game}:${a.key}`];
                    return <div key={a.key} className={t ? 'on' : ''}><b>{t ? '★' : '☆'} {a.name}</b><small>{a.desc}</small>{t && <em>{new Date(t).toLocaleDateString('de-DE')}</em>}</div>;
                  })}
                </div>
              </section>
            );
          })}
        </main>
      )}

      {view === 'geheimnisse' && (
        <main className="gh-main gh-list">
          <p className="gh-note">In jedem Spiel stecken geheime Tastenfolgen. Tippe das Zauberwort mitten im Spiel – nicht in einem Textfeld. Gefundene Geheimnisse bleiben hier verzeichnet. {h.dev ? 'Entwicklermenü ist an: alle Zauberwörter sind sichtbar.' : 'Es gibt einen alten Code, der alles verrät …'}</p>
          <p className="gh-note">{h.secrets.length} von {SECRETS.length} gefunden.</p>
          {SECRETS.map((s) => {
            const found = h.secrets.includes(s.id);
            return (
              <div key={s.id} className={'gh-secret' + (found ? ' on' : '')}>
                <b>{found ? s.title : '???'} <small>{GAMES.find((g) => g.id === s.game)?.name}</small></b>
                <p>{found ? s.effect : s.riddle}</p>
                {(found || h.dev) && <code>{s.code}</code>}
              </div>
            );
          })}
        </main>
      )}

      {view === 'optionen' && (
        <main className="gh-main gh-list gh-opts">
          <label><span>Ton</span><input type="checkbox" checked={h.sound} onChange={(e) => hallUpdate((d) => { d.sound = e.target.checked; })} /></label>
          <label><span>Lautstärke</span><input type="range" min={0} max={1} step={0.05} value={h.volume} onChange={(e) => hallUpdate((d) => { d.volume = +e.target.value; })} onPointerUp={() => sfx('good')} /></label>
          <label><span>Weniger Bewegung</span><input type="checkbox" checked={h.reduceMotion} onChange={(e) => hallUpdate((d) => { d.reduceMotion = e.target.checked; })} /></label>
          <div className="gh-actions">
            <button onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(hallData())], { type: 'application/json' })); a.download = `spielhalle-${new Date().toLocaleDateString('sv-SE')}.json`; a.click(); }}>Alles sichern (Datei)</button>
            <label className="gh-file">Sicherung laden<input type="file" accept=".json,application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (j.v === 1 && confirm('Alle aktuellen Spieldaten ersetzen?')) { hallReplace(j); toast('Sicherung geladen'); } } catch { toast('Datei nicht lesbar'); } }} /></label>
            <button className="danger" onClick={() => { if (confirm('Wirklich ALLE Spielstände, Bestzeiten und Erfolge löschen?')) { hallReset(); toast('Alles zurückgesetzt'); } }}>Alles löschen</button>
          </div>
        </main>
      )}
      <Toasts items={toasts} />
    </div>
  );
}

function Toasts({ items }: { items: { id: number; msg: string }[] }) {
  return <div className="gh-toasts" aria-live="polite">{items.map((t) => <div key={t.id}>{t.msg}</div>)}</div>;
}
