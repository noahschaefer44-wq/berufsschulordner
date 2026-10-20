import { useEffect, useRef, useState } from 'react';
import { SOURCES, sourceText } from './gen';
import { keySound, winSound } from './sound';
import { recordRun, update, useData } from './store';

const CW = 46; // Breite einer Kachel
const HIT_X = 150; // Position der Trefferlinie

type Tile = 'wait' | 'hit' | 'miss';

/** Fließband: Ein Satz läuft als Kachelband von rechts nach links. Tippe jede Kachel, bevor sie den linken Rand erreicht. Das Band wird immer schneller. */
export default function Belt({ onExit }: { onExit: () => void }) {
  const d = useData();
  const [phase, setPhase] = useState<'start' | 'run' | 'over'>('start');
  const [source, setSource] = useState('mix');
  const [, force] = useState(0);
  const g = useRef({ text: '', tiles: [] as Tile[], p: 0, off: 0, speed: 80, lives: 3, combo: 0, best: 0, score: 0, flash: 0, errs: 0, hits: 0, t0: 0, won: false });

  function start() {
    const text = sourceText(source, 600).replace(/\n/g, ' ');
    g.current = { text, tiles: new Array(text.length).fill('wait'), p: 0, off: -300, speed: 80, lives: 3, combo: 0, best: 0, score: 0, flash: 0, errs: 0, hits: 0, t0: performance.now(), won: false };
    setPhase('run');
  }
  function end(won: boolean) {
    const s = g.current;
    s.won = won;
    setPhase('over');
    update((x) => { x.hi = { ...x.hi, band: Math.max(x.hi.band ?? 0, s.score) }; });
    const secs = Math.max(1, (performance.now() - s.t0) / 1000);
    if (s.hits > 15) recordRun('fliessband', { wpm: Math.round((s.hits / 5 / (secs / 60)) * 10) / 10, raw: 0, acc: Math.round((s.hits / (s.hits + s.errs)) * 100), secs, chars: s.hits, errs: s.errs, series: [] });
    winSound();
  }

  useEffect(() => {
    if (phase !== 'run') return;
    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const s = g.current;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      s.off += s.speed * dt;
      s.speed += 1.6 * dt;
      s.flash = Math.max(0, s.flash - dt);
      // verpasste Kacheln
      while (s.p < s.text.length && s.p * CW - s.off < 20) {
        s.tiles[s.p] = 'miss'; s.p++; s.lives--; s.combo = 0; s.flash = 0.25; keySound('err');
        if (s.lives <= 0) { end(false); return; }
      }
      if (s.p >= s.text.length) { end(true); return; }
      force((n) => (n + 1) % 1e6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.key.length !== 1) return;
      e.preventDefault();
      const s = g.current;
      if (s.p >= s.text.length) return;
      if (e.key === s.text[s.p]) {
        s.tiles[s.p] = 'hit'; s.p++; s.hits++; s.combo++; s.best = Math.max(s.best, s.combo);
        s.score += 10 + Math.min(s.combo, 30); keySound('ok');
      } else { s.combo = 0; s.errs++; s.flash = 0.2; keySound('err'); }
    };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, [phase]);

  if (phase === 'start') {
    return (
      <div className="wu-screen">
        <button className="wu-back" onClick={onExit}>‹ Spiele</button>
        <h2 className="wu-title">Fließband</h2>
        <p className="wu-sub">Kacheln rollen von rechts auf dich zu. Tippe sie der Reihe nach ab, bevor sie links herausfallen. Drei Leben – und das Band wird immer schneller. Falsche Tasten unterbrechen deine Serie.</p>
        <div className="wu-panel"><div className="wu-field"><span>Texte</span><select value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
        <div className="wu-stats"><span>Bestwert: {d.hi.band ?? 0}</span></div>
        <button className="wu-go" onClick={start}>Band starten</button>
      </div>
    );
  }
  const s = g.current;
  if (phase === 'over') {
    return (
      <div className="wu-screen">
        <h2 className="wu-title">{s.won ? 'Band geschafft!' : 'Band gerissen!'}</h2>
        <div className="wu-big">{s.score} Punkte</div>
        <p className="wu-sub">{s.hits} Treffer · längste Serie {s.best} · {s.score >= (d.hi.band ?? 0) && s.score > 0 ? 'Neuer Bestwert!' : `Bestwert ${d.hi.band ?? 0}`}</p>
        <button className="wu-go" onClick={start}>Nochmal</button>
        <button className="wu-ghost" onClick={onExit}>Zu den Spielen</button>
      </div>
    );
  }
  const from = Math.max(0, s.p - 4), to = Math.min(s.text.length, s.p + 34);
  return (
    <div className="wu-screen">
      <div className="wu-bar"><button className="wu-back" onClick={() => setPhase('start')}>✕ Beenden</button><b>{s.score} Punkte</b><span className="wu-lap">{'♥'.repeat(Math.max(0, s.lives))}</span></div>
      <div className={'wu-belt' + (s.flash > 0 ? ' flash' : '')}>
        <div className="wu-belt-track" style={{ backgroundPositionX: `${-s.off}px` }} />
        <div className="wu-hitline" style={{ left: HIT_X }} />
        {Array.from({ length: to - from }, (_, k) => {
          const i = from + k;
          const ch = s.text[i];
          const x = i * CW - s.off;
          const cls = 'wu-tile-c ' + s.tiles[i] + (i === s.p ? ' now' : '');
          return <span key={i} className={cls} style={{ transform: `translateX(${x}px)`, width: CW - 6 }}>{ch === ' ' ? '␣' : ch}</span>;
        })}
      </div>
      <p className="wu-sub" style={{ textAlign: 'center', marginTop: 14 }}>Serie {s.combo} · Tempo {Math.round(s.speed)} · tippe die leuchtende Kachel</p>
    </div>
  );
}
