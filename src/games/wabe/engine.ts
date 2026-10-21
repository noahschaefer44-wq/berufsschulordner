// Wabe: ein Spiel ohne Brett. Insekten-Plättchen bilden gemeinsam einen Schwarm; wer die gegnerische Königin
// ringsum einschließt, gewinnt. Reine Logik: Regeln, Zuggenerator, Suche.
import { type Rng } from '../shared/rng';

export type Color = 0 | 1;
export type Kind = 'Q' | 'B' | 'S' | 'A' | 'G' | 'L' | 'M';
export const KINDS: Kind[] = ['Q', 'B', 'S', 'A', 'G', 'L', 'M'];
export const KIND_NAME: Record<Kind, string> = { Q: 'Königin', B: 'Käfer', S: 'Spinne', A: 'Ameise', G: 'Grashüpfer', L: 'Marienkäfer', M: 'Mücke' };
export type Hand = Record<Kind, number>;

export interface SetDef { id: string; name: string; info: string; counts: Hand }
const H = (Q: number, B: number, S: number, A: number, G: number, L = 0, M = 0): Hand => ({ Q, B, S, A, G, L, M });
export const SETS: SetDef[] = [
  { id: 'basis', name: 'Klassisch', info: 'Königin, 2 Käfer, 2 Spinnen, 3 Ameisen, 3 Grashüpfer.', counts: H(1, 2, 2, 3, 3) },
  { id: 'plus', name: 'Mit Erweiterung', info: 'Dazu Marienkäfer und Mücke – mehr Möglichkeiten.', counts: H(1, 2, 2, 3, 3, 1, 1) },
  { id: 'mini', name: 'Mini', info: 'Königin, Käfer, Spinne, 2 Ameisen, 2 Grashüpfer – kurze Partien.', counts: H(1, 1, 1, 2, 2) },
];

export interface Piece { id: number; color: Color; kind: Kind }
export type Move = { t: 'p'; kind: Kind; to: number } | { t: 'm'; from: number; to: number } | { t: 'x' };

export interface G {
  set: SetDef;
  cells: Map<number, Piece[]>;
  hand: [Hand, Hand];
  turn: Color;
  /** eigene Züge je Spieler (für die Königin-Regel) */
  turns: [number, number];
  ply: number;
  queen: [number, number];
}

export const DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const key = (q: number, r: number) => (q + 48) * 128 + (r + 48);
export const unkey = (k: number): [number, number] => [(k >> 7) - 48, (k & 127) - 48];
const nbr = (k: number, d: number) => k + DIRS[d][0] * 128 + DIRS[d][1];
export const neighbors = (k: number): number[] => DIRS.map((_, d) => nbr(k, d));

export function newGame(set: SetDef): G {
  return { set, cells: new Map(), hand: [{ ...set.counts }, { ...set.counts }], turn: 0, turns: [0, 0], ply: 0, queen: [-1, -1] };
}
export function cloneGame(g: G): G {
  const cells = new Map<number, Piece[]>();
  g.cells.forEach((v, k) => cells.set(k, v.slice()));
  return { set: g.set, cells, hand: [{ ...g.hand[0] }, { ...g.hand[1] }], turn: g.turn, turns: [g.turns[0], g.turns[1]], ply: g.ply, queen: [g.queen[0], g.queen[1]] };
}

export const height = (g: G, k: number) => g.cells.get(k)?.length ?? 0;
export const top = (g: G, k: number): Piece | undefined => { const s = g.cells.get(k); return s ? s[s.length - 1] : undefined; };
const pid = (g: G, c: Color, kind: Kind) => c * 1000 + KINDS.indexOf(kind) * 10 + (g.set.counts[kind] - g.hand[c][kind]);

// ───────── Hilfen ─────────

/** Zellen, deren Entfernung den Schwarm zerreißt (nur für Stapel der Höhe 1 relevant). */
export function pinnedCells(g: G): Set<number> {
  const ks = [...g.cells.keys()];
  const out = new Set<number>();
  if (ks.length < 3) return out;
  const disc = new Map<number, number>(), low = new Map<number, number>();
  let t = 0;
  const dfs = (u: number, parent: number) => {
    disc.set(u, ++t); low.set(u, t);
    let children = 0;
    for (const v of neighbors(u)) {
      if (!g.cells.has(v)) continue;
      if (!disc.has(v)) {
        children++;
        dfs(v, u);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (parent !== -1 && low.get(v)! >= disc.get(u)!) out.add(u);
      } else if (v !== parent) low.set(u, Math.min(low.get(u)!, disc.get(v)!));
    }
    if (parent === -1 && children > 1) out.add(u);
  };
  dfs(ks[0], -1);
  return out;
}

/** Darf ein Plättchen von a nach b (Nachbarfelder) gleiten/steigen? Höhen ohne das ziehende Plättchen. */
const DMAP = new Map<number, number>(DIRS.map((d, i) => [d[0] * 128 + d[1], i]));
function passable(g: G, a: number, b: number): boolean {
  const d = DMAP.get(b - a);
  if (d === undefined) return false;
  const c1 = height(g, nbr(a, (d + 5) % 6)), c2 = height(g, nbr(a, (d + 1) % 6));
  const ha = height(g, a), hb = height(g, b);
  const thr = Math.max(ha, hb);
  if (c1 > thr && c2 > thr) return false;
  if (ha === 0 && hb === 0) return (c1 > 0) !== (c2 > 0); // Bodenkontakt: genau ein Nachbar
  return true;
}

function slideTargets(g: G, from: number): number[] {
  const out: number[] = [];
  for (const b of neighbors(from)) if (height(g, b) === 0 && passable(g, from, b)) out.push(b);
  return out;
}

function movesOfKind(g: G, kind: Kind, from: number, onStack: boolean): number[] {
  // Das ziehende Plättchen ist schon von `from` entfernt.
  if (kind === 'Q') return slideTargets(g, from);
  if (kind === 'B' || onStack) {
    const out: number[] = [];
    for (const b of neighbors(from)) if (passable(g, from, b)) out.push(b);
    return out;
  }
  if (kind === 'S') {
    const res = new Set<number>();
    const walk = (cur: number, depth: number, seen: Set<number>) => {
      if (depth === 3) { res.add(cur); return; }
      for (const b of slideTargets(g, cur)) if (!seen.has(b)) { seen.add(b); walk(b, depth + 1, seen); seen.delete(b); }
    };
    walk(from, 0, new Set([from]));
    return [...res];
  }
  if (kind === 'A') {
    const seen = new Set<number>([from]);
    const q = [from];
    for (let i = 0; i < q.length; i++) for (const b of slideTargets(g, q[i])) if (!seen.has(b)) { seen.add(b); q.push(b); }
    return q.slice(1);
  }
  if (kind === 'G') {
    const out: number[] = [];
    for (let d = 0; d < 6; d++) {
      let k = nbr(from, d);
      if (height(g, k) === 0) continue;
      while (height(g, k) > 0) k = nbr(k, d);
      out.push(k);
    }
    return out;
  }
  if (kind === 'L') {
    // drei Schritte: hinauf, oben entlang, hinunter
    const res = new Set<number>();
    for (const a of neighbors(from)) {
      if (height(g, a) === 0 || !passable(g, from, a)) continue;
      for (const b of neighbors(a)) {
        if (b === from || height(g, b) === 0 || !passable(g, a, b)) continue;
        for (const c of neighbors(b)) {
          if (height(g, c) === 0 && c !== from && passable(g, b, c)) res.add(c);
        }
      }
    }
    return [...res];
  }
  return [];
}

/** Zielfelder des obersten Plättchens auf `from`. */
export function pieceTargets(g: G, from: number, pinned = pinnedCells(g)): number[] {
  const st = g.cells.get(from);
  if (!st) return [];
  const p = st[st.length - 1];
  if (st.length === 1 && pinned.has(from)) return [];
  st.pop();
  if (!st.length) g.cells.delete(from);
  let out: number[] = [];
  const onStack = st.length > 0;
  if (p.kind === 'M') {
    if (onStack) out = movesOfKind(g, 'B', from, true);
    else {
      const kinds = new Set<Kind>();
      for (const n of neighbors(from)) { const t = top(g, n); if (t && t.kind !== 'M') kinds.add(t.kind); }
      const s = new Set<number>();
      for (const k of kinds) for (const x of movesOfKind(g, k, from, false)) s.add(x);
      out = [...s];
    }
  } else out = movesOfKind(g, p.kind, from, onStack);
  if (!g.cells.has(from)) g.cells.set(from, st);
  st.push(p);
  return out;
}

export function placements(g: G, c: Color): number[] {
  if (g.ply === 0) return [key(0, 0)];
  if (g.ply === 1) { const first = [...g.cells.keys()][0]; return neighbors(first); }
  const out = new Set<number>();
  g.cells.forEach((st, k) => {
    if (st[st.length - 1].color !== c) return;
    for (const n of neighbors(k)) if (!g.cells.has(n)) out.add(n);
  });
  return [...out].filter((k) => neighbors(k).every((n) => { const t = top(g, n); return !t || t.color === c; }));
}

export function legalMoves(g: G): Move[] {
  const c = g.turn, out: Move[] = [];
  const hand = g.hand[c];
  const mustQueen = g.turns[c] >= 3 && hand.Q > 0;
  const cells = placements(g, c);
  for (const kind of KINDS) {
    if (hand[kind] <= 0) continue;
    if (mustQueen && kind !== 'Q') continue;
    for (const to of cells) out.push({ t: 'p', kind, to });
  }
  if (hand.Q === 0 && g.ply >= 2) {
    const pinned = pinnedCells(g);
    for (const [from, st] of [...g.cells.entries()]) {
      const p = st[st.length - 1];
      if (p.color !== c) continue;
      for (const to of pieceTargets(g, from, pinned)) out.push({ t: 'm', from, to });
    }
  }
  if (!out.length) out.push({ t: 'x' });
  return out;
}

export interface Undo { m: Move; p?: Piece; turn: Color; turns: [number, number]; queen: [number, number] }

export function apply(g: G, m: Move): Undo {
  const c = g.turn;
  const u: Undo = { m, turn: c, turns: [g.turns[0], g.turns[1]], queen: [g.queen[0], g.queen[1]] };
  if (m.t === 'p') {
    const p: Piece = { id: pid(g, c, m.kind), color: c, kind: m.kind };
    g.hand[c][m.kind]--;
    g.cells.set(m.to, [...(g.cells.get(m.to) ?? []), p]);
    if (m.kind === 'Q') g.queen[c] = m.to;
    u.p = p;
  } else if (m.t === 'm') {
    const st = g.cells.get(m.from)!;
    const p = st.pop()!;
    if (!st.length) g.cells.delete(m.from);
    const dst = g.cells.get(m.to);
    if (dst) dst.push(p); else g.cells.set(m.to, [p]);
    if (p.kind === 'Q') g.queen[c] = m.to;
    u.p = p;
  }
  if (m.t !== 'x') g.turns[c]++;
  g.turn = (1 - c) as Color;
  g.ply++;
  return u;
}

export function undo(g: G, u: Undo) {
  const m = u.m;
  if (m.t === 'p') {
    const st = g.cells.get(m.to)!;
    st.pop();
    if (!st.length) g.cells.delete(m.to);
    g.hand[u.turn][m.kind]++;
  } else if (m.t === 'm') {
    const st = g.cells.get(m.to)!;
    const p = st.pop()!;
    if (!st.length) g.cells.delete(m.to);
    const src = g.cells.get(m.from);
    if (src) src.push(p); else g.cells.set(m.from, [p]);
  }
  g.turn = u.turn;
  g.turns = u.turns;
  g.queen = u.queen;
  g.ply--;
}

/** Wie viele Nachbarfelder der Königin sind besetzt? (−1: Königin nicht im Spiel) */
export function queenSurround(g: G, c: Color): number {
  const k = g.queen[c];
  if (k < 0) return -1;
  let n = 0;
  for (const x of neighbors(k)) if (g.cells.has(x)) n++;
  return n;
}

export type Result = { winner: Color | 'draw'; why: string } | null;
export function result(g: G): Result {
  const a = queenSurround(g, 0) === 6, b = queenSurround(g, 1) === 6;
  if (a && b) return { winner: 'draw', why: 'Beide Königinnen sind zugleich eingeschlossen.' };
  if (a) return { winner: 1, why: 'Die weiße Königin ist eingeschlossen.' };
  if (b) return { winner: 0, why: 'Die schwarze Königin ist eingeschlossen.' };
  if (g.ply >= 300) return { winner: 'draw', why: 'Zuglimit erreicht – Remis.' };
  return null;
}

export const COLOR_NAME = ['Honig', 'Nacht'] as const;

export function posKey(g: G): string {
  const parts: string[] = [];
  g.cells.forEach((st, k) => parts.push(k + ':' + st.map((p) => p.color + p.kind).join('')));
  parts.sort();
  return parts.join('|') + '#' + g.turn + g.hand[0].Q + g.hand[1].Q + '#' + Math.min(3, g.turns[0]) + Math.min(3, g.turns[1]);
}

// ───────── Bewertung ─────────

const WIN = 100000;

function freeNeighbors(g: G, k: number): number {
  let n = 0;
  for (const x of neighbors(k)) if (!g.cells.has(x)) n++;
  return n;
}

/** Bewertung aus Sicht von `me`. */
export function evaluate(g: G, me: Color): number {
  const r = result(g);
  if (r) return r.winner === 'draw' ? 0 : r.winner === me ? WIN - g.ply : -WIN + g.ply;
  const op = (1 - me) as Color;
  let s = 0;
  const qs = queenSurround(g, me), qo = queenSurround(g, op);
  if (qo >= 0) s += qo * qo * 28; else s -= 8;
  if (qs >= 0) s -= qs * qs * 34; else s += 4;
  // Figuren am Spiel und Beweglichkeit
  const pinned = pinnedCells(g);
  let mine = 0, theirs = 0;
  g.cells.forEach((st, k) => {
    const p = st[st.length - 1];
    const own = p.color === me;
    let v = 0;
    const covered = st.length > 1 ? 0 : 1;
    const free = covered && !pinned.has(k) ? 1 : 0;
    const w = p.kind === 'A' ? 28 : p.kind === 'G' ? 14 : p.kind === 'B' ? 20 : p.kind === 'S' ? 10 : p.kind === 'L' ? 18 : p.kind === 'M' ? 16 : 6;
    v = free * w;
    // Nähe zur gegnerischen Königin
    const qk = g.queen[own ? op : me];
    if (qk >= 0 && p.kind !== 'Q') for (const n of neighbors(qk)) if (n === k) v += own ? 26 : 22;
    // Käfer auf fremden Plättchen
    if (st.length > 1 && p.kind === 'B') v += 16;
    if (own) mine += v; else theirs += v;
  });
  s += mine - theirs;
  // Freiheit der eigenen Königin
  if (g.queen[me] >= 0) s += freeNeighbors(g, g.queen[me]) * 6;
  if (g.queen[op] >= 0) s -= freeNeighbors(g, g.queen[op]) * 6;
  // Handstärke: Figuren in der Hand sind noch nicht im Spiel, aber auch nicht blockiert
  let hm = 0, ho = 0;
  for (const k of KINDS) { hm += g.hand[me][k]; ho += g.hand[op][k]; }
  s += (ho - hm) * 2;
  return s;
}

// ───────── Suche ─────────

interface Bud { until: number; nodes: number; stop: boolean }

function ordered(g: G): Move[] {
  const ms = legalMoves(g);
  if (ms.length < 2) return ms;
  const oq = g.queen[1 - g.turn];
  const near = new Set<number>(oq >= 0 ? neighbors(oq) : []);
  const sc = (m: Move) => {
    if (m.t === 'x') return 0;
    let v = 0;
    if (near.has(m.to)) v += 40;
    if (m.t === 'm') {
      const q = g.cells.get(m.from);
      if (q && near.has(m.from)) v -= 15;
      v += m.t === 'm' && top(g, m.from)?.kind === 'A' ? 4 : 0;
    } else v += m.kind === 'Q' ? 3 : m.kind === 'A' ? 8 : m.kind === 'B' ? 6 : 0;
    return v;
  };
  return ms.map((m) => ({ m, k: sc(m) })).sort((a, b) => b.k - a.k).map((x) => x.m);
}

function nega(g: G, depth: number, alpha: number, beta: number, bud: Bud, me: Color): number {
  const sign = g.turn === me ? 1 : -1;
  const r = result(g);
  if (r || depth === 0) return sign * evaluate(g, me);
  if ((++bud.nodes & 127) === 0 && performance.now() > bud.until) bud.stop = true;
  if (bud.stop) return sign * evaluate(g, me);
  let best = -Infinity;
  for (const m of ordered(g)) {
    const u = apply(g, m);
    const v = -nega(g, depth - 1, -beta, -alpha, bud, me);
    undo(g, u);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta || bud.stop) break;
  }
  return best;
}

export interface Level { id: number; name: string; info: string; depth: number; ms: number; noise: number }
export const LEVELS: Level[] = [
  { id: 1, name: 'Larve', info: 'Zieht ziemlich zufällig.', depth: 0, ms: 0, noise: 1 },
  { id: 2, name: 'Arbeiterin', info: 'Schaut einen Zug voraus.', depth: 1, ms: 300, noise: 0.3 },
  { id: 3, name: 'Wächterin', info: 'Rechnet zwei Halbzüge.', depth: 2, ms: 900, noise: 0.06 },
  { id: 4, name: 'Schwarmführerin', info: 'Drei Halbzüge, wenn die Zeit reicht.', depth: 3, ms: 1800, noise: 0 },
  { id: 5, name: 'Königin', info: 'Vertieft bis zu vier Halbzüge.', depth: 4, ms: 3500, noise: 0 },
];

export interface Scored { m: Move; score: number }

export function scoreRoot(g0: G, depth: number, ms: number): Scored[] {
  const g = cloneGame(g0);
  const me = g.turn;
  const bud: Bud = { until: performance.now() + ms, nodes: 0, stop: false };
  let res: Scored[] = [];
  let roots = ordered(g);
  for (let d = 1; d <= depth; d++) {
    const cur: Scored[] = [];
    let alpha = -Infinity;
    let complete = true;
    for (const m of roots) {
      const u = apply(g, m);
      const v = -nega(g, d - 1, -Infinity, -alpha, bud, me);
      undo(g, u);
      if (bud.stop) { complete = false; break; }
      cur.push({ m, score: v });
      if (v > alpha) alpha = v;
    }
    if (!complete) { if (!res.length) res = cur.sort((a, b) => b.score - a.score); break; }
    res = cur.sort((a, b) => b.score - a.score);
    roots = res.map((x) => x.m);
    if (Math.abs(res[0].score) > WIN / 2) break;
  }
  return res;
}

export const sameMove = (a: Move, b: Move) => a.t === b.t && (a.t === 'x' || (b.t !== 'x' && a.to === b.to && (a.t === 'p' ? a.kind === (b as { kind: Kind }).kind : a.from === (b as { from: number }).from)));

export function aiMove(g: G, level: number, rnd: Rng = Math.random, seen?: ReadonlySet<string>): Move {
  const L = LEVELS[Math.max(0, Math.min(4, level - 1))];
  const ms = legalMoves(g);
  if (ms.length === 1) return ms[0];
  // Sofortgewinn
  for (const m of ms) { const u = apply(g, m); const r = result(g); undo(g, u); if (r && r.winner === g.turn) return m; }
  if (L.depth === 0) {
    // zufällig, aber gern neben der gegnerischen Königin
    const oq = g.queen[1 - g.turn];
    const near = new Set(oq >= 0 ? neighbors(oq) : []);
    const good = ms.filter((m) => m.t !== 'x' && near.has(m.to));
    if (good.length && rnd() < 0.5) return good[Math.floor(rnd() * good.length)];
    return ms[Math.floor(rnd() * ms.length)];
  }
  let sc = scoreRoot(g, L.depth, L.ms);
  if (!sc.length) return ms[0];
  if (seen) {
    const fresh = sc.filter((x) => { const u = apply(g, x.m); const dup = seen.has(posKey(g)); undo(g, u); return !dup; });
    if (fresh.length) sc = fresh;
  }
  if (L.noise > 0 && rnd() < L.noise && sc.length > 1) {
    const topN = sc.slice(0, Math.min(4, sc.length));
    return topN[1 + Math.floor(rnd() * (topN.length - 1))].m;
  }
  return sc[0].m;
}

// ───────── Coach ─────────
export type Grade = 'best' | 'good' | 'inacc' | 'mistake' | 'blunder';
export const GRADE_TXT: Record<Grade, string> = { best: 'Bester Zug', good: 'Gut', inacc: 'Ungenau', mistake: 'Fehler', blunder: 'Patzer' };

export function gradeMove(before: G, played: Move, depth = 2, ms = 1200): { grade: Grade; loss: number; best: Move } {
  const sc = scoreRoot(before, depth, ms);
  if (!sc.length) return { grade: 'best', loss: 0, best: played };
  const mine = sc.find((x) => sameMove(x.m, played));
  const loss = mine ? Math.max(0, sc[0].score - mine.score) : 300;
  const grade: Grade = loss < 12 ? 'best' : loss < 45 ? 'good' : loss < 110 ? 'inacc' : loss < 400 ? 'mistake' : 'blunder';
  return { grade, loss, best: sc[0].m };
}

// ───────── Aufgaben ─────────

export function playOut(set: SetDef, levels: [number, number], rnd: Rng, maxPlies = 200): { winner: Color | 'draw' | null; plies: number } {
  const g = newGame(set);
  const seen = new Set<string>([posKey(g)]);
  while (g.ply < maxPlies) {
    const r = result(g);
    if (r) return { winner: r.winner, plies: g.ply };
    const m = aiMove(g, levels[g.turn], rnd, seen);
    apply(g, m);
    seen.add(posKey(g));
  }
  return { winner: 'draw', plies: g.ply };
}

/** Zufallsstellung durch zufällige legale Züge (nachspielbar aus dem Startwert). */
export function randomGame(set: SetDef, rnd: Rng, plies: number): G {
  const g = newGame(set);
  for (let i = 0; i < plies; i++) {
    if (result(g)) break;
    const ms = legalMoves(g);
    const prefQ = ms.filter((m) => m.t === 'p' && m.kind === 'Q');
    const m = prefQ.length && g.turns[g.turn] >= 1 && rnd() < 0.6 ? prefQ[0] : ms[Math.floor(rnd() * ms.length)];
    apply(g, m);
  }
  return g;
}

/** Züge, mit denen die Seite am Zug nach höchstens `own` eigenen Zügen sicher gewinnt (Königin einschließen). */
export function winningMoves(g0: G, own: number): Move[] {
  const g = cloneGame(g0);
  const me = g.turn;
  const status = (): 1 | -1 | 0 => { const r = result(g); if (!r || r.winner === 'draw') return 0; return r.winner === me ? 1 : -1; };
  const solve = (left: number): boolean => {
    for (const m of ordered(g)) {
      const u = apply(g, m);
      const s = status();
      let ok = false;
      if (s === 1) ok = true;
      else if (s === 0 && left > 1) ok = allReplies(left - 1);
      undo(g, u);
      if (ok) return true;
    }
    return false;
  };
  const allReplies = (left: number): boolean => {
    for (const r of ordered(g)) {
      const u = apply(g, r);
      const s = status();
      let good: boolean;
      if (s === -1) good = false; else if (s === 1) good = true; else good = solve(left);
      undo(g, u);
      if (!good) return false;
    }
    return true;
  };
  const out: Move[] = [];
  for (const m of legalMoves(g)) {
    const u = apply(g, m);
    const s = status();
    let ok = false;
    if (s === 1) ok = true;
    else if (s === 0 && own > 1) ok = allReplies(own - 1);
    undo(g, u);
    if (ok) out.push(m);
  }
  return out;
}

export interface Puzzle { g: G; own: number; solutions: Move[]; title: string }

/** Aufgabe aus einer KI-Partie: die Stellung kurz vor dem Gewinn des Siegers. */
export function makePuzzle(set: SetDef, rnd: Rng, own = 1, tries = 12): Puzzle | null {
  for (let t = 0; t < tries; t++) {
    const g = newGame(set);
    const moves: Move[] = [];
    const lv: [number, number] = [2, 2];
    while (g.ply < 140 && !result(g)) {
      const m = aiMove(g, lv[g.turn], rnd);
      moves.push(m);
      apply(g, m);
    }
    const r = result(g);
    if (!r || r.winner === 'draw') continue;
    const idx = moves.length - (own === 1 ? 1 : 3);
    if (idx < 2) continue;
    const start = newGame(set);
    for (let i = 0; i < idx; i++) apply(start, moves[i]);
    if (start.turn !== r.winner) continue;
    if (own === 2 && winningMoves(start, 1).length) continue;
    const sol = winningMoves(start, own);
    if (sol.length && sol.length <= 3 && sol.every((m) => m.t !== 'x')) {
      return { g: start, own, solutions: sol, title: own === 1 ? 'Schließe die gegnerische Königin mit einem Zug ein!' : 'Gewinne in zwei Zügen – der Gegner wehrt sich.' };
    }
  }
  return null;
}

/** Stellung aus Plättchen bauen (Reihenfolge = Stapel von unten nach oben); beide Seiten haben ihre Königin-Frist hinter sich. */
export function buildGame(set: SetDef, turn: Color, pieces: [number, number, Color, Kind][], turns = 6): G {
  const g = newGame(set);
  const used: [Hand, Hand] = [H(0, 0, 0, 0, 0), H(0, 0, 0, 0, 0)];
  for (const [q, r, c, kind] of pieces) {
    const k = key(q, r);
    const p: Piece = { id: c * 1000 + KINDS.indexOf(kind) * 10 + used[c][kind], color: c, kind };
    used[c][kind]++;
    g.cells.set(k, [...(g.cells.get(k) ?? []), p]);
    if (kind === 'Q') g.queen[c] = k;
  }
  for (const c of [0, 1] as const) for (const kd of KINDS) g.hand[c][kd] = Math.max(0, set.counts[kd] - used[c][kd]);
  g.turn = turn;
  g.turns = [turns, turns];
  g.ply = 10;
  return g;
}
