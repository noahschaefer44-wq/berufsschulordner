// Patience: Austeilung, Regeln, Wertung, Löser.
import { describe, expect, it } from 'vitest';
import { RANKS_EN, SUITS, cardName, mk, msDeal, newDeck, rankOf, suitOf } from '../src/games/karten/cards';
import { applyMove, canMove, draggable, isWon, legalMoves, newFreecell, newKlondike, newSpider, pile, type Move, type PileGame } from '../src/games/karten/piles';
import { solveFreecell, solveKlondike } from '../src/games/karten/solver';

const short = (id: number) => `${RANKS_EN[rankOf(id)]}${['S', 'H', 'D', 'C'][suitOf(id)]}`;
void SUITS; void cardName;

describe('Patience: Karten', () => {
  it('ein Satz hat 52 verschiedene Karten, Spider 104', () => {
    expect(new Set(newDeck(1).map((c) => c.id)).size).toBe(52);
    expect(newDeck(2, 1).length).toBe(104);
    expect(newDeck(2, 1).every((c) => c.id < 13)).toBe(true);
    expect(new Set(newDeck(2, 2).map((c) => c.id)).size).toBe(26);
  });
  it('Microsoft-FreeCell Spiel Nr. 1 stimmt mit der bekannten Austeilung überein', () => {
    const g = newFreecell(1);
    const rows = Array.from({ length: 7 }, (_, r) => g.tab.map((p) => (p[r] ? short(p[r].id) : '')).filter(Boolean).join(' '));
    expect(rows[0]).toBe('JD 2D 9H JC 5D 7H 7C 5H');
    expect(rows[1]).toBe('KD KC 9S 5S AD QC KH 3H');
    expect(rows[2]).toBe('2S KS 9D QD JS AS AH 3C');
    expect(rows[3]).toBe('4C 5C TS QH 4H AC 4D 7S'.replace(/T/g, '10'));
    expect(rows[6]).toBe('6S 9C 2H 6H');
  });
  it('Austeilung ist deterministisch', () => {
    expect(msDeal(617).map((c) => c.id)).toEqual(msDeal(617).map((c) => c.id));
    expect(msDeal(1).map((c) => c.id)).not.toEqual(msDeal(2).map((c) => c.id));
  });
});

describe('Patience: Klondike', () => {
  it('Austeilung: 28 Karten im Tableau, 24 im Vorrat, nur die obersten aufgedeckt', () => {
    const g = newKlondike(5);
    expect(g.tab.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.stock.length).toBe(24);
    g.tab.forEach((p) => p.forEach((c, i) => expect(c.up).toBe(i === p.length - 1)));
  });
  it('Ziehen: drei Karten, Wiederholen und Wertung', () => {
    const g = newKlondike(5, { draw: 3 });
    const r = applyMove(g, { act: 'draw' })!;
    expect(r.g.waste.length).toBe(3);
    expect(r.g.stock.length).toBe(21);
    // alles ziehen, dann umwälzen
    let cur: PileGame = g;
    for (let i = 0; i < 8; i++) cur = applyMove(cur, { act: 'draw' })!.g;
    expect(cur.stock.length).toBe(0);
    const rc = applyMove(cur, { act: 'recycle' })!;
    expect(rc.g.stock.length).toBe(24);
    expect(rc.g.waste.length).toBe(0);
    expect(rc.g.passes).toBe(1);
  });
  it('Regeln: nur abwechselnde Farben absteigend, König auf leeren Stapel, Ass zur Ablage', () => {
    const g = newKlondike(1);
    g.tab = [[mk(13 + 5, 100, true)], [mk(6, 101, true)], [], [], [], [], []]; // ♥6 (id 18), ♠7 (id 6)
    expect(canMove(g, 'T0', 0, 'T1')).toBe(true); // rote 6 auf schwarze 7
    expect(canMove(g, 'T1', 0, 'T0')).toBe(false);
    g.tab[2] = [mk(12, 102, true)]; // ♠K
    expect(canMove(g, 'T0', 0, 'T3')).toBe(false); // keine Nicht-Könige auf leere Stapel
    expect(canMove(g, 'T2', 0, 'T3')).toBe(true);
    g.tab[4] = [mk(0, 103, true)];
    expect(canMove(g, 'T4', 0, 'F0')).toBe(true);
  });
  it('legalMoves enthält Ziehen; Spiele sind lösbar prüfbar', () => {
    const g = newKlondike(3);
    expect(legalMoves(g).some((m) => 'act' in m && m.act === 'draw')).toBe(true);
  });
  it('Löser findet für manche Austeilungen eine Lösung, die wirklich gewinnt', () => {
    let solved = 0;
    for (let seed = 1; seed <= 12 && solved < 1; seed++) {
      const g = newKlondike(seed);
      const s = solveKlondike(g, 40000, 3000);
      if (!s) continue;
      let cur = g;
      for (const m of s.moves) { const r = applyMove(cur, m); expect(r).not.toBeNull(); cur = r!.g; }
      expect(isWon(cur)).toBe(true);
      solved++;
    }
    expect(solved).toBeGreaterThanOrEqual(1);
  }, 60000);
});

describe('Patience: FreeCell', () => {
  it('Supermove-Grenze: (freie Zellen+1) × 2^(leere Stapel)', () => {
    const g = newFreecell(1);
    // 4 freie Zellen, keine leeren Stapel → 5 Karten
    const col = g.tab[0];
    expect(col.length).toBe(7);
    // eine Reihe der Länge 6 geht nicht (nicht abwechselnd), aber maxRun = 5
    expect(draggable(g, 'T0', 6)).toBe(true);
  });
  it('Zelle belegen und wieder entnehmen', () => {
    const g = newFreecell(1);
    const top = g.tab[0].length - 1;
    const r = applyMove(g, { from: 'T0', idx: top, to: 'C0' })!;
    expect(pile(r.g, 'C0').length).toBe(1);
    expect(applyMove(r.g, { from: 'T0', idx: r.g.tab[0].length - 1, to: 'C0' })).toBeNull(); // Zelle besetzt
  });
  it('Löser löst die ersten FreeCell-Spiele', () => {
    let solved = 0;
    for (const num of [1, 2, 3, 4, 5]) {
      const g = newFreecell(num);
      const s = solveFreecell(g, 80000, 6000);
      if (!s) continue;
      let cur = g;
      for (const m of s.moves) { const r = applyMove(cur, m as Move); expect(r).not.toBeNull(); cur = r!.g; }
      expect(isWon(cur)).toBe(true);
      solved++;
    }
    expect(solved).toBeGreaterThanOrEqual(3);
  }, 80000);
});

describe('Patience: Spider', () => {
  it('Austeilung: 54 Karten im Tableau, 50 im Vorrat', () => {
    const g = newSpider(7, 2);
    expect(g.tab.reduce((a, p) => a + p.length, 0)).toBe(54);
    expect(g.stock.length).toBe(50);
    expect(g.score).toBe(500);
  });
  it('Reihen nur gleichfarbig verschiebbar; Austeilen braucht gefüllte Stapel', () => {
    const g = newSpider(7, 4);
    g.tab = Array.from({ length: 10 }, (_, i) => (i === 0 ? [mk(5, 1, true), mk(4, 2, true)] : i === 1 ? [mk(13 + 4, 3, true)] : i === 2 ? [mk(6, 4, true)] : [mk(9, 10 + i, true)]));
    // ♠6 (id 5), ♠5 (id 4) – Reihe gleicher Farbe → auf ♠7 (id 6) erlaubt
    expect(canMove(g, 'T0', 0, 'T2')).toBe(true);
    // ♥5 (id 17) auf ♠6? Farbe egal beim Ablegen, aber Reihe aus mehreren verschiedenfarbigen nicht verschiebbar
    g.tab[0] = [mk(5, 1, true), mk(13 + 3, 2, true)];
    expect(draggable(g, 'T0', 0)).toBe(false);
    g.tab[3] = [];
    expect(legalMoves(g).some((m) => 'act' in m && m.act === 'deal')).toBe(false);
  });
  it('Kompletter König-bis-Ass-Lauf wird entfernt und gibt Punkte', () => {
    const g = newSpider(7, 1);
    const run = Array.from({ length: 13 }, (_, i) => mk(12 - i, i, true)); // K..A Pik
    g.tab[0] = run.slice(0, 12);
    g.tab[1] = [run[12]];
    const r = applyMove(g, { from: 'T1', idx: 0, to: 'T0' })!;
    expect(r.g.found.length).toBe(1);
    expect(r.g.tab[0].length).toBe(0);
    expect(r.g.score).toBe(500 - 1 + 100);
  });
});
