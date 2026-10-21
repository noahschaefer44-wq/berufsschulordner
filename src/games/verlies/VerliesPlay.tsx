import { useEffect, useMemo, useRef, useState } from 'react';
import { ARMOR, CLASS, MAX_DEPTH, MON, POTION, SCROLL, SPELL, WAND, WEAPON, XP_TABLE } from './content';
import type { VSettings } from './data';
import {
  armorClass, ascend, castSpell, descend, drop, eat, equip, exploreStep, itemName, isKnown, level, monAt, move, pathTo, pickup, readScroll, score, usePotion, visibleMonsters, visibleSet, wait, zapWand,
  playerDamage, weaponOf, MAX_INV, type Item, type Mon, type State,
} from './engine';
import { camera, draw, CH, CW, VH, VW } from './render';
import { saveRun } from './save';
import { sfx } from '../shared/sfx';
import { T, idx } from './types';

export interface RunInfo { s: State; daily: boolean; label: string }
export interface EndInfo { s: State; daily: boolean; score: number }
export interface EventHooks { onEvent: (ev: string, s: State) => void }

type Modal = null | 'inv' | 'help' | 'log' | 'spells';
interface Target { kind: 'wand' | 'spell'; id: string | number; list: Mon[]; i: number }

const MSG_COLORS: Record<string, string> = { info: 'var(--t)', good: 'var(--ok)', bad: 'var(--bad)', hit: 'var(--hit)', item: 'var(--item)', danger: 'var(--danger)' };
const LETTERS = 'abcdefghijklmnopqrstuv';

export default function VerliesPlay({ run, S, hooks, onEnd, onExit }: { run: RunInfo; S: VSettings; hooks: EventHooks; onEnd: (e: EndInfo) => void; onExit: () => void }) {
  const sRef = useRef<State>(run.s);
  const s = sRef.current;
  const [, setVer] = useState(0);
  const bump = () => setVer((v) => v + 1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selItem, setSelItem] = useState<number | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [flash, setFlash] = useState(0);
  const [ended, setEnded] = useState(false);
  const timers = useRef<number[]>([]);
  const lastSave = useRef(0);
  const evCount = useRef({ ident: 0, trap: 0 });

  const vis = useMemo(() => visibleSet(s), [s.turn, s.depth, s.p.x, s.p.y, s.p.blind, level(s).tiles[idx(s.p.x, s.p.y)]]); // eslint-disable-line react-hooks/exhaustive-deps
  const cam = camera(s);
  const lv = level(s);

  // Zeichnen
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = VW * CW * dpr; c.height = VH * CH * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cursor = target ? [target.list[target.i].x, target.list[target.i].y] as [number, number] : null;
    const path = !target && hover ? pathTo(s, hover[0], hover[1]) : undefined;
    draw(ctx, s, { theme: S.theme, vis, cam, flash, cursor, path, telepathy: s.p.telepathy > 0 });
  });
  useEffect(() => { void (document as Document & { fonts?: FontFaceSet }).fonts?.load("20px 'Fira Code'").then(bump); }, []);
  useEffect(() => { if (flash > 0) { const id = setTimeout(() => setFlash((f) => Math.max(0, f - 1)), 90); return () => clearTimeout(id); } }, [flash]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const stopRepeat = () => { timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers.current = []; };

  const handleEvents = () => {
    for (const ev of s.events.splice(0)) {
      if (ev === 'hit') sfx('place');
      else if (ev === 'hurt') { sfx('bad'); setFlash(3); }
      else if (ev.startsWith('kill:')) sfx('pop');
      else if (ev === 'pick') sfx('card');
      else if (ev === 'gold') sfx('tick');
      else if (ev === 'door') sfx('tick');
      else if (ev === 'trapfired') { sfx('boom'); setFlash(3); }
      else if (ev.startsWith('levelup')) sfx('level');
      else if (ev.startsWith('depth')) sfx('drop');
      else if (ev.startsWith('identify')) { sfx('good'); evCount.current.ident++; }
      else if (ev === 'trap') { sfx('flag'); evCount.current.trap++; }
      else if (ev === 'death') sfx('lose');
      else if (ev === 'win') sfx('win');
      hooks.onEvent(ev, s);
      if (ev === 'identify:potion' || ev === 'identify:scroll' || ev === 'identify:wand') hooks.onEvent(`idcount:${evCount.current.ident}`, s);
      if (ev === 'trap') hooks.onEvent(`trapcount:${evCount.current.trap}`, s);
    }
  };

  const after = () => {
    handleEvents();
    if (s.over) {
      if (!ended) { setEnded(true); stopRepeat(); onEnd({ s, daily: run.daily, score: score(s) }); }
    } else if (s.turn - lastSave.current >= 25 || s.events.length === 0 && s.turn === 0) { lastSave.current = s.turn; saveRun({ s, daily: run.daily, label: run.label, saved: Date.now() }); }
    bump();
  };

  const act = (fn: () => boolean) => { if (s.over) return false; stopRepeat(); const ok = fn(); after(); return ok; };

  const hostileInView = () => visibleMonsters(s).length;

  const step = (dx: number, dy: number, force = false) => act(() => {
    const ok = move(s, dx, dy, force);
    return ok;
  });

  const repeat = (stepFn: () => boolean, max = 300) => {
    stopRepeat();
    const startHp = s.p.hp;
    let n = 0;
    const startSeen = hostileInView();
    const id = window.setInterval(() => {
      if (s.over || n++ >= max) { stopRepeat(); return; }
      const keep = stepFn();
      handleEvents();
      if (s.over) { stopRepeat(); after(); return; }
      if (!keep || s.p.hp < startHp || hostileInView() > startSeen || s.p.poison > 0 && startHp === s.p.hp && false) { stopRepeat(); }
      bump();
      if (s.turn - lastSave.current >= 25) { lastSave.current = s.turn; saveRun({ s, daily: run.daily, label: run.label, saved: Date.now() }); }
    }, 45);
    timers.current.push(id);
  };

  const explore = () => {
    if (hostileInView()) { sRef.current.msgs.push({ t: s.turn, text: 'Erst die Monster in Sicht erledigen oder meiden.', kind: 'danger' }); bump(); return; }
    repeat(() => {
      const d = exploreStep(s);
      if (!d) { sRef.current.msgs.push({ t: s.turn, text: 'Hier gibt es nichts mehr zu entdecken – such die Treppe (>).', kind: 'info' }); return false; }
      return move(s, d[0], d[1]);
    }, 500);
  };

  const rest = () => {
    if (hostileInView()) { sRef.current.msgs.push({ t: s.turn, text: 'Mit Monstern in Sicht kannst du nicht rasten.', kind: 'danger' }); bump(); return; }
    repeat(() => { wait(s, true); return s.p.hp < s.p.maxHp || s.p.mp < s.p.maxMp; }, 150);
  };

  const travel = (tx: number, ty: number) => {
    const m = monAt(s, tx, ty);
    if (m && Math.abs(tx - s.p.x) <= 1 && Math.abs(ty - s.p.y) <= 1) { step(tx - s.p.x, ty - s.p.y); return; }
    if (tx === s.p.x && ty === s.p.y) { act(() => pickup(s)); return; }
    const path = pathTo(s, tx, ty);
    if (!path.length) { s.msgs.push({ t: s.turn, text: 'Dorthin führt kein bekannter Weg.', kind: 'info' }); bump(); return; }
    let i = 0;
    repeat(() => { if (i >= path.length) return false; const [x, y] = path[i++]; return move(s, x - s.p.x, y - s.p.y); }, path.length + 2);
  };

  const stairs = (down: boolean) => {
    if (S.confirmStairs && !down && s.depth === 1 && !confirm('Das Verlies verlassen? Der Lauf endet ohne Amulett.')) return;
    act(() => (down ? descend(s) : ascend(s)));
  };

  const useItem = (it: Item) => {
    setModal(null); setSelItem(null);
    if (it.kind === 'potion') act(() => usePotion(s, it));
    else if (it.kind === 'scroll') act(() => readScroll(s, it));
    else if (it.kind === 'food') act(() => eat(s, it));
    else if (it.kind === 'weapon' || it.kind === 'armor') act(() => equip(s, it));
    else if (it.kind === 'wand') beginTarget({ kind: 'wand', id: it.id });
  };

  const beginTarget = (t: { kind: 'wand' | 'spell'; id: string | number }) => {
    const list = visibleMonsters(s);
    if (!list.length) { s.msgs.push({ t: s.turn, text: 'Kein Ziel in Sicht.', kind: 'info' }); bump(); return; }
    setModal(null);
    setTarget({ ...t, list, i: 0 });
  };

  const fire = (m: Mon) => {
    if (!target) return;
    const t = target;
    setTarget(null);
    if (t.kind === 'wand') { const it = s.p.inv.find((x) => x.id === t.id); if (it) act(() => zapWand(s, it, m.x, m.y)); }
    else act(() => castSpell(s, String(t.id), m.x, m.y));
  };

  const castMenu = (id: string) => {
    setModal(null);
    const sp = SPELL[id];
    if (sp.ranged) beginTarget({ kind: 'spell', id });
    else act(() => castSpell(s, id, s.p.x, s.p.y));
  };

  // Tastatur
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (s.over) return;
      if (target) {
        if (k === 'Escape') { setTarget(null); e.preventDefault(); }
        else if (k === 'Tab' || k === 'ArrowRight' || k === 'ArrowDown') { setTarget({ ...target, i: (target.i + 1) % target.list.length }); e.preventDefault(); }
        else if (k === 'ArrowLeft' || k === 'ArrowUp') { setTarget({ ...target, i: (target.i + target.list.length - 1) % target.list.length }); e.preventDefault(); }
        else if (k === 'Enter' || k === ' ' || k === 'f') { fire(target.list[target.i]); e.preventDefault(); }
        return;
      }
      if (modal) {
        if (k === 'Escape' || k === 'i' && modal === 'inv') { setModal(null); setSelItem(null); e.preventDefault(); }
        else if (modal === 'inv') {
          const li = LETTERS.indexOf(k);
          if (li >= 0 && s.p.inv[li]) { setSelItem(s.p.inv[li].id); e.preventDefault(); }
        } else if (modal === 'spells') {
          const cls = CLASS[s.p.cls];
          const n = +k;
          if (n >= 1 && n <= cls.spells.length) { castMenu(cls.spells[n - 1]); e.preventDefault(); }
        }
        return;
      }
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
        k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1], '8': [0, -1], '2': [0, 1], '4': [-1, 0], '6': [1, 0], '7': [-1, -1], '9': [1, -1], '1': [-1, 1], '3': [1, 1],
      };
      const d = dirs[k];
      if (d && !(k === 's' && false)) { e.preventDefault(); step(d[0], d[1], e.shiftKey && /Arrow/.test(k)); return; }
      if (k === '.' || k === ' ' || k === '5') { e.preventDefault(); act(() => wait(s)); }
      else if (k === 'z' || k === 'Z') { e.preventDefault(); act(() => wait(s, true)); }
      else if (k === 'g' || k === ',') act(() => pickup(s));
      else if (k === 'i') setModal('inv');
      else if (k === '>') stairs(true);
      else if (k === '<') stairs(false);
      else if (k === 'x') explore();
      else if (k === 'R') rest();
      else if (k === '?' || k === 'F1') setModal('help');
      else if (k === 'm') setModal('log');
      else if (k === 'c' && CLASS[s.p.cls].spells.length) setModal('spells');
      else if (k === 'f') { const w = s.p.inv.find((x) => x.kind === 'wand'); if (w) beginTarget({ kind: 'wand', id: w.id }); else if (CLASS[s.p.cls].spells.includes('funke')) castMenu('funke'); }
      else if (k === 'e') { const f = s.p.inv.find((x) => x.kind === 'food' && x.type !== 'gold'); if (f) useItem(f); }
      else if (k === 'q') { const p = s.p.inv.find((x) => x.kind === 'potion' && x.type === 'heilung' && isKnown(s, 'potion:heilung')); if (p) useItem(p); }
      else if (k === 'Escape') stopRepeat();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // Maus
  const cellAt = (e: React.MouseEvent): [number, number] | null => {
    const c = canvas.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * VW) + cam[0], y = Math.floor(((e.clientY - r.top) / r.height) * VH) + cam[1];
    return [x, y];
  };
  const onClick = (e: React.MouseEvent) => {
    const c = cellAt(e);
    if (!c || s.over) return;
    if (target) { const m = target.list.find((q) => q.x === c[0] && q.y === c[1]); if (m) fire(m); return; }
    if (modal) return;
    travel(c[0], c[1]);
  };
  const tip = hover ? (() => {
    const [x, y] = hover;
    const m = lv.mons.find((q) => q.x === x && q.y === y && (vis.has(idx(x, y)) || s.p.telepathy > 0));
    if (m) { const d = MON[m.kind]; return `${d.name} · ${m.hp}/${m.maxHp} LP${m.awake ? '' : ' · schläft'}`; }
    const f = lv.items.find((q) => q.x === x && q.y === y && lv.seen[idx(x, y)]);
    if (f) return itemName(s, f.item);
    if (lv.seen[idx(x, y)]) { const t = lv.tiles[idx(x, y)]; return ({ [T.DOOR]: 'Tür', [T.DOOROPEN]: 'Offene Tür', [T.DOWN]: 'Treppe hinab', [T.UP]: 'Treppe hinauf', [T.CHEST]: 'Truhe' } as Record<number, string>)[t] ?? ''; }
    return '';
  })() : '';

  const p = s.p;
  const cls = CLASS[p.cls];
  const nextXp = XP_TABLE[p.lvl] ?? p.xp;
  const prevXp = XP_TABLE[p.lvl - 1] ?? 0;
  const w = weaponOf(s);
  const [dlo, dhi] = playerDamage(s);
  const inv = p.inv;
  const sel = inv.find((i) => i.id === selItem) ?? null;
  const status = [p.poison > 0 && `Gift ${p.poison}`, p.haste > 0 && `Eile ${p.haste}`, p.slow > 0 && `Langsam ${p.slow}`, p.blind > 0 && `Blind ${p.blind}`, p.confused > 0 && `Verwirrt ${p.confused}`, p.telepathy > 0 && `Gedanken ${p.telepathy}`, p.fear > 0 && `Furcht ${p.fear}`].filter(Boolean) as string[];
  const hunger = p.food > 300 ? '' : p.food > 100 ? 'Hungrig' : 'Schwach vor Hunger';
  const log = s.msgs.slice(-7);

  const itemDesc = (it: Item) => {
    switch (it.kind) {
      case 'weapon': { const d = WEAPON[it.type]; return `Waffe: Schaden ${d.dmg[0]}–${d.dmg[1]}, Treffer ${d.acc >= 0 ? '+' : ''}${d.acc}, kritisch ${Math.round(d.crit * 100)} %.`; }
      case 'armor': return `Rüstung: Schutz ${ARMOR[it.type].ac}${isKnown(s, `plus:${it.id}`) ? ` ${it.plus >= 0 ? '+' : ''}${it.plus}` : ''}.`;
      case 'potion': return isKnown(s, `potion:${it.type}`) ? POTION[it.type].info : 'Unbekannter Trank – ausprobieren ist riskant.';
      case 'scroll': return isKnown(s, `scroll:${it.type}`) ? SCROLL[it.type].info : 'Unbekannte Schriftrolle.';
      case 'wand': return isKnown(s, `wand:${it.type}`) ? WAND[it.type].info : 'Ein unbekannter Stab – probiere ihn an einem Monster.';
      case 'food': return it.type === 'brot' ? 'Sättigt stark.' : 'Sättigt ein wenig.';
      case 'amulet': return 'Das Ziel deiner Reise.';
    }
  };

  return (
    <div className={`vl-play vl-th-${S.theme}${flash > 0 ? ' hurt' : ''}`}>
      <section className="vl-main">
        <div className="vl-top">
          <b>{cls.name} · Ebene {s.depth}/{MAX_DEPTH}</b>
          <span>{run.daily ? 'Tageslauf · ' : ''}{run.label}</span>
          <span className="vl-score">Punkte {score(s)}</span>
        </div>
        <div className="vl-view">
          <canvas ref={canvas} className="vl-canvas" onClick={onClick} onMouseMove={(e) => setHover(cellAt(e))} onMouseLeave={() => setHover(null)} aria-label="Verlies-Karte" role="img" />
          {tip && <div className="vl-tip">{tip}</div>}
          {target && <div className="vl-target">Ziel: <b>{MON[target.list[target.i].kind].name}</b> – Tab wechselt, Eingabe feuert, Esc bricht ab.</div>}
        </div>
        <ol className="vl-log" aria-live="polite">{log.map((m, i) => <li key={s.msgs.length - log.length + i} style={{ color: MSG_COLORS[m.kind], opacity: 0.45 + (i + 1) / log.length * 0.55 }}>{m.text}</li>)}</ol>
        <div className="vl-keys">
          <button onClick={() => act(() => wait(s))} title="Warten (.)">Warten</button>
          <button onClick={() => act(() => wait(s, true))} title="Suchen (Z)">Suchen</button>
          <button onClick={() => act(() => pickup(s))} title="Aufheben (G)">Aufheben</button>
          <button onClick={explore} title="Erkunden (X)">Erkunden</button>
          <button onClick={rest} title="Rasten (Umschalt+R)">Rasten</button>
          <button onClick={() => stairs(true)} title="Treppe hinab (>)">Hinab ▾</button>
          <button onClick={() => stairs(false)} title="Treppe hinauf (<)">Hinauf ▴</button>
          <button onClick={() => setModal('inv')} title="Rucksack (I)">Rucksack</button>
          {cls.spells.length > 0 && <button onClick={() => setModal('spells')} title="Zauber (C)">Zauber</button>}
          <button onClick={() => setModal('log')} title="Alle Meldungen (M)">Meldungen</button>
          <button onClick={() => setModal('help')} title="Hilfe (?)">Hilfe</button>
          <button className="danger" onClick={() => { saveRun({ s, daily: run.daily, label: run.label, saved: Date.now() }); onExit(); }}>Speichern &amp; Menü</button>
        </div>
        <div className="vl-pad" aria-label="Steuerkreuz">
          {[[-1, -1, '↖'], [0, -1, '↑'], [1, -1, '↗'], [-1, 0, '←'], [0, 0, '·'], [1, 0, '→'], [-1, 1, '↙'], [0, 1, '↓'], [1, 1, '↘']].map(([dx, dy, g]) => <button key={`${dx}${dy}`} onClick={() => (dx === 0 && dy === 0 ? act(() => wait(s)) : step(dx as number, dy as number))}>{g}</button>)}
        </div>
      </section>
      <aside className="vl-side">
        <div className="vl-hud">
          <div className="vl-bar hp"><i style={{ width: `${Math.max(0, p.hp / p.maxHp) * 100}%` }} /><span>Leben {p.hp}/{p.maxHp}</span></div>
          {p.maxMp > 0 && <div className="vl-bar mp"><i style={{ width: `${(p.mp / p.maxMp) * 100}%` }} /><span>Mana {p.mp}/{p.maxMp}</span></div>}
          <div className="vl-bar xp"><i style={{ width: `${((p.xp - prevXp) / Math.max(1, nextXp - prevXp)) * 100}%` }} /><span>Stufe {p.lvl} · {p.xp} EP</span></div>
          <dl>
            <dt>Waffe</dt><dd>{w ? itemName(s, w) : 'Fäuste'} ({dlo}–{dhi})</dd>
            <dt>Schutz</dt><dd>{armorClass(s)}</dd>
            <dt>Gold</dt><dd>{p.gold}</dd>
            <dt>Zug</dt><dd>{s.turn}</dd>
            <dt>Hunger</dt><dd>{hunger || 'satt'}</dd>
          </dl>
          {status.length > 0 && <p className="vl-status">{status.join(' · ')}</p>}
        </div>
        <div className="vl-near">
          <h4>In Sicht</h4>
          {visibleMonsters(s).slice(0, 6).map((m) => <div key={m.id} className="vl-mon"><b style={{ color: S.theme === 'farbe' ? MON[m.kind].color : undefined }}>{MON[m.kind].glyph}</b><span>{MON[m.kind].name}</span><i><u style={{ width: `${(m.hp / m.maxHp) * 100}%` }} /></i></div>)}
          {visibleMonsters(s).length === 0 && <p className="vl-none">Niemand in Sicht.</p>}
        </div>
        <div className="vl-quick">
          <h4>Rucksack ({inv.length}/{MAX_INV})</h4>
          <ul>{inv.slice(0, 8).map((it, i) => <li key={it.id}><kbd>{LETTERS[i]}</kbd>{itemName(s, it)}{(it.id === p.weapon || it.id === p.armor) ? ' *' : ''}</li>)}{inv.length > 8 && <li className="more">… {inv.length - 8} weitere (I)</li>}</ul>
        </div>
      </aside>

      {modal === 'inv' && (
        <div className="vl-modal" onClick={() => { setModal(null); setSelItem(null); }}>
          <div className="vl-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Rucksack <small>{inv.length}/{MAX_INV}</small></h3>
            <ul className="vl-inv">{inv.map((it, i) => (
              <li key={it.id} className={selItem === it.id ? 'on' : ''}><button onClick={() => setSelItem(it.id)}><kbd>{LETTERS[i]}</kbd><span>{itemName(s, it)}{(it.id === p.weapon || it.id === p.armor) ? <em> (angelegt)</em> : null}</span></button></li>
            ))}</ul>
            {sel && (
              <div className="vl-act">
                <p>{itemDesc(sel)}</p>
                <div>
                  {sel.kind === 'potion' && <button onClick={() => useItem(sel)}>Trinken</button>}
                  {sel.kind === 'scroll' && <button onClick={() => useItem(sel)}>Lesen</button>}
                  {sel.kind === 'food' && sel.type !== 'gold' && <button onClick={() => useItem(sel)}>Essen</button>}
                  {(sel.kind === 'weapon' || sel.kind === 'armor') && <button onClick={() => useItem(sel)}>Anlegen</button>}
                  {sel.kind === 'wand' && <button onClick={() => useItem(sel)}>Zielen</button>}
                  <button onClick={() => { setModal(null); setSelItem(null); act(() => drop(s, sel)); }}>Ablegen</button>
                </div>
              </div>
            )}
            <button className="vl-close" onClick={() => { setModal(null); setSelItem(null); }}>Schließen (Esc)</button>
          </div>
        </div>
      )}
      {modal === 'spells' && (
        <div className="vl-modal" onClick={() => setModal(null)}>
          <div className="vl-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Zauber <small>Mana {p.mp}/{p.maxMp}</small></h3>
            <ul className="vl-inv">{cls.spells.map((id, i) => <li key={id}><button disabled={p.mp < SPELL[id].cost} onClick={() => castMenu(id)}><kbd>{i + 1}</kbd><span>{SPELL[id].name} <em>({SPELL[id].cost} Mana)</em><br /><small>{SPELL[id].info}</small></span></button></li>)}</ul>
            <button className="vl-close" onClick={() => setModal(null)}>Schließen (Esc)</button>
          </div>
        </div>
      )}
      {modal === 'log' && (
        <div className="vl-modal" onClick={() => setModal(null)}>
          <div className="vl-panel wide" onClick={(e) => e.stopPropagation()}>
            <h3>Alle Meldungen</h3>
            <ol className="vl-all">{[...s.msgs].reverse().slice(0, 120).map((m, i) => <li key={i} style={{ color: MSG_COLORS[m.kind] }}><em>{m.t}</em> {m.text}</li>)}</ol>
            <button className="vl-close" onClick={() => setModal(null)}>Schließen (Esc)</button>
          </div>
        </div>
      )}
      {modal === 'help' && (
        <div className="vl-modal" onClick={() => setModal(null)}>
          <div className="vl-panel wide" onClick={(e) => e.stopPropagation()}>
            <h3>Hilfe</h3>
            <div className="vl-help">
              <p><b>Ziel:</b> Steige zur Ebene {MAX_DEPTH} hinab, besiege den Drachen und nimm das Zeitamulett. Stirbst du, ist der Lauf vorbei – es gibt nur ein Leben.</p>
              <p><b>Bewegen und Kämpfen:</b> Pfeiltasten, WASD, Ziffernblock oder h j k l y u b n. Gegen ein Monster zu laufen heißt angreifen. Ein Klick auf die Karte läuft dorthin (Esc bricht ab).</p>
              <table>
                <tbody>
                  <tr><td><kbd>G</kbd></td><td>aufheben (Gold und Gegenstände nimmst du beim Drüberlaufen automatisch)</td></tr>
                  <tr><td><kbd>I</kbd></td><td>Rucksack: anlegen, trinken, lesen, zielen, ablegen</td></tr>
                  <tr><td><kbd>X</kbd></td><td>automatisch erkunden, bis etwas passiert</td></tr>
                  <tr><td><kbd>Umschalt</kbd>+<kbd>R</kbd></td><td>rasten, bis Leben und Mana voll sind</td></tr>
                  <tr><td><kbd>Z</kbd> / <kbd>.</kbd></td><td>suchen (findet Fallen) / warten</td></tr>
                  <tr><td><kbd>&gt;</kbd> <kbd>&lt;</kbd></td><td>Treppe hinab / hinauf</td></tr>
                  <tr><td><kbd>F</kbd> <kbd>C</kbd></td><td>Stab zielen oder Funkenwurf / Zauberliste (Magier)</td></tr>
                  <tr><td><kbd>E</kbd> <kbd>Q</kbd></td><td>schnell essen / bekannten Heiltrank trinken</td></tr>
                  <tr><td><kbd>Umschalt</kbd>+Pfeil</td><td>trotzdem auf eine bekannte Falle treten</td></tr>
                </tbody>
              </table>
              <p><b>Unbekannte Gegenstände:</b> Tränke, Schriftrollen und Stäbe haben in jedem Lauf andere Namen. Probiere sie in sicheren Momenten aus – manche schaden. Was du einmal benutzt hast, ist danach bekannt.</p>
              <p><b>Tipps:</b> Schlafende Monster zu treffen bringt doppelten Schaden (dreifach für die Schurkin). Kämpfe in Türen und Gängen, damit dich nur einer angreift. Hunger tickt langsam – iss, wenn du „hungrig“ bist. Der Drache wartet in einem großen Raum auf Ebene {MAX_DEPTH}.</p>
            </div>
            <button className="vl-close" onClick={() => setModal(null)}>Schließen (Esc)</button>
          </div>
        </div>
      )}
    </div>
  );
}

