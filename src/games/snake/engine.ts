// Schlange: deterministischer Spielkern (Raster, Futter, Power-ups, Wände, Torus, zwei Schlangen, KI).

export type Dir = 0 | 1 | 2 | 3; // oben, rechts, unten, links
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export type FoodKind = 'apfel' | 'gold' | 'gift' | 'geist' | 'zeitlupe' | 'doppel' | 'schild';

export interface Food { cell: number; kind: FoodKind; ttl: number }

export interface Effects { geist: number; zeitlupe: number; doppel: number; schild: number }

export interface Snake {
  id: number;
  /** Zellen vom Schwanz (Index 0) bis zum Kopf (letzter Index) */
  cells: number[];
  dir: Dir;
  queue: Dir[];
  alive: boolean;
  score: number;
  grow: number;
  eaten: number;
  effects: Effects;
  /** Zuletzt tatsächlich gelaufene Richtung (für Umkehr-Sperre) */
  moved: Dir;
  deathReason: string;
}

export interface Rules {
  w: number;
  h: number;
  wrap: boolean;
  obstacles: number[];
  /** Futter-Arten außer Apfel zulassen */
  extras: boolean;
  /** Wände rücken nach einiger Zeit näher */
  closing: boolean;
  /** Anzahl Schlangen (1 oder 2) */
  snakes: 1 | 2;
  /** Tod bei Berührung ausschalten: stattdessen schrumpfen (Zen) */
  zen: boolean;
  startLen: number;
  /** Schlange darf beim Ein-Spieler-Spiel nicht … (Reserve) */
  seed: number;
}

export interface Game {
  rules: Rules;
  snakes: Snake[];
  foods: Food[];
  tick: number;
  rng: number;
  over: boolean;
  winner: number; // −1 keiner/unentschieden
  walls: Set<number>;
  events: string[];
  closeStep: number;
}

export const DEFAULT_RULES: Rules = { w: 20, h: 14, wrap: false, obstacles: [], extras: true, closing: false, snakes: 1, zen: false, startLen: 3, seed: 1 };

const noEffects = (): Effects => ({ geist: 0, zeitlupe: 0, doppel: 0, schild: 0 });

/** Zufall aus dem Spielzustand (deterministisch, Zustand in g.rng). */
export function rand(g: Game): number {
  g.rng = (g.rng + 0x6d2b79f5) >>> 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const idx = (r: Rules, x: number, y: number) => y * r.w + x;
export const xy = (r: Rules, i: number): [number, number] => [i % r.w, Math.floor(i / r.w)];

/** Nachbarzelle in Richtung d; −1 an einer Wand (ohne Torus). */
export function nextCell(r: Rules, c: number, d: Dir): number {
  let [x, y] = xy(r, c);
  x += DX[d]; y += DY[d];
  if (r.wrap) { x = (x + r.w) % r.w; y = (y + r.h) % r.h; }
  else if (x < 0 || y < 0 || x >= r.w || y >= r.h) return -1;
  return idx(r, x, y);
}

export function newGame(rules: Rules): Game {
  const g: Game = { rules, snakes: [], foods: [], tick: 0, rng: rules.seed >>> 0, over: false, winner: -1, walls: new Set(rules.obstacles), events: [], closeStep: 0 };
  const starts: { x: number; y: number; d: Dir }[] = rules.snakes === 1
    ? [{ x: Math.floor(rules.w / 4), y: Math.floor(rules.h / 2), d: 1 }]
    : [{ x: Math.floor(rules.w / 4), y: Math.floor(rules.h / 3), d: 1 }, { x: Math.floor((rules.w * 3) / 4), y: Math.floor((rules.h * 2) / 3), d: 3 }];
  starts.forEach((s, id) => {
    const cells: number[] = [];
    for (let i = rules.startLen - 1; i >= 0; i--) {
      const x = s.x - DX[s.d] * i, y = s.y - DY[s.d] * i;
      cells.push(idx(rules, ((x % rules.w) + rules.w) % rules.w, ((y % rules.h) + rules.h) % rules.h));
    }
    g.snakes.push({ id, cells, dir: s.d, queue: [], alive: true, score: 0, grow: 0, eaten: 0, effects: noEffects(), moved: s.d, deathReason: '' });
  });
  for (const s of g.snakes) for (const c of s.cells) g.walls.delete(c);
  spawnFood(g, 'apfel');
  return g;
}

function occupied(g: Game): Set<number> {
  const o = new Set<number>(g.walls);
  for (const s of g.snakes) for (const c of s.cells) o.add(c);
  for (const f of g.foods) o.add(f.cell);
  return o;
}

export function spawnFood(g: Game, kind?: FoodKind): boolean {
  const occ = occupied(g);
  const free: number[] = [];
  for (let i = 0; i < g.rules.w * g.rules.h; i++) if (!occ.has(i)) free.push(i);
  if (!free.length) return false;
  let k = kind;
  if (!k) {
    const r = rand(g);
    if (!g.rules.extras || r < 0.78) k = 'apfel';
    else if (r < 0.86) k = 'gold';
    else if (r < 0.92) k = 'gift';
    else { const pk: FoodKind[] = ['geist', 'zeitlupe', 'doppel', 'schild']; k = pk[Math.floor(rand(g) * pk.length)]; }
  }
  const ttl = k === 'apfel' ? 0 : k === 'gold' ? 45 : 70;
  g.foods.push({ cell: free[Math.floor(rand(g) * free.length)], kind: k, ttl });
  return true;
}

/** Richtungswunsch vormerken (mit Umkehr-Sperre, höchstens zwei vorgemerkt). */
export function steer(s: Snake, d: Dir) {
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.moved;
  if (d === last || d === opposite(last)) return;
  if (s.queue.length < 2) s.queue.push(d);
}

const EFFECT_TICKS = 40;

export interface StepResult { ate: { snake: number; kind: FoodKind }[]; died: number[]; }

/** Ein Spielschritt. `dirs`: Richtungseingabe je Schlange (oder null). */
export function step(g: Game, dirs: (Dir | null)[] = []): StepResult {
  const res: StepResult = { ate: [], died: [] };
  if (g.over) return res;
  g.events = [];
  g.tick++;
  g.snakes.forEach((s, i) => { const d = dirs[i]; if (d !== null && d !== undefined) steer(s, d); });
  const r = g.rules;
  const nextHead: number[] = [];
  const tails: number[] = [];
  g.snakes.forEach((s) => {
    if (!s.alive) { nextHead.push(-2); tails.push(-1); return; }
    const d = s.queue.length ? s.queue.shift()! : s.dir;
    s.dir = d; s.moved = d;
    nextHead.push(nextCell(r, s.cells[s.cells.length - 1], d));
    tails.push(s.grow > 0 ? -1 : s.cells[0]);
  });

  // Kollisionen bestimmen (vor dem Bewegen, damit Kopf-an-Kopf erkannt wird)
  const dead = new Set<number>();
  const blocked = new Set<number>();
  g.snakes.forEach((s, i) => {
    if (!s.alive) return;
    const nh = nextHead[i];
    let hit = '';
    if (nh === -1) hit = 'Wand';
    else if (g.walls.has(nh)) hit = 'Hindernis';
    else {
      for (const o of g.snakes) {
        if (!o.alive) continue;
        const own = o.id === s.id;
        const tail = tails[o.id];
        for (const c of o.cells) {
          if (c !== nh) continue;
          if (c === tail) continue; // Schwanzspitze rückt nach
          hit = own ? 'Schwanz' : 'Gegner';
        }
      }
      for (const o of g.snakes) if (o.id !== s.id && o.alive && nextHead[o.id] === nh) hit = 'Kopf an Kopf';
    }
    if (!hit) return;
    // Geist: durch Hindernisse und eigene Schlange
    if (s.effects.geist > 0 && (hit === 'Hindernis' || hit === 'Schwanz')) return;
    if (s.effects.schild > 0) { s.effects.schild = 0; blocked.add(i); g.events.push(`${i}:schild`); return; }
    if (r.zen && (hit === 'Schwanz' || hit === 'Hindernis' || hit === 'Wand')) { blocked.add(i); g.events.push(`${i}:zen`); if (s.cells.length > 2 && hit === 'Schwanz') s.cells.shift(); return; }
    s.deathReason = hit;
    dead.add(i);
  });

  g.snakes.forEach((s, i) => {
    if (!s.alive) return;
    if (dead.has(i)) { s.alive = false; res.died.push(i); return; }
    // Zeit der Effekte
    for (const k of ['geist', 'zeitlupe', 'doppel', 'schild'] as const) if (s.effects[k] > 0 && k !== 'schild') s.effects[k]--;
    if (blocked.has(i)) return;
    const nh = nextHead[i];
    s.cells.push(nh);
    if (s.grow > 0) s.grow--; else s.cells.shift();
    // Fressen
    const fi = g.foods.findIndex((f) => f.cell === nh);
    if (fi >= 0) {
      const f = g.foods[fi];
      g.foods.splice(fi, 1);
      const mult = s.effects.doppel > 0 ? 2 : 1;
      res.ate.push({ snake: i, kind: f.kind });
      if (f.kind === 'apfel') { s.grow += 1; s.score += 10 * mult; s.eaten++; }
      else if (f.kind === 'gold') { s.grow += 2; s.score += 50 * mult; s.eaten++; }
      else if (f.kind === 'gift') { const cut = Math.min(2, Math.max(0, s.cells.length - 2)); s.cells.splice(0, cut); s.score = Math.max(0, s.score - 5); }
      else if (f.kind === 'geist') s.effects.geist = EFFECT_TICKS;
      else if (f.kind === 'zeitlupe') s.effects.zeitlupe = EFFECT_TICKS;
      else if (f.kind === 'doppel') s.effects.doppel = EFFECT_TICKS;
      else if (f.kind === 'schild') s.effects.schild = 1;
      if (!g.foods.some((x) => x.kind === 'apfel')) spawnFood(g, 'apfel');
      else if (rand(g) < 0.35) spawnFood(g);
    }
  });

  // Futter altern lassen
  for (const f of g.foods) if (f.ttl > 0) f.ttl--;
  g.foods = g.foods.filter((f) => f.ttl !== 0 || f.kind === 'apfel');
  if (!g.foods.some((f) => f.kind === 'apfel')) spawnFood(g, 'apfel');

  // Wände rücken näher
  if (r.closing && g.tick % 60 === 0) closeIn(g);

  // Spielende
  const alive = g.snakes.filter((s) => s.alive);
  if (g.snakes.length === 1) { if (!alive.length) { g.over = true; g.winner = -1; } }
  else if (alive.length <= 1) { g.over = true; g.winner = alive.length === 1 ? alive[0].id : -1; }
  return res;
}

function closeIn(g: Game) {
  const r = g.rules;
  const ring = g.closeStep;
  if (ring >= Math.min(r.w, r.h) / 2 - 3) return;
  g.closeStep++;
  const cells: number[] = [];
  for (let x = ring; x < r.w - ring; x++) { cells.push(idx(r, x, ring), idx(r, x, r.h - 1 - ring)); }
  for (let y = ring; y < r.h - ring; y++) { cells.push(idx(r, ring, y), idx(r, r.w - 1 - ring, y)); }
  const bodies = new Set<number>();
  for (const s of g.snakes) for (const c of s.cells) bodies.add(c);
  for (const c of cells) {
    if (bodies.has(c)) { g.events.push('wand-ueber-schlange'); continue; }
    g.walls.add(c);
    g.foods = g.foods.filter((f) => f.cell !== c);
  }
}

/** Tick-Dauer der Schlange in ms: schneller mit mehr Punkten; Zeitlupe verlängert. */
export function tickMs(base: number, s: Snake): number {
  const speedUp = Math.min(0.55, s.eaten * 0.018);
  const slow = s.effects.zeitlupe > 0 ? 1.7 : 1;
  return Math.round(base * (1 - speedUp) * slow);
}

// ───────── KI ─────────

const DIRS: Dir[] = [0, 1, 2, 3];

/** Erreichbare freie Felder von Zelle c aus (Flutfüllung), begrenzt. */
export function floodCount(g: Game, from: number, blockedExtra: Set<number>, limit = 400): number {
  const r = g.rules;
  const seen = new Set<number>([from]);
  const queue = [from];
  for (let k = 0; k < queue.length && seen.size < limit; k++) {
    for (const d of DIRS) {
      const n = nextCell(r, queue[k], d);
      if (n < 0 || seen.has(n) || g.walls.has(n) || blockedExtra.has(n)) continue;
      seen.add(n); queue.push(n);
    }
  }
  return seen.size;
}

function bfsDist(g: Game, from: number, targets: Set<number>, blocked: Set<number>): { dir: Dir; dist: number } | null {
  const r = g.rules;
  const prev = new Map<number, { c: number; d: Dir }>();
  const q = [from];
  const seen = new Set<number>([from]);
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    if (targets.has(c) && c !== from) {
      let cur = c, dist = 0, d: Dir = 0;
      while (cur !== from) { const p = prev.get(cur)!; d = p.d; cur = p.c; dist++; }
      return { dir: d, dist };
    }
    for (const d of DIRS) {
      const n = nextCell(r, c, d);
      if (n < 0 || seen.has(n) || g.walls.has(n) || blocked.has(n)) continue;
      seen.add(n); prev.set(n, { c, d }); q.push(n);
    }
  }
  return null;
}

/** KI-Richtung für Schlange i. level 1 zufällig-sicher, 2 gierig, 3 gierig mit Platzprüfung, 4 wie 3 plus Gegner-Blockade. */
export function aiDir(g: Game, i: number, level: number, rnd: () => number): Dir {
  const s = g.snakes[i];
  const r = g.rules;
  const head = s.cells[s.cells.length - 1];
  const body = new Set<number>();
  for (const o of g.snakes) for (let k = (o.id === s.id ? 1 : 0); k < o.cells.length; k++) body.add(o.cells[k]);
  const safe = DIRS.filter((d) => {
    if (d === opposite(s.moved)) return false;
    const n = nextCell(r, head, d);
    return n >= 0 && !g.walls.has(n) && !body.has(n);
  });
  if (!safe.length) return s.dir;
  if (level <= 1) return rnd() < 0.8 ? safe[Math.floor(rnd() * safe.length)] : safe[0];
  const foods = g.foods.filter((f) => f.kind !== 'gift');
  const targets = new Set(foods.map((f) => f.cell));
  // Gegner-Köpfe als Hindernis
  const enemyHeads = new Set<number>();
  for (const o of g.snakes) if (o.id !== s.id && o.alive) for (const d of DIRS) { const n = nextCell(r, o.cells[o.cells.length - 1], d); if (n >= 0) enemyHeads.add(n); }
  const blocked = new Set<number>(body);
  if (level >= 4) for (const c of enemyHeads) blocked.add(c);
  const path = bfsDist(g, head, targets, blocked);
  const scoreOf = (d: Dir) => {
    const n = nextCell(r, head, d);
    const room = floodCount(g, n, blocked, s.cells.length * 2 + 8);
    return room;
  };
  if (path && safe.includes(path.dir)) {
    if (level === 2) return path.dir;
    // Platzprüfung: nach dem Zug muss genug Raum bleiben
    const room = scoreOf(path.dir);
    if (room >= s.cells.length + 1) return path.dir;
  }
  // Sonst: Richtung mit dem meisten freien Raum
  let best = safe[0], bs = -1;
  for (const d of safe) { const sc = scoreOf(d) + (rnd() < 0.05 ? 1 : 0); if (sc > bs) { bs = sc; best = d; } }
  return best;
}

// ───────── Spielstände / Replays ─────────

export interface ReplayData { rules: Rules; inputs: [number, number, Dir][]; ticks: number }

/** Spielt aufgezeichnete Eingaben ab und liefert den Endstand. */
export function replayRun(rep: ReplayData): Game {
  const g = newGame(rep.rules);
  const byTick = new Map<number, [number, Dir][]>();
  for (const [t, si, d] of rep.inputs) { const l = byTick.get(t) ?? []; l.push([si, d]); byTick.set(t, l); }
  for (let t = 1; t <= rep.ticks && !g.over; t++) {
    const dirs: (Dir | null)[] = g.snakes.map(() => null);
    for (const [si, d] of byTick.get(t) ?? []) dirs[si] = d;
    step(g, dirs);
  }
  return g;
}
