import { useEffect, useMemo, useState } from 'react';
import type { SLogShot, SSaved, SSettings } from './data';
import { type Ship, newSide } from './engine';
import SeaGrid from './SeaGrid';
import { genTactic, tacticOk } from './tactics';
import { sfx } from '../shared/sfx';

const LET = 'ABCDEFGHIJKLMNOP';

// ───────── Taktik-Aufgaben ─────────

export function TacticView({ S, seedStart, daily, solved, streak, best, onResult, onBack }: {
  S: SSettings; seedStart: number; daily?: boolean; solved: number; streak: number; best: number;
  onResult: (ok: boolean) => void; onBack: () => void;
}) {
  const [seed, setSeed] = useState(seedStart);
  const [spacing, setSpacing] = useState(false);
  const t = useMemo(() => genTactic(seed, spacing), [seed, spacing]);
  const [res, setRes] = useState<null | { cell: number; ok: boolean }>(null);
  useEffect(() => { setRes(null); }, [seed, spacing]);
  const pick = (i: number) => {
    if (!t || res || t.shots[i]) return;
    const ok = tacticOk(t, i);
    setRes({ cell: i, ok });
    sfx(ok ? 'good' : 'bad');
    onResult(ok);
  };
  return (
    <div className="ss-sub-view">
      <header className="ss-subhead"><button onClick={onBack}>← Menü</button><h2>{daily ? 'Aufgabe des Tages' : 'Taktik'}</h2><span>{solved} gelöst · Serie {streak} (Rekord {best})</span></header>
      {!t && <p>Keine Aufgabe gefunden. <button onClick={() => setSeed((s) => s + 1)}>Nochmal</button></p>}
      {t && (
        <div className="ss-task">
          <div className="ss-gridwrap">
            <SeaGrid n={t.rules.n} ships={t.sunk} shots={t.shots} coords={S.coords} sweep={false} interactive={!res} heat={res ? t.heat : null} pending={res ? [res.cell] : []} label="Taktik-Aufgabe" onCell={pick} />
          </div>
          <div className="ss-ptext">
            <h3>Wo schießt du als Nächstes?</h3>
            <p>Das ist die Lage im Gefecht. Noch nicht versenkt: <b>{t.remaining.join(', ')}</b>. Wähle das Feld, auf dem am wahrscheinlichsten ein Schiff liegt.</p>
            {res && <div className={`ss-msg ${res.ok ? 'ok' : 'bad'}`}><b>{res.ok ? 'Gut gezielt!' : 'Das war nicht das beste Feld.'}</b><p>Die Karte zeigt, wie viele Schiffsplatzierungen jedes Feld abdecken – heller bedeutet wahrscheinlicher. Dein Feld: {Math.round((t.heat[res.cell] / t.max) * 100)} % des Besten.</p></div>}
            <div className="ss-actions">
              {res && <button className="primary" onClick={() => setSeed((s) => (daily ? s + 1 : (Math.random() * 1e6) | 0))}>Nächste Aufgabe</button>}
              {!res && <button onClick={() => { setRes({ cell: t.best[0], ok: false }); }}>Lösung zeigen</button>}
              <label className="ss-check"><input type="checkbox" checked={spacing} onChange={(e) => setSpacing(e.target.checked)} /> mit Abstandsregel</label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── Nachspielen ─────────

export function ReplayView({ saved, S, onBack }: { saved: SSaved; S: SSettings; onBack: () => void }) {
  const n = saved.rules.n;
  const [at, setAt] = useState(saved.log.length);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setAt((a) => Math.max(0, a - 1)); else if (e.key === 'ArrowRight') setAt((a) => Math.min(saved.log.length, a + 1)); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [saved.log.length]);
  const fleets: [Ship[], Ship[]] = useMemo(() => [0, 1].map((p) => saved.fleets[p].map((cells, id) => ({ id, len: cells.length, cells }))) as [Ship[], Ship[]], [saved]);
  const sides = useMemo(() => {
    const s0 = newSide(n, fleets[0]), s1 = newSide(n, fleets[1]);
    for (let k = 0; k < at; k++) {
      const e: SLogShot = saved.log[k];
      if (e.kind === 'radar') continue;
      (e.by === 0 ? s1 : s0).shots[e.i] = e.kind === 'wasser' ? 1 : 2;
    }
    return [s0, s1] as const;
  }, [at, saved, fleets, n]);
  const cur = at > 0 ? saved.log[at - 1] : null;
  const lbl = cur ? `${cur.by === 0 ? 'Spieler 1' : 'Spieler 2 / KI'}: ${LET[cur.i % n]}${Math.floor(cur.i / n) + 1} – ${cur.kind === 'radar' ? `Radar (${cur.extra})` : cur.kind}` : 'Grundstellung';
  return (
    <div className="ss-sub-view">
      <header className="ss-subhead"><button onClick={onBack}>← Archiv</button><h2>Gefecht nachspielen</h2><span>{saved.mode} · {saved.date}</span></header>
      <div className="ss-board2">
        <section><header><h3>Flotte 2 (beschossen von 1)</h3></header><div className="ss-gridwrap"><SeaGrid n={n} ships={fleets[1]} shots={sides[1].shots} coords={S.coords} lastShots={cur && cur.by === 0 ? [cur.i] : []} label="Flotte 2" /></div></section>
        <section><header><h3>Flotte 1 (beschossen von 2)</h3></header><div className="ss-gridwrap"><SeaGrid n={n} ships={fleets[0]} shots={sides[0].shots} coords={S.coords} lastShots={cur && cur.by === 1 ? [cur.i] : []} label="Flotte 1" /></div></section>
      </div>
      <div className="ss-console">
        <p className="ss-turn">Schuss {at} / {saved.log.length} – {lbl}</p>
        <input type="range" min={0} max={saved.log.length} value={at} onChange={(e) => setAt(+e.target.value)} className="ss-slider" aria-label="Schuss" />
        <div className="ss-actions"><button onClick={() => setAt(0)}>⏮</button><button onClick={() => setAt(Math.max(0, at - 1))}>◀</button><button onClick={() => setAt(Math.min(saved.log.length, at + 1))}>▶</button><button onClick={() => setAt(saved.log.length)}>⏭</button></div>
        <p className="ss-sub">{saved.result}</p>
      </div>
    </div>
  );
}

// ───────── Tipps ─────────

const TIPS: { title: string; text: string }[] = [
  { title: 'Aufstellen', text: 'Meide Muster. Viele Spieler drängen Schiffe an den Rand oder in die Ecken – eine KI weiß das. Verteile die Flotte und setze mindestens ein Schiff in die Mitte, ein anderes an den Rand. Mit der Abstandsregel brauchst du Lücken zwischen allen Schiffen.' },
  { title: 'Suchen im Schachbrett-Muster', text: 'Das kleinste Schiff ist 2 Felder lang. Schießt du nur auf jedes zweite Feld (wie die schwarzen Felder eines Schachbretts), triffst du garantiert jedes Schiff – mit der Hälfte der Schüsse.' },
  { title: 'Treffer verfolgen', text: 'Nach einem Treffer prüfe die vier Nachbarfelder. Sobald zwei Felder getroffen sind, kennst du die Richtung: Schieße in der Linie weiter, bis Wasser kommt, dann auf die andere Seite.' },
  { title: 'Wahrscheinlichkeit', text: 'Felder in der Mitte werden von mehr möglichen Schiffspositionen überdeckt als Randfelder. Wo viele Platzierungen möglich sind, liegt häufiger ein Schiff. Die Taktik-Aufgaben trainieren genau das – mit der Wahrscheinlichkeitskarte als Lösung.' },
  { title: 'Abstandsregel', text: 'Wenn Schiffe sich nicht berühren dürfen, sind nach dem Versenken alle Nachbarfelder (auch diagonal) Wasser. Das spart viele Schüsse – streiche sie im Kopf.' },
  { title: 'Salven, Radar, Nebel', text: 'Bei Salven wird früh ein Schiff zu verlieren schmerzhaft: Du hast weniger Schüsse. Radar zeigt dir, ob ein 3×3-Feld Schiffsfelder enthält – nutze es dort, wo viel Platz ungeprüft ist. Im Nebel wird „versenkt“ nicht gemeldet: Zähle die getroffenen Felder und schließe selbst auf die Schiffslänge.' },
];

export function TipsView({ onBack }: { onBack: () => void }) {
  return (
    <div className="ss-sub-view">
      <header className="ss-subhead"><button onClick={onBack}>← Menü</button><h2>Taktik-Handbuch</h2></header>
      <div className="ss-tips">{TIPS.map((t, i) => <article key={i}><i>{i + 1}</i><h3>{t.title}</h3><p>{t.text}</p></article>)}</div>
    </div>
  );
}
