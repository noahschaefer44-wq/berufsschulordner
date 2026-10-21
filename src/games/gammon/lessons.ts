import { type BG, type Mv, pips, startPosition } from './engine';

/** Stellung aus Listen: Weiß/Schwarz jeweils in Koordinaten der eigenen Seite (24 = hinterster Punkt, 25 = Bar). */
export function makePos(w: Record<number, number>, b: Record<number, number>, off: [number, number] = [0, 0], total = 15): BG {
  const s = startPosition();
  s.pts.fill(0); s.bar = [0, 0]; s.off = off; s.total = total;
  for (const [q, n] of Object.entries(w)) { if (+q === 25) s.bar[0] = n; else s.pts[+q - 1] = n; }
  for (const [q, n] of Object.entries(b)) { if (+q === 25) s.bar[1] = n; else s.pts[24 - +q] = -n; }
  return s;
}

export type Step =
  | { t: 'text'; title?: string; text: string; show?: BG }
  | { t: 'task'; title: string; text: string; hint: string; pos: BG; dice: [number, number]; goal: (end: BG, moves: Mv[]) => boolean; fail: string }
  | { t: 'quiz'; title: string; text: string; pos: BG; answer: (s: BG) => number };

export interface Lesson { id: string; title: string; summary: string; steps: Step[] }

const own5 = (end: BG, q: number) => (q >= 1 ? end.pts[q - 1] : 0);

export const LESSONS: Lesson[] = [
  {
    id: 'ziel', title: 'Aufbau und Ziel', summary: 'Brett, Steine, Laufrichtung – und worum es geht.',
    steps: [
      { t: 'text', title: 'Worum es geht', text: 'Jeder Spieler hat 15 Steine. Beide ziehen in entgegengesetzte Richtungen um das Brett herum ins eigene Heimfeld (die letzten sechs Punkte) und würfeln sie dort aus. Wer zuerst alle Steine ausgewürfelt hat, gewinnt.', show: startPosition() },
      { t: 'text', title: 'Die Punkte', text: 'Das Brett hat 24 Zacken, „Punkte“ genannt. Aus deiner Sicht sind sie von 1 (ganz nah am Ausgang) bis 24 (ganz hinten) nummeriert. Dein Heimfeld ist unten rechts: die Punkte 1 bis 6. Der Gegner zählt von seiner Seite aus – sein 24-Punkt ist dein 1-Punkt.' },
      { t: 'text', title: 'Würfel und Bewegung', text: 'Du würfelst mit zwei Würfeln. Jeder Würfel ist ein eigener Zug: Eine 5 und eine 3 bedeuten, einen Stein 5 Felder und einen (oder denselben) 3 Felder weiterzuziehen. Pasch (zwei gleiche Würfel) zählt vierfach.' },
      { t: 'text', title: 'Wohin darf ich ziehen?', text: 'Du darfst auf freie Punkte ziehen, auf Punkte mit eigenen Steinen und auf Punkte, auf denen genau ein gegnerischer Stein steht. Auf Punkte mit zwei oder mehr gegnerischen Steinen darfst du nicht. Kannst du beide Würfel spielen, musst du es tun; kannst du nur einen, musst du den größeren nehmen, wenn möglich.' },
    ],
  },
  {
    id: 'schlagen', title: 'Schlagen und Bar', summary: 'Einzelne Steine sind verwundbar.',
    steps: [
      { t: 'text', title: 'Blots', text: 'Ein einzelner Stein auf einem Punkt heißt „Blot“. Landet ein gegnerischer Stein darauf, wird er „geschlagen“ und auf die Bar in der Mitte gelegt. Zwei oder mehr Steine auf einem Punkt sind sicher.' },
      { t: 'task', title: 'Schlage den Blot', text: 'Auf deinem 9-Punkt steht ein einzelner schwarzer Stein. Würfel: 4 und 2. Schlage ihn!', hint: 'Von deinem 13-Punkt sind es genau 4 Felder bis zum 9-Punkt.', pos: makePos({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 16: 1, 24: 2, 13: 5, 8: 3, 6: 4 }), dice: [4, 2], goal: (_e, m) => m.some((x) => x.hit), fail: 'Schlagen war möglich – probiere es noch einmal.' },
      { t: 'text', title: 'Die Bar', text: 'Wer geschlagen wurde, muss zuerst wieder hereinwürfeln, bevor er irgendetwas anderes ziehen darf. Der Eintrittspunkt ergibt sich aus dem Würfel: Eine 1 bringt dich auf deinen 24-Punkt, eine 6 auf den 19-Punkt. Ist der Punkt vom Gegner mit zwei oder mehr Steinen besetzt, ist dieser Würfel verloren.' },
      { t: 'task', title: 'Eintreten', text: 'Dein Stein ist auf der Bar. Der Gegner hält die Punkte 24, 23 und 22 (deine 1, 2, 3 aus seiner Sicht). Würfel: 3 und 5. Bringe ihn mit der 5 herein und ziehe danach mit der 3 den Stein vom 7-Punkt auf den 4-Punkt.', hint: 'Die 3 ist beim Eintreten blockiert (22). Mit der 5 kommst du auf den 20-Punkt; danach geht 7/4.', pos: makePos({ 25: 1, 13: 5, 8: 3, 7: 1, 6: 5 }, { 1: 2, 2: 2, 3: 2, 24: 2, 13: 4, 8: 3 }), dice: [3, 5], goal: (e, m) => e.bar[0] === 0 && m.some((x) => x.from === 7 && x.to === 4), fail: 'Erst herein (5), dann 7/4 (3).' },
    ],
  },
  {
    id: 'punkte', title: 'Punkte und Blockaden', summary: 'Zwei Steine zusammen sind eine Mauer.',
    steps: [
      { t: 'text', title: 'Punkte machen', text: 'Zwei Steine auf demselben Punkt „machen“ den Punkt: Der Gegner darf dort nicht landen. Besonders wertvoll sind die Punkte im eigenen Heimfeld – vor allem der 5-Punkt und der 4-Punkt – und der Bar-Punkt (7).' },
      { t: 'task', title: 'Mache den 4-Punkt', text: 'Würfel: 4 und 2. Mache den 4-Punkt (er hat noch keinen Stein).', hint: '8/4 und 6/4: zwei Steine auf die 4.', pos: startPosition(), dice: [4, 2], goal: (e) => own5(e, 4) >= 2, fail: 'Zwei Steine müssen auf dem 4-Punkt landen.' },
      { t: 'text', title: 'Blockade (Prime)', text: 'Mehrere gemachte Punkte hintereinander bilden eine Mauer. Sechs Punkte in Folge (eine „volle Prime“) kann der Gegner gar nicht mehr überspringen. Schon vier bis fünf Punkte machen das Entkommen schwer.' },
      { t: 'task', title: 'Der beste Eröffnungszug für 3-1', text: 'Würfel: 3 und 1. Mache den wichtigsten Punkt deines Heimfelds.', hint: '8/5 und 6/5 machen den 5-Punkt.', pos: startPosition(), dice: [3, 1], goal: (e) => own5(e, 5) >= 2, fail: 'Der 5-Punkt braucht zwei Steine.' },
    ],
  },
  {
    id: 'auswuerfeln', title: 'Auswürfeln', summary: 'Der Weg ins Ziel.',
    steps: [
      { t: 'text', title: 'Wann darf man auswürfeln?', text: 'Erst wenn alle 15 Steine im Heimfeld stehen (Punkte 1–6), darfst du Steine vom Brett nehmen. Ein Würfel nimmt den Stein vom Punkt mit genau dieser Zahl. Ist dort keiner, musst du einen anderen Stein ziehen – ist kein Stein weiter hinten, darfst du den hintersten mit der größeren Zahl auswürfeln.' },
      { t: 'task', title: 'Zwei Steine runter', text: 'Würfel: 4 und 3. Würfle zwei Steine aus.', hint: 'Die 4 nimmt einen Stein vom 4-Punkt, die 3 einen vom 3-Punkt.', pos: makePos({ 6: 1, 5: 2, 4: 2, 3: 1, 2: 2 }, { 24: 2, 13: 3 }, [7, 0]), dice: [4, 3], goal: (e) => e.off[0] >= 9, fail: 'Würfle beide Steine aus.' },
      { t: 'text', title: 'Gammon', text: 'Gewinnst du, bevor der Gegner einen einzigen Stein ausgewürfelt hat, ist das ein „Gammon“ (doppelte Wertung). Steht dann sogar noch ein gegnerischer Stein auf der Bar oder in deinem Heimfeld, ist es ein „Backgammon“ (dreifach).' },
    ],
  },
  {
    id: 'pips', title: 'Pips zählen', summary: 'Wer liegt im Rennen vorn?',
    steps: [
      { t: 'text', title: 'Augenzahl', text: 'Die „Pips“ eines Spielers sind die Summe der Entfernungen aller seiner Steine bis zum Auswürfeln. Ein Stein auf dem 24-Punkt zählt 24, auf der Bar 25. Wer weniger Pips hat, liegt im Rennen vorn. Ein Wurf bringt im Mittel etwa 8 Pips.' },
      { t: 'quiz', title: 'Pip-Zählung', text: 'Wie viele Pips hat Weiß in dieser Stellung? (Punkt × Anzahl Steine, aufsummieren.)', pos: makePos({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 5 }), answer: (s) => pips(s, 0) },
      { t: 'quiz', title: 'Noch eine', text: 'Wie viele Pips hat Weiß jetzt?', pos: makePos({ 20: 2, 13: 4, 10: 2, 7: 3, 4: 4 }, { 24: 2, 13: 5 }), answer: (s) => pips(s, 0) },
    ],
  },
  {
    id: 'cube', title: 'Der Doppelwürfel', summary: 'Einsätze verdoppeln – mit Mut und Verstand.',
    steps: [
      { t: 'text', title: 'Wie er funktioniert', text: 'Der Doppelwürfel steht anfangs in der Mitte auf 64 (= 1). Wer am Zug ist, darf vor dem Würfeln verdoppeln. Der Gegner nimmt an (Einsatz verdoppelt, der Würfel wandert zu ihm) oder gibt auf (der Doppler bekommt den bisherigen Wert). Danach darf nur der Besitzer des Würfels wieder verdoppeln.' },
      { t: 'text', title: 'Wann doppeln?', text: 'Als Faustregel: Verdopple, wenn du etwa 70 % Gewinnchance hast, aber noch nicht so klar vorn liegst, dass der Gegner ohnehin aufgeben würde. Nimm an, wenn du mindestens etwa 25 % Chance hast. Die Spielhalle bewertet deine Entscheidungen im Trainer mit der Engine.' },
      { t: 'text', title: 'Match und Crawford', text: 'Im Match gewinnt, wer zuerst die vereinbarte Punktzahl erreicht. Fehlt einem Spieler genau ein Punkt, gilt im nächsten Spiel die Crawford-Regel: kein Doppelwürfel.' },
    ],
  },
  {
    id: 'plan', title: 'Pläne und Strategie', summary: 'Rennen, Blockade, Rückspiel.',
    steps: [
      { t: 'text', title: 'Rennspiel', text: 'Liegst du vorn, willst du Kontakt vermeiden: sicher nach Hause laufen und keine Blots hinterlassen.' },
      { t: 'text', title: 'Blockadespiel', text: 'Liegst du hinten, hilft dir ein Anker (zwei Steine auf einem gegnerischen Punkt, besonders dem 20-Punkt), damit du nicht unbemerkt eingesperrt wirst und später treffen kannst.' },
      { t: 'text', title: 'Rückspiel', text: 'Hast du Steine im gegnerischen Heimfeld stehen und der Gegner muss an ihnen vorbei, bekommt er später Probleme beim Einbringen – das ist deine Chance auf einen späten Treffer.' },
    ],
  },
];
