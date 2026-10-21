// Code-Knacker (Mastermind): Bewertung, Kandidatenmenge und Lösungsstrategien (zufällig, erster, Entropie, Minimax).
import type { Rng } from '../shared/rng';

export interface Cfg {
  pegs: number;
  colors: number;
  /** Farben dürfen mehrfach vorkommen */
  dup: boolean;
  rows: number;
  /** Nur schwarze Stifte werden angezeigt (keine weißen) */
  blackOnly?: boolean;
}

export type Code = number[];
export type Fb = [number, number];

export const PRESETS: Record<string, { name: string; info: string; cfg: Cfg }> = {
  klassisch: { name: 'Klassisch', info: '4 Stifte, 6 Farben, Farben dürfen doppelt sein – wie das Original.', cfg: { pegs: 4, colors: 6, dup: true, rows: 10 } },
  mini: { name: 'Mini', info: '3 Stifte, 5 Farben: ein kurzes Spiel zum Einstieg.', cfg: { pegs: 3, colors: 5, dup: true, rows: 7 } },
  bullen: { name: 'Bullen & Kühe', info: '4 Ziffern, alle verschieden (0–9) – die Zifferversion des Spiels.', cfg: { pegs: 4, colors: 10, dup: false, rows: 10 } },
  super: { name: 'Super', info: '5 Stifte, 8 Farben: deutlich mehr Möglichkeiten.', cfg: { pegs: 5, colors: 8, dup: true, rows: 12 } },
  mega: { name: 'Mega', info: '5 Stifte, 9 Farben, ohne Wiederholung.', cfg: { pegs: 5, colors: 9, dup: false, rows: 12 } },
  schwarz: { name: 'Nur Schwarz', info: 'Du erfährst nur, wie viele Stifte an der richtigen Stelle sitzen.', cfg: { pegs: 4, colors: 6, dup: true, rows: 14, blackOnly: true } },
};

export const spaceSize = (cfg: Cfg): number => {
  if (cfg.dup) return Math.pow(cfg.colors, cfg.pegs);
  let n = 1;
  for (let i = 0; i < cfg.pegs; i++) n *= cfg.colors - i;
  return n;
};

/** Auswertung: [richtig platziert, richtige Farbe an falscher Stelle]. */
export function feedback(secret: Code, guess: Code, cfg?: Cfg): Fb {
  let b = 0;
  const cs = new Array<number>(16).fill(0), cg = new Array<number>(16).fill(0);
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) b++;
    else { cs[secret[i]]++; cg[guess[i]]++; }
  }
  let w = 0;
  for (let c = 0; c < 16; c++) w += Math.min(cs[c], cg[c]);
  return cfg?.blackOnly ? [b, 0] : [b, w];
}

export const fbKey = (f: Fb) => f[0] * 16 + f[1];
export const isSolved = (f: Fb, cfg: Cfg) => f[0] === cfg.pegs;

/** Alle gültigen Codes (nur bei überschaubarem Raum). */
export function allCodes(cfg: Cfg, limit = 70000): Code[] {
  if (spaceSize(cfg) > limit) return [];
  const out: Code[] = [];
  const cur: Code = [];
  const used = new Array<boolean>(cfg.colors).fill(false);
  const go = () => {
    if (cur.length === cfg.pegs) { out.push(cur.slice()); return; }
    for (let c = 0; c < cfg.colors; c++) {
      if (!cfg.dup && used[c]) continue;
      cur.push(c); used[c] = true;
      go();
      cur.pop(); used[c] = false;
    }
  };
  go();
  return out;
}

export function randomCode(cfg: Cfg, rnd: Rng): Code {
  const out: Code = [];
  const pool = Array.from({ length: cfg.colors }, (_, i) => i);
  for (let i = 0; i < cfg.pegs; i++) {
    if (cfg.dup) out.push(Math.floor(rnd() * cfg.colors));
    else { const k = Math.floor(rnd() * pool.length); out.push(pool[k]); pool.splice(k, 1); }
  }
  return out;
}

export const isValid = (code: Code, cfg: Cfg) => code.length === cfg.pegs && code.every((c) => c >= 0 && c < cfg.colors) && (cfg.dup || new Set(code).size === code.length);

export interface Turn { guess: Code; fb: Fb }

export const consistent = (code: Code, history: Turn[], cfg: Cfg) => history.every((t) => { const f = feedback(code, t.guess, cfg); return f[0] === t.fb[0] && f[1] === t.fb[1]; });
export const filterConsistent = (cands: Code[], history: Turn[], cfg: Cfg) => cands.filter((c) => consistent(c, history, cfg));

// ───────── Strategie ─────────

/** Verteilung der Rückmeldungen eines Rateversuchs über die Kandidaten. */
function partition(guess: Code, cands: Code[], cfg: Cfg): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cands) { const k = fbKey(feedback(c, guess, cfg)); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

export const worstCase = (guess: Code, cands: Code[], cfg: Cfg) => Math.max(...partition(guess, cands, cfg).values());
export function entropy(guess: Code, cands: Code[], cfg: Cfg): number {
  const n = cands.length;
  let h = 0;
  for (const v of partition(guess, cands, cfg).values()) { const p = v / n; h -= p * Math.log2(p); }
  return h;
}
/** Erwartete Restzahl der Kandidaten nach dem Versuch. */
export function expectedLeft(guess: Code, cands: Code[], cfg: Cfg): number {
  let s = 0;
  for (const v of partition(guess, cands, cfg).values()) s += v * v;
  return s / cands.length;
}

function sample<T>(a: T[], n: number, rnd: Rng): T[] {
  if (a.length <= n) return a;
  const out: T[] = [];
  const idx = new Set<number>();
  while (out.length < n) { const i = Math.floor(rnd() * a.length); if (!idx.has(i)) { idx.add(i); out.push(a[i]); } }
  return out;
}

export type Method = 'zufall' | 'erster' | 'entropie' | 'minimax';

/**
 * Nächster Versuch des Lösers. `all`: alle Codes (für Versuche außerhalb der Kandidatenmenge); leer bei riesigem Raum.
 */
export function chooseGuess(cands: Code[], all: Code[], history: Turn[], cfg: Cfg, method: Method, rnd: Rng): Code {
  if (!cands.length) return randomCode(cfg, rnd);
  if (cands.length === 1) return cands[0];
  if (history.length === 0) {
    // Erster Versuch: bewährte Muster (AABB bzw. AABBC …)
    if (cfg.dup && cfg.pegs >= 4 && method !== 'zufall') { const g = []; for (let i = 0; i < cfg.pegs; i++) g.push(Math.floor(i / 2)); return g; }
    if (!cfg.dup && method !== 'zufall') return Array.from({ length: cfg.pegs }, (_, i) => i);
  }
  if (method === 'zufall') return cands[Math.floor(rnd() * cands.length)];
  if (method === 'erster') return cands[0];
  const evalCands = sample(cands, 250, rnd);
  let pool: Code[] = sample(cands, 160, rnd);
  if (method === 'minimax' && all.length) pool = pool.concat(sample(all, cands.length > 40 ? 120 : 400, rnd));
  let best = pool[0], bestScore = Infinity;
  const candSet = new Set(cands.map((c) => c.join('')));
  for (const g of pool) {
    const score = method === 'entropie'
      ? -entropy(g, evalCands, cfg)
      : worstCase(g, evalCands, cfg) * 1000 + expectedLeft(g, evalCands, cfg) - (candSet.has(g.join('')) ? 0.5 : 0);
    if (score < bestScore) { bestScore = score; best = g; }
  }
  return best;
}

/** Löser spielt ein ganzes Spiel (für Tests und Bewertung); gibt die Zahl der Versuche zurück. */
export function solveGame(secret: Code, cfg: Cfg, method: Method, rnd: Rng, maxRows = 30): number {
  const all = allCodes(cfg);
  let cands = all.length ? all : [];
  const hist: Turn[] = [];
  for (let r = 1; r <= maxRows; r++) {
    const g = chooseGuess(cands, all, hist, cfg, method, rnd);
    const fb = feedback(secret, g, cfg);
    hist.push({ guess: g, fb });
    if (isSolved(fb, cfg)) return r;
    cands = filterConsistent(cands, hist, cfg);
  }
  return maxRows + 1;
}

/** Anzahl der noch möglichen Codes (exakt bei kleinem Raum). */
export function countLeft(all: Code[], history: Turn[], cfg: Cfg): number {
  return all.length ? filterConsistent(all, history, cfg).length : -1;
}

/** Wie gut war ein Versuch? Anteil der Kandidaten, die er herausfiltert, im Vergleich zum besten Versuch. */
export function guessRating(cands: Code[], guess: Code, all: Code[], cfg: Cfg, rnd: Rng): number {
  if (cands.length <= 1) return 1;
  const mine = entropy(guess, cands, cfg);
  const best = Math.max(mine, ...sample(cands.concat(sample(all, 200, rnd)), 220, rnd).map((g) => entropy(g, cands, cfg)));
  return best > 0 ? Math.min(1, mine / best) : 1;
}

// ───────── Rätsel ─────────

export interface Puzzle { cfg: Cfg; secret: Code; history: Turn[] }

/** Rätsel: Gegeben sind Versuche mit Auswertung; es gibt genau einen passenden Code. */
export function genPuzzle(cfg: Cfg, rnd: Rng, maxGuesses = 6): Puzzle | null {
  const all = allCodes(cfg);
  if (!all.length) return null;
  for (let t = 0; t < 60; t++) {
    const secret = randomCode(cfg, rnd);
    const hist: Turn[] = [];
    let cands = all;
    while (cands.length > 1 && hist.length < maxGuesses) {
      // Zufälliger, aber mit dem bisherigen Wissen noch möglicher oder sinnvoller Versuch
      const g = rnd() < 0.7 ? cands[Math.floor(rnd() * cands.length)] : randomCode(cfg, rnd);
      const fb = feedback(secret, g, cfg);
      if (hist.some((h) => h.guess.join() === g.join())) continue;
      const next = cands.filter((c) => { const f = feedback(c, g, cfg); return f[0] === fb[0] && f[1] === fb[1]; });
      if (next.length === cands.length) continue; // bringt nichts
      hist.push({ guess: g, fb });
      cands = next;
    }
    if (cands.length === 1 && hist.length >= 3 && hist.length <= maxGuesses) return { cfg, secret, history: hist };
  }
  return null;
}
