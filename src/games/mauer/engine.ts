// Mauerbau (Quoridor): Wettlauf über das Brett, Mauern zwingen den Gegner zu Umwegen.
// Reine Logik – Zug, Regeln, kürzeste Wege und die Suche der KI.
import { mulberry32, type Rng } from '../shared/rng';

export interface Pos { r: number; c: number }
export type Move = { t: 'm' | 'h' | 'v'; r: number; c: number };
export interface Rules { n: number; walls: number; /** vorgebaute Mauern (Labyrinth-Start) */ pre?: Move[] }

export interface State {
  n: number;
  pawn: [Pos, Pos];
  left: [number, number];
  /** hw[r*(n-1)+c]: waagerechte Mauer unter Feld (r,c), reicht über die Spalten c und c+1 */
  hw: Uint8Array;
  /** vw[r*(n-1)+c]: senkrechte Mauer rechts von Feld (r,c), reicht über die Zeilen r und r+1 */
  vw: Uint8Array;
  turn: 0 | 1;
  plies: number;
}

export const PRESETS: { id: string; name: string; info: string; rules: Rules }[] = [
  { id: 'mini', name: 'Mini 5×5', info: 'Kurz und scharf – drei Mauern je Seite.', rules: { n: 5, walls: 3 } },
  { id: 'mittel', name: 'Mittel 7×7', info: 'Schnelle Partien, sechs Mauern je Seite.', rules: { n: 7, walls: 6 } },
  { id: 'klassik', name: 'Klassisch 9×9', info: 'Das Original: zehn Mauern je Seite.', rules: { n: 9, walls: 10 } },
  { id: 'gross', name: 'Groß 11×11', info: 'Lange Wege, 15 Mauern je Seite.', rules: { n: 11, walls: 15 } },
];

export const FILES = 'abcdefghijk';
export const startRow = (p: 0 | 1, n: number) => (p === 0 ? n - 1 : 0);
export const goalRow = (p: 0 | 1, n: number) => (p === 0 ? 0 : n - 1);

export function newState(rules: Rules): State {
  const n = rules.n, w = n - 1, mid = Math.floor(n / 2);
  const s: State = {
    n, pawn: [{ r: n - 1, c: mid }, { r: 0, c: mid }], left: [rules.walls, rules.walls],
    hw: new Uint8Array(w * w), vw: new Uint8Array(w * w), turn: 0, plies: 0,
  };
  for (const m of rules.pre ?? []) { if (m.t === 'h') s.hw[m.r * w + m.c] = 1; else if (m.t === 'v') s.vw[m.r * w + m.c] = 1; }
  return s;
}

export function clone(s: State): State {
  return { n: s.n, pawn: [{ ...s.pawn[0] }, { ...s.pawn[1] }], left: [s.left[0], s.left[1]], hw: s.hw.slice(), vw: s.vw.slice(), turn: s.turn, plies: s.plies };
}

const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];

/** Ist der Schritt von (r,c) in Richtung d (0 oben, 1 rechts, 2 unten, 3 links) durch Rand oder Mauer versperrt? */
export function blocked(s: State, r: number, c: number, d: number): boolean {
  const n = s.n, w = n - 1;
  switch (d) {
    case 0: return r === 0 || (c < w && s.hw[(r - 1) * w + c] === 1) || (c > 0 && s.hw[(r - 1) * w + c - 1] === 1);
    case 2: return r === n - 1 || (c < w && s.hw[r * w + c] === 1) || (c > 0 && s.hw[r * w + c - 1] === 1);
    case 1: return c === n - 1 || (r < w && s.vw[r * w + c] === 1) || (r > 0 && s.vw[(r - 1) * w + c] === 1);
    default: return c === 0 || (r < w && s.vw[r * w + c - 1] === 1) || (r > 0 && s.vw[(r - 1) * w + c - 1] === 1);
  }
}

/** Zielfelder des Bauern von Spieler p (mit Sprungregeln). */
export function pawnMoves(s: State, p: 0 | 1 = s.turn): Pos[] {
  const me = s.pawn[p], op = s.pawn[1 - p];
  const out: Pos[] = [];
  for (let d = 0; d < 4; d++) {
    if (blocked(s, me.r, me.c, d)) continue;
    const nr = me.r + DR[d], nc = me.c + DC[d];
    if (nr !== op.r || nc !== op.c) { out.push({ r: nr, c: nc }); continue; }
    if (!blocked(s, op.r, op.c, d)) { out.push({ r: op.r + DR[d], c: op.c + DC[d] }); continue; }
    for (const d2 of [(d + 1) % 4, (d + 3) % 4]) if (!blocked(s, op.r, op.c, d2)) out.push({ r: op.r + DR[d2], c: op.c + DC[d2] });
  }
  return out;
}

/** Kürzeste Schrittzahl bis zur Zielreihe (Gegner wird ignoriert); -1 wenn eingemauert. */
export function distance(s: State, p: 0 | 1): number {
  const n = s.n, goal = goalRow(p, n);
  const seen = new Uint8Array(n * n);
  const q = new Int16Array(n * n);
  let h = 0, t = 0;
  const st = s.pawn[p];
  q[t++] = st.r * n + st.c; seen[st.r * n + st.c] = 1;
  let layer = 0, end = t;
  while (h < t) {
    while (h < end) {
      const k = q[h++], r = (k / n) | 0, c = k % n;
      if (r === goal) return layer;
      for (let d = 0; d < 4; d++) {
        if (blocked(s, r, c, d)) continue;
        const j = (r + DR[d]) * n + c + DC[d];
        if (!seen[j]) { seen[j] = 1; q[t++] = j; }
      }
    }
    layer++; end = t;
  }
  return -1;
}

/** Ein kürzester Weg (Felder inklusive Start), leer wenn keiner existiert. */
export function shortestPath(s: State, p: 0 | 1): Pos[] {
  const n = s.n, goal = goalRow(p, n);
  const prev = new Int16Array(n * n).fill(-2);
  const q: number[] = [];
  const st = s.pawn[p];
  const k0 = st.r * n + st.c;
  prev[k0] = -1; q.push(k0);
  for (let h = 0; h < q.length; h++) {
    const k = q[h], r = (k / n) | 0, c = k % n;
    if (r === goal) {
      const path: Pos[] = [];
      for (let x = k; x !== -1; x = prev[x]) path.push({ r: (x / n) | 0, c: x % n });
      return path.reverse();
    }
    for (let d = 0; d < 4; d++) {
      if (blocked(s, r, c, d)) continue;
      const j = (r + DR[d]) * n + c + DC[d];
      if (prev[j] === -2) { prev[j] = k; q.push(j); }
    }
  }
  return [];
}

/** Ist die Mauer regelgerecht? (Rand, Überschneidung, Kreuzung, Mauervorrat, Weg für beide offen) */
export function wallLegal(s: State, m: Move, checkPaths = true): boolean {
  if (m.t === 'm') return false;
  const w = s.n - 1;
  if (m.r < 0 || m.c < 0 || m.r >= w || m.c >= w) return false;
  if (s.left[s.turn] <= 0) return false;
  const i = m.r * w + m.c;
  if (m.t === 'h') {
    if (s.hw[i] || s.vw[i]) return false;
    if (m.c > 0 && s.hw[i - 1]) return false;
    if (m.c < w - 1 && s.hw[i + 1]) return false;
  } else {
    if (s.vw[i] || s.hw[i]) return false;
    if (m.r > 0 && s.vw[i - w]) return false;
    if (m.r < w - 1 && s.vw[i + w]) return false;
  }
  if (!checkPaths) return true;
  const a = m.t === 'h' ? s.hw : s.vw;
  a[i] = 1;
  const ok = distance(s, 0) >= 0 && distance(s, 1) >= 0;
  a[i] = 0;
  return ok;
}

export function legal(s: State, m: Move): boolean {
  if (winner(s) !== null) return false;
  if (m.t === 'm') return pawnMoves(s).some((p) => p.r === m.r && p.c === m.c);
  return wallLegal(s, m);
}

export interface Undo { m: Move; from: Pos; turn: 0 | 1 }

/** Führt einen (gültigen) Zug aus und liefert die Rücknahme. */
export function apply(s: State, m: Move): Undo {
  const u: Undo = { m, from: { ...s.pawn[s.turn] }, turn: s.turn };
  if (m.t === 'm') s.pawn[s.turn] = { r: m.r, c: m.c };
  else {
    const w = s.n - 1;
    (m.t === 'h' ? s.hw : s.vw)[m.r * w + m.c] = 1;
    s.left[s.turn]--;
  }
  s.turn = (1 - s.turn) as 0 | 1;
  s.plies++;
  return u;
}
export function undo(s: State, u: Undo) {
  s.turn = u.turn;
  s.plies--;
  if (u.m.t === 'm') s.pawn[u.turn] = u.from;
  else {
    const w = s.n - 1;
    (u.m.t === 'h' ? s.hw : s.vw)[u.m.r * w + u.m.c] = 0;
    s.left[u.turn]++;
  }
}

export function winner(s: State): 0 | 1 | null {
  if (s.pawn[0].r === 0) return 0;
  if (s.pawn[1].r === s.n - 1) return 1;
  return null;
}

// ───────── Notation ─────────

export const sq = (n: number, p: Pos) => `${FILES[p.c]}${n - p.r}`;
export function notate(n: number, m: Move): string {
  return m.t === 'm' ? sq(n, m) : `${FILES[m.c]}${n - 1 - m.r}${m.t}`;
}
/** Umkehrung von `notate`; null bei ungültigem Text. */
export function parseMove(n: number, txt: string): Move | null {
  const x = /^([a-k])(\d+)([hv]?)$/.exec(txt.trim().toLowerCase());
  if (!x) return null;
  const c = FILES.indexOf(x[1]), rank = +x[2];
  if (x[3]) return { t: x[3] as 'h' | 'v', r: n - 1 - rank, c };
  return { t: 'm', r: n - rank, c };
}

// ───────── Mauer-Kandidaten und Bewertung ─────────

function wallsNear(s: State, cells: Pos[], out: Map<string, Move>) {
  const w = s.n - 1;
  for (const p of cells) {
    for (let dr = -1; dr <= 0; dr++) for (let dc = -1; dc <= 0; dc++) {
      const r = p.r + dr, c = p.c + dc;
      if (r < 0 || c < 0 || r >= w || c >= w) continue;
      for (const t of ['h', 'v'] as const) out.set(`${t}${r},${c}`, { t, r, c });
    }
  }
}

/** Alle Mauern, die den Gegner am kürzesten Weg stören könnten (und ein paar nahe Notbremsen). */
export function wallCandidates(s: State, p: 0 | 1 = s.turn, wide = false): Move[] {
  const opp = (1 - p) as 0 | 1;
  const cells: Pos[] = [];
  const path = shortestPath(s, opp);
  const lim = wide ? path.length : Math.min(path.length, 7);
  for (let i = 0; i < lim; i++) cells.push(path[i]);
  const map = new Map<string, Move>();
  wallsNear(s, cells, map);
  if (wide) wallsNear(s, [s.pawn[p], s.pawn[opp]], map);
  const save = s.turn;
  s.turn = p;
  const res: Move[] = [];
  for (const m of map.values()) if (wallLegal(s, m)) res.push(m);
  s.turn = save;
  return res;
}

export function allWalls(s: State): Move[] {
  const w = s.n - 1, out: Move[] = [];
  for (let r = 0; r < w; r++) for (let c = 0; c < w; c++) for (const t of ['h', 'v'] as const) { const m = { t, r, c }; if (wallLegal(s, m)) out.push(m); }
  return out;
}

const WIN = 100000;
/** Bewertung aus Sicht von `me` (je größer, desto besser). */
export function evaluate(s: State, me: 0 | 1): number {
  const w = winner(s);
  if (w !== null) return w === me ? WIN - s.plies : -WIN + s.plies;
  const op = (1 - me) as 0 | 1;
  const dm = distance(s, me), dop = distance(s, op);
  // Wer am Zug ist, hat einen halben Schritt Vorsprung
  const tempo = s.turn === me ? 0.5 : -0.5;
  const walls = (s.left[me] - s.left[op]) * 0.7;
  return (dop - dm + tempo) * 100 + walls * 10;
}

export interface Scored { m: Move; score: number }

function ordered(s: State, k: number): Move[] {
  const p = s.turn, opp = (1 - p) as 0 | 1;
  const moves: { m: Move; key: number }[] = [];
  const myPath = shortestPath(s, p);
  const next = myPath[1];
  for (const q of pawnMoves(s)) {
    const base = next && next.r === q.r && next.c === q.c ? 1000 : 0;
    const gain = Math.abs(q.r - goalRow(p, s.n)) * -1;
    moves.push({ m: { t: 'm', r: q.r, c: q.c }, key: base + gain });
  }
  if (s.left[p] > 0) {
    const d0 = distance(s, opp), m0 = distance(s, p);
    const ws = wallCandidates(s, p);
    const scored: { m: Move; key: number }[] = [];
    for (const m of ws) {
      const u = apply(s, m);
      const d1 = distance(s, opp), m1 = distance(s, p);
      undo(s, u);
      const gain = (d1 - d0) - (m1 - m0);
      if (gain > 0) scored.push({ m, key: gain * 100 + (s.n - Math.abs(m.r - s.pawn[opp].r)) });
    }
    scored.sort((a, b) => b.key - a.key);
    for (const x of scored.slice(0, k)) moves.push(x);
  }
  moves.sort((a, b) => b.key - a.key);
  return moves.map((x) => x.m);
}

interface Budget { until: number; nodes: number; stop: boolean }

function negamax(s: State, depth: number, alpha: number, beta: number, me: 0 | 1, k: number, bud: Budget): number {
  const sign = s.turn === me ? 1 : -1;
  if (winner(s) !== null || depth === 0) return sign * evaluate(s, me);
  if ((++bud.nodes & 255) === 0 && performance.now() > bud.until) bud.stop = true;
  if (bud.stop) return sign * evaluate(s, me);
  let best = -Infinity;
  for (const m of ordered(s, k)) {
    const u = apply(s, m);
    const v = -negamax(s, depth - 1, -beta, -alpha, me, k, bud);
    undo(s, u);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
    if (bud.stop) break;
  }
  return best === -Infinity ? sign * evaluate(s, me) : best;
}

export interface Level { id: number; name: string; info: string; depth: number; k: number; ms: number; noise: number }
export const LEVELS: Level[] = [
  { id: 1, name: 'Lehrling', info: 'Läuft meist geradeaus und setzt Mauern eher zufällig.', depth: 0, k: 0, ms: 0, noise: 1 },
  { id: 2, name: 'Geselle', info: 'Denkt zwei Halbzüge voraus.', depth: 2, k: 6, ms: 300, noise: 0.35 },
  { id: 3, name: 'Meister', info: 'Rechnet drei Halbzüge durch.', depth: 3, k: 8, ms: 600, noise: 0.08 },
  { id: 4, name: 'Baumeister', info: 'Sucht vier Halbzüge tief.', depth: 4, k: 10, ms: 1000, noise: 0 },
  { id: 5, name: 'Architekt', info: 'Vertieft, solange die Zeit reicht (bis sechs Halbzüge).', depth: 6, k: 12, ms: 1200, noise: 0 },
];

/** Bewertet alle Wurzelzüge (Sicht des Spielers am Zug). Für Tipp, Coach und KI. */
export function scoreMoves(s0: State, depth: number, k: number, ms: number): Scored[] {
  const s = clone(s0), me = s.turn;
  const bud: Budget = { until: performance.now() + ms, nodes: 0, stop: false };
  let res: Scored[] = [];
  const roots = ordered(s, Math.max(k, 12));
  for (let d = 1; d <= Math.max(1, depth); d++) {
    const cur: Scored[] = [];
    let alpha = -Infinity;
    let done = true;
    for (const m of roots) {
      const u = apply(s, m);
      // volles Fenster je Wurzelzug: Bewertungen bleiben vergleichbar (für den Coach)
      const v = -negamax(s, d - 1, -Infinity, Infinity, me, k, bud);
      undo(s, u);
      if (bud.stop) { done = false; break; }
      cur.push({ m, score: v });
      if (v > alpha) alpha = v;
    }
    if (done) { res = cur.sort((a, b) => b.score - a.score); roots.sort((a, b) => (cur.find((x) => x.m === b)?.score ?? 0) - (cur.find((x) => x.m === a)?.score ?? 0)); }
    else { if (!res.length) res = cur.sort((a, b) => b.score - a.score); break; }
    if (Math.abs(res[0].score) > WIN / 2) break;
  }
  return res;
}

const sameMove = (a: Move, b: Move) => a.t === b.t && a.r === b.r && a.c === b.c;
export { sameMove };

/** Schlüssel einer Stellung (für Wiederholungen). */
export function posKey(s: State): string {
  return `${s.pawn[0].r},${s.pawn[0].c};${s.pawn[1].r},${s.pawn[1].c};${s.left[0]},${s.left[1]};${s.turn};${s.hw.join('')}${s.vw.join('')}`;
}

/** Zug der KI. `seen`: bereits gespielte Stellungen – Wiederholungen werden gemieden. */
export function aiMove(s: State, level: number, rnd: Rng = Math.random, seen?: ReadonlySet<string>): Move {
  const L = LEVELS[Math.max(0, Math.min(4, level - 1))];
  const mine = pawnMoves(s);
  if (L.depth === 0) {
    const path = shortestPath(s, s.turn);
    const next = path[1];
    if (s.left[s.turn] > 0 && rnd() < 0.18) {
      const ws = wallCandidates(s, s.turn, true);
      if (ws.length) return ws[Math.floor(rnd() * ws.length)];
    }
    if (next && rnd() < 0.8 && mine.some((p) => p.r === next.r && p.c === next.c)) return { t: 'm', r: next.r, c: next.c };
    const p = mine[Math.floor(rnd() * mine.length)];
    return { t: 'm', r: p.r, c: p.c };
  }
  // Sofortgewinn
  const goal = goalRow(s.turn, s.n);
  const win = mine.find((p) => p.r === goal);
  if (win) return { t: 'm', r: win.r, c: win.c };
  let scores = scoreMoves(s, L.depth, L.k, L.ms);
  if (seen && seen.size) {
    const fresh = scores.filter((x) => { const u = apply(s, x.m); const k = posKey(s); undo(s, u); return !seen.has(k); });
    if (fresh.length) scores = fresh;
  }
  if (!scores.length) { const p = mine[0]; return { t: 'm', r: p.r, c: p.c }; }
  if (L.noise > 0 && rnd() < L.noise && scores.length > 1) {
    const top = scores.slice(0, Math.min(4, scores.length));
    return top[1 + Math.floor(rnd() * (top.length - 1))].m;
  }
  return scores[0].m;
}

// ───────── Coach ─────────

export type Grade = 'best' | 'good' | 'inacc' | 'mistake' | 'blunder';
export const GRADE_TXT: Record<Grade, string> = { best: 'Bester Zug', good: 'Gut', inacc: 'Ungenau', mistake: 'Fehler', blunder: 'Patzer' };

/** Bewertet einen gespielten Zug gegen den besten (Verlust in Schritten). */
export function gradeMove(before: State, played: Move, depth = 3, ms = 700): { grade: Grade; loss: number; best: Move } {
  const scores = scoreMoves(before, depth, 9, ms);
  if (!scores.length) return { grade: 'best', loss: 0, best: played };
  const best = scores[0];
  const mine = scores.find((x) => sameMove(x.m, played));
  const loss = mine ? Math.max(0, (best.score - mine.score) / 100) : 3;
  const grade: Grade = loss < 0.15 ? 'best' : loss < 0.6 ? 'good' : loss < 1.5 ? 'inacc' : loss < 3 ? 'mistake' : 'blunder';
  return { grade, loss, best: best.m };
}

// ───────── Aufgaben ─────────

export interface Puzzle {
  kind: 'race' | 'wall';
  state: State;
  /** race: wer gewinnt, wenn niemand eine Mauer setzt? */
  answer?: 0 | 1;
  /** wall: bester Nettogewinn in Schritten */
  best?: number;
  title: string;
}

/** Zufallsstellung mit einigen Mauern, nachspielbar aus dem Startwert. */
export function randomPosition(rules: Rules, rnd: Rng, plies: number): State {
  const s = newState(rules);
  for (let i = 0; i < plies; i++) {
    if (winner(s) !== null) break;
    const opp = (1 - s.turn) as 0 | 1;
    if (s.left[s.turn] > 0 && rnd() < 0.45) {
      const ws = wallCandidates(s, s.turn, true).filter((m) => { const u = apply(s, m); const g = distance(s, opp); undo(s, u); return g > distance(s, opp); });
      if (ws.length) { apply(s, ws[Math.floor(rnd() * ws.length)]); continue; }
    }
    const path = shortestPath(s, s.turn);
    const ms = pawnMoves(s);
    const nx = path[1];
    const pick = nx && ms.some((p) => p.r === nx.r && p.c === nx.c) && rnd() < 0.85 ? nx : ms[Math.floor(rnd() * ms.length)];
    apply(s, { t: 'm', r: pick.r, c: pick.c });
  }
  return s;
}

export function netGain(s: State, m: Move): number {
  const p = s.turn, opp = (1 - p) as 0 | 1;
  const d0 = distance(s, opp), m0 = distance(s, p);
  const c = clone(s);
  apply(c, m);
  return (distance(c, opp) - d0) - (distance(c, p) - m0);
}

export function bestWallGain(s: State): number {
  let best = 0;
  for (const m of allWalls(s)) best = Math.max(best, netGain(s, m));
  return best;
}

export function makePuzzle(seed: number, kind: 'race' | 'wall', n = 7): Puzzle {
  const rnd = mulberry32(seed);
  const walls = n <= 5 ? 3 : n <= 7 ? 6 : 10;
  for (let tries = 0; tries < 80; tries++) {
    const s = randomPosition({ n, walls }, rnd, 10 + Math.floor(rnd() * 14));
    if (winner(s) !== null) continue;
    if (kind === 'race') {
      const d0 = distance(s, 0), d1 = distance(s, 1);
      if (d0 === d1 && s.turn === 0) continue; // knapp, aber eindeutig: wer zuerst ankommt
      const first = s.turn;
      // Gewinner: wer weniger Züge braucht; bei Gleichstand der, der am Zug ist
      const w: 0 | 1 = d0 < d1 ? 0 : d1 < d0 ? 1 : first;
      if (Math.abs(d0 - d1) > 2) continue;
      return { kind, state: s, answer: w, title: 'Wer erreicht zuerst die Zielreihe, wenn ab jetzt nur gelaufen wird?' };
    }
    if (s.left[s.turn] === 0) continue;
    const best = bestWallGain(s);
    if (best < 2) continue;
    return { kind, state: s, best, title: 'Setze die Mauer, die dem Gegner am meisten kostet – und dich am wenigsten.' };
  }
  const s = newState({ n, walls });
  return kind === 'race'
    ? { kind, state: s, answer: 0, title: 'Wer erreicht zuerst die Zielreihe, wenn ab jetzt nur gelaufen wird?' }
    : { kind, state: s, best: bestWallGain(s), title: 'Setze die Mauer, die dem Gegner am meisten kostet.' };
}

/** Spielt eine Partie zweier Stufen bis zum Ende (Test/Statistik). */
export function playOut(rules: Rules, levels: [number, number], rnd: Rng, maxPlies = 300): { winner: 0 | 1 | null; plies: number; moves: Move[] } {
  const s = newState(rules);
  const moves: Move[] = [];
  const seen = new Set<string>([posKey(s)]);
  while (winner(s) === null && s.plies < maxPlies) {
    const m = aiMove(s, levels[s.turn], rnd, seen);
    if (!legal(s, m)) throw new Error('illegaler KI-Zug ' + JSON.stringify(m));
    apply(s, m);
    seen.add(posKey(s));
    moves.push(m);
  }
  return { winner: winner(s), plies: s.plies, moves };
}

// ───────── Labyrinth-Start ─────────

/** Punktsymmetrisch verteilte Mauern für den Labyrinth-Start (je `pairs` Paare). */
export function labyrinth(n: number, pairs: number, rnd: Rng): Move[] {
  const w = n - 1;
  const s = newState({ n, walls: 99 });
  const out: Move[] = [];
  let tries = 0;
  while (out.length < pairs * 2 && tries++ < 400) {
    const t = rnd() < 0.5 ? 'h' : 'v';
    const r = 1 + Math.floor(rnd() * Math.max(1, w - 2)), c = Math.floor(rnd() * w);
    const a: Move = { t, r: Math.min(w - 1, r), c };
    const b: Move = { t, r: w - 1 - a.r, c: w - 1 - a.c };
    if (a.r === b.r && a.c === b.c) continue;
    if (!wallLegal(s, a)) continue;
    (a.t === 'h' ? s.hw : s.vw)[a.r * w + a.c] = 1;
    if (!wallLegal(s, b)) { (a.t === 'h' ? s.hw : s.vw)[a.r * w + a.c] = 0; continue; }
    (b.t === 'h' ? s.hw : s.vw)[b.r * w + b.c] = 1;
    out.push(a, b);
  }
  return out;
}

/** Wie viele Schritte kostet die Mauer den Gegner (opp) und den Setzenden selbst (own)? */
export function wallDeltas(s: State, m: Move): { opp: number; own: number } {
  const p = s.turn, q = (1 - p) as 0 | 1;
  const c = clone(s);
  apply(c, m);
  return { opp: distance(c, q) - distance(s, q), own: distance(c, p) - distance(s, p) };
}
