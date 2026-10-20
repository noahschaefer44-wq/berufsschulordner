import { useCallback, useEffect, useState } from 'react';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { dailySeed, freshSeed } from '../shared/rng';
import { achieve, dailyDone, fmtTimeMs, markDaily, useGameData } from '../shared/store';
import BlockPlay, { type Result } from './BlockPlay';
import { drawMini, skinBg } from './BlockCanvas';
import { ACTIONS, BLOCK_INIT, DEFAULT_KEYS, MODES, PRESETS, type Action, type BData, type BSettings, type BSkin } from './data';
import { type Cfg, DEFAULT_CFG, DEFAULT_HANDLING, type Mode, type Randomizer, type PieceSet } from './engine';
import { PUZZLES } from './puzzles';
import './block.css';

type View = 'menu' | 'play' | 'settings' | 'lernen' | 'puzzles' | 'stats';
interface Session { kind: 'normal' | 'duell' | 'puzzle' | 'finesse' | 'replay'; cfg: Cfg; seed: number; key: number; puzzleId?: string; replay?: [number, number][]; daily?: boolean }

const SKINS: { id: BSkin; name: string }[] = [{ id: 'klar', name: 'Klar' }, { id: 'retro', name: 'Retro' }, { id: 'gb', name: 'Handheld' }, { id: 'pastell', name: 'Pastell' }, { id: 'kontrast', name: 'Kontrast' }];

const mergeCfg = (c: Partial<Cfg> | undefined): Cfg => ({ ...DEFAULT_CFG, ...(c ?? {}), handling: { ...DEFAULT_HANDLING, ...(c?.handling ?? {}) } });

export default function Block({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('block');
  const [data, upd] = useGameData<BData>('block', BLOCK_INIT);
  const S: BSettings = { ...BLOCK_INIT.settings, ...data.settings, cfg: mergeCfg(data.settings.cfg), keys: { ...DEFAULT_KEYS, ...data.settings.keys } };
  const setS = (p: Partial<BSettings>) => upd((d) => { d.settings = { ...BLOCK_INIT.settings, ...d.settings, ...p }; });
  const setCfg = (p: Partial<Cfg>) => setS({ cfg: { ...S.cfg, ...p } });

  const [view, setView] = useState<View>('menu');
  const [sess, setSess] = useState<Session | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [slow, setSlow] = useState(false);
  const [capturing, setCapturing] = useState<Action | null>(null);

  const start = useCallback((s: Omit<Session, 'key'>) => { setResult(null); setSess({ ...s, key: Math.random() }); setView('play'); }, []);
  const startMode = useCallback((mode: Mode, extra: Partial<Cfg> = {}, d = false) => {
    const base = mergeCfg(data.settings.cfg);
    const cfg: Cfg = { ...base, mode, ...extra };
    if (mode === 'sprint') { cfg.goal = base.mode === 'sprint' && base.goal !== 150 ? base.goal : 40; }
    if (mode === 'marathon') cfg.goal = base.goal === 40 ? 150 : base.goal;
    if (mode === 'zen') cfg.noGravity = true;
    start({ kind: mode === 'duell' ? 'duell' : 'normal', cfg, seed: d ? dailySeed('block', 'ultra') : freshSeed(), daily: d });
  }, [data.settings.cfg, start]);
  useEffect(() => { if (daily) startMode('ultra', {}, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tasten neu belegen
  useEffect(() => {
    if (!capturing) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { setCapturing(null); return; }
      const keys = { ...S.keys };
      for (const a of Object.keys(keys) as Action[]) keys[a] = keys[a].filter((c) => c !== e.code);
      keys[capturing] = [e.code];
      setS({ keys });
      setCapturing(null);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [capturing, S.keys]); // eslint-disable-line react-hooks/exhaustive-deps

  // Geheimnisse
  useSecrets('block', {
    'block-konami': () => setCfg({ random: 'zufall' }),
    'block-mond': () => { setSlow((x) => !x); },
    'block-pento': () => setCfg({ pieces: 'pento' }),
  });

  const keyFor = (r: Result) => `${r.mode}${S.cfg.pieces !== 'tetro' ? '|' + S.cfg.pieces : ''}${S.cfg.w !== 10 || S.cfg.h !== 20 ? `|${S.cfg.w}x${S.cfg.h}` : ''}`;

  const finish = (r: Result) => {
    setResult(r);
    if (slow) return;
    const key = keyFor(r);
    const cfg = sess?.cfg ?? S.cfg;
    upd((d) => {
      const st = d.stats[key] ?? { played: 0, best: null, times: [] };
      st.played++;
      const b = st.best;
      let isBest = false;
      if (r.mode === 'sprint' || r.mode === 'kaese') { if (r.won && (!b || r.time < b.time)) { st.best = { score: r.score, lines: r.lines, time: r.time, pps: r.pps }; isBest = true; } if (r.won) st.times = [...st.times, Math.round(r.time)].sort((x, y) => x - y).slice(0, 5); }
      else if (r.mode === 'duell') { if (r.won) { st.best = { score: (b?.score ?? 0) + 1, lines: 0, time: r.time, pps: r.pps }; } }
      else if (r.mode === 'ueberleben') { if (!b || r.time > b.time) { st.best = { score: r.score, lines: r.lines, time: r.time, pps: r.pps }; isBest = true; } }
      else if (r.mode !== 'puzzle' && r.mode !== 'zen') { if (!b || r.score > b.score) { st.best = { score: r.score, lines: r.lines, time: r.time, pps: r.pps }; isBest = true; } }
      d.stats = { ...d.stats, [key]: st };
      d.totals = { pieces: d.totals.pieces + r.pieces, lines: d.totals.lines + r.lines, tspins: d.totals.tspins + r.tspins, tetrises: d.totals.tetrises + r.tetrises, games: d.totals.games + 1, wins: d.totals.wins + (r.won ? 1 : 0) };
      if (isBest && r.rle.length && r.rle.length < 12000 && (r.mode === 'sprint' || r.mode === 'ultra' || r.mode === 'marathon' || r.mode === 'kaese')) {
        d.runs = [{ id: String(Date.now()), date: Date.now(), mode: r.mode as Mode, seed: r.seed, cfg, rle: r.rle, score: r.score, lines: r.lines, time: r.time }, ...d.runs].slice(0, 6);
      }
    });
    if (r.mode === 'sprint' && r.won) { if (r.time < 60000) achieve('block', 'sprint60'); if (r.time < 40000) achieve('block', 'sprint40'); }
    if (r.mode === 'marathon' && r.won) achieve('block', 'marathon');
    if (r.mode === 'marathon' && r.level >= 10) achieve('block', 'level10');
    if (r.mode === 'duell' && r.won) achieve('block', 'duell');
    if (cfg.pieces !== 'tetro' && r.lines >= 10) achieve('block', 'pento');
    if (sess?.daily) markDaily('block', 'ultra');
  };

  const onPuzzleFinish = (r: Result) => {
    if (!r.puzzleOk || !sess?.puzzleId) return;
    const id = sess.puzzleId;
    upd((d) => { d.puzzles = { ...d.puzzles, [id]: true }; });
    if (PUZZLES.every((p) => p.id === id || data.puzzles[p.id])) achieve('block', 'puzzle');
  };

  const best = (key: string) => data.stats[key]?.best ?? null;
  const modeBest = (m: Mode) => {
    const b = best(m);
    if (!b) return '–';
    if (m === 'sprint' || m === 'kaese') return fmtTimeMs(b.time);
    if (m === 'ueberleben') return fmtTimeMs(b.time);
    if (m === 'duell') return `${b.score} Siege`;
    if (m === 'zen') return '–';
    return `${b.score.toLocaleString('de-DE')} P.`;
  };

  // ───── Spielansicht ─────
  if (view === 'play' && sess) {
    return (
      <div className="bk" data-skin={S.skin}>
        <BlockPlay
          key={sess.key} kind={sess.kind} cfg={sess.cfg} seed={sess.seed} S={S} slow={slow}
          puzzle={sess.puzzleId ? PUZZLES.find((p) => p.id === sess.puzzleId) : undefined} replay={sess.replay}
          onFinish={sess.kind === 'puzzle' ? onPuzzleFinish : finish}
          onRestart={() => setSess({ ...sess, key: Math.random(), seed: sess.kind === 'normal' || sess.kind === 'duell' ? (sess.daily ? sess.seed : freshSeed()) : sess.seed })}
          onExit={() => { setResult(null); setView('menu'); }}
          onAchieve={(k) => achieve('block', k)}
        />
        {result && sess.kind !== 'replay' && sess.kind !== 'puzzle' && sess.kind !== 'finesse' && (
          <div className="bk-modal" role="dialog" aria-label="Ergebnis">
            <div className="bk-modal-box">
              <h2>{result.won ? (result.mode === 'duell' ? 'Gewonnen!' : 'Geschafft!') : result.mode === 'ultra' ? 'Zeit!' : 'Spiel vorbei'}</h2>
              <p className="bk-reason">{result.reason}</p>
              <div className="bk-res">
                <div><span>Punkte</span><b>{result.score.toLocaleString('de-DE')}</b></div>
                <div><span>Zeilen</span><b>{result.lines}</b></div>
                <div><span>Zeit</span><b>{fmtTimeMs(result.time)}</b></div>
                <div><span>Steine/s</span><b>{result.pps.toFixed(2)}</b></div>
                <div><span>Tasten/Stein</span><b>{result.kpp.toFixed(2)}</b></div>
                <div><span>Level</span><b>{result.level}</b></div>
                <div><span>Max. Combo</span><b>{result.maxCombo}</b></div>
                <div><span>T-Spins / Tetris</span><b>{result.tspins} / {result.tetrises}</b></div>
                {result.apm > 0 && <div><span>Angriff/min</span><b>{result.apm.toFixed(0)}</b></div>}
              </div>
              {slow && <p className="bk-small">Zeitlupe aktiv – das Ergebnis zählt nicht für Bestenlisten.</p>}
              <div className="bk-btns">
                <button className="primary" onClick={() => setSess({ ...sess, key: Math.random(), seed: sess.daily ? sess.seed : freshSeed() })} autoFocus>Nochmal</button>
                {result.rle.length > 0 && <button onClick={() => start({ kind: 'replay', cfg: sess.cfg, seed: result.seed, replay: result.rle })}>Wiederholung</button>}
                <button onClick={() => { setResult(null); setView('menu'); }}>Menü</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const B = skinBg(S.skin);
  const cfg = S.cfg;

  return (
    <div className="bk" data-skin={S.skin} style={{ ['--bk-frame' as string]: B.frame }}>
      <header className="bk-head">
        <h1>BLOCK<span>FALL</span></h1>
        <nav>
          <button className={view === 'menu' ? 'on' : ''} onClick={() => setView('menu')}>Spielen</button>
          <button className={view === 'lernen' ? 'on' : ''} onClick={() => setView('lernen')}>Lernen</button>
          <button className={view === 'puzzles' ? 'on' : ''} onClick={() => setView('puzzles')}>Rätsel</button>
          <button className={view === 'stats' ? 'on' : ''} onClick={() => setView('stats')}>Statistik</button>
          <button className={view === 'settings' ? 'on' : ''} onClick={() => setView('settings')}>Einstellungen</button>
          <button className="x" aria-label="Zurück zur Halle" onClick={onExit}>✕</button>
        </nav>
      </header>

      {view === 'menu' && (
        <main className="bk-main">
          <section>
            <h2>Modus</h2>
            <div className="bk-modes">
              {MODES.map((m) => (
                <button key={m.id} className="bk-mode" onClick={() => startMode(m.id)}>
                  <b>{m.name}</b><small>{m.info}</small><em>{modeBest(m.id)}</em>
                </button>
              ))}
              <button className="bk-mode daily" onClick={() => startMode('ultra', {}, true)}><b>Tages-Ultra {dailyDone('block', 'ultra') ? '✓' : ''}</b><small>Heute für alle derselbe Zufall – zwei Minuten.</small><em>{dailyDone('block', 'ultra') ? 'gespielt' : 'offen'}</em></button>
              <button className="bk-mode" onClick={() => start({ kind: 'finesse', cfg, seed: freshSeed() })}><b>Finesse-Trainer</b><small>Lerne, jeden Stein mit den wenigsten Tasten zu platzieren.</small><em>{data.finesse.best ? `Serie ${data.finesse.best}` : '–'}</em></button>
            </div>
          </section>
          <section className="bk-opts">
            <h2>Spielvarianten</h2>
            <div className="bk-row"><span>Brett</span><div className="bk-seg">{PRESETS.map((p) => <button key={p.id} className={cfg.w === p.w && cfg.h === p.h ? 'on' : ''} onClick={() => setCfg({ w: p.w, h: p.h })}>{p.name}</button>)}</div></div>
            <div className="bk-row"><span>Steine</span><div className="bk-seg">{([['tetro', 'Tetromino (4)'], ['pento', 'Pentomino (5)'], ['mix', 'Gemischt']] as [PieceSet, string][]).map(([v, l]) => <button key={v} className={cfg.pieces === v ? 'on' : ''} onClick={() => setCfg({ pieces: v })}>{l}</button>)}</div></div>
            <div className="bk-row"><span>Reihenfolge</span><div className="bk-seg">{([['7bag', '7er-Beutel'], ['14bag', 'Doppel-Beutel'], ['klassisch', 'Klassisch'], ['zufall', 'Zufall']] as [Randomizer, string][]).map(([v, l]) => <button key={v} className={cfg.random === v ? 'on' : ''} onClick={() => setCfg({ random: v })}>{l}</button>)}</div></div>
            <div className="bk-row"><span>Startlevel {cfg.startLevel}</span><input type="range" min={1} max={20} value={cfg.startLevel} onChange={(e) => setCfg({ startLevel: +e.target.value })} aria-label="Startlevel" /></div>
            <div className="bk-row"><span>Sprint-Ziel / Marathon-Ziel {cfg.goal}</span><input type="range" min={10} max={200} step={10} value={cfg.goal} onChange={(e) => setCfg({ goal: +e.target.value })} aria-label="Ziel" /></div>
            <div className="bk-row"><span>Käse-Zeilen {cfg.cheese}</span><input type="range" min={4} max={18} value={cfg.cheese} onChange={(e) => setCfg({ cheese: +e.target.value })} aria-label="Käse" /></div>
            <div className="bk-row"><span>Computer-Gegner</span><div className="bk-seg">{['Anfänger', 'Solide', 'Stark', 'Perfekt'].map((n, i) => <button key={n} className={S.bot === i ? 'on' : ''} onClick={() => setS({ bot: i })}>{n}</button>)}<label className="bk-inline">Tempo {S.botPps.toFixed(1)}/s<input type="range" min={0.4} max={3} step={0.1} value={S.botPps} onChange={(e) => setS({ botPps: +e.target.value })} /></label></div></div>
            <div className="bk-toggles">
              <label><input type="checkbox" checked={cfg.hold} onChange={(e) => setCfg({ hold: e.target.checked })} />Halten</label>
              <label><input type="checkbox" checked={cfg.kicks} onChange={(e) => setCfg({ kicks: e.target.checked })} />Wandtritte (SRS)</label>
              <label><input type="checkbox" checked={cfg.rot180} onChange={(e) => setCfg({ rot180: e.target.checked })} />Drehen 180°</label>
              <label><input type="checkbox" checked={cfg.invisible} onChange={(e) => setCfg({ invisible: e.target.checked })} />Unsichtbar</label>
              <label><input type="checkbox" checked={cfg.noGravity} onChange={(e) => setCfg({ noGravity: e.target.checked })} />Schwerelos</label>
            </div>
            <p className="bk-small">Werte unten werden gespeichert und gelten für alle Modi.</p>
          </section>
        </main>
      )}

      {view === 'lernen' && (
        <main className="bk-main bk-learn">
          <h2>Lernen</h2>
          <div className="bk-cards">
            <article><h3>1 · Grundlagen</h3><p>Steine fallen von oben. Verschiebe sie mit den Pfeiltasten, drehe mit ↑ oder X (rechts) und Z (links) und lass sie mit der Leertaste (Hard Drop) sofort fallen. Eine vollständige Zeile verschwindet – je mehr Zeilen auf einmal, desto mehr Punkte.</p></article>
            <article><h3>2 · Halten und Vorschau</h3><p>Mit C oder Umschalt tauschst du den Stein gegen den gehaltenen. Das geht nur einmal pro Stein. Die Vorschau zeigt, was kommt – plane zwei bis drei Steine voraus.</p></article>
            <article><h3>3 · Der Beutel</h3><p>Der 7er-Beutel verteilt alle sieben Steine in zufälliger Reihenfolge, bevor einer wiederkommt. Dadurch gibt es nie sehr lange Durststrecken ohne einen I-Stein.</p></article>
            <article><h3>4 · Sauber stapeln</h3><p>Vermeide Löcher unter Blöcken und halte die Oberfläche flach. Eine freie Spalte am Rand für den I-Stein erlaubt „Tetris“ (4 Zeilen = 800 Punkte × Level).</p></article>
            <article><h3>5 · Drehsystem und Wandtritte</h3><p>Das Super-Rotation-System probiert beim Drehen bis zu fünf Verschiebungen, damit Steine auch an Wänden und in engen Lücken drehbar bleiben. Das macht T-Spins überhaupt erst möglich.</p></article>
            <article><h3>6 · T-Spins</h3><p>Ein T-Spin gelingt, wenn du den T-Stein in eine Lücke <b>hineindrehst</b> und danach mindestens drei seiner vier Ecken belegt sind. Räumt er dabei Zeilen, gibt es dicke Bonuspunkte (T-Spin Double: 1200 × Level). Übe das unter „Rätsel“.</p></article>
            <article><h3>7 · Combos und Back-to-Back</h3><p>Räumst du mehrere Steine in Folge Zeilen, wächst die Combo. Zwei schwere Räumungen (Tetris oder T-Spins) direkt hintereinander ergeben Back-to-Back – 1,5-fache Punkte und mehr Angriff im Duell.</p></article>
            <article><h3>8 · Finesse</h3><p>Finesse bedeutet, mit möglichst wenigen Tastendrücken zu platzieren – vor allem durch „Gleiten“ (Taste halten, bis die Wand erreicht ist). Der Finesse-Trainer zeigt dir ein Ziel und zählt deine Tasten.</p></article>
            <article><h3>9 · Duell</h3><p>Jede geräumte Zeile schickt dem Computer Müllzeilen mit einem Loch. Räume selbst Zeilen, um eingehenden Müll zu neutralisieren. Wer zuerst überläuft, verliert.</p></article>
            <article><h3>10 · Einstellungen, die zählen</h3><p>DAS ist die Wartezeit, bevor ein Stein „rutscht“, ARR die Zeit zwischen zwei Rutschschritten (0 = sofort an die Wand). Gute Spieler stellen DAS niedrig und ARR auf 0 bis 33 ms. Das alles findest du unter Einstellungen.</p></article>
          </div>
          <div className="bk-btns"><button className="primary" onClick={() => setView('puzzles')}>Zu den T-Spin-Rätseln</button><button onClick={() => start({ kind: 'finesse', cfg, seed: freshSeed() })}>Finesse-Trainer</button></div>
        </main>
      )}

      {view === 'puzzles' && (
        <main className="bk-main">
          <h2>T-Spin-Rätsel</h2>
          <p className="bk-small">Eine feste Stellung, feste Steine – erreiche das Ziel. Jedes Rätsel ist lösbar.</p>
          <div className="bk-modes">
            {PUZZLES.map((p) => (
              <button key={p.id} className="bk-mode" onClick={() => start({ kind: 'puzzle', cfg: { ...cfg, mode: 'puzzle' }, seed: 1, puzzleId: p.id })}>
                <b>{data.puzzles[p.id] ? '✓ ' : ''}{p.name}</b><small>{p.text}</small><em>Ziel: {p.goal}</em>
              </button>
            ))}
          </div>
        </main>
      )}

      {view === 'stats' && (
        <main className="bk-main">
          <h2>Statistik</h2>
          <p>{data.totals.games} Partien · {data.totals.wins} Siege · {data.totals.lines.toLocaleString('de-DE')} Zeilen · {data.totals.pieces.toLocaleString('de-DE')} Steine · {data.totals.tspins} T-Spins · {data.totals.tetrises} Tetris</p>
          <table className="bk-table"><thead><tr><th>Modus</th><th>Gespielt</th><th>Bestleistung</th><th>Beste Zeiten</th></tr></thead>
            <tbody>{Object.entries(data.stats).map(([k, s]) => {
              const m = k.split('|')[0] as Mode;
              const b = s.best;
              return <tr key={k}><td>{k.replace('|', ' · ')}</td><td>{s.played}</td><td>{b ? (m === 'sprint' || m === 'kaese' || m === 'ueberleben' ? fmtTimeMs(b.time) : m === 'duell' ? `${b.score} Siege` : `${b.score.toLocaleString('de-DE')} P. · ${b.lines} Z.`) : '–'}</td><td>{s.times.map((t) => fmtTimeMs(t)).join(' · ') || '–'}</td></tr>;
            })}</tbody></table>
          <h3>Wiederholungen</h3>
          {data.runs.length === 0 ? <p className="bk-small">Bestleistungen in Sprint, Ultra, Marathon und Käse-Rennen werden als Wiederholung gespeichert.</p> : (
            <ul className="bk-list">{data.runs.map((r) => (
              <li key={r.id}><span>{new Date(r.date).toLocaleDateString('de-DE')} · {r.mode} · {r.mode === 'sprint' || r.mode === 'kaese' ? fmtTimeMs(r.time) : `${r.score.toLocaleString('de-DE')} P.`}</span>
                <button onClick={() => start({ kind: 'replay', cfg: r.cfg, seed: r.seed, replay: r.rle })}>Ansehen</button></li>
            ))}</ul>
          )}
        </main>
      )}

      {view === 'settings' && (
        <main className="bk-main bk-settings">
          <h2>Einstellungen</h2>
          <section>
            <h3>Steuerung (Handling)</h3>
            <label><span>DAS (Wartezeit bis zum Rutschen) {cfg.handling.das} ms</span><input type="range" min={40} max={300} value={cfg.handling.das} onChange={(e) => setCfg({ handling: { ...cfg.handling, das: +e.target.value } })} /></label>
            <label><span>ARR (Rutsch-Takt) {cfg.handling.arr === 0 ? 'sofort' : cfg.handling.arr + ' ms'}</span><input type="range" min={0} max={100} value={cfg.handling.arr} onChange={(e) => setCfg({ handling: { ...cfg.handling, arr: +e.target.value } })} /></label>
            <label><span>Weicher Fall (SDF) {cfg.handling.sdf >= 40 ? 'sofort' : cfg.handling.sdf + '×'}</span><input type="range" min={2} max={41} value={cfg.handling.sdf} onChange={(e) => setCfg({ handling: { ...cfg.handling, sdf: +e.target.value } })} /></label>
            <label><span>Verriegelungsverzögerung {cfg.handling.lock} ms</span><input type="range" min={100} max={1000} step={50} value={cfg.handling.lock} onChange={(e) => setCfg({ handling: { ...cfg.handling, lock: +e.target.value } })} /></label>
            <label><span>Vorschau-Steine {cfg.nextCount}</span><input type="range" min={0} max={6} value={cfg.nextCount} onChange={(e) => setCfg({ nextCount: +e.target.value })} /></label>
            <button className="bk-link" onClick={() => setCfg({ handling: DEFAULT_HANDLING })}>Standardwerte</button>
          </section>
          <section>
            <h3>Tasten</h3>
            <div className="bk-keys">
              {ACTIONS.map((a) => (
                <div key={a.id}><span>{a.name}</span><button className={capturing === a.id ? 'on' : ''} onClick={() => setCapturing(a.id)}>{capturing === a.id ? 'Taste drücken …' : S.keys[a.id].map((c) => c.replace('Key', '').replace('Arrow', '↔').replace('Space', 'Leertaste').replace('ShiftLeft', 'Umschalt')).join(' / ') || '–'}</button></div>
              ))}
            </div>
            <button className="bk-link" onClick={() => setS({ keys: DEFAULT_KEYS })}>Tasten zurücksetzen</button>
          </section>
          <section>
            <h3>Aussehen</h3>
            <div className="bk-skins">{SKINS.map((s) => (
              <button key={s.id} className={S.skin === s.id ? 'on' : ''} onClick={() => setS({ skin: s.id })}>
                <SkinPreview skin={s.id} /><span>{s.name}</span>
              </button>
            ))}</div>
            <label className="bk-inline-row"><span>Geisterstein</span><input type="checkbox" checked={S.ghost} onChange={(e) => setS({ ghost: e.target.checked })} /></label>
            <label className="bk-inline-row"><span>Raster</span><input type="checkbox" checked={S.grid} onChange={(e) => setS({ grid: e.target.checked })} /></label>
            <label className="bk-inline-row"><span>Effekte</span><input type="checkbox" checked={S.effects} onChange={(e) => setS({ effects: e.target.checked })} /></label>
            <label className="bk-inline-row"><span>Wackeln bei Treffern</span><input type="checkbox" checked={S.shake} onChange={(e) => setS({ shake: e.target.checked })} /></label>
            <label className="bk-inline-row"><span>Touch-Tasten anzeigen</span><input type="checkbox" checked={S.touch} onChange={(e) => setS({ touch: e.target.checked })} /></label>
            <label><span>Größe {Math.round(S.scale * 100)} %</span><input type="range" min={0.6} max={1.4} step={0.05} value={S.scale} onChange={(e) => setS({ scale: +e.target.value })} /></label>
          </section>
          {slow && <p className="bk-small">Zeitlupe ist aktiv (Geheimnis).</p>}
        </main>
      )}
    </div>
  );
}

function SkinPreview({ skin }: { skin: BSkin }) {
  const ref = useCallback((cv: HTMLCanvasElement | null) => { if (cv) { drawMini(cv, 3, skin, 16); } }, [skin]);
  return <canvas ref={ref} className="bk-skinprev" style={{ background: skinBg(skin).bg }} />;
}
