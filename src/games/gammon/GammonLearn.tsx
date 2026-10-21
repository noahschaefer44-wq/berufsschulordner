import { useEffect, useMemo, useRef, useState } from 'react';
import { askJudge, askPuzzle } from './aiClient';
import BoardView from './BoardView';
import type { MSaved, MSettings } from './data';
import { type BG, type Mv, type Side, applyMv, notate, posKey, rollDice, startPosition } from './engine';
import { LESSONS, type Lesson } from './lessons';
import { OPENINGS, bookKey } from './openings';
import { GRADE_TEXT, type Puzzle, gradeLoss } from './puzzles';
import { type Turn, hasNoMove, isComplete, newTurn, undoStep } from './turn';
import { useTurnControl } from './useTurnControl';
import { sfx } from '../shared/sfx';
import { freshSeed } from '../shared/rng';

/** Ein Wurf zum Selbstspielen auf dem Brett. Meldet das fertige Zug-Objekt. */
export function PlayTurn({ pos, p, dice, S, onDone, resetKey, hintMoves, frozen }: { pos: BG; p: Side; dice: [number, number]; S: MSettings; onDone: (t: Turn) => void; resetKey: string | number; hintMoves?: Mv[] | null; frozen?: boolean }) {
  const [turn, setTurn] = useState<Turn>(() => newTurn(pos, p, dice));
  const done = useRef(false);
  useEffect(() => { setTurn(newTurn(pos, p, dice)); done.current = false; }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctrl = useTurnControl(turn, setTurn, !frozen && !done.current, (m) => sfx(m.hit ? 'pop' : m.to === 0 ? 'good' : 'place'));
  useEffect(() => {
    if (done.current || frozen) return;
    if (isComplete(turn) || hasNoMove(turn)) { done.current = true; const id = setTimeout(() => onDone(turn), 350); return () => clearTimeout(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.key === 'u' || e.key === 'U') && !done.current) setTurn((t) => undoStep(t)); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  return (
    <div className="gm-boardwrap small">
      <BoardView s={turn.cur} viewer={p} selected={ctrl.selected} targets={ctrl.targets} dice={[...dice]} usedDice={turn.played.map((m) => m.die)} turn={p} cube={{ v: 1, owner: -1 }} hintMoves={hintMoves} pipLabels={S.pipLabels} mirror={S.mirror} onPoint={ctrl.onPoint} onDouble={ctrl.onDouble} />
    </div>
  );
}

// ───────── Lektionen ─────────

export function LessonView({ S, done, onDone, onBack }: { S: MSettings; done: Record<string, boolean>; onDone: (id: string) => void; onBack: () => void }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [step, setStep] = useState(0);
  const [ok, setOk] = useState(false);
  const [fail, setFail] = useState('');
  const [tries, setTries] = useState(0);
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState(false);
  const go = (l: Lesson, s: number) => { setLesson(l); setStep(s); setOk(false); setFail(''); setTries(0); setAnswer(''); setHint(false); };

  if (!lesson) {
    return (
      <div className="gm-sub-view">
        <header className="gm-subhead"><button onClick={onBack}>← Menü</button><h2>Lernen</h2><span>{Object.values(done).filter(Boolean).length} / {LESSONS.length} Lektionen</span></header>
        <ol className="gm-lessons">
          {LESSONS.map((l, i) => <li key={l.id}><button className={`gm-card ${done[l.id] ? 'done' : ''}`} onClick={() => go(l, 0)}><i>{i + 1}</i><b>{l.title}</b><span>{l.summary}</span>{done[l.id] && <em>✓</em>}</button></li>)}
        </ol>
      </div>
    );
  }
  const st = lesson.steps[step];
  const last = step === lesson.steps.length - 1;
  const next = () => {
    if (last) { onDone(lesson.id); const i = LESSONS.indexOf(lesson); if (i + 1 < LESSONS.length) go(LESSONS[i + 1], 0); else setLesson(null); }
    else go(lesson, step + 1);
  };
  const noop = () => undefined;
  const need = st.t === 'task' || st.t === 'quiz';
  return (
    <div className="gm-sub-view">
      <header className="gm-subhead"><button onClick={() => setLesson(null)}>← Lektionen</button><h2>{lesson.title}</h2><span>Schritt {step + 1} / {lesson.steps.length}</span></header>
      <div className="gm-lesson">
        {st.t === 'text' && (
          <div className="gm-textstep">
            {st.show && <div className="gm-boardwrap small"><BoardView s={st.show} viewer={0} selected={null} targets={[]} dice={[]} usedDice={[]} turn={0} cube={{ v: 1, owner: -1 }} pipLabels={S.pipLabels} mirror={false} onPoint={noop} /></div>}
            <div>{st.title && <h3>{st.title}</h3>}<p>{st.text}</p></div>
          </div>
        )}
        {st.t === 'task' && (
          <div className="gm-task">
            <div className="gm-ptext"><h3>{st.title}</h3><p>{st.text}</p>
              {fail && <p className="gm-msg bad">{fail}</p>}
              {ok && <p className="gm-msg ok">Richtig!</p>}
              {hint && <p className="gm-msg">{st.hint}</p>}
              <div className="gm-actions">{!ok && <button onClick={() => setHint(true)}>Tipp</button>}{fail && !ok && <button className="primary" onClick={() => { setFail(''); setTries((t) => t + 1); }}>Nochmal</button>}</div>
            </div>
            <PlayTurn pos={st.pos} p={0} dice={st.dice} S={S} resetKey={`${lesson.id}-${step}-${tries}`} frozen={ok || !!fail} onDone={(t) => { if (st.goal(t.cur, t.played)) { setOk(true); sfx('good'); } else { setFail(st.fail); sfx('bad'); } }} />
          </div>
        )}
        {st.t === 'quiz' && (
          <div className="gm-task">
            <div className="gm-ptext"><h3>{st.title}</h3><p>{st.text}</p>
              <div className="gm-actions"><input inputMode="numeric" aria-label="Antwort" value={answer} onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click(); }} /><button className="primary" onClick={() => { if (+answer === st.answer(st.pos)) { setOk(true); setFail(''); sfx('good'); } else { setFail(`Nicht ganz. Richtig wäre ${st.answer(st.pos)}.`); sfx('bad'); } }}>Prüfen</button></div>
              {fail && <p className="gm-msg bad">{fail}</p>}{ok && <p className="gm-msg ok">Richtig!</p>}
            </div>
            <div className="gm-boardwrap small"><BoardView s={st.pos} viewer={0} selected={null} targets={[]} dice={[]} usedDice={[]} turn={0} cube={{ v: 1, owner: -1 }} pipLabels mirror={false} onPoint={noop} /></div>
          </div>
        )}
        <div className="gm-lessonnav">
          <button onClick={() => (step ? go(lesson, step - 1) : setLesson(null))}>← Zurück</button>
          <span className="gm-dots">{lesson.steps.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />)}</span>
          <button className="primary" disabled={need && !ok && !fail} onClick={next}>{last ? 'Abschließen' : 'Weiter →'}</button>
        </div>
      </div>
    </div>
  );
}

// ───────── Eröffnungstrainer ─────────

export function OpeningTrainer({ S, counts, onResult, onBack }: { S: MSettings; counts: Record<string, number>; onResult: (roll: string) => void; onBack: () => void }) {
  const [roll, setRoll] = useState<[number, number]>(() => OPENINGS[Math.floor(Math.random() * OPENINGS.length)].roll);
  const [round, setRound] = useState(0);
  const [res, setRes] = useState<null | { kind: 'best' | 'alt' | 'off'; text: string }>(null);
  const op = OPENINGS.find((o) => o.roll[0] === roll[0] && o.roll[1] === roll[1])!;
  const start = useMemo(() => startPosition(), []);
  const key = `${roll[0]}${roll[1]}`;
  const know = OPENINGS.filter((o) => counts[`${o.roll[0]}${o.roll[1]}`]).length;
  const pickRoll = (r: [number, number]) => { setRoll(r); setRes(null); setRound((x) => x + 1); };

  return (
    <div className="gm-sub-view">
      <header className="gm-subhead"><button onClick={onBack}>← Menü</button><h2>Eröffnungsbuch</h2><span>{know} / 21 gekonnt</span></header>
      <div className="gm-task">
        <div className="gm-ptext">
          <h3>Wurf {roll[0]}-{roll[1]}</h3>
          <p>Spiele den besten Eröffnungszug für diesen Wurf. Wähle einen Wurf direkt:</p>
          <div className="gm-rolls">{OPENINGS.map((o) => <button key={`${o.roll}`} className={`${counts[`${o.roll[0]}${o.roll[1]}`] ? 'known' : ''} ${o.roll[0] === roll[0] && o.roll[1] === roll[1] ? 'on' : ''}`} onClick={() => pickRoll(o.roll)}>{o.roll[0]}{o.roll[1]}</button>)}</div>
          {res && (
            <div className={`gm-msg ${res.kind === 'off' ? 'bad' : 'ok'}`}>
              <b>{res.kind === 'best' ? 'Buchzug!' : res.kind === 'alt' ? 'Auch gut – eine gängige Alternative.' : 'Das Buch empfiehlt etwas anderes.'}</b>
              <p>{res.text}</p>
            </div>
          )}
          <div className="gm-actions">
            {res && <button className="primary" onClick={() => pickRoll(OPENINGS[Math.floor(Math.random() * OPENINGS.length)].roll)}>Nächster Wurf</button>}
            {res && <button onClick={() => { setRes(null); setRound((x) => x + 1); }}>Nochmal</button>}
            {!res && <button onClick={() => setRes({ kind: 'off', text: `Buchzug: ${op.best}${op.alts.length ? ` (auch: ${op.alts.join(' / ')})` : ''}. ${op.note}` })}>Lösung zeigen</button>}
          </div>
        </div>
        <PlayTurn pos={start} p={0} dice={roll} S={S} resetKey={`${key}-${round}`} frozen={!!res} onDone={(t) => {
          const k = posKey({ ...t.cur, turn: 0 });
          if (k === bookKey(op.best)) { setRes({ kind: 'best', text: `${op.best}. ${op.note}` }); onResult(key); sfx('good'); }
          else if (op.alts.some((a) => bookKey(a) === k)) { setRes({ kind: 'alt', text: `Erste Wahl: ${op.best}. ${op.note}` }); onResult(key); sfx('good'); }
          else { setRes({ kind: 'off', text: `Du hast ${notate(t.played)} gespielt. Buch: ${op.best}${op.alts.length ? ` (auch: ${op.alts.join(' / ')})` : ''}. ${op.note}` }); sfx('bad'); }
        }} />
      </div>
    </div>
  );
}

// ───────── Zug-Rätsel ─────────

export function PuzzleView({ S, seedStart, daily, solved, streak, best, onResult, onBack }: { S: MSettings; seedStart: number; daily?: boolean; solved: number; streak: number; best: number; onResult: (ok: boolean, first: boolean) => void; onBack: () => void }) {
  const [seed, setSeed] = useState(seedStart);
  const [pz, setPz] = useState<Puzzle | null | undefined>(undefined);
  const [res, setRes] = useState<null | { loss: number; played: string; top: { text: string; p: number }[] }>(null);
  const [show, setShow] = useState(false);
  const [round, setRound] = useState(0);
  const counted = useRef(false);
  useEffect(() => {
    let live = true;
    setPz(undefined); setRes(null); setShow(false); counted.current = false;
    askPuzzle(seed).then((p) => { if (live) setPz(p); });
    return () => { live = false; };
  }, [seed]);

  return (
    <div className="gm-sub-view">
      <header className="gm-subhead"><button onClick={onBack}>← Menü</button><h2>{daily ? 'Rätsel des Tages' : 'Zug-Rätsel'}</h2><span>{solved} gelöst · Serie {streak} (Rekord {best})</span></header>
      {pz === undefined && <p className="gm-sub">Die KI sucht eine Stellung …</p>}
      {pz === null && <p>Keine Stellung gefunden. <button onClick={() => setSeed((x) => x + 1)}>Nochmal</button></p>}
      {pz && (
        <div className="gm-task">
          <div className="gm-ptext">
            <h3>Finde den besten Zug</h3>
            <p>{pz.p === 0 ? 'Weiß' : 'Schwarz'} würfelt <b>{pz.dice[0]}-{pz.dice[1]}</b>. Welcher Zug gibt die beste Siegchance? Die Bewertung stammt aus einer Ein-Zug-Vorausschau der KI.</p>
            {res && (
              <div className={`gm-msg ${res.loss < 0.015 ? 'ok' : 'bad'}`}>
                <b>{GRADE_TEXT[gradeLoss(res.loss)]}{res.loss >= 0.001 ? ` – Verlust ${(res.loss * 100).toFixed(1)} %` : ''}</b>
                <p>Dein Zug: {res.played}</p>
                <ol className="gm-toplist">{res.top.map((t, i) => <li key={i} className={t.text === pz.best ? 'best' : ''}><span>{t.text}</span><em>{(t.p * 100).toFixed(1)} %</em></li>)}</ol>
              </div>
            )}
            <div className="gm-actions">
              {!res && <button onClick={() => setShow(true)}>Lösung zeigen</button>}
              {res && <button className="primary" onClick={() => { setSeed(daily ? seed + 1 : freshSeed() % 100000); }}>{daily ? 'Weiteres Rätsel' : 'Nächstes Rätsel'}</button>}
              {res && <button onClick={() => { setRes(null); setRound((x) => x + 1); }}>Nochmal</button>}
            </div>
            {show && !res && <p className="gm-msg">Bester Zug: <b>{pz.best}</b></p>}
          </div>
          <PlayTurn pos={pz.s} p={pz.p} dice={pz.dice} S={S} resetKey={`${pz.id}-${round}`} frozen={!!res} hintMoves={show || res ? pz.bestMoves : null} onDone={(t) => {
            const found = pz.top.find((x) => x.text === notate(t.played));
            const finish = (loss: number) => {
              setRes({ loss, played: t.played.length ? notate(t.played) : 'kein Zug', top: pz.top });
              const ok = loss < 0.015;
              sfx(ok ? 'good' : 'bad');
              if (!counted.current) { counted.current = true; onResult(ok, !show); }
            };
            if (found) finish(Math.max(0, pz.bestP - found.p));
            else askJudge(pz.s, pz.p, pz.dice, { moves: t.played, end: t.cur }).then((j) => finish(j.loss));
          }} />
        </div>
      )}
    </div>
  );
}

// ───────── Nachspielen ─────────

export function ReplayView({ saved, S, onBack }: { saved: MSaved; S: MSettings; onBack: () => void }) {
  const frames = useMemo(() => {
    const out: { s: BG; last: { p: Side; moves: Mv[] } | null; label: string; loss?: number }[] = [{ s: startPosition(saved.variant), last: null, label: 'Grundstellung' }];
    let s = startPosition(saved.variant);
    for (const e of saved.entries) {
      if (e.kind === 'zug' && e.mv) {
        const moves: Mv[] = e.mv.map((m) => ({ from: m[0], to: m[1], die: m[2], hit: m[3] === 1 }));
        for (const m of moves) s = applyMv(s, e.p, m);
        out.push({ s, last: { p: e.p, moves }, label: `${e.p === 0 ? 'Weiß' : 'Schwarz'} ${e.dice ? `${e.dice[0]}${e.dice[1]}` : ''}: ${e.moves}`, loss: e.loss });
      } else out.push({ s, last: null, label: `${e.p === 0 ? 'Weiß' : 'Schwarz'} ${e.kind === 'doppeln' ? 'verdoppelt' : e.kind === 'annehmen' ? 'nimmt an' : 'passt'}` });
    }
    return out;
  }, [saved]);
  const [at, setAt] = useState(frames.length - 1);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setAt((a) => Math.max(0, a - 1)); else if (e.key === 'ArrowRight') setAt((a) => Math.min(frames.length - 1, a + 1)); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [frames.length]);
  const f = frames[at];
  return (
    <div className="gm-sub-view">
      <header className="gm-subhead"><button onClick={onBack}>← Archiv</button><h2>Partie nachspielen</h2><span>{saved.mode} · {saved.date}</span></header>
      <div className="gm-stage">
        <div className="gm-boardwrap"><BoardView s={f.s} viewer={0} selected={null} targets={[]} dice={[]} usedDice={[]} turn={0} cube={{ v: 1, owner: -1 }} lastMoves={f.last} pipLabels={S.pipLabels} mirror={S.mirror} onPoint={() => undefined} /></div>
        <aside className="gm-panel">
          <div className="gm-info"><span>Zug {at} / {frames.length - 1}</span></div>
          <p className="gm-msg">{f.label}{f.loss !== undefined && f.loss >= 0.025 ? ` (−${(f.loss * 100).toFixed(1)} %)` : ''}</p>
          <input type="range" min={0} max={frames.length - 1} value={at} onChange={(e) => setAt(+e.target.value)} className="gm-slider" aria-label="Zug" />
          <div className="gm-actions"><button onClick={() => setAt(0)}>⏮</button><button onClick={() => setAt(Math.max(0, at - 1))}>◀</button><button onClick={() => setAt(Math.min(frames.length - 1, at + 1))}>▶</button><button onClick={() => setAt(frames.length - 1)}>⏭</button></div>
          <p className="gm-sub">{saved.result}</p>
        </aside>
      </div>
    </div>
  );
}

export const randomRoll = () => rollDice(Math.random);
