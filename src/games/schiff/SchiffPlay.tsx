import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LEVELS_S, type Mission, type SLogShot, type SSettings } from './data';
import { type Rules, type Ship, type Side, aiFleet, aliveShips, allSunk, around, chooseShots, densityMap, fire, isSunk, knowledgeOf, newSide, radar } from './engine';
import Placement, { type Layout } from './Placement';
import SeaGrid from './SeaGrid';
import { freshSeed, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { fmtTime } from '../shared/store';
import { useKeys, useTicker } from '../shared/hooks';

export interface PlaySetup { mode: 'ki' | 'zwei' | 'jagd'; level: number; rules: Rules; fleetKey: string; mission?: Mission; seed?: number; daily?: boolean }

export interface GameInfo {
  setup: PlaySetup;
  winner: 0 | 1;
  humanWon: boolean;
  shots: number;
  hits: number;
  sunkEnemy: number;
  lostShips: number;
  accuracy: number;
  helped: boolean;
  log: SLogShot[];
  fleets: [number[][], number[][]];
  seconds: number;
}

const LET = 'ABCDEFGHIJKLMNOP';
const name = (n: number, i: number) => `${LET[i % n]}${Math.floor(i / n) + 1}`;
type Phase = 'place1' | 'cover' | 'place2' | 'battle' | 'over';

export default function SchiffPlay({ setup, S, secrets, layouts, onSaveLayout, onFinish, onExit }: {
  setup: PlaySetup; S: SSettings; secrets: { sonar: boolean; torpedo: boolean; nebelhorn: boolean };
  layouts: Layout[]; onSaveLayout: (l: Layout) => void; onFinish: (i: GameInfo) => void; onExit: () => void;
}) {
  const { rules, mode } = setup;
  const n = rules.n;
  const [phase, setPhase] = useState<Phase>(mode === 'jagd' ? 'battle' : 'place1');
  const [sides, setSidesState] = useState<[Side, Side]>(() => {
    if (mode === 'jagd') return [newSide(n), newSide(n, aiFleet(rules, mulberry32(setup.seed ?? freshSeed())))];
    return [newSide(n), newSide(n)];
  });
  const sref = useRef(sides);
  const setSides = (s: [Side, Side]) => { sref.current = s; setSidesState(s); };
  const [turn, setTurn] = useState<0 | 1>(0);
  const [quota, setQuota] = useState(1);
  const [pending, setPending] = useState<number[]>([]);
  const [radarMode, setRadarMode] = useState(false);
  const [torpedoMode, setTorpedoMode] = useState(false);
  const [torpedoUsed, setTorpedoUsed] = useState(false);
  const [radarLeft, setRadarLeft] = useState<[number, number]>([rules.radar, rules.radar]);
  const [reads, setReads] = useState<[Map<number, number>, Map<number, number>]>([new Map(), new Map()]);
  const [msgs, setMsgs] = useState<{ t: string; who: 0 | 1 }[]>([]);
  const [last, setLast] = useState<{ by: 0 | 1; cells: number[] }>({ by: 0, cells: [] });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { text: string; winner: 0 | 1 }>(null);
  const [secs, setSecs] = useState(0);
  const [cover, setCover] = useState(false);
  const tok = useRef(0);
  const logRef = useRef<SLogShot[]>([]);
  const stats = useRef({ shots: 0, hits: 0, acc: 0, accN: 0, helped: false, sunkEnemy: 0 });
  const done = useRef(false);

  const humanIs = (p: 0 | 1) => mode === 'zwei' || p === 0;
  const target = sides[turn === 0 ? 1 : 0];
  const hideSunk = rules.fog && !secrets.nebelhorn;

  useTicker(phase === 'battle', (dt) => setSecs((s) => s + dt / 1000), 1000);
  useEffect(() => () => { tok.current++; }, []);
  useEffect(() => { if (secrets.sonar || secrets.torpedo || secrets.nebelhorn) stats.current.helped = true; }, [secrets]);

  const push = (t: string, who: 0 | 1) => setMsgs((m) => [{ t, who }, ...m].slice(0, 40));
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // ───── Aufstellung abgeschlossen ─────
  const placed1 = (ships: Ship[]) => {
    if (mode === 'ki') {
      const ai = aiFleet(rules, mulberry32(freshSeed()));
      setSides([newSide(n, ships), newSide(n, ai)]);
      setPhase('battle'); setTurn(0); setQuota(1); push('Das Gefecht beginnt. Du eröffnest das Feuer.', 0);
    } else {
      setSides([newSide(n, ships), sref.current[1]]);
      setCover(true); setPhase('cover');
    }
  };
  const placed2 = (ships: Ship[]) => {
    setSides([sref.current[0], newSide(n, ships)]);
    setPhase('battle'); setTurn(0); setQuota(1); setCover(true);
  };

  // ───── Gefecht ─────
  const startTurn = useCallback((p: 0 | 1, s: [Side, Side]) => {
    const q = rules.salvo && mode !== 'jagd' ? Math.max(1, aliveShips(s[p]).length) : 1;
    setTurn(p); setQuota(q); setPending([]); setRadarMode(false); setTorpedoMode(false);
    if (mode === 'zwei') setCover(true);
  }, [rules.salvo, mode]);

  const finish = (winner: 0 | 1, text: string) => {
    if (done.current) return;
    done.current = true;
    tok.current++;
    setResult({ text, winner });
    setPhase('over');
    const s = sref.current;
    const humanWon = mode === 'zwei' ? true : mode === 'jagd' ? true : winner === 0;
    sfx(humanWon ? 'win' : 'lose');
    const st = stats.current;
    onFinish({
      setup, winner, humanWon, shots: st.shots, hits: st.hits, sunkEnemy: st.sunkEnemy,
      lostShips: s[0].ships.filter((x) => isSunk(s[0], x)).length, accuracy: st.accN ? st.acc / st.accN : 0, helped: st.helped,
      log: logRef.current, fleets: [s[0].ships.map((x) => x.cells), s[1].ships.map((x) => x.cells)], seconds: Math.round(secs),
    });
  };

  /** Ein Schuss von p auf den Gegner; liefert Ergebnis und ob der Treffer-Folgeschuss gilt. */
  const shoot = (p: 0 | 1, cell: number, human: boolean) => {
    const s = sref.current;
    const tgt = s[p === 0 ? 1 : 0];
    if (human && mode !== 'zwei') {
      const k = knowledgeOf(tgt, rules, reads[0]);
      const d = densityMap(k);
      let mx = 0;
      for (let i = 0; i < d.length; i++) if (!tgt.shots[i] && d[i] > mx) mx = d[i];
      stats.current.acc += mx > 0 ? Math.min(1, d[cell] / mx) : 1;
      stats.current.accN++;
    }
    const r = fire(tgt, cell);
    sref.current = [s[0], s[1]];
    setSidesState([s[0], s[1]]);
    logRef.current.push({ by: p, i: cell, kind: r.kind });
    if (human) { stats.current.shots++; if (r.kind !== 'wasser') stats.current.hits++; if (r.kind === 'versenkt') stats.current.sunkEnemy++; }
    setLast((l) => ({ by: p, cells: l.by === p ? [...l.cells, cell] : [cell] }));
    const who = mode === 'ki' ? (p === 0 ? 'Du' : 'KI') : `Spieler ${p + 1}`;
    const txt = r.kind === 'wasser' ? 'Wasser' : r.kind === 'treffer' ? 'Treffer!' : (hideSunk ? 'Treffer!' : `Versenkt! (${r.ship!.len}er)`);
    push(`${who}: ${name(n, cell)} – ${txt}`, p);
    sfx(r.kind === 'wasser' ? 'drop' : r.kind === 'treffer' ? 'pop' : 'boom');
    return r;
  };

  const fireHuman = async (cells: number[]) => {
    if (busy) return;
    setBusy(true);
    const t = ++tok.current;
    setPending([]);
    setLast({ by: turn, cells: [] });
    let hitAgain = false;
    for (const c of cells) {
      if (t !== tok.current) return;
      const r = shoot(turn, c, true);
      hitAgain = hitAgain || r.kind !== 'wasser';
      const tgt = sref.current[turn === 0 ? 1 : 0];
      if (allSunk(tgt)) { setBusy(false); finish(turn, mode === 'jagd' ? `Flotte versenkt in ${stats.current.shots} Schüssen.` : `${mode === 'ki' ? 'Du hast' : `Spieler ${turn + 1} hat`} die feindliche Flotte versenkt.`); return; }
      await wait(cells.length > 1 ? 420 : 120);
    }
    setBusy(false);
    if (mode === 'jagd') { setQuota(1); return; }
    if (rules.chain && !rules.salvo && hitAgain) { push('Treffer – du schießt noch einmal.', turn); setQuota(1); return; }
    await wait(300);
    startTurn(turn === 0 ? 1 : 0, sref.current);
  };

  const radarShot = (cell: number) => {
    const left = radarLeft[turn];
    if (left <= 0) return;
    const tgt = sref.current[turn === 0 ? 1 : 0];
    const v = radar(tgt, n, cell);
    const m = new Map(reads[turn]); m.set(cell, v);
    setReads(turn === 0 ? [m, reads[1]] : [reads[0], m]);
    setRadarLeft(turn === 0 ? [left - 1, radarLeft[1]] : [radarLeft[0], left - 1]);
    logRef.current.push({ by: turn, i: cell, kind: 'radar', extra: v });
    push(`${mode === 'ki' ? 'Du' : `Spieler ${turn + 1}`}: Radar ${name(n, cell)} – ${v} Schiffsfeld${v === 1 ? '' : 'er'} im Umkreis`, turn);
    sfx('good');
    setRadarMode(false);
    void (async () => { await wait(500); if (mode !== 'jagd') startTurn(turn === 0 ? 1 : 0, sref.current); })();
  };

  const torpedoRow = (cell: number) => {
    const y = Math.floor(cell / n);
    const cells: number[] = [];
    for (let x = 0; x < n; x++) { const i = y * n + x; if (!target.shots[i]) cells.push(i); }
    setTorpedoMode(false); setTorpedoUsed(true); stats.current.helped = true;
    void fireHuman(cells);
  };

  const clickEnemy = (i: number) => {
    if (phase !== 'battle' || busy || cover || !humanIs(turn) || result) return;
    if (target.shots[i]) return;
    if (torpedoMode) { torpedoRow(i); return; }
    if (radarMode) { radarShot(i); return; }
    if (rules.salvo && mode !== 'jagd' || S.confirm) {
      setPending((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < quota ? [...p, i] : p));
      sfx('tick');
      return;
    }
    void fireHuman([i]);
  };

  // ───── KI-Zug ─────
  useEffect(() => {
    if (phase !== 'battle' || mode !== 'ki' || turn !== 1 || result || cover) return;
    const t = ++tok.current;
    const run = async () => {
      await wait(700);
      const rnd = mulberry32(freshSeed());
      let shotsLeft = quota;
      setLast({ by: 1, cells: [] });
      // Radar, wenn sinnvoll
      const my = sref.current[0];
      if (radarLeft[1] > 0 && setup.level >= 4 && !hasOpenHit(my) && rnd() < 0.35) {
        const k = knowledgeOf(my, rules, reads[1]);
        const d = densityMap(k);
        let best = 0, bi = -1;
        for (let i = 0; i < d.length; i++) { let sum = d[i]; for (const a of around(n, i)) sum += d[a]; if (sum > best && !reads[1].has(i)) { best = sum; bi = i; } }
        if (bi >= 0) {
          const v = radar(my, n, bi);
          const m = new Map(reads[1]); m.set(bi, v);
          setReads([reads[0], m]); setRadarLeft([radarLeft[0], radarLeft[1] - 1]);
          logRef.current.push({ by: 1, i: bi, kind: 'radar', extra: v });
          push(`KI: Radar ${name(n, bi)} – ${v} Schiffsfeld${v === 1 ? '' : 'er'} im Umkreis`, 1);
          sfx('good');
          await wait(700);
          if (t !== tok.current) return;
          startTurn(0, sref.current);
          return;
        }
      }
      while (shotsLeft > 0) {
        if (t !== tok.current) return;
        const cur = sref.current[0];
        const k = knowledgeOf(cur, rules, reads[1]);
        const [cell] = chooseShots(setup.level, k, 1, rnd);
        if (cell === undefined) break;
        const r = shoot(1, cell, false);
        if (allSunk(sref.current[0])) { finish(1, 'Deine Flotte wurde versenkt.'); return; }
        shotsLeft--;
        if (rules.chain && !rules.salvo && r.kind !== 'wasser') shotsLeft = Math.max(shotsLeft, 1);
        await wait(rules.salvo ? 520 : 650);
      }
      if (t !== tok.current) return;
      await wait(250);
      startTurn(0, sref.current);
    };
    void run();
    return () => { tok.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn, cover, result, mode]);

  useKeys((e) => {
    if (e.key === 'Enter' && pending.length && !busy) void fireHuman(pending);
    else if ((e.key === 'r' || e.key === 'R') && rules.radar > 0 && phase === 'battle') setRadarMode((x) => !x);
    else if (e.key === 'Escape') { setPending([]); setRadarMode(false); setTorpedoMode(false); }
  }, [pending, busy, phase]);

  // ───── Anzeige ─────
  const viewer: 0 | 1 = mode === 'zwei' ? turn : 0;
  const enemy = sides[viewer === 0 ? 1 : 0];
  const mine = sides[viewer];
  const heat = useMemo(() => (secrets.sonar && phase === 'battle' ? densityMap(knowledgeOf(enemy, rules, reads[viewer])) : null), [secrets.sonar, phase, enemy.shots, reads, turn]); // eslint-disable-line react-hooks/exhaustive-deps
  const revealedEnemy: Ship[] = phase === 'over' ? enemy.ships : hideSunk ? [] : enemy.ships.filter((s) => isSunk(enemy, s));
  const playerName = mode === 'ki' ? 'Du' : `Spieler ${turn + 1}`;
  const levelName = LEVELS_S.find((l) => l.id === setup.level)?.name;

  if (phase === 'place1') return <Placement n={n} lens={rules.lens} spacing={rules.spacing} S={S} title={mode === 'zwei' ? 'Spieler 1: Flotte aufstellen' : 'Stelle deine Flotte auf'} layouts={layouts} onSaveLayout={onSaveLayout} onDone={placed1} />;
  if (phase === 'place2') return <Placement n={n} lens={rules.lens} spacing={rules.spacing} S={S} title="Spieler 2: Flotte aufstellen" layouts={[]} onSaveLayout={() => undefined} onDone={placed2} />;
  if (phase === 'cover' && cover) {
    return (
      <div className="ss-cover">
        <h2>Gerät übergeben</h2>
        <p>Spieler 2 stellt jetzt seine Flotte auf. Spieler 1: nicht hinsehen!</p>
        <button className="primary" onClick={() => { setCover(false); setPhase('place2'); }}>Bereit</button>
      </div>
    );
  }

  const shipRow = (side: Side, own: boolean) => (
    <ul className="ss-fleetrow">
      {side.ships.map((s) => {
        const dead = isSunk(side, s);
        const known = own || dead && !hideSunk || phase === 'over';
        return <li key={s.id} className={`${dead && known ? 'dead' : ''}`} title={known ? `${s.len}er${dead ? ' – gesunken' : ''}` : 'unbekannt'}>{Array.from({ length: s.len }, (_, k) => <i key={k} />)}</li>;
      })}
    </ul>
  );

  return (
    <div className="ss-play">
      <div className="ss-board2">
        <section className="ss-enemy">
          <header><h3>{mode === 'jagd' ? 'Gesuchte Flotte' : mode === 'ki' ? `Gegner · ${levelName}` : `Feindliche Gewässer (Spieler ${viewer === 0 ? 2 : 1})`}</h3><span>{secs ? fmtTime(secs) : '0:00'}</span></header>
          <div className="ss-gridwrap">
            <SeaGrid n={n} ships={revealedEnemy} shots={enemy.shots} interactive={phase === 'battle' && humanIs(turn) && !busy && !cover} coords={S.coords} sweep={S.sweep} lastShots={last.by === viewer ? last.cells : []}
              pending={pending} heat={heat} radarReads={reads[viewer]} label="Feindliche Gewässer" onCell={clickEnemy} />
            {cover && phase === 'battle' && (
              <div className="ss-cover in">
                <h2>Spieler {turn + 1} ist dran</h2>
                <p>Gerät übergeben, dann bereit melden.</p>
                <button className="primary" onClick={() => setCover(false)}>Bereit</button>
              </div>
            )}
          </div>
          {phase === 'battle' && mode !== 'jagd' && shipRow(enemy, false)}
        </section>
        <aside className="ss-side">
          {mode !== 'jagd' && (
            <section className="ss-own">
              <header><h3>{mode === 'ki' ? 'Deine Flotte' : `Flotte von Spieler ${viewer + 1}`}</h3></header>
              <div className="ss-gridwrap small"><SeaGrid n={n} ships={mine.ships} shots={mine.shots} coords={S.coords} lastShots={last.by !== viewer ? last.cells : []} label="Eigene Flotte" /></div>
              {shipRow(mine, true)}
            </section>
          )}
          <section className="ss-console">
            {phase === 'battle' && !result && (
              <p className="ss-turn">{busy ? 'Schüsse unterwegs …' : mode === 'ki' && turn === 1 ? 'Die KI zielt …' : `${playerName}: ${quota > 1 ? `${quota} Schüsse` : 'ein Schuss'}${rules.chain ? ' (Treffer = nochmal)' : ''}`}</p>
            )}
            {mode === 'jagd' && <p className="ss-turn">Schüsse: <b>{stats.current.shots}</b> · Versenkt: <b>{stats.current.sunkEnemy}</b> / {enemy.ships.length}</p>}
            {phase === 'battle' && !result && humanIs(turn) && (
              <div className="ss-actions">
                {pending.length > 0 && <button className="primary" onClick={() => void fireHuman(pending)} disabled={busy}>Feuer! ({pending.length}) <kbd>⏎</kbd></button>}
                {rules.radar > 0 && mode !== 'jagd' && <button className={radarMode ? 'on' : ''} onClick={() => { setRadarMode((x) => !x); setTorpedoMode(false); }} disabled={radarLeft[turn] <= 0}>Radar ({radarLeft[turn]}) <kbd>R</kbd></button>}
                {secrets.torpedo && !torpedoUsed && <button className={torpedoMode ? 'on' : ''} onClick={() => { setTorpedoMode((x) => !x); setRadarMode(false); }}>Torpedo</button>}
                {pending.length > 0 && <button onClick={() => setPending([])}>Zurücksetzen</button>}
              </div>
            )}
            {radarMode && <p className="ss-sub">Radar: Wähle die Mitte eines 3×3-Feldes. Du erfährst nur, wie viele Schiffsfelder darin liegen – dein Zug endet danach.</p>}
            {torpedoMode && <p className="ss-sub">Torpedo: Wähle eine Zeile.</p>}
            <ol className="ss-log">{msgs.map((m, i) => <li key={i} className={m.who === 0 ? 'me' : 'foe'}>{m.t}</li>)}</ol>
          </section>
        </aside>
      </div>
      {result && (
        <div className="ss-modal" role="dialog" aria-label="Gefechtsende">
          <h3>{mode === 'ki' ? (result.winner === 0 ? 'Sieg!' : 'Niederlage') : mode === 'jagd' ? 'Jagd beendet' : `Spieler ${result.winner + 1} gewinnt`}</h3>
          <p>{result.text}</p>
          <p className="ss-sub">{stats.current.shots} Schüsse · {stats.current.hits} Treffer{stats.current.accN ? ` · Zielgenauigkeit ${Math.round((stats.current.acc / stats.current.accN) * 100)} %` : ''}</p>
          <div className="ss-actions"><button className="primary" onClick={() => onExit()}>Zum Menü</button></div>
        </div>
      )}
    </div>
  );
}

const hasOpenHit = (s: Side) => { for (let i = 0; i < s.shots.length; i++) if (s.shots[i] === 2) { const sh = s.ships.find((x) => x.cells.includes(i)); if (sh && !isSunk(s, sh)) return true; } return false; };
