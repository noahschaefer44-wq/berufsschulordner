import { useState } from 'react';
import Keyboard from './Keyboard';
import { layoutById } from './layouts';
import { BADGES, dayKey, levelOf, streak, useData, xpForLevel } from './store';

export function Progress({ value, max }: { value: number; max: number }) {
  return <div className="tp-bar"><i style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} /></div>;
}

function Chart({ values, label }: { values: number[]; label: string }) {
  const w = 640, h = 180, pad = 28;
  if (values.length < 2) return <p className="tp-sub">Noch zu wenig Daten für ein Diagramm.</p>;
  const max = Math.ceil(Math.max(...values, 20) / 10) * 10;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad - 8);
  const y = (v: number) => h - pad - (v / max) * (h - pad - 10);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="tp-chart" role="img" aria-label={label}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad} x2={w - 8} y1={y(max * f)} y2={y(max * f)} stroke="var(--tp-line)" />
          <text x={2} y={y(max * f) + 4} fontSize="11" fill="var(--tp-dim)">{Math.round(max * f)}</text>
        </g>
      ))}
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--tp-accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="var(--tp-accent)" />)}
    </svg>
  );
}

export default function Stats() {
  const d = useData();
  const layout = layoutById(d.settings.layout);
  const [heat, setHeat] = useState<'fehler' | 'tempo'>('fehler');
  const last = d.runs.slice(-40);
  const lv = levelOf(d.xp);
  const today = Math.round((d.days[dayKey()] ?? 0) / 60 * 10) / 10;
  const chars = d.runs.reduce((a, r) => a + r.chars, 0);
  const secs = d.runs.reduce((a, r) => a + r.secs, 0);
  const best = d.runs.reduce((a, r) => Math.max(a, r.wpm), 0);
  const avg = last.length ? Math.round(last.reduce((a, r) => a + r.wpm, 0) / last.length) : 0;
  const acc = last.length ? Math.round((last.reduce((a, r) => a + r.acc, 0) / last.length) * 10) / 10 : 0;

  const timeAvg = (() => {
    const v = Object.values(d.keys).filter((k) => k.c > 3).map((k) => k.ms / k.c);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 300;
  })();
  const heatFn = (ch: string) => {
    const k = d.keys[ch];
    if (!k || k.n < 4) return 0;
    return heat === 'fehler' ? Math.min(1, (k.e / k.n) * 4) : k.c ? Math.max(0, Math.min(1, (k.ms / k.c - timeAvg) / timeAvg)) : 0;
  };
  const week = Array.from({ length: 7 }, (_, i) => {
    const t = new Date(); t.setDate(t.getDate() - (6 - i));
    return { day: t.toLocaleDateString('de-DE', { weekday: 'short' }), min: (d.days[dayKey(t.getTime())] ?? 0) / 60 };
  });
  const wmax = Math.max(10, ...week.map((x) => x.min));

  return (
    <section>
      <h2>Statistik</h2>
      <div className="tp-cards">
        <div><b>{best}</b><small>Bestes WPM</small></div>
        <div><b>{avg}</b><small>Ø WPM (letzte 40)</small></div>
        <div><b>{acc} %</b><small>Ø Genauigkeit</small></div>
        <div><b>{streak(d)}</b><small>Tage in Folge</small></div>
        <div><b>{chars.toLocaleString('de-DE')}</b><small>Zeichen gesamt</small></div>
        <div><b>{Math.round(secs / 60)} min</b><small>Übungszeit</small></div>
      </div>

      <h3>Level {lv}</h3>
      <Progress value={d.xp - xpForLevel(lv)} max={xpForLevel(lv + 1) - xpForLevel(lv)} />
      <p className="tp-sub">{d.xp} XP · noch {xpForLevel(lv + 1) - d.xp} XP bis Level {lv + 1}</p>

      <h3>Tagesziel</h3>
      <Progress value={today} max={d.settings.goalMin} />
      <p className="tp-sub">Heute {today} von {d.settings.goalMin} Minuten {today >= d.settings.goalMin ? '– geschafft!' : ''}</p>
      <div className="tp-week">
        {week.map((w, i) => <div key={i}><i style={{ height: `${(w.min / wmax) * 100}%` }} /><small>{w.day}</small></div>)}
      </div>

      <h3>Tempo-Verlauf (WPM)</h3>
      <Chart values={last.map((r) => r.wpm)} label="WPM der letzten Übungen" />
      <h3>Genauigkeit (%)</h3>
      <Chart values={last.map((r) => r.acc)} label="Genauigkeit der letzten Übungen" />

      <h3>Tastatur-Wärmekarte</h3>
      <div className="tp-tabs">
        <button className={heat === 'fehler' ? 'on' : ''} onClick={() => setHeat('fehler')}>Fehler</button>
        <button className={heat === 'tempo' ? 'on' : ''} onClick={() => setHeat('tempo')}>Langsame Tasten</button>
      </div>
      <Keyboard layout={layout} heat={heatFn} />

      <h3>Abzeichen ({d.badges.length}/{BADGES.length})</h3>
      <div className="tp-badges">
        {BADGES.map((b) => <div key={b.id} className={d.badges.includes(b.id) ? 'on' : ''} title={b.info}><span>{d.badges.includes(b.id) ? '🏅' : '🔒'}</span><b>{b.name}</b><small>{b.info}</small></div>)}
      </div>

      <h3>Letzte Übungen</h3>
      {d.runs.length === 0 ? <p className="tp-sub">Noch nichts getippt.</p> : (
        <table className="tp-table">
          <thead><tr><th>Wann</th><th>Modus</th><th>WPM</th><th>Genauigkeit</th></tr></thead>
          <tbody>
            {d.runs.slice(-12).reverse().map((r, i) => (
              <tr key={i}><td>{new Date(r.t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>{r.mode}</td><td>{r.wpm}</td><td>{r.acc} %</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
