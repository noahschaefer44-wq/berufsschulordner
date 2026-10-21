import { addAchievements, addSecrets } from '../shared/meta';
import type { Game, Limit } from './engine';

export type TableTheme = 'neon' | 'samt' | 'filz' | 'schiefer';

export interface PSettings {
  theme: TableTheme;
  back: string;
  fourColor: boolean;
  speed: 'langsam' | 'normal' | 'schnell';
  showEquity: boolean;
  showOdds: boolean;
  autoNext: boolean;
  sound: boolean;
  /** Letzte Einstellungen */
  mode: 'cash' | 'turnier' | 'duell';
  game: Game;
  limit: Limit;
  players: number;
  level: number;
  blinds: number;
  buyin: number;
}

export interface PStat { hands: number; won: number; net: number; best: number }
export interface PHand { id: string; no: number; hole: number[]; board: number[]; result: string; net: number; hand: string; game: Game; mode: string }

export interface PData {
  settings: PSettings;
  stats: Record<string, PStat>;
  history: PHand[];
  totals: { hands: number; won: number; vpip: number; pfr: number; showdowns: number; showdownWins: number; bigPot: number; net: number; allInWins: number };
  bestHand: number;
  tournaments: { played: number; won: number; best: number };
  quiz: { rank: number; rankBest: number; winner: number; winnerBest: number; odds: number; oddsBest: number; equity: number; equityBest: number; outs: number; outsBest: number; decision: number; decisionBest: number };
  lessons: Record<string, boolean>;
  dailyDone: string;
}

export const POKER_INIT: PData = {
  settings: { theme: 'neon', back: 'rot', fourColor: false, speed: 'normal', showEquity: false, showOdds: true, autoNext: true, sound: true, mode: 'cash', game: 'holdem', limit: 'no', players: 6, level: 3, blinds: 20, buyin: 1000 },
  stats: {}, history: [],
  totals: { hands: 0, won: 0, vpip: 0, pfr: 0, showdowns: 0, showdownWins: 0, bigPot: 0, net: 0, allInWins: 0 },
  bestHand: 0, tournaments: { played: 0, won: 0, best: 0 },
  quiz: { rank: 0, rankBest: 0, winner: 0, winnerBest: 0, odds: 0, oddsBest: 0, equity: 0, equityBest: 0, outs: 0, outsBest: 0, decision: 0, decisionBest: 0 },
  lessons: {}, dailyDone: '',
};

export const THEMES_P: { id: TableTheme; name: string }[] = [{ id: 'neon', name: 'Neon-Bar' }, { id: 'samt', name: 'Roter Samt' }, { id: 'filz', name: 'Klassischer Filz' }, { id: 'schiefer', name: 'Schiefer' }];
export const BACKS_P = [{ id: 'rot', name: 'Klassisch Rot' }, { id: 'blau', name: 'Rautenblau' }, { id: 'gold', name: 'Schwarz-Gold' }, { id: 'stern', name: 'Sterne' }];
export const GAMES_P: { id: Game; name: string; info: string }[] = [
  { id: 'holdem', name: "Texas Hold'em", info: 'Zwei Handkarten, fünf Gemeinschaftskarten – das bekannteste Pokerspiel.' },
  { id: 'omaha', name: 'Omaha', info: 'Vier Handkarten, von denen du genau zwei benutzen musst – viele Draws, große Pötte.' },
  { id: 'short', name: 'Short Deck', info: 'Nur Karten von 6 bis Ass. Ein Flush schlägt das Full House, A-6-7-8-9 ist eine Straße.' },
];

export const BLIND_LEVELS: [number, number, number][] = [[10, 20, 0], [15, 30, 0], [25, 50, 0], [50, 100, 0], [75, 150, 15], [100, 200, 25], [150, 300, 40], [200, 400, 50], [300, 600, 75], [500, 1000, 125]];

export const LEVELS_P: { id: number; name: string; info: string }[] = [
  { id: 1, name: 'Anfänger', info: 'Wenig Rechenaufwand, viele Fehler.' },
  { id: 2, name: 'Hobby', info: 'Erkennt starke Hände, übersieht Draws.' },
  { id: 3, name: 'Stammtisch', info: 'Rechnet Gewinnchancen mit Pot-Quote.' },
  { id: 4, name: 'Profi', info: 'Genauere Berechnung, weniger Rauschen.' },
  { id: 5, name: 'Shark', info: 'Sehr genaue Berechnung – kaum ein Fehler.' },
];

addAchievements([
  { game: 'poker', key: 'first', name: 'Erste Hand', desc: 'Eine Hand gespielt.' },
  { game: 'poker', key: 'win', name: 'Erster Pot', desc: 'Einen Pot gewonnen.' },
  { game: 'poker', key: 'showdown', name: 'Showdown', desc: 'Einen Showdown gewonnen.' },
  { game: 'poker', key: 'bluff', name: 'Gelungener Bluff', desc: 'Einen Pot ohne Showdown mit schwacher Hand gewonnen.' },
  { game: 'poker', key: 'allin', name: 'Alles auf eine Karte', desc: 'Mit All-in einen Showdown gewonnen.' },
  { game: 'poker', key: 'flush', name: 'Flush', desc: 'Mit einem Flush gewonnen.' },
  { game: 'poker', key: 'full', name: 'Full House', desc: 'Mit einem Full House oder besser gewonnen.' },
  { game: 'poker', key: 'quads', name: 'Vierling', desc: 'Mit einem Vierling oder besser gewonnen.' },
  { game: 'poker', key: 'royal', name: 'Royal Flush', desc: 'Einen Royal Flush gehalten.' },
  { game: 'poker', key: 'bigpot', name: 'Großer Pot', desc: 'Einen Pot über 2000 gewonnen.' },
  { game: 'poker', key: 'tourney', name: 'Turniersieger', desc: 'Ein Turnier gewonnen.' },
  { game: 'poker', key: 'duell', name: 'Heads-up-Sieger', desc: 'Ein Duell gewonnen.' },
  { game: 'poker', key: 'omaha', name: 'Omaha-Spieler', desc: 'Eine Omaha-Hand gewonnen.' },
  { game: 'poker', key: 'short', name: 'Kurzer Prozess', desc: 'Eine Short-Deck-Hand gewonnen.' },
  { game: 'poker', key: 'lv5', name: 'Hai gebissen', desc: 'Ein Turnier gegen Stufe 5 gewonnen.' },
  { game: 'poker', key: 'quiz', name: 'Kartenkenner', desc: '10 Trainerfragen richtig beantwortet.' },
  { game: 'poker', key: 'quiz30', name: 'Mathematiker', desc: '30 Trainerfragen richtig beantwortet.' },
  { game: 'poker', key: 'lessons', name: 'Schüler', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'poker', key: 'daily', name: 'Tageshand', desc: 'Die Aufgabe des Tages gelöst.' },
  { game: 'poker', key: 'hundred', name: 'Hundert Hände', desc: '100 Hände gespielt.' },
]);
addSecrets([
  { id: 'poker-sonnenbrille', game: 'poker', code: 'sonnenbrille', title: 'Sonnenbrille', riddle: 'Das Accessoire jedes Pokerprofis, damit niemand die Augen liest.', effect: 'Die Karten aller Gegner sind für dich sichtbar (zählt als Hilfe).' },
  { id: 'poker-wahrsager', game: 'poker', code: 'wahrsager', title: 'Wahrsager', riddle: 'Wer die Zukunft aus den Karten liest.', effect: 'Zeigt die nächste Gemeinschaftskarte an (zählt als Hilfe).' },
  { id: 'poker-bluffer', game: 'poker', code: 'bluffer', title: 'Bluffer', riddle: 'Er tut, als hätte er alles – und hat nichts.', effect: 'Bots geben deinen Einsätzen öfter nach (zählt als Hilfe).' },
]);
