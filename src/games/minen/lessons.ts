// Lernstationen des Minenfelds: kleine Stellungen, die rein logisch lösbar sind (im Test geprüft).
import { type Board, OPEN, boardFromMines } from './engine';

export interface Lesson {
  id: string;
  title: string;
  text: string;
  tip: string;
  w: number;
  h: number;
  /** Positionen der Minen (alle verdeckt) */
  mines: number[];
  /** verdeckte Felder (Minen + einige sichere) – alles andere ist schon offen */
  hidden: number[];
  /** flag: alle Minen markieren · open: alle sicheren Felder aufdecken */
  goal: 'flag' | 'open';
}

export const LESSONS: Lesson[] = [
  {
    id: 'l1', title: 'Die einzige Möglichkeit', w: 4, h: 3, mines: [0], hidden: [0], goal: 'flag',
    text: 'Jede Zahl verrät, wie viele Minen in den (bis zu acht) angrenzenden Feldern liegen. Hat eine „1“ nur noch ein verdecktes Nachbarfeld, muss dort die Mine sein. Markiere sie mit einem Rechtsklick (oder langem Druck) als Flagge.',
    tip: 'Alle drei Zahlen am Rand des verdeckten Feldes zeigen eine 1 – und sehen nur dieses eine Feld.',
  },
  {
    id: 'l2', title: 'Die Ecke mit der 3', w: 3, h: 3, mines: [1, 3, 4], hidden: [1, 3, 4], goal: 'flag',
    text: 'In einer Ecke hat ein Feld nur drei Nachbarn. Steht dort eine 3, sind alle drei Nachbarn Minen. Zahlen, die genauso viele verdeckte Nachbarn wie ihr Wert haben, sind besonders einfach.',
    tip: 'Die „3“ in der linken oberen Ecke hat genau drei verdeckte Nachbarn.',
  },
  {
    id: 'l3', title: 'Das 1-2-1-Muster', w: 3, h: 2, mines: [3, 5], hidden: [3, 4, 5], goal: 'open',
    text: 'Das berühmteste Muster: Liegt die Reihe „1 2 1“ an einer Wand aus verdeckten Feldern, sind die Felder unter den beiden 1ern Minen – das Feld unter der 2 ist sicher. Warum? Wäre es eine Mine, müsste die 2 genau eine Nachbarmine haben, aber jede 1 sieht dieses Feld und wäre schon erfüllt.',
    tip: 'Öffne das Feld unter der „2“ – danach ist die Stellung gelöst.',
  },
  {
    id: 'l4', title: 'Das 1-2-2-1-Muster', w: 4, h: 2, mines: [5, 6], hidden: [4, 5, 6, 7], goal: 'open',
    text: 'Bei „1 2 2 1“ sind die beiden mittleren Felder Minen, die äußeren sicher. Die erste 1 sieht nur eines der beiden linken Felder, die 2 darüber sieht beide plus ein drittes. Vergleiche die Mengen: Der Unterschied muss eine Mine enthalten.',
    tip: 'Die äußeren Felder (ganz links und ganz rechts unten) sind sicher.',
  },
  {
    id: 'l5', title: 'Teilmengen vergleichen', w: 5, h: 3, mines: [14, 13, 7], hidden: [14, 13, 7, 2, 4, 9, 12], goal: 'open',
    text: 'Wenn die verdeckten Nachbarn einer Zahl vollständig in den verdeckten Nachbarn einer anderen Zahl liegen, vergleichst du die beiden Minen-Anzahlen. Das, was übrig bleibt, enthält genau die Differenz an Minen. So entstehen auch Schlüsse in weniger offensichtlichen Stellungen.',
    tip: 'Suche eine Zahl, deren verdeckte Nachbarn eine Teilmenge der Nachbarn einer anderen Zahl sind.',
  },
  {
    id: 'l6', title: 'Der Minenzähler', w: 5, h: 3, mines: [4, 9, 8], hidden: [4, 9, 8, 3], goal: 'open',
    text: 'Der Zähler oben links zeigt, wie viele Minen noch fehlen. Wenn alle Minen gefunden sind, ist jedes übrige verdeckte Feld sicher – und umgekehrt: Fehlen genauso viele Minen wie Felder übrig sind, ist jedes eine Mine. Das hilft besonders am Ende eines Spiels.',
    tip: 'Finde zuerst die Minen. Danach ist das letzte verdeckte Feld sicher.',
  },
];

/** Baut das Brett einer Lektion (Felder, die nicht verdeckt sind, sind offen). */
export function lessonBoard(l: Lesson): Board {
  const b = boardFromMines({ topo: 'quad', w: l.w, h: l.h, mines: l.mines.length }, l.mines);
  const hid = new Set(l.hidden);
  for (let i = 0; i < b.n; i++) if (!hid.has(i)) { b.st[i] = OPEN; b.opened++; }
  return b;
}

export function lessonDone(l: Lesson, b: Board): boolean {
  if (l.goal === 'open') return b.opened === b.n - l.mines.length;
  for (let i = 0; i < b.n; i++) {
    if (b.mine[i] && b.st[i] !== 2) return false;
    if (!b.mine[i] && b.st[i] === 2) return false;
  }
  return true;
}
