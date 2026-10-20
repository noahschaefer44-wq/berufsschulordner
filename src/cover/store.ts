// Speicher der Notizen-Ansicht (nur lokal im Browser, Schlüssel „nb.v1“).
import { FOLDERS, type Notebook } from './notes';

export interface NB extends Notebook { id: string; mod: number }
export interface NF { id: string; name: string; color: string; mod: number; books: NB[] }
export interface NState { folders: NF[]; paper: string }

export const PALETTE = ['#5b8def', '#f2a93b', '#e5604e', '#4fb07a', '#8c6bd6', '#7a8a99', '#3fb6c4', '#b5855a', '#d65fa0'];
const KEY = 'nb.v1';
export const uid = () => Math.random().toString(36).slice(2, 10);
export const today = () => new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

function seed(): NState {
  const t = Date.now();
  return {
    paper: 'Liniert',
    folders: FOLDERS.map((f, i) => ({ id: uid(), name: f.name, color: f.color, mod: t - i * 1000, books: f.books.map((b, j) => ({ ...b, id: uid(), mod: t - i * 1000 - j })) })),
  };
}

export function loadNotes(): NState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as NState;
      if (Array.isArray(s.folders)) return s;
    }
  } catch { /* leer */ }
  return seed();
}
export function saveNotes(s: NState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* voll */ }
}

/** Alle Hefte als Fließtext (für das Tipptraining). */
export function allNoteTexts(): { folder: string; title: string; body: string }[] {
  return loadNotes().folders.flatMap((f) => f.books.filter((b) => b.lines.join('').trim()).map((b) => ({ folder: f.name, title: b.title, body: b.lines.join('\n') })));
}
