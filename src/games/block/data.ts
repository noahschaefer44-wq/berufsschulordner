import { addAchievements, addSecrets } from '../shared/meta';
import { type Cfg, DEFAULT_CFG, type Mode } from './engine';

export type BSkin = 'klar' | 'retro' | 'gb' | 'pastell' | 'kontrast';
export type Action = 'left' | 'right' | 'down' | 'cw' | 'ccw' | 'r180' | 'hard' | 'hold' | 'pause' | 'restart';

export const ACTIONS: { id: Action; name: string }[] = [
  { id: 'left', name: 'Links' }, { id: 'right', name: 'Rechts' }, { id: 'down', name: 'Weich fallen' }, { id: 'hard', name: 'Hart fallen' },
  { id: 'cw', name: 'Drehen rechts' }, { id: 'ccw', name: 'Drehen links' }, { id: 'r180', name: 'Drehen 180°' }, { id: 'hold', name: 'Halten' },
  { id: 'pause', name: 'Pause' }, { id: 'restart', name: 'Neustart' },
];
export const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'], hard: ['Space'], cw: ['ArrowUp', 'KeyX'], ccw: ['KeyZ'], r180: ['KeyA'], hold: ['KeyC', 'ShiftLeft'], pause: ['Escape', 'KeyP'], restart: ['KeyR'],
};

export interface BSettings {
  skin: BSkin;
  cfg: Cfg;
  keys: Record<Action, string[]>;
  ghost: boolean;
  grid: boolean;
  effects: boolean;
  shake: boolean;
  scale: number;
  touch: boolean;
  bot: number;
  botPps: number;
}

export interface Best { score: number; lines: number; time: number; pps: number }
export interface BStat { played: number; best: Best | null; times: number[] }
export interface Run { id: string; date: number; mode: Mode; seed: number; cfg: Cfg; rle: [number, number][]; score: number; lines: number; time: number }
export interface BData {
  settings: BSettings;
  stats: Record<string, BStat>;
  puzzles: Record<string, boolean>;
  finesse: { best: number; total: number; perfect: number };
  runs: Run[];
  totals: { pieces: number; lines: number; tspins: number; tetrises: number; games: number; wins: number };
}

export const BLOCK_INIT: BData = {
  settings: { skin: 'klar', cfg: DEFAULT_CFG, keys: DEFAULT_KEYS, ghost: true, grid: true, effects: true, shake: true, scale: 1, touch: false, bot: 1, botPps: 1.2 },
  stats: {}, puzzles: {}, finesse: { best: 0, total: 0, perfect: 0 }, runs: [],
  totals: { pieces: 0, lines: 0, tspins: 0, tetrises: 0, games: 0, wins: 0 },
};

export const MODES: { id: Mode; name: string; info: string }[] = [
  { id: 'marathon', name: 'Marathon', info: 'Steigende Geschwindigkeit, höchste Punktzahl. Ziel: 150 Zeilen (oder endlos).' },
  { id: 'sprint', name: 'Sprint', info: 'So schnell wie möglich 40 Zeilen räumen.' },
  { id: 'ultra', name: 'Ultra', info: 'Zwei Minuten – so viele Punkte wie möglich.' },
  { id: 'kaese', name: 'Käse-Rennen', info: 'Räume alle Müllzeilen so schnell wie möglich.' },
  { id: 'ueberleben', name: 'Überleben', info: 'Von unten steigen Müllzeilen. Wie lange hältst du durch?' },
  { id: 'duell', name: 'Duell', info: 'Gegen den Computer. Räume Zeilen, um ihm Müll zu schicken.' },
  { id: 'zen', name: 'Zen', info: 'Ohne Schwerkraft und ohne Druck – Steine in Ruhe setzen.' },
];

export const PRESETS: { id: string; name: string; w: number; h: number }[] = [
  { id: 'std', name: 'Standard 10×20', w: 10, h: 20 }, { id: 'schmal', name: 'Schmal 6×20', w: 6, h: 20 }, { id: 'breit', name: 'Breit 14×24', w: 14, h: 24 }, { id: 'klein', name: 'Klein 8×16', w: 8, h: 16 },
];

addAchievements([
  { game: 'block', key: 'first', name: 'Erste Zeile', desc: 'Eine Zeile geräumt.' },
  { game: 'block', key: 'tetris', name: 'Vierer', desc: 'Vier Zeilen auf einmal.' },
  { game: 'block', key: 'tspin', name: 'T-Spin', desc: 'Einen T-Spin mit Zeilen geräumt.' },
  { game: 'block', key: 'tsd', name: 'T-Spin Double', desc: 'Einen T-Spin Double geschafft.' },
  { game: 'block', key: 'b2b', name: 'Back-to-Back', desc: 'Zwei schwere Räumungen hintereinander.' },
  { game: 'block', key: 'combo5', name: 'Kettenreaktion', desc: 'Fünf Zeilen-Räumungen in Folge (Combo 5).' },
  { game: 'block', key: 'pc', name: 'Perfect Clear', desc: 'Das ganze Feld leer geräumt.' },
  { game: 'block', key: 'sprint60', name: 'Sprinter', desc: 'Sprint unter 60 Sekunden.' },
  { game: 'block', key: 'sprint40', name: 'Blitz', desc: 'Sprint unter 40 Sekunden.' },
  { game: 'block', key: 'marathon', name: 'Marathonläufer', desc: 'Marathon mit 150 Zeilen beendet.' },
  { game: 'block', key: 'duell', name: 'Duellsieger', desc: 'Den Computer im Duell besiegt.' },
  { game: 'block', key: 'pento', name: 'Fünferpack', desc: 'Zehn Zeilen mit Pentomino-Steinen geräumt.' },
  { game: 'block', key: 'puzzle', name: 'Rätselmeister', desc: 'Alle T-Spin-Rätsel gelöst.' },
  { game: 'block', key: 'finesse', name: 'Sauberes Handwerk', desc: '20 Steine in Folge mit minimalen Tastendrücken.' },
  { game: 'block', key: 'level10', name: 'Hochgeschwindigkeit', desc: 'Level 10 im Marathon erreicht.' },
]);
addSecrets([
  { id: 'block-konami', game: 'block', code: 'chaos', title: 'Chaos-Beutel', riddle: 'Wenn die Ordnung langweilt, ruf das Gegenteil an.', effect: 'Schaltet für die nächste Partie den Zufalls-Generator ein (kein Beutel).' },
  { id: 'block-mond', game: 'block', code: 'zeitlupe', title: 'Zeitlupe', riddle: 'Wer die Zeit anhalten will, tippt ein Wort mit Z.', effect: 'Halbiert die Fallgeschwindigkeit der laufenden Partie (zählt nicht für Bestenlisten).' },
  { id: 'block-pento', game: 'block', code: 'fuenfer', title: 'Fünfer-Stapler', riddle: 'Vier ist gut, aber was ist mit einem mehr?', effect: 'Wechselt auf Pentomino-Steine für die nächste Partie.' },
]);
