import { useRef, useState, type ReactNode } from 'react';
import { LAYOUTS } from './layouts';
import { keySound } from './sound';
import { getData, replaceAll, resetAll, update, useSettings, type Settings as S, type TypingData } from './store';

export const WALLPAPERS: Record<S['wallpaper'], { name: string; swatch: string }> = {
  aurora: { name: 'Aurora', swatch: 'linear-gradient(135deg,#6a5cff,#37d6c1)' },
  sonnenuntergang: { name: 'Sonnenuntergang', swatch: 'linear-gradient(135deg,#ff6a88,#ffb36b)' },
  ozean: { name: 'Ozean', swatch: 'linear-gradient(135deg,#1c6dd0,#6fe3ff)' },
  wald: { name: 'Wald', swatch: 'linear-gradient(135deg,#1f8f5f,#b6e36b)' },
  graphit: { name: 'Graphit', swatch: 'linear-gradient(135deg,#3a3f4a,#8a93a6)' },
};
export const ACCENTS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ff453a'];
export const FONTS: Record<S['font'], { name: string; css: string }> = {
  sans: { name: 'System (SF)', css: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif" },
  rounded: { name: 'Rund', css: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Segoe UI', system-ui, sans-serif" },
  serif: { name: 'Serif (New York)', css: "'New York', ui-serif, Georgia, 'Times New Roman', serif" },
  mono: { name: 'Monospace (SF Mono)', css: "ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace" },
  jetbrains: { name: 'JetBrains Mono', css: "'JetBrains Mono', ui-monospace, monospace" },
  schreibmaschine: { name: 'Schreibmaschine', css: "'American Typewriter', 'Courier New', Courier, monospace" },
  hand: { name: 'Handschrift', css: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive" },
};

export function themeVars(s: S): Record<string, string> {
  return { '--tp-accent': s.accent, '--tp-font': FONTS[s.font].css, '--tp-size': `${s.size}px` };
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="tp-row">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <span className="tp-row-ctl">{children}</span>
    </label>
  );
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />;
}
function Segment<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="tp-seg" role="radiogroup">
      {options.map(([v, n]) => <button key={v} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{n}</button>)}
    </span>
  );
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

      <h3>Darstellung</h3>
      <div className="tp-group glass">
        <Row label="Erscheinungsbild"><Segment value={s.appearance} onChange={(v) => set('appearance', v)} options={[['auto', 'Auto'], ['hell', 'Hell'], ['dunkel', 'Dunkel']]} /></Row>
        <div className="tp-row col">
          <span>Hintergrund</span>
          <span className="tp-swatches">
            {(Object.keys(WALLPAPERS) as S['wallpaper'][]).map((k) => (
              <button key={k} className={'tp-wall' + (s.wallpaper === k ? ' on' : '')} style={{ background: WALLPAPERS[k].swatch }} title={WALLPAPERS[k].name} aria-label={WALLPAPERS[k].name} onClick={() => set('wallpaper', k)} />
            ))}
          </span>
        </div>
        <div className="tp-row col">
          <span>Akzentfarbe</span>
          <span className="tp-swatches">
            {ACCENTS.map((c) => <button key={c} className={'tp-dot' + (s.accent === c ? ' on' : '')} style={{ background: c }} aria-label={c} onClick={() => set('accent', c)} />)}
            <input type="color" className="tp-colorpick" value={s.accent} aria-label="Eigene Farbe" onChange={(e) => set('accent', e.target.value)} />
          </span>
        </div>
        <Row label="Konfetti bei guten Ergebnissen"><Toggle on={s.confetti} onChange={(v) => set('confetti', v)} /></Row>
      </div>

      <h3>Text</h3>
      <div className="tp-group glass">
        <Row label="Schriftart"><select value={s.font} onChange={(e) => set('font', e.target.value as S['font'])}>{Object.entries(FONTS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></Row>
        <Row label={`Schriftgröße (${s.size} px)`}><input type="range" min={16} max={44} value={s.size} onChange={(e) => set('size', +e.target.value)} /></Row>
        <Row label="Cursor"><Segment value={s.cursor} onChange={(v) => set('cursor', v)} options={[['linie', 'Linie'], ['block', 'Block'], ['unterstrich', 'Strich']]} /></Row>
        <div className="tp-preview tp-text"><span className="ok">Vorschau: Der schnelle </span><span className="cur">b</span><span>raune Fuchs springt.</span></div>
      </div>

      <h3>Ton</h3>
      <div className="tp-group glass">
        <Row label="Tastenklang">
          <select value={s.sound} onChange={(e) => { set('sound', e.target.value as S['sound']); setTimeout(() => keySound('ok'), 50); }}>
            <option value="aus">Aus</option><option value="weich">Weich</option><option value="mechanisch">Mechanisch</option><option value="schreibmaschine">Schreibmaschine</option>
          </select>
        </Row>
        <Row label="Lautstärke"><input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set('volume', +e.target.value)} onPointerUp={() => keySound('ok')} /></Row>
      </div>

      <h3>Tippen</h3>
      <div className="tp-group glass">
        <Row label="Sprache der Texte"><Segment value={s.lang} onChange={(v) => set('lang', v)} options={[['de', 'Deutsch'], ['en', 'English']]} /></Row>
        <Row label="Tastatur-Anzeige beim Tippen"><Toggle on={s.showKb} onChange={(v) => set('showKb', v)} /></Row>
        <Row label="Tastaturbelegung" hint="Nur für die Anzeige"><select value={s.layout} onChange={(e) => set('layout', e.target.value)}>{LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Row>
        <Row label="Bei Fehler anhalten" hint="Falsche Tasten werden nicht übernommen"><Toggle on={s.stopOnError} onChange={(v) => set('stopOnError', v)} /></Row>
        <Row label={`Tagesziel (${s.goalMin} min)`}><input type="range" min={2} max={60} value={s.goalMin} onChange={(e) => set('goalMin', +e.target.value)} /></Row>
      </div>

      <h3>Daten</h3>
      <p className="tp-sub">Alles liegt nur in diesem Browser. Sichere es als Datei, um es auf einem anderen Gerät zu laden.</p>
      <div className="tp-btns left">
        <button className="tp-btn" onClick={() => download(`tippen-${new Date().toLocaleDateString('sv-SE')}.json`, JSON.stringify(getData(), null, 1))}>Exportieren</button>
        <button className="tp-btn" onClick={() => file.current?.click()}>Importieren</button>
        <button className="tp-btn danger" onClick={() => { if (confirm('Wirklich ALLE Daten (Fortschritt, Texte, Karten) löschen?')) { resetAll(); setMsg('Zurückgesetzt.'); } }}>Alles zurücksetzen</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
      </div>
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
