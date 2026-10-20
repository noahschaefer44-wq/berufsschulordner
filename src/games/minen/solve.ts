// Minenfeld-Löser: logische Regeln, exakte Wahrscheinlichkeiten und Simulation (für „Ohne Raten“, Hinweise und Lernhilfe).
import { type Board, OPEN, isWon, reveal } from './engine';

export interface View { n: number; nb: number[][]; open: Uint8Array; num: Uint8Array; mines: number }

export function viewOf(b: Board): View {
  const open = new Uint8Array(b.n);
  for (let i = 0; i < b.n; i++) if (b.st[i] === OPEN) open[i] = 1;
  return { n: b.n, nb: b.nb, open, num: b.num, mines: b.cfg.mines };
}

export type Rule = 'einfach' | 'teilmenge' | 'summe' | 'aufzaehlen';
export interface Deduction { cell: number; mine: boolean; rule: Rule; /** auslösende Zahlen-Zellen */ from: number[] }

interface Cons { src: number; cells: number[]; need: number }

function buildCons(v: View, known: Int8Array): Cons[] | null {
  const cons: Cons[] = [];
  for (let i = 0; i < v.n; i++) {
    if (!v.open[i] || v.num[i] === 0) continue;
    const cells: number[] = [];
    let need = v.num[i];
    for (const j of v.nb[i]) {
      if (v.open[j]) continue;
      if (known[j] === 2) need--;
      else if (known[j] === 1) continue;
      else cells.push(j);
    }
    if (!cells.length) { if (need !== 0) return null; continue; }
    if (need < 0 || need > cells.length) return null;
    cons.push({ src: i, cells, need });
  }
  return cons;
}

/** Alle sicheren Schlüsse aus dem aktuellen Stand. `enumerate`: zusätzlich exakte Wahrscheinlichkeiten (0 % / 100 %) nutzen. */
export function deduce(v: View, opts: { enumerate?: boolean; stopAtFirst?: boolean } = {}): Deduction[] {
  const known = new Int8Array(v.n);
  const out: Deduction[] = [];
  const mark = (cell: number, mine: boolean, rule: Rule, from: number[]) => {
    if (known[cell] !== 0 || v.open[cell]) return false;
    known[cell] = mine ? 2 : 1;
    out.push({ cell, mine, rule, from });
    return true;
  };
  for (let guard = 0; guard < 400; guard++) {
    const cons = buildCons(v, known);
    if (!cons) break; // widersprüchlicher Stand (z. B. falsche Eingabe)
    let progress = false;
    // 1) einfache Regel
    for (const c of cons) {
      if (c.need === 0) for (const j of c.cells) progress = mark(j, false, 'einfach', [c.src]) || progress;
      else if (c.need === c.cells.length) for (const j of c.cells) progress = mark(j, true, 'einfach', [c.src]) || progress;
    }
    if (progress) { if (opts.stopAtFirst) break; continue; }
    // 2) Teilmengen-Regel
    const byCell = new Map<number, Cons[]>();
    for (const c of cons) for (const j of c.cells) (byCell.get(j) ?? byCell.set(j, []).get(j)!).push(c);
    for (const a of cons) {
      const cand = byCell.get(a.cells[0]) ?? [];
      for (const b of cand) {
        if (b === a || b.cells.length <= a.cells.length) continue;
        const bs = new Set(b.cells);
        if (!a.cells.every((x) => bs.has(x))) continue;
        const as = new Set(a.cells);
        const diff = b.cells.filter((x) => !as.has(x));
        const need = b.need - a.need;
        if (need === 0) for (const j of diff) progress = mark(j, false, 'teilmenge', [a.src, b.src]) || progress;
        else if (need === diff.length) for (const j of diff) progress = mark(j, true, 'teilmenge', [a.src, b.src]) || progress;
      }
    }
    if (progress) { if (opts.stopAtFirst) break; continue; }
    // 3) Minenzähler
    let unknown = 0, mines = 0;
    for (let i = 0; i < v.n; i++) { if (v.open[i]) continue; if (known[i] === 2) mines++; else if (known[i] === 0) unknown++; }
    const left = v.mines - mines;
    if (unknown > 0 && left === 0) { for (let i = 0; i < v.n; i++) if (!v.open[i] && known[i] === 0) progress = mark(i, false, 'summe', []) || progress; }
    else if (unknown > 0 && left === unknown) { for (let i = 0; i < v.n; i++) if (!v.open[i] && known[i] === 0) progress = mark(i, true, 'summe', []) || progress; }
    if (progress) { if (opts.stopAtFirst) break; continue; }
    // 4) Aufzählen aller Möglichkeiten
    if (opts.enumerate) {
      const p = probabilities(v, known);
      for (let i = 0; i < v.n; i++) {
        if (v.open[i] || known[i] !== 0 || Number.isNaN(p[i])) continue;
        if (p[i] < 1e-9) progress = mark(i, false, 'aufzaehlen', []) || progress;
        else if (p[i] > 1 - 1e-9) progress = mark(i, true, 'aufzaehlen', []) || progress;
      }
    }
    if (!progress) break;
    if (opts.stopAtFirst) break;
  }
  return out;
}

// ───────── Wahrscheinlichkeiten ─────────

let logF: number[] = [0];
const logC = (n: number, k: number) => {
  if (k < 0 || k > n) return -Infinity;
  while (logF.length <= n) logF.push(logF[logF.length - 1] + Math.log(logF.length));
  return logF[n] - logF[k] - logF[n - k];
};

interface Comp { cells: number[]; cons: { cells: number[]; need: number }[]; N: Float64Array; M: Float64Array[]; aborted: boolean }

function enumerateComp(cells: number[], cons: { cells: number[]; need: number }[], cap: number): Comp {
  // lokale Indizes in Reihenfolge der Beschränkungen (BFS), damit früh geprüft werden kann
  const idx = new Map<number, number>();
  const order: number[] = [];
  const seenCons = new Set<number>();
  const queue: number[] = [0];
  seenCons.add(0);
  const consOfCell = new Map<number, number[]>();
  cons.forEach((c, k) => c.cells.forEach((j) => (consOfCell.get(j) ?? consOfCell.set(j, []).get(j)!).push(k)));
  while (queue.length) {
    const k = queue.shift()!;
    for (const j of cons[k].cells) {
      if (!idx.has(j)) { idx.set(j, order.length); order.push(j); }
      for (const k2 of consOfCell.get(j)!) if (!seenCons.has(k2)) { seenCons.add(k2); queue.push(k2); }
    }
  }
  const nC = order.length;
  const cellCons: number[][] = order.map((j) => consOfCell.get(j)!);
  const need = cons.map((c) => c.need);
  const unassigned = cons.map((c) => c.cells.length);
  const N = new Float64Array(nC + 1);
  const M = Array.from({ length: nC }, () => new Float64Array(nC + 1));
  const assign = new Int8Array(nC);
  let nodes = 0, aborted = false;
  const rec = (i: number, mc: number) => {
    if (aborted) return;
    if (++nodes > cap) { aborted = true; return; }
    if (i === nC) {
      N[mc]++;
      for (let a = 0; a < nC; a++) if (assign[a]) M[a][mc]++;
      return;
    }
    for (let val = 0; val <= 1; val++) {
      let ok = true;
      for (const k of cellCons[i]) { unassigned[k]--; need[k] -= val; }
      for (const k of cellCons[i]) if (need[k] < 0 || need[k] > unassigned[k]) { ok = false; break; }
      if (ok) { assign[i] = val; rec(i + 1, mc + val); }
      for (const k of cellCons[i]) { unassigned[k]++; need[k] += val; }
    }
    assign[i] = 0;
  };
  rec(0, 0);
  return { cells: order, cons, N, M, aborted };
}

/** Wahrscheinlichkeit je verdeckter Zelle, eine Mine zu sein (NaN = unbekannt/offen). */
export function probabilities(v: View, known?: Int8Array, nodeCap = 1_500_000): Float64Array {
  const n = v.n;
  const p = new Float64Array(n).fill(NaN);
  const kn = known ?? new Int8Array(n);
  const cons = buildCons(v, kn);
  if (!cons) return p;
  let knownMines = 0;
  for (let i = 0; i < n; i++) if (!v.open[i] && kn[i] === 2) knownMines++;
  for (let i = 0; i < n; i++) if (!v.open[i] && kn[i] === 2) p[i] = 1;
  for (let i = 0; i < n; i++) if (!v.open[i] && kn[i] === 1) p[i] = 0;
  // Komponenten über gemeinsame Zellen (Union-Find über Beschränkungen)
  const parent = cons.map((_, k) => k);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const owner = new Map<number, number>();
  cons.forEach((c, k) => c.cells.forEach((j) => { const o = owner.get(j); if (o === undefined) owner.set(j, k); else parent[find(k)] = find(o); }));
  const groups = new Map<number, number[]>();
  cons.forEach((_, k) => { const r = find(k); (groups.get(r) ?? groups.set(r, []).get(r)!).push(k); });
  const comps: Comp[] = [];
  for (const ks of groups.values()) {
    const cs = ks.map((k) => cons[k]);
    const cells = [...new Set(cs.flatMap((c) => c.cells))];
    comps.push(enumerateComp(cells, cs, nodeCap));
  }
  const frontier = new Set<number>(comps.flatMap((c) => c.cells));
  let interior = 0;
  for (let i = 0; i < n; i++) if (!v.open[i] && kn[i] === 0 && !frontier.has(i)) interior++;
  const R = v.mines - knownMines;
  const anyAbort = comps.some((c) => c.aborted);
  if (anyAbort || comps.length > 60) {
    // nur lokal rechnen
    for (const c of comps) {
      if (c.aborted) continue;
      const tot = c.N.reduce((a, b) => a + b, 0);
      c.cells.forEach((cell, a) => { p[cell] = tot ? c.M[a].reduce((x, y) => x + y, 0) / tot : NaN; });
    }
    return p;
  }
  const conv = (a: Float64Array, b: Float64Array) => {
    const r = new Float64Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++) if (a[i]) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
    return r;
  };
  const all = comps.reduce((acc, c) => conv(acc, c.N), Float64Array.of(1));
  // Gewichte der Innenzellen
  let ref = -Infinity;
  for (let s = 0; s < all.length; s++) if (all[s]) ref = Math.max(ref, logC(interior, R - s));
  if (!Number.isFinite(ref)) return p;
  const w = (s: number) => { const l = logC(interior, R - s); return Number.isFinite(l) ? Math.exp(l - ref) : 0; };
  let Z = 0, intMines = 0;
  for (let s = 0; s < all.length; s++) if (all[s]) { const ws = all[s] * w(s); Z += ws; intMines += ws * (R - s); }
  if (!Z) return p;
  comps.forEach((c, j) => {
    const others = comps.reduce((acc, c2, j2) => (j2 === j ? acc : conv(acc, c2.N)), Float64Array.of(1));
    const rest = new Float64Array(c.N.length);
    for (let k = 0; k < c.N.length; k++) { let t = 0; for (let m = 0; m < others.length; m++) if (others[m]) t += others[m] * w(k + m); rest[k] = t; }
    c.cells.forEach((cell, a) => { let t = 0; for (let k = 0; k < c.N.length; k++) t += c.M[a][k] * rest[k]; p[cell] = t / Z; });
  });
  if (interior > 0) {
    const pi = intMines / Z / interior;
    for (let i = 0; i < n; i++) if (!v.open[i] && kn[i] === 0 && !frontier.has(i)) p[i] = pi;
  }
  return p;
}

// ───────── Simulation ─────────

function cloneForSim(b: Board): Board {
  return { ...b, st: new Uint8Array(b.n), opened: 0, flags: 0, status: 'play', boom: -1, lives: 0 };
}

/** Spielt das Feld nach dem ersten Klick mit reiner Logik (ohne Raten) durch. */
export function simulate(b0: Board, first: number, enumerate = true): { solved: boolean; left: number; steps: number } {
  const b = cloneForSim(b0);
  reveal(b, first);
  let steps = 0;
  for (let guard = 0; guard < b.n + 5; guard++) {
    if (isWon(b)) break;
    const ded = deduce(viewOf(b), { enumerate }).filter((d) => !d.mine);
    if (!ded.length) break;
    for (const d of ded) if (b.st[d.cell] !== OPEN) { reveal(b, d.cell); steps++; }
  }
  return { solved: isWon(b), left: b.n - b.cfg.mines - b.opened, steps };
}

// ───────── Erklärungen ─────────

export const ruleName: Record<Rule, string> = {
  einfach: 'Einfache Regel',
  teilmenge: 'Teilmengen-Regel',
  summe: 'Minenzähler',
  aufzaehlen: 'Alle Möglichkeiten durchspielen',
};

export function explain(d: Deduction, w: number, topo: string): string {
  const pos = (i: number) => (topo === 'hex' ? `Zeile ${Math.floor(i / w) + 1}, Spalte ${(i % w) + 1}` : `Zeile ${Math.floor(i / w) + 1}, Spalte ${(i % w) + 1}`);
  const what = d.mine ? 'eine Mine' : 'sicher';
  switch (d.rule) {
    case 'einfach':
      return d.mine
        ? `Die Zahl bei ${pos(d.from[0])} hat genau so viele verdeckte Nachbarn wie ihr Wert – alle sind Minen.`
        : `Die Zahl bei ${pos(d.from[0])} ist schon durch bekannte Minen erfüllt – alle anderen Nachbarn sind sicher.`;
    case 'teilmenge':
      return `Die Nachbarn der Zahl bei ${pos(d.from[0])} liegen komplett in den Nachbarn der Zahl bei ${pos(d.from[1])}. Der Unterschied der Minen-Anzahl verrät: dieses Feld ist ${what}.`;
    case 'summe':
      return d.mine ? 'Es fehlen genau so viele Minen wie verdeckte Felder übrig sind – also sind alle Minen.' : 'Alle Minen sind schon gefunden – die restlichen verdeckten Felder sind sicher.';
    default:
      return `Beim Durchspielen aller Möglichkeiten, die zu den Zahlen passen, ist dieses Feld immer ${what}.`;
  }
}
