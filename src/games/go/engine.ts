// Go: Brett, Gruppen, Freiheiten, Schlagen, Ko, Selbstmord, Wertung (Fläche und Gebiet), Vorgabe.

export const EMPTY = 0, BLACK = 1, WHITE = 2;
export type Color = 1 | 2;
export const other = (c: Color): Color => (c === BLACK ? WHITE : BLACK);

export type KoRule = 'einfach' | 'superko';
export type Scoring = 'flaeche' | 'gebiet';

export interface Rules {
  n: number;
  komi: number;
  scoring: Scoring;
  ko: KoRule;
  suicide: boolean;
  torus: boolean;
  /** Atari-Go: Wer zuerst Steine fängt, gewinnt */
  atari: boolean;
}

export const DEFAULT_RULES: Rules = { n: 9, komi: 6.5, scoring: 'gebiet', ko: 'einfach', suicide: false, torus: false, atari: false };

const nbCache = new Map<string, Int16Array[]>();
export function neighbors(n: number, torus: boolean): Int16Array[] {
  const key = `${n}|${torus}`;
  const hit = nbCache.get(key);
  if (hit) return hit;
  const out: Int16Array[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l: number[] = [];
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      let nx = x + dx, ny = y + dy;
      if (torus) { nx = (nx + n) % n; ny = (ny + n) % n; }
      else if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const i = ny * n + nx;
      if (i !== y * n + x && !l.includes(i)) l.push(i);
    }
    out.push(Int16Array.from(l));
  }
  nbCache.set(key, out);
  return out;
}

// Zobrist-Zufallszahlen (feste Folge, damit Stellungen vergleichbar bleiben)
const zob = (() => {
  let s = 0x9e3779b9;
  const r = () => { s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d); s = Math.imul(s ^ (s >>> 12), 0x297a2d39); s ^= s >>> 15; return s >>> 0; };
  const t: number[][] = [];
  for (let i = 0; i < 25 * 25; i++) t.push([0, r(), r()]);
  return t;
})();

export interface GoState {
  rules: Rules;
  board: Uint8Array;
  turn: Color;
  /** Verbotener Punkt wegen Ko (−1 = keiner) */
  ko: number;
  /** Gefangene: caps[0] = von Schwarz gefangene weiße Steine, caps[1] = von Weiß gefangene schwarze */
  caps: [number, number];
  passes: number;
  last: number;
  moveNo: number;
  hash: number;
  seen: Set<number>;
  /** Atari-Go: Sieger sobald jemand fängt */
  winner: Color | 0;
}

export function newState(rules: Rules): GoState {
  const board = new Uint8Array(rules.n * rules.n);
  return { rules, board, turn: BLACK, ko: -1, caps: [0, 0], passes: 0, last: -1, moveNo: 0, hash: 0, seen: new Set([0]), winner: 0 };
}

export function cloneState(s: GoState): GoState {
  return { ...s, board: s.board.slice(), caps: [s.caps[0], s.caps[1]], seen: new Set(s.seen) };
}

/** Gruppe und Freiheiten eines Steins. */
export function groupAt(board: Uint8Array, nb: Int16Array[], start: number): { stones: number[]; libs: number[] } {
  const color = board[start];
  const stones = [start];
  const libs: number[] = [];
  const seen = new Set<number>([start]);
  const lseen = new Set<number>();
  for (let k = 0; k < stones.length; k++) {
    for (const j of nb[stones[k]]) {
      const v = board[j];
      if (v === EMPTY) { if (!lseen.has(j)) { lseen.add(j); libs.push(j); } }
      else if (v === color && !seen.has(j)) { seen.add(j); stones.push(j); }
    }
  }
  return { stones, libs };
}

export type PlayResult = { ok: true; state: GoState; captured: number[] } | { ok: false; reason: string };

/** Zug ausführen (Kopie). idx = −1: Pass. */
export function play(s: GoState, idx: number, color: Color = s.turn): PlayResult {
  const r = s.rules;
  const nb = neighbors(r.n, r.torus);
  if (s.winner) return { ok: false, reason: 'Die Partie ist beendet.' };
  const t = cloneState(s);
  if (idx < 0) {
    t.passes++; t.turn = other(color); t.ko = -1; t.last = -1; t.moveNo++;
    return { ok: true, state: t, captured: [] };
  }
  if (idx >= t.board.length || t.board[idx] !== EMPTY) return { ok: false, reason: 'Dort liegt schon ein Stein.' };
  if (idx === s.ko) return { ok: false, reason: 'Ko: Du darfst nicht sofort zurückschlagen.' };
  t.board[idx] = color;
  let h = t.hash ^ zob[idx][color];
  const captured: number[] = [];
  for (const j of nb[idx]) {
    if (t.board[j] === other(color)) {
      const g = groupAt(t.board, nb, j);
      if (g.libs.length === 0) { for (const st of g.stones) if (t.board[st]) { captured.push(st); h ^= zob[st][t.board[st]]; t.board[st] = EMPTY; } }
    }
  }
  const mine = groupAt(t.board, nb, idx);
  if (mine.libs.length === 0) {
    if (!r.suicide) return { ok: false, reason: 'Selbstmord ist verboten: Der Stein hätte keine Freiheit.' };
    for (const st of mine.stones) { captured.push(st); h ^= zob[st][t.board[st]]; t.board[st] = EMPTY; }
  }
  if (r.ko === 'superko' && t.seen.has(h >>> 0)) return { ok: false, reason: 'Superko: Diese Stellung gab es schon.' };
  t.hash = h >>> 0;
  t.seen.add(t.hash);
  if (color === BLACK) t.caps[0] += captured.length; else t.caps[1] += captured.length;
  // einfaches Ko
  t.ko = -1;
  if (r.ko === 'einfach' && captured.length === 1 && mine.stones.length === 1 && mine.libs.length === 1 && t.board[idx] === color) t.ko = captured[0];
  t.turn = other(color); t.passes = 0; t.last = idx; t.moveNo++;
  if (r.atari && captured.length) t.winner = color;
  return { ok: true, state: t, captured };
}

export function legalMovesGo(s: GoState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.board.length; i++) if (s.board[i] === EMPTY && play(s, i).ok) out.push(i);
  return out;
}

// ───────── Wertung ─────────

export interface Territory { black: number[]; white: number[]; neutral: number[] }

/** Gebiete leerer Zonen: nur an eine Farbe grenzend. `dead`: tote Steine (zählen als leer). */
export function territoryOf(s: GoState, dead: ReadonlySet<number> = new Set()): Territory {
  const { n, torus } = s.rules;
  const nb = neighbors(n, torus);
  const b = new Uint8Array(s.board);
  for (const d of dead) b[d] = EMPTY;
  const seen = new Uint8Array(b.length);
  const res: Territory = { black: [], white: [], neutral: [] };
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== EMPTY || seen[i]) continue;
    const region = [i]; seen[i] = 1;
    let touchB = false, touchW = false;
    for (let k = 0; k < region.length; k++) for (const j of nb[region[k]]) {
      if (b[j] === EMPTY) { if (!seen[j]) { seen[j] = 1; region.push(j); } }
      else if (b[j] === BLACK) touchB = true; else touchW = true;
    }
    (touchB && !touchW ? res.black : touchW && !touchB ? res.white : res.neutral).push(...region);
  }
  return res;
}

export interface Score { black: number; white: number; diff: number; winner: Color; text: string }

export function score(s: GoState, dead: ReadonlySet<number> = new Set()): Score {
  const t = territoryOf(s, dead);
  const sb = [...s.board].filter((v, i) => v === BLACK && !dead.has(i)).length;
  const sw = [...s.board].filter((v, i) => v === WHITE && !dead.has(i)).length;
  const deadB = [...dead].filter((i) => s.board[i] === BLACK).length, deadW = [...dead].filter((i) => s.board[i] === WHITE).length;
  let black: number, white: number;
  if (s.rules.scoring === 'flaeche') { black = sb + t.black.length; white = sw + t.white.length + s.rules.komi; }
  else { black = t.black.length + s.caps[0] + deadW; white = t.white.length + s.caps[1] + deadB + s.rules.komi; }
  const diff = black - white;
  const winner: Color = diff > 0 ? BLACK : WHITE;
  return { black, white, diff, winner, text: `${winner === BLACK ? 'Schwarz' : 'Weiß'} gewinnt mit ${Math.abs(diff)} Punkt${Math.abs(diff) === 1 ? '' : 'en'}` };
}

/** Standard-Vorgabepunkte (Schwarz setzt vorweg). */
export function handicapPoints(n: number, count: number): number[] {
  if (count < 2) return [];
  const e = n === 9 ? 2 : n === 13 ? 3 : n >= 19 ? 3 : Math.max(1, Math.floor(n / 4));
  const m = Math.floor(n / 2);
  const f = n - 1 - e;
  const P = (x: number, y: number) => y * n + x;
  const corners = { br: P(f, f), tl: P(e, e), tr: P(f, e), bl: P(e, f), l: P(e, m), r: P(f, m), t: P(m, e), b: P(m, f), c: P(m, m) };
  const sets: Record<number, number[]> = {
    2: [corners.tr, corners.bl], 3: [corners.tr, corners.bl, corners.br], 4: [corners.tr, corners.bl, corners.br, corners.tl],
    5: [corners.tr, corners.bl, corners.br, corners.tl, corners.c], 6: [corners.tr, corners.bl, corners.br, corners.tl, corners.l, corners.r],
    7: [corners.tr, corners.bl, corners.br, corners.tl, corners.l, corners.r, corners.c], 8: [corners.tr, corners.bl, corners.br, corners.tl, corners.l, corners.r, corners.t, corners.b],
    9: [corners.tr, corners.bl, corners.br, corners.tl, corners.l, corners.r, corners.t, corners.b, corners.c],
  };
  return sets[Math.min(9, count)] ?? [];
}

/** Steine setzen ohne Regeln (Vorgabe, Aufgaben). */
export function setStones(s: GoState, black: number[], white: number[], turn: Color = BLACK): GoState {
  const t = cloneState(s);
  for (const i of black) t.board[i] = BLACK;
  for (const i of white) t.board[i] = WHITE;
  t.turn = turn;
  let h = 0;
  for (let i = 0; i < t.board.length; i++) if (t.board[i]) h ^= zob[i][t.board[i]];
  t.hash = h >>> 0; t.seen = new Set([t.hash]);
  return t;
}

export const coord = (n: number, i: number) => {
  const x = i % n, y = Math.floor(i / n);
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  return `${letters[x]}${n - y}`;
};
export const parseCoord = (n: number, s: string): number => {
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  const x = letters.indexOf(s[0].toUpperCase()), y = n - parseInt(s.slice(1), 10);
  return x < 0 || y < 0 || y >= n || x >= n ? -1 : y * n + x;
};

// ───────── SGF ─────────

const sgfChar = (v: number) => String.fromCharCode(97 + v);
export function toSgf(rules: Rules, moves: { idx: number; color: Color }[], handicap: number[] = []): string {
  let s = `(;GM[1]FF[4]SZ[${rules.n}]KM[${rules.komi}]RU[${rules.scoring === 'flaeche' ? 'Chinese' : 'Japanese'}]AP[Spielhalle]`;
  if (handicap.length) s += `HA[${handicap.length}]AB${handicap.map((i) => `[${sgfChar(i % rules.n)}${sgfChar(Math.floor(i / rules.n))}]`).join('')}`;
  for (const m of moves) s += `;${m.color === BLACK ? 'B' : 'W'}[${m.idx < 0 ? '' : sgfChar(m.idx % rules.n) + sgfChar(Math.floor(m.idx / rules.n))}]`;
  return s + ')';
}
export function parseSgf(text: string): { n: number; komi: number; handicap: number[]; moves: { idx: number; color: Color }[] } | null {
  const sz = /SZ\[(\d+)\]/.exec(text);
  const n = sz ? +sz[1] : 19;
  if (n < 5 || n > 25) return null;
  const km = /KM\[(-?[\d.]+)\]/.exec(text);
  const handicap: number[] = [];
  const ab = /AB((?:\[[a-z]{2}\])+)/.exec(text);
  if (ab) for (const m of ab[1].matchAll(/\[([a-z])([a-z])\]/g)) handicap.push((m[2].charCodeAt(0) - 97) * n + (m[1].charCodeAt(0) - 97));
  const moves: { idx: number; color: Color }[] = [];
  for (const m of text.matchAll(/;([BW])\[([a-z]{2})?\]/g)) {
    const color: Color = m[1] === 'B' ? BLACK : WHITE;
    moves.push({ idx: m[2] ? (m[2].charCodeAt(1) - 97) * n + (m[2].charCodeAt(0) - 97) : -1, color });
  }
  return { n, komi: km ? +km[1] : 6.5, handicap, moves };
}
