// Lagerhaus: Regeln, Löser, Sackgassen, Klick-Planung, Erzeugung.
import { describe, expect, it } from 'vitest';
import { PACKS, INTRO, buildPackLevel } from '../src/games/lager/levels';
import { type Dir, deadBoxes, deadSquares, isSolved, parseXsb, planBoxMove, solve, toXsb, tryMove, walkPath } from '../src/games/lager/engine';

const play = (xsb: string, moves: string) => {
  const l = parseXsb(xsb)!;
  let st = { player: l.player, boxes: l.boxes.slice() };
  for (const ch of moves) {
    const r = tryMove(l, st, ch.toLowerCase() as Dir);
    expect(r).not.toBeNull();
    st = r!.state;
  }
  return { l, st };
};

describe('Lagerhaus: Regeln', () => {
  it('XSB hin und zurück', () => {
    const x = '#####\n#@$.#\n#####';
    expect(toXsb(parseXsb(x)!)).toBe(x);
    expect(parseXsb('###\n#@#\n###')).toBeNull(); // keine Kiste
    expect(parseXsb('#####\n#@$ #\n#####')).toBeNull(); // Kiste ohne Ziel
  });
  it('Schieben, Blockieren, Ziehen', () => {
    const l = parseXsb('#######\n#@$$..#\n#######')!;
    const st = { player: l.player, boxes: l.boxes };
    expect(tryMove(l, st, 'r')).toBeNull(); // zwei Kisten hintereinander
    expect(tryMove(l, st, 'l')).toBeNull(); // Wand
    const l2 = parseXsb('######\n#@$ .#\n######')!;
    const r = tryMove(l2, { player: l2.player, boxes: l2.boxes }, 'r')!;
    expect(r.push).toBe(true);
    const back = tryMove(l2, r.state, 'l', true);
    expect(back!.state.player).toBe(l2.player);
  });
  it('Gelöst-Erkennung', () => {
    const { l, st } = play('#####\n#@$.#\n#####', 'R');
    expect(isSolved(l, st)).toBe(true);
  });
  it('Sackgassen: Ecke ist tot, Zielreihe lebt', () => {
    const l = parseXsb('#######\n#     #\n# $   #\n#   . #\n#@    #\n#######')!;
    const d = deadSquares(l);
    expect(d[1 * 7 + 1]).toBe(1); // Ecke links oben
    expect(d[3 * 7 + 4]).toBe(0); // Ziel
    expect(deadBoxes(l, { player: l.player, boxes: [1 * 7 + 1] }).length).toBe(1);
  });
});

describe('Lagerhaus: Löser', () => {
  for (const lv of INTRO) {
    it(`Einführung „${lv.name}“ ist lösbar und die Lösung funktioniert`, () => {
      const l = parseXsb(lv.xsb)!;
      const s = solve(l, undefined, { maxMs: 3000 });
      expect(s).not.toBeNull();
      const { l: l2, st } = play(lv.xsb, s!.moves);
      expect(isSolved(l2, st)).toBe(true);
    });
  }
  it('erkennt unlösbare Level', () => {
    const l = parseXsb('######\n#$@ .#\n######')!;
    expect(solve(l, undefined, { maxMs: 1000 })).toBeNull();
  });
  it('Weg- und Kistenplanung', () => {
    const l = parseXsb('#######\n#@    #\n#  $  #\n#   . #\n#######')!;
    const st = { player: l.player, boxes: l.boxes };
    expect(walkPath(l, st, 2 * 7 + 5)!.length).toBe(5);
    const plan = planBoxMove(l, st, 2 * 7 + 3, 3 * 7 + 4)!;
    expect(plan).not.toBeNull();
    let s2 = st;
    for (const m of plan) s2 = tryMove(l, s2, m)!.state;
    expect(s2.boxes).toEqual([3 * 7 + 4]);
  });
});

describe('Lagerhaus: erzeugte Pakete', () => {
  for (const p of PACKS) {
    it(`${p.name}: erstes und mittleres Level lösbar`, () => {
      for (const i of [0, Math.floor(p.count / 2)]) {
        const g = buildPackLevel(p.id, i);
        const l = parseXsb(g.xsb)!;
        const s = solve(l, undefined, { maxNodes: 400000, maxMs: 6000 });
        expect(s).not.toBeNull();
        expect(s!.pushes).toBeGreaterThanOrEqual(1);
        const { l: l2, st } = play(g.xsb, s!.moves);
        expect(isSolved(l2, st)).toBe(true);
      }
    }, 40000);
  }
  it('gleiches Level bei gleichem Seed', () => {
    expect(buildPackLevel('p1', 3).xsb).toBe(buildPackLevel('p1', 3).xsb);
  });
});
