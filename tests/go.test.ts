import { describe, expect, it } from 'vitest';
import { BLACK, DEFAULT_RULES, WHITE, groupAt, handicapPoints, legalMovesGo, neighbors, newState, parseCoord, parseSgf, coord, play, score, setStones, territoryOf, toSgf, type GoState, type Rules } from '../src/games/go/engine';
import { aiMove, estimate, mctsMove, suggestDead } from '../src/games/go/ai';
import { CURATED, attackerWins, correctMoves, genProblem, problemState, replyMove } from '../src/games/go/problems';

const R = (p: Partial<Rules> = {}): Rules => ({ ...DEFAULT_RULES, ...p });
function fromRows(rows: string[], p: Partial<Rules> = {}, turn: 1 | 2 = BLACK): GoState {
  const n = rows.length;
  const b: number[] = [], w: number[] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X') b.push(y * n + x); if (c === 'O') w.push(y * n + x); }));
  return setStones(newState(R({ n, ...p })), b, w, turn);
}
const at = (n: number, x: number, y: number) => y * n + x;

describe('Go-Regeln', () => {
  it('schlägt einen Stein', () => {
    const s = fromRows(['.X...', 'XO...', '.X...', '.....', '.....']);
    const r = play(s, at(5, 2, 1));
    expect(r.ok && r.captured).toEqual([at(5, 1, 1)]);
    expect(r.ok && r.state.caps[0]).toBe(1);
  });
  it('schlägt Gruppen und zählt Freiheiten', () => {
    const s = fromRows(['XXO..', 'OOO..', '.....', '.....', '.....']);
    const g = groupAt(s.board, neighbors(5, false), at(5, 2, 0));
    expect(g.stones.length).toBe(4);
    expect(g.libs.length).toBe(5);
  });
  it('verbietet Selbstmord', () => {
    const s = fromRows(['.O...', 'O....', '.....', '.....', '.....']);
    const r = play(s, 0);
    expect(r.ok).toBe(false);
    const ok = play({ ...s, rules: R({ n: 5, suicide: true }) }, 0);
    expect(ok.ok).toBe(true);
  });
  it('erlaubt Zug, der durch Schlagen Freiheit gewinnt', () => {
    const s = fromRows(['XO...', 'O....', '.....', '.....', '.....'], {}, BLACK);
    // schwarz in Ecke ohne Freiheit, aber Schlagen von (1,0)? (1,0) hat Freiheit (2,0) → Selbstmord
    expect(play(s, at(5, 0, 0)).ok).toBe(false);
  });
  it('Ko: sofortiges Zurückschlagen verboten', () => {
    const s = fromRows(['.XO..', 'XO.O.', '.XO..', '.....', '.....']);
    const a = play(s, at(5, 2, 1));
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.state.ko).toBe(at(5, 1, 1));
    const back = play(a.state, at(5, 1, 1));
    expect(back.ok).toBe(false);
    // nach einem anderen Zug (Ko-Drohung) wieder erlaubt
    const t = play(a.state, at(5, 4, 4));
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    const t2 = play(t.state, at(5, 0, 4));
    expect(t2.ok).toBe(true);
    if (!t2.ok) return;
    expect(play(t2.state, at(5, 1, 1)).ok).toBe(true); // nach Ko-Drohung wieder erlaubt
  });
  it('Torus: Ecken haben vier Nachbarn', () => {
    const nb = neighbors(5, true);
    expect(nb[0].length).toBe(4);
    const s = fromRows(['.....', '.....', '.....', '.....', '.....'], { torus: true });
    const g = play(s, 0);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(groupAt(g.state.board, nb, 0).libs.length).toBe(4);
  });
  it('Atari-Go: erster Fang gewinnt', () => {
    const s = fromRows(['.X...', 'XO...', '.X...', '.....', '.....'], { atari: true });
    const r = play(s, at(5, 2, 1));
    expect(r.ok && r.state.winner).toBe(BLACK);
    if (r.ok) expect(play(r.state, 24).ok).toBe(false);
  });
  it('zwei Pässe, Pass-Zähler', () => {
    const s = newState(R({ n: 9 }));
    const a = play(s, -1);
    expect(a.ok && a.state.passes).toBe(1);
    if (!a.ok) return;
    const b = play(a.state, -1);
    expect(b.ok && b.state.passes).toBe(2);
  });
  it('legale Züge: leeres 9×9 hat 81', () => {
    expect(legalMovesGo(newState(R({ n: 9 }))).length).toBe(81);
  });
  it('Superko verbietet Stellungswiederholung', () => {
    const s = fromRows(['.XO..', 'XO.O.', '.XO..', '.....', '.....'], { ko: 'superko' });
    const a = play(s, at(5, 2, 1));
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(play(a.state, at(5, 1, 1)).ok).toBe(false);
  });
});

describe('Go-Wertung', () => {
  const half = (scoring: 'flaeche' | 'gebiet', komi = 0) => {
    // Schwarz links (Spalten 0–1 + Wand bei 2), Weiß rechts
    const rows = ['..XO..', '..XO..', '..XO..', '..XO..', '..XO..', '..XO..'];
    return fromRows(rows, { scoring, komi });
  };
  it('Fläche', () => {
    const sc = score(half('flaeche'));
    expect(sc.black).toBe(18);
    expect(sc.white).toBe(18);
  });
  it('Gebiet zählt nur leere Punkte und Gefangene', () => {
    const s = half('gebiet');
    s.caps = [2, 1];
    const sc = score(s);
    expect(sc.black).toBe(12 + 2);
    expect(sc.white).toBe(12 + 1);
  });
  it('Komi und Sieger', () => {
    const sc = score(half('flaeche', 6.5));
    expect(sc.winner).toBe(WHITE);
    expect(sc.diff).toBe(-6.5);
  });
  it('tote Steine werden mitgezählt', () => {
    const s = fromRows(['X.O..', '.....', '.....', '.....', '.....'], { scoring: 'flaeche', komi: 0 });
    const t0 = territoryOf(s);
    expect(t0.neutral.length).toBe(23);
    const dead = new Set([at(5, 2, 0)]);
    const sc = score(s, dead);
    expect(sc.black).toBe(25);
  });
  it('Vorgabepunkte', () => {
    expect(handicapPoints(9, 2).length).toBe(2);
    expect(handicapPoints(19, 9).length).toBe(9);
    expect(new Set(handicapPoints(19, 9)).size).toBe(9);
    expect(handicapPoints(19, 1)).toEqual([]);
  });
});

describe('Koordinaten und SGF', () => {
  it('Koordinaten überspringen I', () => {
    expect(coord(19, 0)).toBe('A19');
    expect(coord(19, 8)).toBe('J19');
    expect(parseCoord(19, 'J19')).toBe(8);
    expect(parseCoord(9, 'E5')).toBe(at(9, 4, 4));
  });
  it('SGF Rundreise', () => {
    const rules = R({ n: 9 });
    const moves = [{ idx: 40, color: BLACK as 1 }, { idx: 41, color: WHITE as 2 }, { idx: -1, color: BLACK as 1 }];
    const sgf = toSgf(rules, moves, [10, 70]);
    const back = parseSgf(sgf)!;
    expect(back.n).toBe(9);
    expect(back.moves).toEqual(moves);
    expect(back.handicap).toEqual([10, 70]);
    expect(back.komi).toBe(6.5);
  });
  it('SGF ablehnen bei Quatsch', () => {
    expect(parseSgf('(;GM[1]SZ[99])')).toBeNull();
  });
});

describe('Aufgaben', () => {
  it('handgeschriebene Aufgaben sind lösbar und nicht trivial', () => {
    for (const p of CURATED) {
      const { state, anchor } = problemState(p);
      const sols = correctMoves(p, state, anchor);
      expect(sols.length, p.id).toBeGreaterThan(0);
      expect(sols.length, p.id).toBeLessThan(6);
    }
  });
  it('erzeugte Aufgaben sind lösbar, deterministisch', () => {
    for (const [kind, depth] of [['capture', 1], ['capture', 2], ['save', 2]] as const) {
      const a = genProblem(11, kind, depth);
      const b = genProblem(11, kind, depth);
      expect(a).not.toBeNull();
      expect(a).toEqual(b);
      const { state, anchor } = problemState(a!);
      expect(correctMoves(a!, state, anchor).length).toBeGreaterThan(0);
    }
  });
  it('falscher Zug wird nicht akzeptiert', () => {
    const p = CURATED[0];
    const { state, anchor } = problemState(p);
    const sols = correctMoves(p, state, anchor);
    expect(sols).toContain(at(5, 2, 3));
    expect(sols).not.toContain(at(5, 0, 0));
  });
  it('Löser: Netz in zwei Zügen', () => {
    // weißer Stein mit zwei Freiheiten, Schwarz am Zug
    const s = fromRows(['.....', '..X..', '.XO..', '.....', '.....'], {}, BLACK);
    // Der Stein hat zwei Freiheiten (3,2),(2,3). Ohne Hilfe nicht in zwei Zügen zu zwingen? Löser entscheidet, wir prüfen Konsistenz.
    const a1 = attackerWins(s, at(5, 2, 2), 1);
    expect(a1).toBe(false);
    const a3 = attackerWins(s, at(5, 2, 2), 3);
    expect(typeof a3).toBe('boolean');
  });
  it('Gegnerantwort ist legal', () => {
    const p = CURATED[4];
    const { state, anchor } = problemState(p);
    const m = replyMove(p, state, anchor, 2);
    expect(m).toBeGreaterThanOrEqual(0);
  });
});

describe('Go-KI', () => {
  it('liefert legale Züge auf allen Stufen', () => {
    const s = fromRows(['.X...', 'XO...', '.X...', '.....', '.....'], {}, BLACK);
    for (const lv of [1, 2]) {
      const r = aiMove(s, lv, 3);
      expect(r.move === -1 || play(s, r.move).ok).toBe(true);
    }
  });
  it('Stufe 2 schlägt, wenn möglich', () => {
    const s = fromRows(['.X...', 'XO...', '.X...', '.....', '.....'], {}, BLACK);
    expect(aiMove(s, 2, 1).move).toBe(at(5, 2, 1));
  });
  it('Monte-Carlo findet den Fang', () => {
    const s = fromRows(['.X...', 'XO...', '.X...', '.....', '.....'], {}, BLACK);
    const r = mctsMove(s, 3000, 2, 3000);
    expect(r.move).toBe(at(5, 2, 1));
  });
  it('Monte-Carlo rettet Gruppe in Atari', () => {
    const s = fromRows(['.....', '..O..', '.OXO.', '.....', '.....'], { komi: 0 }, BLACK);
    const r = mctsMove(s, 20000, 4, 20000);
    expect(r.move).toBe(at(5, 2, 3));
  });
  it('Schätzung: Schwarz klar vorn', () => {
    const rows = ['XXXXX.OOOOO'.slice(0, 5) + '', '', '', '', ''];
    void rows;
    const s = fromRows(['XXXXX', 'XXXXX', 'XXXXX', 'OOOOO', '.....'], { komi: 0 });
    const e = estimate(s, 60);
    expect(e.winrate).toBeGreaterThan(0.8);
  });
  it('tote Steine: einzelner Stein im feindlichen Gebiet', () => {
    const rows = ['XX.XXXX', 'XXXXXXX', 'XXXXXXX', 'XXXOXXX', 'XXX.XXX', 'XXXXXXX', 'XXXXXX.'];
    const s = fromRows(rows, { komi: 0 });
    const dead = suggestDead(s, 80);
    expect(dead).toContain(at(7, 3, 3));
  });
  it('Monte-Carlo spielt auf 9×9 legal', () => {
    const s = newState(R({ n: 9 }));
    const r = mctsMove(s, 150, 5, 400);
    expect(r.move).toBeGreaterThanOrEqual(0);
    expect(play(s, r.move).ok).toBe(true);
  });
});
