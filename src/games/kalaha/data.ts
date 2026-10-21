import { addAchievements, addSecrets } from '../shared/meta';
import type { Side, VariantId } from './engine';

export type Theme = 'sand' | 'nacht';
export type ModeK = 'ki' | 'zwei';

export interface KSettings {
  theme: Theme;
  variant: VariantId;
  pits: 4 | 5 | 6;
  seeds: 3 | 4 | 5 | 6;
  mode: ModeK;
  level: number;
  /** Seite des Menschen: 0 = unten (beginnt) */
  side: Side;
  coach: boolean;
  preview: boolean;
  fast: boolean;
  sound: boolean;
}

export interface KStat { played: number; won: number; seeds: number; best: number }
export interface KReplay { id: string; date: string; variant: VariantId; pits: number; seeds: number; start: number[]; moves: number[]; mode: string; level: number; side: Side; winner: Side | 'draw' | null; scores: [number, number] }

export interface KData {
  settings: KSettings;
  stats: Record<string, KStat>;
  totals: { games: number; wins: number; extras: number; captured: number };
  coach: { best: number; good: number; bad: number };
  lessons: Record<string, boolean>;
  puzzles: { solved: number; streak: number; best: number };
  replays: KReplay[];
}

export const KALAHA_INIT: KData = {
  settings: { theme: 'sand', variant: 'kalah', pits: 6, seeds: 4, mode: 'ki', level: 3, side: 0, coach: false, preview: true, fast: false, sound: true },
  stats: {}, totals: { games: 0, wins: 0, extras: 0, captured: 0 }, coach: { best: 0, good: 0, bad: 0 },
  lessons: {}, puzzles: { solved: 0, streak: 0, best: 0 }, replays: [],
};

export const THEMES_K: { id: Theme; name: string }[] = [{ id: 'sand', name: 'Wüstensand' }, { id: 'nacht', name: 'Oasennacht' }];

addAchievements([
  { game: 'kalaha', key: 'first', name: 'Erste Ernte', desc: 'Eine Partie gegen die KI gewonnen.' },
  { game: 'kalaha', key: 'karawane', name: 'Karawanenführer', desc: 'Stufe 3 besiegt.' },
  { game: 'kalaha', key: 'sultanin', name: 'Sultan der Mulden', desc: 'Stufe 5 (Sultanin) besiegt.' },
  { game: 'kalaha', key: 'oware', name: 'Oware-Meister', desc: 'Oware gegen Stufe 3 gewonnen.' },
  { game: 'kalaha', key: 'lawine', name: 'Lawinenreiter', desc: 'Lawine gegen Stufe 3 gewonnen.' },
  { game: 'kalaha', key: 'extra3', name: 'Dreifacher Extrazug', desc: 'Drei Extrazüge hintereinander gespielt.' },
  { game: 'kalaha', key: 'fang10', name: 'Große Beute', desc: 'Mit einem Zug zehn oder mehr Samen gewonnen.' },
  { game: 'kalaha', key: 'deutlich', name: 'Deutlicher Sieg', desc: 'Mit mindestens 20 Samen Vorsprung gewonnen (Stufe 3+).' },
  { game: 'kalaha', key: 'knapp', name: 'Haarscharf', desc: 'Mit genau einem Samen Vorsprung gewonnen.' },
  { game: 'kalaha', key: 'beide', name: 'Oben und unten', desc: 'Als erster und als zweiter Spieler gegen Stufe 2 oder höher gewonnen.' },
  { game: 'kalaha', key: 'coach', name: 'Kluge Hand', desc: 'Mit Coach mindestens 80 % beste Züge und gewonnen.' },
  { game: 'kalaha', key: 'zwei', name: 'Am Brett', desc: 'Eine Partie zu zweit beendet.' },
  { game: 'kalaha', key: 'remis', name: 'Gleichstand', desc: 'Eine Partie endet unentschieden.' },
  { game: 'kalaha', key: 'lessons', name: 'Muldenkundig', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'kalaha', key: 'puzzle10', name: 'Rechenkünstler', desc: '10 Aufgaben gelöst.' },
  { game: 'kalaha', key: 'streak5', name: 'Fünf am Stück', desc: 'Fünf Aufgaben ohne Fehler in Folge.' },
  { game: 'kalaha', key: 'daily', name: 'Tagesmulde', desc: 'Die Tagesaufgabe gelöst.' },
]);
addSecrets([
  { id: 'kalaha-kauri', game: 'kalaha', code: 'kauri', title: 'Kaurimuschel', riddle: 'Einst als Geld benutzt, heute ein Spielstein.', effect: 'Du beginnst die nächste Partie mit einem Samen mehr in jeder eigenen Mulde (zählt nicht für Erfolge).' },
  { id: 'kalaha-wuestenwind', game: 'kalaha', code: 'wuestenwind', title: 'Wüstenwind', riddle: 'Er trägt dir den besten Zug zu.', effect: 'Der beste Zug wird in der nächsten Partie ständig angezeigt (zählt nicht für Erfolge).' },
  { id: 'kalaha-oase', game: 'kalaha', code: 'oase', title: 'Oase', riddle: 'Ein Ort zum Ausruhen in der Wüste.', effect: 'Die KI spielt in der nächsten Partie eine Stufe schwächer (zählt nicht für Erfolge).' },
]);
