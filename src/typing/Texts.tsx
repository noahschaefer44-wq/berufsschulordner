import { useMemo, useState } from 'react';
import { allNoteTexts } from '../cover/store';
import TextRun from './TextRun';
import { newId, update, useData } from './store';

/** Text in übungsgroße Häppchen teilen (an Satzenden). */
export function chunkText(raw: string, max = 260): string[] {
  const flat = raw.replace(/^#\s+/gm, '').replace(/\s+/g, ' ').trim();
  if (!flat) return [];
  const parts = flat.match(/[^.!?]+[.!?]*\s*/g) ?? [flat];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = ''; }
    cur += p;
    while (cur.length > max * 1.5) { out.push(cur.slice(0, max).trim()); cur = cur.slice(max); }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export default function Texts() {
  const d = useData();
  const notes = useMemo(() => allNoteTexts(), []);
  const [active, setActive] = useState<{ title: string; chunks: string[]; i: number } | null>(null);
  const [round, setRound] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [listName, setListName] = useState('');
  const [listWords, setListWords] = useState('');

  function start(t: string, raw: string) {
    const chunks = chunkText(raw);
    if (chunks.length) { setActive({ title: t, chunks, i: 0 }); setRound((n) => n + 1); }
  }
  async function file(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    setTitle(f.name.replace(/\.[^.]+$/, ''));
    setBody(text.slice(0, 60000));
  }

  if (active) {
    const last = active.i >= active.chunks.length - 1;
    return (
      <section>
        <button className="tp-link" onClick={() => setActive(null)}>‹ Meine Texte</button>
        <TextRun
          key={round}
          text={active.chunks[active.i]}
          mode="text"
          prompt={<small>{active.title} · Abschnitt {active.i + 1}/{active.chunks.length}</small>}
          onRestart={() => setRound((n) => n + 1)}
          onNext={last ? () => setActive(null) : () => { setActive({ ...active, i: active.i + 1 }); setRound((n) => n + 1); }}
          nextLabel={last ? 'Fertig' : 'Nächster Abschnitt'}
        />
      </section>
    );
  }

  return (
    <section>
      <h2>Eigene Texte</h2>
      <p className="tp-sub">Tippe deine Notizen, Zusammenfassungen oder beliebige Texte ab – so lernst du Stoff und Tippen gleichzeitig.</p>

      <h3>Neuer Text</h3>
      <div className="tp-form">
        <label>Titel<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Sozialversicherung" /></label>
        <label>Text<textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Text einfügen oder Datei laden …" /></label>
        <label>Datei laden (.txt, .md)<input type="file" accept=".txt,.md,text/plain" onChange={(e) => void file(e.target.files?.[0])} /></label>
      </div>
      <div className="tp-btns left">
        <button className="tp-btn main" disabled={!body.trim()} onClick={() => start(title || 'Eigener Text', body)}>Sofort tippen</button>
        <button className="tp-btn" disabled={!body.trim()} onClick={() => { update((x) => { x.texts = [...x.texts, { id: newId(), title: title.trim() || 'Ohne Titel', body }]; }); setTitle(''); setBody(''); }}>Speichern</button>
      </div>

      {d.texts.length > 0 && (
        <>
          <h3>Gespeicherte Texte</h3>
          <ul className="tp-list">
            {d.texts.map((t) => (
              <li key={t.id}>
                <span><b>{t.title}</b><small>{t.body.length} Zeichen</small></span>
                <button className="tp-btn" onClick={() => start(t.title, t.body)}>Tippen</button>
                <button className="tp-btn ghost" onClick={() => { if (confirm(`„${t.title}“ löschen?`)) update((x) => { x.texts = x.texts.filter((y) => y.id !== t.id); }); }}>Löschen</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Aus deinen Notizen</h3>
      {notes.length === 0 ? <p className="tp-sub">Keine Notizen vorhanden.</p> : (
        <ul className="tp-list">
          {notes.map((n, i) => (
            <li key={i}>
              <span><b>{n.title}</b><small>{n.folder}</small></span>
              <button className="tp-btn" onClick={() => start(n.title, n.body)}>Tippen</button>
            </li>
          ))}
        </ul>
      )}

      <h3>Eigene Wortlisten</h3>
      <p className="tp-sub">Für Sprint und Rennen auswählbar – z. B. Fachwörter aus dem Unterricht.</p>
      <div className="tp-form">
        <label>Name<input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="z. B. LF3 Begriffe" /></label>
        <label>Wörter (durch Leerzeichen oder Zeilen getrennt)<textarea rows={3} value={listWords} onChange={(e) => setListWords(e.target.value)} /></label>
      </div>
      <button className="tp-btn" disabled={!listName.trim() || !listWords.trim()} onClick={() => { update((x) => { x.lists = [...x.lists, { id: newId(), name: listName.trim(), words: listWords.trim() }]; }); setListName(''); setListWords(''); }}>Liste speichern</button>
      {d.lists.length > 0 && (
        <ul className="tp-list">
          {d.lists.map((l) => (
            <li key={l.id}>
              <span><b>{l.name}</b><small>{l.words.split(/\s+/).filter(Boolean).length} Wörter</small></span>
              <button className="tp-btn ghost" onClick={() => update((x) => { x.lists = x.lists.filter((y) => y.id !== l.id); })}>Löschen</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
