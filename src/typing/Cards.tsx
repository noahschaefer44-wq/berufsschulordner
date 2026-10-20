import { useState } from 'react';
import TextRun from './TextRun';
import { newId, update, useData, type Card, type Deck } from './store';

const DAY = 86400000;
const INTERVALS = [0, 1, 2, 4, 8, 16, 32];
const dueIn = (box: number) => Date.now() + INTERVALS[Math.min(box, INTERVALS.length - 1)] * DAY;

function patchCard(deckId: string, cardId: string, fn: (c: Card) => Card) {
  update((x) => { x.decks = x.decks.map((dk) => (dk.id === deckId ? { ...dk, cards: dk.cards.map((c) => (c.id === cardId ? fn(c) : c)) } : dk)); });
}

export default function Cards() {
  const d = useData();
  const [deckId, setDeckId] = useState<string | null>(null);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [round, setRound] = useState(0);
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [bulk, setBulk] = useState('');
  const [name, setName] = useState('');
  const deck: Deck | undefined = d.decks.find((x) => x.id === deckId);

  if (deck && queue) {
    const card = queue[0];
    if (!card) {
      return (
        <section>
          <h2>Geschafft!</h2>
          <p>Alle fälligen Karten in „{deck.name}“ sind durch. Komm morgen wieder.</p>
          <button className="tp-btn main" onClick={() => setQueue(null)}>Zurück</button>
        </section>
      );
    }
    return (
      <section>
        <button className="tp-link" onClick={() => setQueue(null)}>‹ Abbrechen</button>
        <p className="tp-sub">{queue.length} Karten übrig · Fach {card.box + 1}</p>
        <TextRun
          key={round}
          text={card.a}
          mode="karten"
          prompt={<div className="tp-q">{card.q}</div>}
          onFinish={(r) => {
            const ok = r.errs === 0;
            patchCard(deck.id, card.id, (c) => ({ ...c, box: ok ? c.box + 1 : 0, due: ok ? dueIn(c.box + 1) : Date.now() }));
          }}
          onRestart={() => setRound((n) => n + 1)}
          onNext={() => { setQueue((qq) => (qq ? qq.slice(1) : qq)); setRound((n) => n + 1); }}
          nextLabel="Nächste Karte"
          extra={<p className="tp-sub">Ohne Fehler getippt = Karte wandert ein Fach weiter. Mit Fehler kommt sie morgen wieder.</p>}
        />
      </section>
    );
  }

  if (deck) {
    const due = deck.cards.filter((c) => c.due <= Date.now());
    return (
      <section>
        <button className="tp-link" onClick={() => setDeckId(null)}>‹ Alle Stapel</button>
        <h2>{deck.name}</h2>
        <p className="tp-sub">{deck.cards.length} Karten · {due.length} fällig</p>
        <div className="tp-btns left">
          <button className="tp-btn main" disabled={!due.length} onClick={() => { setQueue(due.sort(() => Math.random() - 0.5).slice(0, 15)); setRound((n) => n + 1); }}>Lernen ({Math.min(due.length, 15)})</button>
          <button className="tp-btn ghost" onClick={() => { if (confirm(`Stapel „${deck.name}“ löschen?`)) { update((x) => { x.decks = x.decks.filter((y) => y.id !== deck.id); }); setDeckId(null); } }}>Stapel löschen</button>
        </div>
        <h3>Karte hinzufügen</h3>
        <div className="tp-form">
          <label>Vorderseite (Frage / Wort)<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label>Rückseite (wird getippt)<input value={a} onChange={(e) => setA(e.target.value)} /></label>
        </div>
        <button className="tp-btn" disabled={!q.trim() || !a.trim()} onClick={() => { update((x) => { x.decks = x.decks.map((dk) => (dk.id === deck.id ? { ...dk, cards: [...dk.cards, { id: newId(), q: q.trim(), a: a.trim(), box: 0, due: 0 }] } : dk)); }); setQ(''); setA(''); }}>Hinzufügen</button>
        <h3>Viele auf einmal</h3>
        <div className="tp-form">
          <label>Eine Karte pro Zeile: Frage;Antwort<textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Rechnung;invoice\nLager;warehouse'} /></label>
        </div>
        <button className="tp-btn" disabled={!bulk.includes(';')} onClick={() => {
          const cards = bulk.split('\n').map((l) => l.split(';')).filter((p) => p.length >= 2 && p[0].trim() && p[1].trim()).map((p) => ({ id: newId(), q: p[0].trim(), a: p.slice(1).join(';').trim(), box: 0, due: 0 }));
          update((x) => { x.decks = x.decks.map((dk) => (dk.id === deck.id ? { ...dk, cards: [...dk.cards, ...cards] } : dk)); });
          setBulk('');
        }}>Importieren</button>
        <h3>Alle Karten</h3>
        <ul className="tp-list">
          {deck.cards.map((c) => (
            <li key={c.id}>
              <span><b>{c.q}</b><small>→ {c.a} · Fach {c.box + 1}</small></span>
              <button className="tp-btn ghost" onClick={() => update((x) => { x.decks = x.decks.map((dk) => (dk.id === deck.id ? { ...dk, cards: dk.cards.filter((y) => y.id !== c.id) } : dk)); })}>×</button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section>
      <h2>Lernkarten</h2>
      <p className="tp-sub">Karteikasten mit Wiederholung: Frage lesen, Antwort <b>tippen</b>. Richtig getippte Karten kommen in immer größeren Abständen wieder.</p>
      <div className="tp-decks">
        {d.decks.map((dk) => {
          const due = dk.cards.filter((c) => c.due <= Date.now()).length;
          return (
            <button key={dk.id} className="tp-deck" onClick={() => setDeckId(dk.id)}>
              <b>{dk.name}</b><small>{dk.cards.length} Karten</small><span className={due ? 'due' : ''}>{due ? `${due} fällig` : 'alles erledigt'}</span>
            </button>
          );
        })}
      </div>
      <h3>Neuer Stapel</h3>
      <div className="tp-form"><label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Politik – Begriffe" /></label></div>
      <button className="tp-btn" disabled={!name.trim()} onClick={() => { update((x) => { x.decks = [...x.decks, { id: newId(), name: name.trim(), cards: [] }]; }); setName(''); }}>Stapel anlegen</button>
    </section>
  );
}
