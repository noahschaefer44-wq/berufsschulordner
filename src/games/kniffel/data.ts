import { addAchievements, addSecrets } from '../shared/meta';
import type { Card } from './engine';

export type Theme = 'tisch' | 'blau';

export interface PlayerCfg { ai: number }

export interface KSettings {
  theme: Theme;
  variant: 'classic' | 'maxi';
  /** Spieler: ai = 0 Mensch, 1–5 KI-Stufe */
  players: PlayerCfg[];
  coach: boolean;
  odds: boolean;
  fast: boolean;
  sound: boolean;
}

export interface HistGame { id: string; date: string; variant: 'classic' | 'maxi'; names: string[]; totals: number[]; cards: Card[]; daily?: boolean }

export interface KData {
  settings: KSettings;
  stats: { games: number; wins: number; best: Record<string, number>; sum: Record<string, number>; count: Record<string, number>; kniffels: number; bonuses: number; straights: number };
  coach: { n: number; loss: number; perfect: number };
  lessons: Record<string, boolean>;
  puzzles: { solved: number; streak: number; best: number };
  hist: HistGame[];
}

export const KNIFFEL_INIT: KData = {
  settings: { theme: 'tisch', variant: 'classic', players: [{ ai: 0 }, { ai: 3 }], coach: false, odds: false, fast: false, sound: true },
  stats: { games: 0, wins: 0, best: {}, sum: {}, count: {}, kniffels: 0, bonuses: 0, straights: 0 },
  coach: { n: 0, loss: 0, perfect: 0 },
  lessons: {}, puzzles: { solved: 0, streak: 0, best: 0 }, hist: [],
};

export const THEMES_N: { id: Theme; name: string }[] = [{ id: 'tisch', name: 'Stammtisch' }, { id: 'blau', name: 'Blauer Block' }];

addAchievements([
  { game: 'kniffel', key: 'first', name: 'Erste Runde', desc: 'Ein Spiel zu Ende gespielt.' },
  { game: 'kniffel', key: 'kniffel', name: 'Kniffel!', desc: 'Einen Kniffel (alle Würfel gleich) in ein Feld eingetragen.' },
  { game: 'kniffel', key: 'strasse', name: 'Straßenkünstler', desc: 'Eine Große Straße eingetragen.' },
  { game: 'kniffel', key: 'bonus', name: 'Oberer Block', desc: 'Den Bonus im oberen Block erreicht.' },
  { game: 'kniffel', key: 'score200', name: 'Zweihundert', desc: '200 Punkte in einem Spiel (Kniffel).' },
  { game: 'kniffel', key: 'score250', name: 'Zweihundertfünfzig', desc: '250 Punkte in einem Spiel (Kniffel).' },
  { game: 'kniffel', key: 'maxi', name: 'Maxi', desc: '300 Punkte im Maxi-Kniffel.' },
  { game: 'kniffel', key: 'sieg', name: 'Gegen Kniffel-Veteran', desc: 'Ein Spiel gegen Stufe 3 gewonnen.' },
  { game: 'kniffel', key: 'meister', name: 'Gegen den Meister', desc: 'Ein Spiel gegen Stufe 5 gewonnen.' },
  { game: 'kniffel', key: 'bonus100', name: 'Kniffel-Bonus', desc: 'Einen zweiten Kniffel als Bonus mit 100 Punkten eingetragen.' },
  { game: 'kniffel', key: 'coach', name: 'Wahrscheinlich gut', desc: 'Mit Coach im Schnitt höchstens 2 Punkte pro Entscheidung verschenkt.' },
  { game: 'kniffel', key: 'lessons', name: 'Würfelkunde', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'kniffel', key: 'puzzle10', name: 'Rechenschieber', desc: '10 Aufgaben gelöst.' },
  { game: 'kniffel', key: 'streak5', name: 'Fünf am Stück', desc: 'Fünf Aufgaben ohne Fehler in Folge.' },
  { game: 'kniffel', key: 'daily', name: 'Tageswurf', desc: 'Den Tageswurf gespielt.' },
]);
addSecrets([
  { id: 'kniffel-knobeln', game: 'kniffel', code: 'knobeln', title: 'Knobeln', riddle: 'So nennt man das Würfeln um die Zeche.', effect: 'Die Chancen-Tabelle ist in der nächsten Partie immer sichtbar (zählt nicht für Erfolge).' },
  { id: 'kniffel-schummeln', game: 'kniffel', code: 'schummeln', title: 'Schummeln', riddle: 'Was man beim Würfeln nicht tun soll.', effect: 'Vier statt drei Würfe pro Zug in der nächsten Partie (zählt nicht für Erfolge).' },
  { id: 'kniffel-pasch', game: 'kniffel', code: 'pasch', title: 'Sechserpasch', riddle: 'Wenn alle Würfel die höchste Zahl zeigen.', effect: 'Dein erster Wurf der nächsten Partie ist ein Sechser-Kniffel (zählt nicht für Erfolge).' },
]);
