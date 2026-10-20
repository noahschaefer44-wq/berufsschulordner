// Tastaturbelegungen, Fingerzuordnung und die Lektionen der Schreibschule.

export interface Layout {
  id: string;
  name: string;
  /** Zeilen: Zahlen, oben, Grundreihe, unten (Grundzeichen) */
  base: [string, string, string, string];
  /** dieselben Zeilen mit Umschalt (Shift) */
  shift: [string, string, string, string];
  /** Position der ersten Buchstabentaste der unteren Reihe */
  botStart: number;
  /** Zeichen über AltGr → Grundtaste */
  altgr?: Record<string, string>;
}

export const LAYOUTS: Layout[] = [
  {
    id: 'qwertz', name: 'QWERTZ (Deutsch)',
    base: ['^1234567890ß´', 'qwertzuiopü+', 'asdfghjklöä#', '<yxcvbnm,.-'],
    shift: ['°!"§$%&/()=?`', 'QWERTZUIOPÜ*', "ASDFGHJKLÖÄ'", '>YXCVBNM;:_'],
    botStart: 1,
    altgr: { '@': 'q', '€': 'e', '{': '7', '[': '8', ']': '9', '}': '0', '\\': 'ß', '|': '<', '~': '+' },
  },
  {
    id: 'qwerty', name: 'QWERTY (US)',
    base: ['`1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
    shift: ['~!@#$%^&*()_+', 'QWERTYUIOP{}', 'ASDFGHJKL:"', 'ZXCVBNM<>?'],
    botStart: 0,
  },
  {
    id: 'dvorak', name: 'Dvorak (US)',
    base: ['`1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'],
    shift: ['~!@#$%^&*(){}', '"<>PYFGCRL?+', 'AOEUIDHTNS_', ':QJKXBMWVZ'],
    botStart: 0,
  },
  {
    id: 'neo', name: 'Neo 2',
    base: ['^1234567890-`', 'xvlcwkhgfqß´', 'uiaeosnrtdy', 'üöäpzbm,.j'],
    shift: ['ˇ°§ℓ»«$€„“”', 'XVLCWKHGFQẞ~', 'UIAEOSNRTDY', 'ÜÖÄPZBM–•J'],
    botStart: 0,
  },
];

export const layoutById = (id: string) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

/** Finger je Tastenspalte: 0 L-Kleiner, 1 L-Ring, 2 L-Mittel, 3 L-Zeige, 4 R-Zeige, 5 R-Mittel, 6 R-Ring, 7 R-Kleiner */
export const FINGER_ROWS: number[][] = [
  [0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
  [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
  [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7],
  [0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7],
];
export const FINGER_NAMES = ['linker kleiner Finger', 'linker Ringfinger', 'linker Mittelfinger', 'linker Zeigefinger', 'rechter Zeigefinger', 'rechter Mittelfinger', 'rechter Ringfinger', 'rechter kleiner Finger'];
export const FINGER_COLORS = ['#e5604e', '#f2a93b', '#4fb07a', '#3fb6c4', '#5b8def', '#8c6bd6', '#d65fa0', '#b5855a'];

export interface KeyPos { row: number; col: number; shift: boolean; altgr: boolean; finger: number }

export function locate(layout: Layout, ch: string): KeyPos | null {
  if (ch === ' ') return { row: 4, col: 0, shift: false, altgr: false, finger: -1 };
  if (ch === '\n') return { row: 2, col: 12, shift: false, altgr: false, finger: 7 };
  for (let r = 0; r < 4; r++) {
    const b = layout.base[r].indexOf(ch);
    if (b >= 0) return { row: r, col: b, shift: false, altgr: false, finger: FINGER_ROWS[r][b] ?? 7 };
    const s = layout.shift[r].indexOf(ch);
    if (s >= 0) return { row: r, col: s, shift: true, altgr: false, finger: FINGER_ROWS[r][s] ?? 7 };
  }
  const ag = layout.altgr?.[ch];
  if (ag) {
    const p = locate(layout, ag);
    if (p) return { ...p, altgr: true };
  }
  return null;
}

// ───────── Schreibschule ─────────

export type LessonKind = 'keys' | 'caps' | 'umlaut' | 'nums' | 'punct' | 'special' | 'sentences' | 'numpad';
export interface TypingLesson {
  id: string;
  title: string;
  info: string;
  kind: LessonKind;
  /** zu übende Zeichen insgesamt / neu in dieser Lektion */
  chars: string;
  fresh: string;
  goalWpm: number;
  goalAcc: number;
}

const GROUPS = [[3, 6], [2, 7], [1, 8], [0, 9], [4, 5]];
const ROWS = [
  { key: 'home', name: 'Grundreihe', idx: 2, goal: 12 },
  { key: 'top', name: 'obere Reihe', idx: 1, goal: 16 },
  { key: 'bot', name: 'untere Reihe', idx: 3, goal: 20 },
];

export function buildLessons(layout: Layout): TypingLesson[] {
  const out: TypingLesson[] = [];
  let known = '';
  for (const row of ROWS) {
    const start = row.idx === 3 ? layout.botStart : 0;
    const keys = layout.base[row.idx].slice(start, start + 10);
    GROUPS.forEach((g, i) => {
      const fresh = g.map((c) => keys[c]).filter(Boolean).join('');
      known += fresh;
      out.push({
        id: `${row.key}-${i + 1}`,
        title: `${row.name} ${i + 1}/5`,
        info: `Neue Tasten: ${fresh.split('').join(' ')}. Finger: ${[...new Set(g.map((c) => FINGER_NAMES[FINGER_ROWS[row.idx][c] ?? 7]))].join(' und ')}.`,
        kind: 'keys', chars: known, fresh, goalWpm: row.goal + i, goalAcc: 94,
      });
    });
  }
  const hasUml = 'äöüß'.split('').some((c) => locate(layout, c));
  if (hasUml) {
    out.push({ id: 'umlaute', title: 'Umlaute und ß', info: 'ä, ö, ü und ß – die häufigsten Sonderbuchstaben im Deutschen.', kind: 'umlaut', chars: 'äöüß', fresh: 'äöüß', goalWpm: 22, goalAcc: 94 });
  }
  out.push(
    { id: 'gross', title: 'Großschreibung (Shift)', info: 'Shift mit dem kleinen Finger der Gegenseite halten, dann die Taste anschlagen.', kind: 'caps', chars: 'ABC', fresh: 'ABC', goalWpm: 24, goalAcc: 94 },
    { id: 'zahlen-1', title: 'Zahlen 1–5', info: 'Zahlenreihe: Finger bleiben auf der Grundreihe, greifen nach oben und kehren zurück.', kind: 'nums', chars: '12345', fresh: '12345', goalWpm: 20, goalAcc: 94 },
    { id: 'zahlen-2', title: 'Zahlen 6–0', info: 'Rechte Hand: 6 7 8 9 0. Dazu Ziffern gemischt.', kind: 'nums', chars: '1234567890', fresh: '67890', goalWpm: 22, goalAcc: 94 },
    { id: 'satzzeichen', title: 'Satzzeichen', info: '. , ! ? : ; " ( ) – Zeichen, die jeder Text braucht.', kind: 'punct', chars: '.,!?:;"()', fresh: '.,!?:;"()', goalWpm: 24, goalAcc: 94 },
    { id: 'sonderzeichen', title: 'Sonderzeichen', info: '@ € % & / = + # { } [ ] – für E-Mails, Preise und Code. Manche brauchen AltGr.', kind: 'special', chars: '@€%&/=+#{}[]', fresh: '@€%&/=+#{}[]', goalWpm: 22, goalAcc: 92 },
    { id: 'saetze', title: 'Ganze Sätze', info: 'Alles zusammen: Groß- und Kleinschreibung, Satzzeichen, Zahlen.', kind: 'sentences', chars: '', fresh: '', goalWpm: 30, goalAcc: 95 },
    { id: 'zahlenblock', title: 'Zahlenblock', info: 'Rechenaufgaben mit + − * / und =. Auch auf der normalen Zahlenreihe übbar.', kind: 'numpad', chars: '0123456789+-*/=', fresh: '+-*/=', goalWpm: 30, goalAcc: 96 },
  );
  return out;
}
