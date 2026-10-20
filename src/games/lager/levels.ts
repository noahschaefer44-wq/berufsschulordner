// Lagerhaus: handgebaute Einführungslevel und erzeugte Pakete (jedes Level ist per Löser geprüft lösbar).
import { type GenParams, type Level, generateLevel, parseXsb, solve, toXsb } from './engine';

export const INTRO: { name: string; xsb: string }[] = [
  { name: 'Erste Kiste', xsb: '######\n#@ $.#\n######' },
  { name: 'Um die Ecke', xsb: '######\n#    #\n# @$ #\n#  . #\n######' },
  { name: 'Zwei Kisten', xsb: '#######\n#     #\n# .$@ #\n# $.  #\n#     #\n#######' },
  { name: 'Reihenfolge', xsb: '#######\n#. .  #\n#  $$@#\n#     #\n#######' },
  { name: 'Mit Hindernissen', xsb: '  ####\n###  ###\n#  $  .#\n# #  # #\n#@ $ .  #\n#   ###\n#####' },
  { name: 'Drei in der Ecke', xsb: '#######\n#.    #\n#.$$  #\n# $@  #\n#  .  #\n#######' },
  { name: 'Querfeldein', xsb: '########\n#  .   #\n# $$ # #\n#.  @  #\n#   $ .#\n########' },
  { name: 'Nadelöhr', xsb: '########\n#      #\n# .##$ #\n# .@$  #\n#  ##$ #\n#    . #\n########' },
];

export interface Pack { id: string; name: string; info: string; count: number; params: (i: number) => GenParams }
const ramp = (a: number, b: number, i: number, n: number) => Math.round(a + ((b - a) * i) / Math.max(1, n - 1));

export const PACKS: Pack[] = [
  { id: 'p1', name: 'Lager I – Einsteiger', info: '2–3 Kisten, kleine Hallen.', count: 15, params: (i) => ({ w: ramp(7, 8, i, 15), h: ramp(7, 7, i, 15), boxes: i < 7 ? 2 : 3, pulls: ramp(14, 26, i, 15), walls: 0.08, minPushes: 5 + Math.floor(i / 2) }) },
  { id: 'p2', name: 'Lager II – Routine', info: '3–4 Kisten, verwinkelte Räume.', count: 15, params: (i) => ({ w: ramp(8, 9, i, 15), h: ramp(8, 8, i, 15), boxes: i < 7 ? 3 : 4, pulls: ramp(30, 46, i, 15), walls: 0.11, minPushes: 10 + Math.floor(i / 2) }) },
  { id: 'p3', name: 'Lager III – Profi', info: '4–5 Kisten, enge Gänge.', count: 15, params: (i) => ({ w: ramp(9, 10, i, 15), h: ramp(8, 9, i, 15), boxes: i < 7 ? 4 : 5, pulls: ramp(50, 72, i, 15), walls: 0.13, minPushes: 16 + Math.floor(i / 2) }) },
  { id: 'p4', name: 'Lager IV – Meisterlager', info: '5–6 Kisten. Hier hilft nur Planung.', count: 12, params: (i) => ({ w: ramp(10, 11, i, 12), h: ramp(9, 10, i, 12), boxes: i < 6 ? 5 : 6, pulls: ramp(80, 120, i, 12), walls: 0.14, minPushes: 22 + i }) },
];

export const levelId = {
  intro: (i: number) => `i-${i + 1}`,
  pack: (p: string, i: number) => `${p}-${i + 1}`,
};

export function seedFor(packId: string, i: number): string { return `lager|${packId}|${i}`; }

/** Erzeugt (oder rekonstruiert) ein Paketlevel – synchron. Für UI besser über den Worker (siehe LagerGame). */
export function buildPackLevel(packId: string, i: number): { xsb: string; par: number; name: string } {
  const pack = PACKS.find((p) => p.id === packId)!;
  const lv = generateLevel(seedFor(packId, i), pack.params(i), 2500);
  return { xsb: toXsb(lv), par: lv.par, name: `${pack.name.split(' – ')[0]} · ${i + 1}` };
}

export function introLevel(i: number): { level: Level; par: number } {
  const l = parseXsb(INTRO[i].xsb, INTRO[i].name)!;
  const s = solve(l, undefined, { maxMs: 2000 });
  return { level: l, par: s?.pushes ?? 0 };
}
