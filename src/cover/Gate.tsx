import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import Cover from './Cover';

const TypingApp = lazy(() => import('../typing/TypingApp'));
const GameHall = lazy(() => import('../games/GameHall'));

/**
 * Zeigt zuerst die Tarn-Ansicht (Notizen). Zwei geheime Wege hinaus:
 *  – Einstellungen → „Ton“ ausschalten öffnet Chessty,
 *  – Einstellungen → fünfmal schnell auf „Version“ tippen öffnet das Tipptraining,
 *  – Einstellungen → dreimal schnell auf „Speicher“ tippen öffnet die Spielhalle.
 * Die Freischaltung lebt nur im Arbeitsspeicher: Nach jedem Neuladen (oder zweimal Esc / „Zu den Ordnern“) erscheint wieder die Notizen-Ansicht.
 */
export default function Gate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'cover' | 'chess' | 'type' | 'games'>('cover');
  const lastEsc = useRef(0);
  useEffect(() => {
    const lock = () => setMode('cover');
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const now = Date.now();
      if (now - lastEsc.current < 600) lock();
      lastEsc.current = now;
    };
    window.addEventListener('chessty-lock', lock);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('chessty-lock', lock);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  if (mode === 'chess') return <>{children}</>;
  if (mode === 'games') return <Suspense fallback={null}><GameHall /></Suspense>;
  if (mode === 'type') return <Suspense fallback={null}><TypingApp /></Suspense>;
  return <Cover onUnlock={() => setMode('chess')} onUnlockType={() => setMode('type')} onUnlockGames={() => setMode('games')} />;
}
