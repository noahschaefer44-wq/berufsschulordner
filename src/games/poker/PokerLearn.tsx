import { useEffect, useMemo, useRef, useState } from 'react';
import CardView from '../karten/CardView';
import type { PHand, PSettings } from './data';
import { HAND_NAMES } from './engine';
import { type DecisionQuiz, type EquityQuiz, type OutsQuiz, genDecisionQuiz, genEquityQuiz, genOddsQuiz, genOutsQuiz, genRankQuiz, genWinnerQuiz, makeHand } from './trainer';
import { mulberry32, freshSeed } from '../shared/rng';
import { sfx } from '../shared/sfx';

export const Cards = ({ cards, w = 54, S, dim }: { cards: number[]; w?: number; S: PSettings; dim?: boolean }) => (
  <span className="pk-cardrow">{cards.map((c, i) => <span key={`${c}${i}`}><CardView id={c} up w={w} fourColor={S.fourColor} large={false} back={S.back} english dim={dim} /></span>)}</span>
);

// ───────── Lektionen ─────────

interface LStep { title: string; text: string; hands?: { label: string; cards: number[] }[] }
interface PLesson { id: string; title: string; summary: string; steps: LStep[] }

const rankingExamples = (): { label: string; cards: number[] }[] => {
  const rnd = mulberry32(2024);
  return [8, 7, 6, 5, 4, 3, 2, 1, 0].map((cat) => ({ label: HAND_NAMES[cat], cards: makeHand(cat, rnd) }));
};

export const LESSONS_P: PLesson[] = [
  {
    id: 'ablauf', title: 'Ablauf einer Hand', summary: 'Blinds, vier Wettrunden und der Showdown.',
    steps: [
      { title: 'Ziel', text: 'Beim Poker gewinnst du Chips, indem du entweder die beste Hand hast – oder alle anderen zum Aufgeben bringst. Texas Hold’em ist die verbreitetste Variante: Jeder bekommt zwei private Karten, dazu kommen fünf gemeinsame Karten in der Mitte. Deine Hand ist die beste Kombination aus fünf der sieben Karten.' },
      { title: 'Blinds', text: 'Vor jeder Hand setzen die zwei Spieler links vom Dealer-Button Pflichteinsätze: den kleinen Blind (SB) und den großen Blind (BB). Sie sorgen dafür, dass es immer etwas zu gewinnen gibt. Der Button wandert nach jeder Hand einen Platz weiter.' },
      { title: 'Vier Runden', text: '1. Preflop: Du siehst deine zwei Karten und setzt. 2. Flop: drei Gemeinschaftskarten. 3. Turn: die vierte. 4. River: die fünfte. In jeder Runde wird gesetzt. Wer übrig ist, zeigt am Ende die Karten (Showdown); die beste Hand gewinnt den Pot.' },
    ],
  },
  {
    id: 'raenge', title: 'Die Handränge', summary: 'Vom Royal Flush bis zur hohen Karte.',
    steps: [
      { title: 'Rangfolge', text: 'Von stark nach schwach – jeweils mit einem Beispiel. Innerhalb eines Rangs entscheidet die höhere Karte, danach der Kicker (die höchste Nebenkarte).', hands: rankingExamples() },
      { title: 'Besonderheiten', text: 'Ass kann hoch (A-K-Q-J-10) und niedrig (A-2-3-4-5, das „Rad“) in einer Straße sein. Farben haben keinen Rang – bei gleichen Händen wird der Pot geteilt. Ein Flush wird zuerst nach der höchsten Karte entschieden, dann nach der zweithöchsten usw.' },
    ],
  },
  {
    id: 'aktionen', title: 'Aktionen und Einsätze', summary: 'Fold, Check, Call, Bet, Raise, All-in.',
    steps: [
      { title: 'Deine Optionen', text: 'Fold: Hand abgeben. Check: nichts setzen (nur ohne offenen Einsatz). Call: den Einsatz mitgehen. Bet/Raise: setzen oder erhöhen. All-in: alle Chips einsetzen. Die Mindest-Erhöhung ist so groß wie der letzte Einsatz-Sprung.' },
      { title: 'No-Limit und Pot-Limit', text: 'Im No-Limit darfst du jederzeit alles setzen. Im Pot-Limit darfst du höchstens so viel erhöhen, wie im Pot ist (nach dem Call). Beim All-in kürzerer Stacks entstehen Nebentöpfe: Wer weniger hat, kann nur um den Teil spielen, den er abgedeckt hat.' },
    ],
  },
  {
    id: 'position', title: 'Position', summary: 'Wer zuletzt handelt, weiß mehr.',
    steps: [
      { title: 'Der Button', text: 'Nach dem Flop beginnt der Spieler links vom Dealer. Wer zuletzt dran ist („in Position“), sieht, was alle anderen tun, bevor er entscheidet. Das ist ein großer Vorteil: Spiele deshalb vom Button aus mehr Hände als aus den ersten Plätzen.' },
      { title: 'Praktisch', text: 'Früh am Tisch (direkt links vom großen Blind) nur starke Hände spielen. Am Button oder davor kannst du auch spekulative Hände wie gleichfarbige Verbinder (z. B. 7♠ 8♠) riskieren.' },
    ],
  },
  {
    id: 'quote', title: 'Pot-Quote und Outs', summary: 'Rechnen statt raten.',
    steps: [
      { title: 'Pot-Quote', text: 'Wenn du einen Einsatz mitgehen sollst, vergleiche den Preis mit dem Gewinn: Nötige Chance = Einsatz ÷ (Pot + Einsatz). Setzt der Gegner 50 in einen Pot von 100, kostet dich der Call 50, um 200 zu gewinnen – du brauchst 50 ÷ 250 = 20 %.' },
      { title: 'Outs', text: 'Outs sind Karten, die dir noch fehlen. Mit vier Karten zum Flush auf dem Flop hast du 9 Outs. Faustregel: Outs × 4 ≈ Gewinnchance in Prozent mit zwei Karten zu kommen (Flop), Outs × 2 mit einer Karte (Turn). 9 Outs ≈ 36 % auf dem Flop.' },
      { title: 'Üben', text: 'Im Trainer rechnest du Pot-Quoten, schätzt Gewinnchancen und entscheidest zwischen Call und Fold – jeweils mit exakter Lösung.' },
    ],
  },
  {
    id: 'start', title: 'Startkarten', summary: 'Welche Hände lohnen sich?',
    steps: [
      { title: 'Starke Hände', text: 'Paare (vor allem Asse, Könige, Damen), Ass-König, Ass-Dame und hohe gleichfarbige Karten sind stark. Kleine Paare sind gut, um einen Drilling zu treffen (Set-Mining). Gleichfarbige Verbinder wie 8♠ 9♠ haben Potenzial für Flush und Straße.' },
      { title: 'Schwache Hände', text: 'Ungleichfarbige, lose Karten wie 7-2 oder K-3 verlieren auf Dauer Geld. Auch bei Ass mit niedriger Nebenkarte (A-5 ungleichfarbig) bist du oft hinten. Geduld ist die wichtigste Pokerfähigkeit.' },
    ],
  },
  {
    id: 'stil', title: 'Spielstile und Bluffen', summary: 'Eng, locker, passiv, aggressiv.',
    steps: [
      { title: 'Vier Typen', text: 'Eng spielt wenige Hände, locker viele. Passiv geht mit, aggressiv setzt und erhöht. Gute Spieler sind meist eng-aggressiv. Die Bots am Tisch zeigen alle Stile: der Fels, der Hai, Kneipen-Karl, der Zocker, der Rechner und die Zitrone.' },
      { title: 'Bluffen', text: 'Ein Bluff funktioniert, wenn der Gegner glaubt, du hättest mehr, als du hast. Bluffe gegen wenige Gegner, nach glaubwürdigen Geschichten (z. B. ein Ass auf dem Flop nach einem Raise vor dem Flop) und niemals gegen Gegner, die ohnehin immer mitgehen.' },
    ],
  },
  {
    id: 'varianten', title: 'Omaha und Short Deck', summary: 'Wenn die Regeln sich ändern.',
    steps: [
      { title: 'Omaha', text: 'Du bekommst vier Karten, musst aber genau zwei davon und genau drei Gemeinschaftskarten benutzen. Es gibt viel mehr Draws, die Gewinnchancen liegen enger beieinander – Pötte werden größer.' },
      { title: 'Short Deck', text: 'Das Spiel wird mit 36 Karten (6 bis Ass) gespielt. Weil weniger Karten im Spiel sind, werden starke Hände häufiger: Ein Flush ist deshalb seltener als ein Full House und schlägt es. A-6-7-8-9 gilt als Straße.' },
    ],
  },
];

export function LessonsView({ S, done, onDone, onBack }: { S: PSettings; done: Record<string, boolean>; onDone: (id: string) => void; onBack: () => void }) {
  const [lesson, setLesson] = useState<PLesson | null>(null);
  const [step, setStep] = useState(0);
  if (!lesson) {
    return (
      <div className="pk-sub-view">
        <header className="pk-subhead"><button onClick={onBack}>← Menü</button><h2>Lernen</h2><span>{Object.values(done).filter(Boolean).length} / {LESSONS_P.length} Lektionen</span></header>
        <ol className="pk-lessons">{LESSONS_P.map((l, i) => <li key={l.id}><button className={`pk-card ${done[l.id] ? 'done' : ''}`} onClick={() => { setLesson(l); setStep(0); }}><i>{i + 1}</i><b>{l.title}</b><span>{l.summary}</span>{done[l.id] && <em>✓</em>}</button></li>)}</ol>
      </div>
    );
  }
  const st = lesson.steps[step];
  const last = step === lesson.steps.length - 1;
  return (
    <div className="pk-sub-view">
      <header className="pk-subhead"><button onClick={() => setLesson(null)}>← Lektionen</button><h2>{lesson.title}</h2><span>Schritt {step + 1} / {lesson.steps.length}</span></header>
      <div className="pk-lesson">
        <h3>{st.title}</h3>
        <p>{st.text}</p>
        {st.hands && <ul className="pk-examples">{st.hands.map((h) => <li key={h.label}><b>{h.label}</b><Cards cards={h.cards} w={46} S={S} /></li>)}</ul>}
        <div className="pk-lessonnav">
          <button onClick={() => (step ? setStep(step - 1) : setLesson(null))}>← Zurück</button>
          <span className="pk-dots">{lesson.steps.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />)}</span>
          <button className="primary" onClick={() => { if (last) { onDone(lesson.id); const i = LESSONS_P.indexOf(lesson); if (i + 1 < LESSONS_P.length) { setLesson(LESSONS_P[i + 1]); setStep(0); } else setLesson(null); } else setStep(step + 1); }}>{last ? 'Abschließen' : 'Weiter →'}</button>
        </div>
      </div>
    </div>
  );
}

// ───────── Trainer ─────────

export type QuizKind = 'rank' | 'winner' | 'odds' | 'equity' | 'outs' | 'decision';
export const QUIZZES: { id: QuizKind; name: string; info: string }[] = [
  { id: 'rank', name: 'Handränge', info: 'Welche Kombination liegt vor?' },
  { id: 'winner', name: 'Showdown', info: 'Welche Hand gewinnt?' },
  { id: 'odds', name: 'Pot-Quote', info: 'Welche Gewinnchance brauchst du zum Mitgehen?' },
  { id: 'equity', name: 'Gewinnchance', info: 'Schätze deine Chance gegen zufällige Hände.' },
  { id: 'outs', name: 'Outs zählen', info: 'Wie viele Karten bringen dir eine Straße oder besser?' },
  { id: 'decision', name: 'Call oder Fold', info: 'Rechne und entscheide.' },
];

export function TrainerView({ S, kind, stats, onResult, onBack }: { S: PSettings; kind: QuizKind; stats: { right: number; best: number }; onResult: (ok: boolean) => void; onBack: () => void }) {
  const [seed, setSeed] = useState(() => freshSeed() % 100000);
  const [answer, setAnswer] = useState<string>('');
  const [res, setRes] = useState<null | { ok: boolean; text: string }>(null);
  const [round, setRound] = useState(0);
  const counted = useRef(false);
  const meta = QUIZZES.find((q) => q.id === kind)!;
  useEffect(() => { setRes(null); setAnswer(''); counted.current = false; }, [seed]);

  const rank = useMemo(() => (kind === 'rank' ? genRankQuiz(seed) : null), [kind, seed]);
  const winner = useMemo(() => (kind === 'winner' ? genWinnerQuiz(seed) : null), [kind, seed]);
  const odds = useMemo(() => (kind === 'odds' ? genOddsQuiz(seed) : null), [kind, seed]);
  const [equityQ, setEquityQ] = useState<EquityQuiz | null>(null);
  const [outsQ, setOutsQ] = useState<OutsQuiz | null>(null);
  const [decQ, setDecQ] = useState<DecisionQuiz | null>(null);
  useEffect(() => {
    setEquityQ(null); setOutsQ(null); setDecQ(null);
    const id = setTimeout(() => {
      if (kind === 'equity') setEquityQ(genEquityQuiz(seed));
      if (kind === 'outs') setOutsQ(genOutsQuiz(seed));
      if (kind === 'decision') setDecQ(genDecisionQuiz(seed));
    }, 30);
    return () => clearTimeout(id);
  }, [kind, seed, round]);

  const finish = (ok: boolean, text: string) => { setRes({ ok, text }); sfx(ok ? 'good' : 'bad'); if (!counted.current) { counted.current = true; onResult(ok); } };
  const next = () => setSeed(freshSeed() % 100000);

  const numInput = (placeholder: string, check: () => void) => (
    <div className="pk-actions"><input inputMode="numeric" value={answer} placeholder={placeholder} aria-label="Antwort" onChange={(e) => setAnswer(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && answer && !res) check(); }} disabled={!!res} /><button className="primary" disabled={!answer || !!res} onClick={check}>Prüfen</button></div>
  );

  return (
    <div className="pk-sub-view">
      <header className="pk-subhead"><button onClick={onBack}>← Trainer</button><h2>{meta.name}</h2><span>{stats.right} richtig · Rekord {stats.best}</span></header>
      <div className="pk-quiz">
        {rank && (
          <>
            <h3>Welche Hand ist das?</h3>
            <Cards cards={rank.cards} w={68} S={S} />
            <div className="pk-options">{rank.options.map((o, i) => <button key={o} disabled={!!res} className={res && i === rank.answer ? 'right' : ''} onClick={() => finish(i === rank.answer, `Das ist: ${rank.options[rank.answer]}.`)}>{o}</button>)}</div>
          </>
        )}
        {winner && (
          <>
            <h3>Wer gewinnt?</h3>
            <p className="pk-sub">Gemeinschaftskarten</p><Cards cards={winner.board} w={60} S={S} />
            <div className="pk-vs"><div><b>Spieler A</b><Cards cards={winner.a} w={54} S={S} /></div><div><b>Spieler B</b><Cards cards={winner.b} w={54} S={S} /></div></div>
            <div className="pk-options">{['Spieler A', 'Spieler B', 'Unentschieden'].map((o, i) => <button key={o} disabled={!!res} className={res && i === winner.answer ? 'right' : ''} onClick={() => finish(i === winner.answer, `A hat ${winner.nameA}, B hat ${winner.nameB}.`)}>{o}</button>)}</div>
          </>
        )}
        {odds && (
          <>
            <h3>Pot-Quote</h3>
            <p>Im Pot liegen <b>{odds.pot}</b>. Dein Gegner setzt <b>{odds.bet}</b>. Du müsstest <b>{odds.bet}</b> zahlen, um <b>{odds.pot + 2 * odds.bet}</b> zu gewinnen. Wie viel Prozent Gewinnchance brauchst du mindestens?</p>
            {numInput('% (ganze Zahl)', () => { const v = +answer, want = Math.round(odds.need * 100); finish(Math.abs(v - odds.need * 100) <= 3, `Nötige Chance = ${odds.bet} ÷ ${odds.pot + 2 * odds.bet} = ${want} %.`); })}
          </>
        )}
        {kind === 'equity' && (equityQ ? (
          <>
            <h3>Wie gut ist deine Hand?</h3>
            <p>Deine Karten, die Gemeinschaftskarten und {equityQ.opponents} Gegner mit zufälligen Händen. Schätze deine Gewinnchance in Prozent (Abweichung bis 7 Prozentpunkte zählt als richtig).</p>
            <Cards cards={equityQ.hole} w={62} S={S} />{equityQ.board.length > 0 && <><p className="pk-sub">Brett</p><Cards cards={equityQ.board} w={52} S={S} /></>}
            {numInput('% (ganze Zahl)', () => finish(Math.abs(+answer - equityQ.eq * 100) <= 7, `Berechnet (2500 Simulationen): ${Math.round(equityQ.eq * 100)} %.`))}
          </>
        ) : <p className="pk-sub">Berechne …</p>)}
        {kind === 'outs' && (outsQ ? (
          <>
            <h3>Zähle deine Outs</h3>
            <p>Wie viele unbekannte Karten bringen dir eine <b>Straße oder besser</b>?</p>
            <Cards cards={outsQ.hole} w={62} S={S} /><p className="pk-sub">Brett</p><Cards cards={outsQ.board} w={52} S={S} />
            {numInput('Anzahl Karten', () => finish(+answer === outsQ.outs.length, `Es sind ${outsQ.outs.length} Outs.`))}
            {res && <><p className="pk-sub">Deine Outs:</p><Cards cards={outsQ.outs} w={34} S={S} /></>}
          </>
        ) : <p className="pk-sub">Berechne …</p>)}
        {kind === 'decision' && (decQ ? (
          <>
            <h3>Call oder Fold?</h3>
            <p>Pot vor dem Einsatz: <b>{decQ.pot}</b> · Gegner setzt <b>{decQ.bet}</b>. Er hält eine zufällige Hand. Gehst du mit?</p>
            <Cards cards={decQ.hole} w={62} S={S} />{decQ.board.length > 0 && <><p className="pk-sub">Brett</p><Cards cards={decQ.board} w={52} S={S} /></>}
            <div className="pk-options">{(['call', 'fold'] as const).map((o) => <button key={o} disabled={!!res} className={res && o === decQ.answer ? 'right' : ''} onClick={() => finish(o === decQ.answer, `Deine Chance: ${Math.round(decQ.eq * 100)} % – nötig: ${Math.round(decQ.need * 100)} %.`)}>{o === 'call' ? 'Call' : 'Fold'}</button>)}</div>
          </>
        ) : <p className="pk-sub">Berechne …</p>)}
        {res && <div className={`pk-msg ${res.ok ? 'ok' : 'bad'}`}><b>{res.ok ? 'Richtig!' : 'Leider falsch.'}</b> {res.text}</div>}
        <div className="pk-actions">{res && <button className="primary" onClick={next}>Nächste Aufgabe</button>}{res && kind === 'decision' && <button onClick={() => setRound((r) => r + 1)}>Erklärung wiederholen</button>}</div>
      </div>
    </div>
  );
}

// ───────── Tagesaufgabe ─────────

export function DailyView({ S, seed, done, onSolved, onBack }: { S: PSettings; seed: number; done: boolean; onSolved: () => void; onBack: () => void }) {
  const [q, setQ] = useState<DecisionQuiz | null>(null);
  const [res, setRes] = useState<null | boolean>(null);
  useEffect(() => { const id = setTimeout(() => setQ(genDecisionQuiz(seed)), 30); return () => clearTimeout(id); }, [seed]);
  return (
    <div className="pk-sub-view">
      <header className="pk-subhead"><button onClick={onBack}>← Menü</button><h2>Hand des Tages</h2><span>{done ? 'gelöst ✓' : 'offen'}</span></header>
      {!q && <p className="pk-sub">Berechne …</p>}
      {q && (
        <div className="pk-quiz">
          <h3>Call oder Fold?</h3>
          <p>Pot vor dem Einsatz: <b>{q.pot}</b> · Gegner setzt <b>{q.bet}</b>. Er hält eine zufällige Hand.</p>
          <Cards cards={q.hole} w={62} S={S} />{q.board.length > 0 && <><p className="pk-sub">Brett</p><Cards cards={q.board} w={52} S={S} /></>}
          <div className="pk-options">{(['call', 'fold'] as const).map((o) => <button key={o} disabled={res !== null} className={res !== null && o === q.answer ? 'right' : ''} onClick={() => { const ok = o === q.answer; setRes(ok); sfx(ok ? 'good' : 'bad'); if (ok) onSolved(); }}>{o === 'call' ? 'Call' : 'Fold'}</button>)}</div>
          {res !== null && <div className={`pk-msg ${res ? 'ok' : 'bad'}`}><b>{res ? 'Richtig!' : 'Leider falsch.'}</b> Deine Chance: {Math.round(q.eq * 100)} %, nötig sind {Math.round(q.need * 100)} %.</div>}
        </div>
      )}
    </div>
  );
}

// ───────── Handverlauf ─────────

export function HistoryView({ S, hands, onBack }: { S: PSettings; hands: PHand[]; onBack: () => void }) {
  return (
    <div className="pk-sub-view">
      <header className="pk-subhead"><button onClick={onBack}>← Menü</button><h2>Handverlauf</h2><span>{hands.length} Hände</span></header>
      {hands.length === 0 && <p className="pk-sub">Noch keine Hände gespielt.</p>}
      <ul className="pk-history">
        {hands.map((h) => (
          <li key={h.id} className={h.net > 0 ? 'win' : h.net < 0 ? 'loss' : ''}>
            <Cards cards={h.hole} w={38} S={S} /><Cards cards={h.board} w={30} S={S} />
            <span className="pk-hr"><b>{h.net > 0 ? '+' : ''}{h.net}</b><small>{h.result}{h.hand ? ` · ${h.hand}` : ''}</small><small>{h.mode}</small></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
