import { addAchievements, addSecrets } from '../shared/meta';
import type { Color, Move } from './engine';

export type Theme = 'honig' | 'schiefer';
export type ModeB = 'ki' | 'zwei';

export interface BSettings {
  theme: Theme;
  set: string;
  mode: ModeB;
  level: number;
  /** Seite des Menschen: 0 = Honig (beginnt), 1 = Nacht */
  side: Color;
  coach: boolean;
  sound: boolean;
}

export interface BStat { played: number; won: number; plies: number; best: number }
export interface BReplay { id: string; date: string; set: string; mode: string; level: number; side: Color; moves: Move[]; winner: Color | 'draw' | null; why: string }

export interface BData {
  settings: BSettings;
  stats: Record<string, BStat>;
  totals: { games: number; wins: number; beetles: number; jumps: number };
  coach: { best: number; good: number; bad: number };
  lessons: Record<string, boolean>;
  puzzles: { solved: number; streak: number; best: number };
  replays: BReplay[];
}

export const WABE_INIT: BData = {
  settings: { theme: 'honig', set: 'basis', mode: 'ki', level: 3, side: 0, coach: false, sound: true },
  stats: {}, totals: { games: 0, wins: 0, beetles: 0, jumps: 0 }, coach: { best: 0, good: 0, bad: 0 },
  lessons: {}, puzzles: { solved: 0, streak: 0, best: 0 }, replays: [],
};

export const THEMES_B: { id: Theme; name: string }[] = [{ id: 'honig', name: 'Honigwabe' }, { id: 'schiefer', name: 'Schiefer' }];

addAchievements([
  { game: 'wabe', key: 'first', name: 'Erste Wabe', desc: 'Eine Partie gegen die KI gewonnen.' },
  { game: 'wabe', key: 'waechterin', name: 'Wächterin', desc: 'Stufe 3 (Wächterin) besiegt.' },
  { game: 'wabe', key: 'koenigin', name: 'Die Königin', desc: 'Stufe 5 (Königin) besiegt.' },
  { game: 'wabe', key: 'plus', name: 'Voller Schwarm', desc: 'Mit Erweiterung gegen Stufe 3 gewonnen.' },
  { game: 'wabe', key: 'schnell', name: 'Blitzschlag', desc: 'In höchstens 10 eigenen Zügen gewonnen (Stufe 3+).' },
  { game: 'wabe', key: 'beide', name: 'Tag und Nacht', desc: 'Mit beiden Farben gegen Stufe 2 oder höher gewonnen.' },
  { game: 'wabe', key: 'ameise', name: 'Ameisenstraße', desc: 'Mit einer Ameise in einem Zug fünf oder mehr Felder (Luftlinie) weit gelaufen.' },
  { game: 'wabe', key: 'kaefer', name: 'Käferstapel', desc: 'Einen Käfer auf einen Stapel der Höhe 3 gesetzt.' },
  { game: 'wabe', key: 'sprung', name: 'Sprungweite', desc: 'Mit einem Grashüpfer über vier oder mehr Plättchen gesprungen.' },
  { game: 'wabe', key: 'coach', name: 'Imkerin', desc: 'Mit Coach mindestens 80 % beste Züge und gewonnen.' },
  { game: 'wabe', key: 'zwei', name: 'Am Stock', desc: 'Eine Partie zu zweit beendet.' },
  { game: 'wabe', key: 'remis', name: 'Patt im Stock', desc: 'Eine Partie endet remis.' },
  { game: 'wabe', key: 'lessons', name: 'Schwarmwissen', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'wabe', key: 'puzzle10', name: 'Rätselbiene', desc: '10 Aufgaben gelöst.' },
  { game: 'wabe', key: 'streak5', name: 'Fünf am Stück', desc: 'Fünf Aufgaben ohne Fehler in Folge.' },
  { game: 'wabe', key: 'daily', name: 'Tagestracht', desc: 'Die Tagesaufgabe gelöst.' },
]);
addSecrets([
  { id: 'wabe-honig', game: 'wabe', code: 'honig', title: 'Honigtopf', riddle: 'Das Süße, das Bienen sammeln.', effect: 'Der beste Zug wird in der nächsten Partie ständig eingeblendet (zählt nicht für Erfolge).' },
  { id: 'wabe-stachel', game: 'wabe', code: 'stachel', title: 'Stachel', riddle: 'Nur einmal kann eine Biene damit stechen.', effect: 'Du beginnst die nächste Partie mit einer zusätzlichen Ameise (zählt nicht für Erfolge).' },
  { id: 'wabe-schwarm', game: 'wabe', code: 'schwarm', title: 'Schwarmintelligenz', riddle: 'Viele kleine Tiere, ein gemeinsamer Wille.', effect: 'Die KI spielt in der nächsten Partie eine Stufe schwächer (zählt nicht für Erfolge).' },
]);
