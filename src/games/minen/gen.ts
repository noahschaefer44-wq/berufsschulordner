// Erzeugt Minenfelder – auch „ohne Raten“ (mit der Logik des Lösers geprüft).
import type { Rng } from '../shared/rng';
import { type Cfg, boardFromMines, newBoard, randomMines, safeZone } from './engine';
import { simulate } from './solve';

export interface GenOpts {
  noGuess: boolean;
  /** Erster Klick öffnet immer eine Fläche (Nullfeld) */
  opening: boolean;
  /** Zeitbudget in Millisekunden für die Suche nach einem rätselfreien Feld */
  budgetMs?: number;
}
export interface GenResult { mines: number[]; guessFree: boolean; tries: number; left: number }

export function generate(cfg: Cfg, first: number, rng: Rng, o: GenOpts): GenResult {
  const probe = newBoard(cfg);
  let opening = o.opening;
  // Kleine oder sehr dichte Felder: Öffnung nicht erzwingbar
  if (cfg.w * cfg.h - cfg.mines < probe.nb[first].length + 1) opening = false;
  let forbid = safeZone(probe, first, opening);
  if (cfg.w * cfg.h - forbid.size < cfg.mines) forbid = safeZone(probe, first, false);
  if (!o.noGuess) return { mines: randomMines(cfg, rng, forbid), guessFree: false, tries: 1, left: 0 };
  const t0 = Date.now();
  const budget = o.budgetMs ?? 4000;
  let best: GenResult | null = null;
  let tries = 0;
  while (true) {
    tries++;
    const mines = randomMines(cfg, rng, forbid);
    const b = boardFromMines(cfg, mines);
    const r = simulate(b, first);
    if (r.solved) return { mines, guessFree: true, tries, left: 0 };
    if (!best || r.left < best.left) best = { mines, guessFree: false, tries, left: r.left };
    if (Date.now() - t0 > budget) break;
  }
  return { ...best!, tries };
}
