// Löser für Hinweise und „garantiert lösbar“: Klondike (Tiefensuche) und FreeCell (Bestensuche).
import { rankOf } from './cards';
import { type Move, type PileGame, applyMove, autoFoundationMove, countFound, legalMoves, scoreMove, stateKey } from './piles';

export interface Solution { moves: Move[]; nodes: number }

/** Klondike-Tiefensuche mit Zwischenspeicher. null = nichts gefunden (oder Limit). */
export function solveKlondike(start: PileGame, maxNodes = 30000, maxMs = 1500): Solution | null {
  const t0 = Date.now();
  const seen = new Set<string>();
  let nodes = 0;
  const path: Move[] = [];
  const rec = (g: PileGame, depth: number): boolean => {
    if (g.won) return true;
    if (++nodes > maxNodes || depth > 260 || (nodes % 256 === 0 && Date.now() - t0 > maxMs)) return false;
    const key = stateKey(g);
    if (seen.has(key)) return false;
    seen.add(key);
    // erst sichere Ablage-Züge
    const auto = autoFoundationMove(g);
    const ms = legalMoves(g)
      .filter((m) => !('act' in m && m.act === 'recycle' && g.passes >= 2))
      .map((m) => ({ m, s: scoreMove(g, m) + (auto && !('act' in m) && m === auto ? 500 : 0) }))
      .sort((a, b) => b.s - a.s);
    for (const { m } of ms) {
      const r = applyMove(g, m);
      if (!r) continue;
      path.push(m);
      if (rec(r.g, depth + 1)) return true;
      path.pop();
      if (nodes > maxNodes) return false;
    }
    return false;
  };
  const ok = rec(start, 0);
  return ok ? { moves: path.slice(), nodes } : null;
}

// ───────── FreeCell ─────────

function heuristic(g: PileGame): number {
  let inv = 0;
  for (const p of g.tab) for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (rankOf(p[j].id) > rankOf(p[i].id)) inv++;
  const cells = g.cells.filter((c) => c.length).length;
  return (52 - countFound(g)) * 3 + inv * 1.2 + cells * 2;
}

class Heap<T> {
  private a: { p: number; v: T }[] = [];
  get size() { return this.a.length; }
  push(p: number, v: T) { const a = this.a; a.push({ p, v }); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j].p <= a[i].p) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
  pop(): T | undefined {
    const a = this.a; if (!a.length) return undefined;
    const top = a[0]; const last = a.pop()!;
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].p < a[m].p) m = l; if (r < a.length && a[r].p < a[m].p) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top.v;
  }
}

/** FreeCell-Bestensuche (greedy mit leichtem Wegkostenanteil). */
export function solveFreecell(start: PileGame, maxNodes = 60000, maxMs = 4000): Solution | null {
  const t0 = Date.now();
  interface N { g: PileGame; parent: N | null; move: Move | null; depth: number }
  const heap = new Heap<N>();
  const seen = new Set<string>();
  const root: N = { g: start, parent: null, move: null, depth: 0 };
  heap.push(heuristic(start), root);
  seen.add(stateKey(start));
  let nodes = 0;
  while (heap.size) {
    if (++nodes > maxNodes || (nodes % 200 === 0 && Date.now() - t0 > maxMs)) return null;
    const n = heap.pop()!;
    if (n.g.won) {
      const moves: Move[] = [];
      for (let k: N | null = n; k && k.move; k = k.parent) moves.push(k.move);
      return { moves: moves.reverse(), nodes };
    }
    for (const m of legalMoves(n.g)) {
      const r = applyMove(n.g, m);
      if (!r) continue;
      // sichere Ablage-Züge gleich mitnehmen
      let g = r.g;
      const chain: Move[] = [m];
      for (let guard = 0; guard < 52; guard++) { const a = autoFoundationMove(g); if (!a) break; const rr = applyMove(g, a); if (!rr) break; g = rr.g; chain.push(a); }
      const key = stateKey(g);
      if (seen.has(key)) continue;
      seen.add(key);
      let cur: N = n;
      for (const mv of chain) cur = { g, parent: cur, move: mv, depth: cur.depth + 1 };
      heap.push(heuristic(g) + cur.depth * 0.35, cur);
    }
  }
  return null;
}
