import { useEffect, useMemo, useRef, useState } from 'react';
import { Die, Sheet } from './parts';
import { askAnalyze, askChances, askDecide, cancelAi } from './aiClient';
import {
  CATS, LEVELS, VARIANTS, cellScore, emptyCard, evOfHold, fill, gameOver, heldValues, isKniffel, legalCats, maskFor, rollDice, totals,
  type Analysis, type Card, type CatId, type Chance,
} from './engine';
import { useKeys } from '../shared/hooks';
import { hashString, mulberry32 } from '../shared/rng';
import { sfx } from '../shared/sfx';
import { fmtTime } from '../shared/store';

export interface PlayerSetup { name: string; ai: number }
export interface PlaySetup {
  variant: 'classic' | 'maxi';
  players: PlayerSetup[];
  seed: number;
  daily: boolean;
  coach: boolean;
  odds: boolean;
  fast: boolean;
  secrets: { knobeln: boolean; schummeln: boolean; pasch: boolean };
}

export interface FinishInfo {
  setup: PlaySetup;
  cards: Card[];
  totals: number[];
  /** Index des besten Spielers (bei Gleichstand der erste) */
  winners: number[];
  humans: number[];
  stats: { kniffels: number; ls: number; bonus: boolean; yzBonus: number };
  coach: { n: number; loss: number; perfect: number };
  helped: boolean;
  usedSecret: boolean;
  seconds: number;
}

interface LogRow { p: number; turn: number; rolls: number[][]; cat: CatId; pts: number }

/** Würfelwurf Nummer `k` im Zug `turn`: unabhängig von den gehaltenen Würfeln, also für alle Spieler gleich (Tageswurf). */
export const rollAt = (seed: number, turn: number, k: number, n: number) => rollDice(mulberry32(hashString(`${seed}|${turn}|${k}`)), n);

export default function KniffelPlay({ setup, onFinish, onExit }: { setup: PlaySetup; onFinish: (i: FinishInfo) => void; onExit: () => void }) {
  const v = VARIANTS.find((x) => x.id === setup.variant) ?? VARIANTS[0];
  const np = setup.players.length;
  const maxRolls = setup.secrets.schummeln ? 4 : 3;
  const [cards, setCards] = useState<Card[]>(() => setup.players.map(() => emptyCard()));
  const [cur, setCur] = useState(0);
  const [turn, setTurn] = useState(0);
  const [dice, setDice] = useState<number[]>(() => new Array(v.dice).fill(1));
  const [held, setHeld] = useState<boolean[]>(() => new Array(v.dice).fill(false));
  const [rolls, setRolls] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState<number[]>(() => new Array(v.dice).fill(1));
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [chances, setChances] = useState<Chance[] | null>(null);
  const [hintHold, setHintHold] = useState<boolean[] | null>(null);
  const [bestCat, setBestCat] = useState<CatId | null>(null);
  const [flashCat, setFlashCat] = useState<CatId | null>(null);
  const [msg, setMsg] = useState('');
  const [fb, setFb] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [done, setDone] = useState<FinishInfo | null>(null);
  const [secs, setSecs] = useState(0);
  const [showOdds, setShowOdds] = useState(setup.odds || setup.secrets.knobeln);
  const rollsLog = useRef<number[][]>([]);
  const stats = useRef({ kniffels: 0, ls: 0, yz: 0, helped: false, coach: { n: 0, loss: 0, perfect: 0 } });
  const timers = useRef<number[]>([]);
  const token = useRef(0);
  const finished = useRef(false);

  const player = setup.players[cur];
  const isAi = player.ai > 0;
  const humans = setup.players.map((p, i) => (p.ai === 0 ? i : -1)).filter((i) => i >= 0);
  const card = cards[cur];
  const myTurn = !done && !isAi && !rolling;
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms * (setup.fast ? 0.4 : 1))); };
  useEffect(() => () => { clearTimers(); cancelAi(); }, []);
  useEffect(() => { if (done) return; const id = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(id); }, [done]);

  const doRoll = (heldNow: boolean[]) => {
    if (rolling || rolls >= maxRolls) return;
    const fresh = rollAt(setup.seed, turn, rolls, v.dice);
    if (setup.secrets.pasch && turn === 0 && rolls === 0) fresh.fill(6);
    const final = dice.map((x, i) => (rolls === 0 || !heldNow[i] ? fresh[i] : x));
    setRolling(true); setHintHold(null); setBestCat(null); setMsg(''); setAnalysis(null); setChances(null);
    sfx('drop');
    const rnd = Math.random;
    const iv = window.setInterval(() => setShown((s) => s.map((x, i) => (rolls === 0 || !heldNow[i] ? 1 + Math.floor(rnd() * 6) : x))), 70);
    timers.current.push(iv);
    later(() => {
      clearInterval(iv);
      rollsLog.current = [...rollsLog.current, final];
      setDice(final); setShown(final); setRolling(false); setRolls(rolls + 1);
      sfx(isKniffel(final) ? 'win' : 'tick');
    }, 650);
  };

  const pick = (cat: CatId) => {
    if (rolling || rolls < 1) return;
    const legal = legalCats(v, card, dice);
    if (!legal.includes(cat)) { setMsg('Dieses Feld ist nicht erlaubt (Joker-Regel).'); sfx('bad'); return; }
    // Coach
    if (!isAi && setup.coach && analysis) {
      const val = analysis.cats.find((c) => c.cat === cat)?.value ?? 0;
      const best = Math.max(analysis.cats[0]?.value ?? -Infinity, maxRolls - rolls > 0 && analysis.holds[0] ? analysis.holds[0].ev : -Infinity);
      const loss = Math.max(0, best - val);
      const c = stats.current.coach; c.n++; c.loss += loss; if (loss < 0.5) c.perfect++;
      setFb({ ok: loss < 1.5, text: loss < 0.5 ? 'Beste Wahl.' : `Du verschenkst etwa ${loss.toFixed(1)} Punkte${analysis.cats[0] && analysis.cats[0].cat !== cat ? ` – besser: ${CATS[analysis.cats[0].cat].name}` : ' – besser weiterwürfeln'}.` });
    }
    const pts = cellScore(v, card, cat, dice);
    if (isKniffel(dice) && pts > 0 && !isAi) stats.current.kniffels++;
    if (cat === 'ls' && pts > 0 && !isAi) stats.current.ls++;
    if (v.yzBonus > 0 && isKniffel(dice) && card.s.kniffel === 50 && !isAi) stats.current.yz++;
    const next = cards.map((c, i) => (i === cur ? fill(v, c, cat, dice) : c));
    setCards(next);
    setLog((l) => [...l, { p: cur, turn: Math.floor(turn / np) + 1, rolls: rollsLog.current, cat, pts }]);
    rollsLog.current = [];
    sfx(pts === 0 ? 'bad' : 'good');
    setFlashCat(null); setHintHold(null); setBestCat(null); setAnalysis(null); setChances(null); setRolls(0);
    setHeld(new Array(v.dice).fill(false));
    if (next.every((c) => gameOver(v, c))) { finish(next); return; }
    setCur((cur + 1) % np);
    setTurn(turn + 1);
  };

  const finish = (cs: Card[]) => {
    if (finished.current) return;
    finished.current = true;
    const t = cs.map((c) => totals(v, c).total);
    const top = Math.max(...t);
    const info: FinishInfo = {
      setup, cards: cs, totals: t, winners: t.map((x, i) => (x === top ? i : -1)).filter((i) => i >= 0), humans, stats: { kniffels: stats.current.kniffels, ls: stats.current.ls, bonus: humans.some((h) => totals(v, cs[h]).bonus > 0), yzBonus: stats.current.yz },
      coach: stats.current.coach, helped: stats.current.helped, usedSecret: setup.secrets.knobeln || setup.secrets.schummeln || setup.secrets.pasch, seconds: secs,
    };
    setDone(info);
    const won = humans.length === 0 ? false : info.winners.some((w) => humans.includes(w));
    sfx(won ? 'win' : 'lose');
    onFinish(info);
  };

  // Analyse nach dem Wurf (Coach, Tipp, Chancen)
  useEffect(() => {
    if (isAi || rolling || rolls < 1 || done) return;
    let live = true;
    const left = maxRolls - rolls;
    askAnalyze(v.id, card, dice, left).then((a) => { if (live) setAnalysis(a); });
    if (showOdds) askChances(v.id, card, dice, left).then((c) => { if (live) setChances(c); });
    return () => { live = false; };
  }, [rolls, rolling, cur, turn, showOdds]); // eslint-disable-line react-hooks/exhaustive-deps

  // KI-Zug
  useEffect(() => {
    if (!isAi || rolling || done) return;
    const my = ++token.current;
    if (rolls === 0) { later(() => { if (my === token.current) doRoll(held); }, 600); return; }
    const left = maxRolls - rolls;
    askDecide(v.id, card, dice, left, player.ai, (setup.seed + turn * 131 + rolls) >>> 0).then((d) => {
      if (my !== token.current) return;
      if (d.cat) { setFlashCat(d.cat); later(() => { if (my === token.current) pick(d.cat!); }, 800); }
      else { const h = d.hold!; setHeld(h); later(() => { if (my === token.current) doRoll(h); }, 900); }
    });
  }, [rolls, rolling, cur, turn]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i: number) => {
    if (!myTurn || rolls < 1 || rolls >= maxRolls) return;
    setHeld((h) => h.map((x, k) => (k === i ? !x : x)));
    setHintHold(null);
  };
  const rollNow = () => {
    if (!myTurn || rolls >= maxRolls) return;
    if (rolls >= 1 && setup.coach && analysis) {
      const hold = heldValues(dice, held);
      const ev = evOfHold(analysis, hold);
      const best = Math.max(analysis.holds[0]?.ev ?? -Infinity, analysis.cats[0]?.value ?? -Infinity);
      const loss = Math.max(0, best - ev);
      const c = stats.current.coach; c.n++; c.loss += loss; if (loss < 0.5) c.perfect++;
      const bh = analysis.holds[0];
      setFb({ ok: loss < 1.5, text: loss < 0.5 ? 'Gut gehalten.' : analysis.cats[0] && analysis.cats[0].value > (analysis.holds[0]?.ev ?? -Infinity) ? `Besser: ${CATS[analysis.cats[0].cat].name} eintragen (≈ ${loss.toFixed(1)} Punkte mehr).` : `≈ ${loss.toFixed(1)} Punkte verschenkt – besser halten: ${bh && bh.hold.length ? bh.hold.join(' ') : 'nichts'}.` });
    } else setFb(null);
    doRoll(held);
  };
  const hint = () => {
    if (!myTurn || !analysis) return;
    stats.current.helped = true;
    const top = analysis.cats[0], bh = analysis.holds[0];
    if (!bh || (top && top.value >= bh.ev)) { setBestCat(top?.cat ?? null); setHintHold(null); setMsg(top ? `Tipp: ${CATS[top.cat].name} eintragen (${top.score} Punkte).` : ''); }
    else { setHintHold(maskFor(dice, bh.hold)); setBestCat(null); setMsg(`Tipp: ${bh.hold.length ? bh.hold.join(', ') + ' halten' : 'alle neu würfeln'}.`); }
  };

  useKeys((e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rollNow(); }
    else if (/^[1-6]$/.test(e.key) && +e.key <= v.dice) toggle(+e.key - 1);
    else if (e.key === 'h' || e.key === 'H') hint();
  }, [rolls, held, myTurn, analysis, dice]);

  const names = setup.players.map((p) => p.name);
  const scoreNow = cards.map((c) => totals(v, c).total);
  const roundNo = Math.min(v.cats.length, Math.floor(turn / np) + 1);
  const winner = done ? done.winners.map((i) => names[i]).join(' & ') : '';
  const humanWon = done ? done.winners.some((w) => humans.includes(w)) : false;
  const sorted = useMemo(() => (done ? done.totals.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t) : []), [done]);

  return (
    <div className="kn-play">
      <section className="kn-table">
        <div className="kn-players">
          {names.map((n, i) => <div key={i} className={`kn-pl${i === cur && !done ? ' on' : ''}`}><b>{n}</b><span>{setup.players[i].ai ? LEVELS[setup.players[i].ai - 1].name : 'Mensch'}</span><em>{scoreNow[i]}</em></div>)}
        </div>
        <div className="kn-status">
          <b>{done ? (humans.length ? (humanWon ? (done.winners.length > 1 ? 'Unentschieden – gewonnen!' : 'Gewonnen!') : 'Verloren') : `${winner} gewinnt`) : isAi ? `${player.name} würfelt …` : `${player.name}: ${rolls === 0 ? 'Würfle!' : rolls >= maxRolls ? 'Trage ein Feld ein.' : 'Halte Würfel oder trage ein.'}`}</b>
          <span>{setup.daily ? 'Tageswurf · ' : ''}{v.name} · Runde {roundNo} von {v.cats.length} · {fmtTime(secs)}</span>
        </div>
        <div className="kn-tray" aria-label="Würfel">
          {dice.map((d, i) => <Die key={i} index={i} value={rolling && (rolls === 0 || !held[i]) ? shown[i] : d} held={held[i] && rolls > 0} rolling={rolling && (rolls === 0 || !held[i])} onClick={() => toggle(i)} disabled={!myTurn || rolls < 1 || rolls >= maxRolls} hint={!!hintHold?.[i]} />)}
        </div>
        <div className="kn-controls">
          <button className="kn-cup" onClick={rollNow} disabled={!myTurn || rolls >= maxRolls}>{rolls === 0 ? 'Würfeln' : rolls >= maxRolls ? 'Keine Würfe mehr' : `Nochmal würfeln`}<small>{maxRolls - rolls} von {maxRolls} Würfen übrig</small></button>
          <div className="kn-small">
            <button onClick={hint} disabled={!myTurn || !analysis}>Tipp</button>
            <button className={showOdds ? 'on' : ''} onClick={() => setShowOdds((x) => !x)}>Chancen</button>
            {!done && <button className="danger" onClick={() => { if (confirm('Spiel abbrechen?')) onExit(); }}>Abbrechen</button>}
          </div>
        </div>
        {msg && <p className="kn-msg">{msg}</p>}
        {fb && <p className={'kn-fb ' + (fb.ok ? 'ok' : 'no')}>{fb.text}</p>}
        {showOdds && !isAi && rolls > 0 && chances && (
          <div className="kn-odds" aria-label="Chancen">
            <h4>Chancen bei {maxRolls - rolls} {maxRolls - rolls === 1 ? 'Wurf' : 'Würfen'}</h4>
            <ul>{chances.sort((a, b) => (b.kind === 'p' ? b.value * 100 : 0) - (a.kind === 'p' ? a.value * 100 : 0)).map((c) => (
              <li key={c.cat}><span>{CATS[c.cat].name}</span><i style={{ width: `${c.kind === 'p' ? c.value * 100 : Math.min(100, c.value * 3.3)}%` }} /><b>{c.kind === 'p' ? `${Math.round(c.value * 100)} %` : `Ø ${c.value.toFixed(1)}`}</b></li>))}</ul>
          </div>
        )}
        {done && (
          <div className="kn-end">
            <h3>Endstand</h3>
            <ol>{sorted.map((x, k) => <li key={x.i} className={k === 0 ? 'first' : ''}><b>{names[x.i]}</b><span>{x.t} Punkte</span></li>)}</ol>
            {setup.coach && done.coach.n > 0 && <p>Coach: im Schnitt {(done.coach.loss / done.coach.n).toFixed(1)} Punkte pro Entscheidung verschenkt, {done.coach.perfect} von {done.coach.n} Entscheidungen perfekt.</p>}
            <div className="kn-small"><button className="primary" onClick={onExit}>Menü</button></div>
          </div>
        )}
      </section>
      <section className="kn-paper">
        <Sheet v={v} cards={cards} names={names} active={cur} dice={rolls > 0 && !rolling ? dice : null} clickable={myTurn && rolls > 0} onPick={pick} bestCat={bestCat} flashCat={flashCat} />
        <details className="kn-log"><summary>Verlauf ({log.length} Züge)</summary>
          <ol>{log.map((r, i) => <li key={i}><b>{names[r.p]}</b> · Runde {r.turn}: {r.rolls[r.rolls.length - 1]?.join(' ')} → {CATS[r.cat].name} <em>{r.pts}</em></li>)}</ol>
        </details>
      </section>
    </div>
  );
}
