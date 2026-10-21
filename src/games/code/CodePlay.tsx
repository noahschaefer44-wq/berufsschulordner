import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type CSettings, LEVELS_C } from './data';
import { type Cfg, type Code, type Fb, type Turn, allCodes, chooseGuess, feedback, filterConsistent, genPuzzle, guessRating, isSolved, isValid, randomCode, solveGame, spaceSize } from './engine';
import { Fbk, Peg } from './Pegs';
import { useKeys } from '../shared/hooks';
import { freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';

export type PlayMode = 'knacken' | 'verstecken' | 'duell' | 'raetsel';
export interface PlaySetup { mode: PlayMode; cfg: Cfg; presetKey: string; level: number; seed?: number; daily?: boolean }

export interface FinishInfo {
  setup: PlaySetup;
  won: boolean;
  guesses: number;
  rating: number;
  helped: boolean;
  refereeRight: number;
  refereeWrong: number;
  duel?: { won: boolean };
  puzzle?: boolean;
}

const digitsOf = (cfg: Cfg) => cfg.colors === 10;

export default function CodePlay({ setup, S, secrets, onFinish, onExit }: {
  setup: PlaySetup; S: CSettings; secrets: { enigma: boolean; turing: boolean; bletchley: boolean };
  onFinish: (i: FinishInfo) => void; onExit: () => void;
}) {
  const { cfg, mode } = setup;
  const rnd = useRef(mulberry32(setup.seed ?? freshSeed()));
  const all = useMemo(() => allCodes(cfg), [cfg]);
  const method = LEVELS_C.find((l) => l.id === setup.level)?.method ?? 'entropie';
  const digits = digitsOf(cfg);

  // Zustand
  const [phase, setPhase] = useState<'set' | 'run' | 'done'>(mode === 'verstecken' || mode === 'duell' ? 'set' : 'run');
  const [secret, setSecret] = useState<Code>(() => (mode === 'raetsel' ? [] : randomCode(cfg, rnd.current)));
  const [mine, setMine] = useState<Code>([]);
  const [history, setHistory] = useState<Turn[]>([]);
  const [current, setCurrent] = useState<(number | null)[]>(() => new Array(cfg.pegs).fill(null));
  const [sel, setSel] = useState(0);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<null | { won: boolean; text: string }>(null);
  const [ratings, setRatings] = useState<number[]>([]);
  const [puzzle, setPuzzle] = useState(() => (mode === 'raetsel' ? genPuzzle(cfg, rnd.current) : null));
  const [aiThinking, setAiThinking] = useState(false);
  const [manualFb, setManualFb] = useState<Fb>([0, 0]);
  const [pending, setPending] = useState<Code | null>(null);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [round, setRound] = useState(1);
  const [duelAi, setDuelAi] = useState<number | null>(null);
  const flags = useRef({ helped: false, right: 0, wrong: 0 });
  const doneRef = useRef(false);
  const tok = useRef(0);
  const candsRef = useRef<Code[]>(all);

  // Rätsel: Verlauf ist vorgegeben
  useEffect(() => {
    if (mode === 'raetsel' && puzzle) { setSecret(puzzle.secret); setHistory(puzzle.history); }
  }, [mode, puzzle]);
  useEffect(() => { if (secrets.enigma || secrets.turing || secrets.bletchley) flags.current.helped = true; }, [secrets]);
  useEffect(() => () => { tok.current++; }, []);

  const left = all.length ? (mode === 'verstecken' ? filterConsistent(all, history, cfg).length : filterConsistent(all, history, cfg).length) : -1;
  const showLeft = S.showLeft || secrets.bletchley;
  const maxRows = cfg.rows;

  const finish = useCallback((won: boolean, guesses: number, rating: number, extra?: Partial<FinishInfo>) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onFinish({ setup, won, guesses, rating, helped: flags.current.helped, refereeRight: flags.current.right, refereeWrong: flags.current.wrong, ...extra });
  }, [onFinish, setup]);

  // ───── Eingabe der aktuellen Zeile ─────
  const place = (c: number) => {
    if (result || phase !== 'run' || (mode === 'verstecken')) return;
    if (!cfg.dup && current.includes(c)) { setMsg('Jede Farbe darf nur einmal vorkommen.'); return; }
    const idx = current[sel] === null || current.every((x) => x !== null) ? sel : current.indexOf(null);
    const next = current.slice();
    next[idx] = c;
    setCurrent(next);
    const free = next.indexOf(null);
    setSel(free >= 0 ? free : idx);
    setMsg('');
    sfx('tick');
  };
  const clearSlot = (i: number) => { const n = current.slice(); n[i] = null; setCurrent(n); setSel(i); };

  const submitGuess = (g: Code) => {
    if (result || !isValid(g, cfg)) return;
    const target = mode === 'raetsel' ? puzzle!.secret : secret;
    const fb = feedback(target, g, cfg);
    const cands = candsRef.current;
    const hist = [...history, { guess: g, fb }];
    setHistory(hist);
    setCurrent(new Array(cfg.pegs).fill(null)); setSel(0);
    const consistentNow = all.length ? filterConsistent(cands, [{ guess: g, fb }], cfg) : cands;
    // Zugqualität (Entropie-Anteil gegenüber dem besten Versuch)
    const rating = all.length && mode !== 'raetsel' ? guessRating(cands, g, all, cfg, rnd.current) : 1;
    candsRef.current = consistentNow;
    const rs = [...ratings, rating];
    setRatings(rs);
    const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
    sfx('place');
    if (isSolved(fb, cfg)) {
      setResult({ won: true, text: `Geknackt in ${mode === 'raetsel' ? hist.length - puzzle!.history.length : hist.length} Versuch${hist.length === 1 ? '' : 'en'}!` });
      sfx('win');
      if (mode === 'duell') {
        const mineCount = hist.length;
        const ai = duelAi ?? 99;
        const youWin = mineCount < ai, tie = mineCount === ai;
        setScore((s) => (youWin ? [s[0] + 1, s[1]] : tie ? s : [s[0], s[1] + 1]));
        setMsg(`Du: ${mineCount} · KI: ${ai} – ${youWin ? 'Runde für dich' : tie ? 'Unentschieden' : 'Runde für die KI'}`);
        return;
      }
      finish(true, mode === 'raetsel' ? Math.max(1, hist.length - puzzle!.history.length) : hist.length, avg, { puzzle: mode === 'raetsel' });
    } else if (mode !== 'raetsel' && hist.length >= maxRows) {
      setResult({ won: false, text: `Leider nicht geknackt. Der Code war: ${secret.map((c) => (digits ? c : c + 1)).join(' ')}` });
      sfx('lose');
      if (mode === 'duell') { setScore((s) => [s[0], s[1] + 1]); return; }
      finish(false, hist.length, avg);
    } else if (mode === 'raetsel') {
      // Hinweis, welcher Versuch widersprochen wurde
      const bad = puzzle!.history.find((t) => { const f = feedback(g, t.guess, cfg); return f[0] !== t.fb[0] || f[1] !== t.fb[1]; });
      setMsg(bad ? `Das passt nicht zu Versuch ${puzzle!.history.indexOf(bad) + 1}.` : 'Das passt zu allen Versuchen – aber ist es der einzige Code?');
      sfx('bad');
    }
  };

  const submit = () => {
    if (current.some((c) => c === null)) { setMsg('Setze erst alle Stifte.'); return; }
    submitGuess(current as Code);
  };

  const hint = () => {
    if (result || phase !== 'run' || mode === 'verstecken') return;
    flags.current.helped = true;
    const hist = mode === 'raetsel' ? puzzle!.history : history;
    const g = chooseGuess(candsRef.current.length ? candsRef.current : all, all, hist, cfg, 'minimax', rnd.current);
    if (mode === 'raetsel') { setCurrent(g); setMsg('Tipp: ein Code, der zu allen Versuchen passt.'); return; }
    setCurrent(g); setMsg('Tipp: der Versuch mit dem größten Informationsgewinn.');
  };

  const autopilot = () => {
    if (result || phase !== 'run' || mode === 'verstecken') return;
    flags.current.helped = true;
    const g = chooseGuess(candsRef.current.length ? candsRef.current : all, all, history, cfg, 'minimax', rnd.current);
    submitGuess(g);
  };

  // ───── Verstecken / Duell: eigenes Geheimnis festlegen ─────
  const confirmMine = () => {
    if (mine.length !== cfg.pegs) { setMsg('Setze alle Stifte deines Codes.'); return; }
    if (mode === 'duell') {
      const n = solveGame(mine, cfg, method, mulberry32(freshSeed()), maxRows + 4);
      setDuelAi(n > maxRows ? maxRows + 1 : n);
      setSecret(randomCode(cfg, rnd.current));
      candsRef.current = all; setHistory([]); setRatings([]);
      setPhase('run'); setMsg(`Runde ${round}: Knacke den Code der KI. Die KI hat deinen Code bereits angegangen.`);
      return;
    }
    setSecret(mine);
    setPhase('run'); setMsg('');
    candsRef.current = all;
    void aiTurn(mine, [], all);
  };

  const aiTurn = async (code: Code, hist: Turn[], cands: Code[]) => {
    const my = ++tok.current;
    setAiThinking(true);
    await new Promise((r) => setTimeout(r, 500));
    if (my !== tok.current) return;
    const g = chooseGuess(cands, all, hist, cfg, method, rnd.current);
    setAiThinking(false);
    setPending(g);
    if (!S.manual) {
      const fb = feedback(code, g, cfg);
      applyAiFeedback(code, hist, cands, g, fb);
    } else { setManualFb([0, 0]); setMsg('Bewerte den Versuch der KI: Wie viele Stifte stimmen genau, wie viele nur in der Farbe?'); }
  };

  const applyAiFeedback = (code: Code, hist: Turn[], cands: Code[], g: Code, fb: Fb) => {
    const h = [...hist, { guess: g, fb }];
    setHistory(h); setPending(null);
    sfx('tick');
    if (isSolved(fb, cfg)) {
      setResult({ won: false, text: `Die KI hat deinen Code in ${h.length} Versuch${h.length === 1 ? '' : 'en'} gefunden.` });
      sfx('lose');
      finish(false, h.length, 1, { refereeRight: flags.current.right, refereeWrong: flags.current.wrong });
      return;
    }
    if (h.length >= maxRows) {
      setResult({ won: true, text: 'Die KI hat deinen Code nicht gefunden – du gewinnst!' });
      sfx('win');
      finish(true, h.length, 1);
      return;
    }
    const next = filterConsistent(cands, [{ guess: g, fb }], cfg);
    candsRef.current = next;
    void aiTurn(code, h, next);
  };

  const submitManual = () => {
    if (!pending) return;
    const truth = feedback(secret, pending, cfg);
    if (truth[0] === manualFb[0] && truth[1] === manualFb[1]) { flags.current.right++; sfx('good'); setMsg(''); }
    else { flags.current.wrong++; sfx('bad'); setMsg(`Nicht ganz – richtig wäre ${truth[0]} schwarz und ${truth[1]} weiß. Der Schiedsrichter korrigiert.`); }
    applyAiFeedback(secret, history, candsRef.current, pending, truth);
  };

  // ───── Duell: nächste Runde ─────
  const nextRound = () => {
    if (score[0] >= 2 || score[1] >= 2) return;
    setRound((r) => r + 1);
    setResult(null); setHistory([]); setRatings([]); setCurrent(new Array(cfg.pegs).fill(null)); setSel(0); setMine([]); setPhase('set'); setMsg(''); setDuelAi(null);
    candsRef.current = all;
  };
  useEffect(() => {
    if (mode !== 'duell' || (score[0] < 2 && score[1] < 2)) return;
    const won = score[0] >= 2;
    finish(won, history.length, ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 1, { duel: { won } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const newPuzzle = () => { const p = genPuzzle(cfg, rnd.current); setPuzzle(p); setResult(null); setCurrent(new Array(cfg.pegs).fill(null)); setSel(0); setMsg(''); doneRef.current = false; setRatings([]); candsRef.current = all; };

  useKeys((e) => {
    if (phase === 'set') return;
    if (e.key === 'Enter') { if (mode === 'verstecken') { if (S.manual && pending) submitManual(); } else submit(); }
    else if (e.key === 'Backspace') { const i = current.map((c, k) => (c !== null ? k : -1)).filter((k) => k >= 0).pop(); if (i !== undefined) clearSlot(i); }
    else if (e.key === 'h' || e.key === 'H') hint();
    else if (/^[0-9]$/.test(e.key)) { const c = e.key === '0' ? 9 : +e.key - 1; if (c < cfg.colors) place(c); }
  }, [current, sel, phase, result, history]);

  const setMinePeg = (c: number) => {
    if (mine.length >= cfg.pegs) return;
    if (!cfg.dup && mine.includes(c)) return;
    setMine([...mine, c]); sfx('tick');
  };

  // ───── Anzeige ─────
  const palette = Array.from({ length: cfg.colors }, (_, i) => i);
  const rowsToShow = mode === 'raetsel' ? Math.max(history.length + 3, 6) : maxRows;
  const ruleTxt = `${cfg.pegs} Stifte · ${cfg.colors} ${digits ? 'Ziffern' : 'Farben'} · ${cfg.dup ? 'Doppelte erlaubt' : 'jede nur einmal'}${cfg.blackOnly ? ' · nur Schwarz' : ''}`;
  const rowEls: React.ReactNode[] = [];
  for (let r = 0; r < rowsToShow; r++) {
    const t = history[r];
    const isCur = !t && r === history.length && !result && phase === 'run' && mode !== 'verstecken';
    const isPend = mode === 'verstecken' && !t && r === history.length && !!pending;
    const pegs = t ? t.guess : isPend ? pending! : isCur ? current : new Array(cfg.pegs).fill(null);
    const puzzleRow = mode === 'raetsel' && puzzle && r < puzzle.history.length;
    rowEls.push(
      <div key={r} className={`cd-row${isCur || isPend ? ' cur' : ''}${t ? ' done' : ''}${puzzleRow ? ' given' : ''}`}>
        <span className="cd-n">{r + 1}</span>
        <span className="cd-pegs">{pegs.map((c: number | null, i: number) => (
          <Peg key={i} color={c} symbols={S.symbols} digits={digits} size={cfg.pegs > 5 ? 38 : 42} selected={isCur && sel === i} onClick={isCur ? () => setSel(i) : undefined} onRight={isCur ? () => clearSlot(i) : undefined} hole />
        ))}</span>
        <Fbk fb={t ? t.fb : null} cfg={cfg} />
        {ratings[r] !== undefined && mode !== 'raetsel' && mode !== 'verstecken' && <em className={`cd-rate ${ratings[r] > 0.85 ? 'g' : ratings[r] > 0.6 ? 'm' : 'b'}`} title="Zugqualität: Informationsgewinn im Vergleich zum besten Versuch">{Math.round(ratings[r] * 100)}%</em>}
      </div>,
    );
  }

  return (
    <div className="cd-play">
      <div className="cd-stage">
        <div className="cd-device">
          <div className="cd-display">
            <span className="cd-led" />
            <b>{mode === 'verstecken' ? 'KI knackt deinen Code' : mode === 'duell' ? `Duell · Runde ${round} · Du ${score[0]} : ${score[1]} KI` : mode === 'raetsel' ? 'Rätsel: Finde den Code' : 'Knacke den Code'}</b>
            <span className="cd-secret">{(secrets.enigma || result) && secret.length ? secret.map((c, i) => <Peg key={i} color={c} size={22} symbols={S.symbols} digits={digits} />) : <span className="cd-q">{Array.from({ length: cfg.pegs }, () => '?').join(' ')}</span>}</span>
          </div>
          <div className="cd-board">{rowEls}</div>
        </div>

        <aside className="cd-panel">
          <div className="cd-info"><span>{ruleTxt}</span></div>
          <div className="cd-info"><span>Raum: {spaceSize(cfg).toLocaleString('de-DE')} Codes</span>{showLeft && left >= 0 && <span>Noch möglich: <b>{left}</b></span>}</div>
          {msg && <p className="cd-msg" role="status">{msg}</p>}
          {phase === 'set' && (
            <div className="cd-set">
              <h3>{mode === 'duell' ? 'Dein Code für die KI' : 'Wähle deinen geheimen Code'}</h3>
              <div className="cd-pegs set">{Array.from({ length: cfg.pegs }, (_, i) => <Peg key={i} color={mine[i] ?? null} symbols={S.symbols} digits={digits} onClick={mine[i] !== undefined ? () => setMine(mine.filter((_, k) => k !== i)) : undefined} />)}</div>
              <div className="cd-palette">{palette.map((c) => <Peg key={c} color={c} symbols={S.symbols} digits={digits} dim={!cfg.dup && mine.includes(c)} onClick={() => setMinePeg(c)} />)}</div>
              <div className="cd-actions"><button onClick={() => setMine(randomCode(cfg, rnd.current))}>Zufällig</button><button onClick={() => setMine([])}>Leeren</button><button className="primary" disabled={mine.length !== cfg.pegs} onClick={confirmMine}>Fertig</button></div>
              <p className="cd-sub">Die KI ({LEVELS_C.find((l) => l.id === setup.level)?.name}) {mode === 'duell' ? 'knackt deinen Code im Hintergrund; du knackst ihren.' : 'versucht jetzt, ihn zu erraten.'}</p>
            </div>
          )}
          {phase === 'run' && mode !== 'verstecken' && !result && (
            <div className="cd-input">
              <div className="cd-palette">{palette.map((c) => <Peg key={c} color={c} symbols={S.symbols} digits={digits} dim={(!cfg.dup && current.includes(c)) || excluded.has(c)} onClick={() => place(c)} onRight={() => setExcluded((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; })} />)}</div>
              <p className="cd-sub">Rechtsklick auf eine Farbe markiert sie als „ausgeschlossen“ (nur Merkhilfe). Tasten 1–{Math.min(9, cfg.colors)}{cfg.colors >= 10 ? ', 0' : ''} wählen Farben, ⌫ löscht.</p>
              <div className="cd-actions">
                <button className="primary" onClick={submit} disabled={current.some((c) => c === null)}>Prüfen <kbd>⏎</kbd></button>
                <button onClick={() => { setCurrent(new Array(cfg.pegs).fill(null)); setSel(0); }}>Leeren</button>
                {all.length > 0 && <button onClick={hint}>Tipp <kbd>H</kbd></button>}
                {secrets.turing && mode !== 'raetsel' && <button onClick={autopilot}>Turing spielt</button>}
              </div>
            </div>
          )}
          {phase === 'run' && mode === 'verstecken' && !result && (
            <div className="cd-input">
              {aiThinking && <p className="cd-sub">Die KI überlegt …</p>}
              {S.manual && pending && (
                <div className="cd-manual">
                  <p>Dein Code: {secret.map((c, i) => <Peg key={i} color={c} size={22} symbols={S.symbols} digits={digits} />)}</p>
                  <div className="cd-counter"><span>Schwarz</span><button onClick={() => setManualFb(([b, w]) => [Math.max(0, b - 1), w])}>−</button><b>{manualFb[0]}</b><button onClick={() => setManualFb(([b, w]) => [Math.min(cfg.pegs, b + 1), w])}>+</button></div>
                  {!cfg.blackOnly && <div className="cd-counter"><span>Weiß</span><button onClick={() => setManualFb(([b, w]) => [b, Math.max(0, w - 1)])}>−</button><b>{manualFb[1]}</b><button onClick={() => setManualFb(([b, w]) => [b, Math.min(cfg.pegs, w + 1)])}>+</button></div>}
                  <button className="primary" onClick={submitManual}>Bewerten <kbd>⏎</kbd></button>
                </div>
              )}
              {!S.manual && <p className="cd-sub">Die Auswertung übernimmt das Spiel automatisch (in den Optionen auf „selbst bewerten“ stellbar).</p>}
            </div>
          )}
          {result && (
            <div className={`cd-result ${result.won ? 'win' : 'lose'}`}>
              <h3>{result.won ? (mode === 'verstecken' ? 'Gewonnen!' : 'Geknackt!') : 'Verloren'}</h3>
              <p>{result.text}</p>
              {ratings.length > 0 && mode !== 'raetsel' && mode !== 'verstecken' && <p className="cd-sub">Zugqualität im Schnitt: {Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100)} %</p>}
              {mode === 'verstecken' && S.manual && <p className="cd-sub">Schiedsrichter: {flags.current.right} richtig, {flags.current.wrong} falsch bewertet.</p>}
              <div className="cd-actions">
                {mode === 'duell' && score[0] < 2 && score[1] < 2 && <button className="primary" onClick={nextRound}>Nächste Runde</button>}
                {mode === 'raetsel' && <button className="primary" onClick={newPuzzle}>Nächstes Rätsel</button>}
                <button onClick={onExit}>Zum Menü</button>
              </div>
            </div>
          )}
          {mode === 'raetsel' && !result && <div className="cd-actions"><button onClick={() => { setResult({ won: false, text: `Der Code war: ${secret.map((c) => (digits ? c : c + 1)).join(' ')}` }); finish(false, 0, 0, { puzzle: true }); }}>Lösung zeigen</button></div>}
          <div className="cd-actions"><button onClick={() => { tok.current++; onExit(); }}>Spiel beenden</button></div>
        </aside>
      </div>
    </div>
  );
}

