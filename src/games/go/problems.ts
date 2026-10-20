// Aufgaben: Fangen und Retten mit exakter Suche. Jede Aufgabe wird vom Löser geprüft,
// es gibt keine auswendig gelernten Lösungen – jeder richtige Zug wird erkannt.
import { BLACK, EMPTY, type Color, type GoState, WHITE, DEFAULT_RULES, groupAt, neighbors, newState, other, play, setStones } from './engine';
import { mulberry32, randInt } from '../shared/rng';

export interface Problem {
  id: string;
  title: string;
  text: string;
  n: number;
  rows: string[];
  kind: 'capture' | 'save';
  depth: number;
  /** Ziel-Stein [x, y] */
  target: [number, number];
}

export const PROBLEM_RULES = { ...DEFAULT_RULES, komi: 0, scoring: 'flaeche' as const };

export function parseRows(rows: string[]): { n: number; black: number[]; white: number[] } {
  const n = rows.length;
  const black: number[] = [], white: number[] = [];
  rows.forEach((r, y) => { for (let x = 0; x < n; x++) { const c = r[x]; if (c === 'X') black.push(y * n + x); else if (c === 'O') white.push(y * n + x); } });
  return { n, black, white };
}

export function problemState(p: Problem): { state: GoState; anchor: number; attacker: Color; defender: Color } {
  const { n, black, white } = parseRows(p.rows);
  const rules = { ...PROBLEM_RULES, n };
  const anchor = p.target[1] * n + p.target[0];
  const tc: Color = black.includes(anchor) ? BLACK : WHITE;
  const attacker = other(tc);
  const state = setStones(newState(rules), black, white, p.kind === 'capture' ? attacker : tc);
  return { state, anchor, attacker, defender: tc };
}

/** Leere Punkte im Umkreis (Manhattan ≤ 3) um die Zielgruppe. */
function region(s: GoState, anchor: number): number[] {
  const n = s.rules.n;
  const nb = neighbors(n, false);
  if (!s.board[anchor]) return [];
  const g = groupAt(s.board, nb, anchor).stones;
  const out: number[] = [];
  for (let i = 0; i < s.board.length; i++) {
    if (s.board[i] !== EMPTY) continue;
    const x = i % n, y = (i / n) | 0;
    for (const st of g) if (Math.abs((st % n) - x) + Math.abs(((st / n) | 0) - y) <= 3) { out.push(i); break; }
  }
  return out;
}

type Memo = Map<string, boolean>;
const key = (s: GoState, d: number) => `${s.hash}|${s.turn}|${d}|${s.ko}`;

/** Kann der Angreifer (am Zug) die Gruppe am Anker in höchstens `depth` eigenen Zügen erzwingbar schlagen? */
export function attackerWins(s: GoState, anchor: number, depth: number, memo: Memo = new Map()): boolean {
  if (depth <= 0 || !s.board[anchor]) return !s.board[anchor] ? true : false;
  const k = key(s, depth);
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  let win = false;
  const tc = s.board[anchor] as Color;
  for (const m of region(s, anchor)) {
    const r = play(s, m);
    if (!r.ok) continue;
    if (r.state.board[anchor] !== tc) { win = true; break; }
    if (depth > 1 && defenderLoses(r.state, anchor, depth - 1, memo)) { win = true; break; }
  }
  memo.set(k, win);
  return win;
}

/** Verteidiger am Zug: verliert er in jedem Fall gegen `depth` weitere Angriffszüge? */
export function defenderLoses(s: GoState, anchor: number, depth: number, memo: Memo = new Map()): boolean {
  const tc = s.board[anchor] as Color;
  if (!tc) return true;
  const replies = [-1, ...region(s, anchor)];
  for (const m of replies) {
    const r = play(s, m);
    if (!r.ok) continue;
    if (r.state.board[anchor] !== tc) continue; // Selbstschlag zählt als verloren für ihn
    if (!attackerWins(r.state, anchor, depth, memo)) return false;
  }
  return true;
}

/** Richtige erste Züge für den Spieler. */
export function correctMoves(p: Problem, s: GoState, anchor: number, depthLeft = p.depth): number[] {
  const memo: Memo = new Map();
  const tc = (p.kind === 'capture' ? other(s.turn) : s.turn) as Color;
  const out: number[] = [];
  for (const m of region(s, anchor)) {
    const r = play(s, m);
    if (!r.ok) continue;
    if (p.kind === 'capture') {
      if (r.state.board[anchor] !== tc) out.push(m);
      else if (depthLeft > 1 && defenderLoses(r.state, anchor, depthLeft - 1, memo)) out.push(m);
    } else {
      if (r.state.board[anchor] === tc && !attackerWins(r.state, anchor, depthLeft, memo)) out.push(m);
    }
  }
  return out;
}

/** Antwort des Gegners (Verteidiger beim Fangen, Angreifer beim Retten). */
export function replyMove(p: Problem, s: GoState, anchor: number, depthLeft: number): number {
  const memo: Memo = new Map();
  const nb = neighbors(s.rules.n, false);
  const tc = s.board[anchor] as Color;
  const libsAfter = (st: GoState) => (st.board[anchor] === tc ? groupAt(st.board, nb, anchor).libs.length : 0);
  let best = -1, bv = -1e9;
  if (p.kind === 'capture') {
    for (const m of region(s, anchor)) {
      const r = play(s, m);
      if (!r.ok || r.state.board[anchor] !== tc) continue;
      let v = libsAfter(r.state) * 2;
      if (!attackerWins(r.state, anchor, Math.max(1, depthLeft), memo)) v += 100;
      if (v > bv) { bv = v; best = m; }
    }
  } else {
    for (const m of region(s, anchor)) {
      const r = play(s, m);
      if (!r.ok) continue;
      const v = (r.state.board[anchor] !== tc ? 100 : 20 - libsAfter(r.state)) + (attackerWins(r.state, anchor, depthLeft, memo) ? 50 : 0);
      if (v > bv) { bv = v; best = m; }
    }
  }
  return best;
}

// ───────── Zufallsaufgaben ─────────

export function genProblem(seed: number, kind: 'capture' | 'save', depth: number, n = 7): Problem | null {
  const rnd = mulberry32(seed);
  for (let attempt = 0; attempt < 600; attempt++) {
    const black: number[] = [], white: number[] = [];
    const fill = 0.28 + rnd() * 0.18;
    const cells: number[] = new Array(n * n).fill(0);
    for (let i = 0; i < n * n; i++) if (rnd() < fill) cells[i] = rnd() < 0.5 ? BLACK : WHITE;
    // Gruppen ohne Freiheit entfernen
    const nb = neighbors(n, false);
    const b = Uint8Array.from(cells);
    for (let i = 0; i < b.length; i++) if (b[i]) { const g = groupAt(b, nb, i); if (!g.libs.length) for (const st of g.stones) b[st] = EMPTY; }
    for (let i = 0; i < b.length; i++) { if (b[i] === BLACK) black.push(i); else if (b[i] === WHITE) white.push(i); }
    const tcol: Color = rnd() < 0.5 ? BLACK : WHITE;
    const targets = (tcol === BLACK ? black : white).filter((i) => {
      const g = groupAt(b, nb, i);
      return g.stones[0] === i && g.libs.length === (kind === 'save' ? 1 : depth === 1 ? 1 : 2) && g.stones.length <= 4;
    });
    if (!targets.length) continue;
    const t = targets[randInt(rnd, targets.length)];
    const rows: string[] = [];
    for (let y = 0; y < n; y++) { let r = ''; for (let x = 0; x < n; x++) { const v = b[y * n + x]; r += v === BLACK ? 'X' : v === WHITE ? 'O' : '.'; } rows.push(r); }
    const p: Problem = {
      id: `gen-${seed}-${kind}-${depth}`, title: kind === 'capture' ? 'Fangen' : 'Retten', n, rows, kind, depth, target: [t % n, (t / n) | 0],
      text: kind === 'capture' ? `Fange die markierte Gruppe in höchstens ${depth} Zug${depth === 1 ? '' : 'en'}.` : 'Die markierte Gruppe ist in Atari. Rette sie.',
    };
    const { state, anchor } = problemState(p);
    const sols = correctMoves(p, state, anchor);
    if (sols.length < 1 || sols.length > 2) continue;
    if (kind === 'capture' && depth > 1 && correctMoves({ ...p, depth: depth - 1 }, state, anchor, depth - 1).length) continue;
    return p;
  }
  return null;
}

// ───────── Handgeschriebene Aufgaben ─────────

export const CURATED: Problem[] = [
  { id: 'c-fang1', title: 'Der erste Fang', text: 'Der weiße Stein hat nur noch eine Freiheit. Nimm sie ihm.', n: 5, kind: 'capture', depth: 1, target: [2, 2], rows: ['.....', '..X..', '.XOX.', '.....', '.....'] },
  { id: 'c-ecke', title: 'Ecke und Rand', text: 'In der Ecke hat ein Stein nur zwei Nachbarn. Schlage ihn.', n: 5, kind: 'capture', depth: 1, target: [0, 0], rows: ['OX...', '.....', '.....', '.....', '.....'] },
  { id: 'c-zwei', title: 'Zwei Steine', text: 'Verbundene Steine teilen ihre Freiheiten. Schlage beide auf einmal.', n: 5, kind: 'capture', depth: 1, target: [1, 1], rows: ['.XX..', 'XOOX.', '..X..', '.....', '.....'] },
  { id: 'c-ko', title: 'Das Ko', text: 'Schlage den weißen Stein. Danach darf Weiß nicht sofort zurückschlagen – das ist die Ko-Regel.', n: 5, kind: 'capture', depth: 1, target: [1, 1], rows: ['.XO..', 'XO.O.', '.XO..', '.....', '.....'] },
  { id: 'c-flucht', title: 'Atari!', text: 'Dein Stein hat nur noch eine Freiheit. Verlängere – aber wohin?', n: 5, kind: 'save', depth: 2, target: [2, 2], rows: ['.....', '..O..', '.OXO.', '.....', '.....'] },
];

export function problemKey(p: Problem) { return p.id; }
