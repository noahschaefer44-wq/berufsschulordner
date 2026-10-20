import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_TEXTS } from './corpus';
import { pick } from './gen';
import { beep, winSound } from './sound';
import { recordRun, update, useData } from './store';

/** Merk-Modus: Ein Satz wird kurz gezeigt, dann verschwindet er – tippe ihn aus dem Gedächtnis. Mit jeder Runde wird er länger und die Zeit kürzer. */
export default function Memory({ onExit }: { onExit: () => void }) {
  const d = useData();
  const [phase, setPhase] = useState<'start' | 'show' | 'type' | 'fb' | 'over'>('start');
  const [round, setRound] = useState(1);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [text, setText] = useState('');
  const [val, setVal] = useState('');
  const [acc, setAcc] = useState(0);
  const [left, setLeft] = useState(1);
  const area = useRef<HTMLInputElement>(null);
  const stats = useRef({ chars: 0, t0: 0 });

  const showMs = useMemo(() => Math.max(1700, text.length * Math.max(38, 85 - round * 5)), [text, round]);

  function nextText(r: number) {
    const want = 60 + r * 14;
    const cands = ALL_TEXTS.filter((t) => t.length <= want + 40 && t.length >= Math.max(20, want - 40));
    setText(pick(cands.length ? cands : ALL_TEXTS.filter((t) => t.length < 200)));
    setVal(''); setLeft(1); setPhase('show');
  }
  function start() { setRound(1); setLives(3); setScore(0); stats.current = { chars: 0, t0: performance.now() }; nextText(1); beep(523); }

  useEffect(() => {
    if (phase !== 'show') return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const f = 1 - (performance.now() - t0) / showMs;
      setLeft(Math.max(0, f));
      if (f <= 0) { clearInterval(id); setPhase('type'); }
    }, 50);
    return () => clearInterval(id);
  }, [phase, showMs, text]);
  useEffect(() => { if (phase === 'type') area.current?.focus(); }, [phase]);

  function submit() {
    const got = val.trim();
    let same = 0;
    for (let i = 0; i < Math.min(got.length, text.length); i++) if (got[i] === text[i]) same++;
    const a = Math.round((same / Math.max(text.length, got.length, 1)) * 100);
    setAcc(a);
    stats.current.chars += same;
    if (a >= 80) { setScore((sc) => sc + Math.round(text.length * (a / 100))); beep(784, 0.2); } else { setLives((l) => l - 1); beep(150, 0.3, 'square'); }
    setPhase('fb');
  }
  function after() {
    if (acc < 80 && lives <= 0) {
      setPhase('over');
      update((x) => { x.hi = { ...x.hi, merk: Math.max(x.hi.merk ?? 0, round) }; });
      const secs = Math.max(1, (performance.now() - stats.current.t0) / 1000);
      if (stats.current.chars > 20) recordRun('merk', { wpm: Math.round((stats.current.chars / 5 / (secs / 60)) * 10) / 10, raw: 0, acc, secs, chars: stats.current.chars, errs: 0, series: [] });
      winSound();
      return;
    }
    const r = round + 1;
    setRound(r); nextText(r);
  }

  if (phase === 'start') {
    return (
      <div className="wu-screen">
        <button className="wu-back" onClick={onExit}>‹ Spiele</button>
        <h2 className="wu-title">Merk-Modus</h2>
        <p className="wu-sub">Ein Satz erscheint nur kurz. Präge ihn dir ein und tippe ihn danach aus dem Gedächtnis. Ab 80 % Übereinstimmung geht es weiter, sonst verlierst du ein Leben. Die Sätze werden länger und die Zeit kürzer.</p>
        <div className="wu-stats"><span>Bestes: Runde {d.hi.merk ?? 0}</span></div>
        <button className="wu-go" onClick={start}>Los</button>
      </div>
    );
  }
  if (phase === 'over') {
    return (
      <div className="wu-screen">
        <h2 className="wu-title">Gedächtnis voll!</h2>
        <div className="wu-big">Runde {round}</div>
        <p className="wu-sub">{score} Punkte · Bestes: Runde {Math.max(d.hi.merk ?? 0, round)}</p>
        <button className="wu-go" onClick={start}>Nochmal</button>
        <button className="wu-ghost" onClick={onExit}>Zu den Spielen</button>
      </div>
    );
  }
  return (
    <div className="wu-screen">
      <div className="wu-bar"><button className="wu-back" onClick={() => setPhase('start')}>✕ Beenden</button><b>Runde {round}</b><span className="wu-lap">{'♥'.repeat(Math.max(0, lives))} · {score}</span></div>
      {phase === 'show' && (
        <div className="wu-memcard">
          <p>{text}</p>
          <div className="wu-timer"><i style={{ width: `${left * 100}%` }} /></div>
          <small>Merk dir den Satz!</small>
        </div>
      )}
      {phase === 'type' && (
        <div className="wu-memcard">
          <small>Was stand da? Tippe es aus dem Gedächtnis und drücke Enter.</small>
          <input ref={area} className="wu-input" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} autoComplete="off" spellCheck={false} />
          <button className="wu-go" onClick={submit}>Prüfen ↵</button>
        </div>
      )}
      {phase === 'fb' && (
        <div className="wu-memcard">
          <div className="wu-big">{acc} %</div>
          <p className="wu-orig">{text}</p>
          <p className="wu-yours">{val || '(nichts getippt)'}</p>
          <button className="wu-go" onClick={after} autoFocus>{acc < 80 && lives <= 0 ? 'Ergebnis' : 'Weiter ↵'}</button>
        </div>
      )}
    </div>
  );
}
