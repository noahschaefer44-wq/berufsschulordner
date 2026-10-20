import { useEffect, useRef, useState } from 'react';
import { SOURCES, sourceText } from './gen';
import Pad, { Gauge } from './Pad';
import { beep, winSound } from './sound';
import TextRun from './TextRun';
import { recordRun, update, useData } from './store';

const MILESTONES: [number, string][] = [[200, 'Wolken'], [600, 'Flugzeuge'], [1200, 'Stratosphäre'], [2200, 'Weltall!'], [3500, 'Mond in Sicht'], [5000, 'Mars-Orbit'], [8000, 'Andromeda']];

/** Raketenstart: Dein Tippen ist der Treibstoff. Er verbrennt ständig – tippst du zu langsam oder zu fehlerhaft, stürzt die Rakete ab. */
export default function Rocket({ onExit }: { onExit: () => void }) {
  const d = useData();
  const [phase, setPhase] = useState<'start' | 'fly' | 'over'>('start');
  const [source, setSource] = useState('mix');
  const [text, setText] = useState('');
  const [alt, setAlt] = useState(0);
  const [fuel, setFuel] = useState(100);
  const [attempt, setAttempt] = useState(0);
  const g = useRef({ fuel: 100, idx: 0, errs: 0, alt: 0, t0: 0, last: 0 });

  function start() {
    g.current = { fuel: 100, idx: 0, errs: 0, alt: 0, t0: performance.now(), last: performance.now() };
    setText(sourceText(source, 2200)); setAlt(0); setFuel(100); setAttempt((a) => a + 1); setPhase('fly'); beep(330);
  }

  useEffect(() => {
    if (phase !== 'fly') return;
    let raf = 0;
    const loop = (t: number) => {
      const s = g.current;
      const dt = Math.min(0.05, (t - s.last) / 1000);
      s.last = t;
      if (t - s.t0 > 1500) s.fuel = Math.max(0, s.fuel - (7 + s.alt / 450) * dt); // Schonfrist am Start
      setFuel(s.fuel); setAlt(s.alt);
      if (s.fuel <= 0) { crash(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  function crash() {
    const s = g.current;
    setPhase('over');
    const m = Math.round(s.alt);
    update((x) => { x.hi = { ...x.hi, rakete: Math.max(x.hi.rakete ?? 0, m) }; });
    const secs = Math.max(1, (performance.now() - s.t0) / 1000);
    if (s.idx > 20) recordRun('rakete', { wpm: Math.round((s.idx / 5 / (secs / 60)) * 10) / 10, raw: 0, acc: s.idx ? Math.round((1 - s.errs / (s.idx + s.errs)) * 100) : 100, secs, chars: s.idx, errs: s.errs, series: [] });
    winSound();
  }

  if (phase === 'start') {
    return (
      <div className="wu-screen">
        <button className="wu-back" onClick={onExit}>‹ Spiele</button>
        <h2 className="wu-title">Raketenstart</h2>
        <p className="wu-sub">Tippen füllt den Tank, der Motor verbrennt ihn. Je höher du kommst, desto gieriger wird die Rakete. Jeder Fehler kostet Treibstoff. Wie weit kommst du?</p>
        <div className="wu-panel"><div className="wu-field"><span>Texte</span><select value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
        <div className="wu-stats"><span>Rekord: {d.hi.rakete ?? 0} m</span></div>
        <button className="wu-go" onClick={start}>Countdown starten</button>
      </div>
    );
  }
  if (phase === 'over') {
    const m = Math.round(g.current.alt);
    return (
      <div className="wu-screen">
        <h2 className="wu-title">{fuel <= 0 ? 'Treibstoff leer!' : 'Landung'}</h2>
        <div className="wu-big">{m} m</div>
        <p className="wu-sub">{m >= (d.hi.rakete ?? 0) && m > 0 ? 'Neuer Rekord!' : `Rekord: ${d.hi.rakete ?? 0} m`}{MILESTONES.filter(([h]) => m >= h).slice(-1)[0] ? ` · Erreicht: ${MILESTONES.filter(([h]) => m >= h).slice(-1)[0][1]}` : ''}</p>
        <button className="wu-go" onClick={start}>Nochmal</button>
        <button className="wu-ghost" onClick={onExit}>Zu den Spielen</button>
      </div>
    );
  }
  const space = Math.min(1, alt / 2600);
  const stage = MILESTONES.filter(([h]) => alt >= h).slice(-1)[0];
  return (
    <div className="wu-screen">
      <div className="wu-bar"><button className="wu-back" onClick={() => setPhase('start')}>✕ Abbrechen</button><b>{stage ? stage[1] : 'Startrampe'}</b><span className="wu-lap">{Math.round(alt)} m</span></div>
      <div className="wu-sky" style={{ ['--space' as string]: space, ['--alt' as string]: `${alt * 0.9}px` }}>
        <div className="wu-stars" />
        <div className="wu-clouds" />
        <div className="wu-rocket" style={{ transform: `translateX(-50%) translateY(${Math.sin(alt / 18) * 3}px)` }}>
          <span className="wu-rocket-body">🚀</span>
          <span className="wu-fire" style={{ height: 14 + fuel * 0.5, opacity: fuel > 2 ? 1 : 0 }} />
        </div>
        <div className="wu-fuel"><Gauge value={fuel / 100} color={fuel > 35 ? '#ffb020' : '#ff4d57'} label="Treibstoff" /><small>Treibstoff</small></div>
      </div>
      <Pad title="Tippe, um zu tanken!">
        <TextRun
          key={attempt}
          text={text}
          mode="rakete"
          hideResult
          locked={fuel <= 0}
          onProgress={(p) => {
            const s = g.current;
            if (p.idx > s.idx) { s.fuel = Math.min(100, s.fuel + (p.idx - s.idx) * 2.4); s.alt += (p.idx - s.idx) * 3.2; }
            s.idx = p.idx;
            if (p.errs > s.errs) { s.fuel = Math.max(0, s.fuel - 7); beep(140, 0.15, 'square'); }
            s.errs = p.errs;
          }}
          onFinish={() => crash()}
          onRestart={start}
        />
      </Pad>
    </div>
  );
}
