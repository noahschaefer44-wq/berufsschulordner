// Zufall mit Startwert (für Tagesrätsel, nachspielbare Partien und Tests).

export type Rng = () => number;

/** Mulberry32: kleiner, schneller Zufallsgenerator mit 32-Bit-Zustand. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Text → 32-Bit-Zahl (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const rngFrom = (seed: number | string): Rng => mulberry32(typeof seed === 'number' ? seed : hashString(seed));
export const randInt = (r: Rng, n: number) => Math.floor(r() * n);
export const pickOf = <T,>(r: Rng, a: readonly T[]): T => a[randInt(r, a.length)];

export function shuffled<T>(r: Rng, a: readonly T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Datum als Schlüssel, z. B. „2026-10-20“. */
export const todayKey = (d = new Date()) => d.toLocaleDateString('sv-SE');

/** Tages-Startwert je Spiel: für alle Menschen am selben Tag gleich. */
export const dailySeed = (game: string, variant = '', d = new Date()) => hashString(`${game}|${variant}|${todayKey(d)}`);

/** Neuer zufälliger Startwert. */
export const freshSeed = () => (Math.random() * 4294967296) >>> 0;
