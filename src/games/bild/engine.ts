// Bildrätsel (Nonogramm): Hinweise, Zeilenlöser, Gesamtlöser, Eindeutigkeit, Zufallsbilder.
import { type Rng, rngFrom } from '../shared/rng';

/** Zellzustand beim Lösen: −1 unbekannt, 0 leer (Kreuz), 1 gefüllt */
export type Cell = -1 | 0 | 1;

export interface Nono { w: number; h: number; rows: number[][]; cols: number[][] }

export function lineClue(line: ArrayLike<number>): number[] {
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === 1) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

export function cluesOf(w: number, h: number, bits: ArrayLike<number>): Nono {
  const rows: number[][] = [], cols: number[][] = [];
  for (let y = 0; y < h; y++) rows.push(lineClue(Array.from({ length: w }, (_, x) => bits[y * w + x])));
  for (let x = 0; x < w; x++) cols.push(lineClue(Array.from({ length: h }, (_, y) => bits[y * w + x])));
  return { w, h, rows, cols };
}

/**
 * Löst eine einzelne Linie: gibt die sicher bestimmten Zellen zurück (neues Array) oder null bei Widerspruch.
 * Verfahren: dynamische Programmierung über alle möglichen Anordnungen der Blöcke.
 */
export function solveLine(clue: readonly number[], line: ArrayLike<number>): Int8Array | null {
  const n = line.length;
  const blocks = clue.length === 1 && clue[0] === 0 ? [] : clue;
  const K = blocks.length;
  // A[k][i]: Blöcke 0..k-1 passen in Zellen 0..i-1
  const A: boolean[][] = Array.from({ length: K + 1 }, () => new Array<boolean>(n + 1).fill(false));
  A[0][0] = true;
  for (let i = 1; i <= n; i++) A[0][i] = A[0][i - 1] && line[i - 1] !== 1;
  for (let k = 1; k <= K; k++) {
    const len = blocks[k - 1];
    for (let i = 1; i <= n; i++) {
      let ok = false;
      if (line[i - 1] !== 1 && A[k][i - 1]) ok = true; // Zelle i-1 leer
      if (!ok && i >= len) {
        let fits = true;
        for (let j = i - len; j < i; j++) if (line[j] === 0) { fits = false; break; }
        if (fits) {
          const s = i - len;
          ok = k === 1 ? A[0][s] : s >= 1 && line[s - 1] !== 1 && A[k - 1][s - 1];
        }
      }
      A[k][i] = ok;
    }
  }
  if (!A[K][n]) return null;
  // B[k][i]: Blöcke k..K-1 passen in Zellen i..n-1
  const B: boolean[][] = Array.from({ length: K + 1 }, () => new Array<boolean>(n + 2).fill(false));
  B[K][n] = true;
  for (let i = n - 1; i >= 0; i--) B[K][i] = B[K][i + 1] && line[i] !== 1;
  for (let k = K - 1; k >= 0; k--) {
    const len = blocks[k];
    B[k][n] = false;
    for (let i = n - 1; i >= 0; i--) {
      let ok = false;
      if (line[i] !== 1 && B[k][i + 1]) ok = true;
      if (!ok && i + len <= n) {
        let fits = true;
        for (let j = i; j < i + len; j++) if (line[j] === 0) { fits = false; break; }
        if (fits) {
          const e = i + len;
          ok = k === K - 1 ? B[K][e] : e < n && line[e] !== 1 && B[k + 1][e + 1];
        }
      }
      B[k][i] = ok;
    }
  }
  const canFill = new Uint8Array(n), canEmpty = new Uint8Array(n);
  // Block k beginnt bei s?
  for (let k = 0; k < K; k++) {
    const len = blocks[k];
    for (let s = 0; s + len <= n; s++) {
      let fits = true;
      for (let j = s; j < s + len; j++) if (line[j] === 0) { fits = false; break; }
      if (!fits) continue;
      const left = s === 0 ? k === 0 : line[s - 1] !== 1 && A[k][s - 1];
      const e = s + len;
      const right = e === n ? k === K - 1 : line[e] !== 1 && B[k + 1][e + 1];
      if (left && right) for (let j = s; j < e; j++) canFill[j] = 1;
    }
  }
  // Zelle i leer: es gibt k mit A[k][i] (Blöcke <k links) und B[k][i+1] (Blöcke ≥k rechts)
  for (let i = 0; i < n; i++) {
    if (line[i] === 1) continue;
    for (let k = 0; k <= K; k++) if (A[k][i] && B[k][i + 1]) { canEmpty[i] = 1; break; }
  }
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    if (canFill[i] && !canEmpty[i]) out[i] = 1;
    else if (!canFill[i] && canEmpty[i]) out[i] = 0;
    else if (!canFill[i] && !canEmpty[i]) return null;
    else out[i] = -1;
  }
  return out;
}

export interface SolveInfo { grid: Int8Array; status: 'solved' | 'stuck' | 'contradiction'; passes: number; steps: { line: 'row' | 'col'; index: number; changed: number[] }[] }

/** Löst das Rätsel nur mit Zeilenlogik (ohne Raten). `known` darf Vorwissen enthalten. */
export function solveLogic(p: Nono, known?: ArrayLike<number>, keepSteps = false): SolveInfo {
  const { w, h } = p;
  const g = new Int8Array(w * h).fill(-1);
  if (known) for (let i = 0; i < g.length; i++) g[i] = known[i];
  const steps: SolveInfo['steps'] = [];
  let passes = 0;
  let changed = true;
  while (changed) {
    changed = false; passes++;
    for (let y = 0; y < h; y++) {
      const line = g.slice(y * w, y * w + w);
      const r = solveLine(p.rows[y], line);
      if (!r) return { grid: g, status: 'contradiction', passes, steps };
      const ch: number[] = [];
      for (let x = 0; x < w; x++) if (r[x] !== line[x]) { g[y * w + x] = r[x]; ch.push(y * w + x); }
      if (ch.length) { changed = true; if (keepSteps) steps.push({ line: 'row', index: y, changed: ch }); }
    }
    for (let x = 0; x < w; x++) {
      const line = new Int8Array(h);
      for (let y = 0; y < h; y++) line[y] = g[y * w + x];
      const r = solveLine(p.cols[x], line);
      if (!r) return { grid: g, status: 'contradiction', passes, steps };
      const ch: number[] = [];
      for (let y = 0; y < h; y++) if (r[y] !== line[y]) { g[y * w + x] = r[y]; ch.push(y * w + x); }
      if (ch.length) { changed = true; if (keepSteps) steps.push({ line: 'col', index: x, changed: ch }); }
    }
    if (passes > 200) break;
  }
  return { grid: g, status: g.every((v) => v !== -1) ? 'solved' : 'stuck', passes, steps };
}

/** Anzahl der Lösungen (bis `limit`), mit Raten bei Bedarf. */
export function countSolutions(p: Nono, limit = 2, budget = 20000): number {
  let nodes = 0, count = 0;
  const rec = (known: Int8Array) => {
    if (count >= limit || nodes > budget) return;
    nodes++;
    const r = solveLogic(p, known);
    if (r.status === 'contradiction') return;
    if (r.status === 'solved') { count++; return; }
    const i = r.grid.findIndex((v) => v === -1);
    for (const v of [1, 0]) { const k = r.grid.slice(); k[i] = v; rec(k); if (count >= limit) return; }
  };
  rec(new Int8Array(p.w * p.h).fill(-1));
  return count;
}

export type Difficulty = 'leicht' | 'mittel' | 'schwer';

/** Bewertung: reine Zeilenlogik nötig? Wie viele Durchgänge? */
export function rateNono(p: Nono): { logic: boolean; passes: number; unique: boolean } {
  const r = solveLogic(p);
  if (r.status === 'solved') return { logic: true, passes: r.passes, unique: true };
  return { logic: false, passes: r.passes, unique: countSolutions(p, 2) === 1 };
}

// ───────── Zufallsbilder ─────────

/** Weiche Zufallsform: Vereinigung von Rechtecken und Kreisen, symmetrisch oder nicht. */
export function randomImage(w: number, h: number, density: number, rng: Rng): Uint8Array {
  const g = new Uint8Array(w * h);
  const shapes = 2 + Math.floor((w * h) / 40);
  const sym = rng() < 0.5;
  for (let s = 0; s < shapes; s++) {
    const kind = rng();
    const cx = rng() * w, cy = rng() * h;
    const rw = 1 + rng() * (w / 3), rh = 1 + rng() * (h / 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let inside = false;
      if (kind < 0.45) inside = Math.abs(x + 0.5 - cx) <= rw && Math.abs(y + 0.5 - cy) <= rh;
      else if (kind < 0.9) inside = ((x + 0.5 - cx) / rw) ** 2 + ((y + 0.5 - cy) / rh) ** 2 <= 1;
      else inside = Math.abs(x + 0.5 - cx) / rw + Math.abs(y + 0.5 - cy) / rh <= 1;
      if (inside) { g[y * w + x] = 1; if (sym) g[y * w + (w - 1 - x)] = 1; }
    }
  }
  // Rauschen und Dichte angleichen
  const target = Math.round(w * h * density);
  const cells = Array.from({ length: w * h }, (_, i) => i);
  let have = g.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (have !== target && guard++ < w * h * 3) {
    const i = cells[Math.floor(rng() * cells.length)];
    if (have > target && g[i]) { g[i] = 0; have--; if (sym) { const j = Math.floor(i / w) * w + (w - 1 - (i % w)); if (g[j]) { g[j] = 0; have--; } } }
    else if (have < target && !g[i]) { g[i] = 1; have++; }
  }
  return g;
}

export interface Generated { w: number; h: number; bits: Uint8Array; nono: Nono; passes: number }

/** Erzeugt ein rein logisch lösbares Rätsel (eindeutig). */
export function generateNono(w: number, h: number, diff: Difficulty, seed: number | string, budgetMs = 1500): Generated {
  const rng = rngFrom(seed);
  const dens = { leicht: 0.62, mittel: 0.52, schwer: 0.45 }[diff];
  const t0 = Date.now();
  let best: Generated | null = null;
  for (let attempt = 0; ; attempt++) {
    const bits = randomImage(w, h, dens + (rng() - 0.5) * 0.1, rng);
    if (bits.every((b) => !b) || bits.every((b) => b)) continue;
    const nono = cluesOf(w, h, bits);
    const r = solveLogic(nono);
    if (r.status === 'solved') {
      const g = { w, h, bits, nono, passes: r.passes };
      const want = diff === 'leicht' ? r.passes <= 3 : diff === 'mittel' ? r.passes >= 3 && r.passes <= 6 : r.passes >= 5;
      if (want) return g;
      if (!best) best = g;
    }
    if (Date.now() - t0 > budgetMs) break;
  }
  return best ?? (() => { const bits = new Uint8Array(w * h).fill(1); for (let i = 0; i < w * h; i += 2) bits[i] = 0; return { w, h, bits, nono: cluesOf(w, h, bits), passes: 1 }; })();
}

// ───────── Teilen ─────────

export function encodeNono(w: number, h: number, bits: ArrayLike<number>): string {
  const bytes: number[] = [];
  for (let i = 0; i < w * h; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | (bits[i + k] ? 1 : 0); bytes.push(b); }
  const bin = String.fromCharCode(w, h, ...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeNono(code: string): { w: number; h: number; bits: Uint8Array } | null {
  try {
    const bin = atob(code.trim().replace(/-/g, '+').replace(/_/g, '/'));
    const w = bin.charCodeAt(0), h = bin.charCodeAt(1);
    if (w < 2 || h < 2 || w > 40 || h > 40) return null;
    const bits = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const byte = bin.charCodeAt(2 + (i >> 3)); bits[i] = (byte >> (7 - (i & 7))) & 1; }
    return { w, h, bits };
  } catch { return null; }
}
