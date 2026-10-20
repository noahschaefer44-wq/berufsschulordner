// Go-KI: Heuristik für leichte Stufen, Monte-Carlo-Baumsuche (UCT) für die starken, plus Gebietsschätzung.
import { BLACK, EMPTY, type Color, type GoState, WHITE, neighbors, other } from './engine';
import { type Rng, mulberry32 } from '../shared/rng';

interface Fast {
  n: number;
  nb: Int16Array[];
  board: Uint8Array;
  ko: number;
  turn: Color;
  passes: number;
}

export const toFast = (s: GoState): Fast => ({ n: s.rules.n, nb: neighbors(s.rules.n, s.rules.torus), board: s.board.slice(), ko: s.ko, turn: s.turn, passes: s.passes });
const copyFast = (f: Fast, into?: Fast): Fast => {
  if (!into) return { ...f, board: f.board.slice() };
  into.board.set(f.board); into.ko = f.ko; into.turn = f.turn; into.passes = f.passes;
  return into;
};

const markS = new Int32Array(625), markL = new Int32Array(625);
let stamp = 1;

/** Füllt `out` mit den Steinen der Gruppe, gibt die Zahl der Freiheiten zurück. */
function flood(f: Fast, start: number, out: number[]): number {
  stamp++;
  out.length = 0;
  out.push(start); markS[start] = stamp;
  const c = f.board[start];
  let libs = 0;
  for (let k = 0; k < out.length; k++) {
    for (const j of f.nb[out[k]]) {
      const v = f.board[j];
      if (v === EMPTY) { if (markL[j] !== stamp) { markL[j] = stamp; libs++; } }
      else if (v === c && markS[j] !== stamp) { markS[j] = stamp; out.push(j); }
    }
  }
  return libs;
}

const gA: number[] = [], gB: number[] = [];

/** Zug auf Schnellbrett. Selbstmord verboten, einfaches Ko. */
function fplay(f: Fast, idx: number): boolean {
  if (idx < 0) { f.passes++; f.turn = other(f.turn); f.ko = -1; return true; }
  if (f.board[idx] || idx === f.ko) return false;
  const c = f.turn, o = other(c);
  f.board[idx] = c;
  let cap = 0, capIdx = -1;
  for (const j of f.nb[idx]) {
    if (f.board[j] === o && flood(f, j, gA) === 0) { cap += gA.length; capIdx = gA.length === 1 ? gA[0] : -1; for (const st of gA) f.board[st] = EMPTY; }
  }
  const libs = flood(f, idx, gB);
  if (libs === 0) { f.board[idx] = EMPTY; return false; }
  f.ko = cap === 1 && gB.length === 1 && libs === 1 ? capIdx : -1;
  f.turn = o; f.passes = 0;
  return true;
}

/** Echtes Auge der Farbe c? (Vereinfachte Regel: alle Nachbarn eigen, höchstens eine feindliche Diagonale, am Rand keine) */
function isOwnEye(f: Fast, i: number, c: Color, torus: boolean): boolean {
  for (const j of f.nb[i]) if (f.board[j] !== c) return false;
  const n = f.n, x = i % n, y = (i / n) | 0;
  let bad = 0, off = 0;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    let nx = x + dx, ny = y + dy;
    if (torus) { nx = (nx + n) % n; ny = (ny + n) % n; }
    else if (nx < 0 || ny < 0 || nx >= n || ny >= n) { off++; continue; }
    if (f.board[ny * n + nx] === other(c)) bad++;
  }
  return off > 0 ? bad === 0 : bad < 2;
}

// ───────── Playout ─────────

const buf: number[] = [];
function localMove(f: Fast, last: number, rnd: Rng): number {
  if (last < 0) return -1;
  const me = f.turn;
  // Gegner in Atari in der Nähe schlagen, eigene Gruppe in Atari retten
  const cands: number[] = [];
  for (const j of f.nb[last]) {
    const v = f.board[j];
    if (v === EMPTY) continue;
    const libs = flood(f, j, buf);
    if (libs === 1) {
      // Freiheit finden
      for (const s of buf) for (const q of f.nb[s]) if (f.board[q] === EMPTY) { cands.push(q); break; }
    }
    void me;
  }
  if (!cands.length) return -1;
  return cands[(rnd() * cands.length) | 0];
}

function randomLegal(f: Fast, rnd: Rng, torus: boolean): number {
  const len = f.board.length;
  const me = f.turn;
  const start = (rnd() * len) | 0;
  for (let k = 0; k < len; k++) {
    const i = (start + k) % len;
    if (f.board[i] !== EMPTY || i === f.ko) continue;
    if (isOwnEye(f, i, me, torus)) continue;
    return i;
  }
  return -1;
}

/** Fläche bei Spielende: Steine plus allseitig umschlossene Leerräume. Rückgabe: Schwarz − Weiß. */
function areaDiff(f: Fast, own?: Float32Array, weight = 1): number {
  const len = f.board.length;
  let b = 0, w = 0;
  const seen = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const v = f.board[i];
    if (v === BLACK) { b++; if (own) own[i] += weight; } else if (v === WHITE) { w++; if (own) own[i] -= weight; }
    else if (!seen[i]) {
      const reg = [i]; seen[i] = 1; let tb = false, tw = false;
      for (let k = 0; k < reg.length; k++) for (const j of f.nb[reg[k]]) {
        const u = f.board[j];
        if (u === EMPTY) { if (!seen[j]) { seen[j] = 1; reg.push(j); } } else if (u === BLACK) tb = true; else tw = true;
      }
      if (tb && !tw) { b += reg.length; if (own) for (const r of reg) own[r] += weight; }
      else if (tw && !tb) { w += reg.length; if (own) for (const r of reg) own[r] -= weight; }
    }
  }
  return b - w;
}

function playout(f: Fast, rnd: Rng, komi: number, torus: boolean, own?: Float32Array): number {
  const maxMoves = f.board.length * 2;
  let last = -1;
  for (let m = 0; m < maxMoves && f.passes < 2; m++) {
    let mv = -1;
    if (rnd() < 0.6) {
      const c = localMove(f, last, rnd);
      if (c >= 0 && !isOwnEye(f, c, f.turn, torus)) mv = c;
    }
    if (mv < 0 || f.board[mv] !== EMPTY) mv = randomLegal(f, rnd, torus);
    if (mv >= 0 && !fplay(f, mv)) { mv = randomLegal(f, rnd, torus); if (mv >= 0 && !fplay(f, mv)) mv = -1; }
    if (mv < 0) { fplay(f, -1); last = -1; } else last = mv;
  }
  return areaDiff(f, own) - komi;
}

// ───────── Heuristik (leichte Stufen) ─────────

export function heuristicMove(s: GoState, level: number, rnd: Rng): number {
  const f = toFast(s);
  const torus = s.rules.torus;
  const me = f.turn;
  const legal: number[] = [];
  const tmp = copyFast(f);
  for (let i = 0; i < f.board.length; i++) {
    if (f.board[i] !== EMPTY) continue;
    copyFast(f, tmp);
    if (!fplay(tmp, i)) continue;
    legal.push(i);
  }
  if (!legal.length) return -1;
  if (level >= 2) {
    // Schlagen > Retten > Ataris setzen > sinnvolle Eröffnung
    let best = -1, bestV = -1e9;
    for (const i of legal) {
      copyFast(f, tmp);
      fplay(tmp, i);
      let v = rnd() * 2;
      const captured = f.board.reduce((a, x) => a + (x === other(me) ? 1 : 0), 0) - tmp.board.reduce((a, x) => a + (x === other(me) ? 1 : 0), 0);
      v += captured * 12;
      for (const j of f.nb[i]) {
        if (tmp.board[j] === other(me)) { const l = flood(tmp, j, gA); if (l === 1) v += 6 + gA.length; }
        if (f.board[j] === me) { const lb = flood(f, j, gA); if (lb === 1) v += 8 + gA.length; }
      }
      const g2 = flood(tmp, i, gB); if (g2 === 1) v -= 9;
      if (isOwnEye(f, i, me, torus)) v -= 20;
      const n = f.n, x = i % n, y = (i / n) | 0, e = Math.min(x, y, n - 1 - x, n - 1 - y);
      if (!torus) v += e === 2 ? 1.2 : e === 3 ? 1 : e === 0 ? -1.5 : 0;
      for (const j of f.nb[i]) if (f.board[j] === other(me)) v += 0.6;
      if (v > bestV) { bestV = v; best = i; }
    }
    if (best >= 0) return best;
  }
  const ok = legal.filter((i) => !isOwnEye(f, i, me, torus));
  if (!ok.length) return -1;
  return ok[(rnd() * ok.length) | 0];
}

// ───────── UCT ─────────

const EXPL = 0.5;
interface Node { move: number; parent: Node | null; kids: Node[]; untried: number[]; w: number; v: number; mover: Color }

function candidates(f: Fast, torus: boolean, last: number): number[] {
  const out: number[] = [];
  const n = f.n;
  for (let i = 0; i < f.board.length; i++) {
    if (f.board[i] !== EMPTY || i === f.ko) continue;
    if (isOwnEye(f, i, f.turn, torus)) continue;
    out.push(i);
  }
  // Vorrang: Nähe zum letzten Zug, Atari, Linie 3–4. Beste ans Ende (pop).
  const lx = last >= 0 ? last % n : -9, ly = last >= 0 ? (last / n) | 0 : -9;
  const pr = (i: number) => {
    const x = i % n, y = (i / n) | 0;
    let p = 0;
    if (last >= 0) { const d = Math.abs(x - lx) + Math.abs(y - ly); p += d <= 2 ? 4 - d : 0; }
    const e = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (!torus) p += e === 2 ? 1.5 : e === 3 ? 1.2 : e === 0 ? -2 : 0;
    for (const j of f.nb[i]) {
      const v = f.board[j];
      if (v !== EMPTY && flood(f, j, buf) === 1) p += 3;
    }
    return p;
  };
  const scored = out.map((i) => [i, pr(i)] as const).sort((a, b) => a[1] - b[1]);
  return scored.map((a) => a[0]);
}

export interface AiResult { move: number; winrate: number; playouts: number }

/** Beste Zugwahl für die Seite am Zug. winrate = Gewinnchance der Seite am Zug (0–1). */
export function mctsMove(s: GoState, ms: number, seed = 1, maxPlayouts = 1e9): AiResult {
  const rnd = mulberry32(seed);
  const root0 = toFast(s);
  const torus = s.rules.torus;
  const komi = s.rules.komi;
  const rootColor = root0.turn;
  const root: Node = { move: -2, parent: null, kids: [], untried: [...candidates(root0, torus, s.last), -1], w: 0, v: 0, mover: other(rootColor) };
  // Pass nur zuletzt probieren
  root.untried = [-1, ...root.untried.filter((x) => x !== -1)];
  const work = copyFast(root0);
  const t0 = performance.now();
  let it = 0;
  while (it < maxPlayouts && (it & 15 ? true : performance.now() - t0 < ms)) {
    it++;
    copyFast(root0, work);
    let node = root;
    let last = s.last;
    // Auswahl
    while (!node.untried.length && node.kids.length && work.passes < 2) {
      const lnV = Math.log(node.v + 1);
      let best: Node | null = null, bv = -1e9;
      for (const k of node.kids) {
        const u = k.w / (k.v || 1) + EXPL * Math.sqrt(lnV / (k.v || 1));
        if (u > bv) { bv = u; best = k; }
      }
      node = best!;
      fplay(work, node.move);
      last = node.move;
    }
    // Erweiterung
    if (work.passes < 2 && node.untried.length) {
      let mv = node.untried.pop()!;
      while (!fplay(work, mv)) { if (!node.untried.length) { mv = -3; break; } mv = node.untried.pop()!; }
      if (mv !== -3) {
        const mover = other(work.turn);
        const kid: Node = { move: mv, parent: node, kids: [], untried: [], w: 0, v: 0, mover };
        if (work.passes < 2) kid.untried = [-1, ...candidates(work, torus, mv).filter((x) => x !== -1)];
        node.kids.push(kid);
        node = kid; last = mv;
      }
    }
    const diff = playout(work, rnd, komi, torus);
    void last;
    // Rückpropagation (diff aus Sicht Schwarz)
    for (let nd: Node | null = node; nd; nd = nd.parent) {
      nd.v++;
      const win = diff > 0 ? BLACK : WHITE;
      if (nd.mover === win) nd.w++;
    }
  }
  // Wahl: meistbesuchter Zug. Pass nur, wenn wirklich nichts Besseres.
  let best: Node | null = null;
  for (const k of root.kids) if (!best || k.v > best.v || (k.v === best.v && k.w > best.w)) best = k;
  if (!best) return { move: -1, winrate: 0.5, playouts: it };
  // Pass vermeiden, solange andere Züge ähnlich gut sind
  const nonPass = root.kids.filter((k) => k.move >= 0).sort((a, b) => b.v - a.v)[0];
  if (best.move < 0 && nonPass && nonPass.w / (nonPass.v || 1) >= best.w / (best.v || 1) - 0.02 && root0.board.some((x) => x === EMPTY) && (s.passes === 0)) best = nonPass;
  return { move: best.move, winrate: best.w / (best.v || 1), playouts: it };
}

export const LEVELS: { id: number; name: string; ms: number; info: string }[] = [
  { id: 1, name: 'Anfänger', ms: 0, info: 'Zieht fast zufällig, schlägt gelegentlich.' },
  { id: 2, name: 'Schüler', ms: 0, info: 'Schlägt, rettet und setzt Ataris. Kennt keine Pläne.' },
  { id: 3, name: 'Vereinsspieler', ms: 700, info: 'Sucht kurz voraus (Monte-Carlo).' },
  { id: 4, name: 'Fortgeschritten', ms: 2000, info: 'Sucht deutlich tiefer.' },
  { id: 5, name: 'Dan-Anwärter', ms: 5000, info: 'Viele Simulationen pro Zug.' },
  { id: 6, name: 'Meister', ms: 11000, info: 'Das Maximum dieser KI – braucht Geduld.' },
];

/** Leichte Stufen: Passen, wenn das Brett voll genug ist und der Gegner passte (oder die Partie ewig dauert). */
function lowValueEndgame(s: GoState, level: number): boolean {
  const filled = s.board.reduce((a, x) => a + (x ? 1 : 0), 0);
  const total = s.board.length;
  if (s.moveNo > total * 2.2) return true;
  if (filled < total * 0.3) return false;
  if (s.passes > 0) { const e = estimate(s, level === 1 ? 20 : 50, s.moveNo + 11); const mine = s.turn === BLACK ? e.winrate : 1 - e.winrate; return mine > 0.5; }
  // Selbst früh passen, wenn praktisch alles entschieden ist
  if (filled > total * 0.55 && level >= 2) { const e = estimate(s, 24, s.moveNo + 13); const mine = s.turn === BLACK ? e.winrate : 1 - e.winrate; return mine > 0.97 && s.moveNo % 3 === 0; }
  return false;
}

/** Atari-Go: Wer zuerst fängt, gewinnt – nur Taktik zählt. */
export function atariGoMove(s: GoState, level: number, rnd: Rng): number {
  const f = toFast(s);
  const me = f.turn, opp = other(me);
  const tmp = copyFast(f), tmp2 = copyFast(f);
  const count = (b: Uint8Array, c: number) => { let k = 0; for (let i = 0; i < b.length; i++) if (b[i] === c) k++; return k; };
  let best = -1, bv = -1e9;
  const noise = level <= 1 ? 14 : level === 2 ? 6 : level === 3 ? 3 : 1;
  for (let i = 0; i < f.board.length; i++) {
    if (f.board[i] !== EMPTY) continue;
    copyFast(f, tmp);
    if (!fplay(tmp, i)) continue;
    let v = rnd() * noise;
    if (count(tmp.board, opp) < count(f.board, opp)) return i;
    // Gegner darf nach meinem Zug nicht fangen
    let danger = false, atariMade = 0;
    const mine = count(tmp.board, me);
    for (let j = 0; j < tmp.board.length && !danger; j++) {
      if (tmp.board[j] !== EMPTY) continue;
      copyFast(tmp, tmp2);
      if (!fplay(tmp2, j)) continue;
      if (count(tmp2.board, me) < mine) danger = true;
    }
    if (danger) v -= 100;
    for (let j = 0; j < tmp.board.length; j++) {
      if (tmp.board[j] === opp && flood(tmp, j, gA) === 1) atariMade++;
      if (tmp.board[j] === me && flood(tmp, j, gA) === 1) v -= 30;
    }
    v += atariMade * 3;
    for (const q of f.nb[i]) if (f.board[q] === opp) v += 1.2;
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

export function aiMove(s: GoState, level: number, seed: number): AiResult {
  if (s.rules.atari) return { move: atariGoMove(s, level, mulberry32(seed)), winrate: 0.5, playouts: 0 };
  const lv = LEVELS.find((l) => l.id === level) ?? LEVELS[2];
  if (lv.ms === 0) {
    const rnd = mulberry32(seed);
    if (level === 1 && rnd() < 0.35) {
      const f = toFast(s);
      const opts: number[] = [];
      for (let i = 0; i < f.board.length; i++) if (f.board[i] === EMPTY && !isOwnEye(f, i, f.turn, s.rules.torus)) opts.push(i);
      const tmp = copyFast(f);
      while (opts.length) {
        const k = (rnd() * opts.length) | 0;
        copyFast(f, tmp);
        if (fplay(tmp, opts[k])) return { move: opts[k], winrate: 0.5, playouts: 0 };
        opts.splice(k, 1);
      }
      return { move: -1, winrate: 0.5, playouts: 0 };
    }
    const mv = heuristicMove(s, level, rnd);
    if (mv >= 0 && lowValueEndgame(s, level)) return { move: -1, winrate: 0.5, playouts: 0 };
    return { move: mv, winrate: 0.5, playouts: 0 };
  }
  // Große Bretter: Zeit etwas strecken
  const scale = s.rules.n >= 19 ? 1.6 : s.rules.n >= 13 ? 1.25 : 1;
  const filled = s.board.reduce((a, x) => a + (x ? 1 : 0), 0);
  // Gegner passte und wir gewinnen klar → passen (Spielende)
  const r = mctsMove(s, lv.ms * scale, seed);
  if (s.passes > 0 && filled > s.board.length * 0.25) {
    // Prüfe, ob Passen gewinnt
    const f = toFast(s);
    copyFast(f);
    const rnd = mulberry32(seed + 7);
    let wins = 0, tot = 0;
    for (let k = 0; k < 60; k++) { const g = copyFast(f); fplay(g, -1); const d = playout(g, rnd, s.rules.komi, s.rules.torus); tot++; if ((d > 0 ? BLACK : WHITE) === f.turn) wins++; }
    if (wins / tot > 0.62 && wins / tot > r.winrate - 0.02) return { move: -1, winrate: wins / tot, playouts: r.playouts };
  }
  return r;
}

export interface Estimate { own: Float32Array; winrate: number; lead: number; playouts: number }

/** Monte-Carlo-Schätzung: Besitz je Punkt −1 (Weiß) … +1 (Schwarz) und Gewinnchance von Schwarz. */
export function estimate(s: GoState, playouts: number, seed = 5): Estimate {
  const f = toFast(s);
  const rnd = mulberry32(seed);
  const own = new Float32Array(f.board.length);
  let bw = 0, lead = 0;
  for (let k = 0; k < playouts; k++) {
    const g = copyFast(f);
    const d = playout(g, rnd, s.rules.komi, s.rules.torus, own);
    if (d > 0) bw++;
    lead += d;
  }
  for (let i = 0; i < own.length; i++) own[i] /= playouts;
  return { own, winrate: bw / playouts, lead: lead / playouts, playouts };
}

/** Tote-Steine-Vorschlag: Steine, deren Besitz in den Playouts überwiegend beim Gegner liegt. */
export function suggestDead(s: GoState, playouts = 160, seed = 9): number[] {
  const e = estimate(s, playouts, seed);
  const dead: number[] = [];
  for (let i = 0; i < s.board.length; i++) {
    const v = s.board[i];
    if (v === BLACK && e.own[i] < -0.6) dead.push(i);
    if (v === WHITE && e.own[i] > 0.6) dead.push(i);
  }
  return dead;
}
