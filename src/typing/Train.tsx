import { useEffect, useMemo, useState } from 'react';
import { QUOTES, SNIPPETS } from './data';
import { dailyText, randomSnippet, shuffle, sourceText, SOURCES, weakKeys, weakPairs, weakText } from './gen';
import Keyboard from './Keyboard';
import { layoutById } from './layouts';
import TextRun from './TextRun';
import { useData } from './store';

type Mode = 'sprint' | 'quotes' | 'code' | 'wiki' | 'daily';
const MODES: { id: Mode; name: string; info: string }[] = [
  { id: 'sprint', name: 'Sprint', info: 'Tippe so viel du kannst in 15 bis 120 Sekunden.' },
  { id: 'quotes', name: 'Zitate', info: 'Kluge Sätze abtippen.' },
  { id: 'code', name: 'Code', info: 'HTML, CSS, JavaScript, Python, SQL und mehr.' },
  { id: 'wiki', name: 'Wikipedia', info: 'Zufälliger Artikel-Anfang (lädt online).' },
  { id: 'daily', name: 'Tagestext', info: 'Heute für alle derselbe Text – vergleichbar mit gestern.' },
];

function cleanWiki(s: string): string {
  const t = s
    .replace(/[„“”«»]/g, '"').replace(/[‘’´`]/g, "'").replace(/[–—−]/g, '-').replace(/[   ]/g, ' ')
    .replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ')
    .replace(/[^\wäöüÄÖÜß .,;:!?()\-"'%€/0-9]/g, '').trim();
  const cut = t.slice(0, 380);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'));
  return end > 120 ? cut.slice(0, end + 1) : cut;
}

export default function Train({ initial, autoStart }: { initial?: Mode; autoStart?: boolean }) {
  const d = useData();
  const lang = d.settings.lang;
  const [mode, setMode] = useState<Mode>(initial ?? 'sprint');
  const [source, setSource] = useState(lang === 'en' ? 'englisch' : 'mix');
  const [time, setTime] = useState(60);
  const [hard, setHard] = useState(false);
  const [blind, setBlind] = useState(false);
  const [zen, setZen] = useState(false);
  const [codeLang, setCodeLang] = useState('');
  const [round, setRound] = useState(0);
  const [go, setGo] = useState(!!autoStart);
  const [wiki, setWiki] = useState<{ text: string; title: string } | 'laden' | 'fehler'>('laden');

  const gen = useMemo(() => {
    switch (mode) {
      case 'sprint': return { text: sourceText(source, time > 0 && !zen ? 1800 : 380), prompt: null as React.ReactNode };
      case 'quotes': {
        const q = shuffle(QUOTES).slice(0, 3);
        return { text: q.map((x) => x.text).join(' '), prompt: <small>{q.map((x) => x.by).join(' · ')}</small> };
      }
      case 'code': { const s = randomSnippet(codeLang); return { text: s.code, prompt: <small>{s.lang} · {s.title} – Enter für neue Zeile, ohne Einrückung</small> }; }
      case 'daily': return { text: dailyText(), prompt: <small>Tagestext vom {new Date().toLocaleDateString('de-DE')}</small> };
      default: return { text: '', prompt: null };
    }
  }, [mode, source, time, zen, round, codeLang]); // eslint-disable-line react-hooks/exhaustive-deps

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
          prompt={gen.prompt} recordKeys={mode !== 'code'}
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
      <div className="tp-form glass">
        {mode === 'sprint' && (
          <>
            <label>Thema
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Zeit
              <select value={time} onChange={(e) => setTime(+e.target.value)}>
                {[15, 30, 60, 120].map((t) => <option key={t} value={t}>{t} Sekunden</option>)}
                <option value={0}>Ohne Zeitlimit (ca. 3 Sätze)</option>
              </select>
            </label>
          </>
        )}
        {mode === 'code' && (
          <label>Sprache
            <select value={codeLang} onChange={(e) => setCodeLang(e.target.value)}>
              <option value="">Alle</option>
              {[...new Set(SNIPPETS.map((s) => s.lang))].map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
        )}
        <label className="tp-check"><span>Hardcore – ein Fehler startet neu</span><input type="checkbox" checked={hard} onChange={(e) => { setHard(e.target.checked); if (e.target.checked) setZen(false); }} /></label>
        <label className="tp-check"><span>Blind – Getipptes verschwindet</span><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /></label>
        <label className="tp-check"><span>Zen – keine Zeit, kein Tempo</span><input type="checkbox" checked={zen} onChange={(e) => { setZen(e.target.checked); if (e.target.checked) setHard(false); }} /></label>
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
  const gen = useMemo(() => weakText(d.keys), [round, go]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = Object.values(d.keys).reduce((a, k) => a + k.n, 0);

  if (go) {
    return (
      <section>
        <button className="tp-link" onClick={() => setGo(false)}>‹ Übersicht</button>
        <TextRun text={gen.text} mode="schwachstellen" prompt={gen.weak.length ? <small>Texte mit vielen: {gen.weak.map((c) => c.toUpperCase()).join(' ')}</small> : <small>Noch keine Schwächen erkannt – gemischte Texte.</small>} onRestart={() => setRound((n) => n + 1)} onNext={() => setRound((n) => n + 1)} nextLabel="Nächste Runde" />
      </section>
    );
  }
  const heat = (ch: string) => {
    const k = d.keys[ch];
    return k && k.n >= 4 ? Math.min(1, (k.e / k.n) * 4) : 0;
  };
  return (
    <section>
      <h2>Schwachstellen</h2>
      <p className="tp-sub">Das Programm merkt sich jeden Anschlag ({total.toLocaleString('de-DE')} bisher) und wählt Texte, in denen deine schwächsten Buchstaben besonders oft vorkommen.</p>
      {weak.length === 0 ? (
        <p>Noch zu wenig Daten – mach erst ein paar Übungen in der Schreibschule oder im Training.</p>
      ) : (
        <>
          <h3>Schwächste Tasten</h3>
          <div className="tp-weak">
            {weak.map((w) => (
              <div key={w.ch} className="glass"><b>{w.ch.toUpperCase()}</b><small>{Math.round(w.err * 100)} % Fehler · {Math.round(w.ms)} ms</small></div>
            ))}
          </div>
          {pairs.length > 0 && (
            <>
              <h3>Problematische Buchstabenpaare</h3>
              <div className="tp-weak">{pairs.map((p) => <div key={p.pair} className="glass"><b>{p.pair}</b><small>{Math.round(p.rate * 100)} % Fehler</small></div>)}</div>
            </>
          )}
          <h3>Fehler-Wärmekarte</h3>
          <div className="glass tp-pad"><Keyboard layout={layout} heat={heat} /></div>
        </>
      )}
      <button className="tp-btn main" onClick={() => { setGo(true); setRound((n) => n + 1); }}>Schwachstellen-Texte üben</button>
    </section>
  );
}
