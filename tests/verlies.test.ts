import { describe, expect, it } from 'vitest';
import { CLASSES, MAX_DEPTH, MON } from '../src/games/verlies/content';
import { computeFov, hasLos } from '../src/games/verlies/fov';
import { distances, generate } from '../src/games/verlies/gen';
import {
  MAX_INV, armorClass, ascend, castSpell, damageMon, descend, eat, equip, itemName, level, monAt, move, newGame, pathTo, pickup, readScroll, rnd, score, usePotion, visibleMonsters, wait, zapWand,
  type Item, type State,
} from '../src/games/verlies/engine';
import { H, T, W, idx, xy } from '../src/games/verlies/types';
import { mulberry32 } from '../src/games/shared/rng';

const ctx = () => { let n = 1; return { nextId: () => n++ }; };

describe('Verlies – Ebenen', () => {
  it('alle Räume sind erreichbar, Treppen verbunden', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (let d = 1; d <= MAX_DEPTH; d++) {
        const lv = generate('t' + seed, d, ctx());
        const dist = distances(lv.tiles, lv.up);
        for (const [x, y, w, h] of lv.rooms) expect(dist[idx(x + (w >> 1), y + (h >> 1))], `seed ${seed} d${d}`).toBeGreaterThanOrEqual(0);
        if (d < MAX_DEPTH) { expect(lv.down).toBeGreaterThanOrEqual(0); expect(dist[lv.down]).toBeGreaterThan(0); expect(lv.tiles[lv.down]).toBe(T.DOWN); } else expect(lv.down).toBe(-1);
        expect(lv.tiles[lv.up]).toBe(T.UP);
      }
    }
  });

  it('Inhalte liegen auf begehbaren Feldern ohne Überlappung', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (let d = 1; d <= MAX_DEPTH; d++) {
        const lv = generate('c' + seed, d, ctx());
        const occ = new Set<number>();
        for (const m of lv.mons) { const i = idx(m.x, m.y); expect(lv.tiles[i]).toBe(T.FLOOR); expect(occ.has(i)).toBe(false); occ.add(i); }
        for (const f of lv.items) { const i = idx(f.x, f.y); expect([T.FLOOR]).toContain(lv.tiles[i]); }
        for (const t of lv.traps) expect(lv.tiles[t.idx]).toBe(T.FLOOR);
        for (const m of lv.mons) { const def = MON[m.kind]; if (!def.flags.includes('boss')) { expect(def.minD).toBeLessThanOrEqual(d); expect(def.maxD).toBeGreaterThanOrEqual(d); } }
      }
    }
  });

  it('Drache und Amulett auf der untersten Ebene', () => {
    const lv = generate('boss', MAX_DEPTH, ctx());
    expect(lv.mons.some((m) => m.kind === 'drache')).toBe(true);
    expect(lv.items.some((f) => f.item.kind === 'amulet')).toBe(true);
    const lv2 = generate('boss', 3, ctx());
    expect(lv2.mons.some((m) => m.kind === 'drache')).toBe(false);
  });

  it('gleicher Startwert, gleiche Ebene', () => {
    const a = generate('daily-2026', 3, ctx()), b = generate('daily-2026', 3, ctx()), c = generate('other', 3, ctx());
    expect(a.tiles).toEqual(b.tiles);
    expect(a.mons.map((m) => m.kind)).toEqual(b.mons.map((m) => m.kind));
    expect(a.tiles).not.toEqual(c.tiles);
  });
});

describe('Verlies – Sicht', () => {
  it('Wände blockieren, Räume sind sichtbar', () => {
    const tiles = new Array(W * H).fill(T.WALL);
    for (let y = 5; y < 10; y++) for (let x = 5; x < 15; x++) tiles[idx(x, y)] = T.FLOOR;
    for (let y = 5; y < 10; y++) for (let x = 20; x < 25; x++) tiles[idx(x, y)] = T.FLOOR;
    const vis = computeFov(tiles, 7, 7, 9);
    expect(vis.has(idx(14, 9))).toBe(true);
    expect(vis.has(idx(22, 7))).toBe(false);
    expect(hasLos(tiles, 7, 7, 12, 8)).toBe(true);
    expect(hasLos(tiles, 7, 7, 22, 7)).toBe(false);
    tiles[idx(15, 7)] = T.DOOR;
    expect(vis.has(idx(15, 7))).toBe(true);
  });
});

describe('Verlies – Spielstart und Aktionen', () => {
  it('Klassen starten mit Ausrüstung', () => {
    for (const c of CLASSES) {
      const s = newGame('start', c.id);
      expect(s.p.hp).toBe(c.hp);
      expect(s.p.weapon).not.toBeNull();
      expect(s.p.armor).not.toBeNull();
      expect(armorClass(s)).toBeGreaterThan(0);
      expect(level(s).tiles[idx(s.p.x, s.p.y)]).toBe(T.UP);
    }
  });

  it('Gleicher Startwert und gleiche Züge ergeben denselben Lauf', () => {
    const run = () => {
      const s = newGame('same', 'krieger');
      for (let i = 0; i < 80; i++) { const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][i % 4]; move(s, d[0], d[1]); }
      return JSON.stringify([s.p, s.turn, s.msgs.length, s.levels[0].mons.map((m) => [m.x, m.y, m.hp])]);
    };
    expect(run()).toBe(run());
  });

  it('Speichern und Laden (JSON) ändert nichts', () => {
    const s = newGame('save', 'schurke');
    for (let i = 0; i < 40; i++) move(s, [1, 0, -1, 0][i % 4], [0, 1, 0, -1][(i + 1) % 4]);
    const copy: State = JSON.parse(JSON.stringify(s));
    for (let i = 0; i < 60; i++) { const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][i % 4]; move(s, d[0], d[1]); move(copy, d[0], d[1]); }
    expect(JSON.stringify(copy)).toBe(JSON.stringify(s));
  });

  it('Treppe nach unten und wieder hinauf', () => {
    const s = newGame('stairs', 'krieger');
    const lv = level(s);
    [s.p.x, s.p.y] = xy(lv.down);
    expect(descend(s)).toBe(true);
    expect(s.depth).toBe(2);
    expect(level(s).tiles[idx(s.p.x, s.p.y)]).toBe(T.UP);
    expect(ascend(s)).toBe(true);
    expect(s.depth).toBe(1);
    expect(level(s).tiles[idx(s.p.x, s.p.y)]).toBe(T.DOWN);
    expect(ascend(s)).toBe(false); // auf der Abwärtstreppe gibt es keine Aufwärtstreppe
  });

  it('Gegenstände: Trank, Schriftrolle, Essen, Ausrüsten', () => {
    const s = newGame('items', 'krieger');
    const mk = (kind: Item['kind'], type: string, plus = 0, qty = 1): Item => ({ id: s.nextId++, kind, type, plus, qty });
    s.p.hp = 5;
    const heal = mk('potion', 'heilung');
    s.p.inv.push(heal);
    usePotion(s, heal);
    expect(s.p.hp).toBeGreaterThan(5);
    expect(s.known).toContain('potion:heilung');
    const sc = mk('scroll', 'verzauberung');
    s.p.inv.push(sc);
    const w = s.p.inv.find((i) => i.id === s.p.weapon)!;
    const before = w.plus + (s.p.inv.find((i) => i.id === s.p.armor)?.plus ?? 0);
    readScroll(s, sc);
    const after = w.plus + (s.p.inv.find((i) => i.id === s.p.armor)?.plus ?? 0);
    expect(after).toBe(before + 1);
    s.p.food = 100;
    const brot = mk('food', 'brot');
    s.p.inv.push(brot);
    eat(s, brot);
    expect(s.p.food).toBeGreaterThan(700);
    const axe = mk('weapon', 'axt', 2);
    s.p.inv.push(axe);
    equip(s, axe);
    expect(s.p.weapon).toBe(axe.id);
    expect(itemName(s, axe)).toBe('Streitaxt +2');
    const unk = mk('potion', 'gift');
    expect(itemName(s, unk)).toMatch(/Flasche/);
  });

  it('Kampf: Ratte besiegen, Erfahrung, Gold-Drop-Muster', () => {
    const s = newGame('fight', 'krieger');
    const lv = level(s);
    lv.mons = [];
    // freies Feld neben dem Spieler suchen
    const [px, py] = [s.p.x, s.p.y];
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => lv.tiles[idx(px + dx, py + dy)] === T.FLOOR)!;
    lv.mons.push({ id: 999, kind: 'ratte', x: px + spot[0], y: py + spot[1], hp: 6, maxHp: 6, energy: 0, awake: true, fear: 0, sleep: 0, cd: 0, poison: 0 });
    let guard = 0;
    while (monAt(s, px + spot[0], py + spot[1]) && guard++ < 40) move(s, spot[0], spot[1]);
    expect(monAt(s, px + spot[0], py + spot[1])).toBeUndefined();
    expect(s.p.kills).toBe(1);
    expect(s.p.xp).toBeGreaterThan(0);
  });

  it('Schleim teilt sich, Fledermaus bleibt in Bewegung', () => {
    const s = newGame('slime', 'krieger');
    const lv = level(s);
    lv.mons = [];
    const [px, py] = [s.p.x, s.p.y];
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => lv.tiles[idx(px + dx, py + dy)] === T.FLOOR)!;
    lv.mons.push({ id: 998, kind: 'schleim', x: px + spot[0], y: py + spot[1], hp: 14, maxHp: 14, energy: 0, awake: true, fear: 0, sleep: 0, cd: 0, poison: 0 });
    damageMon(s, lv.mons[0], 5);
    expect(lv.mons.length).toBe(2);
    expect(lv.mons[0].hp + lv.mons[1].hp).toBe(9);
  });

  it('Magier: Funkenwurf kostet Mana und trifft', () => {
    const s = newGame('mage', 'magier');
    const lv = level(s);
    lv.mons = [];
    const [px, py] = [s.p.x, s.p.y];
    const spot = [[2, 0], [-2, 0], [0, 2], [0, -2]].find(([dx, dy]) => lv.tiles[idx(px + dx, py + dy)] === T.FLOOR && lv.tiles[idx(px + dx / 2, py + dy / 2)] === T.FLOOR)!;
    lv.mons.push({ id: 997, kind: 'kobold', x: px + spot[0], y: py + spot[1], hp: 40, maxHp: 40, energy: 0, awake: false, fear: 0, sleep: 0, cd: 0, poison: 0 });
    const mp = s.p.mp;
    expect(castSpell(s, 'funke', px + spot[0], py + spot[1])).toBe(true);
    expect(s.p.mp).toBe(mp - 3 + (s.turn % 7 === 0 ? 1 : 0));
    expect(lv.mons[0].hp).toBeLessThan(40);
    expect(castSpell(newGame('x', 'krieger'), 'funke', 0, 0)).toBe(false);
  });

  it('Wand: Schlafstab, Blitzstab', () => {
    const s = newGame('wand', 'krieger');
    const lv = level(s);
    lv.mons = [];
    const [px, py] = [s.p.x, s.p.y];
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => lv.tiles[idx(px + dx, py + dy)] === T.FLOOR)!;
    lv.mons.push({ id: 996, kind: 'ork', x: px + spot[0], y: py + spot[1], hp: 22, maxHp: 22, energy: 0, awake: true, fear: 0, sleep: 0, cd: 0, poison: 0 });
    const w: Item = { id: s.nextId++, kind: 'wand', type: 'schlaf', plus: 0, qty: 1, charges: 2 };
    s.p.inv.push(w);
    zapWand(s, w, px + spot[0], py + spot[1]);
    expect(lv.mons[0].sleep).toBeGreaterThan(0);
    expect(w.charges).toBe(1);
  });

  it('Wegfindung führt zu bekannten Feldern', () => {
    const s = newGame('path', 'krieger');
    const lv = level(s);
    const seen = lv.seen.map((v, i) => (v ? i : -1)).filter((i) => i >= 0 && i !== idx(s.p.x, s.p.y) && lv.tiles[i] === T.FLOOR);
    expect(seen.length).toBeGreaterThan(5);
    const [tx, ty] = xy(seen[seen.length - 1]);
    const path = pathTo(s, tx, ty);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual([tx, ty]);
  });

  it('Verhungern tötet', () => {
    const s = newGame('hunger', 'krieger');
    level(s).mons = [];
    s.p.food = 1; s.p.hp = 3;
    for (let i = 0; i < 10 && !s.over; i++) wait(s);
    expect(s.over?.win).toBe(false);
    expect(s.over?.cause).toBe('Verhungert');
  });

  it('Rucksack ist begrenzt', () => {
    const s = newGame('bag', 'krieger');
    const lv = level(s);
    for (let i = 0; i < MAX_INV + 3; i++) lv.items.push({ x: s.p.x, y: s.p.y, item: { id: s.nextId++, kind: 'weapon', type: 'dolch', plus: 0, qty: 1 } });
    pickup(s, true);
    expect(s.p.inv.length).toBe(MAX_INV);
  });

  it('Zufall im Lauf ist deterministisch', () => {
    const a = newGame('r', 'krieger'), b = newGame('r', 'krieger');
    expect([rnd(a), rnd(a), rnd(a)]).toEqual([rnd(b), rnd(b), rnd(b)]);
    expect(visibleMonsters(a)).toEqual(visibleMonsters(b));
    expect(score(a)).toBeGreaterThan(0);
  });
});

describe('Verlies – Simulation', () => {
  // Einfacher Bot: läuft zur Treppe, kämpft, nimmt Heiltränke
  function bfs(s: State, goal: number): number[] | null {
    const lv = level(s);
    const start = idx(s.p.x, s.p.y);
    const prev = new Map<number, number>([[start, -1]]);
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === goal) break;
      const [x, y] = xy(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = idx(x + dx, y + dy);
        if (prev.has(n) || lv.tiles[n] === T.WALL) continue;
        prev.set(n, c); q.push(n);
      }
    }
    if (!prev.has(goal)) return null;
    const out: number[] = [];
    for (let c = goal; c !== start; c = prev.get(c)!) out.push(c);
    return out.reverse();
  }
  function botStep(s: State): boolean {
    const lv = level(s);
    const heal = s.p.inv.find((i) => i.kind === 'potion' && i.type === 'heilung');
    if (heal && s.p.hp < s.p.maxHp * 0.4) return usePotion(s, heal);
    const food = s.p.inv.find((i) => i.kind === 'food' && i.type !== 'gold');
    if (food && s.p.food < 400) return eat(s, food);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (monAt(s, s.p.x + dx, s.p.y + dy) && (s.p.hp > 8 || !heal)) return move(s, dx, dy);
    let goal = lv.down;
    if (goal < 0) { const am = lv.items.find((f) => f.item.kind === 'amulet'); goal = am ? idx(am.x, am.y) : lv.up; }
    if (idx(s.p.x, s.p.y) === goal && lv.tiles[goal] === T.DOWN) return descend(s);
    const path = bfs(s, goal);
    if (!path) return wait(s);
    const [nx, ny] = xy(path[0]);
    return move(s, nx - s.p.x, ny - s.p.y, true) || wait(s);
  }

  it('Läufe enden ohne Fehler und halten die Invarianten', () => {
    let maxDepth = 0;
    for (const cls of CLASSES) {
      for (let seed = 1; seed <= 8; seed++) {
        const s = newGame(`bot${seed}`, cls.id);
        for (let i = 0; i < 2500 && !s.over; i++) {
          botStep(s);
          const lv = level(s);
          expect(s.p.hp).toBeGreaterThanOrEqual(0);
          expect(lv.tiles[idx(s.p.x, s.p.y)]).not.toBe(T.WALL);
          expect(s.p.inv.length).toBeLessThanOrEqual(MAX_INV);
          const seen = new Set<number>();
          for (const m of lv.mons) { const k = idx(m.x, m.y); expect(seen.has(k), `doppelt belegt ${m.kind}`).toBe(false); seen.add(k); expect(m.x === s.p.x && m.y === s.p.y).toBe(false); if (m.kind !== 'geist') expect(lv.tiles[k]).not.toBe(T.WALL); expect(m.hp).toBeGreaterThan(0); }
        }
        maxDepth = Math.max(maxDepth, s.stats.maxDepth);
      }
    }
    expect(maxDepth).toBeGreaterThanOrEqual(3);
  }, 120000);

  it('Würfel der Fallen: jede Ebene lässt sich durchspielen (Zufallsläufer)', () => {
    const r = mulberry32(5);
    for (let seed = 1; seed <= 6; seed++) {
      const s = newGame(`walk${seed}`, 'krieger');
      s.p.maxHp = s.p.hp = 9999;
      for (let i = 0; i < 1500 && !s.over; i++) {
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r() * 4)];
        move(s, d[0], d[1], true);
        if (r() < 0.02) wait(s, true);
      }
      expect(s.turn).toBeGreaterThan(100);
    }
  }, 60000);
});
