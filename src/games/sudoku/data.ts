import { addAchievements, addSecrets } from '../shared/meta';
import type { Variant } from './engine';
import type { Puzzle } from './gen';
import type { Level, Tech } from './logic';

export type Theme = 'zeitung' | 'tinte' | 'tafel' | 'kariert';
export type CheckMode = 'aus' | 'sofort' | 'ende';

export interface SSettings {
  theme: Theme;
  check: CheckMode;
  autoClean: boolean;
  showTimer: boolean;
  highlightSame: boolean;
  highlightPeers: boolean;
  variant: Variant;
  level: Level;
}

export interface Saved {
  puzzle: Puzzle;
  user: number[];
  notes: number[];
  marks: number[];
  time: number;
  mistakes: number;
  hints: number;
  helped: boolean;
  daily?: string;
  custom?: boolean;
}

export interface SStat { played: number; won: number; best: number; total: number; clean: number }

export interface SData {
  settings: SSettings;
  current: Saved | null;
  stats: Record<string, SStat>;
  academy: Record<string, number>;
  dailyBest: Record<string, number>;
}

export const SUDOKU_INIT: SData = {
  settings: { theme: 'zeitung', check: 'sofort', autoClean: true, showTimer: true, highlightSame: true, highlightPeers: true, variant: 'klassik', level: 'mittel' },
  current: null, stats: {}, academy: {}, dailyBest: {},
};

export const THEMES: { id: Theme; name: string }[] = [
  { id: 'zeitung', name: 'Zeitung' }, { id: 'tinte', name: 'Tinte' }, { id: 'tafel', name: 'Tafel' }, { id: 'kariert', name: 'Kariert' },
];

export interface Lesson { tech: Tech; title: string; text: string; tipp: string }
export const ACADEMY: Lesson[] = [
  { tech: 'nackt1', title: 'Nackter Einzelner', text: 'Jede Zelle hat bis zu neun mögliche Zahlen. Streiche in Gedanken alle Zahlen, die schon in der Zeile, der Spalte oder dem Block der Zelle stehen. Bleibt nur eine übrig, gehört sie in die Zelle. Das ist die einfachste Technik – und sie löst ganze leichte Rätsel allein.', tipp: 'Suche Zellen, die von sehr vielen gefüllten Nachbarn umgeben sind.' },
  { tech: 'versteckt1', title: 'Versteckter Einzelner', text: 'Manchmal hat eine Zelle viele Kandidaten – aber eine Zahl passt in ihrer Zeile, Spalte oder ihrem Block nirgendwo anders hin. Dann muss sie genau dort stehen, egal was die Zelle sonst noch zuließe.', tipp: 'Nimm eine Zahl und frage: „Wo kann diese Zahl in diesem Block noch stehen?“' },
  { tech: 'gesperrt', title: 'Gesperrte Kandidaten', text: 'Liegt eine Zahl in einem Block nur in einer einzigen Zeile (oder Spalte), dann muss sie in dieser Zeile stehen – und kann im Rest der Zeile außerhalb des Blocks nicht mehr vorkommen. Genauso umgekehrt: Liegt sie in einer Zeile nur in einem Block, fällt sie im Rest des Blocks weg.', tipp: 'Achte auf Kandidaten, die in einem Block alle in einer Linie liegen.' },
  { tech: 'nacktPaar', title: 'Nacktes Paar', text: 'Haben zwei Zellen in derselben Reihe, Spalte oder demselben Block exakt dieselben zwei Kandidaten (z. B. 3 und 7), dann gehören diese beiden Zahlen in genau diese Zellen. In allen anderen Zellen der Gruppe können 3 und 7 gestrichen werden.', tipp: 'Fülle die Notizen aus und suche zwei Zellen mit identischem Zahlenpaar.' },
  { tech: 'verstecktPaar', title: 'Verstecktes Paar', text: 'Passen zwei Zahlen in einer Gruppe nur noch in dieselben zwei Zellen, dann gehören sie dorthin – auch wenn diese Zellen noch weitere Kandidaten haben. Streiche alle anderen Kandidaten aus diesen beiden Zellen.', tipp: 'Zähle, in wie vielen Zellen jede Zahl in einer Gruppe noch möglich ist.' },
  { tech: 'nacktDrilling', title: 'Nacktes Drilling', text: 'Das gleiche Prinzip mit drei Zellen und drei Zahlen: Teilen sich drei Zellen einer Gruppe zusammen nur drei verschiedene Kandidaten, sind diese Zahlen für alle anderen Zellen der Gruppe tabu. Die Zellen müssen nicht alle drei Zahlen enthalten.', tipp: 'Zellen wie {1,2}, {2,3}, {1,3} oder {1,2,3} bilden ein Drilling.' },
  { tech: 'verstecktDrilling', title: 'Verstecktes Drilling', text: 'Drei Zahlen, die in einer Gruppe nur in denselben drei Zellen vorkommen können, gehören dorthin. Alle anderen Kandidaten in diesen drei Zellen entfallen.', tipp: 'Nutze es erst, wenn Paare nichts mehr bringen.' },
  { tech: 'xwing', title: 'X-Wing', text: 'Liegt eine Zahl in zwei Zeilen jeweils nur in denselben zwei Spalten, bilden die vier Zellen ein Rechteck. Die Zahl steht dann in einer Diagonale des Rechtecks – und kann in diesen beiden Spalten in allen anderen Zeilen gestrichen werden (ebenso mit Zeilen und Spalten vertauscht).', tipp: 'Suche eine Zahl, die in zwei Zeilen genau zweimal vorkommt – in denselben Spalten.' },
  { tech: 'swordfish', title: 'Schwertfisch', text: 'Der X-Wing mit drei Linien: Eine Zahl liegt in drei Zeilen nur in denselben drei Spalten (jede Zeile mit zwei oder drei Positionen). Dann kann sie in diesen Spalten in allen anderen Zeilen gestrichen werden.', tipp: 'Selten, aber bei Experten-Rätseln oft der Schlüssel.' },
  { tech: 'xywing', title: 'XY-Wing', text: 'Drei Zellen mit je zwei Kandidaten: ein Dreh- und zwei Flügelzellen (XY, XZ, YZ). Egal, welche Zahl die Drehzelle hat, einer der Flügel wird zur Z. Zellen, die beide Flügel sehen, können kein Z enthalten.', tipp: 'Starte bei Zellen mit genau zwei Kandidaten und suche die Kette.' },
  { tech: 'kaefig', title: 'Käfig-Kombinationen (Killer)', text: 'In einem Käfig sind alle Zahlen verschieden und ergeben die Summe. Ein Käfig mit zwei Zellen und Summe 3 kann nur aus 1 und 2 bestehen. Rechne alle möglichen Kombinationen durch: Zahlen, die in keiner vorkommen, entfallen. Ein Käfig mit drei Zellen und Summe 6 enthält zwingend 1, 2 und 3.', tipp: 'Lerne die extremen Summen: 3 und 4 mit zwei Zellen, 6 und 7 mit drei Zellen.' },
];

addAchievements([
  { game: 'sudoku', key: 'first', name: 'Erstes Rätsel', desc: 'Ein Sudoku gelöst.' },
  { game: 'sudoku', key: 'clean', name: 'Fehlerfrei', desc: 'Ohne Fehler und ohne Hinweise gelöst.' },
  { game: 'sudoku', key: 'fast', name: 'Schnelldenker', desc: 'Ein leichtes Sudoku in unter 5 Minuten.' },
  { game: 'sudoku', key: 'experte', name: 'Experte', desc: 'Ein Experten-Sudoku ohne Hilfe gelöst.' },
  { game: 'sudoku', key: 'teufel', name: 'Teufelskerl', desc: 'Ein Teufel-Sudoku ohne Hilfe gelöst.' },
  { game: 'sudoku', key: 'killer', name: 'Killer', desc: 'Ein Killer-Sudoku gelöst.' },
  { game: 'sudoku', key: 'alle', name: 'Alle Varianten', desc: 'Jede der sieben Varianten mindestens einmal gelöst.' },
  { game: 'sudoku', key: 'akademie', name: 'Absolvent', desc: 'Alle Techniken der Schule geübt.' },
  { game: 'sudoku', key: 'zehn', name: 'Rätselfreund', desc: '10 Rätsel gelöst.' },
  { game: 'sudoku', key: 'fuenfzig', name: 'Rätselmeister', desc: '50 Rätsel gelöst.' },
  { game: 'sudoku', key: 'daily', name: 'Tagesrätsel', desc: 'Das Tagesrätsel gelöst.' },
  { game: 'sudoku', key: 'eigenes', name: 'Rätselautor', desc: 'Ein eigenes Rätsel erstellt und gelöst.' },
]);
addSecrets([
  { id: 'sudoku-magic', game: 'sudoku', code: 'magic', title: 'Zauberstift', riddle: 'Ein Wort, das jeder Zauberer kennt, setzt die richtige Zahl – vorausgesetzt, du hast ein Feld gewählt.', effect: 'Trägt in die markierte Zelle die richtige Zahl ein (zählt als Hilfe).' },
  { id: 'sudoku-oracle', game: 'sudoku', code: 'orakel', title: 'Orakel', riddle: 'Die Seher der Antike sprachen in Rätseln – tippe ihren Namen auf Deutsch.', effect: 'Füllt alle Notizen mit den möglichen Zahlen (zählt als Hilfe).' },
  { id: 'sudoku-ink', game: 'sudoku', code: 'tintenfass', title: 'Tintenfass', riddle: 'Wo das Schreibzeug zu Hause ist, wechselt die Stiftfarbe.', effect: 'Wechselt zwischen dem Zeitungs-, Tinten-, Tafel- und Karo-Design.' },
]);
