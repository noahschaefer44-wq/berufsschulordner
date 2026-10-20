import { useEffect, useRef, useState } from 'react';
import { WORDS_FACH } from './data';
import { pick, pool } from './gen';
import { keySound, winSound } from './sound';
import { update, useData } from './store';

interface W { id: number; t: string; x: number; y: number }
interface G { words: W[]; target: number | null; pos: number; score: number; lives: number; level: number; combo: number; hit: number; next: number; spawn: number; over: boolean; shake: number; maxCombo: number }
const fresh = (): G => ({ words: [], target: null, pos: 0, score: 0, lives: 5, level: 1, combo: 0, hit: 0, next: 0, spawn: 0.5, over: false, shake: 0, maxCombo: 0 });

export default function Arcade() {
  const d = useData();
  const [phase, setPhase] = useState<'start' | 'play' | 'over'>('start');
  const [, tick] = useState(0);
  const g = useRef<G>(fresh());
  const id = useRef(1);
  const best = useRef(d.arcade);
  const [fach, setFach] = useState(false);

  useEffect(() => {
    if (phase !== 'play') return;
    let raf = 0;
    let last = performance.now();
    const list = fach ? WORDS_FACH.map((w) => w.toLowerCase()) : pool(d.settings.lang).map((w) => w.toLowerCase());
    const loop = (nowMs: number) => {
      const s = g.current;
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      const speed = 6 + s.level * 2.2;
      s.spawn -= dt;
      if (s.spawn <= 0) {
        const maxLen = Math.min(14, 4 + s.level * 1.5);
        const cands = list.filter((w) => w.length >= 3 && w.length <= maxLen && !s.words.some((x) => x.t[0] === w[0]));
        const t = pick(cands.length ? cands : list);
        s.words.push({ id: id.current++, t, x: 4 + Math.random() * 70, y: -4 });
        s.spawn = Math.max(0.65, 2.4 - s.level * 0.18);
      }
      for (const w of s.words) w.y += speed * dt;
      const missed = s.words.filter((w) => w.y >= 92);
      if (missed.length) {
        s.lives -= missed.length;
        s.combo = 0; s.shake = 0.3;
        if (s.target !== null && missed.some((w) => w.id === s.target)) { s.target = null; s.pos = 0; }
        s.words = s.words.filter((w) => w.y < 92);
        keySound('err');
      }
      s.shake = Math.max(0, s.shake - dt);
      if (s.lives <= 0) {
        s.over = true;
        best.current = Math.max(best.current, s.score);
        update((x) => { x.arcade = Math.max(x.arcade, s.score); x.xp += Math.round(s.score / 2); });
        winSound();
        setPhase('over');
        return;
      }
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const s = g.current;
      if (e.key === 'Backspace' || e.key === 'Escape') { s.target = null; s.pos = 0; return; }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const ch = e.key.toLowerCase();
      if (s.target === null) {
        const cands = s.words.filter((w) => w.t[0] === ch).sort((a, b) => b.y - a.y);
        if (cands[0]) { s.target = cands[0].id; s.pos = 1; keySound('ok'); } else { s.combo = 0; keySound('err'); return; }
      } else {
        const w = s.words.find((x) => x.id === s.target);
        if (!w) { s.target = null; s.pos = 0; return; }
        if (w.t[s.pos] === ch) { s.pos++; keySound('ok'); } else { s.combo = 0; keySound('err'); return; }
      }
      const w = s.words.find((x) => x.id === s.target);
      if (w && s.pos >= w.t.length) {
        s.score += Math.round(w.t.length * (1 + Math.min(s.combo, 20) / 10));
        s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo);
        s.hit++;
        if (s.hit % 8 === 0) s.level++;
        s.words = s.words.filter((x) => x.id !== w.id);
        s.target = null; s.pos = 0;
        keySound('space');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, [phase, d.settings.lang, fach]);

  const s = g.current;
  if (phase === 'start') {
    return (
      <section>
        <h2>Arcade: Fallende Wörter</h2>
        <p className="tp-sub">Wörter fallen herunter. Tippe sie ab, bevor sie unten ankommen. Fünf Leben, es wird immer schneller. Mit Backspace lässt du ein Wort wieder los.</p>
        <label className="tp-check"><input type="checkbox" checked={fach} onChange={(e) => setFach(e.target.checked)} />Nur Fachbegriffe (Beruf)</label>
        <p>Bestwert: <b>{d.arcade}</b></p>
        <button className="tp-btn main" onClick={() => { g.current = fresh(); setPhase('play'); }}>Start</button>
      </section>
    );
  }
  if (phase === 'over') {
    return (
      <section>
        <h2>Game Over</h2>
        <div className="tp-big">{s.score} Punkte</div>
        <p>Level {s.level} · {s.hit} Wörter · längste Serie {s.maxCombo} {s.score >= best.current && s.score > 0 ? '· Neuer Bestwert!' : `· Bestwert ${best.current}`}</p>
        <button className="tp-btn main" onClick={() => { g.current = fresh(); setPhase('play'); }}>Nochmal</button>
        <button className="tp-btn" onClick={() => setPhase('start')}>Menü</button>
      </section>
    );
  }
  return (
    <section>
      <div className="tp-hud">
        <b>{s.score}</b><span>Level {s.level}</span><span>{'♥'.repeat(Math.max(0, s.lives))}</span>
        {s.combo > 2 && <em>x{(1 + Math.min(s.combo, 20) / 10).toFixed(1)}</em>}
      </div>
      <div className={'tp-stage' + (s.shake > 0 ? ' shake' : '')}>
        {s.words.map((w) => (
          <span key={w.id} className={'tp-fall' + (s.target === w.id ? ' on' : '')} style={{ left: `${w.x}%`, top: `${w.y}%` }}>
            {s.target === w.id ? <><i>{w.t.slice(0, s.pos)}</i>{w.t.slice(s.pos)}</> : w.t}
          </span>
        ))}
        <div className="tp-floor" />
      </div>
    </section>
  );
}
