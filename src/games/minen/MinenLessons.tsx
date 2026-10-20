import { useMemo, useRef, useState } from 'react';
import { achieve, useGameData } from '../shared/store';
import { sfx } from '../shared/sfx';
import { MINEN_INIT } from './data';
import { type Board, FLAG, HIDDEN, OPEN, QUEST, reveal, toggleFlag } from './engine';
import { LESSONS, lessonBoard, lessonDone, type Lesson } from './lessons';
import MineCanvas, { type Skin } from './MineCanvas';
import { Face, Led } from './Led';
import { deduce, explain, viewOf } from './solve';

export default function MinenLessons({ skin, size, onClose, onTraining }: { skin: Skin; size: number; onClose: () => void; onTraining: () => void }) {
  const [data, upd] = useGameData('minen', MINEN_INIT);
  const [idx, setIdx] = useState(() => Math.max(0, LESSONS.findIndex((l) => !data.lessons[l.id])));
  const [ver, setVer] = useState(0);
  const lesson: Lesson = LESSONS[Math.min(idx, LESSONS.length - 1)];
  const bref = useRef<Board>(lessonBoard(lesson));
  const [note, setNote] = useState('');
  const [tip, setTip] = useState(false);
  const [hl, setHl] = useState<{ safe: number[]; mine: number[] }>({ safe: [], mine: [] });
  const done = lessonDone(lesson, bref.current);
  const cell = Math.max(34, size + 8);

  const load = (i: number) => {
    const l = LESSONS[i];
    bref.current = lessonBoard(l);
    setIdx(i); setNote(''); setTip(false); setHl({ safe: [], mine: [] }); setVer((v) => v + 1);
  };
  const finish = () => {
    sfx('win');
    upd((d) => { d.lessons = { ...d.lessons, [lesson.id]: true }; });
    if (LESSONS.every((l) => l.id === lesson.id || data.lessons[l.id])) achieve('minen', 'lessons');
  };
  const check = () => {
    const b = bref.current;
    if (lessonDone(lesson, b) && !data.lessons[lesson.id]) finish();
    setVer((v) => v + 1);
  };
  const onDown = () => {};
  const onUp = (i: number, btn: number) => {
    const b = bref.current;
    if (i < 0 || lessonDone(lesson, b)) return;
    if (btn === 2) {
      if (b.st[i] !== OPEN) { toggleFlag(b, i, false); sfx('flag'); check(); }
      return;
    }
    if (btn !== 0 || b.st[i] === OPEN || b.st[i] === FLAG) return;
    // Nur sichere Felder dürfen aufgedeckt werden – sonst Erklärung und Neustart der Station
    if (b.mine[i]) {
      sfx('boom');
      const d = deduce(viewOf(b), { enumerate: true }).find((x) => x.cell === i);
      setNote(`Das war eine Mine. ${d ? explain(d, b.cfg.w, 'quad') : 'Schau dir die Zahlen noch einmal genau an.'} Die Station startet neu.`);
      window.setTimeout(() => load(idx), 1400);
      b.boom = i; b.status = 'lost'; setVer((v) => v + 1);
      return;
    }
    const r = reveal(b, i);
    void r; sfx('tick'); setNote(''); setHl({ safe: [], mine: [] });
    check();
  };
  const showTip = () => {
    setTip(true);
    const b = bref.current;
    const d = deduce(viewOf(b), { enumerate: true });
    const next = d.find((x) => !x.mine && b.st[x.cell] !== OPEN) ?? d.find((x) => x.mine && b.st[x.cell] !== FLAG);
    if (next) { setNote(explain(next, b.cfg.w, 'quad')); setHl({ safe: next.mine ? [] : [next.cell], mine: next.mine ? [next.cell] : [] }); }
  };
  const overlay = useMemo(() => ({ safe: hl.safe, mine: hl.mine }), [hl]);
  const minesLeft = lesson.mines.length - bref.current.st.reduce((a, s) => a + (s === FLAG ? 1 : 0), 0);
  void HIDDEN; void QUEST;

  return (
    <div className="mn" data-skin={skin}>
      <div className="mn-win mn-lessons">
        <div className="mn-title"><span className="mn-title-ico" aria-hidden="true">🎓</span><b>Minenfeld – Lernen</b><span className="mn-wbtns"><button aria-label="Schließen" onClick={onClose}>✕</button></span></div>
        <div className="mn-body">
          <div className="mn-steps">
            {LESSONS.map((l, i) => <button key={l.id} className={'mn-btn' + (i === idx ? ' on' : '')} onClick={() => load(i)}>{data.lessons[l.id] ? '✓ ' : ''}{i + 1}. {l.title}</button>)}
          </div>
          <h3 className="mn-h3">{lesson.title}</h3>
          <p className="mn-lesson-text">{lesson.text}</p>
          <p className="mn-small"><b>Aufgabe:</b> {lesson.goal === 'flag' ? 'Markiere alle Minen mit Flaggen (Rechtsklick oder langer Druck).' : 'Decke alle sicheren Felder auf. Eine Mine aufzudecken startet die Station neu.'}</p>
          <div className="mn-panel mn-head mn-mini">
            <Led value={minesLeft} label="Minen" />
            <span className="mn-facebtn" aria-hidden="true"><Face kind={done ? 'cool' : 'smile'} /></span>
            <Led value={0} label="Zeit" />
          </div>
          <div className="mn-panel mn-field"><div className="mn-board-wrap">
            <MineCanvas b={bref.current} version={ver} size={cell} skin={skin} overlay={overlay} onDown={onDown} onUp={onUp} onMove={() => {}} onLeave={() => {}} />
          </div></div>
          {note && <div className="mn-hint" role="status">{note}</div>}
          {tip && !note && <div className="mn-hint">{lesson.tip}</div>}
          <div className="mn-tools">
            <button className="mn-btn" onClick={showTip}>💡 Tipp</button>
            <button className="mn-btn" onClick={() => load(idx)}>↺ Neu</button>
            {done && idx < LESSONS.length - 1 && <button className="mn-btn on" onClick={() => load(idx + 1)}>Weiter ▸</button>}
            {done && idx === LESSONS.length - 1 && <button className="mn-btn on" onClick={onTraining}>Üben mit Wahrscheinlichkeiten</button>}
            <button className="mn-btn" onClick={onClose}>Zum Spiel</button>
          </div>
          {done && <div className="mn-win-note">Gelöst!</div>}
          <div className="mn-extra">
            <h3 className="mn-h3">Wenn Logik nicht reicht</h3>
            <p className="mn-small">Manchmal gibt es keinen sicheren Zug. Dann zählen Wahrscheinlichkeiten: Im Training zeigt „%“ für jedes verdeckte Feld die exakte Minenwahrscheinlichkeit. Rate immer das Feld mit dem niedrigsten Wert, am besten eines, das viele neue Informationen verspricht (z. B. neben einer Fläche).</p>
            <button className="mn-btn" onClick={onTraining}>Training mit Wahrscheinlichkeiten starten</button>
          </div>
        </div>
      </div>
    </div>
  );
}
