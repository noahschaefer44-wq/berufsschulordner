// Inhalte des Verlieses: Monster, Gegenstände, Klassen und Zufallsnamen.

export type MonKind = 'ratte' | 'fledermaus' | 'kobold' | 'schleim' | 'spinne' | 'skelett' | 'ork' | 'geist' | 'adept' | 'troll' | 'golem' | 'drache';

export interface MonDef {
  id: MonKind;
  name: string;
  glyph: string;
  color: string;
  hp: number;
  atk: [number, number];
  acc: number;
  def: number;
  speed: number;
  minD: number;
  maxD: number;
  xp: number;
  /** erratic, poison, split, pass, regen, ranged, coward, boss, drain */
  flags: string[];
  range?: number;
}

export const MONSTERS: MonDef[] = [
  { id: 'ratte', name: 'Ratte', glyph: 'r', color: '#b08a60', hp: 6, atk: [1, 3], acc: 0, def: 0, speed: 100, minD: 1, maxD: 3, xp: 3, flags: [] },
  { id: 'fledermaus', name: 'Fledermaus', glyph: 'b', color: '#9a8fc0', hp: 5, atk: [1, 3], acc: 0, def: 1, speed: 150, minD: 1, maxD: 4, xp: 4, flags: ['erratic'] },
  { id: 'kobold', name: 'Kobold', glyph: 'k', color: '#d2a24a', hp: 9, atk: [2, 4], acc: 0, def: 1, speed: 100, minD: 1, maxD: 4, xp: 6, flags: ['coward'] },
  { id: 'schleim', name: 'Schleim', glyph: 'j', color: '#59d17c', hp: 14, atk: [1, 3], acc: -5, def: 0, speed: 90, minD: 2, maxD: 6, xp: 9, flags: ['split'] },
  { id: 'spinne', name: 'Riesenspinne', glyph: 's', color: '#c8553d', hp: 11, atk: [2, 4], acc: 5, def: 2, speed: 110, minD: 3, maxD: 7, xp: 14, flags: ['poison'] },
  { id: 'skelett', name: 'Skelett', glyph: 'z', color: '#e6e1cf', hp: 16, atk: [3, 6], acc: 0, def: 2, speed: 100, minD: 3, maxD: 8, xp: 16, flags: [] },
  { id: 'ork', name: 'Ork', glyph: 'o', color: '#6fae4b', hp: 22, atk: [3, 7], acc: 5, def: 3, speed: 100, minD: 4, maxD: 8, xp: 22, flags: [] },
  { id: 'geist', name: 'Geist', glyph: 'G', color: '#8fd7ff', hp: 14, atk: [2, 5], acc: 5, def: 4, speed: 100, minD: 5, maxD: 8, xp: 26, flags: ['pass', 'drain'] },
  { id: 'adept', name: 'Magier-Adept', glyph: 'M', color: '#d27cf0', hp: 14, atk: [3, 6], acc: 10, def: 2, speed: 100, minD: 5, maxD: 8, xp: 30, flags: ['ranged'], range: 7 },
  { id: 'troll', name: 'Troll', glyph: 'T', color: '#4da35a', hp: 36, atk: [5, 10], acc: 5, def: 4, speed: 100, minD: 6, maxD: 8, xp: 45, flags: ['regen'] },
  { id: 'golem', name: 'Steingolem', glyph: 'E', color: '#a0a5b0', hp: 52, atk: [6, 12], acc: 0, def: 6, speed: 70, minD: 7, maxD: 8, xp: 60, flags: [] },
  { id: 'drache', name: 'Drache', glyph: 'D', color: '#ff5a3c', hp: 95, atk: [8, 15], acc: 10, def: 6, speed: 100, minD: 8, maxD: 8, xp: 300, flags: ['boss', 'ranged'], range: 6 },
];
export const MON = Object.fromEntries(MONSTERS.map((m) => [m.id, m])) as Record<MonKind, MonDef>;

export type ItemKind = 'weapon' | 'armor' | 'potion' | 'scroll' | 'wand' | 'food' | 'amulet';

export interface WeaponDef { id: string; name: string; dmg: [number, number]; acc: number; crit: number; depth: number }
export const WEAPONS: WeaponDef[] = [
  { id: 'dolch', name: 'Dolch', dmg: [2, 4], acc: 8, crit: 0.15, depth: 1 },
  { id: 'kurzschwert', name: 'Kurzschwert', dmg: [3, 6], acc: 4, crit: 0.06, depth: 1 },
  { id: 'schwert', name: 'Schwert', dmg: [4, 8], acc: 0, crit: 0.06, depth: 3 },
  { id: 'axt', name: 'Streitaxt', dmg: [5, 11], acc: -6, crit: 0.08, depth: 5 },
];
export const WEAPON = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<string, WeaponDef>;

export interface ArmorDef { id: string; name: string; ac: number; depth: number }
export const ARMORS: ArmorDef[] = [
  { id: 'leder', name: 'Lederrüstung', ac: 1, depth: 1 },
  { id: 'kette', name: 'Kettenhemd', ac: 3, depth: 3 },
  { id: 'platte', name: 'Plattenpanzer', ac: 5, depth: 6 },
];
export const ARMOR = Object.fromEntries(ARMORS.map((a) => [a.id, a])) as Record<string, ArmorDef>;

export interface MagicDef { id: string; name: string; bad?: boolean; depth: number; weight: number; info: string }
export const POTIONS: MagicDef[] = [
  { id: 'heilung', name: 'Heiltrank', depth: 1, weight: 30, info: 'Heilt und beendet Gift.' },
  { id: 'staerke', name: 'Trank der Stärke', depth: 2, weight: 8, info: 'Erhöht dauerhaft deinen Schaden.' },
  { id: 'schnell', name: 'Trank der Eile', depth: 1, weight: 14, info: 'Du bist für kurze Zeit doppelt so schnell.' },
  { id: 'telepathie', name: 'Trank der Gedanken', depth: 2, weight: 12, info: 'Du siehst alle Monster der Ebene.' },
  { id: 'mana', name: 'Manatrank', depth: 2, weight: 10, info: 'Stellt Mana wieder her.' },
  { id: 'gift', name: 'Gifttrank', bad: true, depth: 1, weight: 14, info: 'Vergiftet dich.' },
  { id: 'blind', name: 'Trank der Blindheit', bad: true, depth: 2, weight: 10, info: 'Du siehst eine Weile nichts.' },
  { id: 'wirr', name: 'Trank der Verwirrung', bad: true, depth: 2, weight: 10, info: 'Du stolperst in zufällige Richtungen.' },
];
export const SCROLLS: MagicDef[] = [
  { id: 'teleport', name: 'Schriftrolle der Teleportation', depth: 1, weight: 16, info: 'Versetzt dich an einen zufälligen Ort.' },
  { id: 'karte', name: 'Schriftrolle der Karte', depth: 1, weight: 16, info: 'Zeigt den Grundriss der Ebene.' },
  { id: 'verzauberung', name: 'Schriftrolle der Verzauberung', depth: 2, weight: 18, info: 'Verbessert deine Waffe oder Rüstung um +1.' },
  { id: 'furcht', name: 'Schriftrolle der Furcht', depth: 3, weight: 10, info: 'Alle sichtbaren Monster fliehen.' },
  { id: 'feuerball', name: 'Schriftrolle des Feuerballs', depth: 3, weight: 12, info: 'Verbrennt Gegner um dich herum.' },
  { id: 'erkennen', name: 'Schriftrolle der Erkenntnis', depth: 1, weight: 12, info: 'Entschlüsselt einen unbekannten Gegenstand.' },
  { id: 'rufen', name: 'Schriftrolle des Rufens', bad: true, depth: 3, weight: 6, info: 'Ruft Monster herbei.' },
];
export const WANDS: MagicDef[] = [
  { id: 'blitz', name: 'Blitzstab', depth: 3, weight: 14, info: 'Ein Blitz trifft alle Gegner in einer Linie.' },
  { id: 'feuer', name: 'Feuerstab', depth: 4, weight: 10, info: 'Ein Feuerball detoniert am Ziel.' },
  { id: 'schlaf', name: 'Schlafstab', depth: 2, weight: 12, info: 'Das Ziel schläft ein.' },
  { id: 'weg', name: 'Verbannungsstab', depth: 3, weight: 8, info: 'Das Ziel wird weit weg teleportiert.' },
];

export const POTION: Record<string, MagicDef> = Object.fromEntries(POTIONS.map((p) => [p.id, p]));
export const SCROLL: Record<string, MagicDef> = Object.fromEntries(SCROLLS.map((p) => [p.id, p]));
export const WAND: Record<string, MagicDef> = Object.fromEntries(WANDS.map((p) => [p.id, p]));

export const POTION_COLORS = ['rote', 'blaue', 'grüne', 'gelbe', 'violette', 'trübe', 'schwarze', 'silbrige', 'orange', 'rosa'];
export const SCROLL_LABELS = ['ZORK', 'LUMIN', 'KARDA', 'VELO', 'NIMBUS', 'AHRK', 'TOLO', 'FENG', 'MURA', 'SELT'];
export const WAND_WOODS = ['Eichen', 'Eiben', 'Ebenholz', 'Birken', 'Knochen', 'Eisen'];

export interface ClassDef { id: string; name: string; info: string; hp: number; mp: number; weapon: string; armor: string; items: [ItemKind, string, number][]; spells: string[]; stealth: number; dmgBonus: number }
export const CLASSES: ClassDef[] = [
  { id: 'krieger', name: 'Krieger', info: 'Zäh und stark: viele Lebenspunkte, Schwert und Kettenhemd. Keine Zauber.', hp: 34, mp: 0, weapon: 'schwert', armor: 'kette', items: [['food', 'brot', 1], ['potion', 'heilung', 1]], spells: [], stealth: 0, dmgBonus: 1 },
  { id: 'magier', name: 'Magier', info: 'Zerbrechlich, aber mit Funkenwurf, Heilung und Teleport – Mana lädt sich langsam auf.', hp: 20, mp: 14, weapon: 'dolch', armor: 'leder', items: [['food', 'brot', 1], ['scroll', 'karte', 1]], spells: ['funke', 'heilen', 'sprung'], stealth: 0, dmgBonus: 0 },
  { id: 'schurke', name: 'Schurkin', info: 'Leise und schnell: schleicht an Schlafenden vorbei, trifft sie im Schlaf dreifach und entdeckt Fallen.', hp: 24, mp: 0, weapon: 'dolch', armor: 'leder', items: [['food', 'apfel', 2], ['potion', 'schnell', 1]], spells: [], stealth: 1, dmgBonus: 0 },
];
export const CLASS = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<string, ClassDef>;

export interface SpellDef { id: string; name: string; cost: number; info: string; ranged: boolean }
export const SPELLS: SpellDef[] = [
  { id: 'funke', name: 'Funkenwurf', cost: 3, info: 'Ein Funke trifft ein Ziel in Sichtweite (4–8 Schaden).', ranged: true },
  { id: 'heilen', name: 'Heilung', cost: 6, info: 'Heilt dich um etwa die Hälfte deiner Lebenspunkte.', ranged: false },
  { id: 'sprung', name: 'Sprung', cost: 8, info: 'Teleportiert dich an einen zufälligen Ort der Ebene.', ranged: false },
];
export const SPELL = Object.fromEntries(SPELLS.map((s) => [s.id, s])) as Record<string, SpellDef>;

export const XP_TABLE = [0, 20, 45, 80, 130, 200, 290, 400, 540, 720, 950];
export const MAX_DEPTH = 8;
