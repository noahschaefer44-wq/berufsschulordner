import { useEffect, useMemo, useRef, useState } from 'react';
import { POOLS, poolById } from './corpus';
import { joinTexts } from './gen';
import { recordRun, useData } from './store';

/** Abschreiben: oben steht ein Fließtext, unten schreibst du ihn in ein eigenes Feld ab.
 *  Es gibt keinen Cursor im Vorlagentext – du musst deine Stelle selbst finden, wie beim echten Abschreiben. */

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Levenshtein-Abstand (zeichenweise). */
function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

type Mark = 'ok' | 'wrong' | 'missing';
/** Wortweiser Vergleich (LCS): Status je Wort der Vorlage + eingefügte Wörter. */
function compare(ref: string[], got: string[]) {
  const n = ref.length, m = got.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ref[i] === got[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const marks: Mark[] = new Array(n).fill('missing');
  let i = 0, j = 0, extra = 0;
  while (i < n && j < m) {
    if (ref[i] === got[j]) { marks[i] = 'ok'; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { i++; }
    else { j++; extra++; }
  }
  extra += m - j;
  // „missing“ + gleichzeitig daneben getippt = falsch geschrieben: grob über Längenvergleich
  const unmatched = marks.filter((x) => x === 'missing').length;
  const wrongCount = Math.min(unmatched, extra);
  let k = 0;
  for (let x = 0; x < n && k < wrongCount; x++) if (marks[x] === 'missing') { marks[x] = 'wrong'; k++; }
  return { marks, extra };
}

export default function Copy() {
  const d = useData();
  const [setup, setSetup] = useState({ pool: 'absatz', len: 1, help: false });
  const [text, setText] = useState('');
  const [typed, setTyped] = useState('');
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState<null | { acc: number; wpm: number; secs: number; marks: Mark[]; extra: number; words: string[]; gotWords: number }>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const refBox = useRef<HTMLDivElement>(null);

  const words = useMemo(() => text.split(' '), [text]);

  function begin() {
    const min = [260, 520, 900][setup.len];
    const texts = (poolById(setup.pool)?.texts ?? []).filter((t) => t.length > 0);
    setText(norm(joinTexts(texts, min)));
    setTyped(''); setStarted(0); setNow(0); setDone(null);
  }

  useEffect(() => { if (text) area.current?.focus(); }, [text]);
  useEffect(() => {
    if (!started || done) return;
    const id = setInterval(() => setNow((performance.now() - started) / 1000), 250);
    return () => clearInterval(id);
  }, [started, done]);

  function finish() {
    if (!text || done) return;
    const got = norm(typed);
    const secs = Math.max(1, started ? (performance.now() - started) / 1000 : 1);
    const dist = distance(text, got);
    const acc = Math.max(0, Math.round((1 - dist / Math.max(text.length, got.length, 1)) * 1000) / 10);
    const correctChars = Math.max(0, text.length - dist);
    const wpm = Math.round((correctChars / 5 / (secs / 60)) * 10) / 10;
    const cmp = compare(words, got ? got.split(' ') : []);
    setDone({ acc, wpm, secs, marks: cmp.marks, extra: cmp.extra, words, gotWords: got ? got.split(' ').length : 0 });
    recordRun('abschreiben', { wpm, raw: Math.round((got.length / 5 / (secs / 60)) * 10) / 10, acc, secs, chars: correctChars, errs: dist, series: [] });
  }

  // Positionshilfe (optional): ungefähr das Wort markieren, an dem du bist
  const gotWordCount = norm(typed) ? norm(typed).split(' ').length - (typed.endsWith(' ') ? 0 : 1) : 0;
  useEffect(() => {
    if (!setup.help) return;
    const el = refBox.current?.querySelector<HTMLElement>('.cp-here');
    if (el && refBox.current) refBox.current.scrollTo({ top: Math.max(0, el.offsetTop - 70), behavior: 'smooth' });
  }, [gotWordCount, setup.help]);

  if (!text) {
    return (
      <section>
        <h2>Abschreiben</h2>
        <p className="tp-sub">Oben steht ein Fließtext, unten schreibst du ihn ab – wie im Büro oder in der Prüfung. Im Vorlagentext gibt es keinen Cursor: Deine Stelle findest du selbst. Am Ende zeigt dir ein Vergleich jede Abweichung.</p>
        <div className="tp-form glass">
          <label>Thema
            <select value={setup.pool} onChange={(e) => setSetup({ ...setup, pool: e.target.value })}>
              {POOLS.filter((p) => p.texts.some((t) => t.length > 60)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Länge
            <select value={setup.len} onChange={(e) => setSetup({ ...setup, len: +e.target.value })}>
              <option value={0}>Kurz (ca. 260 Zeichen)</option><option value={1}>Mittel (ca. 520 Zeichen)</option><option value={2}>Lang (ca. 900 Zeichen)</option>
            </select>
          </label>
          <label className="tp-check"><span>Positionshilfe – Wort in der Vorlage markieren</span><input type="checkbox" checked={setup.help} onChange={(e) => setSetup({ ...setup, help: e.target.checked })} /></label>
        </div>
        <button className="tp-btn main" onClick={begin}>Abschreiben starten</button>
        <p className="tp-sub">Bestes Abschreib-Tempo: {Math.round(d.best.abschreiben ?? 0)} WPM</p>
      </section>
    );
  }

  if (done) {
    return (
      <section>
        <h2>Vergleich</h2>
        <div className="tp-cards">
          <div><b>{done.wpm}</b><small>WPM (netto)</small></div>
          <div><b>{done.acc} %</b><small>Übereinstimmung</small></div>
          <div><b>{Math.round(done.secs)} s</b><small>Zeit</small></div>
          <div><b>{done.marks.filter((m) => m !== 'ok').length}</b><small>Wörter abweichend</small></div>
        </div>
        <h3>Vorlage mit Abweichungen</h3>
        <div className="cp-diff glass">
          {done.words.map((w, i) => <span key={i} className={'cp-' + done.marks[i]}>{w} </span>)}
        </div>
        <p className="tp-sub"><span className="cp-wrong">orange</span> = anders geschrieben · <span className="cp-missing">rot</span> = fehlt · {done.extra} zusätzliche Wörter getippt.</p>
        <div className="tp-btns left">
          <button className="tp-btn main" onClick={begin}>Neuer Text</button>
          <button className="tp-btn" onClick={() => setText('')}>Einstellungen</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <button className="tp-link" onClick={() => setText('')}>‹ Einstellungen</button>
      <div className="cp-wrap">
        <div className="cp-ref glass" ref={refBox} aria-label="Vorlage">
          {words.map((w, i) => <span key={i} className={setup.help && i === Math.min(gotWordCount, words.length - 1) ? 'cp-here' : ''}>{w} </span>)}
        </div>
        <div className="cp-bar">
          <span>{typed.length} / {text.length} Zeichen</span>
          <span>{started ? `${Math.round(now)} s` : 'Zeit startet beim Schreiben'}</span>
          <button className="tp-btn main" onClick={finish} title="Strg+Enter">Fertig ↵</button>
        </div>
        <textarea
          ref={area} className="cp-input glass" value={typed} rows={7} spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off"
          placeholder="Hier abschreiben …"
          onChange={(e) => { setTyped(e.target.value); if (!started && e.target.value) setStarted(performance.now()); }}
          onPaste={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(); } }}
        />
      </div>
    </section>
  );
}
