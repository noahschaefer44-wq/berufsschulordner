import { addAchievements, addSecrets } from '../shared/meta';

export type BTheme = 'mondrian' | 'blau' | 'nacht';
export type ErrMode = 'sofort' | 'ende' | 'aus';

export interface BSettings {
  theme: BTheme;
  errors: ErrMode;
  hardcore: boolean;
  autoCross: boolean;
  showTimer: boolean;
  colorWin: boolean;
  touchMode: 'fill' | 'cross';
  zoom: number;
  diff: 'leicht' | 'mittel' | 'schwer';
  size: number;
}

export interface Custom { id: string; name: string; code: string }
export interface SavedB {
  w: number;
  h: number;
  /** Lösung als Bitfolge (0/1) */
  bits: string;
  name: string;
  u: number[];
  time: number;
  mistakes: number;
  hints: number;
  helped: boolean;
  lives: number;
  daily?: string;
  pic?: string;
  lesson?: string;
}

export interface BStat { played: number; won: number; best: number }
export interface BData {
  settings: BSettings;
  custom: Custom[];
  current: SavedB | null;
  stats: Record<string, BStat>;
  pics: Record<string, number>;
  lessons: Record<string, boolean>;
}

export const BILD_INIT: BData = {
  settings: { theme: 'mondrian', errors: 'sofort', hardcore: false, autoCross: true, showTimer: true, colorWin: true, touchMode: 'fill', zoom: 28, diff: 'mittel', size: 10 },
  custom: [], current: null, stats: {}, pics: {}, lessons: {},
};

export const bitsToString = (b: ArrayLike<number>) => Array.from(b, (x) => (x ? '1' : '0')).join('');
export const stringToBits = (s: string) => Uint8Array.from(s, (c) => (c === '1' ? 1 : 0));

export interface BLesson { id: string; title: string; text: string; w: number; h: number; art: string[]; tipp: string }
export const BLESSONS: BLesson[] = [
  { id: 'b1', title: 'Hinweise lesen', w: 5, h: 5, tipp: 'Die Zahlen am Rand sagen, wie lang die Blöcke aus gefüllten Feldern sind – in der Reihenfolge von links nach rechts bzw. von oben nach unten.',
    text: 'Jede Zahl neben einer Zeile (oder über einer Spalte) steht für einen Block aus gefüllten Feldern. Eine „3“ bedeutet: drei Felder in Folge sind gefüllt. Bei „2 1“ gibt es zuerst einen Block aus zwei, dann – mit mindestens einem leeren Feld Abstand – einen aus einem. Fülle das Plus aus.',
    art: ['..#..', '..#..', '#####', '..#..', '..#..'] },
  { id: 'b2', title: 'Volle Zeilen', w: 5, h: 5, tipp: 'Die „5“ in einer Zeile mit fünf Feldern füllt sie ganz aus.',
    text: 'Ist ein Hinweis so lang wie die ganze Zeile, sind alle Felder gefüllt. Dasselbe gilt für Hinweise, die zusammen mit den nötigen Lücken genau die Zeile ausfüllen – etwa „2 2“ in fünf Feldern: ##.##. Fang immer mit diesen sicheren Zeilen an.',
    art: ['#####', '#...#', '#.#.#', '#...#', '#####'] },
  { id: 'b3', title: 'Überlappung', w: 7, h: 7, tipp: 'Ein Block der Länge 5 in sieben Feldern kann nur um zwei Felder wandern – die drei mittleren Felder sind immer gefüllt.',
    text: 'Passt ein Block nur mit etwas Spiel in eine Zeile, überlappen seine möglichen Positionen. Ein Block der Länge 5 in 7 Feldern liegt ganz links, ganz rechts oder dazwischen – die Felder 3, 4 und 5 sind in allen Fällen gefüllt. Schiebe den Block gedanklich ganz nach links und ganz nach rechts und markiere, wo sich beide treffen.',
    art: ['.#####.', '#######', '###.###', '###.###', '###.###', '#######', '.#####.'] },
  { id: 'b4', title: 'Kreuze setzen', w: 6, h: 6, tipp: 'Sobald eine Zeile komplett ist, kannst du den Rest mit Kreuzen (Rechtsklick) als leer markieren.',
    text: 'Kreuze sind genauso wichtig wie gefüllte Felder: Wenn eine Zeile alle Blöcke enthält, ist der Rest leer. Mit einem Kreuz (Rechtsklick oder Schalter „Kreuz“) merkst du dir das. Kreuze neben Blöcken zeigen, wo ein Block enden muss – und helfen den Spalten.',
    art: ['..##..', '.####.', '######', '######', '.#..#.', '##..##'] },
  { id: 'b5', title: 'Ränder und Lücken', w: 8, h: 8, tipp: 'Ein gefülltes Feld am Rand mit Hinweis „3“ legt den ganzen Block fest: die ersten drei Felder.',
    text: 'Am Rand ist alles eindeutig: Steht in der ersten Zelle ein gefülltes Feld und der erste Hinweis ist 3, sind die Felder 1–3 gefüllt und Feld 4 leer. Zwei Kreuze in der Mitte teilen die Zeile in Abschnitte, in denen jeweils nur bestimmte Blöcke Platz haben. Rechne nach, welche Blöcke wohin passen.',
    art: ['###..###', '#......#', '#.####.#', '..#..#..', '..#..#..', '#.####.#', '#......#', '###..###'] },
  { id: 'b6', title: 'Alles zusammen', w: 10, h: 10, tipp: 'Wechsle zwischen Zeilen und Spalten – jede Erkenntnis in einer Richtung hilft der anderen.',
    text: 'Jetzt kombinierst du alles: sichere Zeilen, Überlappungen, Ränder und Kreuze. Arbeite abwechselnd Zeilen und Spalten durch. Findest du nicht weiter, hilft der Knopf „Hinweis“ – er zeigt dir eine Linie, in der sich etwas sicher bestimmen lässt, und erklärt warum.',
    art: ['..........', '.###..###.', '##########', '##########', '##########', '.########.', '..######..', '...####...', '....##....', '..........'] },
];

addAchievements([
  { game: 'bild', key: 'first', name: 'Erstes Bild', desc: 'Ein Bildrätsel gelöst.' },
  { game: 'bild', key: 'clean', name: 'Ohne Fehltritt', desc: 'Ein Bild ohne Fehler und Hilfe gelöst.' },
  { game: 'bild', key: 'gross', name: 'Großformat', desc: 'Ein Rätsel ab 20×20 gelöst.' },
  { game: 'bild', key: 'sammler', name: 'Sammler', desc: '10 Bilder der Sammlung gelöst.' },
  { game: 'bild', key: 'zufall', name: 'Glücksgriff', desc: '10 Zufallsrätsel gelöst.' },
  { game: 'bild', key: 'hardcore', name: 'Drei Leben', desc: 'Ein Rätsel im Hardcore-Modus gelöst.' },
  { game: 'bild', key: 'maler', name: 'Maler', desc: 'Ein eigenes Bild gezeichnet und gelöst.' },
  { game: 'bild', key: 'foto', name: 'Fotograf', desc: 'Ein Rätsel aus einem Foto erstellt.' },
  { game: 'bild', key: 'schule', name: 'Schüler', desc: 'Alle Lektionen abgeschlossen.' },
  { game: 'bild', key: 'daily', name: 'Tagesbild', desc: 'Das Tagesbild gelöst.' },
  { game: 'bild', key: 'schnell', name: 'Flinker Pinsel', desc: 'Ein 10×10-Rätsel in unter zwei Minuten.' },
]);
addSecrets([
  { id: 'bild-picasso', game: 'bild', code: 'picasso', title: 'Vorlage', riddle: 'Der berühmteste Maler des Kubismus hilft dir, das fertige Bild zu sehen.', effect: 'Zeigt kurz die Lösung als Schatten (zählt als Hilfe).' },
  { id: 'bild-mondrian', game: 'bild', code: 'mondrian', title: 'De Stijl', riddle: 'Der Meister der roten, blauen und gelben Flächen wechselt dein Design.', effect: 'Wechselt zwischen den Farbwelten Mondrian, Blau und Nacht.' },
  { id: 'bild-pixel', game: 'bild', code: 'pixelfee', title: 'Pixelfee', riddle: 'Eine freundliche Fee füllt dir eine Zeile.', effect: 'Füllt die sicherste Linie automatisch aus (zählt als Hilfe).' },
]);
