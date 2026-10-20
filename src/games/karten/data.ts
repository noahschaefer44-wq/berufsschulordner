import { addAchievements, addSecrets } from '../shared/meta';

export type Felt = 'gruen' | 'blau' | 'burgund' | 'holz' | 'schiefer';
export type Variant = 'klondike' | 'freecell' | 'spider' | 'pyramide' | 'tripeaks';

export interface KSettings {
  felt: Felt;
  back: string;
  fourColor: boolean;
  large: boolean;
  leftHand: boolean;
  anim: boolean;
  autoSafe: boolean;
  draw: 1 | 3;
  vegas: boolean;
  suits: 1 | 2 | 4;
  wrap: boolean;
  winnable: boolean;
  variant: Variant;
  /** Zuletzt gewählte Spielnummern je Variante */
  number: Record<string, number>;
}

export interface KStat { played: number; won: number; streak: number; bestStreak: number; bestTime: number; bestMoves: number; bestScore: number }
export interface KData {
  settings: KSettings;
  stats: Record<string, KStat>;
  freecellDone: Record<number, boolean>;
  totals: { games: number; wins: number };
}

export const KARTEN_INIT: KData = {
  settings: { felt: 'gruen', back: 'blau', fourColor: false, large: false, leftHand: false, anim: true, autoSafe: true, draw: 1, vegas: false, suits: 2, wrap: false, winnable: true, variant: 'klondike', number: {} },
  stats: {}, freecellDone: {}, totals: { games: 0, wins: 0 },
};

export const VARIANTS: { id: Variant; name: string; info: string }[] = [
  { id: 'klondike', name: 'Klondike', info: 'Das klassische Patience: Sieben Stapel, Vorrat, vier Ablagen.' },
  { id: 'freecell', name: 'FreeCell', info: 'Alle Karten offen, vier freie Zellen – fast jedes Spiel ist lösbar.' },
  { id: 'spider', name: 'Spider', info: 'Zwei Decks, Reihen von König bis Ass in einer Farbe bilden.' },
  { id: 'pyramide', name: 'Pyramide', info: 'Paare finden, die zusammen 13 ergeben (Könige allein).' },
  { id: 'tripeaks', name: 'TriPeaks', info: 'Drei Gipfel abräumen: Karte eins höher oder tiefer legen.' },
];

export const FELTS: { id: Felt; name: string }[] = [{ id: 'gruen', name: 'Filzgrün' }, { id: 'blau', name: 'Nachtblau' }, { id: 'burgund', name: 'Burgund' }, { id: 'holz', name: 'Holz' }, { id: 'schiefer', name: 'Schiefer' }];
export const BACKS: { id: string; name: string }[] = [{ id: 'blau', name: 'Rautenblau' }, { id: 'rot', name: 'Klassisch Rot' }, { id: 'gold', name: 'Schwarz-Gold' }, { id: 'welle', name: 'Wellen' }, { id: 'gruen', name: 'Efeu' }, { id: 'stern', name: 'Sterne' }];

addAchievements([
  { game: 'karten', key: 'first', name: 'Erster Sieg', desc: 'Ein Spiel gewonnen.' },
  { game: 'karten', key: 'klondike3', name: 'Dreier-Zieher', desc: 'Klondike mit 3 Karten gewonnen.' },
  { game: 'karten', key: 'vegas', name: 'High Roller', desc: 'Klondike im Vegas-Modus gewonnen.' },
  { game: 'karten', key: 'freecell', name: 'Zellenmeister', desc: 'Ein FreeCell-Spiel gewonnen.' },
  { game: 'karten', key: 'freecell10', name: 'Zehn Zellen', desc: '10 verschiedene FreeCell-Spiele gewonnen.' },
  { game: 'karten', key: 'spider1', name: 'Einfaches Netz', desc: 'Spider mit einer Farbe gewonnen.' },
  { game: 'karten', key: 'spider4', name: 'Spinnenmeister', desc: 'Spider mit vier Farben gewonnen.' },
  { game: 'karten', key: 'pyramide', name: 'Pharao', desc: 'Pyramide abgeräumt.' },
  { game: 'karten', key: 'tripeaks', name: 'Gipfelstürmer', desc: 'TriPeaks abgeräumt.' },
  { game: 'karten', key: 'serie10', name: 'Serie', desc: 'TriPeaks: 10 Karten in einer Serie.' },
  { game: 'karten', key: 'schnell', name: 'Blitzblatt', desc: 'Klondike in unter drei Minuten gewonnen.' },
  { game: 'karten', key: 'ohneundo', name: 'Ohne Zurück', desc: 'Gewonnen, ohne einen Zug rückgängig zu machen.' },
  { game: 'karten', key: 'zehn', name: 'Kartenprofi', desc: '10 Siege.' },
  { game: 'karten', key: 'daily', name: 'Tagesblatt', desc: 'Das Tagesspiel gewonnen.' },
]);
addSecrets([
  { id: 'karten-xray', game: 'karten', code: 'roentgen', title: 'Röntgenblick', riddle: 'Wer durch Karten hindurchsehen will, braucht Strahlen – schreib sie ohne Umlaut.', effect: 'Zeigt verdeckte Karten durchscheinend (zählt als Hilfe).' },
  { id: 'karten-joker', game: 'karten', code: 'joker', title: 'Joker-Zelle', riddle: 'Die Karte, die in keinem normalen Deck fehlt und doch nicht dazugehört.', effect: 'FreeCell bekommt eine fünfte freie Zelle (zählt als Hilfe).' },
  { id: 'karten-kaffee', game: 'karten', code: 'kaffee', title: 'Kaffeepause', riddle: 'Während der Kaffee durchläuft, spielt das Spiel von allein.', effect: 'Spielt automatisch weiter, solange Züge zur Ablage möglich sind.' },
]);
