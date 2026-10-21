import { useCallback, useEffect, useRef, useState } from 'react';
import { askDouble, askJudge, askMove, askProb, askTake, cancelAi } from './aiClient';
import BoardView, { type CubeState } from './BoardView';
import type { MLogEntry, MSettings, RawMv } from './data';
import { type BG, type Mv, type Seq, type Side, type Variant, notate, opp, outcome, pips, rollDice, startPosition } from './engine';
import { type Turn, hasNoMove, isComplete, newTurn, step, undoStep } from './turn';
import { useTurnControl } from './useTurnControl';
import { useKeys, useTicker } from '../shared/hooks';
import { freshSeed } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { toast } from '../shared/store';

export interface PlaySetup { opp: 'ki' | 'zwei'; level: number; variant: Variant; match: number; cube: boolean; human: Side; jacoby: boolean }

export interface GameEnd {
  setup: PlaySetup;
  winner: Side;
  points: number;
  kind: 'einfach' | 'gammon' | 'backgammon' | 'aufgabe';
  cubeValue: number;
  hits: [number, number];
  doubles: [number, number];
  matchOver: boolean;
  score: [number, number];
  entries: MLogEntry[];
  helped: boolean;
  worstLoss: number;
}

interface G {
  s: BG;
  turn: Side;
  phase: 'open' | 'roll' | 'move' | 'between' | 'matchover';
  dice: [number, number] | null;
  openDice: [number, number] | null;
  turnObj: Turn | null;
  cube: CubeState;
  cubeTurned: boolean;
  score: [number, number];
  crawford: boolean;
  crawfordDone: boolean;
  crawfordNext: boolean;
  gameNo: number;
  entries: MLogEntry[];
  offer: Side | null;
  result: string;
  hits: [number, number];
  doubles: [number, number];
  lastMoves: { p: Side; moves: Mv[] } | null;
}

const raw = (m: Mv): RawMv => [m.from, m.to, m.die, m.hit ? 1 : 0];
const sname = (p: Side) => (p === 0 ? 'Weiß' : 'Schwarz');

export default function GammonPlay({ setup, S, secrets, onGameEnd, onCoach, onExit }: {
  setup: PlaySetup; S: MSettings; secrets: { wuerfel: boolean; glueck: number; pythia: boolean };
  onGameEnd: (e: GameEnd) => void; onCoach: (loss: number) => void; onExit: () => void;
}) {
  const human = setup.opp === 'ki' ? setup.human : 0;
  const isAi = (p: Side) => setup.opp === 'ki' && p !== human;
  const viewer: Side = setup.opp === 'ki' ? human : 0;

  const fresh = (gameNo: number, score: [number, number], crawford: boolean, crawfordDone: boolean): G => ({
    s: startPosition(setup.variant), turn: 0, phase: 'open', dice: null, openDice: null, turnObj: null, cube: { v: 1, owner: -1 }, cubeTurned: false,
    score, crawford, crawfordDone, crawfordNext: false, gameNo, entries: [], offer: null, result: '', hits: [0, 0], doubles: [0, 0], lastMoves: null,
  });
  const [g, setGState] = useState<G>(() => fresh(1, [0, 0], false, false));
  const gref = useRef(g);
  const setG = useCallback((n: G | ((o: G) => G)) => { const v = typeof n === 'function' ? n(gref.current) : n; gref.current = v; setGState(v); }, []);
  const [msg, setMsg] = useState('');
  const [hint, setHint] = useState<{ seq: Seq; p: number } | null>(null);
  const [prob, setProb] = useState<number | null>(null);
  const [secs, setSecs] = useState(0);
  const [pick, setPick] = useState<[number, number]>([6, 6]);
  const luck = useRef(0);
  const tok = useRef(0);
  const helped = useRef(false);
  const worst = useRef(0);
  const doneGame = useRef(-1);
  const rnd = useRef(Math.random);

  useTicker(g.phase === 'move' || g.phase === 'roll', (dt) => setSecs((x) => x + dt / 1000), 1000);

  useEffect(() => { if (secrets.glueck) { luck.current = 3; helped.current = true; } }, [secrets.glueck]);

  // ───── Spielfluss ─────
  const startOpening = useCallback(() => {
    const t = ++tok.current;
    let a = 0, b = 0;
    while (a === b) { a = 1 + Math.floor(rnd.current() * 6); b = 1 + Math.floor(rnd.current() * 6); }
    setG((o) => ({ ...o, phase: 'open', openDice: [a, b] }));
    sfx('drop');
    setMsg(setup.opp === 'ki' ? `Eröffnungswurf: Weiß ${a}, Schwarz ${b} – ${a > b ? 'Weiß' : 'Schwarz'} beginnt.` : `Eröffnungswurf: Weiß ${a}, Schwarz ${b}.`);
    setTimeout(() => {
      if (t !== tok.current) return;
      const first: Side = a > b ? 0 : 1;
      setG((o) => ({ ...o, phase: 'move', turn: first, dice: [a, b], openDice: null, turnObj: newTurn(o.s, first, [a, b]) }));
    }, 1500);
  }, [setG, setup.opp]);

  useEffect(() => { startOpening(); return () => { tok.current++; cancelAi(); }; }, [startOpening]);

  const finishTurn = useCallback((t: Turn) => {
    const o = gref.current;
    if (o.phase !== 'move' || !o.turnObj) return;
    const p = t.p;
    const nHits = t.played.filter((m) => m.hit).length;
    const entry: MLogEntry = { p, kind: 'zug', dice: o.dice ?? undefined, moves: t.played.length ? notate(t.played) : 'kein Zug', mv: t.played.map(raw) };
    const isDouble = o.dice && o.dice[0] === o.dice[1];
    const hits: [number, number] = [o.hits[0], o.hits[1]]; hits[p] += nHits;
    const doubles: [number, number] = [o.doubles[0], o.doubles[1]]; if (isDouble) doubles[p]++;
    const entries = [...o.entries, entry];
    const idx = entries.length - 1;
    // Coach: nur bei echten Entscheidungen
    if (S.coach && !isAi(p) && t.seqs.length > 1 && t.played.length) {
      askJudge(t.start, p, o.dice ?? [], { moves: t.played, end: t.cur }).then((j) => {
        worst.current = Math.max(worst.current, j.loss);
        onCoach(j.loss);
        setG((cur) => ({ ...cur, entries: cur.entries.map((e, i) => (i === idx && cur.gameNo === o.gameNo ? { ...e, loss: j.loss } : e)) }));
      });
    }
    const end: BG = t.cur;
    const out = outcome(end, o.cube.v, o.cubeTurned, setup.jacoby);
    if (out) { endGame(o, { s: end, entries, hits, doubles, lastMoves: { p, moves: t.played } }, out.winner, out.points, out.kind); return; }
    setHint(null);
    setG({ ...o, s: end, entries, hits, doubles, turn: opp(p), phase: 'roll', dice: null, turnObj: null, lastMoves: t.played.length ? { p, moves: t.played } : null });
    setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.coach, setup]);

  const endGame = (o: G, patch: Partial<G>, winner: Side, points: number, kind: GameEnd['kind']) => {
    if (doneGame.current === o.gameNo) return;
    doneGame.current = o.gameNo;
    const score: [number, number] = [o.score[0], o.score[1]];
    score[winner] += points;
    const matchOver = setup.match > 0 && score[winner] >= setup.match;
    let text = `${sname(winner)} gewinnt ${points} Punkt${points === 1 ? '' : 'e'}${kind === 'gammon' ? ' (Gammon)' : kind === 'backgammon' ? ' (Backgammon)' : kind === 'aufgabe' ? ' (Aufgabe)' : ''}.`;
    if (matchOver) text += ` ${sname(winner)} gewinnt das Match ${score[winner]}:${score[opp(winner)]}.`;
    const crawfordNext = setup.match > 0 && !o.crawfordDone && !matchOver && (score[0] === setup.match - 1 || score[1] === setup.match - 1);
    const n: G = { ...o, ...patch, score, phase: matchOver ? 'matchover' : 'between', result: text, crawfordDone: o.crawfordDone || o.crawford || crawfordNext, offer: null, turnObj: null, dice: null };
    n.crawfordNext = crawfordNext;
    setG(n);
    sfx(setup.opp === 'ki' ? (winner === human ? 'win' : 'lose') : 'win');
    onGameEnd({ setup, winner, points, kind, cubeValue: o.cube.v, hits: n.hits, doubles: n.doubles, matchOver, score, entries: n.entries, helped: helped.current, worstLoss: worst.current });
  };

  const nextGame = () => {
    const o = gref.current;
    const crawfordNext = o.crawfordNext;
    helped.current = false;
    worst.current = 0;
    setHint(null); setProb(null); setMsg('');
    setG(fresh(o.gameNo + 1, o.score, crawfordNext, o.crawfordDone));
    startOpening();
  };

  const doRoll = useCallback((forced?: [number, number]) => {
    const o = gref.current;
    if (o.phase !== 'roll') return;
    let d: [number, number];
    if (forced) { d = forced; helped.current = true; }
    else if (luck.current > 0 && !isAi(o.turn)) { luck.current--; const v = 1 + Math.floor(rnd.current() * 6); d = [v, v]; helped.current = true; }
    else d = rollDice(rnd.current);
    sfx('drop');
    const t = newTurn(o.s, o.turn, d);
    setG({ ...o, phase: 'move', dice: d, turnObj: t });
    setHint(null);
    if (d[0] === d[1]) toast(`Pasch: vier mal ${d[0]}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───── KI ─────
  useEffect(() => {
    if (g.phase !== 'roll' || !isAi(g.turn) || g.offer !== null) return;
    const t = ++tok.current;
    const o = g;
    const canCube = setup.cube && !o.crawford && (o.cube.owner === -1 || o.cube.owner === o.turn) && o.cube.v < 64;
    const go = async () => {
      await new Promise((r) => setTimeout(r, 500));
      if (t !== tok.current) return;
      if (canCube) {
        const dbl = await askDouble({ ...o.s, turn: o.turn }, o.turn, setup.level, freshSeed());
        if (t !== tok.current) return;
        if (dbl) { setG((c) => ({ ...c, offer: o.turn })); setMsg(`${sname(o.turn)} verdoppelt auf ${o.cube.v * 2}.`); sfx('good'); return; }
      }
      doRoll();
    };
    void go();
    return () => { tok.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.phase, g.turn, g.gameNo, g.offer]);

  useEffect(() => {
    if (g.phase !== 'move' || !isAi(g.turn) || !g.turnObj || !g.dice || g.turnObj.played.length) return;
    const t = ++tok.current;
    const o = g;
    const run = async () => {
      const ch = await askMove(o.s, o.turn, o.dice!, setup.level, freshSeed());
      if (t !== tok.current) return;
      let cur = o.turnObj!;
      if (!ch.seq) { setMsg(`${sname(o.turn)} kann nicht ziehen.`); await new Promise((r) => setTimeout(r, 1000)); if (t === tok.current) finishTurn(cur); return; }
      await new Promise((r) => setTimeout(r, 450));
      for (const m of ch.seq.moves) {
        if (t !== tok.current) return;
        cur = step(cur, m);
        setG((c) => ({ ...c, turnObj: cur }));
        sfx(m.hit ? 'pop' : m.to === 0 ? 'good' : 'place');
        await new Promise((r) => setTimeout(r, 520));
      }
      if (t !== tok.current) return;
      setMsg(`${sname(o.turn)}: ${notate(cur.played)}`);
      finishTurn(cur);
    };
    void run();
    return () => { tok.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.phase, g.turn, g.gameNo, g.dice]);

  // Mensch: automatisch weiter, wenn nichts mehr geht
  const humanTurn = g.phase === 'move' && !isAi(g.turn) && !!g.turnObj;
  useEffect(() => {
    if (!humanTurn || !g.turnObj) return;
    const t = g.turnObj;
    if (hasNoMove(t)) { setMsg('Kein Zug möglich.'); const id = setTimeout(() => finishTurn(t), 1300); return () => clearTimeout(id); }
    if (isComplete(t) && !S.confirmEnd) { const id = setTimeout(() => finishTurn(t), 450); return () => clearTimeout(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanTurn, g.turnObj]);

  // Auto-Würfeln
  useEffect(() => {
    if (g.phase === 'roll' && !isAi(g.turn) && S.autoRoll && g.offer === null) { const id = setTimeout(() => doRoll(), 350); return () => clearTimeout(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.phase, g.turn, g.gameNo, S.autoRoll, g.offer]);

  // Pythia: Siegchance
  useEffect(() => {
    if (!secrets.pythia || g.phase === 'open' || g.phase === 'between' || g.phase === 'matchover') { setProb(null); return; }
    helped.current = true;
    askProb({ ...g.s, turn: human }, human).then(setProb);
  }, [secrets.pythia, g.s, g.phase, human]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── Eingaben ─────
  const ctrl = useTurnControl(g.turnObj, (t) => setG((c) => ({ ...c, turnObj: t })), humanTurn, (m) => sfx(m.hit ? 'pop' : m.to === 0 ? 'good' : 'place'));

  const undo = () => { const o = gref.current; if (humanTurn && o.turnObj && o.turnObj.played.length) { setG({ ...o, turnObj: undoStep(o.turnObj) }); sfx('erase'); } };
  const confirm = () => { const o = gref.current; if (humanTurn && o.turnObj && (isComplete(o.turnObj) || hasNoMove(o.turnObj))) finishTurn(o.turnObj); };
  const askHint = () => {
    const o = gref.current;
    if (!humanTurn || !o.turnObj || !o.dice) return;
    helped.current = true;
    setMsg('Die KI rechnet …');
    askMove(o.turnObj.start, o.turn, o.dice, 6, freshSeed()).then((c) => { if (c.seq) { setHint({ seq: c.seq, p: c.p }); setMsg(`Tipp: ${notate(c.seq.moves)}`); } else setMsg('Kein Zug möglich.'); });
  };

  const playHint = async () => {
    const o = gref.current;
    if (!hint || !o.turnObj || o.turnObj.played.length) return;
    let cur = o.turnObj;
    for (const m of hint.seq.moves) { cur = step(cur, m); setG((c) => ({ ...c, turnObj: cur })); sfx(m.hit ? 'pop' : m.to === 0 ? 'good' : 'place'); await new Promise((r) => setTimeout(r, 420)); }
    setHint(null);
  };

  const canDouble = g.phase === 'roll' && !isAi(g.turn) && setup.cube && !g.crawford && (g.cube.owner === -1 || g.cube.owner === g.turn) && g.cube.v < 64 && g.offer === null;
  const offerDouble = async () => {
    const o = gref.current;
    if (!canDouble) return;
    if (setup.opp === 'zwei') { setG({ ...o, offer: o.turn }); setMsg(`${sname(o.turn)} verdoppelt auf ${o.cube.v * 2}.`); return; }
    setMsg('Die KI überlegt …');
    const take = await askTake({ ...o.s, turn: o.turn }, opp(o.turn), setup.level, freshSeed());
    sfx('good');
    if (take) {
      setG({ ...gref.current, cube: { v: o.cube.v * 2, owner: opp(o.turn) }, cubeTurned: true, entries: [...gref.current.entries, { p: o.turn, kind: 'doppeln' }, { p: opp(o.turn), kind: 'annehmen' }] });
      setMsg('Die KI nimmt an. Der Würfel steht jetzt bei ihr.');
    } else {
      setMsg('Die KI gibt auf.');
      endGame(o, { entries: [...o.entries, { p: o.turn, kind: 'doppeln' }, { p: opp(o.turn), kind: 'passen' }] }, o.turn, o.cube.v, 'aufgabe');
    }
  };
  const answerOffer = (take: boolean) => {
    const o = gref.current;
    if (o.offer === null) return;
    const by = o.offer, taker = opp(by);
    if (take) {
      setG({ ...o, offer: null, cube: { v: o.cube.v * 2, owner: taker }, cubeTurned: true, entries: [...o.entries, { p: by, kind: 'doppeln' }, { p: taker, kind: 'annehmen' }] });
      setMsg(`Angenommen: Würfel steht bei ${setup.opp === 'ki' ? 'dir' : sname(taker)} auf ${o.cube.v * 2}.`);
    } else {
      endGame(o, { entries: [...o.entries, { p: by, kind: 'doppeln' }, { p: taker, kind: 'passen' }] }, by, o.cube.v, 'aufgabe');
    }
  };
  const resign = () => {
    const o = gref.current;
    if (o.phase === 'between' || o.phase === 'matchover' || o.phase === 'open') return;
    const loser: Side = setup.opp === 'ki' ? human : o.turn;
    const w = opp(loser);
    tok.current++; cancelAi();
    endGame(o, {}, w, o.cube.v, 'aufgabe');
  };

  useKeys((e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const o = gref.current; if (o.phase === 'roll' && !isAi(o.turn) && o.offer === null) doRoll(); else confirm(); }
    else if (e.key === 'u' || e.key === 'U') undo();
    else if (e.key === 'h' || e.key === 'H') askHint();
    else if (e.key === 'd' || e.key === 'D') void offerDouble();
  }, [g.phase, g.turn, g.turnObj]);

  const cur = g.turnObj ? g.turnObj.cur : g.s;
  const dice: number[] = g.openDice ? g.openDice : g.dice ? g.dice : [];
  const used = g.turnObj ? g.turnObj.played.map((m) => m.die) : [];
  const pw = pips(cur, 0), pb = pips(cur, 1);
  const myTurn = humanTurn;
  const crawfordNote = g.crawford ? 'Crawford-Spiel: kein Doppelwürfel' : '';
  const hintMoves = hint ? hint.seq.moves : null;
  const canRoll = g.phase === 'roll' && !isAi(g.turn) && g.offer === null;

  const names: [string, string] = setup.opp === 'ki' ? [human === 0 ? 'Du' : `KI · Stufe ${setup.level}`, human === 1 ? 'Du' : `KI · Stufe ${setup.level}`] : ['Weiß', 'Schwarz'];
  const matchTxt = setup.match > 0 ? `Match bis ${setup.match}` : 'Einzelspiel';

  return (
    <div className="gm-play">
      <div className="gm-stage">
        <div className="gm-boardwrap">
          <BoardView
            s={cur} viewer={viewer} selected={ctrl.selected} targets={ctrl.targets} dice={dice} usedDice={used} turn={g.openDice ? 0 : g.turn}
            cube={g.cube} lastMoves={g.lastMoves} hintMoves={hintMoves} pipLabels={S.pipLabels} mirror={S.mirror}
            onPoint={ctrl.onPoint} onDouble={ctrl.onDouble} canRoll={canRoll} onDice={() => doRoll()}
            canCube={canDouble} onCube={() => void offerDouble()}
          />
          {g.offer !== null && !isAi(opp(g.offer)) && (
            <div className="gm-modal" role="dialog" aria-label="Doppelwürfel">
              <h3>{sname(g.offer)} verdoppelt</h3>
              <p>Einsatz {g.cube.v} → {g.cube.v * 2}. Annehmen? Passen verliert {g.cube.v} Punkt{g.cube.v === 1 ? '' : 'e'}.</p>
              <div className="gm-actions"><button className="primary" onClick={() => answerOffer(true)}>Annehmen</button><button className="danger" onClick={() => answerOffer(false)}>Passen</button></div>
            </div>
          )}
          {(g.phase === 'between' || g.phase === 'matchover') && (
            <div className="gm-modal" role="dialog" aria-label="Spielende">
              <h3>{g.phase === 'matchover' ? 'Match beendet' : 'Spiel beendet'}</h3>
              <p>{g.result}</p>
              <p className="gm-sub">Stand: Weiß {g.score[0]} · Schwarz {g.score[1]}</p>
              <div className="gm-actions">
                {g.phase === 'between' && <button className="primary" onClick={nextGame}>Nächstes Spiel</button>}
                {g.phase === 'matchover' && <button className="primary" onClick={() => { setG(fresh(1, [0, 0], false, false)); doneGame.current = -1; helped.current = false; worst.current = 0; startOpening(); }}>Neues Match</button>}
                <button onClick={onExit}>Menü</button>
              </div>
            </div>
          )}
        </div>
        <aside className="gm-panel">
          <div className="gm-matchline"><b>{matchTxt}</b><span>Spiel {g.gameNo}{crawfordNote ? ` · ${crawfordNote}` : ''}</span></div>
          {([0, 1] as Side[]).map((p) => (
            <div key={p} className={`gm-player ${g.turn === p && (g.phase === 'move' || g.phase === 'roll') ? 'on' : ''}`}>
              <span className={`gm-dot ${p === 0 ? 'w' : 'b'}`} />
              <div><b>{names[p]}</b><small>{sname(p)} · Pips {p === 0 ? pw : pb} · draußen {cur.off[p]}/{cur.total}</small></div>
              {setup.match > 0 && <em className="gm-score">{g.score[p]}</em>}
            </div>
          ))}
          <div className="gm-info"><span>Würfel {g.cube.owner === -1 ? '1 (Mitte)' : `${g.cube.v} (${setup.opp === 'ki' ? (g.cube.owner === human ? 'bei dir' : 'bei KI') : sname(g.cube.owner as Side)})`}</span><span>{Math.floor(secs / 60)}:{String(Math.floor(secs % 60)).padStart(2, '0')}</span></div>
          {msg && <p className="gm-msg" role="status">{msg}</p>}
          {secrets.pythia && prob !== null && <div className="gm-wr"><div style={{ width: `${Math.round(prob * 100)}%` }} /><span>Deine Siegchance ≈ {Math.round(prob * 100)} %</span></div>}
          {secrets.wuerfel && canRoll && (
            <div className="gm-pick">
              <span>Gezinkt:</span>
              {[0, 1].map((k) => <select key={k} value={pick[k]} aria-label={`Würfel ${k + 1}`} onChange={(e) => setPick((q) => (k === 0 ? [+e.target.value, q[1]] : [q[0], +e.target.value]))}>{[1, 2, 3, 4, 5, 6].map((v) => <option key={v}>{v}</option>)}</select>)}
              <button onClick={() => doRoll(pick)}>Setzen</button>
            </div>
          )}
          <div className="gm-actions">
            {canRoll && <button className="primary" onClick={() => doRoll()}>Würfeln <kbd>␣</kbd></button>}
            {canDouble && <button onClick={() => void offerDouble()}>Verdoppeln <kbd>D</kbd></button>}
            {myTurn && <button onClick={undo} disabled={!g.turnObj?.played.length}>Zurück <kbd>U</kbd></button>}
            {myTurn && S.confirmEnd && <button className="primary" onClick={confirm} disabled={!(g.turnObj && (isComplete(g.turnObj) || hasNoMove(g.turnObj)))}>Fertig <kbd>⏎</kbd></button>}
            {myTurn && setup.opp === 'ki' && <button onClick={askHint}>Tipp <kbd>H</kbd></button>}
            {myTurn && hint && !g.turnObj?.played.length && <button onClick={() => void playHint()}>Tipp spielen</button>}
            {(g.phase === 'move' || g.phase === 'roll') && <button className="danger" onClick={resign}>Aufgeben</button>}
          </div>
          <details className="gm-log" open>
            <summary>Zugliste</summary>
            <ol>
              {g.entries.map((e, i) => (
                <li key={i} className={e.p === 0 ? 'w' : 'b'}>
                  <span className="gm-n">{sname(e.p)[0]}</span>
                  {e.kind === 'zug' ? <><b>{e.dice ? `${e.dice[0]}${e.dice[1]}` : ''}</b> {e.moves}</> : <i>{e.kind === 'doppeln' ? 'verdoppelt' : e.kind === 'annehmen' ? 'nimmt an' : 'passt'}</i>}
                  {e.loss !== undefined && e.loss >= 0.025 && <em className={e.loss >= 0.1 ? 'bad' : 'meh'} title={`Verlust ${(e.loss * 100).toFixed(1)} % Siegchance`}>−{(e.loss * 100).toFixed(1)}%</em>}
                </li>
              ))}
            </ol>
          </details>
        </aside>
      </div>
    </div>
  );
}

