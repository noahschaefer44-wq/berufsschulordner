import { addAchievements, addSecrets } from '../shared/meta';
import type { Cfg, Method } from './engine';

export type CodeTheme = 'braun' | 'labor' | 'nacht' | 'bonbon';

export interface CSettings {
  theme: CodeTheme;
  symbols: boolean;
  sound: boolean;
  /** Anzahl möglicher Codes anzeigen (Hilfe) */
  showLeft: boolean;
  manual: boolean;
  confirm: boolean;
  mode: 'knacken' | 'verstecken' | 'duell' | 'raetsel';
  preset: string;
  level: number;
  custom: Cfg;
  useCustom: boolean;
}

export interface CStat { played: number; won: number; guesses: number; best: number; dist: number[] }
export interface CData {
  settings: CSettings;
  stats: Record<string, CStat>;
  puzzles: { solved: number; streak: number; best: number };
  referee: { right: number; wrong: number };
  duel: { played: number; won: number };
  ratings: { sum: number; n: number };
  lessons: Record<string, boolean>;
  totals: { games: number; wins: number };
  dailyKnack: string;
}

export const CODE_INIT: CData = {
  settings: { theme: 'braun', symbols: true, sound: true, showLeft: false, manual: false, confirm: false, mode: 'knacken', preset: 'klassisch', level: 3, custom: { pegs: 4, colors: 6, dup: true, rows: 10 }, useCustom: false },
  stats: {}, puzzles: { solved: 0, streak: 0, best: 0 }, referee: { right: 0, wrong: 0 }, duel: { played: 0, won: 0 }, ratings: { sum: 0, n: 0 }, lessons: {}, totals: { games: 0, wins: 0 }, dailyKnack: '',
};

export const THEMES_C: { id: CodeTheme; name: string }[] = [{ id: 'braun', name: 'Braun (hell)' }, { id: 'labor', name: 'Labor (grün-grau)' }, { id: 'nacht', name: 'Nacht' }, { id: 'bonbon', name: 'Bonbon' }];

export const LEVELS_C: { id: number; name: string; method: Method; info: string }[] = [
  { id: 1, name: 'Zufällig', method: 'zufall', info: 'Rät irgendeinen Code, der noch möglich ist.' },
  { id: 2, name: 'Systematisch', method: 'erster', info: 'Probiert die Möglichkeiten der Reihe nach durch.' },
  { id: 3, name: 'Informiert', method: 'entropie', info: 'Wählt den Versuch mit dem größten Informationsgewinn.' },
  { id: 4, name: 'Optimal', method: 'minimax', info: 'Minimiert den schlimmsten Fall (Knuth-Verfahren).' },
];

export const PALETTE = [
  { name: 'Rot', c1: '#ff7a6b', c2: '#c4271a', sym: '▲' },
  { name: 'Gelb', c1: '#ffe27a', c2: '#d19a0e', sym: '■' },
  { name: 'Grün', c1: '#7fdc8c', c2: '#1f8a3a', sym: '●' },
  { name: 'Blau', c1: '#7fb0ff', c2: '#1f55c4', sym: '◆' },
  { name: 'Violett', c1: '#c79bff', c2: '#6a35b8', sym: '★' },
  { name: 'Türkis', c1: '#7ff0e6', c2: '#0f8f88', sym: '✚' },
  { name: 'Pink', c1: '#ffa6cf', c2: '#c23a80', sym: '♥' },
  { name: 'Braun', c1: '#d9a46b', c2: '#7a4a1c', sym: '⬢' },
  { name: 'Grau', c1: '#cfd5dd', c2: '#59626f', sym: '☗' },
  { name: 'Weiß', c1: '#ffffff', c2: '#b5b0a0', sym: '○' },
];

addAchievements([
  { game: 'code', key: 'first', name: 'Erster Code', desc: 'Einen Code geknackt.' },
  { game: 'code', key: 'fast4', name: 'Blitzknacker', desc: 'Einen klassischen Code in höchstens 4 Versuchen geknackt.' },
  { game: 'code', key: 'fast3', name: 'Ahnung oder Glück', desc: 'Einen klassischen Code in 3 oder weniger Versuchen geknackt.' },
  { game: 'code', key: 'super', name: 'Super-Knacker', desc: 'Einen Super-Code (5 Stifte, 8 Farben) geknackt.' },
  { game: 'code', key: 'mega', name: 'Mega-Knacker', desc: 'Einen Mega-Code geknackt.' },
  { game: 'code', key: 'bullen', name: 'Bullen & Kühe', desc: 'Eine Zifferrunde geknackt.' },
  { game: 'code', key: 'schwarz', name: 'Nur Schwarz', desc: 'Einen Nur-Schwarz-Code geknackt.' },
  { game: 'code', key: 'hide', name: 'Versteckspiel', desc: 'Die KI-Stufe „Optimal“ hat deinen Code erst im 6. Versuch oder später gefunden.' },
  { game: 'code', key: 'referee', name: 'Schiedsrichter', desc: '20 Auswertungen manuell richtig vergeben.' },
  { game: 'code', key: 'duel', name: 'Duell gewonnen', desc: 'Ein Duell gegen die KI gewonnen.' },
  { game: 'code', key: 'puzzle10', name: 'Zehn Rätsel', desc: '10 Rätsel gelöst.' },
  { game: 'code', key: 'puzzle5s', name: 'Rätselserie', desc: '5 Rätsel in Folge gelöst.' },
  { game: 'code', key: 'perfect', name: 'Perfekte Züge', desc: 'Ein Spiel mit durchschnittlicher Zugqualität von 90 % beendet.' },
  { game: 'code', key: 'daily', name: 'Tagescode', desc: 'Den Tagescode geknackt.' },
  { game: 'code', key: 'lessons', name: 'Schüler', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'code', key: 'ten', name: 'Zehn Siege', desc: '10 Codes geknackt.' },
]);
addSecrets([
  { id: 'code-enigma', game: 'code', code: 'enigma', title: 'Enigma', riddle: 'Die berühmte Chiffriermaschine, die Alan Turing knackte.', effect: 'Zeigt den geheimen Code in der Kopfzeile (zählt als Hilfe).' },
  { id: 'code-turing', game: 'code', code: 'turing', title: 'Turing', riddle: 'Wer hat den Code der Enigma geknackt?', effect: 'Ein Knopf lässt den Löser deinen nächsten Versuch spielen (zählt als Hilfe).' },
  { id: 'code-bletchley', game: 'code', code: 'bletchley', title: 'Bletchley Park', riddle: 'Hier saßen die britischen Codeknacker im Zweiten Weltkrieg.', effect: 'Zeigt immer die Zahl der noch möglichen Codes (zählt als Hilfe).' },
]);
