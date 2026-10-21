// Lektionen mit Übung: Stellung, Aufgabe und Prüfung des ersten Zuges.
import { bestWallGain, netGain, newState, shortestPath, wallDeltas, type Move, type State } from './engine';

export interface Lesson {
  id: string;
  title: string;
  text: string;
  task: string;
  hint: string;
  setup: () => State;
  /** Wahr, wenn der gespielte Zug die Aufgabe löst */
  check: (before: State, m: Move) => boolean;
  /** Erklärung nach gelöster Aufgabe */
  why: string;
}

const base = (n = 9) => newState({ n, walls: n === 9 ? 10 : 6 });
const place = (s: State, p0: [number, number], p1: [number, number]) => { s.pawn[0] = { r: p0[0], c: p0[1] }; s.pawn[1] = { r: p1[0], c: p1[1] }; return s; };
const wall = (s: State, t: 'h' | 'v', r: number, c: number) => { (t === 'h' ? s.hw : s.vw)[r * (s.n - 1) + c] = 1; return s; };

export const LESSONS: Lesson[] = [
  {
    id: 'ziel', title: 'Ziel und Schritte',
    text: 'Zwei Bauern stehen sich gegenüber. Wer zuerst die gegenüberliegende Reihe erreicht, gewinnt – egal auf welchem Feld. Pro Zug darfst du entweder einen Schritt gehen (nach vorn, zur Seite oder zurück, nie diagonal) oder eine Mauer setzen. Beides zusammen geht nicht.',
    task: 'Gehe einen Schritt nach vorn.', hint: 'Klicke das markierte Feld über deinem Bauern.',
    setup: () => base(),
    check: (b, m) => m.t === 'm' && m.r === b.pawn[0].r - 1 && m.c === b.pawn[0].c,
    why: 'So läuft man: ein Feld pro Zug. Für die 8 Reihen bis ins Ziel brauchst du also mindestens 8 Züge.',
  },
  {
    id: 'sprung', title: 'Über den Gegner springen',
    text: 'Steht der Gegner direkt vor dir, darfst du über ihn hinwegspringen und landest unmittelbar hinter ihm – das spart einen Zug. Der Sprung geht nur geradeaus und nur, wenn hinter dem Gegner keine Mauer und kein Brettrand ist.',
    task: 'Springe über den Gegner.', hint: 'Das Feld hinter dem Bauern ist markiert.',
    setup: () => place(base(), [5, 4], [4, 4]),
    check: (b, m) => m.t === 'm' && m.r === b.pawn[1].r - 1 && m.c === b.pawn[1].c,
    why: 'Zwei Felder in einem Zug – wer springen kann, gewinnt Zeit. Nimm das mit in die Planung, bevor du Mauern setzt.',
  },
  {
    id: 'diagonal', title: 'Der Diagonalsprung',
    text: 'Steht hinter dem Gegner eine Mauer, kannst du nicht geradeaus springen. Dafür darfst du dann diagonal vorbei: auf eines der beiden Felder neben dem Gegner (sofern dort keine Mauer dazwischen steht).',
    task: 'Weiche diagonal am Gegner vorbei.', hint: 'Die beiden Felder links und rechts des Gegners sind markiert.',
    setup: () => wall(place(base(), [5, 4], [4, 4]), 'h', 3, 4),
    check: (b, m) => m.t === 'm' && m.r === b.pawn[1].r && m.c !== b.pawn[1].c,
    why: 'Eine Mauer hinter dem Gegner nimmt dir den Sprung – eröffnet dir aber zwei Diagonalen. Mauern verändern auch die Möglichkeiten des Gegners.',
  },
  {
    id: 'mauer', title: 'Die erste Mauer',
    text: 'Eine Mauer ist zwei Felder lang und liegt in der Fuge zwischen den Feldern. Der Gegner kommt nicht hindurch und muss einen Umweg gehen. Wichtig ist nicht, dass man eine Mauer setzt, sondern wie viele Schritte sie ihn kostet. Du darfst ihn nie ganz einsperren: Es muss für beide immer ein Weg zum Ziel bleiben.',
    task: 'Setze eine Mauer, die den Weg des Gegners um mindestens einen Schritt verlängert.', hint: 'Klicke auf die Fuge direkt vor dem orangen Bauern (oder schalte den Mauer-Modus ein).',
    setup: () => place(base(), [6, 4], [7, 4]),
    check: (b, m) => m.t !== 'm' && netGain(b, m) >= 1,
    why: 'Der Gegner stand kurz vor dem Ziel. Gut gesetzt wird jede Mauer, die ihn mehr kostet als dich.',
  },
  {
    id: 'umweg', title: 'Umwege richtig lang machen',
    text: 'Eine einzelne Mauer kostet meist nur ein bis zwei Schritte. Wirklich weh tut es, wenn mehrere Mauern zusammen eine Wand bilden und der Gegner weit herumlaufen muss. Suche Fugen, die an bereits stehende Mauern anschließen.',
    task: 'Finde die Mauer, die den Gegner am meisten kostet.', hint: 'Der Gegner kommt links an der Mauer vorbei – die rechte Seite ist offen? Schließe die Lücke so, dass der Umweg am längsten wird.',
    setup: () => { const s = place(base(), [6, 4], [3, 4]); wall(s, 'h', 3, 2); wall(s, 'h', 3, 4); wall(s, 'h', 3, 6); return s; },
    check: (b, m) => m.t !== 'm' && netGain(b, m) >= bestWallGain(b),
    why: 'Eine Mauer, die eine bestehende Kette verlängert, zwingt zum weitesten Umweg. Die schlimmste Mauer ist oft die am Rand der Kette.',
  },
  {
    id: 'kosten', title: 'Mauern kosten auch dich',
    text: 'Dein Mauerbau kann dich selbst treffen: Mauern sind auch für deinen Bauern Hindernisse. Schau vor jeder Mauer, ob sich dein eigener Weg verlängert. Der Gewinn einer Mauer ist (Schritte für den Gegner) minus (Schritte für dich).',
    task: 'Setze eine Mauer, die den Gegner aufhält, ohne dir selbst Schritte zu kosten.', hint: 'Die Wege beider Seiten kannst du mit der Schaltfläche „Wege“ einblenden.',
    setup: () => place(base(), [5, 2], [6, 6]),
    check: (b, m) => { if (m.t === 'm') return false; const d = wallDeltas(b, m); return d.own === 0 && d.opp >= 1; },
    why: 'Eine Mauer abseits deines Weges ist umsonst. Solche Mauern sind die besten – sie nehmen dem Gegner Zeit, ohne dir etwas zu nehmen.',
  },
  {
    id: 'tempo', title: 'Wer ist vorn? Tempo zählen',
    text: 'Ob du gewinnst, zeigt die Zählung: Zähle die Schritte bis zum Ziel für beide Bauern. Hast du weniger (oder gleich viele und bist am Zug), liegst du vorn. Dann lohnt es sich meist zu laufen, statt Mauern zu verbrauchen. Wer hinten liegt, muss Mauern einsetzen.',
    task: 'Du liegst vorn: Gehe den kürzesten Weg weiter.', hint: 'Laufe das Feld auf dem kürzesten Weg (mit „Wege“ eingeblendet).',
    setup: () => place(base(), [4, 4], [3, 2]),
    check: (b, m) => { if (m.t !== 'm') return false; const p = shortestPath(b, 0)[1]; return !!p && p.r === m.r && p.c === m.c; },
    why: 'Vorn liegen heißt: Jede Mauer des Gegners musst du abwägen – aber unnötige Mauern kosten dich Vorrat. Laufen ist die Standardantwort.',
  },
  {
    id: 'vorrat', title: 'Der Mauervorrat',
    text: 'Jeder hat nur eine begrenzte Zahl Mauern (im Original 10). Sind sie verbaut, kannst du nur noch laufen – und wirst von der Wand des Gegners gebremst, ohne dich wehren zu können. Spare Mauern für die entscheidenden Momente, meist kurz vor dem Ziel des Gegners.',
    task: 'Der Gegner steht kurz vor dem Ziel: Bremse ihn mit einer Mauer.', hint: 'Eine Mauer direkt vor ihm.',
    setup: () => place(base(), [5, 4], [7, 5]),
    check: (b, m) => m.t !== 'm' && netGain(b, m) >= 1,
    why: 'Genau das ist der Moment für Mauern: kurz vor dem Ziel, wenn jeder Umweg zählt. Vorher Mauern zu verbrauchen, verschenkt Möglichkeiten.',
  },
];

/** Prüft, ob alle Lektionen sinnvolle Stellungen haben (für Tests). */
export const lessonStates = () => LESSONS.map((l) => ({ id: l.id, state: l.setup() }));
