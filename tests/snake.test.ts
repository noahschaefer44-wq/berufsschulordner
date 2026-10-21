import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Dir, type Game, type Rules, aiDir, idx, newGame, nextCell, replayRun, spawnFood, step, steer, tickMs } from '../src/games/snake/engine';
import { LEVELS, decodeLevel, encodeLevel, levelRules, reachable } from '../src/games/snake/levels';
import { mulberry32 } from '../src/games/shared/rng';

const R = (p: Partial<Rules> = {}): Rules => ({ ...DEFAULT_RULES, ...p });
const head = (g: Game, i = 0) => g.snakes[i].cells[g.snakes[i].cells.length - 1];

describe('Schlange: Bewegung', () => {
  it('Start: Länge 3, Richtung rechts', () => {
    const g = newGame(R());
    expect(g.snakes[0].cells.length).toBe(3);
    const h0 = head(g);
    step(g, []);
    expect(head(g)).toBe(nextCell(g.rules, h0, 1));
    expect(g.snakes[0].cells.length).toBe(3);
  });
  it('Umkehr wird gesperrt, Richtungswechsel klappt', () => {
    const g = newGame(R());
    steer(g.snakes[0], 3);
    expect(g.snakes[0].queue.length).toBe(0);
    steer(g.snakes[0], 0);
    steer(g.snakes[0], 3);
    step(g, []);
    expect(g.snakes[0].dir).toBe(0);
  });
  it('Wand tötet, Torus nicht', () => {
    const g = newGame(R({ w: 10, h: 8 }));
    let guard = 0;
    while (!g.over && guard++ < 50) step(g, []);
    expect(g.over).toBe(true);
    expect(g.snakes[0].deathReason).toBe('Wand');
    const t = newGame(R({ w: 10, h: 8, wrap: true }));
    for (let i = 0; i < 60; i++) step(t, []);
    expect(t.over).toBe(false);
  });
  it('Apfel: Wachstum und Punkte', () => {
    const g = newGame(R({ extras: false }));
    const h = head(g);
    g.foods = [{ cell: nextCell(g.rules, h, 1), kind: 'apfel', ttl: 0 }];
    const res = step(g, []);
    expect(res.ate.length).toBe(1);
    expect(g.snakes[0].score).toBe(10);
    step(g, []);
    expect(g.snakes[0].cells.length).toBe(4);
    expect(g.foods.some((f) => f.kind === 'apfel')).toBe(true);
  });
  it('Gift verkürzt, Gold wächst stärker', () => {
    const g = newGame(R());
    g.snakes[0].cells = [idx(g.rules, 2, 5), idx(g.rules, 3, 5), idx(g.rules, 4, 5), idx(g.rules, 5, 5)];
    g.foods = [{ cell: idx(g.rules, 6, 5), kind: 'gift', ttl: 60 }, { cell: idx(g.rules, 10, 5), kind: 'apfel', ttl: 0 }];
    step(g, []);
    expect(g.snakes[0].cells.length).toBe(2);
    const g2 = newGame(R());
    g2.foods = [{ cell: nextCell(g2.rules, head(g2), 1), kind: 'gold', ttl: 40 }, { cell: 0, kind: 'apfel', ttl: 0 }];
    step(g2, []); step(g2, []); step(g2, []);
    expect(g2.snakes[0].cells.length).toBe(5);
    expect(g2.snakes[0].score).toBe(50);
  });
  it('Selbstkollision tötet, Schwanzspitze nicht', () => {
    const g = newGame(R({ w: 12, h: 12 }));
    const r = g.rules;
    g.snakes[0].cells = [idx(r, 5, 5), idx(r, 5, 6), idx(r, 6, 6), idx(r, 6, 5)];
    g.snakes[0].dir = 3; g.snakes[0].moved = 3;
    step(g, [null]);
    expect(g.snakes[0].alive).toBe(true);
    const g2 = newGame(R({ w: 12, h: 12 }));
    g2.snakes[0].cells = [idx(r, 4, 5), idx(r, 5, 5), idx(r, 6, 5), idx(r, 6, 4), idx(r, 5, 4)];
    g2.snakes[0].dir = 3; g2.snakes[0].moved = 3;
    steer(g2.snakes[0], 2);
    step(g2, []);
    expect(g2.snakes[0].alive).toBe(false);
    expect(g2.snakes[0].deathReason).toBe('Schwanz');
  });
  it('Hindernis tötet, Geist geht hindurch, Schild rettet einmal', () => {
    const base = (eff: Partial<Game['snakes'][0]['effects']>) => {
      const g = newGame(R({ w: 12, h: 12 }));
      g.walls.add(nextCell(g.rules, head(g), 1));
      Object.assign(g.snakes[0].effects, eff);
      return g;
    };
    const a = base({}); step(a, []); expect(a.snakes[0].alive).toBe(false);
    const b = base({ geist: 10 }); step(b, []); expect(b.snakes[0].alive).toBe(true);
    const c = base({ schild: 1 }); step(c, []); expect(c.snakes[0].alive).toBe(true); expect(c.snakes[0].effects.schild).toBe(0);
    step(c, []); expect(c.snakes[0].alive).toBe(false);
  });
  it('Zen: Berührung tötet nicht', () => {
    const g = newGame(R({ w: 10, h: 8, zen: true }));
    for (let i = 0; i < 30; i++) step(g, []);
    expect(g.over).toBe(false);
  });
  it('Futter verschwindet nach Ablauf, Apfel bleibt', () => {
    const g = newGame(R());
    g.foods.push({ cell: 100, kind: 'gold', ttl: 2 });
    step(g, []); step(g, []);
    expect(g.foods.some((f) => f.kind === 'gold')).toBe(false);
    expect(g.foods.some((f) => f.kind === 'apfel')).toBe(true);
  });
  it('Geschwindigkeit steigt mit gefressenen Äpfeln, Zeitlupe bremst', () => {
    const g = newGame(R());
    const base = tickMs(150, g.snakes[0]);
    g.snakes[0].eaten = 10;
    expect(tickMs(150, g.snakes[0])).toBeLessThan(base);
    g.snakes[0].effects.zeitlupe = 5;
    expect(tickMs(150, g.snakes[0])).toBeGreaterThan(tickMs(150, { ...g.snakes[0], effects: { ...g.snakes[0].effects, zeitlupe: 0 } }));
  });
  it('Spawn findet immer freie Zellen und meidet die Schlange', () => {
    const g = newGame(R({ w: 8, h: 8 }));
    for (let i = 0; i < 20; i++) spawnFood(g);
    const occ = new Set<number>([...g.snakes[0].cells]);
    for (const f of g.foods) expect(occ.has(f.cell)).toBe(false);
    expect(new Set(g.foods.map((f) => f.cell)).size).toBe(g.foods.length);
  });
});

describe('Schlange: zwei Schlangen und KI', () => {
  it('Kopf an Kopf: beide sterben', () => {
    const g = newGame(R({ w: 12, h: 12, snakes: 2 }));
    const r = g.rules;
    g.snakes[0].cells = [idx(r, 3, 5), idx(r, 4, 5)]; g.snakes[0].dir = 1; g.snakes[0].moved = 1;
    g.snakes[1].cells = [idx(r, 6, 5), idx(r, 5, 5)]; g.snakes[1].dir = 3; g.snakes[1].moved = 3;
    step(g, []);
    expect(g.over).toBe(true);
    expect(g.winner).toBe(-1);
  });
  it('KI Stufe 3 überlebt lange und sammelt', () => {
    const rnd = mulberry32(2);
    const g = newGame(R({ seed: 3, extras: false }));
    for (let t = 0; t < 700 && !g.over; t++) step(g, [aiDir(g, 0, 3, rnd)]);
    expect(g.snakes[0].score).toBeGreaterThanOrEqual(120);
  });
  it('bessere Stufen schlagen Stufe 1', () => {
    const run = (lv: number, seed: number) => { const rnd = mulberry32(seed); const g = newGame(R({ seed, extras: false })); for (let t = 0; t < 600 && !g.over; t++) step(g, [aiDir(g, 0, lv, rnd)]); return g.snakes[0].score; };
    let a = 0, b = 0;
    for (let s = 1; s <= 6; s++) { a += run(1, s); b += run(3, s); }
    expect(b).toBeGreaterThan(a);
  });
  it('Zwei-KI-Duell endet oder läuft stabil', () => {
    const rnd = mulberry32(4);
    const g = newGame(R({ snakes: 2, seed: 5 }));
    for (let t = 0; t < 2000 && !g.over; t++) step(g, [aiDir(g, 0, 3, rnd), aiDir(g, 1, 2, rnd)]);
    expect(g.over || g.tick >= 2000).toBe(true);
  });
});

describe('Schlange: Wiedergabe', () => {
  it('gleicher Startwert und gleiche Eingaben ergeben dasselbe Spiel', () => {
    const rules = R({ seed: 42 });
    const inputs: [number, number, Dir][] = [[5, 0, 0], [9, 0, 1], [14, 0, 2], [20, 0, 3]];
    const a = replayRun({ rules, inputs, ticks: 80 });
    const b = replayRun({ rules, inputs, ticks: 80 });
    expect(a.snakes[0].cells).toEqual(b.snakes[0].cells);
    expect(a.foods).toEqual(b.foods);
    expect(a.tick).toBe(b.tick);
  });
});

describe('Schlange: Level', () => {
  it('alle Level sind spielbar (Start frei, Fläche zusammenhängend)', () => {
    for (const l of LEVELS) {
      const r = levelRules(l, 1);
      expect(reachable(r), l.name).toBeGreaterThan(0.9);
      const start = idx(r, Math.floor(r.w / 4), Math.floor(r.h / 2));
      for (let k = -1; k <= 4; k++) expect(l.obstacles.includes(start + k), `${l.name} Startzeile`).toBe(false);
    }
  });
  it('Level-Codes: Rundlauf', () => {
    for (const l of LEVELS.slice(0, 6)) {
      const code = encodeLevel(l.w, l.h, l.wrap, l.obstacles);
      const back = decodeLevel(code)!;
      expect(back.w).toBe(l.w);
      expect(back.wrap).toBe(l.wrap);
      expect([...back.obstacles].sort((x, y) => x - y)).toEqual([...new Set(l.obstacles)].sort((x, y) => x - y));
    }
    expect(decodeLevel('quatsch')).toBeNull();
    expect(decodeLevel('S1-20-14-m-00')).toBeNull();
  });
  it('Kampagne hat zwölf Level', () => {
    expect(LEVELS.length).toBe(12);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(12);
  });
});
