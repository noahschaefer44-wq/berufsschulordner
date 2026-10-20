import { useEffect, useRef, useState } from 'react';
import { PALETTE, loadNotes, saveNotes, today, uid, type NB, type NF, type NState } from './store';
import './cover.css';

/**
 * Tarn-Startseite im Stil einer Notizen-App: Ordner, Hefte, Seiten – echte Notizen, die lokal im Browser gespeichert werden.
 * Chessty öffnet sich erst, wenn in den Einstellungen „Ton“ ausgeschaltet wird.
 * Das Tipptraining öffnet sich, wenn man in den Einstellungen fünfmal schnell auf „Version“ tippt.
 */
export default function Cover({ onUnlock, onUnlockType, onUnlockGames }: { onUnlock: () => void; onUnlockType: () => void; onUnlockGames: () => void }) {
  const [st, setSt] = useState<NState>(loadNotes);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [manage, setManage] = useState(false);
  const [sort, setSort] = useState<'Datum' | 'Name'>('Datum');
  const [settings, setSettings] = useState(false);
  const [sound, setSound] = useState(true);
  const [autosave, setAutosave] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const taps = useRef({ n: 0, t: 0 });
  const storeTaps = useRef({ n: 0, t: 0 });
  const area = useRef<HTMLTextAreaElement>(null);

  const folder = st.folders.find((f) => f.id === folderId) ?? null;
  const book = folder?.books.find((b) => b.id === bookId) ?? null;
  const paper = st.paper;

  function mutate(fn: (s: NState) => NState) {
    setSt((prev) => { const n = fn(prev); saveNotes(n); return n; });
  }
  const patchBook = (fid: string, bid: string, fn: (b: NB) => NB) =>
    mutate((s) => ({ ...s, folders: s.folders.map((f) => (f.id === fid ? { ...f, mod: Date.now(), books: f.books.map((b) => (b.id === bid ? { ...fn(b), mod: Date.now() } : b)) } : f)) }));

  function toggleSound() {
    setSound(false);
    setTimeout(onUnlock, 280); // kurz den umgelegten Schalter zeigen, dann öffnen
  }
  function tapVersion() {
    const now = Date.now();
    const t = taps.current;
    t.n = now - t.t < 1500 ? t.n + 1 : 1;
    t.t = now;
    if (t.n >= 5) { t.n = 0; setSettings(false); setTimeout(onUnlockType, 120); }
  }

  function tapStorage() {
    const now = Date.now();
    const t = storeTaps.current;
    t.n = now - t.t < 1200 ? t.n + 1 : 1;
    t.t = now;
    if (t.n >= 3) { t.n = 0; setSettings(false); setTimeout(onUnlockGames, 120); }
  }

  function newFolder() {
    setMenu(false);
    const name = prompt('Name des neuen Ordners', 'Neuer Ordner')?.trim();
    if (!name) return;
    mutate((s) => ({ ...s, folders: [...s.folders, { id: uid(), name, color: PALETTE[s.folders.length % PALETTE.length], mod: Date.now(), books: [] }] }));
  }
  function newBook() {
    setMenu(false);
    if (!folder) return;
    const id = uid();
    const nb: NB = { id, title: 'Neue Notiz', date: today(), lines: [], mod: Date.now() };
    mutate((s) => ({ ...s, folders: s.folders.map((f) => (f.id === folder.id ? { ...f, mod: Date.now(), books: [...f.books, nb] } : f)) }));
    setBookId(id);
    setEditing(true);
  }
  function renameFolder(f: NF) {
    const name = prompt('Ordner umbenennen', f.name)?.trim();
    if (name) mutate((s) => ({ ...s, folders: s.folders.map((x) => (x.id === f.id ? { ...x, name, mod: Date.now() } : x)) }));
  }
  function deleteFolder(f: NF) {
    if (confirm(`Ordner „${f.name}“ mit ${f.books.length} Element(en) wirklich löschen?`)) mutate((s) => ({ ...s, folders: s.folders.filter((x) => x.id !== f.id) }));
  }
  function deleteBook(f: NF, b: NB) {
    if (!confirm(`„${b.title}“ wirklich löschen?`)) return;
    mutate((s) => ({ ...s, folders: s.folders.map((x) => (x.id === f.id ? { ...x, books: x.books.filter((y) => y.id !== b.id) } : x)) }));
    setBookId(null);
    setEditing(false);
  }
  function renameBook(f: NF, b: NB) {
    const title = prompt('Heft umbenennen', b.title)?.trim();
    if (title) patchBook(f.id, b.id, (x) => ({ ...x, title }));
  }

  // Textfeld wächst mit dem Inhalt
  useEffect(() => {
    const a = area.current;
    if (a) { a.style.height = 'auto'; a.style.height = `${Math.max(a.scrollHeight, window.innerHeight * 0.55)}px`; }
  }, [editing, book?.lines, bookId]);

  const q = query.toLowerCase();
  const sortedFolders = [...st.folders].sort((a, b) => (sort === 'Name' ? a.name.localeCompare(b.name, 'de') : b.mod - a.mod));
  const visibleFolders = sortedFolders.filter((f) => !q || (f.name + f.books.map((b) => b.title + b.lines.join(' ')).join(' ')).toLowerCase().includes(q));
  const visibleBooks = (folder?.books ?? []).filter((b) => !q || (b.title + b.lines.join(' ')).toLowerCase().includes(q))
    .sort((a, b) => (sort === 'Name' ? a.title.localeCompare(b.title, 'de') : b.mod - a.mod));

  const goRoot = () => { setFolderId(null); setBookId(null); setEditing(false); setManage(false); };
  const goFolder = () => { setBookId(null); setEditing(false); };

  const crumbs = (
    <div className="nb-crumbs">
      <button onClick={goRoot}>Dokumente</button>
      {folder && <><span>›</span><button onClick={goFolder}>{folder.name}</button></>}
      {book && <><span>›</span><span>{book.title}</span></>}
    </div>
  );

  return (
    <div className="nb">
      <header className="nb-top">
        <div className="nb-left">
          {(folder || book) && <button className="nb-back" aria-label="Zurück" onClick={() => (book ? goFolder() : goRoot())}>‹</button>}
          <h1>{book ? book.title : folder ? folder.name : 'Dokumente'}</h1>
        </div>
        <div className="nb-actions">
          {book && folder && (
            <button className="nb-text-btn" onClick={() => setEditing((e) => !e)}>{editing ? 'Fertig' : 'Bearbeiten'}</button>
          )}
          {!book && (
            <button aria-label="Suchen" onClick={() => setSearching((s) => !s)}>
              <svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
            </button>
          )}
          {!book && (
            <button aria-label="Neu" onClick={() => setMenu((m) => !m)}>
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          )}
          <button aria-label="Einstellungen" onClick={() => setSettings(true)}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
          </button>
        </div>
        {menu && (
          <div className="nb-menu" role="menu">
            <button role="menuitem" onClick={newFolder}>Neuer Ordner</button>
            {folder && <button role="menuitem" onClick={newBook}>Neue Notiz</button>}
          </div>
        )}
      </header>
      {searching && !book && (
        <div className="nb-search"><input autoFocus placeholder="Dokumente durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Suchen" /></div>
      )}
      {(folder || book) && crumbs}

      {!book && (
        <div className="nb-sort">
          <span>Sortieren nach</span>{' '}
          <button className="nb-sortbtn" onClick={() => setSort((s) => (s === 'Datum' ? 'Name' : 'Datum'))}><b>{sort} ▾</b></button>
          <button className="nb-sortbtn nb-manage" onClick={() => setManage((m) => !m)}><b>{manage ? 'Fertig' : 'Auswählen'}</b></button>
        </div>
      )}

      {!folder && !book && (
        <div className="nb-grid">
          {visibleFolders.map((f) => (
            <div key={f.id} className="nb-cell">
              <button className="nb-folder" onClick={() => { setFolderId(f.id); setManage(false); }}>
                <svg viewBox="0 0 120 92" className="nb-folder-ico" aria-hidden="true">
                  <path d="M6 14a6 6 0 0 1 6-6h30l8 9h58a6 6 0 0 1 6 6v57a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z" fill={f.color} />
                  <path d="M6 28a6 6 0 0 1 6-6h96a6 6 0 0 1 6 6v52a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z" fill={f.color} />
                  <path d="M6 28a6 6 0 0 1 6-6h96a6 6 0 0 1 6 6v52a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z" fill="#fff" opacity=".16" />
                </svg>
                <b>{f.name}</b>
                <small>{f.books.length} {f.books.length === 1 ? 'Element' : 'Elemente'}</small>
              </button>
              {manage && (
                <div className="nb-tools">
                  <button aria-label="Umbenennen" onClick={() => renameFolder(f)}>Umbenennen</button>
                  <button aria-label="Löschen" className="del" onClick={() => deleteFolder(f)}>Löschen</button>
                </div>
              )}
            </div>
          ))}
          {visibleFolders.length === 0 && <p className="nb-empty">{q ? 'Keine Treffer.' : 'Noch keine Ordner. Tippe auf + um einen anzulegen.'}</p>}
        </div>
      )}

      {folder && !book && (
        <div className="nb-grid">
          {visibleBooks.map((b) => (
            <div key={b.id} className="nb-cell">
              <button className="nb-book" onClick={() => { setBookId(b.id); setEditing(false); setManage(false); }}>
                <div className={'nb-thumb' + (b.cover ? ' cover' : '')} style={b.cover ? { background: b.cover } : undefined}>
                  {!b.cover && b.lines.slice(0, 6).map((l, i) => <i key={i} style={{ width: `${40 + ((l.length * 7) % 50)}%` }} />)}
                  {b.cover && <span>{b.title}</span>}
                </div>
                <b>{b.title}</b>
                <small>{b.date}</small>
              </button>
              {manage && (
                <div className="nb-tools">
                  <button onClick={() => renameBook(folder, b)}>Umbenennen</button>
                  <button className="del" onClick={() => deleteBook(folder, b)}>Löschen</button>
                </div>
              )}
            </div>
          ))}
          {visibleBooks.length === 0 && <p className="nb-empty">{q ? 'Keine Treffer.' : 'Dieser Ordner ist leer. Tippe auf + für eine neue Notiz.'}</p>}
        </div>
      )}

      {book && folder && (
        <div className="nb-page-wrap">
          <article className={'nb-page' + (paper === 'Kariert' ? ' grid' : paper === 'Blanko' ? ' blank' : '')}>
            <div className="nb-date">{book.date}</div>
            {editing ? (
              <>
                <input className="nb-title-input" value={book.title} aria-label="Titel" onChange={(e) => patchBook(folder.id, book.id, (b) => ({ ...b, title: e.target.value }))} />
                <textarea
                  ref={area} className="nb-area" autoFocus aria-label="Text" spellCheck={false} placeholder="Schreibe hier … (Zeilen mit „# “ am Anfang werden zu Überschriften)"
                  value={book.lines.join('\n')}
                  onChange={(e) => patchBook(folder.id, book.id, (b) => ({ ...b, lines: e.target.value.split('\n') }))}
                />
                <div className="nb-edit-tools">
                  <button onClick={() => patchBook(folder.id, book.id, (b) => ({ ...b, lines: [...b.lines, '# '] }))}>+ Überschrift</button>
                  <button onClick={() => patchBook(folder.id, book.id, (b) => ({ ...b, date: today() }))}>Datum heute</button>
                  <button className="del" onClick={() => deleteBook(folder, book)}>Löschen</button>
                </div>
              </>
            ) : (
              <>
                <h2>{book.title}</h2>
                {book.lines.length === 0 && <p className="nb-empty">Leer – tippe oben auf „Bearbeiten“.</p>}
                {book.lines.map((l, i) => (l.startsWith('# ') ? <h3 key={i}>{l.slice(2)}</h3> : <p key={i}>{l || ' '}</p>))}
              </>
            )}
          </article>
        </div>
      )}

      {settings && (
        <div className="nb-sheet-bg" onClick={() => setSettings(false)}>
          <div className="nb-sheet" role="dialog" aria-label="Einstellungen" onClick={(e) => e.stopPropagation()}>
            <div className="nb-sheet-head">
              <b>Einstellungen</b>
              <button onClick={() => setSettings(false)}>Fertig</button>
            </div>
            <div className="nb-group-title">Allgemein</div>
            <div className="nb-group">
              <label className="nb-row"><span>Ton</span><Switch on={sound} onChange={() => (sound ? toggleSound() : setSound(true))} /></label>
              <label className="nb-row"><span>Automatisch speichern</span><Switch on={autosave} onChange={() => setAutosave((a) => !a)} /></label>
              <div className="nb-row"><span>iCloud-Synchronisierung</span><small>Aktiv</small></div>
            </div>
            <div className="nb-group-title">Papier</div>
            <div className="nb-group">
              {['Liniert', 'Kariert', 'Blanko'].map((p) => (
                <button key={p} className="nb-row" onClick={() => mutate((s) => ({ ...s, paper: p }))}><span>{p}</span>{paper === p && <b>✓</b>}</button>
              ))}
            </div>
            <div className="nb-group-title">Info</div>
            <div className="nb-group">
              <button className="nb-row" onClick={tapVersion}><span>Version</span><small>6.4.2</small></button>
              <button className="nb-row" onClick={tapStorage}><span>Speicher</span><small>1,3 GB von 5 GB</small></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button role="switch" aria-checked={on} className={'nb-switch' + (on ? ' on' : '')} onClick={(e) => { e.preventDefault(); onChange(); }}>
      <i />
    </button>
  );
}
