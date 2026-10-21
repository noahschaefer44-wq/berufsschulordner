import { addAchievements, addSecrets } from '../shared/meta';
import type { Variant } from './engine';

export type BoardTheme = 'mahagoni' | 'kasino' | 'schiefer' | 'pergament';
export type CheckerSet = 'elfenbein' | 'rotweiss' | 'blaugold' | 'messing';

export interface MSettings {
  board: BoardTheme;
  checkers: CheckerSet;
  mirror: boolean;
  pipLabels: boolean;
  sound: boolean;
  autoRoll: boolean;
  confirmEnd: boolean;
  autoMove: boolean;
  coach: boolean;
  jacoby: boolean;
  /** Letzte Partie-Einstellungen */
  opp: 'ki' | 'zwei';
  level: number;
  variant: Variant;
  match: number;
  cube: boolean;
  color: 'weiss' | 'schwarz' | 'los';
}

export interface MStat { played: number; won: number; gammons: number; backgammons: number; points: number; streak: number; bestStreak: number }
export type RawMv = [number, number, number, 0 | 1];
export interface MLogEntry { p: 0 | 1; kind: 'zug' | 'doppeln' | 'annehmen' | 'passen'; dice?: [number, number]; moves?: string; mv?: RawMv[]; loss?: number }
export interface MSaved { id: string; date: string; result: string; mode: string; variant: Variant; entries: MLogEntry[] }

export interface MData {
  settings: MSettings;
  stats: Record<string, MStat>;
  saved: MSaved[];
  lessons: Record<string, boolean>;
  puzzlesSolved: number;
  puzzleStreak: number;
  bestPuzzleStreak: number;
  opening: Record<string, number>;
  coach: { turns: number; lossSum: number; blunders: number };
  totals: { games: number; wins: number; hits: number };
}

export const GAMMON_INIT: MData = {
  settings: { board: 'mahagoni', checkers: 'elfenbein', mirror: false, pipLabels: true, sound: true, autoRoll: false, confirmEnd: false, autoMove: true, coach: true, jacoby: false, opp: 'ki', level: 3, variant: 'standard', match: 3, cube: true, color: 'weiss' },
  stats: {}, saved: [], lessons: {}, puzzlesSolved: 0, puzzleStreak: 0, bestPuzzleStreak: 0, opening: {}, coach: { turns: 0, lossSum: 0, blunders: 0 }, totals: { games: 0, wins: 0, hits: 0 },
};

export const BOARD_THEMES: { id: BoardTheme; name: string }[] = [{ id: 'mahagoni', name: 'Mahagoni' }, { id: 'kasino', name: 'Kasino-Filz' }, { id: 'schiefer', name: 'Schiefer & Kupfer' }, { id: 'pergament', name: 'Pergament' }];
export const CHECKER_SETS: { id: CheckerSet; name: string }[] = [{ id: 'elfenbein', name: 'Elfenbein & Ebenholz' }, { id: 'rotweiss', name: 'Weiß & Rot' }, { id: 'blaugold', name: 'Blau & Gold' }, { id: 'messing', name: 'Messing & Kupfer' }];
export const VARIANTS: { id: Variant; name: string; info: string }[] = [
  { id: 'standard', name: 'Standard', info: '15 Steine, die klassische Aufstellung.' },
  { id: 'hyper', name: 'Hypergammon', info: 'Nur 3 Steine je Seite auf 24, 23, 22 – kurz und voller Treffer.' },
  { id: 'kurz', name: 'Kurzgammon', info: '10 Steine in verkleinerter Aufstellung für schnelle Partien.' },
  { id: 'rueckspiel', name: 'Dichtgedrängt', info: '15 Steine, vier davon auf dem hintersten Punkt – ein Rückspiel von Beginn an.' },
];

addAchievements([
  { game: 'gammon', key: 'first', name: 'Erste Partie', desc: 'Eine Partie beendet.' },
  { game: 'gammon', key: 'win', name: 'Erster Sieg', desc: 'Gegen die KI gewonnen.' },
  { game: 'gammon', key: 'gammon', name: 'Gammon!', desc: 'Ein Gammon erzielt.' },
  { game: 'gammon', key: 'backgammon', name: 'Backgammon!', desc: 'Ein Backgammon erzielt.' },
  { game: 'gammon', key: 'lv5', name: 'Gegen die Meisterin', desc: 'Stufe 5 oder höher besiegt.' },
  { game: 'gammon', key: 'match', name: 'Matchgewinner', desc: 'Ein Match über mindestens 3 Punkte gewonnen.' },
  { game: 'gammon', key: 'cube8', name: 'Hohes Spiel', desc: 'Eine Partie mit Würfelstand 8 oder mehr gewonnen.' },
  { game: 'gammon', key: 'hyper', name: 'Hyper', desc: 'Hypergammon gewonnen.' },
  { game: 'gammon', key: 'hits5', name: 'Treffsicher', desc: '5 Gegnersteine in einer Partie geschlagen.' },
  { game: 'gammon', key: 'doubles', name: 'Pasch-Serie', desc: 'Drei Pasche in einer Partie gewürfelt.' },
  { game: 'gammon', key: 'clean', name: 'Saubere Partie', desc: 'Eine Partie ohne Patzer laut Coach gewonnen.' },
  { game: 'gammon', key: 'lessons', name: 'Schüler', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'gammon', key: 'puzzle10', name: 'Zehn Rätsel', desc: '10 Zug-Rätsel gelöst.' },
  { game: 'gammon', key: 'puzzle5s', name: 'Fünf richtige', desc: '5 Rätsel in Folge gelöst.' },
  { game: 'gammon', key: 'book', name: 'Buchkenner', desc: 'Alle 21 Eröffnungen im Trainer richtig gespielt.' },
  { game: 'gammon', key: 'daily', name: 'Rätsel des Tages', desc: 'Das Tagesrätsel gelöst.' },
  { game: 'gammon', key: 'zwei', name: 'Am Brett zu zweit', desc: 'Eine Zwei-Spieler-Partie beendet.' },
]);
addSecrets([
  { id: 'gammon-wuerfel', game: 'gammon', code: 'wuerfel', title: 'Gezinkte Würfel', riddle: 'Wer die Zahlen selbst bestimmt, hat den Becher längst verloren – schreib das, was du in der Hand hältst.', effect: 'Beim Würfeln wählst du die Augen selbst (zählt als Hilfe).' },
  { id: 'gammon-glueck', game: 'gammon', code: 'glueck', title: 'Glückssträhne', riddle: 'Das Gegenteil von Pech.', effect: 'Deine nächsten drei Würfe sind Pasche (zählt als Hilfe).' },
  { id: 'gammon-pythia', game: 'gammon', code: 'pythia', title: 'Pythia', riddle: 'So hieß die Seherin im Tempel von Delphi.', effect: 'Zeigt dauerhaft die Siegchance und den besten Zug (zählt als Hilfe).' },
]);
