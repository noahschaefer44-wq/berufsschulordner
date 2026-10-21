// Backgammon-KI: Stellungsbewertung (Merkmale statt Zufall), Ein-Zug-Vorausschau über alle 21 Würfe, Doppelwürfel.
import { ALL_ROLLS, type BG, type Seq, type Side, isRace, opp, own, pips, rollWeight, sequences } from './engine';
import { OPENINGS, parseBook } from './openings';
import { applyMv, posKey, startPosition } from './engine';
import type { Rng } from '../shared/rng';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Anzahl Würfe (von 36), mit denen der Gegner einen einzelnen Stein von `p` auf q schlagen kann. */
export function shots(s: BG, p: Side, q: number): number {
  const o = opp(p);
  // Eigene Punkte des Verteidigers p blockieren Zwischenfelder; Koordinaten des Gegners: q' = 25 - q
  const target = 25 - q;
  const hitters: number[] = [];
  if (s.bar[o] > 0) hitters.push(25);
  else for (let r = target + 1; r <= 24; r++) if (own(s, o, r) > 0) hitters.push(r);
  if (s.bar[o] > 0 && 25 < target + 1) return 0;
  const free = (r: number) => r < 1 || own(s, p, 25 - r) < 2; // Feld r (aus Sicht des Gegners) nicht von p besetzt
  let n = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    let hit = false;
    for (const r of hitters) {
      const d = r - target;
      if (d === a || d === b) { hit = true; break; }
      if (a !== b && d === a + b && (free(r - a) || free(r - b))) { hit = true; break; }
      if (a === b && d % a === 0 && d / a <= 4) {
        let ok = true;
        for (let k = 1; k < d / a; k++) if (!free(r - k * a)) { ok = false; break; }
        if (ok) { hit = true; break; }
      }
    }
    if (hit) n++;
  }
  return n;
}

const HOME_W = [0, 0.06, 0.15, 0.22, 0.3, 0.36, 0.3];
const ANCHOR_W: Record<number, number> = { 18: 0.22, 19: 0.12, 20: 0.34, 21: 0.28, 22: 0.12, 23: 0.1, 24: 0.1 };
const PRIME = [0, 0, 0.1, 0.35, 0.9, 1.7, 3];

/** Güte der Stellung für Seite p als Logit (positiv = p vorn), unabhängig vom Gegner berechnet. */
function side(s: BG, p: Side): number {
  let v = 0;
    for (let q = 1; q <= 6; q++) if (own(s, p, q) >= 2) { v += HOME_W[q]; }
  if (own(s, p, 7) >= 2) v += 0.25;
  if (own(s, p, 8) >= 2) v += 0.28;
  if (own(s, p, 13) >= 2) v += 0.1;
  for (const k of Object.keys(ANCHOR_W)) { const q = +k; if (own(s, p, q) >= 2) v += ANCHOR_W[q]; }
  // Blockade: längste Kette gemachter Punkte, wirksam wenn Gegner dahinter steht
  let run = 0, best = 0, bestLo = 0, curLo = 0;
  for (let q = 1; q <= 18; q++) {
    if (own(s, p, q) >= 2) { if (run === 0) curLo = q; run++; if (run > best) { best = run; bestLo = curLo; } } else run = 0;
  }
  if (best >= 3) {
    if (oppBehind(s, p, bestLo)) v += PRIME[Math.min(6, best)];
  }
  // Stapel
  const early = oppBehind(s, p, 4) && pips(s, p) > 70;
  for (let q = 1; q <= 24; q++) {
    const n = own(s, p, q);
    if (q === 13) { if (n >= 6) v -= 0.05 * (n - 5); }
    else if (q <= 2) { if (n > 2) v -= 0.12 * (n - 2); if (n > 0 && early) v -= (q === 1 ? 0.35 : 0.2) * n; }
    else if (n >= 5) v -= 0.1 * (n - 4);
    if (q >= 19 && n === 1) v -= 0.05;
  }
  return v;
}

function oppBehind(s: BG, p: Side, lo: number): boolean {
  // Gegnersteine mit eigener Koordinate (aus p-Sicht) kleiner als lo: also noch vor dem Block
  const o = opp(p);
  if (s.bar[o] > 0) return true;
  for (let r = 25 - lo + 1; r <= 24; r++) if (own(s, o, r) > 0) return true;
  return false;
}

/** Exposition: Summe der Strafen für Blots von p, wenn der Gegner am Zug ist. */
function exposure(s: BG, p: Side, weight: number): number {
  let v = 0;
  const o = opp(p);
  let oppHome = 0;
  for (let q = 1; q <= 6; q++) if (own(s, o, q) >= 2) oppHome++;
  const homeScale = 1 + 0.18 * oppHome;
  for (let q = 1; q <= 24; q++) {
    if (own(s, p, q) !== 1) continue;
    const sh = shots(s, p, q);
    if (!sh) continue;
    const lost = 25 - q;
    v += (sh / 36) * (0.3 + 0.02 * lost) * homeScale * weight;
  }
  if (s.bar[p] > 0) v += s.bar[p] * (0.5 + 0.1 * oppHome);
  return v;
}

/** Siegchance von Seite p (0–1) nach einem Zug, Gegner würfelt als nächster. */
export function winProb(s: BG, p: Side): number {
  const o = opp(p);
  if (s.off[p] >= s.total) return 1;
  if (s.off[o] >= s.total) return 0;
  const pm = pips(s, p), po = pips(s, o);
  if (isRace(s)) {
    const avg = (pm + po) / 2;
    const diff = po - pm - 4; // Gegner ist am Zug
    return sigmoid(diff / (1.2 + 0.075 * avg));
  }
  let v = 0.042 * (po - pm - 4);
  v += side(s, p) - side(s, o);
  v -= exposure(s, p, 1);
  v += exposure(s, o, 0.3);
  // Gegner auf der Bar: Tempo für p
  v += s.bar[o] * 0.35;
  // Rennlage nach Kontaktende ist oben behandelt; Blockade-Gefangene wirken im Kontakt weiter
  return sigmoid(v);
}

// ───────── Zugwahl ─────────

interface Scored { seq: Seq; p: number }

export function rankMoves(s: BG, p: Side, dice: number[], depth: 0 | 1, limit = 8): Scored[] {
  const seqs = sequences(s, p, dice, true);
  const zero: Scored[] = seqs.map((q) => ({ seq: q, p: winProb({ ...q.end, turn: opp(p) }, p) }));
  zero.sort((a, b) => b.p - a.p);
  if (depth === 0) return zero;
  const top = zero.slice(0, limit);
  const rest = zero.slice(limit);
  for (const c of top) c.p = lookahead(c.seq.end, p);
  top.sort((a, b) => b.p - a.p);
  // Nicht vertiefte Kandidaten bleiben hinter den vertieften
  return top.concat(rest.map((r) => ({ ...r, p: Math.min(r.p, top[top.length - 1]?.p ?? r.p) - 1e-6 })));
}

/** Siegchance für p, nachdem p gezogen hat: Gegner würfelt alle 21 Würfe, spielt jeweils den besten Zug (0-lagig). */
function lookahead(end: BG, p: Side): number {
  const o = opp(p);
  if (end.off[p] >= end.total) return 1;
  let sum = 0;
  for (const r of ALL_ROLLS) {
    const w = rollWeight(r);
    const seqs = sequences({ ...end, turn: o }, o, [r[0], r[1]], true);
    if (!seqs.length) { sum += w * winProb({ ...end, turn: o }, p); continue; }
    let bestO = -1, pm = 0;
    for (const q of seqs) {
      if (q.end.off[o] >= q.end.total) { bestO = 2; pm = 0; break; }
      const po = winProb({ ...q.end, turn: p }, o);
      if (po > bestO) { bestO = po; pm = 1 - po; }
    }
    sum += w * (bestO === 2 ? 0 : pm);
  }
  return sum / 36;
}

export interface Choice { seq: Seq | null; p: number }

export function chooseMove(s: BG, p: Side, dice: number[], level: number, rnd: Rng): Choice {
  const seqs = sequences(s, p, dice, true);
  if (!seqs.length) return { seq: null, p: winProb(s, p) };
  const book = level >= 3 ? bookChoice(s, p, dice, level, rnd) : null;
  if (book) return book;
  if (seqs.length === 1) return { seq: seqs[0], p: winProb({ ...seqs[0].end, turn: opp(p) }, p) };
  if (level <= 1) {
    // Anfänger: zufällig, mit Vorliebe für Schlagen und Herauswürfeln
    const w = seqs.map((q) => 1 + q.moves.filter((m) => m.hit).length * 3 + q.moves.filter((m) => m.to === 0).length * 2);
    let t = rnd() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < w.length - 1 && (t -= w[i]) > 0) i++;
    return { seq: seqs[i], p: 0.5 };
  }
  if (level === 2) {
    const sc = seqs.map((q) => ({ q, p: winProb({ ...q.end, turn: opp(p) }, p) + (rnd() - 0.5) * 0.35 }));
    sc.sort((a, b) => b.p - a.p);
    return { seq: sc[0].q, p: sc[0].p };
  }
  if (level === 3) {
    const r = rankMoves(s, p, dice, 0);
    return { seq: r[0].seq, p: r[0].p };
  }
  const r = rankMoves(s, p, dice, 1, level === 4 ? 5 : level === 5 ? 10 : 24);
  return { seq: r[0].seq, p: r[0].p };
}

// ───────── Doppelwürfel ─────────

/** Siegchance von p vor dem eigenen Wurf: Mittel über alle Würfe, jeweils mit bestem Zug. */
export function preRollProb(s: BG, p: Side): number {
  if (isRace(s)) {
    const avg = (pips(s, p) + pips(s, opp(p))) / 2;
    return sigmoid((pips(s, opp(p)) - pips(s, p) + 4) / (1.2 + 0.075 * avg));
  }
  let sum = 0;
  for (const r of ALL_ROLLS) {
    const seqs = sequences({ ...s, turn: p }, p, [r[0], r[1]], true);
    let b = winProb({ ...s, turn: opp(p) }, p) * 0.9;
    if (seqs.length) { b = 0; for (const q of seqs) b = Math.max(b, winProb({ ...q.end, turn: opp(p) }, p)); }
    sum += rollWeight(r) * b;
  }
  return sum / 36;
}

export function shouldDouble(s: BG, p: Side, level: number, rnd: Rng): boolean {
  if (level < 3) return false;
  const pr = preRollProb(s, p);
  const lo = level === 3 ? 0.74 : 0.69, hi = 0.9;
  return pr >= lo + (rnd() - 0.5) * 0.02 && pr <= hi;
}
export function shouldTake(s: BG, p: Side, level: number, rnd: Rng): boolean {
  // p ist der Annehmende; der Doppler ist am Zug und hat die Siegchance 1 − x
  const doubler = opp(p);
  const pd = preRollProb({ ...s, turn: doubler }, doubler);
  const need = level <= 2 ? 0.2 : 0.25;
  return 1 - pd + (rnd() - 0.5) * (level <= 2 ? 0.2 : 0.02) >= need;
}

/** Zugbewertung für den Fehler-Coach: Verlust an Siegchance gegenüber dem besten Zug. */
export function judge(s: BG, p: Side, dice: number[], played: Seq): { best: Scored; loss: number; list: Scored[] } {
  const list = rankMoves(s, p, dice, 1, 14);
  const key = (q: Seq) => `${q.end.pts.join(',')}|${q.end.bar.join(',')}|${q.end.off.join(',')}`;
  const mine = list.find((x) => key(x.seq) === key(played));
  const best = list[0];
  const pm = mine ? mine.p : winProb({ ...played.end, turn: opp(p) }, p);
  return { best, loss: Math.max(0, best.p - pm), list };
}

/** Allererster Zug im Standardspiel: Eröffnungsbuch statt Rechnung. */
function bookChoice(s: BG, p: Side, dice: number[], level: number, rnd: Rng): Choice | null {
  const start = startPosition();
  if (posKey({ ...s, turn: 0 }) !== posKey(start)) return null;
  const a = Math.min(dice[0], dice[1]), b = Math.max(dice[0], dice[1]);
  const o = OPENINGS.find((x) => x.roll[0] === b && x.roll[1] === a) ?? OPENINGS.find((x) => x.roll[0] === a && x.roll[1] === b);
  if (!o) return null;
  const options = [o.best, ...o.alts];
  const pick = level >= 5 || !o.alts.length || rnd() < 0.6 ? o.best : options[1 + Math.floor(rnd() * o.alts.length)];
  const moves = parseBook(pick);
  let e = s;
  for (const m of moves) e = applyMv(e, p, m);
  return { seq: { moves, end: e }, p: 0.5 };
}
