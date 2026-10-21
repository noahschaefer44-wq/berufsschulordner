import { useMemo, useState } from 'react';
import '@fontsource/bebas-neue';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '../karten/karten.css';
import { BACKS_P, GAMES_P, LEVELS_P, POKER_INIT, THEMES_P, type PData, type PSettings, type PStat } from './data';
import { type Game } from './engine';
import PokerPlay, { type HandEnd, type PSetup, type SessionEnd } from './PokerPlay';
import { DailyView, HistoryView, LessonsView, LESSONS_P, QUIZZES, TrainerView, type QuizKind } from './PokerLearn';
import { usePlaytime, useSecrets } from '../shared/hooks';
import { newId } from '../shared/ids';
import { dailySeed } from '../shared/rng';
import { achieve, dailyDone, markDaily, toast, useGameData } from '../shared/store';
import './poker.css';

type View = 'menu' | 'play' | 'learn' | 'trainer' | 'quiz' | 'daily' | 'history' | 'stats' | 'options';

const seg = <T extends string | number | boolean>(value: T, set: (v: T) => void, opts: { v: T; label: string; title?: string }[]) => (
  <div className="pk-seg" role="group">{opts.map((o) => <button key={String(o.v)} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => set(o.v)}>{o.label}</button>)}</div>
);

const quizField = (k: QuizKind) => k as keyof PData['quiz'];

export default function PokerRoot({ onExit, daily }: { onExit: () => void; daily?: boolean }) {
  usePlaytime('poker');
  const [data, upd] = useGameData<PData>('poker', POKER_INIT);
  const S: PSettings = { ...POKER_INIT.settings, ...data.settings };
  const setS = (p: Partial<PSettings>) => upd((d) => { d.settings = { ...POKER_INIT.settings, ...d.settings, ...p }; });

  const [view, setView] = useState<View>(daily ? 'daily' : 'menu');
  const [setup, setSetup] = useState<PSetup | null>(null);
  const [round, setRound] = useState(0);
  const [kind, setKind] = useState<QuizKind>('rank');
  const [sec, setSec] = useState({ sonnenbrille: false, wahrsager: false, bluffer: false });
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useSecrets('poker', {
    'poker-sonnenbrille': () => setSec((x) => ({ ...x, sonnenbrille: true })),
    'poker-wahrsager': () => setSec((x) => ({ ...x, wahrsager: true })),
    'poker-bluffer': () => setSec((x) => ({ ...x, bluffer: true })),
  });

  const start = () => {
    const next: PSetup = { mode: S.mode, game: S.game, limit: S.limit, players: S.mode === 'duell' ? 2 : S.players, level: S.level, blinds: S.blinds, buyin: S.buyin };
    setSetup(next); setRound((r) => r + 1); setView('play');
  };

  const onHandEnd = (h: HandEnd) => {
    const s = h.setup;
    const key = `${s.mode}-${s.game}`;
    const hand: PData['history'][number] = { id: newId(), no: h.handNo, hole: h.hole, board: h.board, result: h.result, net: h.net, hand: h.heroHand, game: s.game, mode: s.mode === 'cash' ? 'Cash' : s.mode === 'turnier' ? 'Turnier' : 'Duell' };
    upd((d) => {
      const st: PStat = d.stats[key] ?? { hands: 0, won: 0, net: 0, best: 0 };
      st.hands++; if (h.heroWon) st.won++; st.net += h.net; st.best = Math.max(st.best, h.potWon);
      d.stats = { ...d.stats, [key]: st };
      d.totals = {
        hands: d.totals.hands + 1, won: d.totals.won + (h.heroWon ? 1 : 0), vpip: d.totals.vpip + (h.vpip ? 1 : 0), pfr: d.totals.pfr + (h.pfr ? 1 : 0),
        showdowns: d.totals.showdowns + (h.showdown ? 1 : 0), showdownWins: d.totals.showdownWins + (h.showdown && h.heroWon ? 1 : 0), bigPot: Math.max(d.totals.bigPot, h.potWon), net: d.totals.net + h.net,
        allInWins: d.totals.allInWins + (h.allIn && h.showdown && h.heroWon ? 1 : 0),
      };
      d.bestHand = Math.max(d.bestHand, h.heroCat + 1);
      d.history = [hand, ...d.history].slice(0, 40);
    });
    achieve('poker', 'first');
    if (data.totals.hands + 1 >= 100) achieve('poker', 'hundred');
    if (h.heroWon && !h.helped) {
      achieve('poker', 'win');
      if (h.showdown) achieve('poker', 'showdown');
      if (h.bluffWin) achieve('poker', 'bluff');
      if (h.allIn && h.showdown) achieve('poker', 'allin');
      if (h.heroCat === 5) achieve('poker', 'flush');
      if (h.heroCat >= 6) achieve('poker', 'full');
      if (h.heroCat >= 7) achieve('poker', 'quads');
      if (h.potWon >= 2000) achieve('poker', 'bigpot');
      if (s.game === 'omaha') achieve('poker', 'omaha');
      if (s.game === 'short') achieve('poker', 'short');
    }
    if (h.heroCat === 9) achieve('poker', 'royal');
  };

  const onSession = (e: SessionEnd) => {
    if (e.setup.mode === 'turnier') {
      upd((d) => { d.tournaments = { played: d.tournaments.played + 1, won: d.tournaments.won + (e.won ? 1 : 0), best: d.tournaments.best ? Math.min(d.tournaments.best, e.place) : e.place }; });
      if (e.won) { achieve('poker', 'tourney'); if (e.setup.level >= 5) achieve('poker', 'lv5'); }
    }
    if (e.setup.mode === 'duell' && e.won) achieve('poker', 'duell');
  };

  const onQuiz = (k: QuizKind, ok: boolean) => {
    const f = quizField(k);
    upd((d) => {
      const q = { ...d.quiz };
      const bestKey = `${f}Best` as keyof PData['quiz'];
      q[f] = ok ? q[f] + 1 : 0;
      q[bestKey] = Math.max(q[bestKey], q[f]);
      d.quiz = q;
    });
    const total = Object.entries(data.quiz).filter(([k2]) => !k2.endsWith('Best')).reduce((a, [, v]) => a + v, 0);
    void total;
    if (ok) {
      const rights = (data.quiz.rankBest + data.quiz.winnerBest + data.quiz.oddsBest + data.quiz.equityBest + data.quiz.outsBest + data.quiz.decisionBest);
      if (rights + 1 >= 10) achieve('poker', 'quiz');
      if (rights + 1 >= 30) achieve('poker', 'quiz30');
    }
  };

  const back = () => setView('menu');
  const themeCls = `pk pk-th-${S.theme}`;

  if (view === 'play' && setup) {
    return (
      <div className={themeCls}>
        <header className="pk-top"><button onClick={() => setView('menu')}>← Menü</button><h1>Poker</h1><span className="pk-top-sub">{GAMES_P.find((g) => g.id === setup.game)?.name} · {setup.limit === 'pot' ? 'Pot-Limit' : 'No-Limit'}</span></header>
        <PokerPlay key={round} setup={setup} S={S} secrets={sec} onHandEnd={onHandEnd} onSession={onSession} onExit={() => setView('menu')} />
      </div>
    );
  }

  let body: React.ReactNode;
  if (view === 'learn') {
    body = <LessonsView S={S} done={data.lessons} onBack={back} onDone={(id) => { upd((d) => { d.lessons = { ...d.lessons, [id]: true }; }); if (Object.keys(data.lessons).length + 1 >= LESSONS_P.length) achieve('poker', 'lessons'); }} />;
  } else if (view === 'trainer') {
    body = (
      <div className="pk-sub-view">
        <header className="pk-subhead"><button onClick={back}>← Menü</button><h2>Trainer</h2></header>
        <div className="pk-cards">{QUIZZES.map((q) => <button key={q.id} className="pk-card" onClick={() => { setKind(q.id); setView('quiz'); }}><b>{q.name}</b><span>{q.info}</span><small>Serie {data.quiz[quizField(q.id)]} · Rekord {data.quiz[`${q.id}Best` as keyof PData['quiz']]}</small></button>)}</div>
      </div>
    );
  } else if (view === 'quiz') {
    body = <TrainerView key={kind} S={S} kind={kind} stats={{ right: data.quiz[quizField(kind)], best: data.quiz[`${kind}Best` as keyof PData['quiz']] }} onBack={() => setView('trainer')} onResult={(ok) => onQuiz(kind, ok)} />;
  } else if (view === 'daily') {
    body = <DailyView S={S} seed={dailySeed('poker', 'tag') % 100000} done={dailyDone('poker', '')} onBack={back} onSolved={() => { if (!dailyDone('poker', '')) { markDaily('poker', ''); achieve('poker', 'daily'); toast('Hand des Tages gelöst'); } }} />;
  } else if (view === 'history') {
    body = <HistoryView S={S} hands={data.history} onBack={back} />;
  } else if (view === 'stats') {
    const t = data.totals;
    const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '–');
    body = (
      <div className="pk-sub-view">
        <header className="pk-subhead"><button onClick={back}>← Menü</button><h2>Statistik</h2></header>
        <div className="pk-statgrid">
          <div><b>{t.hands}</b><span>Hände</span></div><div><b>{pct(t.won, t.hands)}</b><span>Hände gewonnen</span></div><div><b>{pct(t.vpip, t.hands)}</b><span>VPIP (freiwillig im Pot)</span></div>
          <div><b>{pct(t.pfr, t.hands)}</b><span>PFR (vor dem Flop erhöht)</span></div><div><b>{pct(t.showdownWins, t.showdowns)}</b><span>Showdown-Siege</span></div><div><b>{t.bigPot}</b><span>Größter Pot</span></div>
          <div><b>{t.net >= 0 ? '+' : ''}{t.net}</b><span>Gesamtbilanz (Chips)</span></div><div><b>{data.tournaments.won}/{data.tournaments.played}</b><span>Turniere gewonnen</span></div><div><b>{data.bestHand ? ['', 'Hohe Karte', 'Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush', 'Royal Flush'][data.bestHand] : '–'}</b><span>Beste Hand</span></div>
        </div>
        <table className="pk-table"><thead><tr><th>Spielart</th><th>Hände</th><th>Gewonnen</th><th>Bilanz</th><th>Größter Pot</th></tr></thead>
          <tbody>{Object.entries(data.stats).length ? Object.entries(data.stats).map(([k, s]) => { const [m, g] = k.split('-'); return <tr key={k}><td>{m === 'cash' ? 'Cash' : m === 'turnier' ? 'Turnier' : 'Duell'} · {GAMES_P.find((x) => x.id === g)?.name}</td><td>{s.hands}</td><td>{s.won}</td><td>{s.net >= 0 ? '+' : ''}{s.net}</td><td>{s.best}</td></tr>; }) : <tr><td colSpan={5}>Noch keine Hände.</td></tr>}</tbody></table>
      </div>
    );
  } else if (view === 'options') {
    body = <Options S={S} setS={setS} onBack={back} onReset={() => { upd((d) => { Object.assign(d, { ...POKER_INIT, settings: d.settings }); }); toast('Poker-Daten zurückgesetzt'); }} />;
  } else {
    const lv = LEVELS_P.find((l) => l.id === S.level) ?? LEVELS_P[2];
    const g = GAMES_P.find((x) => x.id === S.game)!;
    body = (
      <div className="pk-menu">
        <section className="pk-new">
          <div className="pk-hero" aria-hidden>
            <span className="pk-hc1" /><span className="pk-hc2" />
            <div className="pk-heroText"><b>ALL IN</b><small>{g.name}</small></div>
          </div>
          <div className="pk-setup">
            <h2>Neuer Tisch</h2>
            <label><span>Modus</span>{seg(S.mode, (v) => setS({ mode: v }), [{ v: 'cash', label: 'Cash-Spiel', title: 'Frei spielen, Nachkaufen erlaubt' }, { v: 'turnier', label: 'Turnier', title: 'Blinds steigen, einer gewinnt alles' }, { v: 'duell', label: 'Heads-up Duell', title: 'Eins gegen eins' }])}</label>
            <label><span>Spiel</span>{seg(S.game, (v: Game) => setS({ game: v }), GAMES_P.map((x) => ({ v: x.id, label: x.name, title: x.info })))}<small>{g.info}</small></label>
            <div className="pk-row2">
              <label><span>Einsatzregel</span>{seg(S.limit, (v) => setS({ limit: v }), [{ v: 'no', label: 'No-Limit' }, { v: 'pot', label: 'Pot-Limit' }])}</label>
              {S.mode !== 'duell' && <label><span>Spieler</span>{seg(S.players, (v) => setS({ players: v }), [3, 4, 5, 6].map((v) => ({ v, label: String(v) })))}</label>}
            </div>
            <label><span>Gegner</span>{seg(S.level, (v) => setS({ level: v }), LEVELS_P.map((l) => ({ v: l.id, label: String(l.id), title: l.name })))}<small>{lv.name} – {lv.info}</small></label>
            {S.mode === 'cash' && <label><span>Blinds</span>{seg(S.blinds, (v) => setS({ blinds: v }), [{ v: 20, label: '10/20' }, { v: 50, label: '25/50' }, { v: 100, label: '50/100' }])}</label>}
            {S.mode === 'cash' && <label><span>Startguthaben</span>{seg(S.buyin, (v) => setS({ buyin: v }), [500, 1000, 2000, 5000].map((v) => ({ v, label: String(v) })))}</label>}
            {S.mode === 'turnier' && <p className="pk-sub">Turnier: 1500 Chips, Blinds steigen alle 8 Hände (ab Level 5 mit Ante).</p>}
            <button className="pk-start" onClick={start}>Platz nehmen</button>
            {(sec.sonnenbrille || sec.wahrsager || sec.bluffer) && <p className="pk-sub">Geheim aktiv: {[sec.sonnenbrille && 'Sonnenbrille', sec.wahrsager && 'Wahrsager', sec.bluffer && 'Bluffer'].filter(Boolean).join(', ')}</p>}
          </div>
        </section>
        <section className="pk-tiles">
          <button className="pk-tile" onClick={() => setView('learn')}><i>♠</i><b>Lernen</b><span>{Object.values(data.lessons).filter(Boolean).length} / {LESSONS_P.length} Lektionen</span></button>
          <button className="pk-tile" onClick={() => setView('trainer')}><i>♥</i><b>Trainer</b><span>Quoten, Outs, Entscheidungen</span></button>
          <button className="pk-tile" onClick={() => setView('daily')}><i>♦</i><b>Hand des Tages</b><span>{dailyDone('poker', '') ? 'gelöst ✓' : 'offen'}</span></button>
          <button className="pk-tile" onClick={() => setView('history')}><i>♣</i><b>Handverlauf</b><span>{data.history.length} Hände</span></button>
          <button className="pk-tile" onClick={() => setView('stats')}><i>★</i><b>Statistik</b><span>{data.totals.hands} Hände · {data.totals.net >= 0 ? '+' : ''}{data.totals.net}</span></button>
          <button className="pk-tile" onClick={() => setView('options')}><i>⚙</i><b>Optionen</b><span>Tisch, Karten, Hilfen</span></button>
        </section>
      </div>
    );
  }

  void today;
  return (
    <div className={themeCls}>
      <header className="pk-top">
        <button onClick={view === 'menu' ? onExit : back}>← {view === 'menu' ? 'Halle' : 'Menü'}</button>
        <h1>Poker</h1>
        <span className="pk-top-sub">Hold’em · Omaha · Short Deck</span>
      </header>
      {body}
    </div>
  );
}

function Options({ S, setS, onBack, onReset }: { S: PSettings; setS: (p: Partial<PSettings>) => void; onBack: () => void; onReset: () => void }) {
  const [sure, setSure] = useState(false);
  const flags: [keyof PSettings, string][] = [['showOdds', 'Pot-Quote anzeigen'], ['showEquity', 'Gewinnchance anzeigen (Hilfe, zählt nicht für Erfolge)'], ['autoNext', 'Nächste Hand automatisch'], ['fourColor', 'Vier Farben (Kreuz grün, Karo blau)'], ['sound', 'Geräusche']];
  return (
    <div className="pk-sub-view">
      <header className="pk-subhead"><button onClick={onBack}>← Menü</button><h2>Optionen</h2></header>
      <div className="pk-opts">
        <section>
          <h3>Tisch</h3>
          <div className="pk-swatches">{THEMES_P.map((t) => <button key={t.id} className={S.theme === t.id ? 'on' : ''} onClick={() => setS({ theme: t.id })}><span className={`pk-chip pk-th-${t.id}`} /><span>{t.name}</span></button>)}</div>
          <h3>Kartenrücken</h3>
          <div className="pk-swatches">{BACKS_P.map((b) => <button key={b.id} className={S.back === b.id ? 'on' : ''} onClick={() => setS({ back: b.id })}><span className={`kc-back mini b-${b.id}`} /><span>{b.name}</span></button>)}</div>
          <h3>Tempo der Gegner</h3>
          {seg(S.speed, (v) => setS({ speed: v }), [{ v: 'langsam', label: 'Langsam' }, { v: 'normal', label: 'Normal' }, { v: 'schnell', label: 'Schnell' }])}
        </section>
        <section>
          <h3>Hilfen und Anzeige</h3>
          {flags.map(([k, label]) => <label key={k} className="pk-check"><input type="checkbox" checked={S[k] as boolean} onChange={(e) => setS({ [k]: e.target.checked } as Partial<PSettings>)} /> {label}</label>)}
          <p className="pk-sub">Tasten am Tisch: F Fold, C / Leertaste Check oder Call, R / Enter erhöhen, A All-in.</p>
          <h3>Daten</h3>
          {!sure ? <button className="danger" onClick={() => setSure(true)}>Poker-Daten löschen …</button> : <div className="pk-actions"><button className="danger" onClick={() => { onReset(); setSure(false); }}>Wirklich löschen</button><button onClick={() => setSure(false)}>Abbrechen</button></div>}
        </section>
      </div>
    </div>
  );
}
