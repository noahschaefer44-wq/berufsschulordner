// Zeichnet die Ebene auf eine Leinwand: Wände als Steinblöcke, Böden, Gegenstände, Monster, Spieler.
import { MON } from './content';
import { H, T, W, idx, type Level, type State } from './types';
import type { Theme } from './data';

export const VW = 41, VH = 21, CW = 24, CH = 28;

const ITEM_GLYPH: Record<string, [string, string]> = {
  weapon: [')', '#d5dbe8'], armor: ['[', '#9bb4e0'], potion: ['!', '#d27cf0'], scroll: ['?', '#f2e6b0'], wand: ['/', '#7cf0c8'], food: [':', '#d7a86e'], amulet: ['"', '#fff176'],
};

interface Pal { wallV: string; wallM: string; mortar: string; floorV: string; floorM: string; dotV: string; dotM: string; door: string; stair: string; chest: string; trap: string; player: string; text: string }
const COLOR: Pal = { wallV: '#2c3855', wallM: '#161d2d', mortar: 'rgba(0,0,0,.35)', floorV: '#18202d', floorM: '#0e141d', dotV: '#44526d', dotM: '#232d3f', door: '#c98c3c', stair: '#7fe0ff', chest: '#e6b450', trap: '#ff5c5c', player: '#fff6d6', text: '#e5ebf7' };
const AMBER: Pal = { wallV: '#4a3314', wallM: '#251a0a', mortar: 'rgba(0,0,0,.4)', floorV: '#1a1307', floorM: '#0f0b04', dotV: '#7a5818', dotM: '#3a2a0c', door: '#ffc15a', stair: '#ffe08a', chest: '#ffd27a', trap: '#ff8a4a', player: '#ffefc2', text: '#ffcf86' };

export interface DrawOpts {
  theme: Theme;
  vis: Set<number>;
  cam: [number, number];
  flash: number;
  cursor?: [number, number] | null;
  path?: [number, number][];
  telepathy: boolean;
}

export function camera(s: State): [number, number] {
  const cx = Math.max(0, Math.min(W - VW, s.p.x - (VW >> 1)));
  const cy = Math.max(0, Math.min(H - VH, s.p.y - (VH >> 1)));
  return [cx, cy];
}

export function draw(ctx: CanvasRenderingContext2D, s: State, o: DrawOpts) {
  const lv: Level = s.levels[s.depth - 1];
  const pal = o.theme === 'farbe' ? COLOR : AMBER;
  const mono = o.theme === 'bernstein';
  ctx.fillStyle = mono ? '#080602' : '#07090d';
  ctx.fillRect(0, 0, VW * CW, VH * CH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const [ox, oy] = o.cam;
  const px = s.p.x, py = s.p.y;
  const dim = (d2: number) => Math.max(0.55, 1 - d2 / 150);
  for (let vy = 0; vy < VH; vy++) {
    for (let vx = 0; vx < VW; vx++) {
      const x = ox + vx, y = oy + vy;
      const i = idx(x, y);
      if (!lv.seen[i]) continue;
      const vis = o.vis.has(i);
      const t = lv.tiles[i];
      const X = vx * CW, Y = vy * CH;
      const light = vis ? dim((x - px) ** 2 + (y - py) ** 2) : 1;
      if (t === T.WALL) {
        // nur Wände neben begehbaren Feldern zeichnen
        let edge = false;
        for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && lv.tiles[idx(nx, ny)] !== T.WALL) { edge = true; break; } }
        if (!edge) continue;
        ctx.globalAlpha = vis ? light : 1;
        ctx.fillStyle = vis ? pal.wallV : pal.wallM;
        ctx.fillRect(X, Y, CW, CH);
        ctx.fillStyle = pal.mortar;
        ctx.fillRect(X, Y + CH / 2 - 1, CW, 2);
        ctx.fillRect(X + ((y & 1) ? CW / 3 : (2 * CW) / 3), Y, 2, CH / 2);
        ctx.fillRect(X + ((y & 1) ? (2 * CW) / 3 : CW / 3), Y + CH / 2, 2, CH / 2);
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.globalAlpha = vis ? light : 1;
      ctx.fillStyle = vis ? pal.floorV : pal.floorM;
      ctx.fillRect(X, Y, CW, CH);
      ctx.globalAlpha = 1;
      ctx.font = `${Math.round(CH * 0.8)}px 'Fira Code', monospace`;
      let ch = '·', col = vis ? pal.dotV : pal.dotM;
      if (t === T.DOOR) { ch = '+'; col = pal.door; }
      else if (t === T.DOOROPEN) { ch = "'"; col = pal.door; }
      else if (t === T.DOWN) { ch = '>'; col = pal.stair; }
      else if (t === T.UP) { ch = '<'; col = pal.stair; }
      else if (t === T.CHEST) { ch = '■'; col = pal.chest; }
      if (!vis && ch !== '·') col = mono ? '#5a4010' : '#4c566e';
      ctx.fillStyle = col;
      ctx.fillText(ch, X + CW / 2, Y + CH / 2 + 1);
    }
  }
  ctx.font = `bold ${Math.round(CH * 0.82)}px 'Fira Code', monospace`;
  // Fallen
  for (const tr of lv.traps) {
    if (!tr.seen) continue;
    const x = tr.idx % W, y = (tr.idx / W) | 0;
    if (x < ox || y < oy || x >= ox + VW || y >= oy + VH) continue;
    ctx.fillStyle = pal.trap;
    ctx.fillText('^', (x - ox) * CW + CW / 2, (y - oy) * CH + CH / 2 + 1);
  }
  // Gegenstände
  for (const f of lv.items) {
    const i = idx(f.x, f.y);
    if (!lv.seen[i] || f.x < ox || f.y < oy || f.x >= ox + VW || f.y >= oy + VH) continue;
    const [g, c] = f.item.kind === 'food' && f.item.type === 'gold' ? ['$', '#ffd24a'] : ITEM_GLYPH[f.item.kind];
    ctx.globalAlpha = o.vis.has(i) ? 1 : 0.55;
    ctx.fillStyle = mono ? '#ffd27a' : c;
    ctx.fillText(g, (f.x - ox) * CW + CW / 2, (f.y - oy) * CH + CH / 2 + 1);
    ctx.globalAlpha = 1;
  }
  // Monster
  for (const m of lv.mons) {
    const i = idx(m.x, m.y);
    if (!(o.vis.has(i) || o.telepathy)) continue;
    if (m.x < ox || m.y < oy || m.x >= ox + VW || m.y >= oy + VH) continue;
    const def = MON[m.kind];
    const X = (m.x - ox) * CW + CW / 2, Y = (m.y - oy) * CH + CH / 2 + 1;
    ctx.fillStyle = mono ? '#ffe3b0' : def.color;
    if (!m.awake) ctx.globalAlpha = 0.72;
    ctx.fillText(def.glyph, X, Y);
    ctx.globalAlpha = 1;
    if (m.hp < m.maxHp) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(X - 9, Y + CH / 2 - 6, 18, 3); ctx.fillStyle = m.hp < m.maxHp * 0.35 ? '#ff5c5c' : '#7cf09a'; ctx.fillRect(X - 9, Y + CH / 2 - 6, 18 * (m.hp / m.maxHp), 3); }
  }
  // Pfad und Cursor
  if (o.path) for (const [x, y] of o.path) { if (x < ox || y < oy || x >= ox + VW || y >= oy + VH) continue; ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect((x - ox) * CW + 7, (y - oy) * CH + 9, CW - 14, CH - 18); }
  if (o.cursor) { const [x, y] = o.cursor; ctx.strokeStyle = '#ff6a4a'; ctx.lineWidth = 2; ctx.strokeRect((x - ox) * CW + 1, (y - oy) * CH + 1, CW - 2, CH - 2); }
  // Spieler
  const X = (px - ox) * CW + CW / 2, Y = (py - oy) * CH + CH / 2 + 1;
  ctx.shadowColor = mono ? '#ffb347' : '#ffffff';
  ctx.shadowBlur = 10;
  ctx.fillStyle = pal.player;
  ctx.font = `bold ${Math.round(CH * 0.9)}px 'Fira Code', monospace`;
  ctx.fillText('@', X, Y);
  ctx.shadowBlur = 0;
  if (o.flash > 0) { ctx.fillStyle = `rgba(255,40,40,${Math.min(0.35, o.flash * 0.12)})`; ctx.fillRect(0, 0, VW * CW, VH * CH); }
}
