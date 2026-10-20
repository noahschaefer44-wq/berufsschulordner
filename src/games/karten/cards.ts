// Spielkarten: Kodierung, Mischen, Microsoft-FreeCell-Austeilung (nummerierte Spiele).
import { type Rng, mulberry32, shuffled } from '../shared/rng';

/** id 0..51: Farbe = ⌊id/13⌋ (0 ♠, 1 ♥, 2 ♦, 3 ♣), Rang = id % 13 (0 = Ass … 12 = König). uid unterscheidet Doppelkarten (Spider). */
export interface Card { id: number; up: boolean; uid: number }

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'] as const;
export const RANKS_EN = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['Pik', 'Herz', 'Karo', 'Kreuz'] as const;

export const rankOf = (id: number) => id % 13;
export const suitOf = (id: number) => Math.floor(id / 13);
export const isRed = (id: number) => { const s = suitOf(id); return s === 1 || s === 2; };
export const cardName = (id: number) => `${SUITS[suitOf(id)]} ${RANKS[rankOf(id)]}`;
export const mk = (id: number, uid: number, up = false): Card => ({ id, up, uid });

export function newDeck(sets = 1, suitMode: 1 | 2 | 4 = 4): Card[] {
  const out: Card[] = [];
  let uid = 0;
  for (let k = 0; k < sets; k++) for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) {
    const suit = suitMode === 4 ? s : suitMode === 2 ? (s % 2 === 0 ? 0 : 1) : 0;
    out.push(mk(suit * 13 + r, uid++));
  }
  return out;
}

export const shuffleDeck = (cards: Card[], rng: Rng): Card[] => shuffled(rng, cards);

/** Microsoft-FreeCell: Spielnummer → 52 Karten (Kartenwert c: Rang = c>>2, Farbe = c&3 mit Kreuz, Karo, Herz, Pik). */
export function msDeal(num: number): Card[] {
  let seed = num >>> 0;
  const rand = () => { seed = (Math.imul(seed, 214013) + 2531011) >>> 0; return (seed >>> 16) & 0x7fff; };
  const cards = Array.from({ length: 52 }, (_, i) => i);
  const deck: number[] = [];
  let left = 52;
  for (let i = 0; i < 52; i++) {
    const j = rand() % left;
    deck.push(cards[j]);
    cards[j] = cards[--left];
  }
  const suitMap = [3, 2, 1, 0]; // Kreuz→3, Karo→2, Herz→1, Pik→0
  return deck.map((c, i) => mk(suitMap[c & 3] * 13 + (c >> 2), i, true));
}

export const rngOf = (seed: number) => mulberry32(seed);

export const clonePiles = (p: Card[][]): Card[][] => p.map((x) => x.map((c) => ({ ...c })));
export const cloneCard = (c: Card): Card => ({ ...c });
