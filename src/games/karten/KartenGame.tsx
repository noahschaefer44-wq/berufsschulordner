import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import { useKeys, usePlaytime, useSecrets, useTicker } from '../shared/hooks';
import { dailySeed, freshSeed } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { achieve, dailyDone, fmtTime, markDaily, toast, useGameData } from '../shared/store';
import { RANKS, SUITS, isRed, rankOf, suitOf } from './cards';
import { BACKS, FELTS, KARTEN_INIT, VARIANTS, type KData, type KSettings, type KStat, type Variant } from './data';
import PileBoard from './PileBoard';
import PyramidBoard from './PyramidBoard';
import { type Move, type PileGame, applyMove, autoFoundationMove, canAutoComplete, canMove, countFound, foundationFor, hintMove, legalMoves, newFreecell, newKlondike, newSpider, pile, scoreMove, stateKey } from './piles';
import { type PMove, type PyrGame, applyP, hintP, isFree, newPyramid, newTriPeaks, stuckP } from './pyramid';
import { solveFreecell, solveKlondike } from './solver';
import './karten.css';

type Cur = { t: 'pile'; g: PileGame } | { t: 'pyr'; g: PyrGame };
type Panel = null | 'neu' | 'optionen' | 'statistik' | 'regeln';

const keyOfVariant = (v: Variant, S: KSettings) => (v === 'klondike' ? `klondike-${S.vegas ? 'v' : S.draw}` : v === 'spider' ? `spider-${S.suits}` : v === 'tripeaks' ? `tripeaks${S.wrap ? '-w' : ''}` : v);

const RULES: Record<Variant, string> = {
  klondike: 'Baue auf den vier Ablagen oben Farbfolgen vom Ass bis zum König auf. Im Tableau legst du Karten absteigend in wechselnden Farben ab; ganze Reihen lassen sich verschieben. Leere Stapel nehmen nur Könige. Ziehe vom Vorrat (1 oder 3 Karten); ist er leer, wird der Ablagestapel umgedreht. Im Vegas-Modus zählt jede Karte auf der Ablage Punkte, aber du darfst den Vorrat nur einmal (bzw. dreimal) durchgehen.',
  freecell: 'Alle Karten liegen offen. Vier freie Zellen nehmen je eine Karte vorübergehend auf. Verschiebe Reihen absteigend in wechselnden Farben – die Länge hängt von freien Zellen und leeren Stapeln ab: (Zellen + 1) × 2^(leere Stapel). Fast jedes Spiel ist lösbar; Spiel Nr. 11982 nicht.',
  spider: 'Zwei Decks, zehn Stapel. Lege Karten absteigend (jede Farbe) ab, bewegen kannst du aber nur Reihen in einer Farbe. Sobald König bis Ass in einer Farbe liegen, verschwindet die Reihe. Neue Karten bekommst du nur, wenn kein Stapel leer ist. Mit 1 Farbe leicht, mit 4 sehr schwer.',
  pyramide: 'Entferne Paare offener Karten, die zusammen 13 ergeben (Ass 1, Bube 11, Dame 12). Könige zählen 13 und gehen allein. Eine Karte ist offen, wenn keine andere auf ihr liegt. Der Vorrat darf zweimal erneut durchgegangen werden.',
  tripeaks: 'Räume drei Gipfel ab: Lege eine offene Karte auf den Ablagestapel, wenn sie genau einen Rang höher oder tiefer ist. Je länger die Serie ohne Ziehen, desto mehr Punkte. Mit „Ass-König-Schleife“ zählt das Ass auch neben dem König.',
};

export default function Karten({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('karten');
  const [data, upd] = useGameData<KData>('karten', KARTEN_INIT);
  const S: KSettings = { ...KARTEN_INIT.settings, ...data.settings };
  const setS = (p: Partial<KSettings>) => upd((d) => { d.settings = { ...KARTEN_INIT.settings, ...d.settings, ...p }; });

  const [cur, setCur] = useState<Cur | null>(null);
  const hist = useRef<Cur[]>([]);
  const [panel, setPanel] = useState<Panel>('neu');
  const [busy, setBusy] = useState('');
  const [hint, setHint] = useState<Move | PMove | null>(null);
  const [selP, setSelP] = useState<number | 'W' | null>(null);
  const [secs, setSecs] = useState(0);
  const timeRef = useRef(0);
  const started = useRef(false);
  const flags = useRef({ undo: false, helped: false, daily: false });
  const [won, setWon] = useState<null | { time: number; moves: number; score: number; best: boolean }>(null);
  const [numberInput, setNumberInput] = useState('');
  const [xray, setXray] = useState(false);
  const [coffee, setCoffee] = useState(false);
  const [stuck, setStuck] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(960);
  const [vh, setVh] = useState(800);
  const cascade = useRef<HTMLCanvasElement>(null);
  const solCache = useRef<{ key: string; moves: Move[] } | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el); setWrapW(el.clientWidth);
    const on = () => setVh(window.innerHeight);
    on(); window.addEventListener('resize', on);
    return () => { ro.disconnect(); window.removeEventListener('resize', on); };
  }, [panel]);

  useTicker(!!cur && !won && !stuck && started.current && !panel, (dt) => { timeRef.current += dt / 1000; setSecs(Math.floor(timeRef.current)); }, 500);

  // ───── Spielstart ─────
  const finishSetup = (c: Cur, daily = false) => {
    hist.current = []; timeRef.current = 0; setSecs(0); started.current = false; flags.current = { undo: false, helped: false, daily };
    solCache.current = null;
    setCur(c); setWon(null); setHint(null); setSelP(null); setStuck(false); setPanel(null); setBusy(''); setXray(false);
    const rect = cascade.current; if (rect) rect.getContext('2d')?.clearRect(0, 0, rect.width, rect.height);
  };

  const build = (v: Variant, seed: number): Cur => {
    switch (v) {
      case 'klondike': return { t: 'pile', g: newKlondike(seed, { draw: S.draw, vegas: S.vegas }) };
      case 'freecell': return { t: 'pile', g: newFreecell(seed, { autoSafe: S.autoSafe }) };
      case 'spider': return { t: 'pile', g: newSpider(seed, S.suits) };
      case 'pyramide': return { t: 'pyr', g: newPyramid(seed) };
      default: return { t: 'pyr', g: newTriPeaks(seed, S.wrap) };
    }
  };

  const start = useCallback((v: Variant, number?: number, isDaily = false) => {
    setS({ variant: v });
    if (v === 'freecell') {
      let n = number ?? 1 + Math.floor(Math.random() * 31999);
      if (n === 11982 && number === undefined) n = 617;
      finishSetup(build(v, n), isDaily);
      upd((d) => { d.settings = { ...KARTEN_INIT.settings, ...d.settings, number: { ...d.settings.number, freecell: n } }; });
      return;
    }
    const baseSeed = number ?? (isDaily ? dailySeed('karten', v) : freshSeed());
    if (v === 'klondike' && S.winnable && number === undefined && !isDaily) {
      // Lösbares Blatt suchen (mehrere Versuche, damit die Anzeige nicht einfriert)
      let tries = 0;
      setBusy('Suche ein lösbares Blatt …');
      const loop = () => {
        const seed = tries === 0 ? baseSeed : freshSeed();
        const c = build(v, seed) as { t: 'pile'; g: PileGame };
        const sol = solveKlondike(c.g, 20000, 700);
        tries++;
        if (sol || tries >= 12) { finishSetup(c); if (sol) solCache.current = { key: stateKey(c.g), moves: sol.moves }; }
        else window.setTimeout(loop, 15);
      };
      window.setTimeout(loop, 20);
      return;
    }
    finishSetup(build(v, baseSeed), isDaily);
  }, [S.draw, S.vegas, S.suits, S.wrap, S.winnable, S.autoSafe]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (daily) start(S.variant, undefined, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── Zug ausführen ─────
  const commit = (next: Cur, evs?: { kind: string }[]) => {
    if (!cur) return;
    hist.current.push(cur);
    if (hist.current.length > 600) hist.current.shift();
    started.current = true;
    setCur(next); setHint(null);
    if (evs) {
      if (evs.some((e) => e.kind === 'complete')) sfx('win');
      else if (evs.some((e) => e.kind === 'flip')) sfx('card');
      else sfx('card');
    }
    const g = next.g;
    if (g.won) onWin(next);
  };

  const doMove = (m: Move) => {
    if (!cur || cur.t !== 'pile' || won) return;
    const r = applyMove(cur.g, m);
    if (!r) { sfx('bad'); return; }
    commit({ t: 'pile', g: r.g }, r.evs);
  };

  // Automatik: sichere Ablage (FreeCell), Kaffeepause, Auto-Beenden
  useEffect(() => {
    if (!cur || cur.t !== 'pile' || won || pending.current) return;
    const g = cur.g;
    const auto = (g.kind === 'freecell' && S.autoSafe) || coffee ? autoFoundationMove(g, coffee) : null;
    const finish = !auto && canAutoComplete(g) ? autoFoundationMove(g, true) : null;
    const m = auto ?? finish;
    if (!m) return;
    pending.current = true;
    const id = window.setTimeout(() => {
      pending.current = false;
      const r = applyMove(g, m);
      if (r) { setCur({ t: 'pile', g: r.g }); if (r.g.won) onWin({ t: 'pile', g: r.g }); sfx('card'); }
    }, auto ? 140 : 90);
    return () => { window.clearTimeout(id); pending.current = false; };
  }, [cur, S.autoSafe, coffee, won]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keine Züge mehr?
  useEffect(() => {
    if (!cur || won) { setStuck(false); return; }
    const id = window.setTimeout(() => {
      if (cur.t === 'pile') {
        const ms = legalMoves(cur.g);
        const real = ms.filter((m) => !('act' in m) || (m.act !== 'draw' && m.act !== 'recycle'));
        // Klondike: Vorrat durchspielen reicht als Zug, solange er sich nicht nur wiederholt
        setStuck(real.length === 0 && (cur.g.kind !== 'klondike' ? ms.length === 0 : cur.g.passes >= 3 || (ms.length === 0)));
      } else setStuck(stuckP(cur.g));
    }, 400);
    return () => window.clearTimeout(id);
  }, [cur, won]);

  // ───── Klicks ─────
  const autoClick = (from: string, idx: number, dbl: boolean) => {
    if (!cur || cur.t !== 'pile' || won) return;
    const g = cur.g;
    const src = pile(g, from);
    const card = src[idx];
    if (!card || !card.up) return;
    // Ablage
    if (idx === src.length - 1 && g.kind !== 'spider') {
      const fi = foundationFor(g, card);
      if (fi >= 0 && from[0] !== 'F') { doMove({ from, idx, to: `F${fi}` }); return; }
    }
    if (from[0] === 'F' && !dbl) return;
    // beste Ziel-Position
    const targets: string[] = [];
    g.tab.forEach((_, i) => targets.push(`T${i}`));
    if (g.kind === 'freecell') g.cells.forEach((_, i) => targets.push(`C${i}`));
    let best: Move | null = null, bs = -1e9;
    for (const to of targets) {
      if (!canMove(g, from, idx, to)) continue;
      const m: Move = { from, idx, to };
      let s = scoreMove(g, m);
      if (g.kind === 'freecell' && to[0] === 'C') s -= 5;
      if (g.kind === 'freecell' && to[0] === 'T' && pile(g, to).length === 0) s -= 10;
      if (s > bs) { bs = s; best = m; }
    }
    if (best) doMove(best); else sfx('bad');
  };
  const onStock = () => {
    if (!cur || cur.t !== 'pile' || won) return;
    const g = cur.g;
    if (g.kind === 'klondike') {
      if (g.stock.length) doMove({ act: 'draw' } as Move);
      else if (g.waste.length) { const r = applyMove(g, { act: 'recycle' }); if (r) commit({ t: 'pile', g: r.g }, r.evs); else toast(g.opts.vegas ? 'Im Vegas-Modus ist keine weitere Runde erlaubt.' : ''); }
    } else if (g.kind === 'spider') {
      if (g.tab.some((p) => p.length === 0)) { toast('Zum Austeilen darf kein Stapel leer sein.'); return; }
      doMove({ act: 'deal' } as Move);
    }
  };
  const pyrApply = (m: PMove) => {
    if (!cur || cur.t !== 'pyr' || won) return;
    const r = applyP(cur.g, m);
    if (!r) { sfx('bad'); return; }
    hist.current.push(cur); started.current = true;
    setCur({ t: 'pyr', g: r }); setHint(null); setSelP(null);
    sfx(m.act === 'remove' ? 'clear' : 'card');
    if (r.kind === 'tripeaks' && r.best >= 10) achieve('karten', 'serie10');
    if (r.won) onWin({ t: 'pyr', g: r });
  };
  const pyrCard = (i: number) => {
    if (!cur || cur.t !== 'pyr') return;
    const g = cur.g;
    if (g.kind === 'tripeaks') { pyrApply({ act: 'play', a: i }); return; }
    if (!isFree(g, i)) return;
    if (rankOf(g.board[i]!.id) === 12) { pyrApply({ act: 'remove', a: i }); return; }
    if (selP === null) { setSelP(i); return; }
    if (selP === i) { setSelP(null); return; }
    const r = applyP(g, { act: 'remove', a: selP, b: i });
    if (r) pyrApply({ act: 'remove', a: selP, b: i }); else { setSelP(i); sfx('bad'); }
  };
  const pyrWaste = () => {
    if (!cur || cur.t !== 'pyr' || cur.g.kind !== 'pyramide') return;
    const g = cur.g;
    const top = g.waste[g.waste.length - 1];
    if (!top) return;
    if (rankOf(top.id) === 12) { pyrApply({ act: 'remove', a: 'W' }); return; }
    if (selP === null) { setSelP('W'); return; }
    if (selP === 'W') { setSelP(null); return; }
    const r = applyP(g, { act: 'remove', a: selP, b: 'W' });
    if (r) pyrApply({ act: 'remove', a: selP, b: 'W' }); else { setSelP('W'); sfx('bad'); }
  };
  const pyrStock = () => {
    if (!cur || cur.t !== 'pyr') return;
    if (cur.g.stock.length) pyrApply({ act: 'draw' });
    else pyrApply({ act: 'recycle' });
  };

  // ───── Rückgängig, Hinweis ─────
  const undo = () => {
    const h = hist.current.pop();
    if (!h || won) return;
    setCur(h); setHint(null); setSelP(null); flags.current.undo = true; sfx('erase');
  };
  const doHint = () => {
    if (!cur || won) return;
    flags.current.helped = true;
    if (cur.t === 'pyr') { const h = hintP(cur.g); if (h) setHint(h); else toast('Kein Zug gefunden.'); return; }
    const g = cur.g;
    let m: Move | null = null;
    if (g.kind === 'klondike' || g.kind === 'freecell') {
      const key = stateKey(g);
      if (solCache.current?.key === key && solCache.current.moves.length) m = solCache.current.moves[0];
      else {
        setBusy('Der Löser sucht …');
        window.setTimeout(() => {
          const sol = g.kind === 'klondike' ? solveKlondike(g, 25000, 900) : solveFreecell(g, 60000, 2500);
          setBusy('');
          if (sol && sol.moves.length) { solCache.current = { key, moves: sol.moves }; setHint(sol.moves[0]); }
          else { const h = hintMove(g); if (h) setHint(h); else toast('Kein Zug gefunden – mach etwas rückgängig.'); }
        }, 15);
        return;
      }
    } else m = hintMove(g);
    if (m) setHint(m); else toast('Kein Zug gefunden.');
  };
  const showSolution = () => {
    if (!cur || cur.t !== 'pile' || won) return;
    const g = cur.g;
    if (g.kind !== 'klondike' && g.kind !== 'freecell') { toast('Für diese Variante gibt es keinen Löser.'); return; }
    setBusy('Der Löser sucht …');
    window.setTimeout(() => {
      const sol = g.kind === 'klondike' ? solveKlondike(g, 60000, 3500) : solveFreecell(g, 120000, 6000);
      setBusy('');
      if (!sol) { toast('Keine Lösung gefunden.'); return; }
      flags.current.helped = true;
      let i = 0;
      let st = g;
      const id = window.setInterval(() => {
        const m = sol.moves[i++];
        if (!m) { window.clearInterval(id); return; }
        const r = applyMove(st, m);
        if (!r) { window.clearInterval(id); return; }
        st = r.g; started.current = true;
        setCur({ t: 'pile', g: r.g }); sfx('card');
        if (r.g.won) { window.clearInterval(id); onWin({ t: 'pile', g: r.g }); }
      }, 240);
    }, 15);
  };

  // ───── Sieg ─────
  const onWin = (c: Cur) => {
    const g = c.g;
    const v = S.variant;
    const key = keyOfVariant(v, S);
    const time = Math.round(timeRef.current);
    const moves = g.moves, score = g.score;
    let best = false;
    upd((d) => {
      const st: KStat = d.stats[key] ?? { played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: 0, bestMoves: 0, bestScore: 0 };
      st.played++; st.won++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak);
      if (!flags.current.helped && (!st.bestTime || time < st.bestTime)) { st.bestTime = time; best = true; }
      if (!st.bestMoves || moves < st.bestMoves) st.bestMoves = moves;
      if (score > st.bestScore) st.bestScore = score;
      d.stats = { ...d.stats, [key]: st };
      d.totals = { games: d.totals.games + 1, wins: d.totals.wins + 1 };
      if (v === 'freecell') d.freecellDone = { ...d.freecellDone, [g.deal]: true };
    });
    sfx('win');
    setWon({ time, moves, score, best });
    startCascade(c);
    achieve('karten', 'first');
    if (v === 'klondike' && S.draw === 3 && !S.vegas) achieve('karten', 'klondike3');
    if (v === 'klondike' && S.vegas) achieve('karten', 'vegas');
    if (v === 'klondike' && time < 180 && !flags.current.helped) achieve('karten', 'schnell');
    if (v === 'freecell') { achieve('karten', 'freecell'); if (Object.keys({ ...data.freecellDone, [g.deal]: true }).length >= 10) achieve('karten', 'freecell10'); }
    if (v === 'spider') { if (S.suits === 1) achieve('karten', 'spider1'); if (S.suits === 4) achieve('karten', 'spider4'); }
    if (v === 'pyramide') achieve('karten', 'pyramide');
    if (v === 'tripeaks') achieve('karten', 'tripeaks');
    if (!flags.current.undo && !flags.current.helped) achieve('karten', 'ohneundo');
    if (data.totals.wins + 1 >= 10) achieve('karten', 'zehn');
    if (flags.current.daily) { achieve('karten', 'daily'); markDaily('karten', v); }
  };
  const onLose = () => {
    const key = keyOfVariant(S.variant, S);
    upd((d) => { const st: KStat = d.stats[key] ?? { played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: 0, bestMoves: 0, bestScore: 0 }; st.played++; st.streak = 0; d.stats = { ...d.stats, [key]: st }; d.totals = { ...d.totals, games: d.totals.games + 1 }; });
  };

  // Siegesanimation: springende Karten
  const startCascade = (c: Cur) => {
    const cv = cascade.current;
    if (!cv || !S.anim) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    const ids: number[] = [];
    if (c.t === 'pile') { for (let r = 12; r >= 0; r--) for (const p of c.g.found) { const card = p[r] ?? null; if (card) ids.push(card.id); } if (!ids.length) for (let i = 0; i < 52; i++) ids.push(i); }
    else for (let i = 0; i < 52; i++) ids.push(i);
    const sprites: { x: number; y: number; vx: number; vy: number; id: number }[] = [];
    const cw = Math.min(70, Math.floor(w / 12)), ch = Math.round(cw * 1.42);
    let t = 0, k = 0, raf = 0;
    const draw = (id: number, x: number, y: number) => {
      ctx.fillStyle = '#fbf8ef'; ctx.strokeStyle = '#bdb69f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = isRed(id) ? '#b3261e' : '#15130f';
      ctx.font = `700 ${Math.round(cw * 0.34)}px 'Playfair Display', serif`; ctx.textAlign = 'center';
      ctx.fillText(RANKS[rankOf(id)], x + cw / 2, y + ch * 0.38);
      ctx.font = `${Math.round(cw * 0.5)}px serif`; ctx.fillText(SUITS[suitOf(id)], x + cw / 2, y + ch * 0.82);
    };
    const loop = () => {
      t++;
      if (t % 9 === 0 && k < ids.length) { const sx = (k % 8) * (w / 8) + 20; sprites.push({ x: sx, y: h * 0.25, vx: (Math.random() - 0.3) * 7 + 3, vy: -2 - Math.random() * 3, id: ids[k++] }); }
      for (const s of sprites) {
        s.vy += 0.45; s.x += s.vx; s.y += s.vy;
        if (s.y + ch > h) { s.y = h - ch; s.vy *= -0.82; if (Math.abs(s.vy) < 1.2) s.vy = -9; }
        draw(s.id, s.x, s.y);
      }
      if (sprites.every((s) => s.x > w + cw) && k >= ids.length) return;
      if (t < 2600) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.setTimeout(() => cancelAnimationFrame(raf), 30000);
  };

  // ───── Tastatur ─────
  useKeys((e) => {
    if (panel) return;
    if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U' || e.key === 'Backspace') { if (e.key === 'Backspace') e.preventDefault(); undo(); }
    else if (e.key === 'h' || e.key === 'H') doHint();
    else if (e.key === 'n' || e.key === 'N') setPanel('neu');
    else if (e.key === ' ' || e.key === 'd' || e.key === 'D') { e.preventDefault(); if (cur?.t === 'pile') onStock(); else pyrStock(); }
  }, [cur, panel, won]);

  // ───── Geheimnisse ─────
  useSecrets('karten', {
    'karten-xray': () => { setXray((x) => !x); flags.current.helped = true; },
    'karten-joker': () => {
      if (!cur || cur.t !== 'pile' || cur.g.kind !== 'freecell') return;
      flags.current.helped = true;
      const g = { ...cur.g, cells: [...cur.g.cells.map((c) => [...c]), []] };
      setCur({ t: 'pile', g });
    },
    'karten-kaffee': () => { setCoffee((x) => !x); flags.current.helped = true; },
  });

  // ───── Anzeige ─────
  const sc = cur?.t === 'pile' ? cur.g.score : cur?.g.score ?? 0;
  const moves = cur?.g.moves ?? 0;
  const info = useMemo(() => {
    if (!cur) return '';
    if (cur.t === 'pile') {
      const p = cur.g;
      return p.kind === 'freecell' ? `Spiel Nr. ${p.deal}` : p.kind === 'klondike' ? `Blatt ${p.deal}${p.opts.vegas ? ' · Vegas' : ` · ${p.opts.draw} Karte${p.opts.draw > 1 ? 'n' : ''}`}` : `Blatt ${p.deal} · ${p.opts.suits} Farbe${p.opts.suits > 1 ? 'n' : ''}`;
    }
    return `Blatt ${cur.g.deal}`;
  }, [cur]);
  const availH = Math.max(560, vh - 200);
  const progress = cur?.t === 'pile' ? countFound(cur.g) : cur ? 28 - cur.g.board.filter(Boolean).length : 0;
  const progressMax = cur?.t === 'pile' ? (cur.g.kind === 'spider' ? 104 : 52) : 28;

  return (
    <div className={'kt felt-' + S.felt + (S.leftHand ? ' lefty' : '')}>
      <header className="kt-head">
        <h1>Patience</h1>
        <nav>
          <button onClick={() => setPanel(panel === 'neu' ? null : 'neu')}>Neu</button>
          <button onClick={() => { start(S.variant, undefined, true); }} className={dailyDone('karten', S.variant) ? 'done' : ''}>Tagesspiel{dailyDone('karten', S.variant) ? ' ✓' : ''}</button>
          <button onClick={() => setPanel(panel === 'regeln' ? null : 'regeln')}>Regeln</button>
          <button onClick={() => setPanel(panel === 'statistik' ? null : 'statistik')}>Statistik</button>
          <button onClick={() => setPanel(panel === 'optionen' ? null : 'optionen')}>Optionen</button>
          <button className="x" aria-label="Zurück zur Halle" onClick={onExit}>✕</button>
        </nav>
      </header>

      {panel === 'neu' && (
        <section className="kt-panel" aria-label="Neues Spiel">
          <h2>Neues Spiel</h2>
          <div className="kt-variants">
            {VARIANTS.map((v) => <button key={v.id} className={S.variant === v.id ? 'on' : ''} onClick={() => setS({ variant: v.id })}><b>{v.name}</b><small>{v.info}</small></button>)}
          </div>
          <div className="kt-opts">
            {S.variant === 'klondike' && (
              <>
                <div className="kt-seg"><span>Ziehen</span>{([1, 3] as const).map((n) => <button key={n} className={!S.vegas && S.draw === n ? 'on' : ''} onClick={() => setS({ draw: n, vegas: false })}>{n} Karte{n > 1 ? 'n' : ''}</button>)}<button className={S.vegas ? 'on' : ''} onClick={() => setS({ vegas: true })}>Vegas ({S.draw}er)</button></div>
                {S.vegas && <div className="kt-seg"><span>Vegas-Ziehen</span>{([1, 3] as const).map((n) => <button key={n} className={S.draw === n ? 'on' : ''} onClick={() => setS({ draw: n })}>{n}</button>)}</div>}
                <label><span>Garantiert lösbares Blatt (Suche dauert kurz)</span><input type="checkbox" checked={S.winnable} onChange={(e) => setS({ winnable: e.target.checked })} /></label>
              </>
            )}
            {S.variant === 'spider' && <div className="kt-seg"><span>Farben</span>{([1, 2, 4] as const).map((n) => <button key={n} className={S.suits === n ? 'on' : ''} onClick={() => setS({ suits: n })}>{n} {n === 1 ? 'Farbe (leicht)' : n === 2 ? 'Farben' : 'Farben (schwer)'}</button>)}</div>}
            {S.variant === 'tripeaks' && <label><span>Ass-König-Schleife (A neben K)</span><input type="checkbox" checked={S.wrap} onChange={(e) => setS({ wrap: e.target.checked })} /></label>}
            {S.variant === 'freecell' && <label><span>Sichere Karten automatisch zur Ablage</span><input type="checkbox" checked={S.autoSafe} onChange={(e) => setS({ autoSafe: e.target.checked })} /></label>}
            {(S.variant === 'freecell' || S.variant === 'klondike' || S.variant === 'spider' || S.variant === 'pyramide' || S.variant === 'tripeaks') && (
              <div className="kt-seg"><span>Spiel-Nr.</span>
                <input className="kt-num" inputMode="numeric" placeholder={S.variant === 'freecell' ? '1 – 1.000.000' : 'beliebige Zahl'} value={numberInput} onChange={(e) => setNumberInput(e.target.value.replace(/\D/g, ''))} />
                <button onClick={() => { const n = +numberInput; if (n > 0) start(S.variant, n); else toast('Gib eine Zahl ein.'); }}>Dieses Spiel</button>
              </div>
            )}
          </div>
          <div className="kt-row">
            <button className="kt-primary" onClick={() => start(S.variant)}>Zufälliges Spiel</button>
            {cur && !won && <button onClick={() => cur && finishSetup(build(S.variant, cur.g.deal))}>Dasselbe Blatt nochmal</button>}
            {cur && <button onClick={() => setPanel(null)}>Zurück zum Spiel</button>}
          </div>
        </section>
      )}
      {panel === 'regeln' && <section className="kt-panel"><h2>{VARIANTS.find((v) => v.id === S.variant)?.name}: Regeln</h2><p>{RULES[S.variant]}</p><p className="kt-small">Bedienung: Karten ziehen (Drag & Drop) oder anklicken – ein Klick legt sie automatisch an die beste Stelle, ein Doppelklick bevorzugt die Ablage. Rechtsklick wie Doppelklick. Tasten: Z zurück, H Hinweis, N neu, Leertaste Vorrat.</p><button onClick={() => setPanel(null)}>Zurück</button></section>}
      {panel === 'optionen' && (
        <section className="kt-panel">
          <h2>Optionen</h2>
          <div className="kt-seg"><span>Tisch</span>{FELTS.map((f) => <button key={f.id} className={S.felt === f.id ? 'on' : ''} onClick={() => setS({ felt: f.id })}>{f.name}</button>)}</div>
          <div className="kt-seg"><span>Rücken</span>{BACKS.map((b) => <button key={b.id} className={S.back === b.id ? 'on' : ''} onClick={() => setS({ back: b.id })}><i className={'kc-back b-' + b.id + ' mini'} />{b.name}</button>)}</div>
          <label><span>Vierfarben-Deck (Karo blau, Kreuz grün)</span><input type="checkbox" checked={S.fourColor} onChange={(e) => setS({ fourColor: e.target.checked })} /></label>
          <label><span>Großer Druck</span><input type="checkbox" checked={S.large} onChange={(e) => setS({ large: e.target.checked })} /></label>
          <label><span>Linkshänder-Layout</span><input type="checkbox" checked={S.leftHand} onChange={(e) => setS({ leftHand: e.target.checked })} /></label>
          <label><span>Animationen</span><input type="checkbox" checked={S.anim} onChange={(e) => setS({ anim: e.target.checked })} /></label>
          <button onClick={() => setPanel(null)}>Fertig</button>
        </section>
      )}
      {panel === 'statistik' && (
        <section className="kt-panel">
          <h2>Statistik</h2>
          <p>{data.totals.games} Spiele · {data.totals.wins} Siege ({data.totals.games ? Math.round((data.totals.wins / data.totals.games) * 100) : 0} %)</p>
          {Object.keys(data.stats).length === 0 ? <p>Noch keine Spiele.</p> : (
            <table className="kt-table"><thead><tr><th>Spiel</th><th>Gespielt</th><th>Gewonnen</th><th>Serie</th><th>Beste Zeit</th><th>Wenigste Züge</th><th>Punkte</th></tr></thead>
              <tbody>{Object.entries(data.stats).map(([k, s]) => <tr key={k}><td>{k}</td><td>{s.played}</td><td>{s.won} ({s.played ? Math.round((s.won / s.played) * 100) : 0} %)</td><td>{s.streak} (max {s.bestStreak})</td><td>{s.bestTime ? fmtTime(s.bestTime) : '–'}</td><td>{s.bestMoves || '–'}</td><td>{s.bestScore || '–'}</td></tr>)}</tbody></table>
          )}
          <button onClick={() => setPanel(null)}>Zurück</button>
        </section>
      )}

      {busy && <div className="kt-busy" role="status">{busy}</div>}

      <main className="kt-main" ref={wrap}>
        {cur && (
          <>
            <div className="kt-bar">
              <span>{VARIANTS.find((v) => v.id === S.variant)?.name} · {info}</span>
              <span>Zeit {fmtTime(secs)}</span>
              <span>Züge {moves}</span>
              {(cur.t === 'pile' && (cur.g.kind === 'klondike' || cur.g.kind === 'spider')) || cur.t === 'pyr' ? <span>Punkte {sc}</span> : null}
              <span className="kt-prog" title="Fortschritt"><i style={{ width: `${(progress / progressMax) * 100}%` }} /></span>
              <button onClick={undo} disabled={!hist.current.length}>↶ Zurück</button>
              <button onClick={doHint}>💡 Hinweis</button>
              {cur.t === 'pile' && (cur.g.kind === 'klondike' || cur.g.kind === 'freecell') && <button onClick={showSolution}>▶ Lösung</button>}
              {cur.t === 'pyr' && cur.g.kind === 'tripeaks' && <span>Serie {cur.g.streak} (beste {cur.g.best})</span>}
              {xray && <em>Röntgen</em>}{coffee && <em>Kaffeepause</em>}
            </div>
            <div className="kt-table-wrap">
              {cur.t === 'pile' ? (
                <PileBoard g={cur.g} S={S} width={wrapW} availH={availH} hint={hint as Move | null} xray={xray} onMove={doMove} onAuto={autoClick} onStock={onStock} />
              ) : (
                <PyramidBoard g={cur.g} S={S} width={wrapW} selected={selP} hint={hint as PMove | null} xray={xray} onCard={pyrCard} onWaste={pyrWaste} onStock={pyrStock} />
              )}
              <canvas ref={cascade} className="kt-cascade" aria-hidden="true" />
            </div>
            {stuck && !won && (
              <div className="kt-stuck" role="status">
                Keine sinnvollen Züge mehr.
                <button onClick={undo}>↶ Rückgängig</button>
                <button onClick={() => { onLose(); setStuck(false); setPanel('neu'); }}>Aufgeben & neues Spiel</button>
              </div>
            )}
          </>
        )}
        {!cur && !busy && panel !== 'neu' && <p className="kt-small">Wähle ein Spiel unter „Neu“.</p>}
      </main>

      {won && (
        <div className="kt-modal" role="dialog" aria-label="Gewonnen">
          <div className="kt-modal-box">
            <h2>Gewonnen!</h2>
            <p className="kt-big">{fmtTime(won.time)}</p>
            <p>{won.moves} Züge{cur?.t === 'pile' && cur.g.kind !== 'freecell' ? ` · ${won.score} Punkte` : ''}{won.best ? ' · Neue Bestzeit!' : ''}{flags.current.helped ? ' · mit Hilfe (keine Bestzeit)' : ''}</p>
            <div className="kt-row">
              <button className="kt-primary" onClick={() => start(S.variant)} autoFocus>Neues Spiel</button>
              <button onClick={() => setWon(null)}>Ergebnis ansehen</button>
              <button onClick={() => { setWon(null); setPanel('neu'); }}>Andere Variante</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
