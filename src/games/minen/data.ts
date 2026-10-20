import { addAchievements, addSecrets } from '../shared/meta';
import type { Cfg } from './engine';
import type { Skin } from './MineCanvas';

export type Mode = 'klassisch' | 'zen' | 'leben' | 'ohneflaggen' | 'training' | 'tagesfeld';

export interface MSettings {
  skin: Skin;
  zoom: number;
  question: boolean;
  noGuess: boolean;
  opening: boolean;
  chordClick: boolean;
  touchMode: 'dig' | 'flag';
  cfg: Cfg;
  presetId: string;
  mode: Mode;
}

/** Aufgezeichnete Partie: Minenlage + Ereignisse (Zeit in ms, Art, Zelle). */
export interface Replay {
  id: string;
  date: number;
  cfg: Cfg;
  mines: number[];
  ev: [number, number, number][];
  time: number;
  won: boolean;
  bbbv: number;
  mode: Mode;
}

export interface Stat { played: number; won: number; streak: number }
export interface MinenData {
  settings: MSettings;
  best: Record<string, number[]>;
  stats: Record<string, Stat>;
  replays: Replay[];
  lessons: Record<string, boolean>;
  totals: { games: number; wins: number; streak: number; bestStreak: number; flagless: number };
}

export const MINEN_INIT: MinenData = {
  settings: { skin: 'win98', zoom: 26, question: false, noGuess: true, opening: true, chordClick: true, touchMode: 'dig', cfg: { topo: 'quad', w: 9, h: 9, mines: 10 }, presetId: 'anf', mode: 'klassisch' },
  best: {}, stats: {}, replays: [], lessons: {},
  totals: { games: 0, wins: 0, streak: 0, bestStreak: 0, flagless: 0 },
};

export const cfgKey = (c: Cfg, mode: Mode, noGuess: boolean) => `${c.topo}-${c.w}x${c.h}-${c.mines}${noGuess ? '-ng' : ''}${mode === 'ohneflaggen' ? '-nf' : ''}`;
export const cfgLabel = (c: Cfg, noGuess: boolean) => {
  const t = { quad: 'Quadrat', hex: 'Sechseck', torus: 'Torus', cross: 'Kreuz' }[c.topo];
  return `${t} ${c.w}×${c.h}, ${c.mines} Minen${noGuess ? ', ohne Raten' : ''}`;
};

export const MODE_INFO: Record<Mode, { name: string; info: string }> = {
  klassisch: { name: 'Klassisch', info: 'Das bekannte Spiel mit Zeitmessung und Bestzeiten.' },
  zen: { name: 'Zen', info: 'Keine Uhr, kein Druck. Nur Denken.' },
  leben: { name: 'Drei Leben', info: 'Du darfst dreimal eine Mine auslösen. Die Mine wird dann automatisch markiert.' },
  ohneflaggen: { name: 'Ohne Flaggen', info: 'Flaggen sind gesperrt – du musst dir die Minen merken.' },
  training: { name: 'Training', info: 'Hinweise, Rückgängig und Wahrscheinlichkeiten ohne Wertung.' },
  tagesfeld: { name: 'Tagesfeld', info: 'Heute für alle dasselbe Feld. Die Mitte ist schon geöffnet.' },
};

addAchievements([
  { game: 'minen', key: 'first', name: 'Erster Sieg', desc: 'Ein Feld gewonnen.' },
  { game: 'minen', key: 'anf60', name: 'Flinke Finger', desc: 'Anfänger in unter 60 Sekunden.' },
  { game: 'minen', key: 'anf20', name: 'Blitzräumer', desc: 'Anfänger in unter 20 Sekunden.' },
  { game: 'minen', key: 'fort150', name: 'Fortgeschrittener Räumer', desc: 'Fortgeschritten in unter 150 Sekunden.' },
  { game: 'minen', key: 'experte', name: 'Minenräumer', desc: 'Experten-Feld gewonnen.' },
  { game: 'minen', key: 'expert_ng', name: 'Kein Glück nötig', desc: 'Experten-Feld ohne Raten gewonnen.' },
  { game: 'minen', key: 'flagless', name: 'Ohne Flagge', desc: 'Gewonnen, ohne eine Flagge zu setzen.' },
  { game: 'minen', key: 'streak5', name: 'Serie', desc: 'Fünf Siege in Folge.' },
  { game: 'minen', key: 'hex', name: 'Bienenwabe', desc: 'Sechseck-Feld gewonnen.' },
  { game: 'minen', key: 'torus', name: 'Rund um die Welt', desc: 'Torus-Feld gewonnen.' },
  { game: 'minen', key: 'speed3', name: 'Schnelle Hände', desc: '3 oder mehr 3BV pro Sekunde.' },
  { game: 'minen', key: 'lessons', name: 'Lehrling', desc: 'Alle Lernstationen gelöst.' },
  { game: 'minen', key: 'daily', name: 'Tagesräumer', desc: 'Das Tagesfeld gelöst.' },
  { game: 'minen', key: 'lives', name: 'Mit Glück und Verstand', desc: 'Drei-Leben-Modus gewonnen.' },
]);
addSecrets([
  { id: 'minen-xyzzy', game: 'minen', code: 'xyzzy', title: 'Röntgenpixel', riddle: 'Ein Zauberwort aus einem uralten Textabenteuer – tippe es im Minenfeld, dann beobachte die linke obere Fensterecke.', effect: 'Ein Pixel in der Fensterecke zeigt, ob die Zelle unter dem Zeiger eine Mine ist (hell = sicher, dunkel = Mine). Zählt nicht für Bestzeiten.' },
  { id: 'minen-plugh', game: 'minen', code: 'plugh', title: 'Restzähler', riddle: 'Ein zweites Zauberwort desselben Abenteuers öffnet dir eine Zahl im Fenstertitel.', effect: 'Der Fenstertitel zeigt, wie viele sichere Felder noch fehlen.' },
  { id: 'minen-abra', game: 'minen', code: 'abrakadabra', title: 'Zauberhand', riddle: 'Ein Zauberer-Ruf, mehr als ein Wort lang, deckt dir auf, was du nicht sehen kannst.', effect: 'Deckt ein sicheres Feld auf (zählt als Hilfe).' },
]);
