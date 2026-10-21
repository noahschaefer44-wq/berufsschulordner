// Lektionen mit Übung: Stellung, Aufgabe und Prüfung des ersten Zuges.
import { ATT, DEF, KING, VARIANTS, buildPos, clonePos, isCorner, kingExits, make, result, type Mv, type Pos, type Side } from './engine';

export interface Lesson {
  id: string;
  title: string;
  text: string;
  task: string;
  hint: string;
  /** Seite, die in der Übung zieht */
  side: Side;
  setup: () => Pos;
  check: (before: Pos, m: Mv) => boolean;
  why: string;
}

const B = VARIANTS[0]; // Brandubh 7×7
const K = VARIANTS[2]; // Kopenhagen 11×11
const after = (p: Pos, m: Mv) => { const c = clonePos(p); make(c, m); return c; };

export const LESSONS: Lesson[] = [
  {
    id: 'ziehen', title: 'Ziehen wie ein Turm',
    text: 'Alle Figuren – auch der König – ziehen beliebig weit geradeaus, waagerecht oder senkrecht, wie ein Turm im Schach. Springen ist verboten: Jedes Feld auf dem Weg muss frei sein. Geschlagen wird nicht durch Draufziehen, sondern anders (nächste Lektion).',
    task: 'Ziehe den Angreifer so weit wie möglich nach rechts.', hint: 'Klicke den Angreifer an, dann das äußerste Feld rechts.', side: 0,
    setup: () => buildPos(B, 0, [[1, 1, ATT], [5, 5, DEF], [3, 3, KING]]),
    check: (b, m) => b.b[m.from] === ATT && m.to === 1 * 7 + 6,
    why: 'Der Weg war frei bis zum Rand. Merke: Figuren sperren sich gegenseitig – oft ist der Weg des Königs durch eigene Verteidiger verstellt.',
  },
  {
    id: 'schlagen', title: 'Schlagen durch Einklemmen',
    text: 'Eine Figur wird geschlagen, wenn deine Figur sie durch einen Zug auf der einen Seite einklemmt und auf der gegenüberliegenden Seite schon ein Gegner (oder ein feindliches Feld) steht. Beide Seiten schlagen so – auch der König schlägt mit. Eine Figur, die selbst zwischen zwei Gegner zieht, ist sicher.',
    task: 'Schlage den Verteidiger.', hint: 'Ziehe den freien Angreifer auf die andere Seite des Verteidigers.', side: 0,
    setup: () => buildPos(B, 0, [[2, 2, ATT], [2, 3, DEF], [5, 4, ATT], [6, 6, DEF], [3, 5, KING]]),
    check: (b, m) => after(b, m).b[2 * 7 + 3] === 0,
    why: 'Der Verteidiger stand zwischen dem wartenden und dem ziehenden Angreifer – damit ist er geschlagen.',
  },
  {
    id: 'sicher', title: 'Zwischen zwei Gegnern ist man sicher',
    text: 'Die Einklemm-Regel gilt nur für den ziehenden Spieler. Eine Figur darf also gefahrlos zwischen zwei gegnerische ziehen. Das benutzt man, um Linien zu blockieren oder Beute zu bedrohen.',
    task: 'Ziehe den Verteidiger zwischen die beiden Angreifer.', hint: 'Das Feld zwischen den beiden Angreifern in der vierten Reihe von oben.', side: 1,
    setup: () => buildPos(B, 1, [[4, 1, ATT], [4, 3, ATT], [6, 2, DEF], [1, 6, ATT], [2, 5, KING]]),
    check: (b, m) => b.b[m.from] === DEF && m.to === 4 * 7 + 2 && after(b, m).b[4 * 7 + 2] === DEF,
    why: 'Er steht zwischen zwei Angreifern und lebt – denn du bist gezogen. Gefährlich wird es erst, wenn ein Angreifer wegzieht und später zurückkehrt.',
  },
  {
    id: 'thron', title: 'Thron und Ecken',
    text: 'Das Mittelfeld ist der Thron, die vier Eckfelder sind Fluchtziele. Nur der König darf dort landen; andere Figuren dürfen über den leeren Thron hinwegziehen, aber nicht darauf stehen. Thron und Ecken wirken als Gegner: Wer daneben steht, kann dagegen eingeklemmt werden.',
    task: 'Schlage den Angreifer neben dem leeren Thron.', hint: 'Der Thron ist der zweite Gegner. Ein Verteidiger auf die andere Seite genügt.', side: 1,
    setup: () => buildPos(B, 1, [[3, 2, ATT], [6, 1, DEF], [6, 6, ATT], [5, 5, KING]]),
    check: (b, m) => after(b, m).b[3 * 7 + 2] === 0,
    why: 'Der leere Thron hat als Amboss gedient. Der Angreifer war verloren, sobald ein Verteidiger auf seine andere Seite zog.',
  },
  {
    id: 'flucht', title: 'Die Flucht des Königs',
    text: 'Ziel der Verteidiger: Der König muss eine der vier Ecken erreichen (bei Tablut genügt jedes Randfeld). Er zieht dabei wie jede Figur geradeaus – hat er eine freie Linie zum Ziel, gewinnt er sofort.',
    task: 'Bringe den König in eine Ecke.', hint: 'Eine freie Reihe vom König bis zur Ecke.', side: 1,
    setup: () => buildPos(B, 1, [[0, 3, KING], [2, 4, DEF], [6, 3, ATT], [4, 4, ATT]]),
    check: (b, m) => b.b[m.from] === KING && isCorner(7, m.to),
    why: 'Eine freie Linie bis zur Ecke – und das Spiel ist vorbei. Angreifer müssen genau das immer verhindern.',
  },
  {
    id: 'gabel', title: 'Die Gabel',
    text: 'Bedroht der König gleichzeitig zwei Fluchtfelder, kann der Gegner nur eines sperren – du gewinnst. Das wichtigste Motiv der Verteidiger: einen Zug finden, nach dem der König zwei freie Linien zu Fluchtfeldern hat.',
    task: 'Ziehe den König so, dass er zwei Ecken gleichzeitig bedroht.', hint: 'Eine Randreihe, in der beide Ecken frei sind.', side: 1,
    setup: () => buildPos(B, 1, [[2, 3, KING], [4, 4, ATT], [5, 2, ATT], [6, 3, ATT]]),
    check: (b, m) => b.b[m.from] === KING && kingExits(after(b, m)).length >= 2,
    why: 'Zwei Fluchtfelder auf einmal: Der Gegner kann nur eines versperren. So gewinnt man Partien.',
  },
  {
    id: 'block', title: 'Blockieren als Angreifer',
    text: 'Als Angreifer musst du jede Fluchtlinie des Königs sofort schließen. Ziehe eine Figur auf die Linie zwischen König und Ziel – möglichst so, dass sie dort nicht eingeklemmt werden kann. Noch besser: Bewache die Ecken schon vorher.',
    task: 'Der König droht zu entkommen – blockiere die Linie.', hint: 'Ein Feld zwischen König und Ecke.', side: 0,
    setup: () => buildPos(B, 0, [[0, 3, KING], [0, 5, DEF], [4, 1, ATT], [6, 4, ATT], [5, 5, ATT]]),
    check: (b, m) => { const a = after(b, m); return kingExits(a).length === 0 && !result(a); },
    why: 'Fluchtweg zu. Achte darauf, dass der blockierende Stein nicht eingeklemmt werden kann – sonst öffnet sich die Linie wieder.',
  },
  {
    id: 'koenigsfang', title: 'Den König fangen',
    text: 'In Brandubh und Tablut wird der König fern vom Thron von zwei Angreifern wie jede andere Figur geschlagen. Auf dem Thron oder daneben braucht es vier bzw. drei Angreifer, in der Kopenhagener Variante immer vier. Die Angreifer gewinnen sofort, wenn der König fällt.',
    task: 'Fange den König.', hint: 'Der König steht zwischen einem Angreifer und einem freien Feld.', side: 0,
    setup: () => buildPos(B, 0, [[1, 1, KING], [1, 0, ATT], [6, 2, ATT], [4, 5, DEF]]),
    check: (b, m) => result(after(b, m))?.winner === 0,
    why: 'Sieg für die Angreifer: Der König war eingeklemmt. In engen Stellungen lohnt es sich, ihn zu jagen.',
  },
  {
    id: 'ecke', title: 'Ecken bewachen',
    text: 'Gute Angreifer bauen früh Wachen an den Ecken: Eine Figur diagonal vor der Ecke und je eine daneben am Rand verhindert die Flucht für lange Zeit. Auf dem großen Brett ist das die wichtigste Strategie der Angreifer.',
    task: 'Stelle einen Angreifer auf das Diagonalfeld vor der unteren rechten Ecke.', hint: 'Das Feld schräg nach innen von der Ecke.', side: 0,
    setup: () => buildPos(K, 0, [[9, 3, ATT], [5, 5, KING], [4, 5, DEF], [7, 5, DEF], [0, 5, ATT]]),
    check: (b, m) => b.b[m.from] === ATT && m.to === 9 * 11 + 9,
    why: 'Die Ecke ist damit schwer erreichbar: Ein Angreifer in der Diagonalen blockiert beide Randlinien in Ecknähe.',
  },
];
