// Blockfall: Drehung, Wandtritte, T-Spins, Zeilen, Eingabe (DAS/ARR), Verriegelung, Müll, KI.
import { describe, expect, it } from 'vitest';
import { BUFFER, DEFAULT_CFG, GARBAGE, K_CW, K_DOWN, K_HARD, K_LEFT, K_RIGHT, PIECES, ROT, T_ID, cellsOf, doHold, fits, insertGarbage, lock, minimalInputs, newGame, step, tryRotate, type Cfg, type Game } from '../src/games/block/engine';
import { executePlan, planMove } from '../src/games/block/bot';
import { mulberry32 } from '../src/games/shared/rng';

const cfg = (o: Partial<Cfg> = {}): Cfg => ({ ...DEFAULT_CFG, ...o });
const frames = (g: Game, n: number, mask = 0) => { for (let i = 0; i < n; i++) step(g, mask); };
const set = (g: Game, x: number, y: number, v = 1) => { g.board[y * g.W + x] = v; };
const bottom = (g: Game, rowFromBottom: number) => g.R - 1 - rowFromBottom;

describe('Blockfall: Steine', () => {
  it('alle Steine haben 4 Drehzustände mit 4 bzw. 5 Zellen', () => {
    for (const p of PIECES) {
      expect(ROT[p.id].length).toBe(4);
      for (const r of ROT[p.id]) { expect(r.length).toBe(p.cells.length); expect(new Set(r.map((c) => c.join())).size).toBe(p.cells.length); }
    }
  });
  it('T-Stein: Drehzustände wie in SRS', () => {
    const norm = (c: [number, number][]) => c.map((x) => x.join()).sort().join('|');
    expect(norm(ROT[T_ID][1])).toBe(norm([[1, 0], [1, 1], [2, 1], [1, 2]]));
    expect(norm(ROT[T_ID][2])).toBe(norm([[0, 1], [1, 1], [2, 1], [1, 2]]));
  });
  it('I-Stein: Drehzustand 1 ist senkrecht in Spalte 2', () => {
    expect(ROT[1][1].every(([x]) => x === 2)).toBe(true);
  });
  it('O-Stein dreht sich nicht', () => {
    expect(new Set(ROT[2].map((r) => r.map((c) => c.join()).sort().join('|'))).size).toBe(1);
  });
});

describe('Blockfall: Ablauf', () => {
  it('7er-Beutel: die ersten sieben Steine sind alle verschieden', () => {
    const g = newGame(cfg(), 42);
    const first = [g.cur!.type, ...g.queue.slice(0, 6)];
    expect(new Set(first).size).toBe(7);
  });
  it('gleicher Startwert und gleiche Eingaben ergeben denselben Zustand', () => {
    const run = () => { const g = newGame(cfg(), 7); for (let i = 0; i < 600; i++) step(g, i % 40 === 0 ? K_HARD : i % 13 === 0 ? K_LEFT : i % 17 === 0 ? K_CW : 0); return g; };
    const a = run(), b = run();
    expect(Array.from(a.board)).toEqual(Array.from(b.board));
    expect(a.score).toBe(b.score);
  });
  it('Hard Drop setzt den Stein unten ab und bringt den nächsten', () => {
    const g = newGame(cfg(), 3);
    const t = g.cur!.type;
    step(g, K_HARD);
    expect(g.pieces).toBe(1);
    expect(g.cur).not.toBeNull();
    expect(g.board.some((v) => v === t)).toBe(true);
  });
  it('Halten tauscht einmal pro Stein', () => {
    const g = newGame(cfg(), 5);
    const first = g.cur!.type;
    expect(doHold(g)).toBe(true);
    expect(g.hold).toBe(first);
    expect(doHold(g)).toBe(false);
  });
  it('DAS/ARR: erst ein Schritt, nach Verzögerung schnelle Wiederholung', () => {
    const g = newGame(cfg({ handling: { das: 100, arr: 20, sdf: 12, lock: 500, areMs: 0 } }), 9);
    const x0 = g.cur!.x;
    step(g, K_LEFT);
    expect(g.cur!.x).toBe(x0 - 1);
    frames(g, 4, K_LEFT);
    expect(g.cur!.x).toBe(x0 - 1);
    frames(g, 30, K_LEFT);
    expect(g.cur!.x).toBeLessThan(x0 - 2);
    frames(g, 120, K_LEFT);
    expect(fits(g, g.cur!.type, g.cur!.rot, g.cur!.x - 1, g.cur!.y)).toBe(false);
  });
  it('ARR 0 springt sofort an die Wand', () => {
    const g = newGame(cfg({ handling: { das: 50, arr: 0, sdf: 12, lock: 500, areMs: 0 } }), 9);
    frames(g, 6, K_RIGHT);
    expect(fits(g, g.cur!.type, g.cur!.rot, g.cur!.x + 1, g.cur!.y)).toBe(false);
  });
  it('Verriegelungsverzögerung: am Boden wird nach Ablauf verriegelt', () => {
    const g = newGame(cfg(), 11);
    for (let i = 0; i < 400 && g.pieces === 0; i++) step(g, K_DOWN);
    expect(g.pieces).toBe(1);
  });
  it('Zeilen räumen und Tetris-Wertung (800 × Level) mit Perfect Clear', () => {
    const g = newGame(cfg({ random: 'zufall' }), 2);
    for (let r = 0; r < 4; r++) for (let x = 1; x < g.W; x++) set(g, x, bottom(g, r));
    g.cur = { type: 1, x: -2, y: g.R - 4, rot: 1 };
    expect(fits(g, 1, 1, -2, g.R - 4)).toBe(true);
    const before = g.score;
    lock(g);
    expect(g.lines).toBe(4);
    expect(g.score - before).toBeGreaterThanOrEqual(800);
    expect(g.board.every((v) => v === 0)).toBe(true);
    expect(g.pcs).toBe(1);
  });
});

describe('Blockfall: T-Spin', () => {
  it('T-Spin Double mit der klassischen Vorlage', () => {
    const g = newGame(cfg({ random: 'zufall' }), 4);
    const b = (r: number) => bottom(g, r);
    for (let x = 0; x < g.W; x++) { if (x !== 4) set(g, x, b(0)); }
    for (let x = 0; x < g.W; x++) { if (x < 3 || x > 5) set(g, x, b(1)); }
    set(g, 3, b(2));
    g.cur = { type: T_ID, x: 3, y: b(1) - 1, rot: 2 };
    expect(fits(g, T_ID, 2, 3, b(1) - 1)).toBe(true);
    g.lastRot = true; g.lastKick = 0;
    lock(g);
    expect(g.lastClear?.label).toContain('T-Spin');
    expect(g.lines).toBeGreaterThanOrEqual(1);
  });
  it('Ohne Drehung kein T-Spin', () => {
    const g = newGame(cfg({ random: 'zufall' }), 4);
    for (let x = 0; x < g.W; x++) { if (x !== 4) set(g, x, bottom(g, 0)); }
    set(g, 3, bottom(g, 1)); set(g, 5, bottom(g, 1));
    g.cur = { type: T_ID, x: 3, y: bottom(g, 1) - 1, rot: 2 };
    g.lastRot = false;
    lock(g);
    expect(g.lastClear?.label ?? '').not.toContain('T-Spin');
  });
  it('Wandtritt: I-Stein an der Wand lässt sich drehen', () => {
    const g = newGame(cfg({ random: 'zufall' }), 6);
    g.cur = { type: 1, x: -1, y: BUFFER + 5, rot: 0 };
    expect(tryRotate(g, 1)).toBe(true);
    g.cur = { type: 1, x: g.W - 4, y: BUFFER + 5, rot: 1 };
    expect(tryRotate(g, 1)).toBe(true);
  });
});

describe('Blockfall: Müll, Ziele, KI', () => {
  it('Müllzeilen schieben das Feld hoch und lassen ein Loch', () => {
    const g = newGame(cfg(), 8);
    set(g, 0, g.R - 1, 2);
    insertGarbage(g, 2);
    expect(g.board[(g.R - 3) * g.W]).toBe(2);
    const row = Array.from(g.board.slice((g.R - 1) * g.W, g.R * g.W));
    expect(row.filter((v) => v === GARBAGE).length).toBe(g.W - 1);
  });
  it('Käse-Rennen: Start mit Müllzeilen', () => {
    const g = newGame(cfg({ mode: 'kaese', cheese: 3 }), 1);
    expect(g.cheeseLeft).toBe(3);
  });
  it('Sprint endet beim Ziel', () => {
    const g = newGame(cfg({ mode: 'sprint', goal: 4 }), 2);
    for (let r = 0; r < 4; r++) for (let x = 1; x < g.W; x++) set(g, x, bottom(g, r));
    g.cur = { type: 1, x: -2, y: g.R - 4, rot: 1 };
    lock(g);
    expect(g.status).toBe('win');
  });
  it('Spielende bei Block-out', () => {
    const g = newGame(cfg(), 12);
    for (let y = BUFFER - 4; y < g.R; y++) for (let x = 0; x < g.W - 1; x++) set(g, x, y);
    step(g, K_HARD);
    expect(g.status).toBe('over');
  });
  it('KI spielt 60 Steine ohne zu verlieren', () => {
    const g = newGame(cfg({ random: '7bag' }), 21);
    const rng = mulberry32(5);
    for (let i = 0; i < 60 && g.status === 'play'; i++) { const p = planMove(g, 1, rng); if (!p) break; executePlan(g, p); }
    expect(g.status).toBe('play');
    expect(g.lines).toBeGreaterThan(10);
  });
  it('Tastendruck-Minimum', () => {
    const g = newGame(cfg(), 1);
    expect(minimalInputs(g, 2, Math.floor((g.W - 2) / 2), 0)).toBe(1);
    expect(minimalInputs(g, 2, 0, 0)).toBe(2);
  });
  it('Pentomino-Satz funktioniert', () => {
    const g = newGame(cfg({ pieces: 'pento' }), 3);
    expect(g.cur!.type).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < 40 && g.status === 'play'; i++) step(g, i % 2 ? K_HARD : K_CW);
    expect(['play', 'over']).toContain(g.status);
  });
  it('Zellen eines Steins', () => {
    expect(cellsOf(2, 0, 4, 10).length).toBe(4);
  });
});
