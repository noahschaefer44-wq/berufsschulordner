// Lektionen mit Übung: Stellung, Aufgabe und Prüfung der gewählten Mulde.
import { buildPos, legalMoves, play, sowLength, type Pos, type Rules, type Side } from './engine';

export interface Lesson {
  id: string;
  title: string;
  text: string;
  task: string;
  hint: string;
  rules: Rules;
  side: Side;
  setup: () => Pos;
  /** Wahr, wenn die gewählte Mulde die Aufgabe löst */
  check: (before: Pos, pit: number) => boolean;
  why: string;
}

const K: Rules = { v: 'kalah', n: 6, seeds: 4 };
const O: Rules = { v: 'oware', n: 6, seeds: 4 };
const L: Rules = { v: 'lawine', n: 6, seeds: 4 };

export const LESSONS: Lesson[] = [
  {
    id: 'saeen', title: 'Säen',
    text: 'Du sitzt unten, deine sechs Mulden liegen vor dir. In einem Zug nimmst du alle Samen aus einer deiner Mulden und legst sie nacheinander in die folgenden Mulden – gegen den Uhrzeigersinn: erst nach rechts, dann in deinen Speicher (rechts außen), dann über die Mulden des Gegners zurück. Den Speicher des Gegners lässt du aus.',
    task: 'Säe aus der Mulde mit den meisten Samen.', hint: 'Zähle die Samen – die größte Mulde liegt in der Mitte.', rules: K, side: 0,
    setup: () => buildPos(K, 0, [3, 5, 2, 6, 1, 4], [4, 4, 4, 4, 4, 4]),
    check: (b, i) => { const n = b.r.n; const c = (k: number) => b.b[k]; return c(i) === Math.max(...Array.from({ length: n }, (_, k) => c(k))); },
    why: 'Sechs Samen: einer in die nächste Mulde, einer in den Speicher, dann drei in den Gegner-Mulden … Je mehr Samen, desto weiter reicht die Aussaat.',
  },
  {
    id: 'extrazug', title: 'Der Extrazug',
    text: 'Landet dein letzter Samen genau in deinem Speicher, darfst du sofort nochmal ziehen. Die Mulde i (von links gezählt) liegt 6 − i Felder vor dem Speicher: Hat sie genau so viele Samen, kommt der letzte in den Speicher. Solche Mulden zu finden ist der wichtigste Handgriff beim Kalah.',
    task: 'Finde die Mulde, die dir einen Extrazug bringt.', hint: 'Mulde 1 ist sechs Felder vom Speicher entfernt, Mulde 6 nur eines.', rules: K, side: 0,
    setup: () => buildPos(K, 0, [2, 1, 1, 3, 4, 2], [4, 4, 4, 4, 4, 4]),
    check: (b, i) => play(b, i).extra,
    why: 'Mulde 4 hat drei Samen und liegt drei Felder vor dem Speicher – der letzte fällt hinein, und du bist noch einmal dran.',
  },
  {
    id: 'fangen', title: 'Samen fangen',
    text: 'Landet dein letzter Samen in einer leeren Mulde auf deiner eigenen Seite und liegt gegenüber beim Gegner mindestens ein Samen, nimmst du beides – den fangenden Samen und alles, was gegenüber liegt – in deinen Speicher. Große Gegner-Mulden sind deine Beute.',
    task: 'Fange die große Gegner-Mulde.', hint: 'Welche Mulde endet in einer leeren Mulde direkt vor der Beute?', rules: K, side: 0,
    setup: () => buildPos(K, 0, [1, 0, 0, 2, 0, 3], [2, 3, 1, 0, 6, 2]),
    check: (b, i) => play(b, i).captured >= 7,
    why: 'Ein Samen wandert in die leere Mulde 2 – gegenüber lagen sechs. Zusammen sieben Samen in deinem Speicher.',
  },
  {
    id: 'abwehr', title: 'Abwehr',
    text: 'Der Gegner kann genau so fangen: Er braucht eine eigene leere Mulde, in der sein Zug endet, und deine große Mulde gegenüber. Prüfe vor jedem Zug, was der Gegner damit anfangen kann. Du kannst die bedrohte Mulde leeren, oder die Mulde, in der er landen würde, füllen.',
    task: 'Der Gegner droht, deine große Mulde zu fangen. Verhindere es.', hint: 'Welche eigene Mulde ist bedroht – und wie lässt sie sich leeren?', rules: K, side: 0,
    setup: () => buildPos(K, 0, [3, 1, 0, 2, 7, 1], [1, 0, 3, 2, 1, 4]),
    check: (b, i) => {
      const r = play(b, i);
      if (r.pos.over) return true;
      let worst = 0;
      for (const j of legalMoves(r.pos)) worst = Math.max(worst, play(r.pos, j).captured);
      return r.pos.turn === 1 ? worst < 5 : true;
    },
    why: 'Mit dem Zug aus der Mulde 5 ist die Beute weg – oder die Lücke gefüllt. Immer zuerst fragen: Was droht mir?',
  },
  {
    id: 'kette', title: 'Ketten aus Extrazügen',
    text: 'Extrazüge lassen sich verketten: Spiele zuerst die Mulde, die am nächsten am Speicher liegt – danach passt oft die nächste genau. Wer die Reihenfolge klug wählt, holt in einem Zug viele Samen.',
    task: 'Spiele den Extrazug, nach dem noch ein weiterer möglich bleibt.', hint: 'Zwei Mulden bringen einen Extrazug – eine davon macht die andere kaputt.', rules: K, side: 0,
    setup: () => buildPos(K, 0, [0, 0, 0, 3, 0, 1], [4, 4, 4, 4, 4, 4]),
    check: (b, i) => { const r = play(b, i); return r.extra && legalMoves(r.pos).some((j) => play(r.pos, j).extra); },
    why: 'Erst die einzelne Mulde ganz rechts, dann die mit drei Samen – die Reihenfolge entscheidet, ob die Kette hält.',
  },
  {
    id: 'oware', title: 'Oware: Schlagen',
    text: 'Bei Oware gibt es keine Speicher zum Säen: Alle Samen laufen im Kreis. Wer seine Aussaat in einer gegnerischen Mulde enden lässt und sie damit auf zwei oder drei Samen bringt, nimmt sie – und dann rückwärts jede weitere gegnerische Mulde mit zwei oder drei. Gewonnen hat, wer mehr als die Hälfte aller Samen erbeutet.',
    task: 'Schlage Samen des Gegners.', hint: 'Der letzte Samen muss eine gegnerische Mulde mit 1 oder 2 Samen auf 2 oder 3 bringen.', rules: O, side: 0,
    setup: () => buildPos(O, 0, [0, 2, 1, 0, 3, 0], [1, 1, 4, 0, 0, 5]),
    check: (b, i) => play(b, i).captured > 0,
    why: 'Die letzten beiden Samen füllen die Mulden des Gegners auf je zwei – beide werden geschlagen, und zwar zusammen.',
  },
  {
    id: 'lawine', title: 'Lawine: Weitersäen',
    text: 'Bei der Lawine endet die Aussaat nicht, wenn der letzte Samen in einer vollen Mulde landet: Du nimmst alle Samen dieser Mulde auf und säst weiter. So kann ein einziger Zug quer über das ganze Brett laufen. Er endet erst im Speicher (Extrazug) oder in einer leeren Mulde (eventuell Fang).',
    task: 'Wähle die Mulde mit der längsten Lawine.', hint: 'Probiere die Mulden gedanklich durch – achte darauf, wo der letzte Samen landet.', rules: L, side: 0,
    setup: () => buildPos(L, 0, [2, 3, 1, 5, 2, 4], [3, 2, 5, 1, 4, 3]),
    check: (b, i) => { const ms = legalMoves(b); return sowLength(b, i) === Math.max(...ms.map((j) => sowLength(b, j))); },
    why: 'Je länger die Kette, desto schwerer lässt sich der Zug vorausberechnen. Die KI rechnet es für dich – aber nur du entscheidest.',
  },
];
