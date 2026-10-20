import { addAchievements, addSecrets } from '../shared/meta';

export type LSkin = 'lager' | 'pixel' | 'blau';
export type LMode = 'klassisch' | 'zieher' | 'nebel';

export interface LSettings { skin: LSkin; mode: LMode; animate: boolean; showDead: boolean; zoom: number }
export interface LStat { moves: number; pushes: number; time: number; stars: number }
export interface LCustom { id: string; name: string; xsb: string }
export interface LCurrent { id: string; name: string; xsb: string; par: number; moves: string; time: number; mode: LMode; helped: boolean }
export interface LData {
  settings: LSettings;
  levels: Record<string, LStat>;
  cache: Record<string, { xsb: string; par: number }>;
  custom: LCustom[];
  current: LCurrent | null;
  totals: { levels: number; pushes: number };
}

export const LAGER_INIT: LData = {
  settings: { skin: 'lager', mode: 'klassisch', animate: true, showDead: true, zoom: 52 },
  levels: {}, cache: {}, custom: [], current: null, totals: { levels: 0, pushes: 0 },
};

export const MODE_INFO: Record<LMode, { name: string; info: string }> = {
  klassisch: { name: 'Klassisch', info: 'Kisten nur schieben – nie ziehen.' },
  zieher: { name: 'Zieher', info: 'Mit Umschalt (oder dem Schalter „Ziehen“) kannst du eine Kiste hinter dir herziehen.' },
  nebel: { name: 'Nebel', info: 'Du siehst Kisten nur in der Nähe. Merke dir, wo sie stehen.' },
};

addAchievements([
  { game: 'lager', key: 'first', name: 'Erste Lieferung', desc: 'Ein Level gelöst.' },
  { game: 'lager', key: 'intro', name: 'Eingearbeitet', desc: 'Alle Einführungslevel gelöst.' },
  { game: 'lager', key: 'zehn', name: 'Lagerist', desc: '10 Level gelöst.' },
  { game: 'lager', key: 'dreisterne', name: 'Perfektionist', desc: 'Ein Level mit der kürzesten Schiebezahl gelöst.' },
  { game: 'lager', key: 'ohneundo', name: 'Ohne Rückgängig', desc: 'Ein Paketlevel ohne einen einzigen Rückgängig-Zug gelöst.' },
  { game: 'lager', key: 'zieher', name: 'Zieher', desc: 'Ein Level im Zieher-Modus gelöst.' },
  { game: 'lager', key: 'nebel', name: 'Im Nebel', desc: 'Ein Level im Nebel-Modus gelöst.' },
  { game: 'lager', key: 'editor', name: 'Hallenplaner', desc: 'Ein selbstgebautes Level gelöst.' },
  { game: 'lager', key: 'import', name: 'Importeur', desc: 'Ein Level im Standardformat geladen.' },
  { game: 'lager', key: 'paket1', name: 'Lager I geräumt', desc: 'Alle Level von Lager I gelöst.' },
  { game: 'lager', key: 'daily', name: 'Tageslieferung', desc: 'Das Tageslevel gelöst.' },
  { game: 'lager', key: 'klick', name: 'Bequemer Chef', desc: 'Ein Level nur mit Mausklicks gelöst.' },
]);
addSecrets([
  { id: 'lager-ghost', game: 'lager', code: 'geist', title: 'Geisterpfad', riddle: 'Wenn niemand hilft, hilft der Geist der alten Lagerhalle – tippe sein Wort.', effect: 'Zeigt die nächsten drei Schiebezüge der kürzesten Lösung (zählt als Hilfe).' },
  { id: 'lager-stapler', game: 'lager', code: 'stapler', title: 'Staplerfahrer', riddle: 'Wer das Fahrzeug beim Namen nennt, wechselt den Look.', effect: 'Wechselt zwischen den Designs Lagerhalle, Pixel und Blaupause.' },
  { id: 'lager-feierabend', game: 'lager', code: 'feierabend', title: 'Feierabend', riddle: 'Das Wort, das jeder Lagerist am Ende des Tages sagt.', effect: 'Der Löser räumt das Level selbst auf (zählt als Hilfe).' },
]);
