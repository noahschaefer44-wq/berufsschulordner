import { useEffect, useRef } from 'react';
import { SECRETS } from './meta';
import { sfx } from './sfx';
import { addPlaytime, hallUpdate, hallData, toast } from './store';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
};

/**
 * Geheime Tastenfolgen: Tippe das Zauberwort irgendwo im Spiel (nicht in Textfeldern).
 * `handlers`: Geheimnis-ID → Wirkung. Beim ersten Mal wird das Geheimnis in der Halle vermerkt.
 */
export function useSecrets(game: string, handlers: Record<string, () => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    let buf = '';
    const mine = SECRETS.filter((s) => s.game === game);
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-24);
      for (const s of mine) {
        if (buf.endsWith(s.code)) {
          buf = '';
          const fn = ref.current[s.id];
          if (!fn) continue;
          fn();
          if (!hallData().secrets.includes(s.id)) {
            hallUpdate((h) => { h.secrets = [...h.secrets, s.id]; });
            sfx('secret');
            toast(`Geheimnis gefunden: ${s.title}`);
          } else toast(`${s.title}`);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);
}

/** Zählt die Zeit, in der das Spiel offen ist und der Tab sichtbar ist (für die Statistik der Halle). */
export function usePlaytime(game: string) {
  useEffect(() => {
    let acc = 0;
    const id = setInterval(() => { if (!document.hidden) acc += 5; if (acc >= 30) { addPlaytime(game, acc); acc = 0; } }, 5000);
    return () => { clearInterval(id); addPlaytime(game, acc); };
  }, [game]);
}

/** Tastendruck-Hilfe: ruft `fn` für Tasten auf, außer wenn in einem Textfeld getippt wird. */
export function useKeys(fn: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (!isTyping(e.target)) ref.current(e); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Sekundentakt-Zeitgeber, der pausiert, solange `running` falsch ist. */
export function useTicker(running: boolean, onTick: (dtMs: number) => void, ms = 250) {
  const ref = useRef(onTick);
  ref.current = onTick;
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      ref.current(now - last);
      last = now;
    }, ms);
    return () => clearInterval(id);
  }, [running, ms]);
}

/** Gedrückt-halten-Hilfe (Langer Druck auf Touchgeräten). */
export function useLongPress(onLong: () => void, ms = 380) {
  const t = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  return {
    start: () => { fired.current = false; t.current = window.setTimeout(() => { fired.current = true; onLong(); }, ms); },
    cancel: () => window.clearTimeout(t.current),
    wasLong: () => fired.current,
  };
}
