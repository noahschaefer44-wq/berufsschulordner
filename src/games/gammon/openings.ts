// Eröffnungsbuch: bewährte Züge für jeden der 21 Eröffnungswürfe (Standardnotation aus Sicht von Weiß).
import { type BG, type Mv, applyMv, posKey, startPosition } from './engine';

export interface Opening { roll: [number, number]; best: string; alts: string[]; note: string }

export const OPENINGS: Opening[] = [
  { roll: [2, 1], best: '13/11 6/5', alts: ['24/23 13/11'], note: 'Der Punkt 5 wird „angeschlitzt“ – riskant, aber stark, wenn der Gegner nicht trifft.' },
  { roll: [3, 1], best: '8/5 6/5', alts: [], note: 'Klassiker: Der wichtigste Punkt des Heimfelds (die 5) entsteht sofort.' },
  { roll: [4, 1], best: '24/23 13/9', alts: ['13/9 6/5'], note: 'Ein Läufer auf 9 baut Material auf, der rückwärtige Stein rückt nach.' },
  { roll: [5, 1], best: '24/23 13/8', alts: ['13/8 6/5'], note: 'Sicher von der Mitte auf die 8; der 1er bewegt einen Hintermann.' },
  { roll: [6, 1], best: '13/7 8/7', alts: [], note: 'Der Bar-Punkt (7) entsteht – eine Mauer vor den gegnerischen Hintersteinen.' },
  { roll: [3, 2], best: '24/21 13/11', alts: ['13/11 13/10'], note: 'Ein Hinterstein läuft los, ein Mittelstein baut Material auf.' },
  { roll: [4, 2], best: '8/4 6/4', alts: [], note: 'Der 4-Punkt wird gemacht, ganz ohne Risiko.' },
  { roll: [5, 2], best: '13/11 13/8', alts: [], note: 'Zwei Mittelsteine kommen vor – flexibel für künftige Punkte.' },
  { roll: [6, 2], best: '24/18 13/11', alts: [], note: 'Der Hinterstein tritt auf die 18 vor, der Mittelstein baut auf.' },
  { roll: [4, 3], best: '24/20 13/10', alts: ['13/9 13/10'], note: 'Aktiver Hinterstein, dazu ein Baustein auf der 10.' },
  { roll: [5, 3], best: '8/3 6/3', alts: [], note: 'Der 3-Punkt entsteht – kleiner, aber sicherer Gewinn.' },
  { roll: [6, 3], best: '24/18 13/10', alts: [], note: 'Vormarsch des Hintersteins, ein Baustein kommt in Position.' },
  { roll: [5, 4], best: '24/20 13/8', alts: ['13/9 13/8'], note: 'Vorrücken und ein Stein zur 8.' },
  { roll: [6, 4], best: '24/18 18/14', alts: ['8/2 6/2', '24/18 13/9'], note: 'Ein Hinterstein rennt auf die 14; der Punkt 2 ist die ruhige Alternative.' },
  { roll: [6, 5], best: '24/18 18/13', alts: [], note: '„Lover’s Leap“: ein Hinterstein springt direkt zur Mitte.' },
  { roll: [1, 1], best: '8/7(2) 6/5(2)', alts: [], note: 'Bar-Punkt und 5-Punkt – ein kräftiger Doppelschlag.' },
  { roll: [2, 2], best: '13/11(2) 6/4(2)', alts: ['24/22(2) 6/4(2)'], note: 'Den 4-Punkt sichern und die Mitte stärken.' },
  { roll: [3, 3], best: '8/5(2) 6/3(2)', alts: ['24/21(2) 13/10(2)'], note: 'Zwei neue Punkte im Heimfeld.' },
  { roll: [4, 4], best: '24/20(2) 13/9(2)', alts: [], note: 'Den gegnerischen 5-Punkt (20) besetzen und die Mitte stärken.' },
  { roll: [5, 5], best: '13/8 8/3 13/8 8/3', alts: [], note: 'Beide Steine zur 3 – in der Praxis fast zwingend.' },
  { roll: [6, 6], best: '24/18(2) 13/7(2)', alts: [], note: 'Die 18 und die 7 – sehr starker Doppelsechser.' },
];

/** „13/7 8/7(2)“ → Zugliste (ohne Würfelangabe). */
export function parseBook(text: string): Mv[] {
  const out: Mv[] = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const m = /^(\d+)\/(\d+)(?:\((\d)\))?$/.exec(tok);
    if (!m) continue;
    const n = m[3] ? +m[3] : 1;
    for (let i = 0; i < n; i++) out.push({ from: +m[1], to: +m[2], die: +m[1] - +m[2], hit: false });
  }
  return out;
}

export function bookEnd(text: string, start: BG = startPosition()): BG {
  let s = start;
  for (const m of parseBook(text)) s = applyMv(s, 0, m);
  return s;
}

export const bookKey = (text: string) => posKey({ ...bookEnd(text), turn: 0 });
