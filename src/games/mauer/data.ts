import { addAchievements, addSecrets } from '../shared/meta';
import type { Move } from './engine';

export type Theme = 'blau' | 'papier';
export type ModeM = 'ki' | 'zwei';

export interface MSettings {
  theme: Theme;
  preset: string;
  mode: ModeM;
  level: number;
  /** 0 = unten (beginnt), 1 = oben */
  side: 0 | 1;
  /** vorgebaute Mauerpaare (0, 2, 4) */
  maze: 0 | 2 | 4;
  coach: boolean;
  paths: boolean;
  sound: boolean;
}

export interface MStat { played: number; won: number; plies: number; best: number }
export interface MReplay { id: string; date: string; n: number; walls: number; pre: Move[]; moves: Move[]; mode: string; level: number; side: 0 | 1; winner: 0 | 1 | null }

export interface MData {
  settings: MSettings;
  stats: Record<string, MStat>;
  totals: { games: number; wins: number; walls: number; jumps: number };
  coach: { best: number; good: number; bad: number };
  lessons: Record<string, boolean>;
  puzzles: { race: number; wall: number; streak: number; best: number };
  replays: MReplay[];
}

export const MAUER_INIT: MData = {
  settings: { theme: 'blau', preset: 'klassik', mode: 'ki', level: 3, side: 0, maze: 0, coach: false, paths: false, sound: true },
  stats: {}, totals: { games: 0, wins: 0, walls: 0, jumps: 0 }, coach: { best: 0, good: 0, bad: 0 },
  lessons: {}, puzzles: { race: 0, wall: 0, streak: 0, best: 0 }, replays: [],
};

export const THEMES_M: { id: Theme; name: string }[] = [{ id: 'blau', name: 'Blaupause' }, { id: 'papier', name: 'Zeichenpapier' }];

addAchievements([
  { game: 'mauer', key: 'first', name: 'Erster Bau', desc: 'Eine Partie gegen die KI gewonnen.' },
  { game: 'mauer', key: 'meister', name: 'Meisterprüfung', desc: 'Stufe 3 (Meister) besiegt.' },
  { game: 'mauer', key: 'architekt', name: 'Der Architekt', desc: 'Stufe 5 (Architekt) besiegt.' },
  { game: 'mauer', key: 'mini', name: 'Kleinbau', desc: 'Auf dem 5×5-Brett gegen Stufe 3 gewonnen.' },
  { game: 'mauer', key: 'gross', name: 'Großbaustelle', desc: 'Auf dem 11×11-Brett gegen Stufe 3 gewonnen.' },
  { game: 'mauer', key: 'laeufer', name: 'Läufer', desc: 'Gewonnen, ohne eine einzige Mauer zu setzen.' },
  { game: 'mauer', key: 'maurer', name: 'Maurer', desc: 'Gewonnen, nachdem alle eigenen Mauern verbaut waren.' },
  { game: 'mauer', key: 'springer', name: 'Hüpfer', desc: 'In einer Partie dreimal über den Gegner gesprungen.' },
  { game: 'mauer', key: 'aufholjagd', name: 'Aufholjagd', desc: 'Gewonnen, nachdem du vier Schritte zurücklagst.' },
  { game: 'mauer', key: 'labyrinth', name: 'Irrgarten', desc: 'Im Labyrinth-Start gegen Stufe 3 gewonnen.' },
  { game: 'mauer', key: 'coach', name: 'Mit Brief und Siegel', desc: 'Mit Coach mindestens 80 % beste Züge und gewonnen.' },
  { game: 'mauer', key: 'zwei', name: 'Zu zweit am Tisch', desc: 'Eine Partie zu zweit beendet.' },
  { game: 'mauer', key: 'lessons', name: 'Bauplan gelesen', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'mauer', key: 'puzzle10', name: 'Statiker', desc: '10 Aufgaben gelöst.' },
  { game: 'mauer', key: 'streak5', name: 'Fünf am Stück', desc: 'Fünf Aufgaben ohne Fehler in Folge.' },
  { game: 'mauer', key: 'daily', name: 'Tagesaufgabe', desc: 'Die Tagesaufgabe gelöst.' },
]);
addSecrets([
  { id: 'mauer-ariadne', game: 'mauer', code: 'ariadne', title: 'Ariadnefaden', riddle: 'Mit diesem Faden fand Theseus aus dem Labyrinth.', effect: 'Die kürzesten Wege beider Seiten werden eingezeichnet (zählt nicht für Erfolge).' },
  { id: 'mauer-daedalus', game: 'mauer', code: 'daedalus', title: 'Dädalus', riddle: 'Wer baute das Labyrinth von Kreta?', effect: 'Die nächste Partie beginnt mit vier vorgebauten Mauern.' },
  { id: 'mauer-minotaurus', game: 'mauer', code: 'minotaurus', title: 'Minotaurus', riddle: 'Das Wesen in der Mitte des Labyrinths.', effect: 'Der Gegner der nächsten Partie hat drei Mauern weniger (zählt nicht für Erfolge).' },
]);
