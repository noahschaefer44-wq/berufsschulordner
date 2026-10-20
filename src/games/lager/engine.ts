// Lagerhaus (Sokoban): Spielfeld, Züge, Löser (Schiebe-Suche), Sackgassen und Level-Erzeugung durch rückwärts Ziehen.
import { type Rng, rngFrom, shuffled } from '../shared/rng';

export interface Level {
  w: number;
  h: number;
  /** 1 = Wand */
  walls: Uint8Array;
  /** 1 = Zielfeld */
  goals: Uint8Array;
  boxes: number[];
  player: number;
  name?: string;
}
export interface State { player: number; boxes: number[] }

export type Dir = 'u' | 'd' | 'l' | 'r';
export const DIRS: Dir[] = ['u', 'd', 'l', 'r'];
export const delta = (d: Dir, w: number) => (d === 'u' ? -w : d === 'd' ? w : d === 'l' ? -1 : 1);
const dx = (d: Dir) => (d === 'l' ? -1 : d === 'r' ? 1 : 0);
const dy = (d: Dir) => (d === 'u' ? -1 : d === 'd' ? 1 : 0);

export const cloneState = (s: State): State => ({ player: s.player, boxes: s.boxes.slice() });

/** Nachbarzelle in Richtung d (−1 außerhalb). */
export function step(level: Level, i: number, d: Dir): number {
  const x = (i % level.w) + dx(d), y = Math.floor(i / level.w) + dy(d);
  return x < 0 || y < 0 || x >= level.w || y >= level.h ? -1 : y * level.w + x;
}

// ───────── XSB-Format ─────────

/** Standardformat: # Wand, @ Spieler, + Spieler auf Ziel, $ Kiste, * Kiste auf Ziel, . Ziel, Leerzeichen/Minus = Boden. */
export function parseXsb(text: string, name?: string): Level | null {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => /[#@$*+.]/.test(l) || l.trim() === '' ? true : false);
  const rows = lines.map((l) => l.replace(/\s+$/, '')).filter((l, i, a) => l.length > 0 || (i > 0 && i < a.length - 1));
  // führende/nachfolgende leere Zeilen entfernen
  while (rows.length && rows[0] === '') rows.shift();
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  if (rows.length < 3) return null;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  if (w < 3 || w > 40 || h > 40) return null;
  const walls = new Uint8Array(w * h), goals = new Uint8Array(w * h);
  const boxes: number[] = [];
  let player = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x] ?? ' ';
    const i = y * w + x;
    if (c === '#') walls[i] = 1;
    else if (c === '.') goals[i] = 1;
    else if (c === '$') boxes.push(i);
    else if (c === '*') { boxes.push(i); goals[i] = 1; }
    else if (c === '@') { if (player >= 0) return null; player = i; }
    else if (c === '+') { if (player >= 0) return null; player = i; goals[i] = 1; }
    else if (c !== ' ' && c !== '-' && c !== '_') return null;
  }
  if (player < 0 || !boxes.length) return null;
  const gc = goals.reduce((a, b) => a + b, 0);
  if (gc !== boxes.length) return null;
  return { w, h, walls, goals, boxes, player, name };
}
export function toXsb(l: Level, s?: State): string {
  const st = s ?? { player: l.player, boxes: l.boxes };
  const bx = new Set(st.boxes);
  const out: string[] = [];
  for (let y = 0; y < l.h; y++) {
    let row = '';
    for (let x = 0; x < l.w; x++) {
      const i = y * l.w + x;
      const g = l.goals[i] === 1;
      if (l.walls[i]) row += '#';
      else if (i === st.player) row += g ? '+' : '@';
      else if (bx.has(i)) row += g ? '*' : '$';
      else row += g ? '.' : ' ';
    }
    out.push(row.replace(/\s+$/, ''));
  }
  return out.join('\n');
}

// ───────── Spielregeln ─────────

export const isSolved = (l: Level, s: State) => s.boxes.every((b) => l.goals[b] === 1);

export interface MoveResult { state: State; push: boolean; pull: boolean }
/** Ein Schritt. `pull`: Kiste hinter dem Spieler mitziehen (Zieher-Modus). */
export function tryMove(l: Level, s: State, d: Dir, pull = false): MoveResult | null {
  const to = step(l, s.player, d);
  if (to < 0 || l.walls[to]) return null;
  const bi = s.boxes.indexOf(to);
  if (bi >= 0) {
    const beyond = step(l, to, d);
    if (beyond < 0 || l.walls[beyond] || s.boxes.includes(beyond)) return null;
    const boxes = s.boxes.slice(); boxes[bi] = beyond;
    return { state: { player: to, boxes }, push: true, pull: false };
  }
  if (pull) {
    const opp: Dir = d === 'u' ? 'd' : d === 'd' ? 'u' : d === 'l' ? 'r' : 'l';
    const behind = step(l, s.player, opp);
    const bj = behind >= 0 ? s.boxes.indexOf(behind) : -1;
    if (bj >= 0) { const boxes = s.boxes.slice(); boxes[bj] = s.player; return { state: { player: to, boxes }, push: false, pull: true }; }
  }
  return { state: { player: to, boxes: s.boxes }, push: false, pull: false };
}

/** Für den Spieler erreichbare Felder (Kisten blockieren). */
export function reachableFrom(l: Level, start: number, boxes: ReadonlySet<number> | readonly number[]): Uint8Array {
  const bx = boxes instanceof Set ? boxes : new Set(boxes);
  const seen = new Uint8Array(l.w * l.h);
  const q = [start];
  seen[start] = 1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    for (const d of DIRS) {
      const n = step(l, c, d);
      if (n >= 0 && !seen[n] && !l.walls[n] && !bx.has(n)) { seen[n] = 1; q.push(n); }
    }
  }
  return seen;
}

/** Kürzester Weg des Spielers zu einem Feld (als Richtungen) oder null. */
export function walkPath(l: Level, s: State, target: number): Dir[] | null {
  if (target === s.player) return [];
  const bx = new Set(s.boxes);
  if (l.walls[target] || bx.has(target)) return null;
  const prev = new Int32Array(l.w * l.h).fill(-2);
  const how: Dir[] = new Array(l.w * l.h);
  const q = [s.player];
  prev[s.player] = -1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    if (c === target) break;
    for (const d of DIRS) {
      const n = step(l, c, d);
      if (n >= 0 && prev[n] === -2 && !l.walls[n] && !bx.has(n)) { prev[n] = c; how[n] = d; q.push(n); }
    }
  }
  if (prev[target] === -2) return null;
  const out: Dir[] = [];
  for (let c = target; c !== s.player; c = prev[c]) out.push(how[c]);
  return out.reverse();
}

// ───────── Sackgassen ─────────

/** Felder, von denen aus eine Kiste nie ein Ziel erreichen kann (einfache Sackgassen). */
export function deadSquares(l: Level): Uint8Array {
  const alive = new Uint8Array(l.w * l.h);
  const q: number[] = [];
  for (let i = 0; i < alive.length; i++) if (l.goals[i] && !l.walls[i]) { alive[i] = 1; q.push(i); }
  // rückwärts ziehen: Kiste von c nach c-d möglich, wenn c+d… (Spieler steht auf der Gegenseite)
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    for (const d of DIRS) {
      const from = step(l, c, d); // Kiste stand hier, wurde in Richtung opp(d) auf c geschoben
      const opp: Dir = d === 'u' ? 'd' : d === 'd' ? 'u' : d === 'l' ? 'r' : 'l';
      const player = step(l, from, d);
      void opp;
      if (from >= 0 && !l.walls[from] && player >= 0 && !l.walls[player] && !alive[from]) { alive[from] = 1; q.push(from); }
    }
  }
  const dead = new Uint8Array(l.w * l.h);
  for (let i = 0; i < dead.length; i++) if (!l.walls[i] && !alive[i]) dead[i] = 1;
  return dead;
}

/** Kisten, die auf einem Sackgassen-Feld stehen (nicht auf einem Ziel) – sie lassen sich nie mehr ins Ziel bringen. */
export function deadBoxes(l: Level, s: State, dead = deadSquares(l)): number[] {
  return s.boxes.filter((b) => dead[b] && !l.goals[b]);
}

// ───────── Löser ─────────

export interface Solution { moves: string; pushes: number; steps: number }

/** Sucht eine kürzeste Lösung in Schiebezügen (Breitensuche mit Sackgassen-Filter). null = keine gefunden (oder Limit). */
export function solve(l: Level, start?: State, opts: { maxNodes?: number; maxMs?: number } = {}): Solution | null {
  const s0 = start ?? { player: l.player, boxes: l.boxes };
  const maxNodes = opts.maxNodes ?? 250000, deadline = Date.now() + (opts.maxMs ?? 4000);
  const dead = deadSquares(l);
  const size = l.w * l.h;
  if (isSolved(l, s0)) return { moves: '', pushes: 0, steps: 0 };
  const norm = (player: number, boxes: number[]) => {
    const reach = reachableFrom(l, player, boxes);
    let m = 0;
    while (!reach[m]) m++;
    return { reach, key: m + '|' + boxes.join(',') };
  };
  interface Node { boxes: number[]; player: number; parent: number; box: number; dir: Dir }
  const nodes: Node[] = [];
  const seen = new Set<string>();
  const first = norm(s0.player, [...s0.boxes].sort((a, b) => a - b));
  seen.add(first.key);
  nodes.push({ boxes: [...s0.boxes].sort((a, b) => a - b), player: s0.player, parent: -1, box: -1, dir: 'u' });
  for (let qi = 0; qi < nodes.length; qi++) {
    if (nodes.length > maxNodes || Date.now() > deadline) return null;
    const n = nodes[qi];
    const reach = reachableFrom(l, n.player, n.boxes);
    const bset = new Set(n.boxes);
    for (let bi = 0; bi < n.boxes.length; bi++) {
      const b = n.boxes[bi];
      for (const d of DIRS) {
        const opp: Dir = d === 'u' ? 'd' : d === 'd' ? 'u' : d === 'l' ? 'r' : 'l';
        const behind = step(l, b, opp), to = step(l, b, d);
        if (behind < 0 || to < 0 || !reach[behind] || l.walls[to] || bset.has(to) || dead[to]) continue;
        const nb = n.boxes.slice(); nb[bi] = to; nb.sort((a, c) => a - c);
        const r = norm(b, nb);
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        nodes.push({ boxes: nb, player: b, parent: qi, box: b, dir: d });
        if (nb.every((x) => l.goals[x])) {
          // Lösung zusammensetzen
          const pushes: { box: number; dir: Dir }[] = [];
          for (let k = nodes.length - 1; k > 0; k = nodes[k].parent) pushes.push({ box: nodes[k].box, dir: nodes[k].dir });
          pushes.reverse();
          let st = cloneState(s0);
          let moves = '';
          for (const p of pushes) {
            const opp: Dir = p.dir === 'u' ? 'd' : p.dir === 'd' ? 'u' : p.dir === 'l' ? 'r' : 'l';
            const path = walkPath(l, st, step(l, p.box, opp)) ?? [];
            for (const d2 of path) { moves += d2; st = tryMove(l, st, d2)!.state; }
            moves += p.dir.toUpperCase(); st = tryMove(l, st, p.dir)!.state;
          }
          return { moves, pushes: pushes.length, steps: moves.length };
        }
      }
    }
    void size;
  }
  return null;
}

/** Schiebeplan für genau eine Kiste auf ein Zielfeld (Klick-und-Ziel): Züge des Spielers oder null. */
export function planBoxMove(l: Level, s: State, box: number, target: number): Dir[] | null {
  if (box === target || l.walls[target] || s.boxes.includes(target)) return null;
  const others = s.boxes.filter((b) => b !== box);
  const oset = new Set(others);
  interface N { b: number; p: number; parent: number; push: Dir | null }
  const nodes: N[] = [{ b: box, p: s.player, parent: -1, push: null }];
  const seen = new Set<string>();
  const keyOf = (b: number, p: number) => {
    const reach = reachableFrom(l, p, [...others, b]);
    let m = 0; while (!reach[m]) m++;
    return `${b}|${m}`;
  };
  seen.add(keyOf(box, s.player));
  for (let qi = 0; qi < nodes.length; qi++) {
    const n = nodes[qi];
    if (n.b === target) {
      const pushes: Dir[] = [];
      for (let k = qi; nodes[k].parent >= 0; k = nodes[k].parent) pushes.push(nodes[k].push!);
      pushes.reverse();
      let st = cloneState(s);
      const moves: Dir[] = [];
      for (const d of pushes) {
        const opp: Dir = d === 'u' ? 'd' : d === 'd' ? 'u' : d === 'l' ? 'r' : 'l';
        const bpos = st.boxes.find((x) => !oset.has(x))!;
        const path = walkPath(l, st, step(l, bpos, opp));
        if (!path) return null;
        for (const m of path) { moves.push(m); st = tryMove(l, st, m)!.state; }
        moves.push(d); st = tryMove(l, st, d)!.state;
      }
      return moves;
    }
    const reach = reachableFrom(l, n.p, [...others, n.b]);
    for (const d of DIRS) {
      const opp: Dir = d === 'u' ? 'd' : d === 'd' ? 'u' : d === 'l' ? 'r' : 'l';
      const behind = step(l, n.b, opp), to = step(l, n.b, d);
      if (behind < 0 || to < 0 || !reach[behind] || l.walls[to] || oset.has(to)) continue;
      const k = keyOf(to, n.b);
      if (seen.has(k)) continue;
      seen.add(k);
      nodes.push({ b: to, p: n.b, parent: qi, push: d });
    }
    if (nodes.length > 6000) return null;
  }
  return null;
}

// ───────── Erzeugung ─────────

export interface GenParams { w: number; h: number; boxes: number; pulls: number; walls: number; minPushes: number }

export function generateLevel(seed: number | string, p: GenParams, budgetMs = 2500): Level & { par: number } {
  const rng = rngFrom(seed);
  const t0 = Date.now();
  let best: (Level & { par: number }) | null = null;
  for (let attempt = 0; ; attempt++) {
    const lvl = tryGenerate(rng, p);
    if (lvl) {
      const sol = solve(lvl, undefined, { maxNodes: 120000, maxMs: 1500 });
      if (sol && sol.pushes >= p.minPushes) return { ...lvl, par: sol.pushes };
      if (sol && (!best || sol.pushes > best.par)) best = { ...lvl, par: sol.pushes };
    }
    if (Date.now() - t0 > budgetMs && best) break;
    if (Date.now() - t0 > budgetMs * 3) break;
  }
  return best ?? { ...simpleLevel(), par: 1 };
}

function simpleLevel(): Level {
  return parseXsb('#####\n#@$.#\n#####')!;
}

function tryGenerate(rng: Rng, p: GenParams): Level | null {
  const { w, h } = p;
  const walls = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { walls[x] = 1; walls[(h - 1) * w + x] = 1; }
  for (let y = 0; y < h; y++) { walls[y * w] = 1; walls[y * w + w - 1] = 1; }
  const inner: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) inner.push(y * w + x);
  const blocks = Math.round(inner.length * p.walls);
  for (const c of shuffled(rng, inner).slice(0, blocks)) walls[c] = 1;
  const floor = inner.filter((c) => !walls[c]);
  if (floor.length < p.boxes * 4 + 4) return null;
  const probe: Level = { w, h, walls, goals: new Uint8Array(w * h), boxes: [], player: floor[0] };
  const comp = reachableFrom(probe, floor[0], []);
  const cells = floor.filter((c) => comp[c]);
  if (cells.length < p.boxes * 4 + 4) return null;
  const order = shuffled(rng, cells);
  const goalCells = order.slice(0, p.boxes);
  const goals = new Uint8Array(w * h);
  goalCells.forEach((g) => { goals[g] = 1; });
  let boxes = goalCells.slice();
  let player = order[p.boxes];
  const lvl: Level = { w, h, walls, goals, boxes, player };
  // rückwärts ziehen
  for (let k = 0; k < p.pulls; k++) {
    const reach = reachableFrom(lvl, player, boxes);
    const cand: { bi: number; d: Dir; Q: number; P: number }[] = [];
    boxes.forEach((b, bi) => {
      for (const d of DIRS) {
        const P = step(lvl, b, d);        // Spieler steht neben der Kiste
        const Q = P >= 0 ? step(lvl, P, d) : -1; // und geht von der Kiste weg
        if (P < 0 || Q < 0 || !reach[P] || walls[Q] || boxes.includes(Q)) continue;
        cand.push({ bi, d, Q, P });
      }
    });
    if (!cand.length) break;
    // Bevorzuge Züge, die Kisten von Zielen entfernen
    cand.sort((a, c) => (goals[boxes[a.bi]] ? 0 : 1) - (goals[boxes[c.bi]] ? 0 : 1));
    const pickIdx = Math.floor(rng() * Math.min(cand.length, Math.max(2, Math.ceil(cand.length * 0.6))));
    const c = cand[rng() < 0.5 ? pickIdx : Math.floor(rng() * cand.length)];
    const nb = boxes.slice();
    // Kiste wird auf das Feld des Spielers gezogen, Spieler geht einen Schritt weiter
    nb[c.bi] = c.P;
    boxes = nb; player = c.Q;
    lvl.boxes = boxes; lvl.player = player;
  }
  if (boxes.every((b) => goals[b])) return null;
  // Spielerstart: beliebiges erreichbares Feld
  const reach = reachableFrom(lvl, player, boxes);
  const free = cells.filter((c) => reach[c] && !boxes.includes(c));
  lvl.player = free[Math.floor(rng() * free.length)] ?? player;
  lvl.boxes = boxes;
  return lvl;
}

// ───────── Teilen ─────────
export const encodeLevel = (l: Level) => btoa(unescape(encodeURIComponent(toXsb(l)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function decodeLevel(code: string): Level | null {
  try { return parseXsb(decodeURIComponent(escape(atob(code.trim().replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; }
}
