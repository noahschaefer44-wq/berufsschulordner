// Sudoku: Varianten, Gruppen, Nachbarn, Käfige und ein schneller Rückverfolgungs-Löser (zählt Lösungen).
import { type Rng, shuffled, randInt } from '../shared/rng';

export type Variant = 'klassik' | 'mini' | 'kinder' | 'x' | 'hyper' | 'ritter' | 'killer';

export interface Cage { cells: number[]; sum: number }
export type GroupKind = 'row' | 'col' | 'box' | 'diag1' | 'diag2' | 'hyper';

export interface Spec {
  variant: Variant;
  n: number;
  br: number; // Zeilen je Block
  bc: number; // Spalten je Block
  groups: number[][];
  kinds: GroupKind[];
  /** Index der Zeilen- bzw. Spaltengruppen für X-Wing: rows[i] = Gruppenindex der Zeile i */
  rowG: number[];
  colG: number[];
  peers: number[][];
  knight: boolean;
  cages: Cage[];
  cageOf: number[];
}

export const VARIANTS: { id: Variant; name: string; info: string; n: number }[] = [
  { id: 'klassik', name: 'Klassisch 9×9', info: 'Jede Zahl 1–9 genau einmal pro Zeile, Spalte und 3×3-Block.', n: 9 },
  { id: 'mini', name: 'Mini 6×6', info: 'Zahlen 1–6, Blöcke 2×3 – ideal für zwischendurch.', n: 6 },
  { id: 'kinder', name: 'Kinder 4×4', info: 'Zahlen 1–4, Blöcke 2×2 – zum Einstieg.', n: 4 },
  { id: 'x', name: 'X-Sudoku', info: 'Zusätzlich muss jede der beiden Diagonalen alle Zahlen 1–9 enthalten.', n: 9 },
  { id: 'hyper', name: 'Hyper (Windoku)', info: 'Vier zusätzliche 3×3-Blöcke (grau hinterlegt) enthalten ebenfalls alle Zahlen.', n: 9 },
  { id: 'ritter', name: 'Anti-Springer', info: 'Gleiche Zahlen dürfen nicht einen Schachspringer-Zug auseinander stehen.', n: 9 },
  { id: 'killer', name: 'Killer', info: 'Käfige mit Summe: Zahlen im Käfig sind verschieden und ergeben die kleine Summe.', n: 9 },
];

export const boxShape = (n: number): [number, number] => (n === 9 ? [3, 3] : n === 6 ? [2, 3] : [2, 2]);

export function buildSpec(variant: Variant, cages: Cage[] = []): Spec {
  const info = VARIANTS.find((v) => v.id === variant)!;
  const n = info.n;
  const [br, bc] = boxShape(n);
  const groups: number[][] = [], kinds: GroupKind[] = [], rowG: number[] = [], colG: number[] = [];
  for (let r = 0; r < n; r++) { rowG.push(groups.length); groups.push(Array.from({ length: n }, (_, c) => r * n + c)); kinds.push('row'); }
  for (let c = 0; c < n; c++) { colG.push(groups.length); groups.push(Array.from({ length: n }, (_, r) => r * n + c)); kinds.push('col'); }
  for (let by = 0; by < n / br; by++) for (let bx = 0; bx < n / bc; bx++) {
    const g: number[] = [];
    for (let r = 0; r < br; r++) for (let c = 0; c < bc; c++) g.push((by * br + r) * n + bx * bc + c);
    groups.push(g); kinds.push('box');
  }
  if (variant === 'x') {
    groups.push(Array.from({ length: n }, (_, i) => i * n + i)); kinds.push('diag1');
    groups.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i))); kinds.push('diag2');
  }
  if (variant === 'hyper') {
    for (const [r0, c0] of [[1, 1], [1, 5], [5, 1], [5, 5]]) {
      const g: number[] = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.push((r0 + r) * n + c0 + c);
      groups.push(g); kinds.push('hyper');
    }
  }
  const knight = variant === 'ritter';
  const peers: number[][] = Array.from({ length: n * n }, () => []);
  const seen = Array.from({ length: n * n }, () => new Set<number>());
  for (const g of groups) for (const a of g) for (const b of g) if (a !== b && !seen[a].has(b)) { seen[a].add(b); peers[a].push(b); }
  if (knight) {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const a = r * n + c, b = rr * n + cc;
      if (!seen[a].has(b)) { seen[a].add(b); peers[a].push(b); }
    }
  }
  const cageOf = new Array<number>(n * n).fill(-1);
  cages.forEach((cg, k) => cg.cells.forEach((c) => { cageOf[c] = k; }));
  return { variant, n, br, bc, groups, kinds, rowG, colG, peers, knight, cages, cageOf };
}

export const FULL = (n: number) => (1 << n) - 1;
export const bitCount = (m: number) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
export const lowBit = (m: number) => Math.log2(m & -m) + 1;
export const digitsOf = (m: number): number[] => { const o: number[] = []; for (let d = 1; m; d++, m >>= 1) if (m & 1) o.push(d); return o; };

// ───────── Käfig-Hilfen ─────────

const comboCache = new Map<string, number[]>();
/** Alle Digit-Mengen (als Bitmasken) mit k verschiedenen Zahlen aus `allowed`, die `sum` ergeben. */
export function cageCombos(k: number, sum: number, allowed: number): number[] {
  const key = `${k}|${sum}|${allowed}`;
  const hit = comboCache.get(key);
  if (hit) return hit;
  const out: number[] = [];
  const rec = (d: number, left: number, s: number, mask: number) => {
    if (left === 0) { if (s === 0) out.push(mask); return; }
    for (let x = d; x <= 9; x++) {
      if (!(allowed & (1 << (x - 1)))) continue;
      if (x > s) break;
      rec(x + 1, left - 1, s - x, mask | (1 << (x - 1)));
    }
  };
  rec(1, k, sum, 0);
  comboCache.set(key, out);
  return out;
}

// ───────── Rückverfolgungs-Löser ─────────

export interface SolveResult { count: number; solution: Int8Array | null; timedOut?: boolean }

/** Zählt Lösungen (bis `limit`). Gegebene Zahlen in `grid` (0 = leer). */
export function solve(spec: Spec, grid: ArrayLike<number>, limit = 2, deadline = Infinity): SolveResult {
  const N = spec.n * spec.n;
  const full = FULL(spec.n);
  const cand = new Uint16Array(N).fill(full);
  const val = new Int8Array(N);
  let timedOut = false;

  const assign = (cand: Uint16Array, val: Int8Array, i: number, d: number): boolean => {
    const bit = 1 << (d - 1);
    if (!(cand[i] & bit) && val[i] !== d) return false;
    val[i] = d; cand[i] = 0;
    for (const p of spec.peers[i]) {
      if (val[p] === d) return false;
      cand[p] &= ~bit;
      if (val[p] === 0 && cand[p] === 0) return false;
    }
    return true;
  };

  const cagesOk = (cand: Uint16Array, val: Int8Array): boolean => {
    for (const cg of spec.cages) {
      let sum = 0, free = 0, union = 0, used = 0;
      for (const c of cg.cells) { if (val[c]) { sum += val[c]; used |= 1 << (val[c] - 1); } else { free++; union |= cand[c]; } }
      const need = cg.sum - sum;
      if (free === 0) { if (need !== 0) return false; continue; }
      if (need <= 0) return false;
      const combos = cageCombos(free, need, union & ~used);
      if (!combos.length) return false;
      // Kandidaten der Käfigzellen auf Zahlen einschränken, die in einer Kombination vorkommen
      let possible = 0;
      for (const m of combos) possible |= m;
      for (const c of cg.cells) if (!val[c]) { cand[c] &= possible; if (cand[c] === 0) return false; }
    }
    return true;
  };

  const propagate = (cand: Uint16Array, val: Int8Array): boolean => {
    for (let guard = 0; guard < 500; guard++) {
      let changed = false;
      for (let i = 0; i < N; i++) {
        if (val[i]) continue;
        const m = cand[i];
        if (m === 0) return false;
        if ((m & (m - 1)) === 0) { if (!assign(cand, val, i, lowBit(m))) return false; changed = true; }
      }
      // versteckte Einzelne
      for (const g of spec.groups) {
        let once = 0, twice = 0, present = 0;
        for (const c of g) { if (val[c]) { present |= 1 << (val[c] - 1); continue; } twice |= once & cand[c]; once |= cand[c]; }
        if ((once | present) !== full) return false;
        const single = once & ~twice;
        if (single) {
          for (const c of g) if (!val[c] && (cand[c] & single)) {
            const m = cand[c] & single;
            if (m & (m - 1)) return false; // zwei verschiedene versteckte Einzelne in einer Zelle
            if (!assign(cand, val, c, lowBit(m))) return false;
            changed = true;
          }
        }
      }
      if (spec.cages.length) {
        const before = cand.join();
        if (!cagesOk(cand, val)) return false;
        if (cand.join() !== before) changed = true;
      }
      if (!changed) return true;
    }
    return true;
  };

  // Vorgaben setzen
  for (let i = 0; i < N; i++) {
    const d = grid[i];
    if (d) if (!assign(cand, val, i, d)) return { count: 0, solution: null };
  }
  let count = 0, sol: Int8Array | null = null;
  const rec = (cand: Uint16Array, val: Int8Array) => {
    if (count >= limit || timedOut) return;
    if (Date.now() > deadline) { timedOut = true; return; }
    if (!propagate(cand, val)) return;
    // Zelle mit den wenigsten Kandidaten
    let best = -1, bc = 99;
    for (let i = 0; i < N; i++) if (!val[i]) { const c = bitCount(cand[i]); if (c < bc) { bc = c; best = i; if (c === 2) break; } }
    if (best < 0) {
      if (spec.cages.length && !cagesOk(cand, val)) return;
      count++; if (!sol) sol = val.slice();
      return;
    }
    for (const d of digitsOf(cand[best])) {
      const c2 = cand.slice(), v2 = val.slice();
      if (assign(c2, v2, best, d)) rec(c2, v2);
      if (count >= limit || timedOut) return;
    }
  };
  rec(cand, val);
  return { count, solution: sol, timedOut };
}

/** Zufällige gültige Lösung (ohne Käfig-Summen). */
export function randomSolution(spec: Spec, rng: Rng): Int8Array {
  const N = spec.n * spec.n;
  const full = FULL(spec.n);
  const val = new Int8Array(N);
  const cand = new Uint16Array(N).fill(full);
  const place = (cand: Uint16Array, val: Int8Array, i: number, d: number): boolean => {
    const bit = 1 << (d - 1);
    val[i] = d; cand[i] = 0;
    for (const p of spec.peers[i]) { cand[p] &= ~bit; if (!val[p] && cand[p] === 0) return false; }
    return true;
  };
  const rec = (cand: Uint16Array, val: Int8Array): Int8Array | null => {
    let best = -1, bc = 99;
    for (let i = 0; i < N; i++) if (!val[i]) { const c = bitCount(cand[i]); if (c < bc) { bc = c; best = i; if (c <= 1) break; } }
    if (best < 0) return val;
    for (const d of shuffled(rng, digitsOf(cand[best]))) {
      const c2 = cand.slice(), v2 = val.slice();
      if (place(c2, v2, best, d)) { const r = rec(c2, v2); if (r) return r; }
    }
    return null;
  };
  return rec(cand, val) ?? val;
}

/** Zerlegt eine Lösung in Käfige (verbundene Zellen mit verschiedenen Zahlen). */
export function makeCages(spec: Spec, sol: ArrayLike<number>, rng: Rng, maxSize: number): Cage[] {
  const n = spec.n;
  const owner = new Array<number>(n * n).fill(-1);
  const cages: Cage[] = [];
  const nbs = (i: number) => {
    const r = Math.floor(i / n), c = i % n, o: number[] = [];
    if (r > 0) o.push(i - n); if (r < n - 1) o.push(i + n); if (c > 0) o.push(i - 1); if (c < n - 1) o.push(i + 1);
    return o;
  };
  for (const start of shuffled(rng, Array.from({ length: n * n }, (_, i) => i))) {
    if (owner[start] >= 0) continue;
    const roll = rng();
    const size = Math.min(maxSize, roll < 0.06 ? 1 : roll < 0.36 ? 2 : roll < 0.68 ? 3 : roll < 0.92 ? 4 : 5);
    const cells = [start];
    const digits = new Set([sol[start]]);
    owner[start] = cages.length;
    while (cells.length < size) {
      const opts: number[] = [];
      for (const c of cells) for (const j of nbs(c)) if (owner[j] < 0 && !digits.has(sol[j]) && !opts.includes(j)) opts.push(j);
      if (!opts.length) break;
      const pick = opts[randInt(rng, opts.length)];
      owner[pick] = cages.length; cells.push(pick); digits.add(sol[pick]);
    }
    cages.push({ cells, sum: cells.reduce((a, c) => a + sol[c], 0) });
  }
  // Einzelzellen-Käfige mit Nachbarn verschmelzen, wo möglich (weniger „verschenkte“ Zahlen)
  return cages;
}

export const cellName = (n: number, i: number) => `Z${Math.floor(i / n) + 1}S${(i % n) + 1}`;
