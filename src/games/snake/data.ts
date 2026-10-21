import { addAchievements, addSecrets } from '../shared/meta';
import type { ReplayData } from './engine';

export type Skin = 'lcd' | 'neon' | 'papier' | 'pixel';
export type ModeS = 'klassisch' | 'torus' | 'zen' | 'ueberleben' | 'zeit' | 'kampagne' | 'zwei' | 'duell' | 'eigen';

export interface SnSettings {
  skin: Skin;
  speed: 1 | 2 | 3 | 4 | 5;
  extras: boolean;
  dpad: boolean;
  sound: boolean;
  grid: 'klein' | 'mittel' | 'gross';
  mode: ModeS;
  ai: number;
}

export interface SnStat { played: number; best: number; apples: number; longest: number; time: number }
export interface SavedReplay { id: string; date: string; mode: string; score: number; data: ReplayData }
export interface CustomLevel { name: string; code: string }

export interface SnData {
  settings: SnSettings;
  stats: Record<string, SnStat>;
  stars: Record<string, number>;
  replays: SavedReplay[];
  custom: CustomLevel[];
  totals: { games: number; apples: number; gold: number; ticks: number };
  dailyBest: Record<string, number>;
}

export const SNAKE_INIT: SnData = {
  settings: { skin: 'lcd', speed: 3, extras: true, dpad: false, sound: true, grid: 'mittel', mode: 'klassisch', ai: 3 },
  stats: {}, stars: {}, replays: [], custom: [], totals: { games: 0, apples: 0, gold: 0, ticks: 0 }, dailyBest: {},
};

export const SKINS: { id: Skin; name: string }[] = [{ id: 'lcd', name: 'Handy-Display' }, { id: 'neon', name: 'Neon' }, { id: 'papier', name: 'Kariertes Papier' }, { id: 'pixel', name: 'Pixelgarten' }];
export const SPEED_MS = [0, 190, 150, 118, 92, 72];
export const GRIDS = { klein: [16, 11], mittel: [22, 15], gross: [30, 20] } as const;

export const MODES: { id: ModeS; name: string; info: string }[] = [
  { id: 'klassisch', name: 'Klassisch', info: 'Wände und der eigene Schwanz sind tödlich.' },
  { id: 'torus', name: 'Torus', info: 'Ohne Wände: Wer links hinaus fährt, kommt rechts wieder herein.' },
  { id: 'zen', name: 'Zen', info: 'Kein Tod – Berührungen kosten nur ein Stück Schwanz.' },
  { id: 'ueberleben', name: 'Überleben', info: 'Die Wände rücken immer näher.' },
  { id: 'zeit', name: 'Zeitangriff', info: '90 Sekunden: So viele Punkte wie möglich.' },
  { id: 'kampagne', name: 'Kampagne', info: 'Zwölf Level mit Hindernissen und Zielen.' },
  { id: 'zwei', name: 'Zu zweit', info: 'Zwei Spieler an einer Tastatur (Pfeile und WASD).' },
  { id: 'duell', name: 'Gegen KI', info: 'Eine KI-Schlange kämpft um dein Futter.' },
  { id: 'eigen', name: 'Eigene Level', info: 'Spiele selbst gebaute Level oder importiere einen Code.' },
];

addAchievements([
  { game: 'snake', key: 'first', name: 'Erster Apfel', desc: 'Einen Apfel gefressen.' },
  { game: 'snake', key: 'score100', name: 'Hundert Punkte', desc: '100 Punkte in einem Spiel.' },
  { game: 'snake', key: 'score500', name: 'Fünfhundert', desc: '500 Punkte in einem Spiel.' },
  { game: 'snake', key: 'long20', name: 'Lange Schlange', desc: 'Länge 20 erreicht.' },
  { game: 'snake', key: 'long50', name: 'Riesenschlange', desc: 'Länge 50 erreicht.' },
  { game: 'snake', key: 'gold', name: 'Goldrausch', desc: '5 goldene Äpfel in einem Spiel.' },
  { game: 'snake', key: 'ghost', name: 'Geisterfahrer', desc: 'Mit Geist-Effekt durch einen Hindernisblock gefahren.' },
  { game: 'snake', key: 'torus', name: 'Weltumsegler', desc: '200 Punkte im Torus.' },
  { game: 'snake', key: 'zen', name: 'Innere Ruhe', desc: '10 Minuten Zen gespielt.' },
  { game: 'snake', key: 'survive', name: 'Überlebenskünstler', desc: 'Im Überleben-Modus 300 Punkte.' },
  { game: 'snake', key: 'time', name: 'Beim Zeitangriff', desc: '300 Punkte im Zeitangriff.' },
  { game: 'snake', key: 'camp6', name: 'Halbzeit', desc: 'Sechs Kampagnen-Level geschafft.' },
  { game: 'snake', key: 'camp12', name: 'Kampagne bezwungen', desc: 'Alle zwölf Level geschafft.' },
  { game: 'snake', key: 'stars', name: 'Sternenjäger', desc: 'Alle Level mit drei Sternen.' },
  { game: 'snake', key: 'duell', name: 'Gegen die Schlange', desc: 'Ein Duell gegen die KI gewonnen.' },
  { game: 'snake', key: 'zwei', name: 'Zu zweit', desc: 'Ein Zwei-Spieler-Spiel beendet.' },
  { game: 'snake', key: 'editor', name: 'Baumeister', desc: 'Ein eigenes Level gebaut und gespielt.' },
  { game: 'snake', key: 'daily', name: 'Tagesschlange', desc: 'Die Tagesrunde gespielt.' },
]);
addSecrets([
  { id: 'snake-python', game: 'snake', code: 'python', title: 'Python', riddle: 'Eine Programmiersprache – und eine echte Würgeschlange.', effect: 'Dein nächstes Spiel beginnt mit dem Geist-Effekt (zählt nicht für Bestwerte).' },
  { id: 'snake-anaconda', game: 'snake', code: 'anaconda', title: 'Anaconda', riddle: 'Die schwerste Schlange der Welt.', effect: 'Dein nächstes Spiel beginnt mit Länge 12 (zählt nicht für Bestwerte).' },
  { id: 'snake-nokia', game: 'snake', code: 'nokia', title: 'Nokia 3310', riddle: 'Auf welchem Handy lief das berühmteste Schlangenspiel?', effect: 'Schaltet den Handy-Look mit Klingelton-Piepsern frei.' },
]);
