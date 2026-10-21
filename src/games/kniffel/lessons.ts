// Lektionen mit Übung: Stellung (Karte, Würfel, Würfe) und Prüfung der Antwort.
import { VARIANTS, analyze, emptyCard, evOfHold, fill, type Card, type CatId, type Variant } from './engine';

export interface Lesson {
  id: string;
  title: string;
  text: string;
  task: string;
  hint: string;
  why: string;
  variant: Variant;
  card: () => Card;
  dice: number[];
  rollsLeft: number;
  /** hold: Würfel auswählen; cat: Feld wählen; quiz: eine Antwort anklicken */
  kind: 'hold' | 'cat' | 'quiz';
  options?: string[];
  correct?: number;
  /** hold: Prüfung der gehaltenen Werte; cat: Prüfung des Feldes */
  checkHold?: (held: number[]) => boolean;
  checkCat?: (cat: CatId) => boolean;
}

const C = VARIANTS[0], M = VARIANTS[1];

/** Karte mit schon eingetragenen Feldern (Würfel je Feld frei gewählt). */
const cardWith = (v: Variant, list: [CatId, number[]][]): Card => list.reduce((c, [cat, d]) => fill(v, c, cat, d), emptyCard());

/** Haltemenge ist (nahezu) so gut wie die beste: Abstand höchstens `tol` Punkte. */
const goodHold = (v: Variant, card: () => Card, dice: number[], rolls: number, tol: number) => (held: number[]) => {
  const a = analyze(v, card(), dice, rolls);
  return evOfHold(a, held) >= a.holds[0].ev - tol;
};
const bestCat = (v: Variant, card: () => Card, dice: number[], tol: number) => (cat: CatId) => {
  const a = analyze(v, card(), dice, 0);
  const x = a.cats.find((c) => c.cat === cat);
  return !!x && x.value >= a.cats[0].value - tol;
};

const cEmpty = () => emptyCard();
const cMid = () => cardWith(C, [['n1', [1, 1, 3, 4, 6]], ['n6', [6, 6, 2, 3, 4]], ['chance', [2, 3, 3, 5, 6]]]);
const cLate = () => cardWith(C, [['n1', [1, 2, 3, 4, 6]], ['n2', [2, 2, 3, 4, 5]], ['n3', [3, 3, 4, 5, 6]], ['n4', [4, 4, 5, 6, 1]], ['n5', [5, 5, 1, 2, 3]], ['three', [2, 2, 2, 4, 5]], ['four', [5, 5, 5, 5, 3]], ['fh', [3, 3, 4, 4, 4]], ['ss', [1, 2, 3, 4, 6]]]);

export const LESSONS: Lesson[] = [
  {
    id: 'ablauf', title: 'Der Ablauf',
    text: 'Du würfelst fünf Würfel und darfst pro Zug bis zu dreimal werfen. Nach dem ersten und zweiten Wurf legst du Würfel zur Seite („halten“) und würfelst nur die übrigen neu. Danach musst du das Ergebnis in genau ein Feld deines Blocks eintragen. Passt nichts, streichst du ein Feld mit null Punkten. Nach 13 Zügen sind alle Felder voll.',
    task: 'Du hast zwei Sechser. Halte sie fest.', hint: 'Klicke die beiden Sechser an und prüfe.', why: 'Zwei Sechser sind ein Anfang: Gelingt mehr, zählt jeder Sechser sechs Punkte – oder ein Pasch.',
    variant: C, card: cEmpty, dice: [6, 2, 6, 3, 5], rollsLeft: 2, kind: 'hold',
    checkHold: (h) => h.length === 2 && h[0] === 6 && h[1] === 6,
  },
  {
    id: 'pasch', title: 'Pasch aufbauen',
    text: 'Gleiche Augenzahlen sind die wichtigste Zutat: Aus ihnen entstehen Dreierpasch, Viererpasch, Full House, Kniffel und die Summen des oberen Blocks. Hast du ein Paar, behalte es – meist ist das besser als zu hoffen, dass andere Würfel zueinander passen.',
    task: 'Welche Würfel behältst du? (zwei Würfel nach dem ersten Wurf)', hint: 'Das Paar ist am wertvollsten.', why: 'Das Paar bringt die besten Chancen auf Pasch, Full House und obere Felder.',
    variant: C, card: cEmpty, dice: [4, 4, 1, 2, 6], rollsLeft: 2, kind: 'hold',
    checkHold: goodHold(C, cEmpty, [4, 4, 1, 2, 6], 2, 0.4),
  },
  {
    id: 'strasse', title: 'Auf Straße spielen',
    text: 'Für die Kleine Straße (vier aufeinanderfolgende Zahlen, 30 Punkte) und die Große Straße (fünf, 40 Punkte) hältst du jeden Würfel, der zur Reihe passt – nur einmal je Zahl. Doppelte Zahlen sind nutzlos und werden neu gewürfelt. Mit vier fehlt oft nur ein Wurf (ein Drittel bis ein Sechstel Chance).',
    task: 'Du hast 2, 3, 4, 6 und 6. Was hältst du?', hint: 'Für die Straße zählt jede Zahl nur einmal.', why: 'Du behältst die 2, 3, 4 (und ggf. die 6) und würfelst den Rest – so fehlt bis zur Straße nur noch eine oder zwei Zahlen.',
    variant: C, card: cEmpty, dice: [2, 3, 4, 6, 6], rollsLeft: 2, kind: 'hold',
    checkHold: goodHold(C, cEmpty, [2, 3, 4, 6, 6], 2, 0.5),
  },
  {
    id: 'feld', title: 'Das richtige Feld',
    text: 'Entscheidend ist nicht nur, wie viele Punkte du bekommst, sondern was du verschenkst: Jedes Feld hat einen üblichen Wert (Sechser etwa 19, Große Straße etwa 33). Trage dort ein, wo du am meisten über dem Üblichen liegst – und streiche, wo es am wenigsten wehtut (Einser, Kniffel am Ende).',
    task: 'Das Ergebnis ist fertig: 5, 5, 5, 2, 1. In welches Feld trägst du ein?', hint: 'Drei Fünfer sind fünfzehn Punkte – genau das übliche Ergebnis, plus Weg zum Bonus.', why: 'Im oberen Block führen drei Gleiche zum Bonus; die 15 Punkte sind genau das nötige Soll bei den Fünfern.',
    variant: C, card: cEmpty, dice: [5, 5, 5, 2, 1], rollsLeft: 0, kind: 'cat',
    checkCat: bestCat(C, cEmpty, [5, 5, 5, 2, 1], 0.6),
  },
  {
    id: 'streichen', title: 'Streichen',
    text: 'Manchmal passt nichts. Dann trägst du null ein – aber in das Feld, das am wenigsten kostet. Die Einser sind meist das billigste Opfer (nur etwa zwei Punkte üblich). Der Kniffel ist das teuerste Feld zu streichen, aber früh im Spiel ist er schwer zu treffen.',
    task: 'Die Würfel 1, 2, 4, 4, 6 passen kaum. Wo trägst du ein?', hint: 'Welches Feld verlierst du am leichtesten?', why: 'Bei den Einsern gibst du nur etwa 1 Punkt ab – und der Bonus ist noch erreichbar.',
    variant: C, card: cMid, dice: [1, 2, 4, 4, 6], rollsLeft: 0, kind: 'cat',
    checkCat: bestCat(C, cMid, [1, 2, 4, 4, 6], 0.8),
  },
  {
    id: 'ende', title: 'Endspiel',
    text: 'Zum Schluss sind nur noch wenige Felder offen. Jetzt entscheidet jede Wurf-Wahrscheinlichkeit: Du weißt, welche Felder noch fehlen, und kannst gezielt darauf spielen. Wer eine Große Straße offen hat und 1-2-3-4 sieht, würfelt auf die 5 – und nimmt in Kauf, dass es nicht klappt.',
    task: 'Offen sind noch Sechser, Große Straße, Kniffel und Chance. Du hast 1, 2, 3, 4, 6 – und noch einen Wurf. Was behältst du?', hint: 'Wie oft kommt die 5 – und wie oft die 5 zusammen mit der 1?', why: 'Du behältst 1, 2, 3, 4 und würfelst die 6 neu: Mit einer 5 hast du die Große Straße.',
    variant: C, card: cLate, dice: [1, 2, 3, 4, 6], rollsLeft: 1, kind: 'hold',
    checkHold: goodHold(C, cLate, [1, 2, 3, 4, 6], 1, 0.5),
  },
  {
    id: 'chance', title: 'Wie wahrscheinlich ist ein Kniffel?',
    text: 'Fünf gleiche Würfel in einem Zug zu erreichen, gelingt nur etwa jedem 22. Mal. Hast du schon vier gleiche und noch einen Wurf, ist die Chance mit dem letzten Würfel genau 1 zu 6: Du brauchst eine bestimmte Zahl.',
    task: 'Du hältst vier gleiche Würfel und würfelst den fünften noch einmal. Wie wahrscheinlich ist ein Kniffel?', hint: 'Der letzte Würfel muss eine ganz bestimmte Zahl zeigen.', why: 'Einer von sechs Würfen trifft: etwa 17 Prozent. Mit zwei Würfen steigt die Chance auf etwa 31 Prozent.',
    variant: C, card: cEmpty, dice: [5, 5, 5, 5, 1], rollsLeft: 1, kind: 'quiz', options: ['1 zu 36 (3 %)', '1 zu 6 (17 %)', '1 zu 3 (33 %)', '1 zu 2 (50 %)'], correct: 1,
  },
  {
    id: 'maxi', title: 'Maxi-Kniffel',
    text: 'Maxi-Kniffel wird mit sechs Würfeln gespielt und hat 20 Felder: Neben den Zahlen und Pasch-Feldern gibt es Paare, Villa (zweimal drei gleiche), Turm (vier und zwei gleiche) und die Volle Straße. Der Maxi-Kniffel – sechs gleiche – bringt 100 Punkte; der obere Bonus (50) braucht 84 Punkte.',
    task: 'Die Würfel zeigen 4, 4, 4, 2, 2, 2. Wie viele Punkte bringt eine Villa?', hint: 'Die Villa zählt die Summe aller sechs Würfel.', why: '3 × 4 plus 3 × 2 ergibt 18 Punkte.',
    variant: M, card: cEmpty, dice: [4, 4, 4, 2, 2, 2], rollsLeft: 0, kind: 'quiz', options: ['12', '18', '24', '30'], correct: 1,
  },
];

export const LESSON_VARIANTS = { C, M };
