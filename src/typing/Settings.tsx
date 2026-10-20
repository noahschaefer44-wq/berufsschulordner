import { useRef, useState } from 'react';
import { LAYOUTS } from './layouts';
import { keySound } from './sound';
import { getData, replaceAll, resetAll, update, useSettings, type Settings as S, type TypingData } from './store';

export const THEMES: Record<string, { name: string; bg: string; fg: string; accent: string }> = {
  dunkel: { name: 'Dunkel', bg: '#101216', fg: '#e8eaed', accent: '#4fb07a' },
  terminal: { name: 'Terminal', bg: '#020a03', fg: '#37ff6b', accent: '#37ff6b' },
  papier: { name: 'Papier', bg: '#f6f1e6', fg: '#2b2a28', accent: '#b5552e' },
  neon: { name: 'Neon', bg: '#0c0620', fg: '#f4e9ff', accent: '#ff3fd0' },
  eigen: { name: 'Eigene Farben', bg: '#101216', fg: '#e8eaed', accent: '#4fb07a' },
};
export const FONTS: Record<S['font'], { name: string; css: string }> = {
  mono: { name: 'Monospace', css: "ui-monospace, 'Cascadia Mono', Consolas, monospace" },
  jetbrains: { name: 'JetBrains Mono', css: "'JetBrains Mono', ui-monospace, monospace" },
  sans: { name: 'Sans-Serif', css: "system-ui, 'Segoe UI', sans-serif" },
  serif: { name: 'Serif', css: "Georgia, 'Times New Roman', serif" },
  schreibmaschine: { name: 'Schreibmaschine', css: "'Courier New', Courier, monospace" },
  hand: { name: 'Handschrift', css: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" },
};

export function themeVars(s: S): Record<string, string> {
  const t = s.theme === 'eigen' ? { bg: s.bg, fg: s.fg, accent: s.accent } : THEMES[s.theme];
  const light = parseInt(t.bg.slice(1, 3), 16) > 150;
  return {
    '--tp-bg': t.bg, '--tp-fg': t.fg, '--tp-accent': t.accent,
    '--tp-dim': `color-mix(in srgb, ${t.fg} 55%, ${t.bg})`,
    '--tp-line': `color-mix(in srgb, ${t.fg} 16%, ${t.bg})`,
    '--tp-panel': `color-mix(in srgb, ${t.fg} 6%, ${t.bg})`,
    '--tp-key': `color-mix(in srgb, ${t.fg} 10%, ${t.bg})`,
    '--tp-on-accent': light ? '#fff' : '#06130a',
    '--tp-font': FONTS[s.font].css, '--tp-size': `${s.size}px`,
  };
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Settings() {
  const s = useSettings();
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof S>(k: K, v: S[K]) => update((d) => { d.settings = { ...d.settings, [k]: v }; });

  async function importFile(f?: File) {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()) as TypingData;
      if (j.v !== 1 || !j.settings) throw new Error('format');
      if (confirm('Alle aktuellen Daten durch die Datei ersetzen?')) { replaceAll(j); setMsg('Importiert.'); }
    } catch { setMsg('Datei nicht lesbar.'); }
  }

  return (
    <section>
      <h2>Einstellungen</h2>

      <h3>Aussehen</h3>
      <div className="tp-form">
        <label>Farbschema
          <select value={s.theme} onChange={(e) => set('theme', e.target.value as S['theme'])}>{Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
        </label>
        {s.theme === 'eigen' && (
          <div className="tp-colors">
            <label>Hintergrund<input type="color" value={s.bg} onChange={(e) => set('bg', e.target.value)} /></label>
            <label>Schrift<input type="color" value={s.fg} onChange={(e) => set('fg', e.target.value)} /></label>
            <label>Akzent<input type="color" value={s.accent} onChange={(e) => set('accent', e.target.value)} /></label>
          </div>
        )}
        <label>Schriftart
          <select value={s.font} onChange={(e) => set('font', e.target.value as S['font'])}>{Object.entries(FONTS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
        </label>
        <label>Schriftgröße: {s.size} px<input type="range" min={16} max={44} value={s.size} onChange={(e) => set('size', +e.target.value)} /></label>
        <label>Cursor
          <select value={s.cursor} onChange={(e) => set('cursor', e.target.value as S['cursor'])}><option value="block">Block</option><option value="linie">Linie</option><option value="unterstrich">Unterstrich</option></select>
        </label>
        <label className="tp-check"><input type="checkbox" checked={s.showKb} onChange={(e) => set('showKb', e.target.checked)} />Tastatur mit Fingerhilfe anzeigen</label>
        <label className="tp-check"><input type="checkbox" checked={s.confetti} onChange={(e) => set('confetti', e.target.checked)} />Konfetti bei guten Ergebnissen</label>
      </div>
      <div className="tp-preview tp-text"><span className="ok">Vorschau: Der schnelle </span><span className="cur">b</span><span>raune Fuchs …</span></div>

      <h3>Ton</h3>
      <div className="tp-form">
        <label>Tastenklang
          <select value={s.sound} onChange={(e) => { set('sound', e.target.value as S['sound']); setTimeout(() => keySound('ok'), 50); }}>
            <option value="aus">Aus</option><option value="weich">Weich</option><option value="mechanisch">Mechanisch</option><option value="schreibmaschine">Schreibmaschine</option>
          </select>
        </label>
        <label>Lautstärke<input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set('volume', +e.target.value)} onMouseUp={() => keySound('ok')} /></label>
      </div>

      <h3>Tippen</h3>
      <div className="tp-form">
        <label>Tastaturbelegung
          <select value={s.layout} onChange={(e) => set('layout', e.target.value)}>{LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        </label>
        <p className="tp-sub">Die Belegung bestimmt die Anzeige der Tasten und die Reihenfolge in der Schreibschule. Die Eingabe selbst kommt vom Betriebssystem – stelle dort dieselbe Belegung ein.</p>
        <label>Sprache der Übungswörter
          <select value={s.lang} onChange={(e) => set('lang', e.target.value as 'de' | 'en')}><option value="de">Deutsch</option><option value="en">Englisch</option></select>
        </label>
        <label className="tp-check"><input type="checkbox" checked={s.stopOnError} onChange={(e) => set('stopOnError', e.target.checked)} />Bei Fehler anhalten (falsche Tasten werden nicht übernommen)</label>
        <label>Tagesziel: {s.goalMin} Minuten<input type="range" min={2} max={60} value={s.goalMin} onChange={(e) => set('goalMin', +e.target.value)} /></label>
      </div>

      <h3>Daten</h3>
      <p className="tp-sub">Alles liegt nur in diesem Browser. Sichere es als Datei, um es auf einem anderen Gerät zu laden.</p>
      <div className="tp-btns left">
        <button className="tp-btn" onClick={() => download(`tippen-${new Date().toLocaleDateString('sv-SE')}.json`, JSON.stringify(getData(), null, 1))}>Exportieren</button>
        <button className="tp-btn" onClick={() => file.current?.click()}>Importieren</button>
        <button className="tp-btn ghost" onClick={() => { if (confirm('Wirklich ALLE Daten (Fortschritt, Texte, Karten) löschen?')) { resetAll(); setMsg('Zurückgesetzt.'); } }}>Alles zurücksetzen</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
      </div>
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
