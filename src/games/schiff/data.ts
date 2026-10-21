import { addAchievements, addSecrets } from '../shared/meta';
import { type Rules } from './engine';

export type SeaTheme = 'radar' | 'seekarte' | 'stahl' | 'nacht';

export interface SSettings {
  theme: SeaTheme;
  sound: boolean;
  coords: boolean;
  confirm: boolean;
  sweep: boolean;
  /** Letzte Einstellungen */
  mode: 'ki' | 'zwei' | 'jagd';
  level: number;
  fleet: string;
  spacing: boolean;
  salvo: boolean;
  fog: boolean;
  radar: number;
  chain: boolean;
}

export interface SStat { played: number; won: number; shots: number; bestShots: number; streak: number; bestStreak: number }
export interface SLogShot { by: 0 | 1; i: number; kind: 'wasser' | 'treffer' | 'versenkt' | 'radar'; extra?: number }
export interface SSaved { id: string; date: string; mode: string; result: string; rules: Rules; fleets: [number[][], number[][]]; log: SLogShot[] }

export interface SData {
  settings: SSettings;
  stats: Record<string, SStat>;
  saved: SSaved[];
  stars: Record<string, number>;
  jagdBest: Record<string, number>;
  tactic: { solved: number; streak: number; best: number };
  layouts: { name: string; n: number; lens: number[]; ships: number[][] }[];
  totals: { games: number; wins: number; shots: number; hits: number; sunk: number };
  accuracy: { sum: number; shots: number };
}

export const SCHIFF_INIT: SData = {
  settings: { theme: 'radar', sound: true, coords: true, confirm: false, sweep: true, mode: 'ki', level: 3, fleet: 'klassisch', spacing: false, salvo: false, fog: false, radar: 0, chain: false },
  stats: {}, saved: [], stars: {}, jagdBest: {}, tactic: { solved: 0, streak: 0, best: 0 }, layouts: [],
  totals: { games: 0, wins: 0, shots: 0, hits: 0, sunk: 0 }, accuracy: { sum: 0, shots: 0 },
};

export const THEMES: { id: SeaTheme; name: string }[] = [{ id: 'radar', name: 'Radar (grün)' }, { id: 'seekarte', name: 'Seekarte' }, { id: 'stahl', name: 'Stahl & Bernstein' }, { id: 'nacht', name: 'Nachtsicht' }];

export const LEVELS_S: { id: number; name: string; info: string }[] = [
  { id: 1, name: 'Schiffsjunge', info: 'Schießt wild, trifft meist zufällig.' },
  { id: 2, name: 'Matrose', info: 'Verfolgt Treffer, sonst planlos.' },
  { id: 3, name: 'Steuermann', info: 'Schießt in Schachbrett-Mustern, verfolgt Treffer.' },
  { id: 4, name: 'Kapitän', info: 'Berechnet für jedes Feld die Wahrscheinlichkeit.' },
  { id: 5, name: 'Admiral', info: 'Wahrscheinlichkeiten plus Radar-Auswertung, kaum Fehler.' },
];

export interface Mission { id: string; title: string; brief: string; level: number; fleet: string; rules: Partial<Rules> }
export const MISSIONS: Mission[] = [
  { id: 'm1', title: 'Erste Fahrt', brief: 'Kleine Flotte, kleines Meer. Gewinne gegen einen Schiffsjungen.', level: 1, fleet: 'klein', rules: {} },
  { id: 'm2', title: 'Küstenwache', brief: 'Die klassische Flotte, aber der Gegner kennt schon Verfolgungsregeln.', level: 2, fleet: 'klassisch', rules: {} },
  { id: 'm3', title: 'Nebelbank', brief: 'Im Nebel wird nicht gemeldet, welches Schiff gesunken ist.', level: 2, fleet: 'klassisch', rules: { fog: true } },
  { id: 'm4', title: 'Abstand halten', brief: 'Kein Schiff berührt ein anderes – auch nicht diagonal.', level: 3, fleet: 'klassisch', rules: { spacing: true } },
  { id: 'm5', title: 'Salvenkrieg', brief: 'So viele Schüsse pro Zug, wie du Schiffe hast.', level: 3, fleet: 'klassisch', rules: { salvo: true } },
  { id: 'm6', title: 'Radarstation', brief: 'Drei Radar-Aufklärungen helfen dir, die Flotte zu finden.', level: 3, fleet: 'klassisch', rules: { radar: 3 } },
  { id: 'm7', title: 'Große Flotte', brief: 'Ein weites Meer mit sieben Schiffen – Salven und Abstand.', level: 4, fleet: 'gross', rules: { salvo: true, spacing: true } },
  { id: 'm8', title: 'Der Admiral', brief: 'Klassisch, mit Radar – gegen die stärkste KI.', level: 5, fleet: 'klassisch', rules: { radar: 2 } },
];

addAchievements([
  { game: 'schiff', key: 'first', name: 'Erste Salve', desc: 'Ein Gefecht beendet.' },
  { game: 'schiff', key: 'win', name: 'Sieg auf See', desc: 'Ein Gefecht gegen die KI gewonnen.' },
  { game: 'schiff', key: 'lv4', name: 'Kapitäne schlagen', desc: 'Stufe 4 oder höher besiegt.' },
  { game: 'schiff', key: 'lv5', name: 'Admiral gestürzt', desc: 'Die stärkste Stufe besiegt.' },
  { game: 'schiff', key: 'flawless', name: 'Ohne Verlust', desc: 'Gewonnen, ohne dass ein eigenes Schiff sank.' },
  { game: 'schiff', key: 'fast', name: 'Blitzkrieg', desc: 'Gegnerflotte (klassisch) mit höchstens 45 Schüssen versenkt.' },
  { game: 'schiff', key: 'salvo', name: 'Salvenmeister', desc: 'Ein Salven-Gefecht gewonnen.' },
  { game: 'schiff', key: 'fog', name: 'Im Nebel', desc: 'Ein Nebel-Gefecht gewonnen.' },
  { game: 'schiff', key: 'radar', name: 'Funker', desc: 'Mit Radar-Aufklärung gewonnen.' },
  { game: 'schiff', key: 'jagd', name: 'Jäger', desc: 'Eine Jagd abgeschlossen.' },
  { game: 'schiff', key: 'jagd50', name: 'Scharfschütze', desc: 'Eine klassische Jagd mit höchstens 50 Schüssen beendet.' },
  { game: 'schiff', key: 'campaign', name: 'Seekrieg', desc: 'Alle Kampagnen-Missionen gewonnen.' },
  { game: 'schiff', key: 'stars', name: 'Sternenflotte', desc: 'Alle Missionen mit drei Sternen.' },
  { game: 'schiff', key: 'tactic10', name: 'Taktiker', desc: '10 Taktik-Aufgaben gelöst.' },
  { game: 'schiff', key: 'tactic5s', name: 'Fünf Treffer', desc: '5 Taktik-Aufgaben in Folge richtig.' },
  { game: 'schiff', key: 'daily', name: 'Tagesjagd', desc: 'Die Tagesjagd abgeschlossen.' },
  { game: 'schiff', key: 'zwei', name: 'Zwei Admirale', desc: 'Ein Zwei-Spieler-Gefecht beendet.' },
]);
addSecrets([
  { id: 'schiff-sonar', game: 'schiff', code: 'sonar', title: 'Sonar', riddle: 'Ping – so hören U-Boote das Meer.', effect: 'Zeigt die Wahrscheinlichkeitskarte über dem Gegnerfeld (zählt als Hilfe).' },
  { id: 'schiff-torpedo', game: 'schiff', code: 'torpedo', title: 'Torpedo', riddle: 'Eine Waffe, die unter dem Wasser einschlägt – das Wort steht auf jedem U-Boot.', effect: 'Einmal je Gefecht eine ganze Zeile beschießen (zählt als Hilfe).' },
  { id: 'schiff-nebelhorn', game: 'schiff', code: 'nebelhorn', title: 'Nebelhorn', riddle: 'Was Schiffe im dichten Nebel bläst.', effect: 'Im Nebel-Gefecht wird „versenkt“ wieder gemeldet (zählt als Hilfe).' },
]);
