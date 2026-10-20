import { addAchievements, addSecrets } from '../shared/meta';

export type Board = 'kaya' | 'bambus' | 'schiefer' | 'papier' | 'nacht';
export type StoneSet = 'schiefer-muschel' | 'glas' | 'tinte' | 'bunt';

export interface GSettings {
  board: Board;
  stones: StoneSet;
  coords: boolean;
  sound: boolean;
  confirm: boolean;
  showLast: boolean;
  showLibs: boolean;
  /** Letzte Partie-Einstellungen */
  size: number;
  level: number;
  color: 'schwarz' | 'weiss' | 'los';
  scoring: 'flaeche' | 'gebiet';
  komi: number;
  handicap: number;
  ko: 'einfach' | 'superko';
  opp: 'ki' | 'zwei';
  variant: 'normal' | 'atari' | 'torus';
}

export interface GStat { played: number; won: number; lost: number; streak: number; bestStreak: number }
export interface SavedGame { id: string; date: string; sgf: string; result: string; n: number; mode: string; level: number; moves: number }

export interface GData {
  settings: GSettings;
  /** Statistik je Schlüssel, z. B. "ki-9-3" */
  stats: Record<string, GStat>;
  games: SavedGame[];
  solved: Record<string, number>;
  lessons: Record<string, boolean>;
  problemStreak: number;
  bestProblemStreak: number;
  totals: { games: number; wins: number; captures: number; moves: number };
}

export const GO_INIT: GData = {
  settings: { board: 'kaya', stones: 'schiefer-muschel', coords: true, sound: true, confirm: false, showLast: true, showLibs: false, size: 9, level: 2, color: 'schwarz', scoring: 'gebiet', komi: 6.5, handicap: 0, ko: 'einfach', opp: 'ki', variant: 'normal' },
  stats: {}, games: [], solved: {}, lessons: {}, problemStreak: 0, bestProblemStreak: 0, totals: { games: 0, wins: 0, captures: 0, moves: 0 },
};

export const BOARDS: { id: Board; name: string }[] = [
  { id: 'kaya', name: 'Kaya-Holz' }, { id: 'bambus', name: 'Bambus' }, { id: 'schiefer', name: 'Schiefer' }, { id: 'papier', name: 'Papier' }, { id: 'nacht', name: 'Nacht' },
];
export const STONESETS: { id: StoneSet; name: string }[] = [
  { id: 'schiefer-muschel', name: 'Schiefer & Muschel' }, { id: 'glas', name: 'Glas' }, { id: 'tinte', name: 'Tinte' }, { id: 'bunt', name: 'Rot & Blau' },
];

export const SIZES = [5, 7, 9, 11, 13, 15, 19];

addAchievements([
  { game: 'go', key: 'first', name: 'Erster Stein', desc: 'Eine Partie beendet.' },
  { game: 'go', key: 'win', name: 'Erster Sieg', desc: 'Eine Partie gegen die KI gewonnen.' },
  { game: 'go', key: 'win13', name: 'Weites Brett', desc: 'Auf 13×13 oder größer gewonnen.' },
  { game: 'go', key: 'win19', name: 'Das große Brett', desc: 'Auf 19×19 gewonnen.' },
  { game: 'go', key: 'lv4', name: 'Fortgeschrittenen-Bezwinger', desc: 'Stufe 4 oder höher geschlagen.' },
  { game: 'go', key: 'lv6', name: 'Meister-Bezwinger', desc: 'Die stärkste Stufe geschlagen.' },
  { game: 'go', key: 'vorgabe', name: 'Mit Vorgabe', desc: 'Mit Vorgabesteinen gegen Schwarz gewonnen.' },
  { game: 'go', key: 'atari', name: 'Atari-Meister', desc: 'Atari-Go gewonnen.' },
  { game: 'go', key: 'torus', name: 'Rund um die Welt', desc: 'Eine Torus-Partie gewonnen.' },
  { game: 'go', key: 'lessons', name: 'Schüler', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'go', key: 'tsumego10', name: 'Zehn Aufgaben', desc: '10 Aufgaben gelöst.' },
  { game: 'go', key: 'tsumego50', name: 'Aufgabenmeister', desc: '50 Aufgaben gelöst.' },
  { game: 'go', key: 'streak5', name: 'Fünf in Folge', desc: '5 Aufgaben ohne Fehler hintereinander.' },
  { game: 'go', key: 'capture10', name: 'Sammler', desc: '10 Steine in einer Partie geschlagen.' },
  { game: 'go', key: 'daily', name: 'Tagesaufgabe', desc: 'Die Aufgabe des Tages gelöst.' },
  { game: 'go', key: 'sgf', name: 'Archivar', desc: 'Eine Partie als SGF gesichert oder geladen.' },
  { game: 'go', key: 'zwei', name: 'Am Brett zu zweit', desc: 'Eine Zwei-Spieler-Partie beendet.' },
  { game: 'go', key: 'ko', name: 'Ko-Kampf', desc: 'Ein Ko erlebt.' },
]);
addSecrets([
  { id: 'go-orakel', game: 'go', code: 'orakel', title: 'Orakel', riddle: 'Wer die Zukunft des Brettes sehen will, befragt eines – steht im Tempel von Delphi.', effect: 'Dauerhafte Gebietsschätzung auf dem Brett (zählt als Hilfe).' },
  { id: 'go-tengen', game: 'go', code: 'tengen', title: 'Tengen', riddle: 'Der Punkt des Himmels, genau in der Mitte.', effect: 'Schwarz bekommt einen Gratisstein auf dem Mittelpunkt (zählt als Hilfe).' },
  { id: 'go-nigiri', game: 'go', code: 'nigiri', title: 'Nigiri', riddle: 'Eine Handvoll Steine entscheidet, wer beginnt.', effect: 'Wirft die Farben aus: nächste Partie mit zufälliger Farbe.' },
]);
