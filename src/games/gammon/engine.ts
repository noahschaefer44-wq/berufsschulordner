// Backgammon: Stellung, Würfelzüge, vollständige Zugfolgen mit Pflichtregeln, Doppelwürfel, Wertung.

export type Side = 0 | 1; // 0 = Weiß (zieht von Index 23 nach 0), 1 = Schwarz (zieht von 0 nach 23)
export const opp = (p: Side): Side => (p === 0 ? 1 : 0);

export interface BG {
  /** 24 Felder: positiv = Weiß, negativ = Schwarz */
  pts: number[];
  bar: [number, number];
  off: [number, number];
  turn: Side;
  /** Zahl der Steine je Seite (15 im Standardspiel) */
  total: number;
}

export type Variant = 'standard' | 'hyper' | 'kurz' | 'rueckspiel';

export interface Mv { from: number; to: number; die: number; hit: boolean }

/** Koordinaten aus Sicht der ziehenden Seite: q = 1…24 (1 = nächstes Ziel), 25 = Bar, 0 = ausgewürfelt. */
const idxOf = (p: Side, q: number) => (p === 0 ? q - 1 : 24 - q);

export const own = (s: BG, p: Side, q: number): number => {
  if (q === 25) return s.bar[p];
  const v = s.pts[idxOf(p, q)];
  return p === 0 ? Math.max(0, v) : Math.max(0, -v);
};
export const oppAt = (s: BG, p: Side, q: number): number => own(s, opp(p), 25 - q);

export function startPosition(variant: Variant = 'standard'): BG {
  const pts = new Array<number>(24).fill(0);
  const put = (p: Side, q: number, n: number) => { pts[idxOf(p, q)] += p === 0 ? n : -n; };
  let total = 15;
  for (const p of [0, 1] as Side[]) {
    if (variant === 'standard') { put(p, 24, 2); put(p, 13, 5); put(p, 8, 3); put(p, 6, 5); }
    else if (variant === 'hyper') { put(p, 24, 1); put(p, 23, 1); put(p, 22, 1); total = 3; }
    else if (variant === 'kurz') { put(p, 24, 2); put(p, 13, 3); put(p, 8, 2); put(p, 6, 3); total = 10; }
    else { put(p, 24, 4); put(p, 13, 4); put(p, 8, 3); put(p, 6, 4); total = 15; }
  }
  return { pts, bar: [0, 0], off: [0, 0], turn: 0, total };
}

export const cloneBG = (s: BG): BG => ({ pts: s.pts.slice(), bar: [s.bar[0], s.bar[1]], off: [s.off[0], s.off[1]], turn: s.turn, total: s.total });

export function pips(s: BG, p: Side): number {
  let t = s.bar[p] * 25;
  for (let q = 1; q <= 24; q++) t += own(s, p, q) * q;
  return t;
}

const allHome = (s: BG, p: Side): boolean => {
  if (s.bar[p] > 0) return false;
  for (let q = 7; q <= 24; q++) if (own(s, p, q) > 0) return false;
  return true;
};

export function singleMoves(s: BG, p: Side, die: number): Mv[] {
  const out: Mv[] = [];
  const blocked = (to: number) => oppAt(s, p, to) >= 2;
  if (s.bar[p] > 0) {
    const to = 25 - die;
    if (!blocked(to)) out.push({ from: 25, to, die, hit: oppAt(s, p, to) === 1 });
    return out;
  }
  const home = allHome(s, p);
  for (let q = 24; q >= 1; q--) {
    if (own(s, p, q) === 0) continue;
    const to = q - die;
    if (to >= 1) { if (!blocked(to)) out.push({ from: q, to, die, hit: oppAt(s, p, to) === 1 }); }
    else if (home) {
      if (to === 0) out.push({ from: q, to: 0, die, hit: false });
      else {
        let behind = false;
        for (let r = q + 1; r <= 6; r++) if (own(s, p, r) > 0) { behind = true; break; }
        if (!behind) out.push({ from: q, to: 0, die, hit: false });
      }
    }
  }
  return out;
}

/** Zug ausführen (Kopie). */
export function applyMv(s: BG, p: Side, m: Mv): BG {
  const t = cloneBG(s);
  const sign = p === 0 ? 1 : -1;
  if (m.from === 25) t.bar[p]--; else t.pts[idxOf(p, m.from)] -= sign;
  if (m.to === 0) t.off[p]++;
  else {
    const i = idxOf(p, m.to);
    if (m.hit) { t.pts[i] = 0; t.bar[opp(p)]++; }
    t.pts[i] += sign;
  }
  return t;
}

export const posKey = (s: BG): string => `${s.pts.join(',')}|${s.bar.join(',')}|${s.off.join(',')}|${s.turn}`;

export interface Seq { moves: Mv[]; end: BG }

/**
 * Alle zulässigen Zugfolgen für einen Wurf – nach den Pflichtregeln:
 * so viele Würfel wie möglich nutzen; kann nur einer genutzt werden, den größeren.
 * `dedupe`: gleiche Endstellungen nur einmal (für die KI); ohne Dedupe bleiben alle Reihenfolgen (für die Bedienung).
 */
export function sequences(s: BG, p: Side, dice: number[], dedupe = false): Seq[] {
  const doubles = dice.length === 2 && dice[0] === dice[1];
  const list = doubles ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
  const res: Seq[] = [];
  const seen = new Set<string>();
  const walk = (cur: BG, left: number[], done: Mv[]) => {
    let any = false;
    const tried = new Set<number>();
    for (let k = 0; k < left.length; k++) {
      const d = left[k];
      if (tried.has(d)) continue;
      tried.add(d);
      const rest = left.slice(0, k).concat(left.slice(k + 1));
      for (const m of singleMoves(cur, p, d)) {
        any = true;
        walk(applyMv(cur, p, m), rest, done.concat(m));
      }
    }
    if (!any) {
      if (dedupe) { const key = posKey(cur); if (seen.has(key)) return; seen.add(key); }
      res.push({ moves: done, end: cur });
    }
  };
  walk(s, list, []);
  let max = 0;
  for (const r of res) if (r.moves.length > max) max = r.moves.length;
  let out = res.filter((r) => r.moves.length === max);
  if (max === 1 && !doubles && dice.length === 2) {
    const big = Math.max(dice[0], dice[1]);
    const withBig = out.filter((r) => r.moves[0].die === big);
    if (withBig.length) out = withBig;
  }
  if (max === 0) return [];
  return out;
}

export interface Outcome { winner: Side; points: number; kind: 'einfach' | 'gammon' | 'backgammon' }

export const finished = (s: BG): Side | -1 => (s.off[0] >= s.total ? 0 : s.off[1] >= s.total ? 1 : -1);

/** Ergebnis mit Würfelwert. `jacoby`: Gammons zählen nur bei gedrehtem Würfel. */
export function outcome(s: BG, cube: number, cubeTurned: boolean, jacoby = false): Outcome | null {
  const w = finished(s);
  if (w < 0) return null;
  const l = opp(w as Side);
  let mult = 1, kind: Outcome['kind'] = 'einfach';
  if (s.off[l] === 0 && s.total > 3) {
    let back = s.bar[l] > 0;
    for (let q = 19; q <= 24 && !back; q++) if (own(s, l, q) > 0) back = true;
    kind = back ? 'backgammon' : 'gammon';
    mult = back ? 3 : 2;
    if (jacoby && !cubeTurned) { mult = 1; kind = 'einfach'; }
  }
  return { winner: w as Side, points: mult * cube, kind };
}

/** Rennposition: kein Kontakt mehr. */
export function isRace(s: BG): boolean {
  let maxW = -1, minB = 99;
  for (let i = 0; i < 24; i++) { if (s.pts[i] > 0) maxW = Math.max(maxW, i); if (s.pts[i] < 0) minB = Math.min(minB, i); }
  if (s.bar[0] > 0) maxW = 24;
  if (s.bar[1] > 0) minB = -1;
  if (maxW < 0 || minB === 99) return true;
  return maxW < minB;
}

export const ALL_ROLLS: [number, number][] = (() => {
  const r: [number, number][] = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) r.push([a, b]);
  return r;
})();
export const rollWeight = (r: [number, number]) => (r[0] === r[1] ? 1 : 2);

// ───────── Notation ─────────

const pn = (q: number) => (q === 25 ? 'Bar' : q === 0 ? 'Aus' : String(q));
/** Standardnotation, z. B. 13/7 8/7 mit Stern bei Treffern; Ketten werden zusammengefasst, gleiche Züge gebündelt (24/20(2)). */
export function notate(moves: Mv[]): string {
  const chains: { pts: number[]; hits: boolean[] }[] = [];
  for (const m of moves) {
    const c = chains.find((x) => x.pts[x.pts.length - 1] === m.from && m.from !== 25);
    if (c) { c.pts.push(m.to); c.hits.push(m.hit); } else chains.push({ pts: [m.from, m.to], hits: [false, m.hit] });
  }
  const counts = new Map<string, number>();
  for (const c of chains) {
    const last = c.pts.length - 1;
    const txt = c.pts.map((q, i) => (i === 0 || i === last || c.hits[i] ? pn(q) + (c.hits[i] ? '*' : '') : '')).filter(Boolean).join('/');
    counts.set(txt, (counts.get(txt) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [k, n] of counts) parts.push(n > 1 ? `${k}(${n})` : k);
  return parts.join(' ') || 'kein Zug';
}

/** Zugfolge ↔ Schlüssel (reihenfolgeunabhängig) zum Vergleichen. */
export const seqKey = (moves: Mv[]): string => moves.map((m) => `${m.from}>${m.to}`).sort().join(' ');

// ───────── Würfel ─────────

export function rollDice(rnd: () => number): [number, number] { return [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)]; }
