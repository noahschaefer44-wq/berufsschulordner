// Spielstand des laufenden Laufs (getrennt von der Hallen-Datei, weil er groß werden kann).
import type { State } from './types';

const KEY = 'gh.verlies.run';
export interface SavedRun { s: State; daily: boolean; label: string; saved: number }

export function loadRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as SavedRun;
    if (!r || !r.s || r.s.v !== 1 || r.s.over) return null;
    return r;
  } catch { return null; }
}
export function saveRun(r: SavedRun) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* voll */ } }
export function clearRun() { try { localStorage.removeItem(KEY); } catch { /* egal */ } }
