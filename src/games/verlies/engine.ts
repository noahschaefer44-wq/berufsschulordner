// Verlies: Kern des Rollenspiels – Zustand, Aktionen, Monster-KI. Alles rundenbasiert und aus dem Startwert nachspielbar.
import { hashString, mulberry32, shuffled } from '../shared/rng';
import {
  ARMOR, CLASS, MAX_DEPTH, MON, POTION, POTION_COLORS, SCROLL, SCROLLS, SCROLL_LABELS, SPELL, WAND, WANDS, WAND_WOODS, WEAPON, XP_TABLE, POTIONS,
  type MonKind,
} from './content';
import { computeFov, hasLos, line } from './fov';
import { distances, generate, rollItem, neighbors4 } from './gen';
import { H, T, W, idx, inb, xy, type FloorItem, type Item, type Level, type Mon, type Msg, type State } from './types';

export type { State, Level, Item, Mon } from './types';

// ───────── Zufall im Lauf ─────────
export function rnd(s: State): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const ri = (s: State, a: number, b: number) => a + Math.floor(rnd(s) * (b - a + 1));
const chance = (s: State, p: number) => rnd(s) < p;

export const level = (s: State): Level => s.levels[s.depth - 1];
export const monAt = (s: State, x: number, y: number) => level(s).mons.find((m) => m.x === x && m.y === y);

export function msg(s: State, text: string, kind: Msg['kind'] = 'info') {
  s.msgs.push({ t: s.turn, text, kind });
  if (s.msgs.length > 200) s.msgs.splice(0, s.msgs.length - 200);
}

// ───────── Spielstart ─────────

export interface Assist { xyzzy?: boolean; plugh?: boolean; nethack?: boolean }

export function newGame(seed: string, cls: string, assist: Assist = {}): State {
  const def = CLASS[cls];
  const idr = mulberry32(hashString(seed + ':ids'));
  const colors = shuffled(idr, POTION_COLORS), labels = shuffled(idr, SCROLL_LABELS), woods = shuffled(idr, WAND_WOODS);
  const s: State = {
    v: 1, seed, rng: hashString(seed + ':run'), depth: 1, levels: [], turn: 0, msgs: [], over: null, nextId: 1,
    ids: {
      potion: Object.fromEntries(POTIONS.map((p, i) => [p.id, colors[i]])),
      scroll: Object.fromEntries(SCROLLS.map((p, i) => [p.id, labels[i]])),
      wand: Object.fromEntries(WANDS.map((p, i) => [p.id, woods[i]])),
    },
    known: [], assisted: !!(assist.xyzzy || assist.plugh || assist.nethack), events: [],
    stats: { maxDepth: 1, damageTaken: 0, killedBoss: false, hitsTaken: 0, searched: 0 },
    killer: '',
    p: {
      x: 0, y: 0, hp: def.hp + (assist.plugh ? 10 : 0), maxHp: def.hp + (assist.plugh ? 10 : 0), mp: def.mp, maxMp: def.mp, xp: 0, lvl: 1, cls,
      inv: [], weapon: null, armor: null, food: 1600, gold: 0, poison: 0, haste: 0, slow: 0, blind: 0, confused: 0, telepathy: 0, fear: 0, str: 0, kills: 0,
    },
  };
  const mk = (kind: Item['kind'], type: string, plus = 0, qty = 1): Item => ({ id: s.nextId++, kind, type, plus, qty });
  const w = mk('weapon', def.weapon), a = mk('armor', def.armor);
  s.p.inv.push(w, a);
  s.p.weapon = w.id; s.p.armor = a.id;
  for (const [k, t, q] of def.items) { s.p.inv.push(mk(k, t, 0, q)); if (k === 'potion' || k === 'scroll') s.known.push(`${k}:${t}`); }
  s.known.push(`plus:${w.id}`, `plus:${a.id}`);
  if (assist.xyzzy) { s.p.inv.push(mk('scroll', 'teleport'), mk('scroll', 'karte')); s.known.push('scroll:teleport', 'scroll:karte'); }
  if (assist.nethack) { for (const p of POTIONS) s.known.push(`potion:${p.id}`); for (const sc of SCROLLS) s.known.push(`scroll:${sc.id}`); for (const wd of WANDS) s.known.push(`wand:${wd.id}`); }
  enterLevel(s, 1, 'up');
  msg(s, `Du betrittst das Verlies als ${def.name}. Finde das Zeitamulett auf Ebene ${MAX_DEPTH}.`, 'info');
  return s;
}

const ctxOf = (s: State) => ({ nextId: () => s.nextId++ });

function ensureLevel(s: State, depth: number): Level {
  while (s.levels.length < depth) s.levels.push(generate(s.seed, s.levels.length + 1, ctxOf(s)));
  return s.levels[depth - 1];
}

function enterLevel(s: State, depth: number, arrive: 'up' | 'down' | 'random') {
  const lv = ensureLevel(s, depth);
  s.depth = depth;
  s.stats.maxDepth = Math.max(s.stats.maxDepth, depth);
  let at = arrive === 'up' ? lv.up : arrive === 'down' ? (lv.down >= 0 ? lv.down : lv.up) : -1;
  if (at < 0) at = randomFloor(s, lv);
  [s.p.x, s.p.y] = xy(at);
  // Bewohner auf dem Ankunftsfeld verdrängen
  const occ = lv.mons.find((m) => m.x === s.p.x && m.y === s.p.y);
  if (occ) { const f = freeNear(s, lv, s.p.x, s.p.y); if (f) { occ.x = f[0]; occ.y = f[1]; } }
  updateSeen(s);
  s.events.push(`depth:${depth}`);
}

function randomFloor(s: State, lv: Level): number {
  for (let t = 0; t < 400; t++) {
    const rm = lv.rooms[ri(s, 0, lv.rooms.length - 1)];
    const x = ri(s, rm[0], rm[0] + rm[2] - 1), y = ri(s, rm[1], rm[1] + rm[3] - 1), i = idx(x, y);
    if (lv.tiles[i] === T.FLOOR && !lv.mons.some((m) => m.x === x && m.y === y) && !(x === s.p.x && y === s.p.y)) return i;
  }
  return lv.up;
}

function freeNear(s: State, lv: Level, x: number, y: number): [number, number] | null {
  for (let r = 1; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!inb(nx, ny)) continue;
    const t = lv.tiles[idx(nx, ny)];
    if ((t === T.FLOOR || t === T.DOOROPEN) && !lv.mons.some((m) => m.x === nx && m.y === ny) && !(nx === s.p.x && ny === s.p.y)) return [nx, ny];
  }
  return null;
}

// ───────── Sicht ─────────

export function visibleSet(s: State): Set<number> {
  const lv = level(s);
  const r = s.p.blind > 0 ? 1 : 9;
  return computeFov(lv.tiles, s.p.x, s.p.y, r);
}

function updateSeen(s: State) {
  const lv = level(s);
  for (const i of visibleSet(s)) lv.seen[i] = 1;
}

export function visibleMonsters(s: State): Mon[] {
  const vis = visibleSet(s);
  return level(s).mons.filter((m) => vis.has(idx(m.x, m.y))).sort((a, b) => dist2(s.p, a) - dist2(s.p, b));
}
const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// ───────── Namen ─────────

export function isKnown(s: State, k: string) { return s.known.includes(k); }

export function itemName(s: State, it: Item): string {
  const q = it.qty > 1 && it.type !== 'gold' ? `${it.qty}× ` : '';
  switch (it.kind) {
    case 'weapon': return `${WEAPON[it.type].name}${isKnown(s, `plus:${it.id}`) ? ` ${it.plus >= 0 ? '+' : ''}${it.plus}` : ''}`;
    case 'armor': return `${ARMOR[it.type].name}${isKnown(s, `plus:${it.id}`) ? ` ${it.plus >= 0 ? '+' : ''}${it.plus}` : ''}`;
    case 'potion': return isKnown(s, `potion:${it.type}`) ? `${q}${POTION[it.type].name}` : `${q}${s.ids.potion[it.type]} Flasche`;
    case 'scroll': return isKnown(s, `scroll:${it.type}`) ? `${q}${SCROLL[it.type].name}` : `${q}Schriftrolle „${s.ids.scroll[it.type]}“`;
    case 'wand': return isKnown(s, `wand:${it.type}`) ? `${WAND[it.type].name}${it.charges !== undefined ? ` (${it.charges})` : ''}` : `${s.ids.wand[it.type]}stab`;
    case 'food': return it.type === 'gold' ? `${it.qty} Goldstücke` : `${q}${it.type === 'brot' ? 'Brot' : 'Apfel'}`;
    case 'amulet': return 'Zeitamulett';
  }
}

export const weaponOf = (s: State) => s.p.inv.find((i) => i.id === s.p.weapon) ?? null;
export const armorOf = (s: State) => s.p.inv.find((i) => i.id === s.p.armor) ?? null;
export const armorClass = (s: State) => { const a = armorOf(s); return a ? ARMOR[a.type].ac + a.plus : 0; };

// ───────── Zeit ─────────

function endTurn(s: State, cost = 100) {
  if (s.over) return;
  const p = s.p;
  const speed = p.haste > 0 ? 2 : p.slow > 0 ? 0.5 : 1;
  const c = cost / speed;
  s.turn++;
  // Hunger
  p.food -= 1;
  if (p.food === 300) msg(s, 'Du wirst hungrig.', 'bad');
  if (p.food === 100) msg(s, 'Du bist schwach vor Hunger!', 'danger');
  if (p.food <= 0) { p.food = 0; hurtPlayer(s, 1, 'Verhungert'); }
  // Statuswerte
  if (p.poison > 0) { p.poison--; hurtPlayer(s, 1, 'Gift'); if (p.poison === 0) msg(s, 'Das Gift lässt nach.', 'good'); }
  for (const k of ['haste', 'slow', 'blind', 'confused', 'telepathy', 'fear'] as const) if (p[k] > 0) { p[k]--; if (p[k] === 0) msg(s, `${({ haste: 'Die Eile', slow: 'Die Lähmung', blind: 'Die Blindheit', confused: 'Die Verwirrung', telepathy: 'Die Gedankensicht', fear: 'Die Furcht' } as const)[k]} lässt nach.`, 'info'); }
  // Heilung
  if (!s.over && p.poison === 0 && p.food > 0 && s.turn % Math.max(4, 12 - p.lvl) === 0 && p.hp < p.maxHp) p.hp++;
  if (s.turn % 7 === 0 && p.mp < p.maxMp) p.mp++;
  // Passives Suchen (Schurkin)
  if (CLASS[p.cls].stealth) searchAround(s, 1, 0.35);
  monstersAct(s, c);
  updateSeen(s);
}

function hurtPlayer(s: State, dmg: number, cause: string) {
  const p = s.p;
  p.hp -= dmg;
  s.stats.damageTaken += dmg;
  if (p.hp <= 0 && !s.over) { p.hp = 0; s.over = { win: false, cause }; s.killer = cause; msg(s, `Du stirbst: ${cause}.`, 'danger'); s.events.push('death'); }
}

// ───────── Kampf ─────────

export function toHit(s: State, m: Mon): number {
  const w = weaponOf(s);
  const wd = w ? WEAPON[w.type] : null;
  return Math.max(20, Math.min(97, 78 + 3 * s.p.lvl + (wd ? wd.acc : 0) + (w ? w.plus * 3 : 0) - MON[m.kind].def * 4));
}

export function playerDamage(s: State): [number, number] {
  const w = weaponOf(s);
  const wd = w ? WEAPON[w.type] : { dmg: [1, 2] as [number, number] };
  const bonus = (w ? w.plus : 0) + s.p.str + CLASS[s.p.cls].dmgBonus + Math.floor(s.p.lvl / 3);
  return [Math.max(1, wd.dmg[0] + bonus), Math.max(1, wd.dmg[1] + bonus)];
}

function gainXp(s: State, xp: number) {
  const p = s.p;
  p.xp += xp;
  while (p.lvl < XP_TABLE.length && p.xp >= XP_TABLE[p.lvl]) {
    p.lvl++;
    const gain = p.cls === 'krieger' ? 7 : p.cls === 'schurke' ? 5 : 4;
    p.maxHp += gain; p.hp += gain;
    if (p.maxMp > 0) { p.maxMp += 3; p.mp = Math.min(p.maxMp, p.mp + 3); }
    msg(s, `Du erreichst Stufe ${p.lvl}!`, 'good');
    s.events.push(`levelup:${p.lvl}`);
  }
}

function killMon(s: State, m: Mon, by: string) {
  const lv = level(s);
  const def = MON[m.kind];
  lv.mons = lv.mons.filter((x) => x !== m);
  s.p.kills++;
  gainXp(s, def.xp);
  msg(s, `${by} besiegt: ${def.name}.`, 'good');
  s.events.push(`kill:${m.kind}`);
  if (def.flags.includes('boss')) { s.stats.killedBoss = true; msg(s, 'Der Drache stürzt tot zu Boden!', 'good'); s.events.push('boss'); }
  if (def.flags.includes('split') === false && chance(s, 0.3)) { const g = Math.max(1, ri(s, 1, 4)) * s.depth; lv.items.push({ x: m.x, y: m.y, item: { id: s.nextId++, kind: 'food', type: 'gold', plus: 0, qty: g } }); }
}

export function damageMon(s: State, m: Mon, dmg: number, by = 'Du'): boolean {
  const def = MON[m.kind];
  m.hp -= dmg;
  m.awake = true;
  if (m.hp <= 0) { killMon(s, m, by); return true; }
  if (def.flags.includes('split') && m.hp >= 4) {
    const lv = level(s);
    const f = freeNear(s, lv, m.x, m.y);
    if (f) {
      const half = Math.ceil(m.hp / 2);
      m.hp -= half;
      lv.mons.push({ ...m, id: s.nextId++, x: f[0], y: f[1], hp: half, maxHp: Math.max(half, 4) });
      msg(s, 'Der Schleim teilt sich!', 'info');
    }
  }
  if (def.flags.includes('coward') && m.hp < m.maxHp * 0.3) m.fear = 8;
  return false;
}

function attackMon(s: State, m: Mon) {
  const def = MON[m.kind];
  const p = s.p;
  const w = weaponOf(s);
  const asleep = !m.awake || m.sleep > 0;
  const hit = chance(s, toHit(s, m) / 100) || asleep;
  if (w && !isKnown(s, `plus:${w.id}`)) s.known.push(`plus:${w.id}`);
  if (!hit) { msg(s, `Du verfehlst ${def.name}.`, 'info'); m.awake = true; return; }
  const [lo, hi] = playerDamage(s);
  let dmg = ri(s, lo, hi);
  const crit = chance(s, w ? WEAPON[w.type].crit : 0.04);
  if (crit) dmg *= 2;
  let tag = crit ? ' – kritisch!' : '';
  if (asleep) { dmg *= CLASS[p.cls].stealth ? 3 : 2; tag = ' im Schlaf!'; }
  msg(s, `Du triffst ${def.name} (${dmg})${tag}`, 'hit');
  s.events.push('hit');
  damageMon(s, m, dmg);
  // Lärm weckt Nachbarn
  for (const o of level(s).mons) if (o !== m && dist2(o, p) <= 25 && chance(s, 0.25)) o.awake = true;
}

function monAttack(s: State, m: Mon) {
  const def = MON[m.kind];
  const p = s.p;
  const hitChance = Math.max(25, Math.min(95, 75 + def.acc - 5 * armorClass(s) - (p.haste > 0 ? 10 : 0)));
  if (!chance(s, hitChance / 100)) { msg(s, `${def.name} verfehlt dich.`, 'info'); return; }
  const dmg = Math.max(1, ri(s, def.atk[0], def.atk[1]) - Math.floor(armorClass(s) / 2));
  s.stats.hitsTaken++;
  msg(s, `${def.name} trifft dich (${dmg}).`, 'bad');
  s.events.push('hurt');
  if (def.flags.includes('poison') && chance(s, 0.4)) { p.poison += 5; msg(s, 'Du wurdest vergiftet!', 'bad'); }
  if (def.flags.includes('drain')) m.hp = Math.min(m.maxHp, m.hp + Math.ceil(dmg / 2));
  hurtPlayer(s, dmg, def.name);
}

// ───────── Monster ─────────

function walkable(lv: Level, x: number, y: number, pass = false) {
  if (!inb(x, y)) return false;
  const t = lv.tiles[idx(x, y)];
  return pass ? x > 0 && y > 0 && x < W - 1 && y < H - 1 : t !== T.WALL && t !== T.CHEST;
}

const DIRS8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function monstersAct(s: State, cost: number) {
  const lv = level(s);
  if (!lv.mons.length) return;
  const dm = distances(lv.tiles, idx(s.p.x, s.p.y), 40);
  for (const m of [...lv.mons]) {
    if (s.over) return;
    if (!lv.mons.includes(m)) continue;
    m.energy += MON[m.kind].speed * cost / 100;
    let guard = 0;
    while (m.energy >= 100 && guard++ < 3 && lv.mons.includes(m) && !s.over) { m.energy -= 100; monAct(s, m, dm); }
  }
}

function monAct(s: State, m: Mon, dm: number[]) {
  const lv = level(s), def = MON[m.kind], p = s.p;
  if (m.poison > 0) { m.poison--; m.hp -= 1; if (m.hp <= 0) { killMon(s, m, 'Das Gift'); return; } }
  if (m.sleep > 0) { m.sleep--; return; }
  if (def.flags.includes('regen') && s.turn % 3 === 0 && m.hp < m.maxHp) m.hp++;
  if (m.cd > 0) m.cd--;
  const d2 = dist2(m, p);
  const seePlayer = d2 <= 144 && hasLos(lv.tiles, m.x, m.y, p.x, p.y);
  if (!m.awake) {
    const stealth = CLASS[p.cls].stealth ? 0.5 : 1;
    const armorStealth = armorOf(s)?.type === 'platte' ? 1.5 : 1;
    if (d2 <= 64 && seePlayer && chance(s, 0.14 * stealth * armorStealth)) { m.awake = true; if (d2 <= 36) msg(s, `${def.name} bemerkt dich.`, 'danger'); }
    else if (d2 <= 9 && chance(s, 0.1)) m.awake = true;
    if (!m.awake) return;
  }
  if (m.fear > 0) m.fear--;
  const myIdx = idx(m.x, m.y);
  const here = dm[myIdx];
  const adjacent = Math.abs(m.x - p.x) <= 1 && Math.abs(m.y - p.y) <= 1;
  const tryStep = (dx: number, dy: number): boolean => {
    const nx = m.x + dx, ny = m.y + dy;
    if (!walkable(lv, nx, ny, def.flags.includes('pass'))) return false;
    if (nx === p.x && ny === p.y) return false;
    if (lv.mons.some((o) => o !== m && o.x === nx && o.y === ny)) return false;
    if (lv.tiles[idx(nx, ny)] === T.DOOR) lv.tiles[idx(nx, ny)] = T.DOOROPEN;
    m.x = nx; m.y = ny;
    return true;
  };
  // Flucht
  if (m.fear > 0) {
    let best: [number, number] | null = null, bd = -1;
    for (const [dx, dy] of DIRS8) { const nx = m.x + dx, ny = m.y + dy; if (walkable(lv, nx, ny) && !lv.mons.some((o) => o.x === nx && o.y === ny) && !(nx === p.x && ny === p.y)) { const dd = dist2({ x: nx, y: ny }, p); if (dd > bd) { bd = dd; best = [dx, dy]; } } }
    if (best) tryStep(best[0], best[1]);
    return;
  }
  // Fernkampf
  if (def.range && seePlayer && d2 <= def.range * def.range && m.cd === 0 && !adjacent) {
    m.cd = def.flags.includes('boss') ? 4 : 3;
    const dmg = Math.max(1, ri(s, def.atk[0], def.atk[1]) - Math.floor(armorClass(s) / 3));
    msg(s, def.flags.includes('boss') ? `Der Drache speit Feuer auf dich (${dmg})!` : `${def.name} schleudert Magie auf dich (${dmg})!`, 'bad');
    s.stats.hitsTaken++;
    s.events.push('hurt');
    hurtPlayer(s, dmg, def.name);
    return;
  }
  if (def.range && seePlayer && d2 < 16 && !def.flags.includes('boss')) {
    // Abstand halten
    let best: [number, number] | null = null, bd = d2;
    for (const [dx, dy] of DIRS8) { const nx = m.x + dx, ny = m.y + dy; if (walkable(lv, nx, ny) && !lv.mons.some((o) => o.x === nx && o.y === ny) && !(nx === p.x && ny === p.y)) { const dd = dist2({ x: nx, y: ny }, p); if (dd > bd) { bd = dd; best = [dx, dy]; } } }
    if (best && tryStep(best[0], best[1])) return;
  }
  if (def.flags.includes('erratic') && chance(s, 0.45)) { const [dx, dy] = DIRS8[ri(s, 0, 7)]; tryStep(dx, dy); return; }
  if (adjacent) { monAttack(s, m); return; }
  if (def.flags.includes('pass')) {
    const dx = Math.sign(p.x - m.x), dy = Math.sign(p.y - m.y);
    if (!tryStep(dx, dy) && !tryStep(dx, 0)) tryStep(0, dy);
    return;
  }
  // Verfolgen entlang der Abstandskarte
  if (here >= 0 || seePlayer) {
    let best: [number, number] | null = null, bv = here >= 0 ? here : 9999;
    const cand = DIRS8.map(([dx, dy]) => [dx, dy, dm[idx(m.x + dx, m.y + dy)] ?? -1] as [number, number, number]).filter((c) => inb(m.x + c[0], m.y + c[1]) && c[2] >= 0).sort((a, b) => a[2] - b[2]);
    for (const c of cand) { if (c[2] < bv && tryStep(c[0], c[1])) { best = [c[0], c[1]]; break; } }
    if (!best && seePlayer) { const dx = Math.sign(p.x - m.x), dy = Math.sign(p.y - m.y); if (!tryStep(dx, dy) && !tryStep(dx, 0)) tryStep(0, dy); }
    return;
  }
  if (chance(s, 0.3)) { const [dx, dy] = DIRS8[ri(s, 0, 7)]; tryStep(dx, dy); }
}

// ───────── Fallen und Truhen ─────────

function searchAround(s: State, r: number, p: number) {
  const lv = level(s);
  for (const t of lv.traps) {
    if (t.seen) continue;
    const [x, y] = xy(t.idx);
    if (Math.abs(x - s.p.x) <= r && Math.abs(y - s.p.y) <= r && chance(s, p)) { t.seen = true; msg(s, 'Du entdeckst eine Falle!', 'good'); s.events.push('trap'); }
  }
}

function triggerTrap(s: State, i: number) {
  const lv = level(s);
  const t = lv.traps.find((x) => x.idx === i);
  if (!t) return;
  t.seen = true;
  s.events.push('trapfired');
  switch (t.type) {
    case 'spike': { const d = Math.max(1, ri(s, 3, 6) - Math.floor(armorClass(s) / 2)); msg(s, `Spitze Stacheln! (${d})`, 'bad'); hurtPlayer(s, d, 'Stachelfalle'); break; }
    case 'dart': { msg(s, 'Ein Giftpfeil trifft dich!', 'bad'); s.p.poison += 6; hurtPlayer(s, ri(s, 1, 3), 'Giftpfeil'); break; }
    case 'tele': { msg(s, 'Eine Teleportfalle!', 'info'); teleportPlayer(s); break; }
    case 'alarm': { msg(s, 'Ein Alarm gellt durch das Verlies!', 'danger'); for (const m of lv.mons) m.awake = true; break; }
    case 'pit': {
      if (s.depth < MAX_DEPTH) { msg(s, 'Du stürzt in eine Grube und fällst eine Ebene tiefer!', 'bad'); hurtPlayer(s, ri(s, 2, 5), 'Sturz'); if (!s.over) enterLevel(s, s.depth + 1, 'random'); }
      else msg(s, 'Eine Grube – aber der Boden hält.', 'info');
      break;
    }
  }
}

function teleportPlayer(s: State) {
  const lv = level(s);
  const i = randomFloor(s, lv);
  [s.p.x, s.p.y] = xy(i);
}

function openChest(s: State, i: number) {
  const lv = level(s);
  lv.tiles[i] = T.FLOOR;
  const [x, y] = xy(i);
  const r = mulberry32(hashString(`${s.seed}:chest:${s.depth}:${i}`));
  const n = 1 + (r() < 0.5 ? 1 : 0);
  msg(s, 'Du öffnest die Truhe.', 'item');
  for (let k = 0; k < n; k++) lv.items.push({ x, y, item: rollItem(r, s.depth + 1, ctxOf(s)) });
  lv.items.push({ x, y, item: { id: s.nextId++, kind: 'food', type: 'gold', plus: 0, qty: ri(s, 8, 16) * s.depth } });
  pickup(s, true);
}

// ───────── Gegenstände ─────────

export const MAX_INV = 22;

function addToInv(s: State, it: Item): boolean {
  if (it.kind === 'food' && it.type === 'gold') { s.p.gold += it.qty; return true; }
  const same = it.kind === 'potion' || it.kind === 'scroll' || it.kind === 'food' ? s.p.inv.find((x) => x.kind === it.kind && x.type === it.type) : undefined;
  if (same) { same.qty += it.qty; return true; }
  if (s.p.inv.length >= MAX_INV) return false;
  s.p.inv.push(it);
  return true;
}

/** Hebt Gegenstände am Standort auf; `quiet` unterdrückt „nichts da“. */
export function pickup(s: State, quiet = false): boolean {
  const lv = level(s);
  const here = lv.items.filter((f) => f.x === s.p.x && f.y === s.p.y);
  if (!here.length) { if (!quiet) msg(s, 'Hier liegt nichts.', 'info'); return false; }
  let took = false;
  for (const f of here) {
    if (f.item.kind === 'amulet') {
      lv.items = lv.items.filter((x) => x !== f);
      s.p.inv.push(f.item);
      msg(s, 'Du nimmst das Zeitamulett! Der Keller gehört dir.', 'good');
      s.over = { win: true, cause: 'Amulett geborgen' };
      s.events.push('win');
      return true;
    }
    if (addToInv(s, f.item)) {
      lv.items = lv.items.filter((x) => x !== f);
      took = true;
      msg(s, f.item.kind === 'food' && f.item.type === 'gold' ? `Du findest ${f.item.qty} Gold.` : `Du nimmst ${itemName(s, f.item)}.`, 'item');
      s.events.push(f.item.type === 'gold' ? 'gold' : 'pick');
    } else msg(s, 'Dein Rucksack ist voll.', 'bad');
  }
  return took;
}

function consume(s: State, it: Item) {
  it.qty--;
  if (it.qty <= 0) s.p.inv = s.p.inv.filter((x) => x !== it);
}

function learn(s: State, kind: 'potion' | 'scroll' | 'wand', type: string, text: string) {
  const k = `${kind}:${type}`;
  if (!s.known.includes(k)) { s.known.push(k); msg(s, text, 'good'); s.events.push(`identify:${kind}`); }
}

export function usePotion(s: State, it: Item): boolean {
  if (it.kind !== 'potion' || s.over) return false;
  const p = s.p;
  const t = it.type;
  consume(s, it);
  const def = POTION[t];
  switch (t) {
    case 'heilung': { const h = Math.min(p.maxHp - p.hp, 14 + p.lvl * 2); p.hp += h; p.poison = 0; msg(s, `Du fühlst dich besser (+${h}).`, 'good'); break; }
    case 'staerke': p.str++; msg(s, 'Du fühlst dich stärker!', 'good'); break;
    case 'schnell': p.haste += 20; msg(s, 'Alles wirkt langsam – du bist schnell!', 'good'); break;
    case 'telepathie': p.telepathy += 40; msg(s, 'Du spürst alle Lebewesen der Ebene.', 'good'); break;
    case 'mana': p.mp = p.maxMp; msg(s, p.maxMp ? 'Dein Mana ist voll.' : 'Du spürst ein Kribbeln.', 'good'); break;
    case 'gift': p.poison += 8; msg(s, 'Pfui – Gift!', 'bad'); break;
    case 'blind': p.blind += 18; msg(s, 'Alles wird schwarz!', 'bad'); break;
    case 'wirr': p.confused += 14; msg(s, 'Dir wird schwindlig.', 'bad'); break;
  }
  learn(s, 'potion', t, `Es war ein ${def.name}.`);
  endTurn(s);
  return true;
}

export function readScroll(s: State, it: Item): boolean {
  if (it.kind !== 'scroll' || s.over) return false;
  const lv = level(s), p = s.p;
  const t = it.type;
  consume(s, it);
  switch (t) {
    case 'teleport': teleportPlayer(s); msg(s, 'Die Welt dreht sich – du wirst versetzt.', 'info'); break;
    case 'karte': for (let i = 0; i < W * H; i++) if (lv.tiles[i] !== T.WALL || neighbors4(i).some((n) => lv.tiles[n] !== T.WALL)) lv.seen[i] = 1; msg(s, 'Der Grundriss der Ebene zeichnet sich ab.', 'good'); break;
    case 'verzauberung': {
      const w = weaponOf(s), a = armorOf(s);
      const target = w && (!a || chance(s, 0.5)) ? w : a;
      if (target) { target.plus++; s.known.push(`plus:${target.id}`); msg(s, `${itemName(s, target)} glüht kurz auf.`, 'good'); } else msg(s, 'Nichts geschieht.', 'info');
      break;
    }
    case 'furcht': { let n = 0; const vis = visibleSet(s); for (const m of lv.mons) if (vis.has(idx(m.x, m.y))) { m.fear = 14; n++; } msg(s, n ? `${n} Monster fliehen vor dir!` : 'Kein Monster in Sicht.', n ? 'good' : 'info'); break; }
    case 'feuerball': { let n = 0; for (const m of [...lv.mons]) if (dist2(m, p) <= 9 && hasLos(lv.tiles, p.x, p.y, m.x, m.y)) { n++; damageMon(s, m, ri(s, 8, 14), 'Feuer'); } msg(s, n ? 'Flammen wirbeln um dich!' : 'Flammen züngeln und verlöschen.', 'info'); break; }
    case 'erkennen': {
      const un = p.inv.filter((x) => (x.kind === 'potion' || x.kind === 'scroll' || x.kind === 'wand') && !isKnown(s, `${x.kind}:${x.type}`));
      const un2 = p.inv.filter((x) => (x.kind === 'weapon' || x.kind === 'armor') && !isKnown(s, `plus:${x.id}`));
      const x = un[0] ?? un2[0];
      if (!x) { msg(s, 'Du weißt schon alles Wichtige.', 'info'); break; }
      if (x.kind === 'weapon' || x.kind === 'armor') s.known.push(`plus:${x.id}`); else s.known.push(`${x.kind}:${x.type}`);
      msg(s, `Erkannt: ${itemName(s, x)}.`, 'good');
      break;
    }
    case 'rufen': { let n = 0; const pool = Object.values(MON).filter((m) => m.minD <= s.depth && m.maxD >= s.depth && !m.flags.includes('boss')); for (let k = 0; k < 3 && pool.length; k++) { const f = freeNear(s, lv, p.x, p.y); if (!f) break; const d = pool[ri(s, 0, pool.length - 1)]; lv.mons.push({ id: s.nextId++, kind: d.id, x: f[0], y: f[1], hp: d.hp, maxHp: d.hp, energy: 0, awake: true, fear: 0, sleep: 0, cd: 0, poison: 0 }); n++; } msg(s, `${n} Monster erscheinen!`, 'bad'); break; }
  }
  learn(s, 'scroll', t, `Das war: ${SCROLL[t].name}.`);
  endTurn(s);
  return true;
}

export function eat(s: State, it: Item): boolean {
  if (it.kind !== 'food' || it.type === 'gold') return false;
  const n = it.type === 'brot' ? 700 : 300;
  consume(s, it);
  s.p.food = Math.min(2000, s.p.food + n);
  msg(s, it.type === 'brot' ? 'Das Brot schmeckt trocken, aber sättigt.' : 'Ein knackiger Apfel.', 'good');
  endTurn(s);
  return true;
}

export function equip(s: State, it: Item): boolean {
  if (it.kind !== 'weapon' && it.kind !== 'armor') return false;
  if (it.kind === 'weapon') s.p.weapon = it.id; else s.p.armor = it.id;
  if (!isKnown(s, `plus:${it.id}`)) s.known.push(`plus:${it.id}`);
  msg(s, `Du legst ${itemName(s, it)} an.`, 'item');
  endTurn(s);
  return true;
}

export function drop(s: State, it: Item): boolean {
  const lv = level(s);
  if (s.p.weapon === it.id) s.p.weapon = null;
  if (s.p.armor === it.id) s.p.armor = null;
  s.p.inv = s.p.inv.filter((x) => x !== it);
  lv.items.push({ x: s.p.x, y: s.p.y, item: it } as FloorItem);
  msg(s, `Du lässt ${itemName(s, it)} fallen.`, 'info');
  endTurn(s);
  return true;
}

function bolt(s: State, tx: number, ty: number): [number, number][] {
  const lv = level(s);
  const path = line(s.p.x, s.p.y, tx, ty);
  // über das Ziel hinaus verlängern
  const dx = Math.sign(tx - s.p.x), dy = Math.sign(ty - s.p.y);
  let x = tx, y = ty;
  for (let k = 0; k < 6; k++) { x += dx; y += dy; path.push([x, y]); }
  const out: [number, number][] = [];
  for (let i = 1; i < path.length; i++) { const [px, py] = path[i]; if (!inb(px, py) || lv.tiles[idx(px, py)] === T.WALL || lv.tiles[idx(px, py)] === T.DOOR) break; out.push([px, py]); }
  return out;
}

export function zapWand(s: State, it: Item, tx: number, ty: number): boolean {
  if (it.kind !== 'wand' || s.over) return false;
  if ((it.charges ?? 0) <= 0) { msg(s, 'Der Stab ist leer.', 'bad'); endTurn(s); return true; }
  const lv = level(s);
  it.charges = (it.charges ?? 1) - 1;
  const t = it.type;
  const path = bolt(s, tx, ty);
  const target = lv.mons.find((m) => m.x === tx && m.y === ty);
  switch (t) {
    case 'blitz': { let n = 0; for (const [x, y] of path) { const m = lv.mons.find((q) => q.x === x && q.y === y); if (m) { n++; damageMon(s, m, ri(s, 7, 13), 'Der Blitz'); } } msg(s, n ? 'Ein Blitz zuckt durch die Gegner!' : 'Ein Blitz verpufft.', 'info'); break; }
    case 'feuer': { let n = 0; for (const m of [...lv.mons]) if ((m.x - tx) ** 2 + (m.y - ty) ** 2 <= 5 && hasLos(lv.tiles, tx, ty, m.x, m.y)) { n++; damageMon(s, m, ri(s, 9, 15), 'Das Feuer'); } msg(s, n ? 'Ein Feuerball explodiert!' : 'Der Feuerball verglüht.', 'info'); break; }
    case 'schlaf': if (target) { target.sleep = 25; target.awake = true; msg(s, `${MON[target.kind].name} schläft ein.`, 'good'); } else msg(s, 'Nichts geschieht.', 'info'); break;
    case 'weg': if (target) { const f = randomFloor(s, lv); [target.x, target.y] = xy(f); target.awake = false; msg(s, `${MON[target.kind].name} verschwindet.`, 'good'); } else msg(s, 'Nichts geschieht.', 'info'); break;
  }
  learn(s, 'wand', t, `Das war: ${WAND[t].name}.`);
  endTurn(s);
  return true;
}

export function castSpell(s: State, id: string, tx: number, ty: number): boolean {
  const sp = SPELL[id];
  if (!sp || !CLASS[s.p.cls].spells.includes(id) || s.over) return false;
  if (s.p.mp < sp.cost) { msg(s, 'Nicht genug Mana.', 'bad'); return false; }
  const lv = level(s);
  if (id === 'funke') {
    const m = lv.mons.find((q) => q.x === tx && q.y === ty);
    if (!m || !hasLos(lv.tiles, s.p.x, s.p.y, tx, ty)) { msg(s, 'Kein Ziel.', 'info'); return false; }
    s.p.mp -= sp.cost;
    const dmg = ri(s, 4, 8) + Math.floor(s.p.lvl / 2);
    msg(s, `Dein Funke trifft ${MON[m.kind].name} (${dmg}).`, 'hit');
    s.events.push('spell');
    damageMon(s, m, dmg);
  } else if (id === 'heilen') {
    s.p.mp -= sp.cost;
    const h = Math.min(s.p.maxHp - s.p.hp, Math.ceil(s.p.maxHp / 2));
    s.p.hp += h; s.p.poison = 0;
    msg(s, `Warmes Licht heilt dich (+${h}).`, 'good');
  } else if (id === 'sprung') {
    s.p.mp -= sp.cost;
    teleportPlayer(s);
    msg(s, 'Du springst durch den Raum.', 'info');
  }
  endTurn(s);
  return true;
}

// ───────── Bewegung ─────────

export function move(s: State, dx: number, dy: number, force = false): boolean {
  if (s.over) return false;
  const p = s.p;
  if (p.confused > 0 && chance(s, 0.5)) { const d = DIRS8[ri(s, 0, 7)]; dx = d[0]; dy = d[1]; msg(s, 'Du taumelst.', 'info'); }
  const nx = p.x + dx, ny = p.y + dy;
  if (!inb(nx, ny)) return false;
  const lv = level(s);
  const m = monAt(s, nx, ny);
  if (m) { if (p.fear > 0) { msg(s, 'Du traust dich nicht!', 'bad'); return false; } attackMon(s, m); endTurn(s); return true; }
  const i = idx(nx, ny);
  const t = lv.tiles[i];
  if (t === T.WALL) return false;
  if (t === T.DOOR) { lv.tiles[i] = T.DOOROPEN; msg(s, 'Du öffnest die Tür.', 'info'); s.events.push('door'); endTurn(s); return true; }
  if (t === T.CHEST) { openChest(s, i); endTurn(s); return true; }
  const trap = lv.traps.find((x) => x.idx === i);
  if (trap?.seen && !force) { msg(s, 'Dort ist eine Falle. Mit Umschalt + Richtung gehst du trotzdem hinein.', 'danger'); return false; }
  p.x = nx; p.y = ny;
  if (trap) triggerTrap(s, i);
  if (!s.over && level(s).items.some((f) => f.x === p.x && f.y === p.y)) pickup(s, true);
  if (!s.over && lv.tiles[idx(p.x, p.y)] === T.DOWN) msg(s, 'Eine Treppe führt hinab (Taste >).', 'info');
  endTurn(s);
  return true;
}

export function wait(s: State, search = false): boolean {
  if (s.over) return false;
  if (search) { s.stats.searched++; searchAround(s, 2, 0.6); }
  endTurn(s);
  return true;
}

export function descend(s: State): boolean {
  if (s.over) return false;
  const lv = level(s);
  if (lv.tiles[idx(s.p.x, s.p.y)] !== T.DOWN) { msg(s, 'Hier ist keine Treppe nach unten.', 'info'); return false; }
  enterLevel(s, s.depth + 1, 'up');
  msg(s, `Du steigst auf Ebene ${s.depth} hinab.`, 'info');
  endTurn(s, 0);
  return true;
}

export function ascend(s: State): boolean {
  if (s.over) return false;
  const lv = level(s);
  if (lv.tiles[idx(s.p.x, s.p.y)] !== T.UP) { msg(s, 'Hier ist keine Treppe nach oben.', 'info'); return false; }
  if (s.depth === 1) { s.over = { win: false, cause: 'Das Verlies verlassen' }; s.events.push('leave'); msg(s, 'Du verlässt das Verlies lebend, aber ohne das Amulett.', 'info'); return true; }
  enterLevel(s, s.depth - 1, 'down');
  msg(s, `Du steigst auf Ebene ${s.depth} hinauf.`, 'info');
  endTurn(s, 0);
  return true;
}

// ───────── Wege ─────────

/** Kürzester Weg (Felder, ohne Start) über bekannte, begehbare Felder; leer wenn keiner. */
export function pathTo(s: State, tx: number, ty: number): [number, number][] {
  const lv = level(s);
  const start = idx(s.p.x, s.p.y), goal = idx(tx, ty);
  if (start === goal) return [];
  const prev = new Map<number, number>([[start, -1]]);
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === goal) break;
    for (const n of neighbors4(c)) {
      if (prev.has(n) || !lv.seen[n] || lv.tiles[n] === T.WALL || lv.tiles[n] === T.CHEST) continue;
      const tr = lv.traps.find((x) => x.idx === n);
      if (tr?.seen && n !== goal) continue;
      prev.set(n, c); q.push(n);
    }
  }
  if (!prev.has(goal)) return [];
  const out: [number, number][] = [];
  for (let c = goal; c !== start; c = prev.get(c)!) out.push(xy(c));
  return out.reverse();
}

// ───────── Wertung ─────────

export function score(s: State): number {
  return s.p.gold + s.stats.maxDepth * 100 + s.p.kills * 10 + s.p.lvl * 25 + (s.over?.win ? 2000 + Math.max(0, 4000 - s.turn) : 0);
}

export const monName = (k: MonKind) => MON[k].name;

// ───────── Automatisches Erkunden ─────────

/** Erster Schritt zum nächsten unerforschten Rand oder bekannten Gegenstand; null wenn nichts mehr zu entdecken. */
export function exploreStep(s: State): [number, number] | null {
  const lv = level(s);
  const start = idx(s.p.x, s.p.y);
  const itemAt = new Set(lv.items.filter((f) => lv.seen[idx(f.x, f.y)]).map((f) => idx(f.x, f.y)));
  const prev = new Map<number, number>([[start, -1]]);
  const q = [start];
  let goal = -1;
  for (let h = 0; h < q.length && goal < 0; h++) {
    const c = q[h];
    if (c !== start && (itemAt.has(c) || (lv.tiles[c] !== T.WALL && xy8(c).some((n) => !lv.seen[n])))) { goal = c; break; }
    for (const n of neighbors4(c)) {
      if (prev.has(n) || !lv.seen[n] || lv.tiles[n] === T.WALL || lv.tiles[n] === T.CHEST) continue;
      if (lv.traps.some((t) => t.seen && t.idx === n)) continue;
      prev.set(n, c); q.push(n);
    }
  }
  if (goal < 0) return null;
  let c = goal;
  while (prev.get(c) !== start) c = prev.get(c)!;
  const [x, y] = xy(c);
  return [x - s.p.x, y - s.p.y];
}

function xy8(i: number): number[] {
  const [x, y] = xy(i), out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inb(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
  return out;
}
