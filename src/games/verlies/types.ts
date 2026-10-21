import type { ItemKind, MonKind } from './content';

export const W = 64, H = 30;
export const T = { WALL: 0, FLOOR: 1, DOOR: 2, DOOROPEN: 3, DOWN: 4, UP: 5, CHEST: 6 } as const;

export interface Item { id: number; kind: ItemKind; type: string; plus: number; qty: number; charges?: number }
export interface FloorItem { x: number; y: number; item: Item }

export interface Mon {
  id: number; kind: MonKind; x: number; y: number; hp: number; maxHp: number; energy: number;
  awake: boolean; fear: number; sleep: number; cd: number; poison: number;
}

export interface Trap { idx: number; type: 'spike' | 'dart' | 'tele' | 'alarm' | 'pit'; seen: boolean }

export interface Level {
  depth: number;
  tiles: number[];
  seen: number[];
  mons: Mon[];
  items: FloorItem[];
  traps: Trap[];
  up: number;
  down: number;
  rooms: [number, number, number, number][];
}

export interface Player {
  x: number; y: number; hp: number; maxHp: number; mp: number; maxMp: number; xp: number; lvl: number; cls: string;
  inv: Item[]; weapon: number | null; armor: number | null; food: number; gold: number;
  poison: number; haste: number; slow: number; blind: number; confused: number; telepathy: number; fear: number;
  str: number; kills: number;
}

export interface Msg { t: number; text: string; kind: 'info' | 'good' | 'bad' | 'hit' | 'item' | 'danger' }

export interface State {
  v: 1;
  seed: string;
  rng: number;
  depth: number;
  levels: Level[];
  p: Player;
  turn: number;
  msgs: Msg[];
  over: null | { win: boolean; cause: string };
  nextId: number;
  ids: { potion: Record<string, string>; scroll: Record<string, string>; wand: Record<string, string> };
  known: string[];
  /** Hilfen durch Zauberwörter: Lauf zählt nicht für Erfolge */
  assisted: boolean;
  /** Ereignisse für die Oberfläche (Erfolge, Töne) – wird von der UI geleert */
  events: string[];
  /** Statistik des Laufs */
  stats: { maxDepth: number; damageTaken: number; killedBoss: boolean; hitsTaken: number; searched: number };
  /** Letztes Opfer / Todesursache */
  killer: string;
}

export const idx = (x: number, y: number) => y * W + x;
export const xy = (i: number): [number, number] => [i % W, (i / W) | 0];
export const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
