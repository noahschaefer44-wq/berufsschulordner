import { useEffect, useMemo, useRef, useState } from 'react';
import { SENTENCES_DE, SENTENCES_EN } from './data';
import { pick, pool, shuffle } from './gen';
import { canSpeak, keySound, speak } from './sound';
import { recordRun, useSettings } from './store';

type Item = { want: string; got: string };

export default function Dictation() {
  const s = useSettings();
  const [lang, setLang] = useState(s.lang);
  const [kind, setKind] = useState<'woerter' | 'saetze'>('woerter');
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [val, setVal] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const t0 = useRef(0);

  const list = useMemo(() => {
    if (!started) return [];
    return kind === 'woerter'
      ? Array.from({ length: 10 }, () => pick(pool(lang).filter((w) => w.length >= 4)))
      : shuffle(lang === 'de' ? SENTENCES_DE : SENTENCES_EN).slice(0, 4);
  }, [started, kind, lang, round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (started && list[0]) speak(list[0], lang); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canSpeak()) return <section><h2>Diktat</h2><p>Dein Browser kann leider nicht vorlesen.</p></section>;

  function begin() { setItems([]); setVal(''); setShown(null); setRound((n) => n + 1); setStarted(true); t0.current = performance.now(); }

  if (started && items.length >= list.length && list.length > 0) {
    const ok = items.filter((i) => i.want === i.got).length;
    const chars = items.reduce((a, i) => a + (i.want === i.got ? i.want.length : 0), 0);
    const secs = (performance.now() - t0.current) / 1000;
    return (
      <section>
        <h2>Diktat beendet</h2>
        <div className="tp-big">{ok} / {items.length} richtig</div>
        <ul className="tp-list">
          {items.map((i, k) => (
            <li key={k} className={i.want === i.got ? 'okrow' : 'badrow'}><span><b>{i.want}</b>{i.want !== i.got && <small>du: {i.got || '—'}</small>}</span></li>
          ))}
        </ul>
        <button className="tp-btn main" onClick={() => { recordRun('diktat', { wpm: Math.round(chars / 5 / (secs / 60)), raw: 0, acc: Math.round((ok / items.length) * 100), secs, chars, errs: items.length - ok, series: [] }); setStarted(false); }}>Fertig</button>
      </section>
    );
  }

  if (!started) {
    return (
      <section>
        <h2>Diktat</h2>
        <p className="tp-sub">Du hörst ein Wort oder einen Satz und tippst, was du verstanden hast – ideal für Rechtschreibung und Englisch-Vokabeln.</p>
        <div className="tp-form">
          <label>Sprache<select value={lang} onChange={(e) => setLang(e.target.value as 'de' | 'en')}><option value="de">Deutsch</option><option value="en">Englisch</option></select></label>
          <label>Art<select value={kind} onChange={(e) => setKind(e.target.value as 'woerter' | 'saetze')}><option value="woerter">10 Wörter</option><option value="saetze">4 Sätze</option></select></label>
        </div>
        <button className="tp-btn main" onClick={begin}>Diktat starten</button>
      </section>
    );
  }

  const cur = items.length;
  const check = () => {
    setItems((a) => [...a, { want: list[cur], got: val.trim() }]);
    setShown(null); setVal('');
    const nxt = list[cur + 1];
    if (nxt) setTimeout(() => speak(nxt, lang), 150);
  };
  return (
    <section>
      <p className="tp-sub">{kind === 'woerter' ? 'Wort' : 'Satz'} {cur + 1} von {list.length}</p>
      <div className="tp-btns left">
        <button className="tp-btn" onClick={() => speak(list[cur], lang)}>🔊 Nochmal hören</button>
        <button className="tp-btn ghost" onClick={() => setShown(list[cur])}>Hinweis zeigen</button>
      </div>
      {shown && <p className="tp-hintbox">{shown}</p>}
      <input
        className="tp-input" autoFocus value={val} placeholder="Tippe, was du hörst …" autoComplete="off" autoCapitalize="off" spellCheck={false}
        onChange={(e) => { setVal(e.target.value); keySound('ok'); }}
        onKeyDown={(e) => { if (e.key === 'Enter') check(); }}
      />
      <button className="tp-btn main" onClick={check}>Prüfen ↵</button>
    </section>
  );
}
