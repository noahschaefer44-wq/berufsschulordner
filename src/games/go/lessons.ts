import { CURATED, type Problem, genProblem } from './problems';

export interface Diagram { rows: string[]; marks?: Record<string, 'tri' | 'sq' | 'x' | 'lib' | 'a' | 'b' | 'c'> }
export type Step =
  | { t: 'text'; title?: string; text: string; diagram?: Diagram }
  | { t: 'free'; text: string; n: number }
  | { t: 'task'; text?: string; problem?: string; gen?: { seed: number; kind: 'capture' | 'save'; depth: number } };

export interface Lesson { id: string; title: string; summary: string; steps: Step[] }

export const LESSONS: Lesson[] = [
  {
    id: 'brett', title: 'Brett und Steine', summary: 'Wie man Go spielt: Schnittpunkte, Farben, Züge.',
    steps: [
      { t: 'text', title: 'Go in einem Satz', text: 'Zwei Spieler setzen abwechselnd Steine auf die Schnittpunkte eines Gitters. Schwarz beginnt. Ziel ist, mehr Raum zu umschließen als der Gegner. Gesetzte Steine bewegen sich nie – sie werden höchstens geschlagen.' },
      { t: 'text', title: 'Das Brett', text: 'Gespielt wird auf den Schnittpunkten, nicht in den Feldern. Üblich sind 19×19, zum Lernen 9×9. Die dunklen Punkte (Hoshi) helfen bei der Orientierung und markieren die Stellen für Vorgabesteine.', diagram: { rows: ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'] } },
      { t: 'free', n: 5, text: 'Probiere es aus: Setze abwechselnd Schwarz und Weiß. Mit Rechtsklick (oder langem Drücken) entfernst du einen Stein.' },
    ],
  },
  {
    id: 'freiheiten', title: 'Freiheiten', summary: 'Die leeren Nachbarpunkte eines Steins – sein Atem.',
    steps: [
      { t: 'text', title: 'Atem', text: 'Jeder Stein hat bis zu vier Freiheiten: die leeren Punkte direkt links, rechts, oben, unten (nicht schräg). Am Rand sind es drei, in der Ecke zwei.', diagram: { rows: ['.....', '.....', '..X..', '.....', '.....'], marks: { '2,1': 'lib', '1,2': 'lib', '3,2': 'lib', '2,3': 'lib' } } },
      { t: 'text', title: 'Gruppen', text: 'Steine derselben Farbe, die über eine Linie verbunden sind, bilden eine Gruppe und teilen sich ihre Freiheiten. Diese Gruppe hat sieben Freiheiten.', diagram: { rows: ['.....', '.XX..', '..X..', '.....', '.....'], marks: { '1,0': 'lib', '2,0': 'lib', '0,1': 'lib', '3,1': 'lib', '1,2': 'lib', '3,2': 'lib', '2,3': 'lib' } } },
      { t: 'text', title: 'Tipp', text: 'Schalte in den Optionen „Freiheiten zeigen“ ein: Fährst du mit der Maus über einen Stein, siehst du die Freiheiten seiner Gruppe.' },
    ],
  },
  {
    id: 'schlagen', title: 'Schlagen', summary: 'Nimm dem Gegner die letzte Freiheit.',
    steps: [
      { t: 'text', title: 'Die Regel', text: 'Hat eine Gruppe keine Freiheit mehr, wird sie sofort vom Brett genommen. Hat eine Gruppe nur noch eine Freiheit, ist sie in „Atari“ – sie kann im nächsten Zug geschlagen werden.' },
      { t: 'task', problem: 'c-fang1', text: 'Der weiße Stein ist in Atari. Schlage ihn.' },
      { t: 'task', problem: 'c-ecke', text: 'In der Ecke geht es noch schneller.' },
      { t: 'task', problem: 'c-zwei', text: 'Verbundene Steine werden zusammen geschlagen.' },
      { t: 'task', gen: { seed: 101, kind: 'capture', depth: 1 }, text: 'Noch eine: Finde den Fang.' },
    ],
  },
  {
    id: 'atari', title: 'Atari und Retten', summary: 'Aus der Not entkommen – und wann Fliehen sinnlos ist.',
    steps: [
      { t: 'text', title: 'Fliehen', text: 'Ist deine Gruppe in Atari, kannst du sie durch Verlängern retten: Ein Stein an der letzten Freiheit gibt der Gruppe neue Freiheiten. Das hilft aber nur, wenn danach mehr als eine Freiheit bleibt.' },
      { t: 'task', problem: 'c-flucht', text: 'Dein schwarzer Stein ist in Atari. Rette ihn.' },
      { t: 'task', gen: { seed: 202, kind: 'save', depth: 2 }, text: 'Rette die markierte Gruppe.' },
      { t: 'task', gen: { seed: 203, kind: 'save', depth: 2 }, text: 'Und noch einmal.' },
    ],
  },
  {
    id: 'ko', title: 'Ko', summary: 'Die Regel gegen ewiges Zurückschlagen.',
    steps: [
      { t: 'text', title: 'Endlosschleife', text: 'Manchmal könnten zwei Spieler immer wieder denselben Stein schlagen und zurückschlagen. Deshalb gilt: Du darfst nicht sofort so zurückschlagen, dass die Stellung von vorher entsteht. Erst muss jemand woanders ziehen (eine „Ko-Drohung“) – danach darf wieder geschlagen werden.' },
      { t: 'task', problem: 'c-ko', text: 'Schlage den weißen Stein. Beachte: Weiß darf danach nicht sofort zurückschlagen.' },
      { t: 'text', title: 'Superko', text: 'Strengere Regeln (Superko) verbieten jede Stellung, die schon einmal da war. In den Partie-Einstellungen kannst du das wählen.' },
    ],
  },
  {
    id: 'augen', title: 'Augen und Leben', summary: 'Zwei Augen machen eine Gruppe unschlagbar.',
    steps: [
      { t: 'text', title: 'Selbstmord', text: 'Du darfst keinen Stein setzen, der sofort keine Freiheit hätte – außer er schlägt dabei etwas. Genau deshalb sind zwei Augen so mächtig: Der Gegner kann nicht in beide gleichzeitig setzen.', diagram: { rows: ['XXXXX', 'X.X.X', 'XXXXX', '.....', '.....'], marks: { '1,1': 'a', '3,1': 'a' } } },
      { t: 'text', title: 'Ein Auge reicht nicht', text: 'Hat die Gruppe nur ein großes Auge, setzt der Gegner hinein und schlägt sie. Gruppen mit zwei echten Augen sind „lebendig“. Das ist das wichtigste Prinzip des Spiels: Leben und Tod.', diagram: { rows: ['XXXXX', 'X...X', 'XXXXX', '.....', '.....'], marks: { '2,1': 'b' } } },
    ],
  },
  {
    id: 'netz', title: 'Netz und Leiter', summary: 'Gruppen fangen, die noch Platz zum Fliehen haben.',
    steps: [
      { t: 'text', title: 'Einschließen', text: 'Ein Stein mit zwei Freiheiten ist nicht gerettet. Setzt du klug, entkommt er trotzdem nicht: Beim „Netz“ legst du Steine so, dass jede Fluchtrichtung am Ende gesperrt ist, bei der „Leiter“ treibst du die Gruppe Zug um Zug in eine Richtung.' },
      { t: 'task', gen: { seed: 303, kind: 'capture', depth: 2 }, text: 'Fange die Gruppe in zwei Zügen.' },
      { t: 'task', gen: { seed: 304, kind: 'capture', depth: 2 }, text: 'Noch ein Netz.' },
      { t: 'task', gen: { seed: 305, kind: 'capture', depth: 2 }, text: 'Und noch eins.' },
    ],
  },
  {
    id: 'zaehlen', title: 'Zählen und Ende', summary: 'Wer hat gewonnen?',
    steps: [
      { t: 'text', title: 'Das Ende', text: 'Wenn beide Spieler nacheinander passen, ist die Partie zu Ende. Dann werden tote Steine (die nicht mehr zu retten sind) vom Brett genommen und gezählt.' },
      { t: 'text', title: 'Gebiet', text: 'Gebiet sind leere Punkte, die nur von einer Farbe umschlossen werden. Beim japanischen Zählen („Gebiet“) zählen Gebiet plus geschlagene Steine. Beim chinesischen („Fläche“) zählen Gebiet plus eigene Steine auf dem Brett.', diagram: { rows: ['XX.OO', 'XX.OO', 'XX.OO', 'XX.OO', 'XX.OO'], marks: {} } },
      { t: 'text', title: 'Komi', text: 'Weil Schwarz zuerst zieht, bekommt Weiß einen Ausgleich: das Komi. Üblich sind 6,5 oder 7,5 Punkte. Die halbe Zahl verhindert Unentschieden.' },
      { t: 'text', title: 'Vorgabe', text: 'Spielen ein starker und ein schwacher Spieler, setzt Schwarz vorab Vorgabesteine (2 bis 9) und Weiß beginnt. Das Komi ist dann klein.' },
    ],
  },
];

export function resolveTask(step: Step & { t: 'task' }): Problem | null {
  if (step.problem) return CURATED.find((p) => p.id === step.problem) ?? null;
  if (step.gen) return genProblem(step.gen.seed, step.gen.kind, step.gen.depth);
  return null;
}
