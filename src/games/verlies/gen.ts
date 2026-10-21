// Ebenen-Generator: Räume, Gänge, Türen, Treppen, Monster, Gegenstände, Fallen.
import { mulberry32, hashString, type Rng } from '../shared/rng';
import { ARMORS, MAX_DEPTH, MONSTERS, POTIONS, SCROLLS, WANDS, WEAPONS, type MagicDef } from './content';
import { H, T, W, idx, xy, type FloorItem, type Item, type Level, type Mon, type Trap } from './types';

const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

function pickWeighted<M extends { weight: number; depth: number }>(r: Rng, list: M[], depth: number): M {
  const ok = list.filter((m) => m.depth <= depth);
  const tot = ok.reduce((a, m) => a + m.weight, 0);
  let x = r() * tot;
  for (const m of ok) { x -= m.weight; if (x <= 0) return m; }
  return ok[ok.length - 1];
}

export function neighbors4(i: number): number[] {
  const [x, y] = xy(i), out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < W - 1) out.push(i + 1);
  if (y > 0) out.push(i - W);
  if (y < H - 1) out.push(i + W);
  return out;
}

export const passableTile = (t: number) => t !== T.WALL && t !== T.CHEST;

/** Abstände (Schritte) von `from` über begehbare Felder (Türen zählen), −1 = unerreichbar. */
export function distances(tiles: number[], from: number, limit = 9999): number[] {
  const d = new Array(W * H).fill(-1);
  d[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (d[c] >= limit) continue;
    for (const n of neighbors4(c)) if (d[n] < 0 && tiles[n] !== T.WALL) { d[n] = d[c] + 1; q.push(n); }
  }
  return d;
}

export interface GenCtx { nextId: () => number }

/** Zufälliger Gegenstand passend zur Tiefe. */
export function rollItem(r: Rng, depth: number, ctx: GenCtx): Item {
  const mk = (kind: Item['kind'], type: string, plus = 0, qty = 1, charges?: number): Item => ({ id: ctx.nextId(), kind, type, plus, qty, charges });
  const roll = r();
  if (roll < 0.17) { const w = WEAPONS.filter((x) => x.depth <= depth); const d = w[ri(r, 0, w.length - 1)]; return mk('weapon', d.id, ri(r, -1, depth >= 4 ? 2 : 1)); }
  if (roll < 0.3) { const a = ARMORS.filter((x) => x.depth <= depth); const d = a[ri(r, 0, a.length - 1)]; return mk('armor', d.id, ri(r, -1, depth >= 4 ? 2 : 1)); }
  if (roll < 0.56) return mk('potion', pickWeighted(r, POTIONS as (MagicDef & { weight: number })[], depth).id);
  if (roll < 0.8) return mk('scroll', pickWeighted(r, SCROLLS as (MagicDef & { weight: number })[], depth).id);
  if (roll < 0.88 && depth >= 2) return mk('wand', pickWeighted(r, WANDS as (MagicDef & { weight: number })[], depth).id, 0, 1, ri(r, 3, 6));
  return mk('food', r() < 0.6 ? 'brot' : 'apfel');
}

export function generate(seed: string, depth: number, ctx: GenCtx): Level {
  const r = mulberry32(hashString(`${seed}:${depth}`));
  const tiles = new Array(W * H).fill(T.WALL);
  const rooms: [number, number, number, number][] = [];
  const want = ri(r, 8, 11);
  for (let tries = 0; tries < 200 && rooms.length < want; tries++) {
    const w = ri(r, 4, 11), h = ri(r, 3, 6);
    const x = ri(r, 2, W - w - 3), y = ri(r, 2, H - h - 3);
    if (rooms.some(([a, b, c, d]) => x < a + c + 2 && x + w + 2 > a && y < b + d + 2 && y + h + 2 > b)) continue;
    rooms.push([x, y, w, h]);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) tiles[idx(xx, yy)] = T.FLOOR;
  }
  const center = (rm: [number, number, number, number]): [number, number] => [rm[0] + (rm[2] >> 1), rm[1] + (rm[3] >> 1)];
  const carve = (a: [number, number], b: [number, number]) => {
    let [x, y] = a;
    const horiz = r() < 0.5;
    const stepX = () => { while (x !== b[0]) { x += Math.sign(b[0] - x); if (tiles[idx(x, y)] === T.WALL) tiles[idx(x, y)] = T.FLOOR; } };
    const stepY = () => { while (y !== b[1]) { y += Math.sign(b[1] - y); if (tiles[idx(x, y)] === T.WALL) tiles[idx(x, y)] = T.FLOOR; } };
    if (horiz) { stepX(); stepY(); } else { stepY(); stepX(); }
  };
  const order = rooms.map((_, i) => i).sort((a, b) => rooms[a][0] - rooms[b][0]);
  for (let i = 0; i + 1 < order.length; i++) carve(center(rooms[order[i]]), center(rooms[order[i + 1]]));
  for (let k = 0; k < 3 && rooms.length > 3; k++) carve(center(rooms[ri(r, 0, rooms.length - 1)]), center(rooms[ri(r, 0, rooms.length - 1)]));

  // Türen: Durchgänge in der Wand um Räume
  const inRoom = (x: number, y: number) => rooms.some(([a, b, c, d]) => x >= a && x < a + c && y >= b && y < b + d);
  for (const [rx, ry, rw, rh] of rooms) {
    for (let x = rx - 1; x <= rx + rw; x++) for (let y = ry - 1; y <= ry + rh; y++) {
      const edge = x === rx - 1 || x === rx + rw || y === ry - 1 || y === ry + rh;
      if (!edge || x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      if (tiles[idx(x, y)] !== T.FLOOR || inRoom(x, y)) continue;
      const hor = tiles[idx(x - 1, y)] === T.WALL && tiles[idx(x + 1, y)] === T.WALL;
      const ver = tiles[idx(x, y - 1)] === T.WALL && tiles[idx(x, y + 1)] === T.WALL;
      if ((hor || ver) && r() < 0.55) tiles[idx(x, y)] = T.DOOR;
    }
  }

  const used = new Set<number>();
  const freeIn = (rm: [number, number, number, number], margin = 0): number | null => {
    for (let t = 0; t < 30; t++) {
      const x = ri(r, rm[0] + margin, rm[0] + rm[2] - 1 - margin), y = ri(r, rm[1] + margin, rm[1] + rm[3] - 1 - margin), i = idx(x, y);
      if (tiles[i] === T.FLOOR && !used.has(i)) return i;
    }
    return null;
  };
  const upRoom = rooms[order[0]];
  const up = idx(...center(upRoom));
  tiles[up] = T.UP; used.add(up);
  const dist = distances(tiles, up);
  let far = order[order.length - 1], farD = -1;
  for (let i = 1; i < rooms.length; i++) { const d = dist[idx(...center(rooms[i]))]; if (d > farD) { farD = d; far = i; } }
  let down = -1;
  if (depth < MAX_DEPTH) { down = idx(...center(rooms[far])); tiles[down] = T.DOWN; used.add(down); }

  const level: Level = { depth, tiles, seen: new Array(W * H).fill(0), mons: [], items: [], traps: [], up, down, rooms };
  const mkItem = (kind: Item['kind'], type: string, plus = 0, qty = 1, charges?: number): Item => ({ id: ctx.nextId(), kind, type, plus, qty, charges });
  const place = (item: Item, i: number) => { const [x, y] = xy(i); level.items.push({ x, y, item } as FloorItem); used.add(i); };
  const randomItem = (): Item => rollItem(r, depth, ctx);

  // Gegenstände und Gold
  const n = ri(r, 4, 6) + (depth > 5 ? 1 : 0);
  for (let k = 0; k < n; k++) { const rm = rooms[ri(r, 0, rooms.length - 1)]; const i = freeIn(rm); if (i !== null) place(randomItem(), i); }
  for (let k = 0; k < ri(r, 2, 4); k++) { const rm = rooms[ri(r, 0, rooms.length - 1)]; const i = freeIn(rm); if (i !== null) place(mkItem('food', 'gold', 0, ri(r, 4, 9) * depth), i); }
  // Truhe
  if (r() < 0.55) { const rm = rooms[ri(r, 1, rooms.length - 1)]; const i = freeIn(rm, 0); if (i !== null) { tiles[i] = T.CHEST; used.add(i); } }

  // Fallen
  const kinds: Trap['type'][] = ['spike', 'dart', 'tele', 'alarm', 'pit'];
  for (let k = 0; k < ri(r, 2, 4) + (depth > 4 ? 1 : 0); k++) {
    const rm = rooms[ri(r, 1, rooms.length - 1)]; const i = freeIn(rm);
    if (i !== null) { level.traps.push({ idx: i, type: kinds[ri(r, 0, kinds.length - (depth >= 2 ? 1 : 2))], seen: false }); used.add(i); }
  }

  // Monster
  const spawn = (kind: Mon['kind'], i: number, awake = false) => {
    const def = MONSTERS.find((m) => m.id === kind)!;
    const [x, y] = xy(i);
    level.mons.push({ id: ctx.nextId(), kind, x, y, hp: def.hp, maxHp: def.hp, energy: ri(r, 0, 99), awake, fear: 0, sleep: 0, cd: 0, poison: 0 });
    used.add(i);
  };
  const pool = MONSTERS.filter((m) => m.minD <= depth && m.maxD >= depth && !m.flags.includes('boss'));
  const nm = ri(r, 4, 6) + Math.floor(depth / 2);
  const d0 = distances(tiles, up);
  for (let k = 0; k < nm && pool.length; k++) {
    for (let t = 0; t < 20; t++) {
      const rm = rooms[ri(r, 0, rooms.length - 1)];
      const i = freeIn(rm);
      if (i === null || d0[i] >= 0 && d0[i] < 8) continue;
      const m = pool[ri(r, 0, pool.length - 1)];
      spawn(m.id, i, r() < 0.3);
      break;
    }
  }
  if (depth === MAX_DEPTH) {
    const boss = rooms[far];
    let c = idx(...center(boss));
    if (used.has(c) || tiles[c] !== T.FLOOR) c = freeIn(boss) ?? c;
    spawn('drache', c);
    const am = freeIn(boss) ?? c + 1;
    place(mkItem('amulet', 'zeit'), am);
  }
  return level;
}
