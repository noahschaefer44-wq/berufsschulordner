// Taktik-Aufgaben: Mitten in einem Gefecht den besten nächsten Schuss finden.
import { DEFAULT_RULES, type Rules, type Ship, aiFleet, allSunk, chooseShots, densityMap, fire, isSunk, knowledgeOf, newSide } from './engine';
import { mulberry32 } from '../shared/rng';

export interface Tactic {
  id: string;
  rules: Rules;
  shots: Uint8Array;
  /** versenkte Schiffe (sichtbar) */
  sunk: Ship[];
  remaining: number[];
  heat: Float64Array;
  max: number;
  best: number[];
}

export function genTactic(seed: number, spacing = false): Tactic | null {
  for (let t = 0; t < 60; t++) {
    const rnd = mulberry32(seed * 6151 + t * 977);
    const rules: Rules = { ...DEFAULT_RULES, spacing };
    const side = newSide(rules.n, aiFleet(rules, rnd));
    const k = 6 + Math.floor(rnd() * 30);
    let ok = true;
    for (let i = 0; i < k; i++) {
      const [c] = chooseShots(2 + Math.floor(rnd() * 3), knowledgeOf(side, rules), 1, rnd);
      fire(side, c);
      if (allSunk(side)) { ok = false; break; }
    }
    if (!ok) continue;
    const kn = knowledgeOf(side, rules);
    let open = false;
    for (let i = 0; i < side.shots.length; i++) if (side.shots[i] === 2 && !kn.sunk.has(i)) open = true;
    if (!open && t < 45) continue;
    const heat = densityMap(kn);
    let max = 0;
    for (let i = 0; i < heat.length; i++) if (!side.shots[i]) max = Math.max(max, heat[i]);
    if (max <= 0) continue;
    const best: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i < heat.length; i++) if (!side.shots[i]) { vals.push(heat[i]); if (heat[i] >= max * 0.92) best.push(i); }
    vals.sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    // Aufgabe nur, wenn die Auswahl wirklich eine Rolle spielt
    if (best.length > 6 || median > max * 0.7) continue;
    return { id: `t${seed}`, rules, shots: side.shots.slice(), sunk: side.ships.filter((s) => isSunk(side, s)), remaining: side.ships.filter((s) => !isSunk(side, s)).map((s) => s.len), heat, max, best };
  }
  return null;
}

export const tacticOk = (t: Tactic, cell: number) => !t.shots[cell] && t.heat[cell] >= t.max * 0.85;
