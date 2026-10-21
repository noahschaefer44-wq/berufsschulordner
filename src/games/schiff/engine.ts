// Seeschlacht (Schiffe versenken): Flotten, Schüsse, Abstandsregel, Wahrscheinlichkeitskarte und KI-Zielwahl.
import type { Rng } from '../shared/rng';

export type Rules = {
  n: number;
  lens: number[];
  /** Schiffe dürfen sich nicht berühren (auch nicht diagonal) */
  spacing: boolean;
  /** Pro Zug so viele Schüsse, wie man noch Schiffe hat */
  salvo: boolean;
  /** Nebel: „versenkt“ wird nicht gemeldet */
  fog: boolean;
  /** Radar-Aufklärungen pro Spieler (0 = keine) */
  radar: number;
  /** Wer trifft, schießt noch einmal */
  chain: boolean;
};

export const FLEETS: Record<string, { name: string; lens: number[]; n: number }> = {
  klassisch: { name: 'Klassisch (5-4-3-3-2)', lens: [5, 4, 3, 3, 2], n: 10 },
  klein: { name: 'Klein (4-3-2-2)', lens: [4, 3, 2, 2], n: 8 },
  gross: { name: 'Groß (6-5-4-4-3-3-2)', lens: [6, 5, 4, 4, 3, 3, 2], n: 12 },
  flaute: { name: 'Nur Kleinboote (2×5)', lens: [2, 2, 2, 2, 2], n: 8 },
};

export const DEFAULT_RULES: Rules = { n: 10, lens: [5, 4, 3, 3, 2], spacing: false, salvo: false, fog: false, radar: 0, chain: false };

export interface Ship { id: number; len: number; cells: number[] }
export interface Side { ships: Ship[]; /** Schüsse auf dieses Brett: 0 nichts, 1 Wasser, 2 Treffer */ shots: Uint8Array }

export const newSide = (n: number, ships: Ship[] = []): Side => ({ ships, shots: new Uint8Array(n * n) });
export const idx = (n: number, x: number, y: number) => y * n + x;

/** Zellen eines Schiffs ab (x, y) in Richtung h = waagerecht / v = senkrecht; null wenn außerhalb. */
export function shipCells(n: number, x: number, y: number, len: number, horizontal: boolean): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const cx = horizontal ? x + i : x, cy = horizontal ? y : y + i;
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return null;
    out.push(idx(n, cx, cy));
  }
  return out;
}

/** Nachbarzellen (8er-Umgebung) einer Zelle. */
export function around(n: number, i: number): number[] {
  const x = i % n, y = Math.floor(i / n);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const cx = x + dx, cy = y + dy;
    if (cx >= 0 && cy >= 0 && cx < n && cy < n) out.push(idx(n, cx, cy));
  }
  return out;
}

export function canPlace(n: number, ships: Ship[], cells: number[], spacing: boolean, ignoreId = -1): boolean {
  const used = new Set<number>();
  const near = new Set<number>();
  for (const s of ships) {
    if (s.id === ignoreId) continue;
    for (const c of s.cells) { used.add(c); if (spacing) for (const a of around(n, c)) near.add(a); }
  }
  return cells.every((c) => !used.has(c) && !near.has(c));
}

export function randomFleet(n: number, lens: number[], spacing: boolean, rnd: Rng, tries = 400): Ship[] | null {
  for (let t = 0; t < tries; t++) {
    const ships: Ship[] = [];
    let ok = true;
    // Längste zuerst platzieren
    const order = lens.map((len, id) => ({ len, id })).sort((a, b) => b.len - a.len);
    for (const o of order) {
      let placed = false;
      for (let k = 0; k < 200 && !placed; k++) {
        const horizontal = rnd() < 0.5;
        const x = Math.floor(rnd() * n), y = Math.floor(rnd() * n);
        const cells = shipCells(n, x, y, o.len, horizontal);
        if (cells && canPlace(n, ships, cells, spacing)) { ships.push({ id: o.id, len: o.len, cells }); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships.sort((a, b) => a.id - b.id);
  }
  return null;
}

export type ShotResult = { kind: 'wasser' | 'treffer' | 'versenkt'; ship?: Ship; already?: boolean };

export function shipAt(side: Side, i: number): Ship | undefined { return side.ships.find((s) => s.cells.includes(i)); }
export const isSunk = (side: Side, s: Ship) => s.cells.every((c) => side.shots[c] === 2);
export const aliveShips = (side: Side) => side.ships.filter((s) => !isSunk(side, s));
export const allSunk = (side: Side) => side.ships.length > 0 && side.ships.every((s) => isSunk(side, s));

/** Schuss ausführen (verändert die Schusskarte von `side`). */
export function fire(side: Side, i: number): ShotResult {
  if (side.shots[i]) return { kind: side.shots[i] === 2 ? 'treffer' : 'wasser', already: true };
  const s = shipAt(side, i);
  if (!s) { side.shots[i] = 1; return { kind: 'wasser' }; }
  side.shots[i] = 2;
  return isSunk(side, s) ? { kind: 'versenkt', ship: s } : { kind: 'treffer', ship: s };
}

export const shotsPerTurn = (side: Side, salvo: boolean) => (salvo ? Math.max(1, aliveShips(side).length) : 1);

/** Radar: Zahl der Schiffszellen in der 3×3-Umgebung von i. */
export function radar(side: Side, n: number, i: number): number {
  let c = 0;
  for (const a of [i, ...around(n, i)]) if (side.ships.some((s) => s.cells.includes(a))) c++;
  return c;
}

// ───────── Wahrscheinlichkeitskarte ─────────

export interface Knowledge {
  n: number;
  /** Was der Schütze über das gegnerische Brett weiß: 0 unbekannt, 1 Wasser, 2 Treffer */
  shots: Uint8Array;
  /** Zellen versenkter Schiffe (nur wenn gemeldet) */
  sunk: Set<number>;
  /** Längen der noch nicht versenkten Schiffe, soweit bekannt */
  remaining: number[];
  spacing: boolean;
  /** Radar-Ergebnisse: Zelle → Anzahl Schiffszellen im 3×3-Feld */
  radar?: Map<number, number>;
}

export function densityMap(k: Knowledge): Float64Array {
  const { n, shots, sunk, spacing } = k;
  const dens = new Float64Array(n * n);
  // Zellen, die wegen der Abstandsregel zu versenkten Schiffen frei sind
  const blocked = new Uint8Array(n * n);
  if (spacing) for (const c of sunk) for (const a of around(n, c)) if (!sunk.has(a)) blocked[a] = 1;
  // Offene Treffer (nicht Teil eines versenkten Schiffes)
  const open: number[] = [];
  for (let i = 0; i < n * n; i++) if (shots[i] === 2 && !sunk.has(i)) open.push(i);
  const openSet = new Set(open);
  for (const len of k.remaining) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (const h of [true, false]) {
      const cells = shipCells(n, x, y, len, h);
      if (!cells) continue;
      let ok = true, covers = 0;
      for (const c of cells) {
        if (shots[c] === 1 || sunk.has(c) || blocked[c]) { ok = false; break; }
        if (openSet.has(c)) covers++;
      }
      if (!ok) continue;
      if (k.radar) {
        // Radar-Ergebnisse grob berücksichtigen: ein Feld mit Anzahl 0 enthält kein Schiff in der Umgebung
        for (const [r, v] of k.radar) if (v === 0 && cells.some((c) => c === r || around(n, r).includes(c))) { ok = false; break; }
        if (!ok) continue;
      }
      const w = covers > 0 ? Math.pow(40, covers) : 1;
      for (const c of cells) if (shots[c] === 0) dens[c] += w;
    }
  }
  // Radar mit Treffern: Felder rund um ein Radar > 0 bekommen einen Bonus
  if (k.radar) for (const [r, v] of k.radar) if (v > 0) for (const a of [r, ...around(n, r)]) if (shots[a] === 0) dens[a] *= 1 + v * 0.35;
  return dens;
}

/** Bester Schuss: größte Dichte; bei Gleichstand zufällig. `parity` bevorzugt Schachbrett-Muster, wenn nichts getroffen ist. */
export function bestShots(k: Knowledge, count: number, rnd: Rng, parity = true): number[] {
  const d = densityMap(k);
  const open = [...k.shots].some((v, i) => v === 2 && !k.sunk.has(i));
  const minLen = Math.min(...k.remaining, 9);
  const cand: { i: number; v: number }[] = [];
  for (let i = 0; i < d.length; i++) {
    if (k.shots[i]) continue;
    let v = d[i];
    if (parity && !open && minLen >= 2) { const x = i % k.n, y = Math.floor(i / k.n); if ((x + y) % 2 !== 0 && minLen === 2) v *= 0.55; }
    cand.push({ i, v: v * (0.98 + rnd() * 0.04) });
  }
  cand.sort((a, b) => b.v - a.v);
  return cand.slice(0, count).map((c) => c.i);
}

/** Schwache KI: zufällig, aber nach einem Treffer die Nachbarn. */
export function huntShot(k: Knowledge, rnd: Rng, smart: boolean): number {
  const { n, shots } = k;
  const free: number[] = [];
  for (let i = 0; i < n * n; i++) if (!shots[i]) free.push(i);
  if (smart) {
    const targets: number[] = [];
    for (let i = 0; i < n * n; i++) {
      if (shots[i] !== 2 || k.sunk.has(i)) continue;
      const x = i % n, y = Math.floor(i / n);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cx = x + dx, cy = y + dy;
        if (cx >= 0 && cy >= 0 && cx < n && cy < n && !shots[idx(n, cx, cy)]) targets.push(idx(n, cx, cy));
      }
    }
    if (targets.length) return targets[Math.floor(rnd() * targets.length)];
  }
  return free[Math.floor(rnd() * free.length)];
}

export function chooseShots(level: number, k: Knowledge, count: number, rnd: Rng): number[] {
  if (level <= 1) { const out: number[] = []; const kk = { ...k, shots: k.shots.slice() }; for (let c = 0; c < count; c++) { const i = huntShot(kk, rnd, false); kk.shots[i] = 1; out.push(i); } return out; }
  if (level === 2) { const out: number[] = []; const kk = { ...k, shots: k.shots.slice() }; for (let c = 0; c < count; c++) { const i = huntShot(kk, rnd, true); kk.shots[i] = 1; out.push(i); } return out; }
  if (level === 3) return bestShots({ ...k, remaining: k.remaining.length ? k.remaining : [2] }, count, rnd, true).slice(0, count);
  return bestShots(k, count, rnd, level >= 4);
}

/** Wissensstand des Schützen über Brett `target` aus seinen Schüssen. */
export function knowledgeOf(target: Side, rules: Rules, radarReads?: Map<number, number>): Knowledge {
  const sunk = new Set<number>();
  const remaining: number[] = [];
  for (const s of target.ships) {
    if (isSunk(target, s)) { if (!rules.fog) for (const c of s.cells) sunk.add(c); else remaining.push(s.len); }
    else remaining.push(s.len);
  }
  // Im Nebel bleiben alle Längen offen (die KI weiß nicht, was versenkt ist)
  return { n: rules.n, shots: target.shots.slice(), sunk, remaining: rules.fog ? target.ships.map((s) => s.len) : remaining, spacing: rules.spacing, radar: radarReads };
}

/** KI-Aufstellung: zufällig, aber Rand- und Mitte-Vorlieben gemischt, damit sie nicht berechenbar ist. */
export function aiFleet(rules: Rules, rnd: Rng): Ship[] {
  return randomFleet(rules.n, rules.lens, rules.spacing, rnd) ?? randomFleet(rules.n, rules.lens, false, rnd) ?? [];
}

/** Anzahl nötiger Schüsse einer KI-Stufe, um eine zufällige Flotte zu versenken (für Tests und Bewertung). */
export function simulate(level: number, rules: Rules, rnd: Rng, limit = 400): number {
  const fleet = aiFleet(rules, rnd);
  const side = newSide(rules.n, fleet);
  let shots = 0;
  while (!allSunk(side) && shots < limit) {
    const k = knowledgeOf(side, rules);
    const [i] = chooseShots(level, k, 1, rnd);
    fire(side, i);
    shots++;
  }
  return shots;
}
