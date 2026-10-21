// Poker: Handbewertung (Hold'em, Omaha, Short Deck), Wettrunden, Nebentöpfe, Showdown.
import { type Rng, shuffled } from '../shared/rng';

export type Game = 'holdem' | 'omaha' | 'short';
export type Limit = 'no' | 'pot';

// Karten: id 0..51 wie in der Kartenspiel-Sammlung (Farbe ⌊id/13⌋, Rang id % 13 mit 0 = Ass)
export const suitOf = (id: number) => Math.floor(id / 13);
/** Stärke 0 (Zwei) … 12 (Ass) */
export const strength = (id: number) => { const r = id % 13; return r === 0 ? 12 : r - 1; };
export const cardFrom = (str: number, suit: number) => suit * 13 + (str === 12 ? 0 : str + 1);

export const HAND_NAMES = ['Hohe Karte', 'Ein Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];

export interface Hand { score: number; cat: number; name: string; best: number[] }

const P = 13;
const pack = (cat: number, ranks: number[]) => { let v = cat; for (let i = 0; i < 5; i++) v = v * P + (ranks[i] ?? 0); return v; };

/** Wert von genau fünf Karten. `short`: Short Deck (Flush schlägt Full House, A-6-7-8-9 ist eine Straße). */
export function score5(cards: number[], short = false): number {
  const st = cards.map(strength).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const counts = new Map<number, number>();
  for (const r of st) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const uniq = groups.length === 5;
  let straightHigh = -1;
  if (uniq) {
    if (st[0] - st[4] === 4) straightHigh = st[0];
    else if (!short && st[0] === 12 && st[1] === 3 && st[4] === 0) straightHigh = 3; // A-2-3-4-5
    else if (short && st[0] === 12 && st[1] === 7 && st[4] === 4) straightHigh = 7; // A-6-7-8-9
  }
  const ranks = groups.map((g) => g[0]);
  const shape = groups.map((g) => g[1]).join('');
  let cat: number;
  let tie = ranks;
  if (straightHigh >= 0 && flush) { cat = 8; tie = [straightHigh]; }
  else if (shape === '41') cat = 7;
  else if (shape === '32') cat = short ? 5 : 6;
  else if (flush) cat = short ? 6 : 5;
  else if (straightHigh >= 0) { cat = 4; tie = [straightHigh]; }
  else if (shape === '311') cat = 3;
  else if (shape === '221') cat = 2;
  else if (shape === '2111') cat = 1;
  else cat = 0;
  return pack(cat, tie);
}

export const catOf = (score: number, short = false) => {
  const c = Math.floor(score / Math.pow(P, 5));
  if (!short) return c;
  return c === 5 ? 6 : c === 6 ? 5 : c; // zurück auf Standard-Nummerierung der Namen
};

const combos = (n: number, k: number): number[][] => {
  const out: number[][] = [];
  const cur: number[] = [];
  const go = (s: number) => { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = s; i < n; i++) { cur.push(i); go(i + 1); cur.pop(); } };
  go(0);
  return out;
};
const C57 = combos(7, 5), C56 = combos(6, 5), C55 = combos(5, 5), C42 = combos(4, 2);
const B3: Record<number, number[][]> = { 3: combos(3, 3), 4: combos(4, 3), 5: combos(5, 3) };

/** Beste Hand aus Hand- und Gemeinschaftskarten. */
export function bestHand(hole: number[], board: number[], game: Game = 'holdem'): Hand {
  const short = game === 'short';
  let best = -1, bestCards: number[] = [];
  const consider = (five: number[]) => { const s = score5(five, short); if (s > best) { best = s; bestCards = five; } };
  if (game === 'omaha') {
    if (board.length < 3 || hole.length !== 4) return { score: 0, cat: 0, name: HAND_NAMES[0], best: [] };
    for (const h of C42) for (const b of B3[board.length]) consider([...h.map((i) => hole[i]), ...b.map((i) => board[i])]);
  } else {
    const all = [...hole, ...board];
    const set = all.length === 7 ? C57 : all.length === 6 ? C56 : all.length === 5 ? C55 : null;
    if (!set) return { score: 0, cat: 0, name: HAND_NAMES[0], best: [] };
    for (const c of set) consider(c.map((i) => all[i]));
  }
  const cat = best < 0 ? 0 : catOf(best, short);
  return { score: Math.max(0, best), cat, name: best < 0 ? '' : HAND_NAMES[cat], best: bestCards };
}

export const handName = (h: Hand): string => {
  if (h.cat === 8 && strength(h.best.find((c) => strength(c) === 12) ?? -1) === 12 && h.best.map(strength).sort((a, b) => b - a)[1] === 11) return 'Royal Flush';
  return h.name;
};

// ───────── Karten ─────────

export function newDeck(game: Game): number[] {
  const out: number[] = [];
  for (let id = 0; id < 52; id++) if (game !== 'short' || strength(id) >= 4) out.push(id);
  return out;
}
export const shuffleDeck = (game: Game, rnd: Rng) => shuffled(rnd, newDeck(game));
export const holeCount = (g: Game) => (g === 'omaha' ? 4 : 2);

// ───────── Tisch ─────────

export interface Player {
  name: string;
  chips: number;
  bet: number;
  total: number;
  folded: boolean;
  allIn: boolean;
  out: boolean;
  hole: number[];
  acted: boolean;
  noRaise: boolean;
  bot: boolean;
  /** Zuletzt gezeigte Aktion */
  last: string;
  style?: string;
}

export type Phase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'done';

export interface Table {
  game: Game;
  limit: Limit;
  players: Player[];
  dealer: number;
  sb: number;
  bb: number;
  ante: number;
  board: number[];
  deck: number[];
  phase: Phase;
  toAct: number;
  currentBet: number;
  lastRaise: number;
  handNo: number;
  log: string[];
  winners: { seat: number; amount: number; hand: string; cards: number[] }[];
  /** Einsätze vergangener Runden dieser Hand (ohne die aktuelle Runde) */
  potCollected: number;
}

export const mkPlayer = (name: string, chips: number, bot: boolean, style?: string): Player => ({ name, chips, bet: 0, total: 0, folded: false, allIn: false, out: false, hole: [], acted: false, noRaise: false, bot, last: '', style });

export function newTable(game: Game, limit: Limit, players: Player[], sb: number, bb: number, ante = 0): Table {
  return { game, limit, players, dealer: players.length - 1, sb, bb, ante, board: [], deck: [], phase: 'done', toAct: 0, currentBet: 0, lastRaise: bb, handNo: 0, log: [], winners: [], potCollected: 0 };
}

export const pot = (t: Table) => t.potCollected + t.players.reduce((a, p) => a + p.bet, 0);
const alive = (t: Table) => t.players.filter((p) => !p.out);
const inHand = (t: Table) => t.players.filter((p) => !p.out && !p.folded);
const canAct = (t: Table) => t.players.filter((p) => !p.out && !p.folded && !p.allIn);

const nextSeat = (t: Table, from: number, pred: (p: Player) => boolean): number => {
  const n = t.players.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (pred(t.players[i])) return i; }
  return -1;
};

function post(t: Table, seat: number, amount: number, label: string) {
  const p = t.players[seat];
  const x = Math.min(amount, p.chips);
  p.chips -= x; p.bet += x; p.total += x;
  if (p.chips === 0) p.allIn = true;
  if (label) p.last = label;
}

/** Neue Hand: Dealer weiter, Blinds, Karten. Gibt false zurück, wenn weniger als zwei Spieler übrig sind. */
export function startHand(t: Table, rnd: Rng): boolean {
  for (const p of t.players) if (p.chips <= 0) p.out = true;
  if (alive(t).length < 2) { t.phase = 'done'; return false; }
  t.handNo++;
  t.board = []; t.winners = []; t.potCollected = 0; t.log = [];
  t.deck = shuffleDeck(t.game, rnd);
  for (const p of t.players) { p.bet = 0; p.total = 0; p.folded = p.out; p.allIn = false; p.acted = false; p.noRaise = false; p.hole = []; p.last = ''; }
  t.dealer = nextSeat(t, t.dealer, (p) => !p.out);
  const heads = alive(t).length === 2;
  const sbSeat = heads ? t.dealer : nextSeat(t, t.dealer, (p) => !p.out);
  const bbSeat = nextSeat(t, sbSeat, (p) => !p.out);
  if (t.ante > 0) for (const p of t.players) if (!p.out) { const x = Math.min(t.ante, p.chips); p.chips -= x; p.total += x; t.potCollected += x; if (p.chips === 0) p.allIn = true; }
  post(t, sbSeat, t.sb, `SB ${t.sb}`);
  post(t, bbSeat, t.bb, `BB ${t.bb}`);
  const n = holeCount(t.game);
  for (let k = 0; k < n; k++) for (const p of t.players) if (!p.out) p.hole.push(t.deck.pop()!);
  t.currentBet = Math.max(t.players[sbSeat].bet, t.players[bbSeat].bet, 0);
  t.lastRaise = t.bb;
  t.phase = 'preflop';
  t.toAct = nextSeat(t, bbSeat, (p) => !p.out && !p.folded && !p.allIn);
  t.log.push(`Hand ${t.handNo}: ${t.players[t.dealer].name} gibt.`);
  if (canAct(t).length <= 1 && inHand(t).length > 1 && canAct(t).every((p) => p.bet >= t.currentBet)) runout(t);
  return true;
}

export type Action = { kind: 'fold' } | { kind: 'check' } | { kind: 'call' } | { kind: 'raise'; to: number };

export interface Legal { fold: boolean; check: boolean; call: number; minRaise: number; maxRaise: number; canRaise: boolean }

export function legal(t: Table, seat = t.toAct): Legal {
  const p = t.players[seat];
  const toCall = Math.max(0, t.currentBet - p.bet);
  const stackTo = p.bet + p.chips;
  let minTo = t.currentBet + t.lastRaise;
  let maxTo = stackTo;
  if (t.limit === 'pot') maxTo = Math.min(stackTo, t.currentBet + (pot(t) + toCall));
  minTo = Math.min(minTo, maxTo);
  const canRaise = !p.noRaise && p.chips > toCall && maxTo > t.currentBet && canAct(t).some((q) => q !== p);
  return { fold: true, check: toCall === 0, call: Math.min(toCall, p.chips), minRaise: minTo, maxRaise: maxTo, canRaise };
}

const label = (k: string, n?: number) => (n === undefined ? k : `${k} ${n}`);

/** Aktion des Spielers am Zug ausführen. Gibt false bei ungültiger Aktion zurück. */
export function act(t: Table, a: Action): boolean {
  if (t.phase === 'showdown' || t.phase === 'done') return false;
  const seat = t.toAct;
  const p = t.players[seat];
  const lg = legal(t, seat);
  if (a.kind === 'fold') { p.folded = true; p.last = 'Fold'; t.log.push(`${p.name} wirft ab.`); }
  else if (a.kind === 'check') { if (!lg.check) return false; p.last = 'Check'; t.log.push(`${p.name} checkt.`); }
  else if (a.kind === 'call') {
    if (lg.call <= 0) { if (!lg.check) return false; p.last = 'Check'; }
    else { post(t, seat, lg.call, ''); p.last = p.allIn ? 'All-in' : label('Call', p.bet); t.log.push(`${p.name} ${p.allIn ? 'geht All-in mit' : 'callt'} ${lg.call}.`); }
  } else {
    if (!lg.canRaise) return false;
    let to = Math.floor(a.to);
    if (to < lg.minRaise && to < p.bet + p.chips) to = lg.minRaise;
    to = Math.min(to, lg.maxRaise);
    if (to <= t.currentBet) return false;
    const full = to - t.currentBet >= t.lastRaise;
    const add = to - p.bet;
    post(t, seat, add, '');
    if (full) {
      t.lastRaise = to - t.currentBet;
      for (const q of t.players) if (q !== p) { q.acted = false; q.noRaise = false; }
    } else {
      for (const q of t.players) if (q !== p && q.acted) q.noRaise = true;
    }
    t.currentBet = to;
    p.last = p.allIn ? 'All-in' : t.currentBet === t.bb && t.phase === 'preflop' ? label('Raise', to) : label(t.currentBet > 0 ? 'Raise' : 'Bet', to);
    t.log.push(`${p.name} ${p.allIn ? 'geht All-in' : 'erhöht'} auf ${to}.`);
  }
  p.acted = true; p.noRaise = false;
  advance(t);
  return true;
}

function roundDone(t: Table): boolean {
  const need = canAct(t);
  return need.every((p) => p.acted && p.bet === t.currentBet);
}

function collect(t: Table) {
  for (const p of t.players) { t.potCollected += p.bet; p.bet = 0; p.acted = false; p.noRaise = false; }
  t.currentBet = 0; t.lastRaise = t.bb;
}

function advance(t: Table) {
  if (inHand(t).length === 1) { collect(t); award(t); return; }
  if (!roundDone(t)) { t.toAct = nextSeat(t, t.toAct, (p) => !p.out && !p.folded && !p.allIn); return; }
  collect(t);
  if (canAct(t).length <= 1) { runout(t); return; }
  nextStreet(t);
}

function nextStreet(t: Table) {
  if (t.phase === 'preflop') { t.board.push(t.deck.pop()!, t.deck.pop()!, t.deck.pop()!); t.phase = 'flop'; }
  else if (t.phase === 'flop') { t.board.push(t.deck.pop()!); t.phase = 'turn'; }
  else if (t.phase === 'turn') { t.board.push(t.deck.pop()!); t.phase = 'river'; }
  else { showdown(t); return; }
  for (const p of t.players) p.last = p.folded || p.out ? p.last : '';
  t.toAct = nextSeat(t, t.dealer, (p) => !p.out && !p.folded && !p.allIn);
}

function runout(t: Table) {
  collect(t);
  while (t.board.length < 5) {
    if (t.board.length === 0) { t.board.push(t.deck.pop()!, t.deck.pop()!, t.deck.pop()!); t.phase = 'flop'; }
    else { t.board.push(t.deck.pop()!); t.phase = t.board.length === 4 ? 'turn' : 'river'; }
  }
  showdown(t);
}

function award(t: Table) {
  // Alle anderen haben aufgegeben
  const w = inHand(t)[0];
  const amount = t.potCollected;
  w.chips += amount;
  t.winners = [{ seat: t.players.indexOf(w), amount, hand: '', cards: [] }];
  t.log.push(`${w.name} gewinnt ${amount}.`);
  t.potCollected = 0;
  t.phase = 'done';
}

function showdown(t: Table) {
  t.phase = 'showdown';
  // Nebentöpfe über die Einsatzstufen
  const levels = [...new Set(t.players.filter((p) => p.total > 0).map((p) => p.total))].sort((a, b) => a - b);
  let prev = 0;
  const hands = new Map<number, Hand>();
  t.players.forEach((p, i) => { if (!p.out && !p.folded) hands.set(i, bestHand(p.hole, t.board, t.game)); });
  const won = new Map<number, { amount: number; hand: string; cards: number[] }>();
  for (const lv of levels) {
    let potPart = 0;
    for (const p of t.players) potPart += Math.max(0, Math.min(p.total, lv) - Math.min(p.total, prev));
    prev = lv;
    const elig = t.players.map((p, i) => i).filter((i) => !t.players[i].out && !t.players[i].folded && t.players[i].total >= lv);
    if (!elig.length) {
      // Einsatz von Ausgestiegenen ohne Anspruch: geht an den besten Verbleibenden
      const anyone = [...hands.keys()];
      elig.push(...anyone);
    }
    let bestScore = -1;
    for (const i of elig) bestScore = Math.max(bestScore, hands.get(i)!.score);
    const winners = elig.filter((i) => hands.get(i)!.score === bestScore);
    const share = Math.floor(potPart / winners.length);
    let rest = potPart - share * winners.length;
    // Rest an den ersten Gewinner links vom Dealer
    const order = winners.slice().sort((a, b) => ((a - t.dealer + t.players.length - 1) % t.players.length) - ((b - t.dealer + t.players.length - 1) % t.players.length));
    for (const i of order) {
      const add = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      const cur = won.get(i) ?? { amount: 0, hand: handName(hands.get(i)!), cards: hands.get(i)!.best };
      cur.amount += add;
      won.set(i, cur);
    }
  }
  for (const [i, w] of won) { t.players[i].chips += w.amount; t.winners.push({ seat: i, amount: w.amount, hand: w.hand, cards: w.cards }); t.log.push(`${t.players[i].name} gewinnt ${w.amount} mit ${w.hand}.`); }
  t.potCollected = 0;
  t.phase = 'done';
}

export const chipsTotal = (t: Table) => t.players.reduce((a, p) => a + p.chips + p.bet, 0) + t.potCollected;
export const activeCount = (t: Table) => alive(t).length;
export const seatsInHand = inHand;
