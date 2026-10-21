import { addAchievements, addSecrets } from '../shared/meta';
import type { Mv, Side } from './engine';

export type Theme = 'nacht' | 'eis';
export type ModeW = 'ki' | 'zwei';

export interface WSettings {
  theme: Theme;
  variant: string;
  mode: ModeW;
  level: number;
  /** Seite des Menschen: 0 Angreifer, 1 Verteidiger */
  side: Side;
  coach: boolean;
  threats: boolean;
  sound: boolean;
}

export interface WStat { played: number; won: number; plies: number; best: number }
export interface WReplay { id: string; date: string; variant: string; mode: string; level: number; side: Side; moves: Mv[]; removed?: number[]; winner: Side | 'draw' | null; why: string }

export interface WData {
  settings: WSettings;
  stats: Record<string, WStat>;
  totals: { games: number; wins: number; captures: number; escapes: number };
  coach: { best: number; good: number; bad: number };
  lessons: Record<string, boolean>;
  puzzles: { solved: number; streak: number; best: number };
  replays: WReplay[];
}

export const WIK_INIT: WData = {
  settings: { theme: 'nacht', variant: 'brandubh', mode: 'ki', level: 3, side: 1, coach: false, threats: true, sound: true },
  stats: {}, totals: { games: 0, wins: 0, captures: 0, escapes: 0 }, coach: { best: 0, good: 0, bad: 0 },
  lessons: {}, puzzles: { solved: 0, streak: 0, best: 0 }, replays: [],
};

export const THEMES_W: { id: Theme; name: string }[] = [{ id: 'nacht', name: 'Nordlicht' }, { id: 'eis', name: 'Eisfjord' }];

addAchievements([
  { game: 'wikinger', key: 'first', name: 'Erster Raubzug', desc: 'Eine Partie gegen die KI gewonnen.' },
  { game: 'wikinger', key: 'jarl', name: 'Jarl', desc: 'Stufe 4 (Jarl) besiegt.' },
  { game: 'wikinger', key: 'odin', name: 'Odins Auserwählter', desc: 'Stufe 5 (Odin) besiegt.' },
  { game: 'wikinger', key: 'beide', name: 'Beide Seiten', desc: 'Als Angreifer und als Verteidiger gegen Stufe 2 oder höher gewonnen.' },
  { game: 'wikinger', key: 'tablut', name: 'Samische Kunst', desc: 'Tablut gegen Stufe 3 gewonnen.' },
  { game: 'wikinger', key: 'kopenhagen', name: 'Kopenhagener Schule', desc: 'Kopenhagen-Hnefatafl gegen Stufe 3 gewonnen.' },
  { game: 'wikinger', key: 'flucht', name: 'Flucht über das Eis', desc: 'Als Verteidiger gewonnen, ohne dass ein Verteidiger geschlagen wurde.' },
  { game: 'wikinger', key: 'schlag5', name: 'Fünf Mal Beute', desc: 'In einer Partie fünf Figuren geschlagen.' },
  { game: 'wikinger', key: 'koenigsfang', name: 'Königsfang', desc: 'Als Angreifer den König gefangen.' },
  { game: 'wikinger', key: 'blitz', name: 'Blitzkrieg', desc: 'In höchstens 12 eigenen Zügen gewonnen (Stufe 3+).' },
  { game: 'wikinger', key: 'coach', name: 'Skalde', desc: 'Mit Coach mindestens 80 % beste Züge und gewonnen.' },
  { game: 'wikinger', key: 'zwei', name: 'Am Langfeuer', desc: 'Eine Partie zu zweit beendet.' },
  { game: 'wikinger', key: 'lessons', name: 'Runenkundig', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'wikinger', key: 'puzzle10', name: 'Rätselmeister', desc: '10 Aufgaben gelöst.' },
  { game: 'wikinger', key: 'streak5', name: 'Fünf am Stück', desc: 'Fünf Aufgaben ohne Fehler in Folge.' },
  { game: 'wikinger', key: 'daily', name: 'Tagessaga', desc: 'Die Tagesaufgabe gelöst.' },
]);
addSecrets([
  { id: 'wikinger-odin', game: 'wikinger', code: 'odin', title: 'Odins Auge', riddle: 'Er gab ein Auge für Weisheit.', effect: 'Der beste Zug wird in der nächsten Partie ständig eingeblendet (zählt nicht für Erfolge).' },
  { id: 'wikinger-mjoelnir', game: 'wikinger', code: 'mjoelnir', title: 'Mjölnir', riddle: 'Der Hammer des Donnergottes.', effect: 'Die nächste Partie beginnt mit vier Angreifern weniger.' },
  { id: 'wikinger-ragnarok', game: 'wikinger', code: 'ragnarok', title: 'Ragnarök', riddle: 'Das Ende der Götterwelt.', effect: 'Die Bedrohungsanzeige ist dauerhaft an (zählt nicht für Erfolge).' },
]);
