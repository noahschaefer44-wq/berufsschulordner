import { useEffect, useMemo, useRef, useState } from 'react';
import { askEstimate } from './aiClient';
import type { GSettings, SavedGame } from './data';
import GoBoard from './GoBoard';
import { BLACK, DEFAULT_RULES, type GoState, WHITE, coord, newState, parseSgf, play, setStones } from './engine';
import type { Mv } from './types';
import { useKeys } from '../shared/hooks';
import { download } from './GoPlay';

export interface Replay { n: number; komi: number; handicap: number[]; moves: Mv[]; states: GoState[]; skipped: number }

/** Spielt SGF-Züge nach; unmögliche Züge werden übersprungen und gezählt. */
export function buildReplay(sgf: string, scoring: 'flaeche' | 'gebiet' = 'gebiet'): Replay | null {
  const p = parseSgf(sgf);
  if (!p) return null;
  const rules = { ...DEFAULT_RULES, n: p.n, komi: p.komi, scoring };
  let s = newState(rules);
  if (p.handicap.length) s = setStones(s, p.handicap, [], WHITE);
  const states = [s];
  const moves: Mv[] = [];
  let skipped = 0;
  for (const m of p.moves) {
    const r = play(s, m.idx, m.color);
    if (!r.ok) { skipped++; continue; }
    s = r.state; states.push(s); moves.push(m);
  }
  return { n: p.n, komi: p.komi, handicap: p.handicap, moves, states, skipped };
}

export function ReviewView({ S, sgf, title, onBack, onContinue }: { S: GSettings; sgf: string; title: string; onBack: () => void; onContinue: (r: Replay, at: number) => void }) {
  const rep = useMemo(() => buildReplay(sgf, S.scoring), [sgf, S.scoring]);
  const [at, setAt] = useState(rep ? rep.states.length - 1 : 0);
  const [est, setEst] = useState<{ own: Float32Array; winrate: number; lead: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const tok = useRef(0);
  useEffect(() => { if (rep) setAt(rep.states.length - 1); }, [rep]);
  const cur = rep?.states[at];

  useEffect(() => {
    setEst(null);
    if (!auto || !cur) return;
    const t = ++tok.current;
    askEstimate(cur, cur.rules.n >= 13 ? 160 : 300).then((e) => { if (t === tok.current) setEst({ own: e.own, winrate: e.winrate, lead: e.lead }); });
  }, [auto, at, cur]);

  useKeys((e) => {
    if (!rep) return;
    if (e.key === 'ArrowLeft') setAt((a) => Math.max(0, a - 1));
    else if (e.key === 'ArrowRight') setAt((a) => Math.min(rep.states.length - 1, a + 1));
    else if (e.key === 'Home') setAt(0);
    else if (e.key === 'End') setAt(rep.states.length - 1);
  }, [rep]);

  if (!rep || !cur) return <div className="go-sub-view"><header className="go-subhead"><button onClick={onBack}>← Zurück</button><h2>{title}</h2></header><p>Diese SGF-Datei kann nicht gelesen werden.</p></div>;
  const mv = at > 0 ? rep.moves[at - 1] : null;
  const wr = est ? Math.round(est.winrate * 100) : null;
  return (
    <div className="go-sub-view">
      <header className="go-subhead"><button onClick={onBack}>← Zurück</button><h2>{title}</h2><span>{rep.n}×{rep.n} · {rep.moves.length} Züge{rep.skipped ? ` · ${rep.skipped} übersprungen` : ''}</span></header>
      <div className="go-stage">
        <div className="go-boardwrap"><GoBoard n={rep.n} board={cur.board} theme={S.board} stones={S.stones} coords={S.coords} last={cur.last} ko={-1} own={est?.own} /></div>
        <aside className="go-panel">
          <div className="go-info"><span>Zug {at} / {rep.states.length - 1}</span><span>{mv ? `${mv.color === BLACK ? 'Schwarz' : 'Weiß'} ${mv.idx < 0 ? 'passt' : coord(rep.n, mv.idx)}` : 'Grundstellung'}</span></div>
          <input type="range" min={0} max={rep.states.length - 1} value={at} onChange={(e) => setAt(+e.target.value)} aria-label="Zug" className="go-slider" />
          <div className="go-actions">
            <button onClick={() => setAt(0)}>⏮</button><button onClick={() => setAt(Math.max(0, at - 1))}>◀</button><button onClick={() => setAt(Math.min(rep.states.length - 1, at + 1))}>▶</button><button onClick={() => setAt(rep.states.length - 1)}>⏭</button>
          </div>
          <div className="go-info"><span>Gefangen: ● {cur.caps[0]} · ○ {cur.caps[1]}</span></div>
          <label className="go-check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Gebietsschätzung zeigen</label>
          {wr !== null && <div className="go-wr"><div style={{ width: `${wr}%` }} /><span>Schwarz {wr}% · {est!.lead > 0 ? 'Schwarz' : 'Weiß'} +{Math.abs(est!.lead).toFixed(1)}</span></div>}
          <div className="go-actions">
            <button className="primary" onClick={() => onContinue(rep, at)}>Ab hier weiterspielen</button>
            <button onClick={() => download('partie.sgf', sgf)}>SGF laden</button>
          </div>
          <p className="go-sub">Pfeiltasten blättern, Pos1/Ende springen.</p>
        </aside>
      </div>
    </div>
  );
}

export function Archive({ S, games, onOpen, onDelete, onImport, onBack }: { S: GSettings; games: SavedGame[]; onOpen: (g: SavedGame) => void; onDelete: (id: string) => void; onImport: (sgf: string) => void; onBack: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  void S;
  const imp = (t: string) => {
    if (!parseSgf(t)) { setErr('Das ist keine lesbare SGF-Datei (Größe 5–25).'); return; }
    setErr(''); setText(''); onImport(t);
  };
  return (
    <div className="go-sub-view">
      <header className="go-subhead"><button onClick={onBack}>← Menü</button><h2>Archiv</h2><span>{games.length} Partien</span></header>
      <div className="go-archive">
        <section>
          <h3>Partien</h3>
          {games.length === 0 && <p className="go-sub">Noch nichts gespeichert. Beendete Partien erscheinen hier automatisch.</p>}
          <ul>
            {games.map((g) => (
              <li key={g.id}>
                <button onClick={() => onOpen(g)}><b>{g.mode} · {g.n}×{g.n}</b><span>{g.result}</span><small>{g.date} · {g.moves} Züge</small></button>
                <button className="x" aria-label="Löschen" onClick={() => onDelete(g.id)}>×</button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>SGF laden</h3>
          <p className="go-sub">Füge eine Partie im SGF-Format ein oder wähle eine Datei – sie bleibt auf diesem Gerät.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="(;GM[1]SZ[9];B[ee];W[ce])" rows={5} spellCheck={false} />
          <div className="go-actions">
            <button className="primary" disabled={!text.trim()} onClick={() => imp(text)}>Ansehen</button>
            <button onClick={() => fileRef.current?.click()}>Datei wählen …</button>
            <input ref={fileRef} type="file" accept=".sgf,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) imp(await f.text()); e.target.value = ''; }} />
          </div>
          {err && <p className="go-msg bad">{err}</p>}
        </section>
      </div>
    </div>
  );
}
