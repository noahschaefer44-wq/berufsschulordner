// Patience-Spiele mit Stapeln: Klondike, FreeCell, Spider – Regeln, Züge, Wertung, Hinweise.
import { type Card, clonePiles, isRed, mk, msDeal, newDeck, rankOf, shuffleDeck, suitOf } from './cards';
import { mulberry32 } from '../shared/rng';

export type Kind = 'klondike' | 'freecell' | 'spider';

export interface Opts { draw: 1 | 3; vegas: boolean; suits: 1 | 2 | 4; autoSafe: boolean }
export interface PileGame {
  kind: Kind;
  tab: Card[][];
  /** Ablagen: Klondike/FreeCell: 4 Stapel je Farbe; Spider: abgeschlossene Reihen */
  found: Card[][];
  /** FreeCell: 4 Zellen (je 0–1 Karte) */
  cells: Card[][];
  stock: Card[];
  waste: Card[];
  opts: Opts;
  passes: number;
  moves: number;
  score: number;
  /** Spielnummer / Startwert */
  deal: number;
  won: boolean;
}

export type Move = { from: string; idx: number; to: string } | { act: 'draw' | 'recycle' | 'deal' };
export type Ev = { kind: 'move' | 'flip' | 'draw' | 'complete' | 'recycle'; uid?: number };

export const T = (i: number) => `T${i}`;
const pidx = (id: string) => +id.slice(1);

export function pile(g: PileGame, id: string): Card[] {
  switch (id[0]) {
    case 'T': return g.tab[pidx(id)];
    case 'F': return g.found[pidx(id)];
    case 'C': return g.cells[pidx(id)];
    case 'W': return g.waste;
    default: return g.stock;
  }
}

export function cloneGame(g: PileGame): PileGame {
  return { ...g, tab: clonePiles(g.tab), found: clonePiles(g.found), cells: clonePiles(g.cells), stock: g.stock.map((c) => ({ ...c })), waste: g.waste.map((c) => ({ ...c })), opts: { ...g.opts } };
}

// ───────── Neue Spiele ─────────

export function newKlondike(seed: number, opts: Partial<Opts> = {}): PileGame {
  const rng = mulberry32(seed);
  const deck = shuffleDeck(newDeck(1), rng);
  const tab: Card[][] = Array.from({ length: 7 }, () => []);
  let k = 0;
  for (let c = 0; c < 7; c++) for (let r = 0; r <= c; r++) { const card = deck[k++]; card.up = r === c; tab[c].push(card); }
  const o: Opts = { draw: 1, vegas: false, suits: 4, autoSafe: false, ...opts };
  return { kind: 'klondike', tab, found: [[], [], [], []], cells: [], stock: deck.slice(k), waste: [], opts: o, passes: 0, moves: 0, score: o.vegas ? -52 : 0, deal: seed, won: false };
}

export function newFreecell(num: number, opts: Partial<Opts> = {}): PileGame {
  const deck = msDeal(num);
  const tab: Card[][] = Array.from({ length: 8 }, () => []);
  deck.forEach((c, i) => tab[i % 8].push(c));
  return { kind: 'freecell', tab, found: [[], [], [], []], cells: [[], [], [], []], stock: [], waste: [], opts: { draw: 1, vegas: false, suits: 4, autoSafe: true, ...opts }, passes: 0, moves: 0, score: 0, deal: num, won: false };
}

export function newSpider(seed: number, suits: 1 | 2 | 4 = 2, opts: Partial<Opts> = {}): PileGame {
  const rng = mulberry32(seed);
  const deck = shuffleDeck(newDeck(2, suits), rng);
  const tab: Card[][] = Array.from({ length: 10 }, () => []);
  let k = 0;
  for (let c = 0; c < 10; c++) { const n = c < 4 ? 6 : 5; for (let r = 0; r < n; r++) { const card = deck[k++]; card.up = r === n - 1; tab[c].push(card); } }
  return { kind: 'spider', tab, found: [], cells: [], stock: deck.slice(k), waste: [], opts: { draw: 1, vegas: false, suits, autoSafe: false, ...opts }, passes: 0, moves: 0, score: 500, deal: seed, won: false };
}

// ───────── Regelprüfung ─────────

const fitsTab = (card: Card, top: Card | undefined) => (!top ? rankOf(card.id) === 12 : top.up && rankOf(top.id) === rankOf(card.id) + 1 && isRed(top.id) !== isRed(card.id));
const fitsFound = (card: Card, top: Card | undefined) => (!top ? rankOf(card.id) === 0 : suitOf(top.id) === suitOf(card.id) && rankOf(card.id) === rankOf(top.id) + 1);

const altRun = (cards: Card[]) => cards.every((c, i) => c.up && (i === 0 || (rankOf(cards[i - 1].id) === rankOf(c.id) + 1 && isRed(cards[i - 1].id) !== isRed(c.id))));
const suitRun = (cards: Card[]) => cards.every((c, i) => c.up && (i === 0 || (rankOf(cards[i - 1].id) === rankOf(c.id) + 1 && suitOf(cards[i - 1].id) === suitOf(c.id))));

/** FreeCell: größte verschiebbare Reihe. */
export function maxRun(g: PileGame, toEmpty: boolean, destId?: string): number {
  const free = g.cells.filter((c) => c.length === 0).length;
  const empty = g.tab.filter((p, i) => p.length === 0 && T(i) !== destId).length;
  void toEmpty;
  return (free + 1) * Math.pow(2, empty);
}

/** Welche Foundation-Ablage nimmt die Karte? (−1 = keine) */
export function foundationFor(g: PileGame, card: Card): number {
  for (let i = 0; i < g.found.length; i++) if (fitsFound(card, g.found[i][g.found[i].length - 1])) return i;
  return -1;
}

export function canMove(g: PileGame, from: string, idx: number, to: string): boolean {
  if (from === to) return false;
  const src = pile(g, from);
  if (idx < 0 || idx >= src.length) return false;
  const run = src.slice(idx);
  const first = run[0];
  if (!first.up) return false;
  const kind = g.kind;
  const tk = to[0];
  if (kind === 'spider') {
    if (from[0] !== 'T' || tk !== 'T') return false;
    if (!suitRun(run)) return false;
    const dst = pile(g, to);
    const top = dst[dst.length - 1];
    return !top || (top.up && rankOf(top.id) === rankOf(first.id) + 1);
  }
  if (from[0] === 'F' && kind === 'freecell') return false;
  if (from[0] === 'W' && idx !== src.length - 1) return false;
  if (from[0] === 'F' && idx !== src.length - 1) return false;
  if (from[0] === 'C' && idx !== src.length - 1) return false;
  if (tk === 'F') {
    if (run.length !== 1) return false;
    return fitsFound(first, pile(g, to)[pile(g, to).length - 1]);
  }
  if (tk === 'C') return run.length === 1 && pile(g, to).length === 0;
  if (tk === 'T') {
    if (!altRun(run)) return false;
    const dst = pile(g, to);
    if (!fitsTab(first, dst[dst.length - 1])) return false;
    if (kind === 'freecell' && run.length > maxRun(g, dst.length === 0, to)) return false;
    return true;
  }
  return false;
}

/** Karten ab idx sind bewegbar (für Ziehen mit der Maus). */
export function draggable(g: PileGame, from: string, idx: number): boolean {
  const src = pile(g, from);
  if (idx < 0 || idx >= src.length || !src[idx].up) return false;
  const run = src.slice(idx);
  if (g.kind === 'spider') return from[0] === 'T' && suitRun(run);
  if (from[0] === 'T') return altRun(run) && (g.kind !== 'freecell' || run.length <= maxRun(g, false));
  return idx === src.length - 1 && (from[0] !== 'F' || g.kind === 'klondike');
}

// ───────── Züge ausführen ─────────

function flipTop(p: Card[], evs: Ev[]) {
  const t = p[p.length - 1];
  if (t && !t.up) { p[p.length - 1] = { ...t, up: true }; evs.push({ kind: 'flip', uid: t.uid }); return true; }
  return false;
}

function checkSpider(g: PileGame, evs: Ev[]) {
  for (const p of g.tab) {
    if (p.length >= 13) {
      const last = p.slice(-13);
      if (last[0].up && rankOf(last[0].id) === 12 && suitRun(last) && rankOf(last[12].id) === 0) {
        p.splice(-13, 13);
        g.found.push(last);
        g.score += 100;
        evs.push({ kind: 'complete' });
        flipTop(p, evs);
      }
    }
  }
}

export function applyMove(g0: PileGame, m: Move): { g: PileGame; evs: Ev[] } | null {
  const g = cloneGame(g0);
  const evs: Ev[] = [];
  if ('act' in m) {
    if (m.act === 'draw') {
      if (g.stock.length === 0) return null;
      const n = Math.min(g.opts.draw, g.stock.length);
      for (let i = 0; i < n; i++) { const c = g.stock.pop()!; g.waste.push({ ...c, up: true }); evs.push({ kind: 'draw', uid: c.uid }); }
    } else if (m.act === 'recycle') {
      if (g.stock.length || !g.waste.length) return null;
      const max = g.opts.vegas ? (g.opts.draw === 3 ? 3 : 1) : 0;
      if (max && g.passes + 1 >= max) return null;
      g.stock = g.waste.reverse().map((c) => ({ ...c, up: false }));
      g.waste = [];
      g.passes++;
      if (!g.opts.vegas) g.score = Math.max(0, g.score - (g.opts.draw === 1 ? 100 : 20));
      evs.push({ kind: 'recycle' });
    } else {
      if (g.kind !== 'spider' || !g.stock.length || g.tab.some((p) => p.length === 0)) return null;
      for (let i = 0; i < 10 && g.stock.length; i++) { const c = g.stock.pop()!; g.tab[i].push({ ...c, up: true }); }
      evs.push({ kind: 'draw' });
      checkSpider(g, evs);
    }
    g.moves++;
    if (g.kind === 'spider') g.score = Math.max(0, g.score - 1);
    g.won = isWon(g);
    return { g, evs };
  }
  if (!canMove(g, m.from, m.idx, m.to)) return null;
  const src = pile(g, m.from), dst = pile(g, m.to);
  const run = src.splice(m.idx);
  dst.push(...run);
  evs.push({ kind: 'move', uid: run[0].uid });
  g.moves++;
  const kind = g.kind;
  if (kind === 'klondike') {
    const std = !g.opts.vegas;
    if (m.to[0] === 'F') { g.score += std ? 10 : 5; }
    else if (m.from[0] === 'W' && m.to[0] === 'T' && std) g.score += 5;
    if (m.from[0] === 'F' && m.to[0] === 'T') g.score += std ? -15 : -5;
    if (m.from[0] === 'T' && flipTop(src, evs) && std) g.score += 5;
  } else if (kind === 'freecell') {
    // keine Wertung
  } else {
    g.score = Math.max(0, g.score - 1);
    flipTop(src, evs);
    checkSpider(g, evs);
  }
  g.won = isWon(g);
  return { g, evs };
}

export function isWon(g: PileGame): boolean {
  if (g.kind === 'spider') return g.found.length === 8;
  return g.found.reduce((a, p) => a + p.length, 0) === 52;
}

// ───────── Zugliste, Auto-Spiel, Hinweise ─────────

export function legalMoves(g: PileGame): Move[] {
  const out: Move[] = [];
  const sources: string[] = [];
  g.tab.forEach((_, i) => sources.push(T(i)));
  if (g.kind === 'klondike') { sources.push('W'); g.found.forEach((_, i) => sources.push(`F${i}`)); }
  if (g.kind === 'freecell') g.cells.forEach((_, i) => sources.push(`C${i}`));
  const targets: string[] = [];
  g.tab.forEach((_, i) => targets.push(T(i)));
  if (g.kind !== 'spider') g.found.forEach((_, i) => targets.push(`F${i}`));
  if (g.kind === 'freecell') g.cells.forEach((_, i) => targets.push(`C${i}`));
  let emptyTried = false;
  for (const from of sources) {
    const src = pile(g, from);
    for (let idx = 0; idx < src.length; idx++) {
      if (!draggable(g, from, idx)) continue;
      emptyTried = false;
      for (const to of targets) {
        if (to[0] === 'T' && pile(g, to).length === 0) { if (emptyTried) continue; }
        if (canMove(g, from, idx, to)) {
          // sinnlos: König-Reihe auf leeren Stapel verschieben, wenn sie schon unten liegt
          if (to[0] === 'T' && pile(g, to).length === 0 && idx === 0 && g.kind !== 'freecell') continue;
          out.push({ from, idx, to });
          if (to[0] === 'T' && pile(g, to).length === 0) emptyTried = true;
        }
      }
    }
  }
  if (g.kind === 'klondike') { if (g.stock.length) out.push({ act: 'draw' }); else if (g.waste.length) out.push({ act: 'recycle' }); }
  if (g.kind === 'spider' && g.stock.length && g.tab.every((p) => p.length)) out.push({ act: 'deal' });
  return out;
}

/** Karte darf automatisch zur Ablage (ohne Spielnachteile). */
export function safeToFoundation(g: PileGame, card: Card): boolean {
  const r = rankOf(card.id);
  if (r <= 1) return true;
  const red = isRed(card.id);
  let ok = true;
  for (let s = 0; s < 4; s++) {
    // Ablage dieser Farbe
    const f = g.found.find((p) => p.length && suitOf(p[0].id) === s);
    const h = f ? f.length : 0;
    const opposite = [1, 2].includes(s) !== red;
    if (opposite && h < r - 1) ok = false;
  }
  return ok;
}

/** Nächster sicherer Auto-Zug zur Ablage (Klondike: nur wenn `aggressive`). */
export function autoFoundationMove(g: PileGame, aggressive = false): Move | null {
  if (g.kind === 'spider') return null;
  const srcs: string[] = g.tab.map((_, i) => T(i));
  if (g.kind === 'klondike') srcs.push('W');
  if (g.kind === 'freecell') g.cells.forEach((_, i) => srcs.push(`C${i}`));
  for (const from of srcs) {
    const p = pile(g, from);
    const c = p[p.length - 1];
    if (!c || !c.up) continue;
    const fi = foundationFor(g, c);
    if (fi >= 0 && (aggressive || safeToFoundation(g, c))) return { from, idx: p.length - 1, to: `F${fi}` };
  }
  return null;
}

/** Alle Karten aufgedeckt und Vorrat leer → automatisch beendbar (Klondike). */
export function canAutoComplete(g: PileGame): boolean {
  if (g.kind === 'klondike') return !g.won && g.stock.length === 0 && g.waste.length <= 1 && g.tab.every((p) => p.every((c) => c.up));
  if (g.kind === 'freecell') return !g.won && g.tab.every((p) => p.every((c, i) => i === 0 || (rankOf(p[i - 1].id) > rankOf(c.id)))) && g.cells.every((c) => c.length === 0 || true);
  return false;
}

/** Wertung eines Zugs für Hinweise (größer = besser). */
export function scoreMove(g: PileGame, m: Move): number {
  if ('act' in m) return m.act === 'deal' ? 10 : m.act === 'draw' ? 1 : 0;
  const src = pile(g, m.from);
  const card = src[m.idx];
  let s = 20;
  if (m.to[0] === 'F') s += 100;
  if (m.from[0] === 'T' && m.idx > 0 && !src[m.idx - 1].up) s += 60; // deckt Karte auf
  if (m.from[0] === 'T' && m.idx === 0) s += 30; // leert Stapel
  if (m.to[0] === 'T' && pile(g, m.to).length === 0) s -= rankOf(card.id) === 12 ? 0 : 40;
  if (m.from[0] === 'F') s -= 80;
  if (m.to[0] === 'C') s -= 30;
  if (g.kind === 'spider') { const dst = pile(g, m.to); const top = dst[dst.length - 1]; if (top && suitOf(top.id) === suitOf(card.id)) s += 25; }
  if (m.from[0] === 'W') s += 8;
  return s;
}

export function hintMove(g: PileGame): Move | null {
  const ms = legalMoves(g).filter((m) => !('act' in m) || m.act !== 'recycle');
  let best: Move | null = null, bs = -1e9;
  for (const m of ms) { const s = scoreMove(g, m); if (s > bs) { bs = s; best = m; } }
  if (best && 'act' in best && best.act === 'draw' && bs < 5 && g.stock.length === 0) return null;
  if (!best) { const rc = legalMoves(g).find((m) => 'act' in m && m.act === 'recycle'); return rc ?? null; }
  return best;
}

export function stateKey(g: PileGame): string {
  const t = g.tab.map((p) => p.map((c) => (c.up ? c.id : c.id + 100)).join(',')).sort().join('|');
  const f = g.found.map((p) => p.length).join(',');
  const c = g.cells.map((p) => (p[0] ? p[0].id : -1)).sort().join(',');
  return `${t}#${f}#${c}#${g.waste.map((x) => x.id).join(',')}#${g.stock.length}`;
}

export const countFound = (g: PileGame) => (g.kind === 'spider' ? g.found.length * 13 : g.found.reduce((a, p) => a + p.length, 0));
export { mk };
