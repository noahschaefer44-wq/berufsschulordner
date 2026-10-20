// Blockfall: deterministischer Spielkern (feste Schrittweite 1/60 s) mit SRS-Drehung, Wandtritten, Halten, T-Spins, Müllzeilen und Bewertung.
import { type Rng, mulberry32, shuffled } from '../shared/rng';

// ───────── Steine ─────────

export interface PieceDef { id: number; key: string; name: string; size: number; cells: [number, number][]; kicks: 'jlstz' | 'i' | 'o' | 'generic' }
const P = (id: number, key: string, name: string, size: number, cells: [number, number][], kicks: PieceDef['kicks'] = 'jlstz'): PieceDef => ({ id, key, name, size, cells, kicks });

export const PIECES: PieceDef[] = [
  P(1, 'I', 'I', 4, [[0, 1], [1, 1], [2, 1], [3, 1]], 'i'),
  P(2, 'O', 'O', 2, [[0, 0], [1, 0], [0, 1], [1, 1]], 'o'),
  P(3, 'T', 'T', 3, [[1, 0], [0, 1], [1, 1], [2, 1]]),
  P(4, 'S', 'S', 3, [[1, 0], [2, 0], [0, 1], [1, 1]]),
  P(5, 'Z', 'Z', 3, [[0, 0], [1, 0], [1, 1], [2, 1]]),
  P(6, 'J', 'J', 3, [[0, 0], [0, 1], [1, 1], [2, 1]]),
  P(7, 'L', 'L', 3, [[2, 0], [0, 1], [1, 1], [2, 1]]),
  // Pentominos
  P(8, 'F', 'F', 3, [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], 'generic'),
  P(9, 'I5', 'I5', 5, [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], 'generic'),
  P(10, 'L5', 'L5', 4, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]], 'generic'),
  P(11, 'N', 'N', 4, [[1, 0], [1, 1], [1, 2], [0, 2], [0, 3]], 'generic'),
  P(12, 'P', 'P', 3, [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]], 'generic'),
  P(13, 'T5', 'T5', 3, [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]], 'generic'),
  P(14, 'U', 'U', 3, [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]], 'generic'),
  P(15, 'V', 'V', 3, [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], 'generic'),
  P(16, 'W', 'W', 3, [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]], 'generic'),
  P(17, 'X', 'X', 3, [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], 'generic'),
  P(18, 'Y', 'Y', 4, [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]], 'generic'),
  P(19, 'Z5', 'Z5', 3, [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]], 'generic'),
];
export const GARBAGE = 20;
export const TETRO_IDS = [1, 2, 3, 4, 5, 6, 7];
export const PENTO_IDS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
export const T_ID = 3;

/** Alle vier Drehzustände (im Uhrzeigersinn) je Stein. */
export const ROT: [number, number][][][] = (() => {
  const out: [number, number][][][] = [];
  for (const p of PIECES) {
    const st: [number, number][][] = [p.cells];
    for (let r = 1; r < 4; r++) st.push(st[r - 1].map(([x, y]) => [p.size - 1 - y, x] as [number, number]));
    out[p.id] = st;
  }
  return out;
})();

// SRS-Wandtritte (x rechts, y nach OBEN positiv wie in der Spezifikation; werden beim Anwenden umgekehrt)
const KICK_JLSTZ: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const KICK_GENERIC: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, 1]];
const KICK_180: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1]];

// ───────── Einstellungen ─────────

export type Mode = 'marathon' | 'sprint' | 'ultra' | 'zen' | 'kaese' | 'ueberleben' | 'puzzle' | 'duell';
export type Randomizer = '7bag' | '14bag' | 'zufall' | 'klassisch';
export type PieceSet = 'tetro' | 'pento' | 'mix';

export interface Handling { das: number; arr: number; sdf: number; lock: number; areMs: number }
export const DEFAULT_HANDLING: Handling = { das: 133, arr: 33, sdf: 12, lock: 500, areMs: 0 };

export interface Cfg {
  mode: Mode;
  w: number;
  h: number; // sichtbare Zeilen
  pieces: PieceSet;
  random: Randomizer;
  kicks: boolean; // SRS-Wandtritte (false = klassisch ohne Tritte)
  handling: Handling;
  startLevel: number;
  /** Ziel (Zeilen) für Marathon/Sprint/Käse */
  goal: number;
  hold: boolean;
  nextCount: number;
  invisible: boolean;
  noGravity: boolean;
  rot180: boolean;
  /** Käserennen: Anzahl Müllzeilen */
  cheese: number;
}

export const DEFAULT_CFG: Cfg = { mode: 'marathon', w: 10, h: 20, pieces: 'tetro', random: '7bag', kicks: true, handling: DEFAULT_HANDLING, startLevel: 1, goal: 150, hold: true, nextCount: 5, invisible: false, noGravity: false, rot180: true, cheese: 10 };

export const BUFFER = 20;

// ───────── Zustand ─────────

export interface Cur { type: number; x: number; y: number; rot: number }
export type ClearKind = 'single' | 'double' | 'triple' | 'tetris' | 'penta' | 'tspin' | 'tspinmini' | 'none';
export interface GameEvent {
  kind: 'lock' | 'clear' | 'hold' | 'level' | 'over' | 'win' | 'garbage' | 'rotate' | 'move' | 'drop' | 'spawn';
  rows?: number[];
  lines?: number;
  label?: string;
  tspin?: boolean;
  mini?: boolean;
  pc?: boolean;
  b2b?: boolean;
  combo?: number;
  attack?: number;
}

export interface Game {
  cfg: Cfg;
  seed: number;
  rng: Rng;
  W: number;
  R: number; // Gesamtzeilen (Puffer + sichtbar)
  board: Uint8Array;
  cur: Cur | null;
  hold: number;
  holdUsed: boolean;
  queue: number[];
  bag: number[];
  last: number;
  t: number; // Zeit in ms
  frames: number;
  // Eingabe
  inp: { prev: number; dir: -1 | 0 | 1; das: number; arr: number };
  gAcc: number;
  lockT: number;
  resets: number;
  lowest: number;
  areT: number;
  lastRot: boolean; // letzte Aktion war eine Drehung
  lastKick: number;
  // Wertung
  score: number;
  lines: number;
  level: number;
  combo: number;
  b2b: number;
  pieces: number;
  keys: number;
  attack: number;
  tspins: number;
  tetrises: number;
  pcs: number;
  maxCombo: number;
  status: 'play' | 'over' | 'win';
  reason: string;
  // Müll
  incoming: number[];
  garbageHole: number;
  cheeseLeft: number;
  nextRise: number;
  events: GameEvent[];
  lastClear: { label: string; t: number } | null;
  /** zuletzt festgesetzter Stein (Lage beim Verriegeln) */
  lastPlaced: Cur | null;
}

export const K_LEFT = 1, K_RIGHT = 2, K_DOWN = 4, K_CW = 8, K_CCW = 16, K_180 = 32, K_HARD = 64, K_HOLD = 128;
export const FRAME_MS = 1000 / 60;

const poolOf = (c: Cfg): number[] => (c.pieces === 'tetro' ? TETRO_IDS : c.pieces === 'pento' ? PENTO_IDS : [...TETRO_IDS, ...PENTO_IDS]);

export interface PuzzleSetup { rows: string[]; queue: number[] }

export function newGame(cfg: Cfg, seed: number, puz?: PuzzleSetup): Game {
  const rng = mulberry32(seed);
  const R = cfg.h + BUFFER;
  const g: Game = {
    cfg, seed, rng, W: cfg.w, R, board: new Uint8Array(cfg.w * R), cur: null, hold: 0, holdUsed: false, queue: [], bag: [], last: 0,
    t: 0, frames: 0, inp: { prev: 0, dir: 0, das: 0, arr: 0 }, gAcc: 0, lockT: 0, resets: 0, lowest: 0, areT: 0, lastRot: false, lastKick: 0,
    score: 0, lines: 0, level: cfg.startLevel, combo: -1, b2b: -1, pieces: 0, keys: 0, attack: 0, tspins: 0, tetrises: 0, pcs: 0, maxCombo: 0,
    status: 'play', reason: '', incoming: [], garbageHole: 0, cheeseLeft: 0, nextRise: 8000, events: [], lastClear: null, lastPlaced: null,
  };
  if (cfg.mode === 'kaese') fillCheese(g, cfg.cheese);
  if (puz) {
    puz.rows.forEach((row, i) => { const y = g.R - puz.rows.length + i; for (let x = 0; x < Math.min(g.W, row.length); x++) if (row[x] === 'X') g.board[y * g.W + x] = GARBAGE; });
    g.queue = puz.queue.slice();
  }
  refill(g);
  nextPiece(g);
  return g;
}

function fillCheese(g: Game, n: number) {
  let hole = Math.floor(g.rng() * g.W);
  for (let i = 0; i < n; i++) {
    const y = g.R - 1 - i;
    if (g.rng() < 0.7) hole = Math.floor(g.rng() * g.W); // meist neues Loch
    for (let x = 0; x < g.W; x++) g.board[y * g.W + x] = x === hole ? 0 : GARBAGE;
  }
  g.cheeseLeft = n;
}

function refill(g: Game) {
  if (g.cfg.mode === 'puzzle') return;
  const pool = poolOf(g.cfg);
  while (g.queue.length < 14) {
    let next: number;
    if (g.cfg.random === 'zufall') next = pool[Math.floor(g.rng() * pool.length)];
    else if (g.cfg.random === 'klassisch') { next = pool[Math.floor(g.rng() * pool.length)]; if (next === g.last) next = pool[Math.floor(g.rng() * pool.length)]; }
    else {
      if (!g.bag.length) g.bag = shuffled(g.rng, g.cfg.random === '14bag' ? [...pool, ...pool] : pool);
      next = g.bag.shift()!;
    }
    g.last = next;
    g.queue.push(next);
  }
}

// ───────── Kollision ─────────

export const cellsOf = (type: number, rot: number, x: number, y: number): [number, number][] => ROT[type][rot & 3].map(([cx, cy]) => [x + cx, y + cy] as [number, number]);

export function fits(g: Game, type: number, rot: number, x: number, y: number): boolean {
  for (const [cx, cy] of ROT[type][rot & 3]) {
    const px = x + cx, py = y + cy;
    if (px < 0 || px >= g.W || py >= g.R) return false;
    if (py >= 0 && g.board[py * g.W + px]) return false;
  }
  return true;
}

/** Nächsten Stein aus der Warteschlange holen (Puzzle: Ende der Folge = Spielende). */
function nextPiece(g: Game) {
  refill(g);
  const t = g.queue.shift();
  if (t === undefined) { over(g, 'Keine Steine mehr.'); return; }
  spawn(g, t);
}

export function spawn(g: Game, type: number) {
  const def = PIECES[type - 1];
  const x = Math.floor((g.W - def.size) / 2);
  const y = BUFFER - 2;
  g.cur = { type, x, y, rot: 0 };
  g.gAcc = 0; g.lockT = 0; g.resets = 0; g.lowest = y; g.lastRot = false; g.lastKick = 0;
  g.events.push({ kind: 'spawn' });
  if (!fits(g, type, 0, x, y)) {
    // eine Zeile höher versuchen, sonst Block-out
    if (fits(g, type, 0, x, y - 1)) g.cur.y = y - 1;
    else { over(g, 'Block-out: Der Stein passt nicht mehr ins Feld.'); return; }
  }
  // sofort eine Zeile fallen (Leitlinie)
  if (fits(g, type, 0, g.cur.x, g.cur.y + 1)) { g.cur.y++; g.lowest = g.cur.y; }
}

function over(g: Game, reason: string) {
  if (g.status !== 'play') return;
  g.status = 'over'; g.reason = reason; g.cur = null;
  g.events.push({ kind: 'over' });
}

// ───────── Aktionen ─────────

const ground = (g: Game) => !!g.cur && !fits(g, g.cur.type, g.cur.rot, g.cur.x, g.cur.y + 1);

function touched(g: Game) {
  // Bewegung/Drehung am Boden verlängert die Verzögerung (begrenzt)
  if (ground(g) && g.resets < 15) { g.lockT = 0; g.resets++; }
}

export function tryMove(g: Game, dx: number): boolean {
  const c = g.cur;
  if (!c || !fits(g, c.type, c.rot, c.x + dx, c.y)) return false;
  c.x += dx; g.lastRot = false; touched(g); g.events.push({ kind: 'move' });
  return true;
}

export function tryRotate(g: Game, dir: 1 | -1 | 2): boolean {
  const c = g.cur;
  if (!c) return false;
  const def = PIECES[c.type - 1];
  const to = (c.rot + (dir === 2 ? 2 : dir) + 4) & 3;
  if (def.kicks === 'o') { g.events.push({ kind: 'rotate' }); return true; }
  let kicks: [number, number][];
  if (dir === 2) kicks = KICK_180;
  else if (!g.cfg.kicks) kicks = [[0, 0]];
  else if (def.kicks === 'generic') kicks = KICK_GENERIC;
  else kicks = (def.kicks === 'i' ? KICK_I : KICK_JLSTZ)[`${c.rot}>${to}`];
  for (let k = 0; k < kicks.length; k++) {
    const [kx, ky] = kicks[k];
    const nx = c.x + kx, ny = c.y - ky;
    if (fits(g, c.type, to, nx, ny)) {
      c.x = nx; c.y = ny; c.rot = to; g.lastRot = true; g.lastKick = k;
      if (c.y > g.lowest) { g.lowest = c.y; g.resets = 0; }
      touched(g);
      g.events.push({ kind: 'rotate' });
      return true;
    }
  }
  return false;
}

export function ghostY(g: Game): number {
  const c = g.cur;
  if (!c) return 0;
  let y = c.y;
  while (fits(g, c.type, c.rot, c.x, y + 1)) y++;
  return y;
}

export function doHold(g: Game): boolean {
  if (!g.cfg.hold || g.holdUsed || !g.cur) return false;
  const t = g.cur.type;
  const prev = g.hold;
  g.hold = t;
  if (prev) spawn(g, prev); else nextPiece(g);
  g.holdUsed = true;
  g.events.push({ kind: 'hold' });
  return true;
}

export function hardDrop(g: Game) {
  if (!g.cur) return;
  const y = ghostY(g);
  g.score += (y - g.cur.y) * 2;
  if (y !== g.cur.y) g.lastRot = false;
  g.cur.y = y;
  g.events.push({ kind: 'drop' });
  lock(g);
}

// ───────── Festsetzen ─────────

export function lock(g: Game) {
  const c = g.cur;
  if (!c) return;
  const cells = cellsOf(c.type, c.rot, c.x, c.y);
  // T-Spin (Drei-Ecken-Regel) vor dem Eintragen prüfen
  let tspin = false, mini = false;
  if (c.type === T_ID && g.lastRot) {
    const occ = (x: number, y: number) => x < 0 || x >= g.W || y >= g.R || (y >= 0 && g.board[y * g.W + x] !== 0);
    const cx = c.x + 1, cy = c.y + 1;
    const corners: [number, number][] = [[cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]];
    const filled = corners.filter(([x, y]) => occ(x, y)).length;
    if (filled >= 3) {
      // Vorderecken (zeigen in Spitzenrichtung)
      const f: [number, number][][] = [[corners[0], corners[1]], [corners[1], corners[3]], [corners[2], corners[3]], [corners[0], corners[2]]];
      const fc = f[c.rot & 3].filter(([x, y]) => occ(x, y)).length;
      tspin = true;
      mini = !(fc === 2 || g.lastKick === 4);
    }
  }
  let aboveAll = true;
  for (const [x, y] of cells) { if (y >= BUFFER) aboveAll = false; if (y >= 0 && y < g.R) g.board[y * g.W + x] = c.type; }
  g.pieces++;
  g.lastPlaced = { ...c };
  g.cur = null;
  g.events.push({ kind: 'lock' });
  // volle Zeilen
  const full: number[] = [];
  for (let y = 0; y < g.R; y++) { let f = true; for (let x = 0; x < g.W; x++) if (!g.board[y * g.W + x]) { f = false; break; } if (f) full.push(y); }
  let cleared = full.length;
  if (cleared) {
    const keep = new Uint8Array(g.board.length);
    let dst = g.R - 1;
    for (let y = g.R - 1; y >= 0; y--) { if (full.includes(y)) continue; keep.set(g.board.subarray(y * g.W, y * g.W + g.W), dst * g.W); dst--; }
    g.board = keep;
  }
  if (g.cfg.mode === 'kaese') { let left = 0; for (let i = 0; i < g.board.length; i++) if (g.board[i] === GARBAGE) left++; g.cheeseLeft = Math.ceil(left / (g.W - 1)); }
  const pc = cleared > 0 && g.board.every((v) => v === 0);
  scoreClear(g, cleared, tspin, mini, pc, full);
  g.holdUsed = false;
  if (aboveAll) { over(g, 'Lock-out: Der Stein wurde komplett oberhalb des Feldes gesetzt.'); return; }
  // Müll
  if (!cleared) applyGarbage(g);
  if (g.status !== 'play') return;
  checkGoals(g);
  if (g.status !== 'play') return;
  g.areT = g.cfg.handling.areMs;
  if (g.areT <= 0) nextPiece(g);
  cleared = 0;
}

function scoreClear(g: Game, n: number, tspin: boolean, mini: boolean, pc: boolean, rows: number[]) {
  const lv = g.level;
  let pts = 0, atk = 0;
  let label = '';
  let hard = false;
  if (tspin) {
    if (mini) { pts = [100, 200, 400][Math.min(n, 2)]; label = n === 0 ? 'T-Spin Mini' : n === 1 ? 'T-Spin Mini Single' : 'T-Spin Mini Double'; atk = [0, 0, 1][Math.min(n, 2)]; }
    else { pts = [400, 800, 1200, 1600][Math.min(n, 3)]; label = ['T-Spin', 'T-Spin Single', 'T-Spin Double', 'T-Spin Triple'][Math.min(n, 3)]; atk = [0, 2, 4, 6][Math.min(n, 3)]; }
    hard = n > 0;
    g.tspins++;
  } else if (n > 0) {
    if (n >= 5) { pts = 1200 + (n - 5) * 400; label = `${n} Zeilen`; atk = n; hard = true; }
    else { pts = [0, 100, 300, 500, 800][n]; label = ['', 'Single', 'Double', 'Triple', 'Tetris'][n]; atk = [0, 0, 1, 2, 4][n]; hard = n === 4; }
    if (n === 4) g.tetrises++;
  }
  if (n > 0) {
    g.combo++;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    let b2bBonus = false;
    if (hard) { g.b2b++; if (g.b2b > 0) { pts = Math.floor(pts * 1.5); atk += 1; b2bBonus = true; } } else g.b2b = -1;
    let bonus = 0;
    if (g.combo > 0) { bonus += 50 * g.combo; atk += [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5][Math.min(g.combo, 11)]; }
    if (pc) { bonus += [0, 800, 1200, 1800, 2000, 2400][Math.min(n, 5)]; atk += 10; g.pcs++; }
    g.score += (pts + bonus) * lv;
    g.lines += n;
    g.attack += atk;
    // Gegenseitig verrechnen
    if (g.incoming.length && atk > 0) {
      let left = atk;
      while (left > 0 && g.incoming.length) { const take = Math.min(left, g.incoming[0]); g.incoming[0] -= take; left -= take; if (g.incoming[0] <= 0) g.incoming.shift(); }
      atk = left;
    }
    const newLevel = g.cfg.mode === 'marathon' || g.cfg.mode === 'sprint' || g.cfg.mode === 'ultra' ? Math.max(g.cfg.startLevel, Math.floor(g.lines / 10) + 1) : g.level;
    if (newLevel !== g.level && !g.cfg.noGravity) { g.level = Math.min(30, newLevel); g.events.push({ kind: 'level' }); }
    g.lastClear = { label: (pc ? 'Perfect Clear! ' : '') + label, t: g.t };
    g.events.push({ kind: 'clear', rows, lines: n, label, tspin, mini, pc, b2b: b2bBonus, combo: g.combo, attack: atk });
  } else {
    if (tspin) { g.score += pts * lv; g.lastClear = { label, t: g.t }; g.events.push({ kind: 'clear', rows: [], lines: 0, label, tspin: true, mini }); }
    g.combo = -1;
  }
}

function checkGoals(g: Game) {
  const m = g.cfg.mode;
  const win = (why: string) => { if (g.status === 'play') { g.status = 'win'; g.reason = why; g.cur = null; g.events.push({ kind: 'win' }); } };
  if ((m === 'marathon') && g.cfg.goal > 0 && g.lines >= g.cfg.goal) win(`${g.cfg.goal} Zeilen geschafft`);
  else if (m === 'sprint' && g.lines >= g.cfg.goal) win(`${g.cfg.goal} Zeilen in ${(g.t / 1000).toFixed(2)} s`);
  else if (m === 'kaese' && g.cheeseLeft <= 0) win('Alle Käsezeilen entfernt');
}

// ───────── Müll ─────────

export function addIncoming(g: Game, lines: number) { if (lines > 0) g.incoming.push(lines); }
export function applyGarbage(g: Game) {
  if (!g.incoming.length) return;
  let n = 0;
  while (g.incoming.length && n < 8) n += g.incoming.shift()!;
  insertGarbage(g, n);
}
export function insertGarbage(g: Game, n: number) {
  if (n <= 0) return;
  const topRows = g.board.slice(0, n * g.W);
  if (topRows.some((v) => v)) { over(g, 'Top-out: Müllzeilen haben das Feld überfüllt.'); return; }
  const nb = new Uint8Array(g.board.length);
  nb.set(g.board.subarray(n * g.W), 0);
  if (g.rng() < 0.3) g.garbageHole = Math.floor(g.rng() * g.W);
  for (let i = 0; i < n; i++) { const y = g.R - n + i; for (let x = 0; x < g.W; x++) nb[y * g.W + x] = x === g.garbageHole ? 0 : GARBAGE; }
  g.board = nb;
  g.events.push({ kind: 'garbage', lines: n });
  // Stein ggf. anheben
  if (g.cur && !fits(g, g.cur.type, g.cur.rot, g.cur.x, g.cur.y)) { g.cur.y -= n; if (!fits(g, g.cur.type, g.cur.rot, g.cur.x, g.cur.y)) over(g, 'Top-out'); }
}

// ───────── Schwerkraft ─────────

export function secPerRow(level: number): number { return Math.pow(0.8 - (level - 1) * 0.007, level - 1); }

// ───────── Ein Schritt ─────────

/** Ein Bild (1/60 s) mit Tastenmaske `input`. */
export function step(g: Game, input: number): void {
  if (g.status !== 'play') return;
  const dt = FRAME_MS;
  g.frames++; g.t += dt;
  const H = g.cfg.handling;
  const pressed = input & ~g.inp.prev;
  g.inp.prev = input;
  if (g.cfg.mode === 'ultra' && g.t >= 120000) { g.status = 'over'; g.reason = 'Zeit abgelaufen'; g.cur = null; g.events.push({ kind: 'over' }); return; }
  // Entry-Verzögerung
  if (!g.cur) {
    g.areT -= dt;
    if (g.areT <= 0) nextPiece(g);
    if (!g.cur) return;
  }
  if (pressed & (K_LEFT | K_RIGHT | K_CW | K_CCW | K_180 | K_HARD | K_HOLD | K_DOWN)) g.keys += bitCount(pressed);
  // Halten und Drehen (auch als Vorab-Eingabe nach dem Erscheinen)
  if (pressed & K_HOLD) doHold(g);
  if (!g.cur) return;
  if (pressed & K_CW) tryRotate(g, 1);
  if (pressed & K_CCW) tryRotate(g, -1);
  if ((pressed & K_180) && g.cfg.rot180) tryRotate(g, 2);
  // Seitwärts mit DAS/ARR
  const L = (input & K_LEFT) !== 0, R = (input & K_RIGHT) !== 0;
  let dir: -1 | 0 | 1 = g.inp.dir;
  if (pressed & K_LEFT) dir = -1;
  if (pressed & K_RIGHT) dir = 1;
  if (!L && !R) dir = 0;
  else if (dir === -1 && !L) dir = R ? 1 : 0;
  else if (dir === 1 && !R) dir = L ? -1 : 0;
  if (dir !== g.inp.dir) {
    g.inp.dir = dir; g.inp.das = 0; g.inp.arr = 0;
    if (dir) tryMove(g, dir);
  } else if (dir) {
    g.inp.das += dt;
    if (g.inp.das >= H.das) {
      if (H.arr <= 0) { while (tryMove(g, dir)) { /* bis zur Wand */ } }
      else { g.inp.arr += dt; while (g.inp.arr >= H.arr) { g.inp.arr -= H.arr; if (!tryMove(g, dir)) break; } }
    }
  }
  if (!g.cur) return;
  // Hard Drop
  if (pressed & K_HARD) { hardDrop(g); return; }
  // Schwerkraft
  if (!g.cfg.noGravity || (input & K_DOWN)) {
    let cells = g.cfg.noGravity ? 0 : 1 / secPerRow(g.level) / 1000 * dt;
    const soft = (input & K_DOWN) !== 0;
    if (soft) cells = H.sdf >= 40 ? 99 : Math.max(cells * H.sdf, g.cfg.noGravity ? 0.25 : cells * H.sdf);
    g.gAcc += cells;
    let moved = 0;
    while (g.gAcc >= 1 && g.cur && fits(g, g.cur.type, g.cur.rot, g.cur.x, g.cur.y + 1)) {
      g.cur.y++; g.gAcc -= 1; moved++; g.lastRot = false;
      if (soft) g.score += 1;
      if (g.cur.y > g.lowest) { g.lowest = g.cur.y; g.resets = 0; }
    }
    if (g.gAcc >= 1) g.gAcc = 0;
    void moved;
  }
  if (!g.cur) return;
  // Verriegelung
  if (ground(g)) { g.lockT += dt; if (g.lockT >= H.lock) lock(g); }
  else g.lockT = 0;
  // Überleben: Müll steigt
  if (g.cfg.mode === 'ueberleben' && g.t >= g.nextRise && g.status === 'play') {
    g.nextRise += Math.max(2500, 8000 - g.t / 40);
    insertGarbage(g, 1);
  }
}

const bitCount = (n: number) => { let c = 0; while (n) { n &= n - 1; c++; } return c; };

// ───────── Hilfen für Anzeige und KI ─────────

export function snapshotRows(g: Game): number { return g.R; }
export const visibleRow = (y: number) => y - BUFFER;

/** Höhe jeder Spalte (Anzahl Zeilen von unten bis zum obersten Block). */
export function heights(g: Game): number[] {
  const out = new Array<number>(g.W).fill(0);
  for (let x = 0; x < g.W; x++) for (let y = 0; y < g.R; y++) if (g.board[y * g.W + x]) { out[x] = g.R - y; break; }
  return out;
}
export function clone(g: Game): Game {
  return { ...g, board: g.board.slice(), cur: g.cur ? { ...g.cur } : null, queue: g.queue.slice(), bag: g.bag.slice(), inp: { ...g.inp }, incoming: g.incoming.slice(), events: [], rng: g.rng };
}

/** Kürzeste Tastenfolge (Zahl der Tastendrücke), um den Stein (type) aus der Startlage nach (x, rot) zu bringen und fallen zu lassen. */
export function minimalInputs(g: Game, type: number, tx: number, trot: number): number {
  const def = PIECES[type - 1];
  const sx = Math.floor((g.W - def.size) / 2), sy = BUFFER - 1;
  type N = { x: number; rot: number; k: number };
  const seen = new Set<string>([`${sx},0`]);
  const q: N[] = [{ x: sx, rot: 0, k: 0 }];
  for (let i = 0; i < q.length; i++) {
    const n = q[i];
    if (n.x === tx && n.rot === (trot & 3)) return n.k + 1; // + Hard Drop
    const nexts: N[] = [];
    if (fits(g, type, n.rot, n.x - 1, sy)) nexts.push({ x: n.x - 1, rot: n.rot, k: n.k + 1 });
    if (fits(g, type, n.rot, n.x + 1, sy)) nexts.push({ x: n.x + 1, rot: n.rot, k: n.k + 1 });
    // DAS: bis zur Wand
    let lx = n.x; while (fits(g, type, n.rot, lx - 1, sy)) lx--;
    if (lx !== n.x) nexts.push({ x: lx, rot: n.rot, k: n.k + 1 });
    let rx = n.x; while (fits(g, type, n.rot, rx + 1, sy)) rx++;
    if (rx !== n.x) nexts.push({ x: rx, rot: n.rot, k: n.k + 1 });
    for (const dr of [1, 3, 2]) {
      const r2 = (n.rot + dr) & 3;
      // einfache Drehung ohne Tritte (Spitzenlage ist frei)
      if (fits(g, type, r2, n.x, sy)) nexts.push({ x: n.x, rot: r2, k: n.k + 1 });
      else for (const dx of [-1, 1, -2, 2]) if (fits(g, type, r2, n.x + dx, sy)) { nexts.push({ x: n.x + dx, rot: r2, k: n.k + 1 }); break; }
    }
    for (const m of nexts) { const key = `${m.x},${m.rot}`; if (!seen.has(key)) { seen.add(key); q.push(m); } }
  }
  return 99;
}

/** Tiefe Kopie (für Suche und Replays). */
export function cloneGame(g: Game): Game {
  return { ...g, board: g.board.slice(), cur: g.cur ? { ...g.cur } : null, queue: g.queue.slice(), bag: g.bag.slice(), inp: { ...g.inp }, incoming: g.incoming.slice(), events: [] };
}
