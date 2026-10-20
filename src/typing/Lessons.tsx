import { useMemo, useState } from 'react';
import { lessonText } from './gen';
import { buildLessons, type TypingLesson } from './layouts';
import TextRun from './TextRun';
import { update, useData } from './store';

export default function Lessons() {
  const d = useData();
  const lessons = useMemo(() => buildLessons(), []);
  const [open, setOpen] = useState<TypingLesson | null>(null);
  const [round, setRound] = useState(0);
  const text = useMemo(() => (open ? lessonText(open) : ''), [open, round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (open) {
    const i = lessons.indexOf(open);
    const next = lessons[i + 1];
    return (
      <section>
        <button className="tp-link" onClick={() => setOpen(null)}>‹ Alle Stufen</button>
        <h2>{open.title}</h2>
        <p className="tp-sub">{open.info}</p>
        <TextRun
          key={open.id}
          text={text}
          mode={`stufe:${open.id}`}
          goal={{ wpm: open.goalWpm, acc: open.goalAcc }}
          onFinish={(r, stars) => {
            if (stars > 0) update((x) => {
              const old = x.lessons[open.id];
              x.lessons = { ...x.lessons, [open.id]: { wpm: Math.max(old?.wpm ?? 0, r.wpm), acc: Math.max(old?.acc ?? 0, r.acc), stars: Math.max(old?.stars ?? 0, stars), n: (old?.n ?? 0) + 1 } };
            });
          }}
          onRestart={() => setRound((n) => n + 1)}
          onNext={next ? () => { setOpen(next); setRound((n) => n + 1); } : () => setOpen(null)}
          nextLabel={next ? 'Nächste Stufe' : 'Fertig'}
        />
      </section>
    );
  }

  const done = lessons.filter((l) => d.lessons[l.id]).length;
  const firstOpen = lessons.findIndex((l) => !d.lessons[l.id]);
  return (
    <section>
      <h2>Schreibschule</h2>
      <p className="tp-sub">Zehn Stufen mit echten Texten – von kurzen Sätzen bis zu langen Absätzen. {done} von {lessons.length} geschafft. Für ein Ziel brauchst du Tempo und Genauigkeit.</p>
      <div className="tp-lessons">
        {lessons.map((l, i) => {
          const r = d.lessons[l.id];
          return (
            <button key={l.id} className={'tp-lesson glass' + (r ? ' done' : '') + (i === firstOpen ? ' next' : '')} onClick={() => { setOpen(l); setRound((n) => n + 1); }}>
              <span className="tp-lesson-no">Stufe {i + 1}</span>
              <b>{l.title}</b>
              <span className="tp-stars sm">{[1, 2, 3].map((n) => <span key={n} className={n <= (r?.stars ?? 0) ? 'on' : ''}>★</span>)}</span>
              <small>{r ? `${r.wpm} WPM · ${r.acc} %` : `Ziel: ${l.goalWpm} WPM`}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
