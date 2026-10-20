import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtTimeMs } from '../shared/store';
import { type Board, FLAG, boardFromMines, chord, finishWin, isWon, reveal, toggleFlag } from './engine';
import type { Replay } from './data';
import MineCanvas, { type Skin } from './MineCanvas';

/** Baut das Brett eines Replays bis zum Zeitpunkt t (ms) nach. */
export function boardAt(r: Replay, t: number): Board {
  const b = boardFromMines(r.cfg, r.mines);
  let lives = r.mode === 'leben' ? 3 : 0;
  const hit = (idx: number) => {
    if (lives > 0) { b.st[idx] = FLAG; b.flags++; b.boom = -1; lives--; if (lives <= 0) { b.status = 'lost'; b.boom = idx; } return; }
    b.status = 'lost'; b.boom = idx;
  };
  for (const [et, code, idx] of r.ev) {
    if (et > t) break;
    if (b.status !== 'play') break;
    if (code === 0) { const x = reveal(b, idx); if (x.boom) hit(idx); }
    else if (code === 1 || code === 3) toggleFlag(b, idx, code === 3);
    else if (code === 2) { const c = chord(b, idx); for (const m of c.boom) if (b.status === 'play') hit(m); }
    if (b.status === 'play' && isWon(b)) finishWin(b);
  }
  return b;
}

export default function ReplayView({ replay, skin, size, onClose }: { replay: Replay; skin: Skin; size: number; onClose: () => void }) {
  const total = Math.max(replay.time, replay.ev.length ? replay.ev[replay.ev.length - 1][0] : 0) + 600;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const last = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      setT((x) => Math.min(total, x + (now - last.current) * speed));
      last.current = now;
    }, 50);
    return () => clearInterval(id);
  }, [playing, speed, total]);
  useEffect(() => { if (t >= total) setPlaying(false); }, [t, total]);
  const b = useMemo(() => boardAt(replay, t), [replay, t]);
  const flags = useMemo(() => { let f = 0; for (let i = 0; i < b.n; i++) if (b.st[i] === FLAG) f++; return f; }, [b]);
  const cell = Math.max(14, Math.min(size, Math.floor(720 / (replay.cfg.w + 0.5))));
  const overlay = useMemo(() => ({}), []);
  const noop = () => {};
  return (
    <div className="mn-replay">
      <div className="mn-replay-bar">
        <button className="mn-btn" onClick={() => { setT(0); setPlaying(true); }}>⟲ Neu</button>
        <button className="mn-btn" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚ Pause' : '▶ Weiter'}</button>
        {[0.5, 1, 2, 4].map((s) => <button key={s} className={'mn-btn' + (speed === s ? ' on' : '')} onClick={() => setSpeed(s)}>{s}×</button>)}
        <span className="mn-replay-time">{fmtTimeMs(t)} / {fmtTimeMs(total)}</span>
        <span>🚩 {flags}</span>
        <button className="mn-btn" onClick={onClose}>Schließen</button>
      </div>
      <input type="range" className="mn-scrub" min={0} max={total} value={t} aria-label="Zeitpunkt" onChange={(e) => { setPlaying(false); setT(+e.target.value); }} />
      <div className="mn-board-wrap">
        <MineCanvas b={b} version={Math.floor(t)} size={cell} skin={skin} overlay={overlay} onDown={noop} onUp={noop} onMove={noop} onLeave={noop} />
      </div>
    </div>
  );
}
