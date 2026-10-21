import { addAchievements, addSecrets } from '../shared/meta';

export type Theme = 'bernstein' | 'farbe';

export interface VSettings { theme: Theme; cls: string; autopickup: boolean; confirmStairs: boolean; sound: boolean }

export interface HallEntry { id: string; date: string; cls: string; depth: number; score: number; win: boolean; cause: string; turns: number; kills: number; seed: string; assisted: boolean; daily: boolean }

export interface VData {
  settings: VSettings;
  stats: { runs: number; wins: number; deepest: number; kills: number; gold: number; bestScore: number; turns: number; levelups: number };
  hall: HallEntry[];
  bestiary: Record<string, number>;
  wins: Record<string, boolean>;
  dailyBest: Record<string, number>;
}

export const VERLIES_INIT: VData = {
  settings: { theme: 'bernstein', cls: 'krieger', autopickup: true, confirmStairs: false, sound: true },
  stats: { runs: 0, wins: 0, deepest: 0, kills: 0, gold: 0, bestScore: 0, turns: 0, levelups: 0 },
  hall: [], bestiary: {}, wins: {}, dailyBest: {},
};

export const THEMES_V: { id: Theme; name: string }[] = [{ id: 'bernstein', name: 'Bernstein-Monitor' }, { id: 'farbe', name: 'Farbiges Terminal' }];

addAchievements([
  { game: 'verlies', key: 'abstieg', name: 'Erster Abstieg', desc: 'Ebene 2 erreicht.' },
  { game: 'verlies', key: 'tief4', name: 'Vier Stockwerke tief', desc: 'Ebene 4 erreicht.' },
  { game: 'verlies', key: 'tief7', name: 'Fast am Ziel', desc: 'Ebene 7 erreicht.' },
  { game: 'verlies', key: 'sieg', name: 'Zeitamulett', desc: 'Das Amulett auf Ebene 8 geborgen.' },
  { game: 'verlies', key: 'sieg3', name: 'Alle Berufe', desc: 'Mit Krieger, Magier und Schurkin gewonnen.' },
  { game: 'verlies', key: 'drache', name: 'Drachentöter', desc: 'Den Drachen besiegt.' },
  { game: 'verlies', key: 'stufe8', name: 'Erfahren', desc: 'Charakterstufe 8 erreicht.' },
  { game: 'verlies', key: 'pazifist', name: 'Schleicher', desc: 'Ebene 3 erreicht, ohne ein Monster zu töten.' },
  { game: 'verlies', key: 'schnell', name: 'Im Eiltempo', desc: 'Gewonnen in höchstens 4000 Zügen.' },
  { game: 'verlies', key: 'reich', name: 'Goldrausch', desc: '400 Gold in einem Lauf.' },
  { game: 'verlies', key: 'alchemist', name: 'Alchemist', desc: 'Fünf verschiedene Tränke oder Schriftrollen in einem Lauf identifiziert.' },
  { game: 'verlies', key: 'fallen', name: 'Fallensteller', desc: 'Drei Fallen in einem Lauf entdeckt.' },
  { game: 'verlies', key: 'bestiarium', name: 'Bestiarium', desc: 'Alle zehn normalen Monsterarten besiegt.' },
  { game: 'verlies', key: 'daily', name: 'Tagesabstieg', desc: 'Den Tageslauf gespielt.' },
]);
addSecrets([
  { id: 'verlies-xyzzy', game: 'verlies', code: 'xyzzy', title: 'XYZZY', riddle: 'Das Zauberwort aus dem ältesten aller Abenteuerspiele.', effect: 'Der nächste Lauf beginnt mit einer Teleport- und einer Kartenrolle (zählt nicht für Erfolge).' },
  { id: 'verlies-plugh', game: 'verlies', code: 'plugh', title: 'PLUGH', riddle: 'Noch ein altes Zauberwort – es führt in die Tiefe.', effect: 'Der nächste Lauf beginnt mit 10 zusätzlichen Lebenspunkten (zählt nicht für Erfolge).' },
  { id: 'verlies-nethack', game: 'verlies', code: 'nethack', title: 'Vorbild', riddle: 'Das Spiel, dem alle Verliese nacheifern.', effect: 'Im nächsten Lauf sind alle Tränke und Schriftrollen schon bekannt (zählt nicht für Erfolge).' },
]);
