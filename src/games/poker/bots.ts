// Poker-Bots mit Persönlichkeit: Gewinnchance (Monte Carlo) gegen Pot-Quote, gefärbt durch Spielstil.
import { type Action, type Table, legal, pot } from './engine';
import { equity } from './equity';
import type { Rng } from '../shared/rng';

export interface Style {
  id: string;
  name: string;
  info: string;
  /** 0 locker … 1 sehr eng: verschiebt die Mindestchance zum Mitgehen */
  tight: number;
  /** 0 passiv … 1 aggressiv: Häufigkeit und Größe von Einsätzen */
  aggr: number;
  /** Anteil Bluffs bei schwacher Hand */
  bluff: number;
  /** Wie stark der Bot Gegnereinsätzen glaubt (0 = ignoriert, 1 = viel Respekt) */
  respect: number;
}

export const STYLES: Style[] = [
  { id: 'fels', name: 'Fels', info: 'Spielt sehr wenige Hände, setzt selten – wenn er setzt, hat er etwas.', tight: 0.85, aggr: 0.35, bluff: 0.02, respect: 0.9 },
  { id: 'hai', name: 'Hai', info: 'Eng, aber aggressiv: nimmt dir Pötte ab.', tight: 0.65, aggr: 0.8, bluff: 0.12, respect: 0.6 },
  { id: 'karl', name: 'Kneipen-Karl', info: 'Geht mit fast allem mit und erhöht selten.', tight: 0.1, aggr: 0.2, bluff: 0.03, respect: 0.2 },
  { id: 'zocker', name: 'Zocker', info: 'Locker und wild: viele Einsätze, viele Bluffs.', tight: 0.2, aggr: 0.9, bluff: 0.3, respect: 0.25 },
  { id: 'rechner', name: 'Rechner', info: 'Spielt nach Wahrscheinlichkeit, ausgewogen.', tight: 0.5, aggr: 0.55, bluff: 0.1, respect: 0.7 },
  { id: 'zitrone', name: 'Zitrone', info: 'Anfänger: lässt sich leicht bluffen und zahlt zu oft.', tight: 0.3, aggr: 0.3, bluff: 0.05, respect: 0.4 },
];

export const styleOf = (id?: string) => STYLES.find((s) => s.id === id) ?? STYLES[4];

/** Entscheidung des Bots am Zug. level 1–5: Genauigkeit der Berechnung. */
export function botAction(t: Table, rnd: Rng, level = 3, bias = 0): { action: Action; equity: number } {
  const seat = t.toAct;
  const p = t.players[seat];
  const st = styleOf(p.style);
  const lg = legal(t, seat);
  const opponents = t.players.filter((q, i) => i !== seat && !q.out && !q.folded).length;
  const sims = [60, 120, 220, 350, 600][Math.min(4, Math.max(0, level - 1))];
  const e = equity(p.hole, t.board, opponents, t.game, rnd, sims).eq;
  const potNow = pot(t);
  const toCall = lg.call;
  const odds = toCall > 0 ? toCall / (potNow + toCall) : 0;
  // Faire Chance gegen n Gegner ist 1/(n+1); „rel“ ist die Stärke relativ dazu
  const fair = 1 / (opponents + 1);
  const rel = e / fair;
  const noise = (rnd() - 0.5) * (level >= 4 ? 0.04 : 0.12);
  const strengthNow = e + noise;
  const bet = (frac: number) => {
    const target = t.currentBet + Math.max(t.bb, Math.round(potNow * frac + toCall));
    return Math.min(lg.maxRaise, Math.max(lg.minRaise, target));
  };

  // Kann nicht erhöhen: nur Call/Fold/Check
  const canRaise = lg.canRaise;
  const preflop = t.phase === 'preflop';

  if (toCall === 0) {
    // Check oder Einsatz
    const valueThr = fair * (1.55 + st.tight * 0.5 - st.aggr * 0.35);
    if (canRaise && strengthNow > valueThr && rnd() < 0.35 + st.aggr * 0.6) {
      const frac = 0.4 + Math.min(0.7, (rel - 1.5) * 0.25) + st.aggr * 0.2;
      return { action: { kind: 'raise', to: bet(frac) }, equity: e };
    }
    if (canRaise && !preflop && rnd() < st.bluff * (opponents <= 2 ? 1.2 : 0.5) && strengthNow < fair * 0.9) return { action: { kind: 'raise', to: bet(0.6) }, equity: e };
    return { action: { kind: 'check' }, equity: e };
  }

  // Einem Einsatz gegenüber: Respekt vor großen Einsätzen (Erwartung stärkerer Hände)
  const bigBet = toCall / Math.max(1, potNow);
  const need = odds * (0.88 + st.tight * 0.35 + st.respect * Math.min(0.5, bigBet) * 0.5) + bias * 0.12;
  const raiseThr = Math.max(need + 0.1, fair * (1.9 + st.tight * 0.4 - st.aggr * 0.4));

  if (canRaise && strengthNow > raiseThr && rnd() < 0.2 + st.aggr * 0.65) {
    const frac = 0.55 + Math.min(0.8, (rel - 1.8) * 0.25) + st.aggr * 0.2;
    return { action: { kind: 'raise', to: bet(frac) }, equity: e };
  }
  if (strengthNow > need) {
    // Sehr kleine Reste: lieber All-in als zerstückeln
    return { action: { kind: 'call' }, equity: e };
  }
  if (canRaise && rnd() < st.bluff * 0.5 && toCall <= potNow * 0.6 && opponents <= 2) return { action: { kind: 'raise', to: bet(0.9) }, equity: e };
  // Billig mitgehen, wenn der Bot locker ist und der Call winzig
  if (toCall <= t.bb && rnd() < (1 - st.tight) * 0.7) return { action: { kind: 'call' }, equity: e };
  return { action: { kind: 'fold' }, equity: e };
}
