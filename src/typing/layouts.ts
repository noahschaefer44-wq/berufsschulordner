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

// ───────── Schreibschule: zehn Stufen mit echten Texten ─────────

export interface TypingLesson {
  id: string;
  title: string;
  info: string;
  /** Textsammlung (siehe corpus.ts) und Anzahl Texte pro Übung */
  pool: string;
  count: number;
  goalWpm: number;
  goalAcc: number;
}

export function buildLessons(): TypingLesson[] {
  const L = (id: string, title: string, info: string, pool: string, count: number, goalWpm: number, goalAcc = 94): TypingLesson => ({ id, title, info, pool, count, goalWpm, goalAcc });
  return [
    L('s1', 'Kurze Sätze', 'Einfache Sätze mit Punkt – finde deinen Rhythmus.', 'kurz', 4, 15),
    L('s2', 'Längere Sätze', 'Kommas und Nebensätze, aber noch ohne Hast.', 'lang', 3, 20),
    L('s3', 'Satzzeichen', 'Fragen, Ausrufe, Klammern und Anführungszeichen.', 'satz', 3, 22),
    L('s4', 'Zahlen & Preise', 'Uhrzeiten, Daten, Beträge und Rechnungen.', 'zahlen', 3, 22),
    L('s5', 'Umlaute & ß', 'Texte mit ä, ö, ü und ß – ohne Zögern.', 'umlaut', 3, 25),
    L('s6', 'Sonderzeichen', 'E-Mail-Adressen, Prozent, Rechenzeichen und Pfade. Manche Zeichen brauchen AltGr.', 'sonder', 3, 22, 92),
    L('s7', 'Absätze', 'Zusammenhängende Mini-Texte schreiben.', 'absatz', 2, 28),
    L('s8', 'Beruf & Büro', 'Fachtexte aus Wirtschaft und Verwaltung.', 'fach', 3, 28),
    L('s9', 'Englisch', 'Briefe und Alltagssätze auf Englisch.', 'englisch', 4, 30),
    L('s10', 'Meisterstufe', 'Lange Absätze am Stück – Ausdauer und Genauigkeit.', 'meister', 2, 35, 96),
  ];
}
