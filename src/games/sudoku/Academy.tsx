import { useEffect, useMemo, useState } from 'react';
import { achieve, toast } from '../shared/store';
import { sfx } from '../shared/sfx';
import { ACADEMY, type Lesson } from './data';
import { type Variant, buildSpec } from './engine';
import { generate, type Puzzle } from './gen';
import { type LState, type Level, type Step, type Tech, TECH_INFO, applyStep, initState, nextStep } from './logic';
import SudokuBoard from './SudokuBoard';

interface Exercise { puzzle: Puzzle; givens: number[]; user: number[]; notes: number[]; step: Step; solution: number[] }

const LEVEL_FOR: Record<Tech, Level> = { nackt1: 'leicht', versteckt1: 'leicht', kaefig: 'mittel', gesperrt: 'mittel', nacktPaar: 'mittel', verstecktPaar: 'schwer', nacktDrilling: 'schwer', verstecktDrilling: 'schwer', xwing: 'experte', swordfish: 'experte', xywing: 'experte' };

/** Sucht ein Rätsel, in dem die gewünschte Technik der nächste nötige Schritt ist. */
export function findExercise(tech: Tech, seed: number): Exercise | null {
  const variant: Variant = tech === 'kaefig' ? 'killer' : 'klassik';
  for (let attempt = 0; attempt < 60; attempt++) {
    const p = generate(variant, LEVEL_FOR[tech], seed + attempt * 7919, 600);
    const spec = buildSpec(p.variant, p.cages);
    const st: LState = initState(spec, p.givens);
    for (let k = 0; k < 400; k++) {
      const step = nextStep(spec, st);
      if (!step) break;
      if (step.tech === tech) {
        const user = Array.from(st.val).map((v, i) => (p.givens[i] ? 0 : v));
        return { puzzle: p, givens: p.givens, user, notes: Array.from(st.cand), step, solution: p.solution };
      }
      applyStep(spec, st, step);
    }
  }
  return null;
}

export default function Academy({ onBack, progress, onDone }: { onBack: () => void; progress: Record<string, number>; onDone: (t: Tech) => void }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [ex, setEx] = useState<Exercise | null>(null);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<number[]>([]);
  const [notes, setNotes] = useState<number[]>([]);
  const [sel, setSel] = useState<ReadonlySet<number>>(new Set());
  const [msg, setMsg] = useState('');
  const [solved, setSolved] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [mode, setMode] = useState<'note' | 'value'>('note');
  const [seed, setSeed] = useState(() => (Math.random() * 1e6) | 0);

  const start = (l: Lesson) => {
    setBusy(true); setMsg(''); setSolved(false); setReveal(false); setSel(new Set());
    window.setTimeout(() => {
      const e = findExercise(l.tech, seed);
      setEx(e);
      if (e) { setUser(e.user); setNotes(e.notes); setMode(e.step.place ? 'value' : 'note'); }
      setBusy(false);
      if (!e) setMsg('Für diese Technik wurde gerade keine Übung gefunden – versuche es noch einmal.');
    }, 20);
  };
  useEffect(() => { if (lesson) start(lesson); }, [lesson, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const spec = useMemo(() => (ex ? buildSpec(ex.puzzle.variant, ex.puzzle.cages) : null), [ex]);
  const vals = useMemo(() => (ex ? ex.givens.map((g, i) => g || user[i]) : []), [ex, user]);

  const press = (d: number) => {
    if (!ex || !sel.size || solved) return;
    const i = [...sel][0];
    if (ex.givens[i]) return;
    if (mode === 'value') {
      if (!ex.step.place) { setMsg('Diese Aufgabe verlangt, Kandidaten zu streichen – wechsle auf „Notiz“.'); return; }
      const u = user.slice(); u[i] = u[i] === d ? 0 : d; setUser(u);
      if (u[i] === ex.solution[i]) {
        // jede richtige Zahl in einer Zelle, die logisch bestimmbar ist, zählt
        const ok = i === ex.step.place.cell || ex.solution[i] === d;
        if (ok) { setSolved(true); setMsg(`Richtig! ${ex.step.text}`); sfx('win'); onDone(ex.step.tech); }
      } else if (u[i]) { setMsg('Das passt nicht in die Lösung. Schau dir die Kandidaten noch einmal an.'); sfx('bad'); }
    } else {
      if (user[i]) return;
      const nn = notes.slice(); nn[i] ^= 1 << (d - 1); setNotes(nn);
    }
  };
  const check = () => {
    if (!ex) return;
    if (ex.step.place) { setMsg('Trage die Zahl ein, die du gefunden hast (Modus „Eintragen“).'); return; }
    const removed: { cell: number; d: number }[] = [];
    notes.forEach((m, i) => { const was = ex.notes[i]; for (let d = 1; d <= ex.puzzle.n; d++) if ((was & (1 << (d - 1))) && !(m & (1 << (d - 1)))) removed.push({ cell: i, d }); });
    const valid = new Set(ex.step.elim.map((e) => `${e.cell}:${e.d}`));
    const wrong = removed.filter((r) => !valid.has(`${r.cell}:${r.d}`));
    const found = removed.filter((r) => valid.has(`${r.cell}:${r.d}`));
    if (wrong.length) { setMsg(`Mindestens ein gestrichener Kandidat lässt sich so nicht begründen (${wrong.length}). Mach ihn rückgängig und überlege nochmal.`); sfx('bad'); return; }
    if (found.length === 0) { setMsg('Du hast noch nichts gestrichen. Suche die Zellen, in denen sich mit der Technik Kandidaten ausschließen lassen.'); return; }
    if (found.length < valid.size) { setMsg(`Gut! ${found.length} von ${valid.size} Streichungen gefunden. Es geht noch weiter.`); sfx('good'); return; }
    setSolved(true); setMsg(`Perfekt! ${ex.step.text}`); sfx('win'); onDone(ex.step.tech);
  };
  const finishedAll = ACADEMY.every((l) => (progress[l.tech] ?? 0) > 0);
  useEffect(() => { if (finishedAll) achieve('sudoku', 'akademie'); }, [finishedAll]);

  const overlay = ex && reveal ? { cells: ex.step.cells, elim: ex.step.elim, place: ex.step.place, group: ex.step.group } : null;

  if (!lesson) {
    return (
      <div className="sd-academy">
        <header className="sd-head"><div className="sd-masthead"><h1>Schule</h1><span className="sd-issue">Elf Techniken – mit Übungen aus echten Rätseln</span></div><nav className="sd-nav"><button onClick={onBack}>Zurück zum Rätsel</button></nav></header>
        <div className="sd-lessons">
          {ACADEMY.map((l, i) => (
            <button key={l.tech} className={(progress[l.tech] ?? 0) > 0 ? 'done' : ''} onClick={() => setLesson(l)}>
              <span>{i + 1}</span><b>{l.title}</b><small>{TECH_INFO[l.tech].short}</small><em>{(progress[l.tech] ?? 0) > 0 ? `✓ ${progress[l.tech]}× geübt` : 'Noch nicht geübt'}</em>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="sd-academy">
      <header className="sd-head"><div className="sd-masthead"><h1>{lesson.title}</h1><span className="sd-issue">Technik {ACADEMY.indexOf(lesson) + 1} von {ACADEMY.length}</span></div><nav className="sd-nav"><button onClick={() => { setLesson(null); setEx(null); }}>Alle Techniken</button><button onClick={onBack}>Zum Rätsel</button></nav></header>
      <main className="sd-main">
        <section className="sd-gridwrap">
          <p className="sd-lesson-text">{lesson.text}</p>
          <p className="sd-small"><b>Merke:</b> {lesson.tipp}</p>
          {busy && <div className="sd-busy">Übung wird gesucht …</div>}
          {ex && spec && (
            <>
              <p className="sd-task"><b>Aufgabe:</b> {ex.step.place ? 'Finde die Zelle, die sich jetzt eindeutig bestimmen lässt, und trage die Zahl ein.' : 'Streiche in den Notizen alle Kandidaten, die sich mit dieser Technik ausschließen lassen (Zelle wählen, Zahl drücken).'}</p>
              <SudokuBoard spec={spec} givens={ex.givens} vals={vals} notes={notes} marks={ex.givens.map(() => 0)} sel={sel} hint={overlay} showSame showPeers paused={false} onDown={(i) => setSel(new Set([i]))} onEnter={() => {}} />
              {msg && <div className="sd-hint" role="status">{msg}</div>}
            </>
          )}
        </section>
        <aside className="sd-side">
          {ex && (
            <>
              <div className="sd-keys">
                {Array.from({ length: ex.puzzle.n }, (_, k) => k + 1).map((d) => <button key={d} onClick={() => press(d)}><b>{d}</b></button>)}
              </div>
              <div className="sd-tools">
                <button className={mode === 'value' ? 'on' : ''} onClick={() => setMode('value')}>Eintragen</button>
                <button className={mode === 'note' ? 'on' : ''} onClick={() => setMode('note')}>Notiz</button>
                <button onClick={check}>Prüfen</button>
                <button onClick={() => { setReveal(true); setMsg(ex.step.text); toast('Lösung gezeigt'); }}>Lösung zeigen</button>
                <button className="sd-primary" onClick={() => setSeed((s) => s + 1)}>{solved ? 'Nächste Übung' : 'Andere Übung'}</button>
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
