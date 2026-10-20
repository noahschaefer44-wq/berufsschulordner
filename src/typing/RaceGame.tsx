import { useEffect, useMemo, useRef, useState } from 'react';
import { SOURCES, sourceText } from './gen';
import { beep, winSound } from './sound';
import TextRun, { Confetti } from './TextRun';
import { update, useData, type TypingData } from './store';

// ───────── Strecken ─────────
interface TrackDef { id: string; name: string; d: string; grass: string; road: string; deco: string }
const TRACKS: TrackDef[] = [
  { id: 'wiese', name: 'Sonnenwiese', grass: '#8fdc6a', road: '#6c7a89', deco: '🌼',
    d: 'M 400 340 C 560 340 660 310 660 200 C 660 90 560 60 400 60 C 260 60 140 90 140 200 C 140 310 260 340 400 340 Z' },
  { id: 'kurven', name: 'Kurvenkönig', grass: '#ffd98a', road: '#7b6f66', deco: '🌵',
    d: 'M 120 300 C 80 200 140 100 260 100 C 340 100 360 180 430 180 C 520 180 540 90 640 100 C 730 110 740 260 650 310 C 560 350 460 300 380 310 C 280 320 200 360 120 300 Z' },
  { id: 'eis', name: 'Eisbahn', grass: '#d9f1ff', road: '#5b7b95', deco: '❄️',
    d: 'M 120 330 L 120 140 C 120 90 160 60 210 60 L 410 60 C 460 60 480 100 510 140 C 540 180 590 180 630 140 C 660 110 700 100 710 150 L 710 290 C 710 320 690 340 660 340 Z' },
];

// ───────── Mii-artige Fahrer ─────────
interface Driver { name: string; color: string; skin: string; hair: string }
const ME: Driver = { name: 'Du', color: '#00a9e0', skin: '#ffd9bd', hair: '#5a3a22' };
const BOTS: Driver[] = [
  { name: 'Mia', color: '#ff5d9e', skin: '#f6c7a5', hair: '#2b1b12' },
  { name: 'Ben', color: '#ffb020', skin: '#e7b189', hair: '#d9a441' },
  { name: 'Lea', color: '#3ecf6b', skin: '#ffe0c8', hair: '#a8442b' },
];

export function Mii({ d, size = 40 }: { d: Driver; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" className="wu-mii">
      <circle cx="20" cy="20" r="19" fill={d.color} />
      <ellipse cx="20" cy="22" rx="11" ry="12" fill={d.skin} />
      <path d="M8.5 19 C8 7 32 7 31.5 19 C27 13 13 13 8.5 19 Z" fill={d.hair} />
      <circle cx="15.5" cy="22" r="1.7" fill="#2b2b2b" /><circle cx="24.5" cy="22" r="1.7" fill="#2b2b2b" />
      <path d="M15 27.5 Q20 31 25 27.5" stroke="#2b2b2b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ───────── Gegner ─────────
interface Bot extends Driver { wpm: number; phase: number; finish: number }
const prog = (b: { wpm: number; phase: number }, t: number, len: number) => {
  if (t <= 0) return 0;
  const k = (b.wpm * 5) / 60 / len;
  return Math.min(1, k * (t + (0.06 / 0.9) * (Math.cos(b.phase) - Math.cos(0.9 * t + b.phase))));
};
function finishTime(b: { wpm: number; phase: number }, len: number) {
  let t = 0;
  while (prog(b, t, len) < 1 && t < 900) t += 0.05;
  return t;
}
const DIFFS: { name: string; mult: number }[] = [
  { name: 'Gemütlich', mult: 0.7 }, { name: 'Normal', mult: 0.92 }, { name: 'Schwer', mult: 1.08 }, { name: 'Profi', mult: 1.28 },
];
const POINTS = [10, 6, 3, 1];
const ordinal = (n: number) => `${n}.`;

function refWpm(d: TypingData): number {
  const rs = d.runs.filter((r) => r.acc >= 88 && r.wpm > 5).slice(-8);
  const v = rs.length ? rs.reduce((a, r) => a + r.wpm, 0) / rs.length : 30;
  return Math.max(12, Math.min(120, v));
}

interface Row { name: string; time: number; you: boolean; driver: Driver }

export default function RaceGame({ onExit }: { onExit: () => void }) {
  const d = useData();
  const [setup, setSetup] = useState({ track: 0, laps: 2, diff: 1, source: 'mix', gp: true });
  const [phase, setPhase] = useState<'setup' | 'count' | 'race' | 'done'>('setup');
  const [raceNo, setRaceNo] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [pts, setPts] = useState<number[]>([0, 0, 0, 0]);
  const [count, setCount] = useState(3);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [, force] = useState(0);
  const bots = useRef<Bot[]>([]);
  const go = useRef(0);
  const me = useRef({ target: 0, shown: 0, wpm: 0, streak: 0, errs: 0, spin: 0, speed: 0 });
  const path = useRef<SVGPathElement>(null);
  const refW = useMemo(() => refWpm(d), []); // eslint-disable-line react-hooks/exhaustive-deps

  const trackIdx = setup.gp ? raceNo % TRACKS.length : setup.track;
  const track = TRACKS[trackIdx];

  function begin(no: number) {
    const diff = DIFFS[setup.diff];
    const t = sourceText(setup.source, setup.laps * 130);
    bots.current = BOTS.map((b, i) => {
      const bot = { ...b, wpm: Math.round(refW * diff.mult * (0.86 + ((i * 0.13 + Math.random() * 0.12) % 0.3)) * 10) / 10, phase: Math.random() * 6, finish: 0 };
      bot.finish = finishTime(bot, t.length);
      return bot;
    });
    me.current = { target: 0, shown: 0, wpm: 0, streak: 0, errs: 0, spin: 0, speed: 0 };
    setText(t); setRows(null); setRaceNo(no); setAttempt((a) => a + 1); setCount(3); setPhase('count');
    go.current = 0;
    beep(440);
  }

  // Countdown
  useEffect(() => {
    if (phase !== 'count') return;
    const id = setInterval(() => {
      setCount((c) => {
        if (c <= 1) { clearInterval(id); beep(880, 0.4, 'square'); go.current = performance.now(); setPhase('race'); return 0; }
        beep(440);
        return c - 1;
      });
    }, 900);
    return () => clearInterval(id);
  }, [phase, attempt]);

  // Animationsschleife
  useEffect(() => {
    if (phase === 'setup') return;
    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const m = me.current;
      m.shown += (m.target - m.shown) * Math.min(1, dt * 10);
      m.speed += (m.wpm - m.speed) * Math.min(1, dt * 3);
      force((n) => (n + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  function finish(r: { wpm: number; acc: number }) {
    const T = Math.max(1, (performance.now() - go.current) / 1000);
    const all: Row[] = [{ name: 'Du', time: T, you: true, driver: ME }, ...bots.current.map((b) => ({ name: b.name, time: b.finish, you: false, driver: b as Driver }))].sort((a, b) => a.time - b.time);
    const place = all.findIndex((x) => x.you);
    setRows(all);
    setPts((p) => p.map((v, i) => v + POINTS[all.findIndex((x) => x.name === (i === 0 ? 'Du' : BOTS[i - 1].name))]));
    update((x) => { x.races += 1; if (place === 0) x.wins += 1; });
    void r;
    setPhase('done');
  }

  // Pokal nach dem dritten Rennen
  const lastRace = setup.gp && raceNo >= TRACKS.length - 1;
  const finalOrder = pts.map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p);
  const myCup = finalOrder.findIndex((x) => x.i === 0);
  const cupSaved = useRef(-1);
  useEffect(() => {
    if (phase === 'done' && lastRace && cupSaved.current !== attempt) {
      cupSaved.current = attempt;
      if (myCup <= 2) {
        const key = (['gold', 'silver', 'bronze'] as const)[myCup];
        update((x) => { x.cups = { ...x.cups, [key]: x.cups[key] + 1 }; });
      }
      if (myCup === 0) winSound();
    }
  }, [phase, lastRace, myCup, attempt]);

  // ───── Einstellungen ─────
  if (phase === 'setup') {
    return (
      <div className="wu-screen">
        <button className="wu-back" onClick={onExit}>‹ Spiele</button>
        <h2 className="wu-title">Tipp-Grand-Prix</h2>
        <p className="wu-sub">Je schneller du tippst, desto schneller fährt dein Kart. Deine Gegner passen sich deinem Tempo an (Richtwert: {Math.round(refW)} WPM).</p>
        <div className="wu-panel">
          <div className="wu-field"><span>Modus</span>
            <div className="wu-choices">
              <button className={setup.gp ? 'on' : ''} onClick={() => setSetup({ ...setup, gp: true })}>Grand Prix (3 Strecken)</button>
              <button className={!setup.gp ? 'on' : ''} onClick={() => setSetup({ ...setup, gp: false })}>Einzelrennen</button>
            </div>
          </div>
          {!setup.gp && (
            <div className="wu-field"><span>Strecke</span>
              <div className="wu-choices">{TRACKS.map((t, i) => <button key={t.id} className={setup.track === i ? 'on' : ''} onClick={() => setSetup({ ...setup, track: i })}>{t.deco} {t.name}</button>)}</div>
            </div>
          )}
          <div className="wu-field"><span>Länge</span>
            <div className="wu-choices">{[1, 2, 3].map((n) => <button key={n} className={setup.laps === n ? 'on' : ''} onClick={() => setSetup({ ...setup, laps: n })}>{n} {n === 1 ? 'Runde' : 'Runden'}</button>)}</div>
          </div>
          <div className="wu-field"><span>Gegner</span>
            <div className="wu-choices">{DIFFS.map((x, i) => <button key={x.name} className={setup.diff === i ? 'on' : ''} onClick={() => setSetup({ ...setup, diff: i })}>{x.name}</button>)}</div>
          </div>
          <div className="wu-field"><span>Texte</span>
            <select value={setup.source} onChange={(e) => setSetup({ ...setup, source: e.target.value })}>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </div>
        </div>
        <div className="wu-stats">
          <span>🏁 {d.races} Rennen</span><span>🥇 {d.wins} Siege</span><span>🏆 {d.cups.gold} · 🥈 {d.cups.silver} · 🥉 {d.cups.bronze}</span>
        </div>
        <button className="wu-go" onClick={() => { setPts([0, 0, 0, 0]); begin(0); }}>Rennen starten</button>
      </div>
    );
  }

  // ───── Rennen ─────
  const len = Math.max(1, text.length);
  const elapsed = go.current ? (performance.now() - go.current) / 1000 : 0;
  const m = me.current;
  const L = path.current?.getTotalLength() ?? 0;
  const lanes = [0, -16, 16, -32];
  const racers = [
    { drv: ME, p: phase === 'done' && rows ? 1 : m.shown, you: true },
    ...bots.current.map((b) => ({ drv: b as Driver, p: phase === 'count' ? 0 : prog(b, elapsed, len), you: false })),
  ];
  const standing = [...racers].map((r, i) => ({ ...r, i })).sort((a, b) => b.p - a.p);
  const myRank = standing.findIndex((s) => s.you) + 1;
  const lapNow = Math.min(setup.laps, Math.floor(m.shown * setup.laps) + 1);

  const kart = (r: { drv: Driver; p: number; you: boolean }, i: number) => {
    if (!L) return null;
    const total = r.p * setup.laps;
    const frac = r.p >= 1 ? 0.0005 : total % 1;
    const at = (f: number) => path.current!.getPointAtLength(((f % 1) + 1) % 1 * L);
    const a = at(frac), b = at(frac + 0.004);
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1;
    const off = lanes[i];
    const x = a.x + (nx / nl) * off, y = a.y + (ny / nl) * off;
    const spinning = r.you && performance.now() < m.spin;
    return (
      <g key={r.drv.name} transform={`translate(${x} ${y}) rotate(${ang + (spinning ? ((performance.now() % 300) / 300) * 360 : 0)})`}>
        {r.you && m.streak >= 15 && <path d="M-26 0 L-44 -5 L-38 0 L-44 5 Z" fill="#ff9a1f" className="wu-flame" />}
        <rect x="-16" y="-9" width="30" height="18" rx="7" fill={r.drv.color} stroke="#fff" strokeWidth="2.5" />
        <rect x="-18" y="-12" width="8" height="5" rx="2" fill="#222" /><rect x="-18" y="7" width="8" height="5" rx="2" fill="#222" />
        <rect x="8" y="-12" width="8" height="5" rx="2" fill="#222" /><rect x="8" y="7" width="8" height="5" rx="2" fill="#222" />
        <circle cx="-1" cy="0" r="7.5" fill={r.drv.skin} stroke="#fff" strokeWidth="1.5" />
        <path d="M-8 -1 C-8 -9 6 -9 6 -1 Z" fill={r.drv.hair} />
        {r.you && <text x="0" y="-18" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" stroke="#00a9e0" strokeWidth="3" paintOrder="stroke" transform={`rotate(${-ang})`}>DU</text>}
      </g>
    );
  };

  const speedKmh = Math.round(m.speed * 2.4);
  const gp = setup.gp;
  return (
    <div className="wu-screen race">
      <div className="wu-bar">
        <button className="wu-back" onClick={() => { setPhase('setup'); }}>✕ Beenden</button>
        <b>{track.deco} {track.name}{gp ? ` · Rennen ${raceNo + 1}/${TRACKS.length}` : ''}</b>
        <span className="wu-lap">Runde {lapNow}/{setup.laps}</span>
      </div>

      <div className="wu-tv" style={{ background: track.grass, ['--spd' as string]: `${Math.max(0.25, 2.6 - m.speed / 40)}s` }}>
        <svg viewBox="0 0 800 400" className="wu-track" role="img" aria-label="Rennstrecke">
          <path d={track.d} fill="none" stroke="#fff" strokeWidth="58" strokeLinejoin="round" />
          <path ref={path} d={track.d} fill="none" stroke={track.road} strokeWidth="48" strokeLinejoin="round" />
          <path d={track.d} fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="12 14" strokeLinejoin="round" opacity=".8" />
          {L > 0 && (() => {
            const a = path.current!.getPointAtLength(1), b = path.current!.getPointAtLength(5);
            const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
            return <g transform={`translate(${a.x} ${a.y}) rotate(${ang})`}><rect x="-3" y="-26" width="6" height="52" fill="url(#chk)" stroke="#222" strokeWidth=".6" /></g>;
          })()}
          <defs><pattern id="chk" width="6" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="12" fill="#fff" /><rect width="3" height="6" fill="#222" /><rect x="3" y="6" width="3" height="6" fill="#222" /></pattern></defs>
          {racers.map((r, i) => ({ r, i })).sort((a, b) => a.r.p - b.r.p).map(({ r, i }) => kart(r, i))}
        </svg>
        <div className="wu-speedlines" aria-hidden="true" />
        {phase === 'count' && <div className="wu-count" key={count}>{count || 'LOS!'}</div>}
        {phase === 'race' && elapsed < 0.9 && <div className="wu-count go">LOS!</div>}
        {m.streak >= 15 && phase === 'race' && <div className="wu-boost">BOOST!</div>}
        <div className="wu-hud">
          <div className="wu-place"><small>Platz</small><b>{myRank}</b></div>
          <div className="wu-speed"><b>{speedKmh}</b><small>km/h</small></div>
        </div>
        <ol className="wu-rank">
          {standing.map((s) => <li key={s.drv.name} className={s.you ? 'you' : ''}><Mii d={s.drv} size={26} /><span>{s.drv.name}</span></li>)}
        </ol>
      </div>

      <div className="wu-pad" aria-label="GamePad – hier tippst du">
        <div className="wu-pad-top"><i /><span>Tippe den Text – so fährt dein Kart!</span><i /></div>
        <div className="wu-pad-screen">
          <TextRun
            key={attempt}
            text={text}
            mode="rennen"
            locked={phase === 'count'}
            hideResult
            onProgress={(p) => {
              const mm = me.current;
              mm.target = p.idx / p.len;
              mm.wpm = p.wpm;
              if (p.errs > mm.errs) mm.spin = performance.now() + 500;
              mm.errs = p.errs; mm.streak = p.streak;
            }}
            onFinish={(r) => finish(r)}
            onRestart={() => begin(raceNo)}
          />
        </div>
      </div>

      {phase === 'done' && rows && (
        <div className="wu-result" role="dialog" aria-label="Rennergebnis">
          {rows[0].you && <Confetti />}
          <h3>{rows[0].you ? 'Du hast gewonnen!' : `Platz ${rows.findIndex((r) => r.you) + 1}`}</h3>
          <ol className="wu-podium">
            {rows.map((r, i) => (
              <li key={r.name} className={r.you ? 'you' : ''}>
                <span className="wu-pos">{ordinal(i + 1)}</span><Mii d={r.driver} size={38} /><b>{r.name}</b>
                <span className="wu-time">{r.time.toFixed(1)} s</span><span className="wu-pt">+{POINTS[i]}</span>
              </li>
            ))}
          </ol>
          {gp && (
            <div className="wu-gp">
              <b>Gesamtwertung</b>
              {finalOrder.map((f, k) => <span key={f.i}>{ordinal(k + 1)} {f.i === 0 ? 'Du' : BOTS[f.i - 1].name}: {f.p}</span>)}
            </div>
          )}
          {lastRace && gp && <div className="wu-cup">{myCup === 0 ? '🏆 Pokal gewonnen!' : myCup === 1 ? '🥈 Zweiter Platz' : myCup === 2 ? '🥉 Dritter Platz' : 'Knapp daneben – nächstes Mal!'}</div>}
          <div className="wu-btns">
            {gp && !lastRace && <button className="wu-go" onClick={() => begin(raceNo + 1)}>Nächstes Rennen ›</button>}
            {(!gp || lastRace) && <button className="wu-go" onClick={() => { setPts([0, 0, 0, 0]); begin(gp ? 0 : raceNo); }}>Nochmal</button>}
            <button className="wu-ghost" onClick={() => setPhase('setup')}>Zum Menü</button>
          </div>
        </div>
      )}
    </div>
  );
}

