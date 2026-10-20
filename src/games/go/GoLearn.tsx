import { useEffect, useMemo, useRef, useState } from 'react';
import type { GSettings } from './data';
import GoBoard, { type Mark } from './GoBoard';
import { BLACK, DEFAULT_RULES, type Color, type GoState, WHITE, newState, play } from './engine';
import { LESSONS, type Lesson, resolveTask, type Step } from './lessons';
import { type Problem, correctMoves, genProblem, problemState, replyMove } from './problems';
import { sfx } from '../shared/sfx';
import { useKeys } from '../shared/hooks';

/** Eine Aufgabe zum Selbstlösen (Fangen/Retten). */
export function ProblemPlayer({ problem, S, onSolved, onNext, solvedBefore, nextLabel = 'Weiter' }: { problem: Problem; S: GSettings; onSolved: (clean: boolean) => void; onNext?: () => void; solvedBefore?: boolean; nextLabel?: string }) {
  const init = useMemo(() => problemState(problem), [problem]);
  const [st, setSt] = useState<GoState>(init.state);
  const [depth, setDepth] = useState(problem.depth);
  const [status, setStatus] = useState<'ask' | 'wrong' | 'solved'>('ask');
  const [fails, setFails] = useState(0);
  const [shown, setShown] = useState<number[]>([]);
  const [last, setLast] = useState(-1);
  const [msg, setMsg] = useState('');
  const doneCb = useRef(onSolved);
  doneCb.current = onSolved;

  const n = problem.n;
  const reset = () => { setSt(init.state); setDepth(problem.depth); setStatus('ask'); setShown([]); setLast(-1); setMsg(''); };
  useEffect(() => { reset(); setFails(0); }, [problem]); // eslint-disable-line react-hooks/exhaustive-deps

  const marks = useMemo(() => {
    const m: Record<number, Mark> = {};
    m[init.anchor] = st.board[init.anchor] ? 'tri' : 'x';
    for (const i of shown) m[i] = 'hint';
    return m;
  }, [init.anchor, st, shown]);

  const click = (i: number) => {
    if (status !== 'ask' || st.board[i]) return;
    const r = play(st, i);
    if (!r.ok) { setMsg(r.reason); sfx('bad'); return; }
    const sols = correctMoves(problem, st, init.anchor, depth);
    const good = sols.includes(i);
    sfx(r.captured.length ? 'pop' : 'place');
    setLast(i);
    if (!good) {
      // Widerlegung zeigen
      const ref = replyMove(problem, r.state, init.anchor, problem.kind === 'capture' ? depth - 1 : depth);
      let s2 = r.state;
      if (ref >= 0) { const q = play(r.state, ref); if (q.ok) { s2 = q.state; setLast(ref); } }
      setSt(s2); setStatus('wrong'); setFails((f) => f + 1);
      setMsg(problem.kind === 'capture' ? 'Das reicht nicht – die Gruppe entkommt.' : 'Das rettet die Gruppe nicht.');
      sfx('bad');
      return;
    }
    if (problem.kind === 'capture') {
      if (!r.state.board[init.anchor]) { setSt(r.state); finish(); return; }
      // Gegner antwortet
      const rep = replyMove(problem, r.state, init.anchor, depth - 1);
      setSt(r.state);
      setDepth(depth - 1);
      if (rep >= 0) {
        setTimeout(() => {
          const q = play(r.state, rep);
          if (q.ok) { setSt(q.state); setLast(rep); sfx('place'); }
        }, 360);
      }
      setMsg('Richtig – weiter!');
    } else {
      setSt(r.state);
      const rep = replyMove(problem, r.state, init.anchor, depth);
      if (rep >= 0) setTimeout(() => { const q = play(r.state, rep); if (q.ok) { setSt(q.state); setLast(rep); } }, 360);
      finish();
    }
  };
  const finish = () => { setStatus('solved'); setMsg('Gelöst!'); sfx('good'); doneCb.current(fails === 0); };
  const solution = () => { setShown(correctMoves(problem, st, init.anchor, depth)); setFails((f) => f + 1); };

  useKeys((e) => { if (e.key === 'r' || e.key === 'R') reset(); }, [problem, status]);

  return (
    <div className="go-problem">
      <div className="go-boardwrap small">
        <GoBoard n={n} board={st.board} theme={S.board} stones={S.stones} coords={S.coords} last={last} ko={st.ko} ghost={status === 'ask' ? st.turn : 0} marks={marks} onPlay={click} isLegal={(i) => play(st, i).ok} />
      </div>
      <div className="go-ptext">
        <h3>{problem.title}</h3>
        <p>{problem.text}</p>
        <p className="go-sub">{problem.kind === 'capture' ? `${st.turn === BLACK ? 'Schwarz' : 'Weiß'} am Zug · höchstens ${depth} Zug${depth === 1 ? '' : 'e'} bis zum Fang` : `${st.turn === BLACK ? 'Schwarz' : 'Weiß'} am Zug – rette die markierte Gruppe`}</p>
        {msg && <p className={`go-msg ${status === 'solved' ? 'ok' : status === 'wrong' ? 'bad' : ''}`} role="status">{msg}</p>}
        {st.ko >= 0 && status === 'ask' && <p className="go-sub">Ko-Regel: Der markierte Punkt ist gesperrt.</p>}
        <div className="go-actions">
          {status === 'wrong' && <button className="primary" onClick={reset}>Nochmal <kbd>R</kbd></button>}
          {status === 'ask' && <button onClick={reset}>Zurücksetzen <kbd>R</kbd></button>}
          {status !== 'solved' && <button onClick={solution}>Lösung zeigen</button>}
          {status === 'solved' && onNext && <button className="primary" onClick={onNext}>{nextLabel}</button>}
        </div>
        {solvedBefore && <small className="go-sub">Schon einmal gelöst.</small>}
      </div>
    </div>
  );
}

// ───────── Aufgaben-Hub ─────────

type Kind = 'capture1' | 'capture2' | 'capture3' | 'save' | 'mix';
const KINDS: { id: Kind; name: string; info: string }[] = [
  { id: 'capture1', name: 'Fangen – 1 Zug', info: 'Der Stein oder die Gruppe ist in Atari.' },
  { id: 'capture2', name: 'Fangen – 2 Züge', info: 'Zwei Freiheiten: Finde das Netz.' },
  { id: 'capture3', name: 'Fangen – 3 Züge', info: 'Tiefer rechnen.' },
  { id: 'save', name: 'Retten', info: 'Befreie die Gruppe aus dem Atari.' },
  { id: 'mix', name: 'Gemischt', info: 'Von allem etwas.' },
];

export function makeProblem(kind: Kind, seed: number): Problem | null {
  const k = kind === 'mix' ? (['capture1', 'capture2', 'save', 'capture3'] as const)[seed % 4] : kind;
  if (k === 'save') return genProblem(seed, 'save', 2, 7);
  return genProblem(seed, 'capture', k === 'capture1' ? 1 : k === 'capture2' ? 2 : 3, 7);
}

export function ProblemHub({ S, solved, streak, best, onSolved, onBack, onDaily }: { S: GSettings; solved: Record<string, number>; streak: number; best: number; onSolved: (id: string, clean: boolean) => void; onBack: () => void; onDaily: () => void }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [seed, setSeed] = useState(1);
  const prob = useMemo(() => (kind ? makeProblem(kind, seed) : null), [kind, seed]);
  const start = (k: Kind) => { setKind(k); setSeed((Math.random() * 1e9) | 0); };
  return (
    <div className="go-sub-view">
      <header className="go-subhead"><button onClick={() => (kind ? setKind(null) : onBack())}>← {kind ? 'Aufgaben' : 'Menü'}</button><h2>Aufgaben</h2><span>{Object.keys(solved).length} gelöst · Serie {streak} (Rekord {best})</span></header>
      {!kind && (
        <div className="go-cards">
          <button className="go-card daily" onClick={onDaily}><b>Aufgabe des Tages</b><span>Für alle gleich, jeden Tag neu.</span></button>
          {KINDS.map((k) => <button key={k.id} className="go-card" onClick={() => start(k.id)}><b>{k.name}</b><span>{k.info}</span></button>)}
        </div>
      )}
      {kind && prob && <ProblemPlayer problem={prob} S={S} solvedBefore={!!solved[prob.id]} onSolved={(c) => onSolved(prob.id, c)} onNext={() => setSeed((s) => s + 1 + ((Math.random() * 99) | 0))} nextLabel="Nächste Aufgabe" />}
      {kind && !prob && <p>Keine Aufgabe gefunden. <button onClick={() => setSeed((s) => s + 1)}>Nochmal</button></p>}
    </div>
  );
}

// ───────── Lektionen ─────────

function Diagram({ rows, marks, S }: { rows: string[]; marks?: Record<string, string>; S: GSettings }) {
  const n = rows.length;
  const board = new Uint8Array(n * n);
  rows.forEach((r, y) => { for (let x = 0; x < n; x++) board[y * n + x] = r[x] === 'X' ? BLACK : r[x] === 'O' ? WHITE : 0; });
  const m: Record<number, Mark> = {};
  if (marks) for (const [k, v] of Object.entries(marks)) { const [x, y] = k.split(',').map(Number); m[y * n + x] = v as Mark; }
  return <div className="go-boardwrap small"><GoBoard n={n} board={board} theme={S.board} stones={S.stones} coords={false} marks={m} /></div>;
}

function FreePlay({ n, S }: { n: number; S: GSettings }) {
  const [st, setSt] = useState<GoState>(() => newState({ ...DEFAULT_RULES, n }));
  const [msg, setMsg] = useState('');
  const click = (i: number) => {
    const r = play(st, i);
    if (!r.ok) { setMsg(r.reason); sfx('bad'); return; }
    setMsg(r.captured.length ? `${r.captured.length} Stein${r.captured.length > 1 ? 'e' : ''} geschlagen!` : '');
    sfx(r.captured.length ? 'pop' : 'place');
    setSt(r.state);
  };
  const remove = (i: number) => {
    if (!st.board[i]) return;
    const b = st.board.slice(); b[i] = 0;
    setSt({ ...st, board: b, ko: -1 });
  };
  return (
    <div>
      <div className="go-boardwrap small"><GoBoard n={n} board={st.board} theme={S.board} stones={S.stones} coords={false} last={st.last} ghost={st.turn} ko={st.ko} libsOnHover onPlay={click} onRight={remove} /></div>
      <p className="go-msg">{msg || `${st.turn === BLACK ? 'Schwarz' : 'Weiß'} ist am Zug.`}</p>
    </div>
  );
}

export function LessonView({ S, done, onDone, onBack, onTaskSolved }: { S: GSettings; done: Record<string, boolean>; onDone: (id: string) => void; onBack: () => void; onTaskSolved: (id: string, clean: boolean) => void }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [step, setStep] = useState(0);
  const [taskOk, setTaskOk] = useState(false);

  const go = (l: Lesson, s: number) => { setLesson(l); setStep(s); setTaskOk(false); };
  if (!lesson) {
    return (
      <div className="go-sub-view">
        <header className="go-subhead"><button onClick={onBack}>← Menü</button><h2>Lernen</h2><span>{Object.values(done).filter(Boolean).length} / {LESSONS.length} Lektionen</span></header>
        <ol className="go-lessons">
          {LESSONS.map((l, i) => (
            <li key={l.id}><button className={`go-card ${done[l.id] ? 'done' : ''}`} onClick={() => go(l, 0)}><i>{i + 1}</i><b>{l.title}</b><span>{l.summary}</span>{done[l.id] && <em>✓</em>}</button></li>
          ))}
        </ol>
      </div>
    );
  }
  const st: Step = lesson.steps[step];
  const isLast = step === lesson.steps.length - 1;
  const next = () => {
    if (isLast) { onDone(lesson.id); const i = LESSONS.indexOf(lesson); if (i + 1 < LESSONS.length) go(LESSONS[i + 1], 0); else setLesson(null); }
    else { setStep(step + 1); setTaskOk(false); }
  };
  const prob = st.t === 'task' ? resolveTask(st) : null;
  return (
    <div className="go-sub-view">
      <header className="go-subhead"><button onClick={() => setLesson(null)}>← Lektionen</button><h2>{lesson.title}</h2><span>Schritt {step + 1} / {lesson.steps.length}</span></header>
      <div className="go-lesson">
        {st.t === 'text' && (
          <div className="go-textstep">
            {st.diagram && <Diagram rows={st.diagram.rows} marks={st.diagram.marks} S={S} />}
            <div>{st.title && <h3>{st.title}</h3>}<p>{st.text}</p></div>
          </div>
        )}
        {st.t === 'free' && <div className="go-textstep"><FreePlay n={st.n} S={S} /><div><h3>Selbst probieren</h3><p>{st.text}</p></div></div>}
        {st.t === 'task' && prob && (
          <div>
            {st.text && <p className="go-lead">{st.text}</p>}
            <ProblemPlayer problem={prob} S={S} onSolved={(c) => { setTaskOk(true); onTaskSolved(prob.id, c); }} />
          </div>
        )}
        <div className="go-lessonnav">
          <button onClick={() => (step ? (setStep(step - 1), setTaskOk(false)) : setLesson(null))}>← Zurück</button>
          <span className="go-dots">{lesson.steps.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />)}</span>
          <button className="primary" disabled={st.t === 'task' && !taskOk} onClick={next}>{isLast ? 'Lektion abschließen' : 'Weiter →'}</button>
        </div>
      </div>
    </div>
  );
}

export type { Color };
