// Lokaler Speicher der Spielhalle (Schlüssel „gh.v1“): Einstellungen, Statistiken, Spielstände, Erfolge, Geheimnisse.
import { useSyncExternalStore } from 'react';
import { ACHIEVEMENTS } from './meta';
import { todayKey } from './rng';

export interface HallData {
  v: 1;
  /** Daten je Spiel (frei strukturiert, jedes Spiel besitzt seinen Schlüssel) */
  games: Record<string, unknown>;
  /** freigeschaltete Erfolge: „spiel:schlüssel“ → Zeitpunkt */
  ach: Record<string, number>;
  /** gefundene Geheimnisse (IDs) */
  secrets: string[];
  /** Spielzeit in Sekunden je Spiel */
  playtime: Record<string, number>;
  /** erledigte Tagesrätsel: Datum → Liste „spiel:variante“ */
  daily: Record<string, string[]>;
  sound: boolean;
  volume: number;
  reduceMotion: boolean;
  /** Entwicklermenü (Konami-Code) freigeschaltet */
  dev: boolean;
}

const KEY = 'gh.v1';
const fresh = (): HallData => ({ v: 1, games: {}, ach: {}, secrets: [], playtime: {}, daily: {}, sound: true, volume: 0.5, reduceMotion: false, dev: false });

function load(): HallData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as Partial<HallData>) };
  } catch { /* leer */ }
  return fresh();
}

let data: HallData = load();
const subs = new Set<() => void>();
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* voll */ }
}
/** Ändert den Speicher; `fn` darf direkt verändern (flache Kopie wird angelegt). */
export function hallUpdate(fn: (d: HallData) => void) {
  const next = { ...data, games: { ...data.games }, ach: { ...data.ach }, secrets: [...data.secrets], playtime: { ...data.playtime }, daily: { ...data.daily } };
  fn(next);
  data = next;
  persist();
  subs.forEach((s) => s());
}
export const hallData = () => data;
export function useHall(): HallData {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => data);
}
export function hallReset() {
  data = fresh();
  persist();
  subs.forEach((s) => s());
}
export function hallReplace(d: HallData) {
  data = { ...fresh(), ...d };
  persist();
  subs.forEach((s) => s());
}

// ───────── Daten je Spiel ─────────

/** Liest die Daten eines Spiels; fehlende Felder werden aus `init` ergänzt. */
export function gameData<T extends object>(id: string, init: T): T {
  const cur = (data.games[id] ?? {}) as Partial<T>;
  return { ...init, ...cur };
}
export function setGameData<T extends object>(id: string, fn: (d: T) => void, init: T) {
  hallUpdate((h) => {
    const cur = { ...init, ...((h.games[id] ?? {}) as Partial<T>) } as T;
    fn(cur);
    h.games[id] = cur;
  });
}
/** React-Hook: Daten eines Spiels + Änderungsfunktion. */
export function useGameData<T extends object>(id: string, init: T): [T, (fn: (d: T) => void) => void] {
  const h = useHall();
  const cur = { ...init, ...((h.games[id] ?? {}) as Partial<T>) } as T;
  return [cur, (fn) => setGameData<T>(id, fn, init)];
}

// ───────── Erfolge, Tagesrätsel, Spielzeit ─────────

export const toast = (msg: string) => window.dispatchEvent(new CustomEvent('hall-toast', { detail: msg }));

/** Schaltet einen Erfolg frei (nur beim ersten Mal; zeigt eine Meldung). */
export function achieve(game: string, key: string) {
  const id = `${game}:${key}`;
  if (data.ach[id]) return;
  hallUpdate((h) => { h.ach[id] = Date.now(); });
  const a = ACHIEVEMENTS.find((x) => x.game === game && x.key === key);
  toast(`Erfolg: ${a?.name ?? key}`);
}

export const dailyDone = (game: string, variant: string, d = todayKey()) => (data.daily[d] ?? []).includes(`${game}:${variant}`);
export function markDaily(game: string, variant: string) {
  const d = todayKey();
  if (dailyDone(game, variant, d)) return;
  hallUpdate((h) => { h.daily[d] = [...(h.daily[d] ?? []), `${game}:${variant}`]; });
}
/** Tage in Folge mit mindestens einem erledigten Tagesrätsel. */
export function dailyStreak(): number {
  let n = 0;
  const t = new Date();
  for (let i = 0; i < 400; i++) {
    const k = todayKey(t);
    if ((data.daily[k] ?? []).length) n++;
    else if (i > 0) break;
    t.setDate(t.getDate() - 1);
  }
  return n;
}
export function addPlaytime(game: string, secs: number) {
  if (secs <= 0) return;
  hallUpdate((h) => { h.playtime[game] = (h.playtime[game] ?? 0) + secs; });
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
export const fmtTimeMs = (ms: number) => {
  const s = ms / 1000, m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
};
