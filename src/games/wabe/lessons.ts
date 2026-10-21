// Lektionen mit Übung: Stellung, Aufgabe und Prüfung des Zuges.
import { SETS, buildGame, key, neighbors, result, apply, cloneGame, type Color, type G, type Kind, type Move } from './engine';

export interface Lesson {
  id: string;
  title: string;
  text: string;
  task: string;
  hint: string;
  side: Color;
  setup: () => G;
  check: (before: G, m: Move) => boolean;
  why: string;
}

const S = SETS[0], PLUS = SETS[1];
const P = (q: number, r: number, c: Color, kind: Kind): [number, number, Color, Kind] => [q, r, c, kind];
const kindAt = (g: G, k: number) => g.cells.get(k)?.slice(-1)[0]?.kind;
const after = (g: G, m: Move) => { const c = cloneGame(g); apply(c, m); return c; };

export const LESSONS: Lesson[] = [
  {
    id: 'setzen', title: 'Tiere setzen',
    text: 'Wabe hat kein Brett: Die Tiere bilden selbst das Spielfeld. Jeder Spieler hat einen Vorrat. In einem Zug darfst du entweder ein neues Tier aus dem Vorrat neben deine eigenen Tiere setzen – aber so, dass es kein gegnerisches Tier berührt (außer in den ersten beiden Zügen) – oder ein Tier auf dem Spielfeld ziehen.',
    task: 'Setze eine Ameise aus deinem Vorrat.', hint: 'Klicke im Vorrat auf die Ameise und dann auf ein gestricheltes Feld.', side: 0,
    setup: () => buildGame(S, 0, [P(0, 0, 0, 'Q'), P(1, 0, 1, 'Q'), P(-1, 1, 0, 'S'), P(2, 0, 1, 'A')]),
    check: (b, m) => m.t === 'p' && m.kind === 'A',
    why: 'Neue Tiere wachsen vom eigenen Teil des Schwarms aus. Die Felder neben gegnerischen Tieren sind für dich tabu – das gilt auch umgekehrt.',
  },
  {
    id: 'koenigin', title: 'Die Königin',
    text: 'Die Königin ist das Ziel: Wer die gegnerische Königin auf allen sechs Seiten umzingelt, gewinnt – egal mit wessen Tieren. Du musst deine Königin spätestens in deinem vierten Zug setzen; erst danach darf überhaupt ein Tier auf dem Feld ziehen. Die Königin selbst zieht nur ein Feld weit, aber sie gleitet dabei an den anderen Tieren entlang.',
    task: 'Ziehe deine Königin ein Feld.', hint: 'Klicke die Königin an und dann auf ein markiertes Nachbarfeld.', side: 0,
    setup: () => buildGame(S, 0, [P(0, 0, 0, 'Q'), P(1, -1, 1, 'Q'), P(0, -1, 0, 'S')]),
    check: (b, m) => m.t === 'm' && kindAt(b, m.from) === 'Q',
    why: 'Gleiten heißt: Die Königin bleibt dabei immer in Kontakt mit dem Schwarm.',
  },
  {
    id: 'ameise', title: 'Die Ameise',
    text: 'Die Ameise ist das stärkste Tier: Sie läuft beliebig weit um den Schwarm herum, immer am Rand entlang und ohne Kontakt zu verlieren. Sie darf nicht durch Lücken, die schmaler sind als sie selbst, und natürlich nicht über andere Tiere.',
    task: 'Laufe mit der Ameise ans andere Ende der Reihe.', hint: 'Das Feld rechts hinter dem letzten Tier.', side: 0,
    setup: () => buildGame(S, 0, [P(0, 0, 0, 'A'), P(1, 0, 1, 'Q'), P(2, 0, 0, 'Q'), P(3, 0, 1, 'S')]),
    check: (b, m) => m.t === 'm' && kindAt(b, m.from) === 'A' && m.to === key(4, 0),
    why: 'Die Ameise kann ein Tier in einem Zug von der einen Seite des Schwarms auf die andere bringen – das macht sie so wertvoll und so gefährlich.',
  },
  {
    id: 'spinne', title: 'Die Spinne',
    text: 'Die Spinne zieht genau drei Felder – nicht mehr und nicht weniger – am Rand des Schwarms entlang. Sie darf dabei kein Feld zweimal betreten. Dadurch ist sie berechenbar, aber auf engem Raum sehr genau.',
    task: 'Ziehe die Spinne.', hint: 'Es gibt zwei mögliche Zielfelder: drei Schritte im Uhrzeigersinn oder dagegen.', side: 0,
    setup: () => buildGame(S, 0, [P(0, 0, 1, 'Q'), P(1, 0, 1, 'A'), P(0, 1, 0, 'S'), P(-1, 1, 0, 'Q')]),
    check: (b, m) => m.t === 'm' && kindAt(b, m.from) === 'S',
    why: 'Drei Schritte exakt – so kannst du die Spinne gezielt in eine Lücke neben der gegnerischen Königin bringen.',
  },
  {
    id: 'huepfer', title: 'Der Grashüpfer',
    text: 'Der Grashüpfer springt in gerader Linie über eine lückenlose Reihe von Tieren und landet auf dem ersten freien Feld dahinter. Er muss mindestens ein Tier überspringen. Er braucht keinen Platz zum Gleiten und kommt daher in jede Lücke.',
    task: 'Springe über die ganze Reihe.', hint: 'Das erste freie Feld hinter der Reihe.', side: 0,
    setup: () => buildGame(S, 0, [P(-1, 0, 0, 'G'), P(0, 0, 1, 'Q'), P(1, 0, 0, 'Q'), P(2, 0, 1, 'A')]),
    check: (b, m) => m.t === 'm' && kindAt(b, m.from) === 'G' && m.to === key(3, 0),
    why: 'Der Sprung geht über alle vier Tiere. Im Endspiel sind Grashüpfer ideal, um die letzte Lücke um die Königin zu schließen.',
  },
  {
    id: 'kaefer', title: 'Der Käfer',
    text: 'Der Käfer zieht ein Feld, darf aber auf andere Tiere klettern – und bedeckt sie dann. Ein bedecktes Tier kann nicht ziehen, und es zählt für die Umzingelung trotzdem als besetztes Feld. Ein Käfer kann sogar die Königin bedecken: Sie ist dann gefesselt.',
    task: 'Setze den Käfer auf die gegnerische Königin.', hint: 'Das Feld der schwarzen Königin.', side: 0,
    setup: () => buildGame(S, 0, [P(0, 0, 1, 'Q'), P(1, 0, 0, 'Q'), P(0, 1, 0, 'B')]),
    check: (b, m) => m.t === 'm' && kindAt(b, m.from) === 'B' && m.to === key(0, 0),
    why: 'Die schwarze Königin liegt jetzt unter deinem Käfer und kann nicht mehr ziehen – bis er herunterklettert.',
  },
  {
    id: 'schwarm', title: 'Der Schwarm bleibt zusammen',
    text: 'Kein Zug darf den Schwarm in zwei Teile zerreißen. Ein Tier, das als einzige Brücke zwischen zwei Gruppen dient, ist darum festgehalten und kann nicht ziehen. Prüfe vor jedem Zug, welche deiner Tiere Brücken sind – und nutze, dass der Gegner das gleiche Problem hat.',
    task: 'Hier sind Spinne und Königin Brücken. Ziehe die Ameise neben die schwarze Königin.', hint: 'Die Ameise läuft außen herum – ein Feld neben der schwarzen Königin am linken Ende.', side: 0,
    setup: () => buildGame(S, 0, [P(0, 0, 1, 'Q'), P(1, 0, 0, 'S'), P(2, 0, 0, 'Q'), P(2, 1, 0, 'A')]),
    check: (b, m) => m.t === 'm' && kindAt(b, m.from) === 'A' && neighbors(key(0, 0)).includes(m.to),
    why: 'Die Spinne und die Königin hätten den Schwarm geteilt – nur die Ameise war frei. Solche „gefesselten“ Tiere kannst du gezielt erzeugen.',
  },
  {
    id: 'gewinnen', title: 'Die Königin einschließen',
    text: 'Fünf Felder um die schwarze Königin sind schon besetzt – nur eines fehlt. Du musst ein Tier dorthin bringen. Beachte: Es zählt nicht, wem die Tiere um die Königin gehören; auch die eigene Königin kann so eingeschlossen werden. Sind beide zugleich eingeschlossen, ist die Partie remis.',
    task: 'Schließe die schwarze Königin ein.', hint: 'Das einzige freie Feld neben der schwarzen Königin.', side: 0,
    setup: () => buildGame(S, 0, [P(0, 0, 1, 'Q'), P(1, 0, 0, 'S'), P(1, -1, 0, 'A'), P(0, -1, 0, 'A'), P(-1, 0, 0, 'S'), P(-1, 1, 0, 'A'), P(2, 0, 0, 'Q'), P(1, 1, 0, 'B')]),
    check: (b, m) => result(after(b, m))?.winner === 0,
    why: 'Eingeschlossen! Schau beim Spielen immer, wie viele Felder deiner eigenen Königin schon besetzt sind – die Zähler am Spielfeld helfen dir.',
  },
  {
    id: 'marienkaefer', title: 'Der Marienkäfer (Erweiterung)',
    text: 'Der Marienkäfer zieht genau drei Felder: zwei auf dem Schwarm (er klettert auf ein Tier, läuft über ein weiteres) und eines wieder hinunter auf ein freies Feld. So kommt er an Stellen, die kein anderes Tier erreicht.',
    task: 'Lande mit dem Marienkäfer neben der schwarzen Ameise.', hint: 'Zwei Plättchen hinauf, dann auf ein freies Feld neben der Ameise.', side: 0,
    setup: () => buildGame(PLUS, 0, [P(-1, 0, 0, 'L'), P(0, 0, 1, 'Q'), P(1, 0, 0, 'Q'), P(2, 0, 1, 'A')]),
    check: (b, m) => m.t === 'm' && kindAt(b, m.from) === 'L' && neighbors(key(2, 0)).includes(m.to),
    why: 'Zwei Schritte über das Dach, einer hinunter. Der Marienkäfer ist gut, um die letzte Lücke zu finden, die Ameisen verwehrt ist.',
  },
  {
    id: 'muecke', title: 'Die Mücke (Erweiterung)',
    text: 'Die Mücke kopiert die Fähigkeit eines angrenzenden Tieres: Neben einer Ameise läuft sie wie eine Ameise, neben einem Grashüpfer springt sie. Sitzt sie auf dem Schwarm, zieht sie wie ein Käfer. Neben nur anderen Mücken kann sie gar nicht ziehen.',
    task: 'Die Mücke steht neben einem Grashüpfer – springe über die Reihe.', hint: 'Wie ein Grashüpfer: bis hinter das letzte Tier der Reihe.', side: 0,
    setup: () => buildGame(PLUS, 0, [P(-1, 0, 0, 'M'), P(0, 0, 1, 'G'), P(1, 0, 0, 'Q'), P(2, 0, 1, 'Q')]),
    check: (b, m) => m.t === 'm' && kindAt(b, m.from) === 'M' && m.to === key(3, 0),
    why: 'Als Mücke bist du immer so stark wie das stärkste Tier neben dir – sie lohnt sich mitten im Schwarm.',
  },
];
