import { useEffect, useMemo, useState } from 'react';
import { SNIPPETS, QUOTES } from './data';
import { dailyText, randomSnippet, shuffle, sourceText, SOURCES, weakKeys, weakPairs, weakText } from './gen';
import Keyboard from './Keyboard';
import { layoutById } from './layouts';
import TextRun, { type Racer } from './TextRun';
import { useData } from './store';

type Mode = 'sprint' | 'race' | 'quotes' | 'code' | 'wiki' | 'daily';
const MODES: { id: Mode; name: string; info: string }[] = [
  { id: 'sprint', name: 'Sprint', info: 'Tippe so viel du kannst in 15–120 Sekunden.' },
  { id: 'race', name: 'Rennen', info: 'Tritt gegen Bots und deinen eigenen Geist an.' },
  { id: 'quotes', name: 'Zitate', info: 'Kluge Sätze abtippen.' },
  { id: 'code', name: 'Code', info: 'HTML, CSS, JavaScript, Python, SQL – Sonderzeichen üben.' },
  { id: 'wiki', name: 'Wikipedia', info: 'Zufälliger Artikel-Anfang (lädt online).' },
  { id: 'daily', name: 'Tagestext', info: 'Heute für alle derselbe Text – vergleichbar mit gestern.' },
];
const BOTS = [
  { name: 'Schnecke', wpm: 20 }, { name: 'Azubi', wpm: 35 }, { name: 'Sekretär', wpm: 55 }, { name: 'Profi', wpm: 80 }, { name: 'Blitz', wpm: 110 },
];

function cleanWiki(s: string): string {
  const t = s
    .replace(/[„“”«»]/g, '"').replace(/[‘’´`]/g, "'").replace(/[–—−]/g, '-').replace(/[   ]/g, ' ')
    .replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ')
    .replace(/[^\wäöüÄÖÜßéèêáàç .,;:!?()\-"'%€/0-9]/g, '').trim();
  const cut = t.slice(0, 380);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'));
  return end > 120 ? cut.slice(0, end + 1) : cut;
}

export default function Train({ initial, autoStart }: { initial?: Mode; autoStart?: boolean }) {
  const d = useData();
  const lang = d.settings.lang;
  const [mode, setMode] = useState<Mode>(initial ?? 'sprint');
  const [source, setSource] = useState('woerter');
  const [time, setTime] = useState(30);
  const [hard, setHard] = useState(false);
  const [blind, setBlind] = useState(false);
  const [zen, setZen] = useState(false);
  const [bots, setBots] = useState<string[]>(['Azubi', 'Profi']);
  const [codeLang, setCodeLang] = useState('');
  const [round, setRound] = useState(0);
  const [go, setGo] = useState(!!autoStart);
  const [wiki, setWiki] = useState<{ text: string; title: string } | 'laden' | 'fehler'>('laden');

  const ghostWpm = Math.round(d.best.race ?? d.best.sprint ?? 0);
  const racers: Racer[] = useMemo(() => {
    const r: Racer[] = BOTS.filter((b) => bots.includes(b.name));
    if (bots.includes('Geist') && ghostWpm > 0) r.push({ name: 'Geist', wpm: ghostWpm });
    return r;
  }, [bots, ghostWpm]);

  const gen = useMemo(() => {
    const timed = mode === 'sprint' && time > 0 && !zen;
    switch (mode) {
      case 'sprint': return { text: sourceText(source, lang, timed ? 240 : 40, d.lists), prompt: null as React.ReactNode };
      case 'race': return { text: sourceText(source === 'zitate' ? 'woerter' : source, lang, 38, d.lists), prompt: null };
      case 'quotes': {
        const q = shuffle(QUOTES).slice(0, 2);
        return { text: q.map((x) => x.text).join(' '), prompt: <small>{q.map((x) => x.by).join(' · ')}</small> };
      }
      case 'code': { const s = randomSnippet(codeLang); return { text: s.code, prompt: <small>{s.lang} · {s.title} – Enter für neue Zeile, ohne Einrückung</small> }; }
      case 'daily': return { text: dailyText(lang), prompt: <small>Tagestext vom {new Date().toLocaleDateString('de-DE')}</small> };
      default: return { text: '', prompt: null };
    }
  }, [mode, source, time, zen, lang, round, codeLang, d.lists]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'wiki' || !go) return;
    setWiki('laden');
    let alive = true;
    fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/random/summary`)
      .then((r) => r.json())
      .then((j: { extract?: string; title?: string }) => {
        const t = cleanWiki(j.extract ?? '');
        if (!alive) return;
        setWiki(t.length > 40 ? { text: t, title: j.title ?? '' } : 'fehler');
      })
      .catch(() => alive && setWiki('fehler'));
    return () => { alive = false; };
  }, [mode, go, round, lang]);

  const toggle = (arr: string[], x: string) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);

  if (go) {
    const back = <button className="tp-link" onClick={() => setGo(false)}>‹ Einstellungen</button>;
    const restart = () => setRound((n) => n + 1);
    if (mode === 'wiki') {
      if (wiki === 'laden') return <section>{back}<p>Lade Artikel …</p></section>;
      if (wiki === 'fehler') return <section>{back}<p>Kein Artikel erhalten (offline?). <button className="tp-btn" onClick={restart}>Nochmal versuchen</button></p></section>;
      return (
        <section>
          {back}
          <TextRun text={wiki.text} mode="wiki" hardcore={hard} blind={blind} zen={zen} prompt={<small>Wikipedia: {wiki.title}</small>} onRestart={restart} onNext={restart} nextLabel="Neuer Artikel" />
        </section>
      );
    }
    const timeLimit = mode === 'sprint' && time > 0 && !zen ? time : undefined;
    return (
      <section>
        {back}
        <TextRun
          text={gen.text} mode={mode} timeLimit={timeLimit} hardcore={hard} blind={blind} zen={zen}
          prompt={gen.prompt} racers={mode === 'race' ? racers : undefined}
          recordKeys={mode !== 'code'}
          onRestart={restart} onNext={restart} nextLabel="Nächster Text"
        />
      </section>
    );
  }

  const m = MODES.find((x) => x.id === mode)!;
  return (
    <section>
      <h2>Training</h2>
      <div className="tp-tabs">
        {MODES.map((x) => <button key={x.id} className={x.id === mode ? 'on' : ''} onClick={() => setMode(x.id)}>{x.name}</button>)}
      </div>
      <p className="tp-sub">{m.info}</p>
      <div className="tp-form">
        {(mode === 'sprint' || mode === 'race') && (
          <label>Textquelle
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.filter((s) => mode === 'sprint' || s.id !== 'zitate').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              {d.lists.map((l) => <option key={l.id} value={`liste:${l.id}`}>Eigene Liste: {l.name}</option>)}
            </select>
          </label>
        )}
        {mode === 'sprint' && (
          <label>Zeit
            <select value={time} onChange={(e) => setTime(+e.target.value)}>
              {[15, 30, 60, 120].map((t) => <option key={t} value={t}>{t} Sekunden</option>)}
              <option value={0}>Ohne Zeitlimit (40 Wörter)</option>
            </select>
          </label>
        )}
        {mode === 'code' && (
          <label>Sprache
            <select value={codeLang} onChange={(e) => setCodeLang(e.target.value)}>
              <option value="">Alle</option>
              {[...new Set(SNIPPETS.map((s) => s.lang))].map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
        )}
        {mode === 'race' && (
          <fieldset>
            <legend>Gegner</legend>
            {[...BOTS.map((b) => `${b.name}`), 'Geist'].map((n) => {
              const b = BOTS.find((x) => x.name === n);
              return (
                <label key={n} className="tp-check">
                  <input type="checkbox" checked={bots.includes(n)} onChange={() => setBots((a) => toggle(a, n))} />
                  {n} {b ? `(${b.wpm} WPM)` : ghostWpm ? `(deine Bestzeit: ${ghostWpm} WPM)` : '(erst nach einer Übung)'}
                </label>
              );
            })}
          </fieldset>
        )}
        <fieldset>
          <legend>Zusatzregeln</legend>
          <label className="tp-check"><input type="checkbox" checked={hard} onChange={(e) => { setHard(e.target.checked); if (e.target.checked) setZen(false); }} />Hardcore – ein Fehler startet neu</label>
          <label className="tp-check"><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />Blind – Getipptes verschwindet</label>
          <label className="tp-check"><input type="checkbox" checked={zen} onChange={(e) => { setZen(e.target.checked); if (e.target.checked) setHard(false); }} />Zen – keine Zeit, kein Tempo</label>
        </fieldset>
      </div>
      <button className="tp-btn main" onClick={() => { setGo(true); setRound((n) => n + 1); }}>Los geht’s</button>
    </section>
  );
}

// ───────── Schwachstellen ─────────

export function Weak() {
  const d = useData();
  const [go, setGo] = useState(false);
  const [round, setRound] = useState(0);
  const layout = layoutById(d.settings.layout);
  const weak = useMemo(() => weakKeys(d.keys, 8), [d.keys]);
  const pairs = useMemo(() => weakPairs(d.pairs), [d.pairs]);
  const gen = useMemo(() => weakText(d.keys, d.settings.lang, 40), [round, go]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = Object.values(d.keys).reduce((a, k) => a + k.n, 0);

  if (go) {
    return (
      <section>
        <button className="tp-link" onClick={() => setGo(false)}>‹ Übersicht</button>
        <TextRun text={gen.text} mode="schwachstellen" prompt={gen.weak.length ? <small>Übe: {gen.weak.map((c) => c.toUpperCase()).join(' ')}</small> : <small>Noch keine Schwächen erkannt – normale Wörter.</small>} onRestart={() => setRound((n) => n + 1)} onNext={() => setRound((n) => n + 1)} nextLabel="Nächste Runde" />
      </section>
    );
  }
  const heat = (ch: string) => {
    const k = d.keys[ch];
    return k && k.n >= 4 ? Math.min(1, (k.e / k.n) * 4) : 0;
  };
  return (
    <section>
      <h2>Schwachstellen-Training</h2>
      <p className="tp-sub">Das Programm merkt sich jeden Anschlag ({total.toLocaleString('de-DE')} bisher) und baut Übungen aus deinen schwächsten Tasten.</p>
      {weak.length === 0 ? (
        <p>Noch zu wenig Daten – mach erst ein paar Übungen in der Schreibschule oder im Training.</p>
      ) : (
        <>
          <h3>Schwächste Tasten</h3>
          <div className="tp-weak">
            {weak.map((w) => (
              <div key={w.ch}><b>{w.ch.toUpperCase()}</b><small>{Math.round(w.err * 100)} % Fehler · {Math.round(w.ms)} ms</small></div>
            ))}
          </div>
          {pairs.length > 0 && (
            <>
              <h3>Problematische Buchstabenpaare</h3>
              <div className="tp-weak">{pairs.map((p) => <div key={p.pair}><b>{p.pair}</b><small>{Math.round(p.rate * 100)} % Fehler</small></div>)}</div>
            </>
          )}
          <h3>Fehler-Wärmekarte</h3>
          <Keyboard layout={layout} heat={heat} />
        </>
      )}
      <button className="tp-btn main" onClick={() => { setGo(true); setRound((n) => n + 1); }}>Schwachstellen üben</button>
    </section>
  );
}
