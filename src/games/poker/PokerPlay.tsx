import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import CardView from '../karten/CardView';
import { STYLES, botAction, styleOf } from './bots';
import { BLIND_LEVELS, LEVELS_P, type PSettings } from './data';
import { type Action, type Game, type Limit, type Player, type Table, act, bestHand, handName, legal, mkPlayer, newTable, pot, startHand } from './engine';
import { equity } from './equity';
import { useKeys, useTicker } from '../shared/hooks';
import { freshSeed, mulberry32, shuffled } from '../shared/rng';
import { sfx } from '../shared/sfx';

export interface PSetup { mode: 'cash' | 'turnier' | 'duell'; game: Game; limit: Limit; players: number; level: number; blinds: number; buyin: number }

export interface HandEnd {
  setup: PSetup;
  handNo: number;
  hole: number[];
  board: number[];
  net: number;
  heroWon: boolean;
  potWon: number;
  heroHand: string;
  heroCat: number;
  showdown: boolean;
  vpip: boolean;
  pfr: boolean;
  allIn: boolean;
  bluffWin: boolean;
  result: string;
  helped: boolean;
}

export interface SessionEnd { setup: PSetup; won: boolean; place: number; hands: number; net: number }

const BOT_NAMES: Record<string, string> = { fels: 'Fritz', hai: 'Hanna', karl: 'Karl', zocker: 'Zoe', rechner: 'Rudi', zitrone: 'Zita' };
const catOfName = (n: string) => ['Hohe Karte', 'Ein Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush', 'Royal Flush'].indexOf(n);

/** Platz auf dem ovalen Tisch (Prozent): Seat 0 = unten Mitte. */
export function seatPos(i: number, n: number): { left: number; top: number } {
  const a = ((90 + (i * 360) / n) * Math.PI) / 180;
  return { left: 50 + 43 * Math.cos(a), top: 49 + 37 * Math.sin(a) };
}

function Chips({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  const discs = Math.min(5, 1 + Math.floor(Math.log10(amount + 1)));
  return (
    <span className="pk-chips" aria-label={`Einsatz ${amount}`}>
      <span className="pk-stack">{Array.from({ length: discs }, (_, i) => <i key={i} style={{ bottom: i * 4 }} />)}</span>
      <b>{amount}</b>
    </span>
  );
}

export default function PokerPlay({ setup, S, secrets, onHandEnd, onSession, onExit }: {
  setup: PSetup; S: PSettings; secrets: { sonnenbrille: boolean; wahrsager: boolean; bluffer: boolean };
  onHandEnd: (h: HandEnd) => void; onSession: (s: SessionEnd) => void; onExit: () => void;
}) {
  const n = setup.mode === 'duell' ? 2 : setup.players;
  const rnd = useRef(mulberry32(freshSeed()));
  const [, force] = useReducer((x: number) => x + 1, 0);
  const tok = useRef(0);
  const [msg, setMsg] = useState('');
  const [raiseTo, setRaiseTo] = useState(0);
  const [eq, setEq] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [secs, setSecs] = useState(0);
  const [over, setOver] = useState<null | { won: boolean; place: number }>(null);
  const [winnersShown, setWinnersShown] = useState(false);
  const flags = useRef({ vpip: false, pfr: false, helped: false, allIn: false, startChips: 0, heroActed: false });
  const stats = useRef({ hands: 0, net: 0, startTotal: 0 });
  const sessionDone = useRef(false);
  const secretsRef = useRef(secrets);
  secretsRef.current = secrets;

  const table = useRef<Table>(null as unknown as Table);
  if (!table.current) {
    const styles = shuffled(rnd.current, STYLES).slice(0, n - 1);
    const players: Player[] = [mkPlayer('Du', setup.mode === 'turnier' ? 1500 : setup.buyin, false)];
    for (const st of styles) players.push(mkPlayer(BOT_NAMES[st.id], setup.mode === 'turnier' ? 1500 : setup.buyin, true, st.id));
    const [sb, bb] = setup.mode === 'turnier' ? [BLIND_LEVELS[0][0], BLIND_LEVELS[0][1]] : [Math.floor(setup.blinds / 2), setup.blinds];
    table.current = newTable(setup.game, setup.limit, players, sb, bb);
    table.current.dealer = n - 1;
    stats.current.startTotal = players[0].chips;
  }
  const t = table.current;
  const hero = t.players[0];
  const delay = S.speed === 'langsam' ? 1400 : S.speed === 'normal' ? 850 : 330;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  useTicker(!over, (dt) => setSecs((x) => x + dt / 1000), 1000);
  useEffect(() => { if (secrets.sonnenbrille || secrets.wahrsager || secrets.bluffer) flags.current.helped = true; }, [secrets]);

  // ───── Ablauf ─────
  const finishHand = useCallback(() => {
    const winners = t.winners;
    const heroGain = winners.filter((w) => w.seat === 0).reduce((a, w) => a + w.amount, 0);
    const contributed = hero.total;
    const net = heroGain - contributed;
    const showdown = winners.some((w) => w.hand !== '');
    const heroIn = !hero.folded && !hero.out && hero.hole.length > 0;
    let heroHand = '', heroCat = -1;
    if (heroIn && t.board.length === 5) { const h = bestHand(hero.hole, t.board, t.game); heroHand = handName(h); heroCat = catOfName(heroHand); }
    const potWon = heroGain;
    let bluffWin = false;
    if (!showdown && heroGain > 0 && t.board.length >= 3) {
      const e = equity(hero.hole, t.board, Math.max(1, t.players.filter((p, i) => i !== 0 && !p.out).length), t.game, rnd.current, 120).eq;
      bluffWin = e < 0.3;
    }
    const top = winners.slice().sort((a, b) => b.amount - a.amount)[0];
    const result = top ? (top.seat === 0 ? `Du gewinnst ${top.amount}${top.hand ? ` mit ${top.hand}` : ''}` : `${t.players[top.seat].name} gewinnt ${top.amount}${top.hand ? ` mit ${top.hand}` : ''}`) : '';
    stats.current.hands++;
    stats.current.net += net;
    onHandEnd({
      setup, handNo: t.handNo, hole: hero.hole, board: t.board, net, heroWon: heroGain > 0 && winners.some((w) => w.seat === 0), potWon, heroHand, heroCat, showdown: showdown && heroIn,
      vpip: flags.current.vpip, pfr: flags.current.pfr, allIn: flags.current.allIn, bluffWin, result, helped: flags.current.helped,
    });
    sfx(heroGain > 0 ? 'win' : 'bad');
    setMsg(result);
    setWinnersShown(true);
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessionOver = useCallback((won: boolean, place: number) => {
    if (sessionDone.current) return;
    sessionDone.current = true;
    setOver({ won, place });
    onSession({ setup, won, place, hands: stats.current.hands, net: hero.chips - stats.current.startTotal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loop = useCallback(async () => {
    const my = ++tok.current;
    while (my === tok.current) {
      if (t.phase === 'done') { finishHand(); return; }
      if (!t.players[t.toAct].bot) { force(); return; }
      force();
      await wait(delay + rnd.current() * delay * 0.5);
      if (my !== tok.current) return;
      const level2 = setup.level;
      const { action } = botAction(t, rnd.current, level2, secretsRef.current.bluffer ? 1 : 0);
      const seat = t.toAct;
      act(t, action);
      sfx(action.kind === 'raise' ? 'pop' : action.kind === 'fold' ? 'erase' : 'tick');
      if (t.players[seat].allIn && action.kind !== 'fold') sfx('boom');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, setup.level]);

  const nextHand = useCallback(() => {
    // Ausgeschiedene Spieler (Turnier) vermerken, im Cash-Spiel Bots nachkaufen lassen
    if (setup.mode === 'cash' || setup.mode === 'duell') {
      for (const p of t.players) if (p.bot && p.chips <= 0) { p.chips = setup.buyin; p.out = false; }
    }
    if (setup.mode === 'turnier') {
      const handsPerLevel = 8;
      const lv = Math.min(BLIND_LEVELS.length - 1, Math.floor(t.handNo / handsPerLevel));
      setLevel(lv);
      t.sb = BLIND_LEVELS[lv][0]; t.bb = BLIND_LEVELS[lv][1]; t.ante = BLIND_LEVELS[lv][2];
    }
    if (hero.chips <= 0 && setup.mode !== 'turnier') { setMsg('Du bist pleite – kaufe neu ein oder verlasse den Tisch.'); force(); return; }
    // Turnier: Platzierungen
    if (setup.mode !== 'cash') {
      const alive = t.players.filter((p) => p.chips > 0);
      if (hero.chips <= 0) { sessionOver(false, alive.length + 1); return; }
      if (alive.length === 1 && alive[0] === hero) { sessionOver(true, 1); return; }
    }
    setWinnersShown(false);
    flags.current = { ...flags.current, vpip: false, pfr: false, allIn: false, startChips: hero.chips, heroActed: false };
    if (!startHand(t, rnd.current)) { if (hero.chips > 0) sessionOver(true, 1); return; }
    sfx('card');
    setMsg('');
    force();
    void loop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop]);

  useEffect(() => { nextHand(); return () => { tok.current++; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Automatisch nächste Hand
  useEffect(() => {
    if (!winnersShown || over) return;
    if (setup.mode !== 'cash' && hero.chips <= 0) { const id = setTimeout(nextHand, 1800); return () => clearTimeout(id); }
    if (!S.autoNext || hero.chips <= 0) return;
    const id = setTimeout(nextHand, Math.max(2400, delay * 3));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnersShown, over]);

  // ───── Eingaben des Spielers ─────
  const heroTurn = t.phase !== 'done' && t.phase !== 'showdown' && t.toAct === 0 && !over;
  const lg = heroTurn ? legal(t, 0) : null;
  useEffect(() => { if (lg) setRaiseTo((r) => Math.min(lg.maxRaise, Math.max(lg.minRaise, r || lg.minRaise))); }, [lg?.minRaise, lg?.maxRaise, t.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const hOnce = useRef(0);
  const doAct = (a: Action) => {
    if (!heroTurn) return;
    if (t.phase === 'preflop' && (a.kind === 'call' && (lg?.call ?? 0) > 0 || a.kind === 'raise')) flags.current.vpip = true;
    if (t.phase === 'preflop' && a.kind === 'raise') flags.current.pfr = true;
    const before = hero.chips;
    const ok = act(t, a);
    if (!ok) { setMsg('Das ist gerade nicht möglich.'); return; }
    if (hero.allIn && before > 0) flags.current.allIn = true;
    sfx(a.kind === 'raise' ? 'pop' : a.kind === 'fold' ? 'erase' : 'tick');
    setMsg('');
    hOnce.current++;
    force();
    void loop();
  };

  // Gewinnchance für den Spieler (Hilfe)
  useEffect(() => {
    if (!heroTurn || !(S.showEquity || false)) { setEq(null); return; }
    flags.current.helped = true;
    const opp = t.players.filter((p, i) => i !== 0 && !p.out && !p.folded).length;
    setEq(equity(hero.hole, t.board, Math.max(1, opp), t.game, rnd.current, 500).eq);
  }, [heroTurn, t.phase, S.showEquity]); // eslint-disable-line react-hooks/exhaustive-deps

  const rebuy = () => { hero.chips = setup.buyin; hero.out = false; stats.current.startTotal += setup.buyin; setMsg(''); force(); nextHand(); };

  useKeys((e) => {
    if (!heroTurn || !lg) return;
    if (e.key === 'f' || e.key === 'F') doAct({ kind: 'fold' });
    else if (e.key === 'c' || e.key === 'C' || e.key === ' ') { e.preventDefault(); doAct(lg.check ? { kind: 'check' } : { kind: 'call' }); }
    else if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') { if (lg.canRaise) doAct({ kind: 'raise', to: raiseTo }); }
    else if (e.key === 'a' || e.key === 'A') { doAct(lg.canRaise ? { kind: 'raise', to: lg.maxRaise } : { kind: 'call' }); }
  }, [heroTurn, raiseTo, t.toAct, t.phase]);

  const showAll = (t.phase === 'done' && t.winners.some((w) => w.hand !== '')) || secrets.sonnenbrille;
  const potNow = pot(t);
  const toCall = lg?.call ?? 0;
  const need = toCall > 0 ? toCall / (potNow + toCall) : 0;
  const presets = lg && lg.canRaise ? [
    { label: 'Min', to: lg.minRaise },
    { label: '½ Pot', to: Math.min(lg.maxRaise, Math.max(lg.minRaise, t.currentBet + Math.round((potNow + toCall) * 0.5))) },
    { label: '¾ Pot', to: Math.min(lg.maxRaise, Math.max(lg.minRaise, t.currentBet + Math.round((potNow + toCall) * 0.75))) },
    { label: 'Pot', to: Math.min(lg.maxRaise, Math.max(lg.minRaise, t.currentBet + potNow + toCall)) },
    { label: 'All-in', to: lg.maxRaise },
  ] : [];
  const nextCard = secrets.wahrsager && t.board.length < 5 && t.deck.length ? t.deck[t.deck.length - 1] : null;
  const blindTxt = `${t.sb}/${t.bb}${t.ante ? ` (Ante ${t.ante})` : ''}`;
  const nextHandsIn = setup.mode === 'turnier' ? 8 - (t.handNo % 8) : 0;
  const lvName = LEVELS_P.find((l) => l.id === setup.level)?.name;
  const cw = 64;
  const allUp = (p: Player, i: number) => (i === 0 ? !p.out : showAll && !p.folded && !p.out);

  const board = useMemo(() => t.board.slice(), [t.board.length, t.handNo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pk-play">
      <div className="pk-stage">
        <div className="pk-felt">
          <div className="pk-rail" />
          <div className="pk-center">
            <div className="pk-pot">Pot <b>{potNow}</b></div>
            <div className="pk-board">
              {[0, 1, 2, 3, 4].map((i) => (
                board[i] !== undefined
                  ? <span key={`${t.handNo}-${i}`} className="pk-bc deal" style={{ animationDelay: `${(i < 3 ? i : 0) * 90}ms` }}><CardView id={board[i]} up w={cw} fourColor={S.fourColor} large={false} back={S.back} english /></span>
                  : <span key={`e${i}`} className={`pk-slot${nextCard !== null && i === board.length ? ' next' : ''}`}>{nextCard !== null && i === board.length ? <CardView id={nextCard} up w={cw} fourColor={S.fourColor} large={false} back={S.back} english dim /> : null}</span>
              ))}
            </div>
            <div className="pk-phase">{t.phase === 'preflop' ? 'Preflop' : t.phase === 'flop' ? 'Flop' : t.phase === 'turn' ? 'Turn' : t.phase === 'river' ? 'River' : t.phase === 'showdown' ? 'Showdown' : t.winners.length ? 'Hand beendet' : ''}</div>
            {t.phase === 'done' && msg && <div className={`pk-result ${t.winners.some((w) => w.seat === 0) ? 'win' : ''}`}>{msg}</div>}
          </div>

          {t.players.map((p, i) => {
            const pos = seatPos(i, t.players.length);
            const cpos = { left: pos.left + (50 - pos.left) * 0.34, top: pos.top + (46 - pos.top) * 0.34 };
            const winner = t.phase === 'done' && t.winners.some((w) => w.seat === i);
            const cs = i === 0 ? 72 : 44;
            return (
              <div key={i}>
                <div className={`pk-seat ${p.folded ? 'folded' : ''} ${p.out ? 'out' : ''} ${t.toAct === i && t.phase !== 'done' && t.phase !== 'showdown' ? 'turn' : ''} ${winner ? 'winner' : ''} ${i === 0 ? 'hero' : ''}`} style={{ left: `${pos.left}%`, top: `${pos.top}%` }}>
                  <div className="pk-cards">
                    {p.hole.map((c, k) => (
                      <span key={`${t.handNo}-${k}`} className="pk-hc deal" style={{ animationDelay: `${(k * t.players.length + i) * 60}ms`, transform: `rotate(${(k - (p.hole.length - 1) / 2) * 6}deg)` }}>
                        <CardView id={c} up={allUp(p, i)} w={cs} fourColor={S.fourColor} large={i === 0} back={S.back} english dim={p.folded} />
                      </span>
                    ))}
                  </div>
                  <div className="pk-plate">
                    <b>{p.name}</b>
                    <span>{p.out ? 'ausgeschieden' : `${p.chips}`}</span>
                    {i !== 0 && p.style && <small title={styleOf(p.style).info}>{styleOf(p.style).name}</small>}
                  </div>
                  {p.last && !p.out && <span className={`pk-bubble ${p.last.startsWith('Fold') ? 'fold' : ''}`}>{p.last}</span>}
                  {t.dealer === i && <span className="pk-dealer" title="Dealer">D</span>}
                </div>
                {p.bet > 0 && <div className="pk-bet" style={{ left: `${cpos.left}%`, top: `${cpos.top}%` }}><Chips amount={p.bet} /></div>}
              </div>
            );
          })}
        </div>

        <aside className="pk-panel">
          <div className="pk-info">
            <span>{setup.mode === 'cash' ? 'Cash-Spiel' : setup.mode === 'turnier' ? `Turnier · Level ${level + 1}` : 'Heads-up Duell'}</span>
            <span>Blinds {blindTxt}</span>
            <span>Hand {t.handNo}</span>
          </div>
          {setup.mode === 'turnier' && <p className="pk-sub">Blinds steigen in {nextHandsIn} Hand{nextHandsIn === 1 ? '' : 'en'}. Noch dabei: {t.players.filter((p) => p.chips > 0).length} von {t.players.length}.</p>}
          <div className="pk-info"><span>Gegner: {lvName}</span><span>{Math.floor(secs / 60)}:{String(Math.floor(secs % 60)).padStart(2, '0')}</span><span>Bilanz {hero.chips - stats.current.startTotal >= 0 ? '+' : ''}{hero.chips - stats.current.startTotal}</span></div>
          {heroTurn && lg && (
            <div className="pk-controls">
              {(S.showOdds && toCall > 0) && <p className="pk-odds">Zum Mitgehen: <b>{toCall}</b> für einen Pot von <b>{potNow + toCall}</b> – du brauchst mindestens <b>{Math.round(need * 100)} %</b> Gewinnchance{eq !== null ? <> · deine Chance: <b className={eq >= need ? 'ok' : 'bad'}>{Math.round(eq * 100)} %</b></> : ''}.</p>}
              {(S.showOdds && toCall === 0 && eq !== null) && <p className="pk-odds">Deine Chance gegen zufällige Hände: <b>{Math.round(eq * 100)} %</b></p>}
              <div className="pk-btns">
                <button className="fold" onClick={() => doAct({ kind: 'fold' })}>Fold <kbd>F</kbd></button>
                {lg.check ? <button className="call" onClick={() => doAct({ kind: 'check' })}>Check <kbd>C</kbd></button> : <button className="call" onClick={() => doAct({ kind: 'call' })}>{lg.call >= hero.chips ? `All-in ${hero.chips}` : `Call ${lg.call}`} <kbd>C</kbd></button>}
                {lg.canRaise && <button className="raise" onClick={() => doAct({ kind: 'raise', to: raiseTo })}>{t.currentBet > 0 ? 'Raise' : 'Bet'} {raiseTo >= lg.maxRaise ? '(All-in)' : `auf ${raiseTo}`} <kbd>R</kbd></button>}
              </div>
              {lg.canRaise && (
                <div className="pk-raise">
                  <input type="range" min={lg.minRaise} max={lg.maxRaise} step={Math.max(1, Math.floor(t.bb / 2))} value={Math.min(raiseTo, lg.maxRaise)} onChange={(e) => setRaiseTo(+e.target.value)} aria-label="Einsatzhöhe" />
                  <div className="pk-presets">{presets.map((p) => <button key={p.label} onClick={() => setRaiseTo(p.to)}>{p.label}</button>)}</div>
                </div>
              )}
            </div>
          )}
          {!heroTurn && t.phase !== 'done' && <p className="pk-wait">{t.players[t.toAct]?.name} überlegt …</p>}
          {msg && t.phase !== 'done' && <p className="pk-msg">{msg}</p>}
          {winnersShown && !over && hero.chips > 0 && <div className="pk-btns"><button className="call" onClick={nextHand}>Nächste Hand</button></div>}
          {hero.chips <= 0 && setup.mode !== 'turnier' && !over && <div className="pk-btns"><button className="call" onClick={rebuy}>Neu einkaufen ({setup.buyin})</button></div>}
          <ol className="pk-log">{t.log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}</ol>
          <div className="pk-btns"><button onClick={() => { tok.current++; if (setup.mode === 'cash') onSession({ setup, won: false, place: 0, hands: stats.current.hands, net: hero.chips - stats.current.startTotal }); onExit(); }}>Tisch verlassen</button></div>
        </aside>
      </div>
      {over && (
        <div className="pk-modal" role="dialog" aria-label="Spielende">
          <h3>{over.won ? 'Gewonnen!' : `Platz ${over.place}`}</h3>
          <p>{over.won ? 'Du hast alle Gegner ausgespielt.' : `Du bist als ${over.place}. von ${t.players.length} ausgeschieden.`}</p>
          <p className="pk-sub">{stats.current.hands} Hände gespielt</p>
          <div className="pk-btns"><button className="call" onClick={onExit}>Zum Menü</button></div>
        </div>
      )}
    </div>
  );
}
