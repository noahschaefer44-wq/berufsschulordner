import type { ReactNode } from 'react';
import { OPERATOR, operatorComplete, LEGAL_UPDATED, SOURCE_URL } from '../content/operator';

const PAGES = [
  { id: 'impressum', title: 'Impressum' },
  { id: 'datenschutz', title: 'Datenschutz' },
  { id: 'cookies', title: 'Cookies & Speicher' },
  { id: 'nutzung', title: 'Nutzungsbedingungen' },
  { id: 'barrierefreiheit', title: 'Barrierefreiheit' },
  { id: 'lizenzen', title: 'Lizenzen & Quellen' },
];

export default function Legal({ page }: { page?: string }) {
  const cur = PAGES.find((p) => p.id === page) ?? PAGES[0];
  return (
    <>
      <div className="page-head">
        <div className="kicker">Rechtliches · Stand {LEGAL_UPDATED}</div>
        <h1>{cur.title}</h1>
        <nav className="row" aria-label="Rechtliche Seiten">
          {PAGES.map((p) => (
            <a key={p.id} className={'btn small' + (p.id === cur.id ? ' primary' : ' ghost')} href={'#/rechtliches/' + p.id}
              aria-current={p.id === cur.id ? 'page' : undefined}>{p.title}</a>
          ))}
        </nav>
      </div>
      <article className="legal">
        {cur.id === 'impressum' && <Impressum />}
        {cur.id === 'datenschutz' && <Privacy />}
        {cur.id === 'cookies' && <Cookies />}
        {cur.id === 'nutzung' && <Terms />}
        {cur.id === 'barrierefreiheit' && <Accessibility />}
        {cur.id === 'lizenzen' && <Licenses />}
      </article>
    </>
  );
}

function Contact() {
  if (!operatorComplete())
    return (
      <div className="feedback bad" role="note">
        <b>Die Betreiberangaben fehlen noch.</b> Name, Anschrift und E-Mail werden hier ergänzt, sobald sie hinterlegt sind.
      </div>
    );
  return (
    <p>
      {OPERATOR.name}<br />
      {OPERATOR.street}<br />
      {OPERATOR.city}<br />
      {OPERATOR.country}<br />
      E-Mail: <a href={'mailto:' + OPERATOR.email}>{OPERATOR.email}</a>
    </p>
  );
}

const S = ({ h, children }: { h: string; children: ReactNode }) => (
  <section>
    <h2>{h}</h2>
    {children}
  </section>
);

function Impressum() {
  return (
    <>
      <S h="Angaben gemäß § 5 DDG">
        <Contact />
      </S>
      <S h="Verantwortlich für den Inhalt">
        <p>Die oben genannte Person. Chessty ist ein privates, nicht-kommerzielles Projekt ohne Werbung und ohne Bezahlfunktionen.</p>
      </S>
      <S h="Haftung für Inhalte und Links">
        <p>
          Die Inhalte wurden mit Sorgfalt erstellt und – wo möglich – automatisch mit der Schach-Engine Stockfish geprüft. Für Richtigkeit,
          Vollständigkeit und Aktualität kann trotzdem keine Gewähr übernommen werden. Für Inhalte verlinkter externer Seiten (z. B. Lichess)
          sind ausschließlich deren Betreiber verantwortlich. Werden Rechtsverletzungen bekannt, werden betroffene Inhalte oder Links umgehend entfernt.
        </p>
      </S>
      <S h="Streitbeilegung">
        <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </S>
    </>
  );
}

function Privacy() {
  return (
    <>
      <S h="Kurz gesagt">
        <ul>
          <li>Kein Tracking, keine Analyse-Tools, keine Werbung, keine Cookies.</li>
          <li>Dein Lernfortschritt bleibt auf deinem Gerät – außer du legst freiwillig ein Community-Konto an.</li>
          <li>Ein Konto braucht weder E-Mail noch Passwort, nur einen frei gewählten Anzeigenamen.</li>
          <li>Du kannst alles jederzeit exportieren und löschen.</li>
        </ul>
      </S>
      <S h="1. Verantwortlicher">
        <Contact />
      </S>
      <S h="2. Hosting (Netlify)">
        <p>
          Die Website wird bei Netlify, Inc. (San Francisco, USA) gehostet. Beim Aufruf verarbeitet Netlify technisch notwendige Daten wie
          IP-Adresse, Zeitpunkt, aufgerufene Datei und Browser-Kennung (Server-Logfiles), um die Seite auszuliefern und vor Missbrauch zu schützen.
          Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Netlify ist nach eigenen Angaben unter dem
          EU-US Data Privacy Framework zertifiziert; zusätzlich gelten Standardvertragsklauseln. Wir selbst werten diese Logs nicht aus.
        </p>
      </S>
      <S h="3. Speicherung auf deinem Gerät">
        <p>
          Fortschritt, Einstellungen, eigene Varianten und das Fehlerheft speichert Chessty im lokalen Speicher deines Browsers (localStorage),
          damit die App funktioniert und offline nutzbar ist. Diese Daten verlassen dein Gerät nicht, solange du kein Konto anlegst. Details
          unter <a href="#/rechtliches/cookies">Cookies &amp; Speicher</a>. Unter <a href="#/profil">Profil</a> kannst du alles exportieren oder löschen.
        </p>
      </S>
      <S h="4. Freiwilliges Community-Konto (Supabase)">
        <p>
          Nur wenn du unter „Community“ ein Konto anlegst, werden auf unserem Server bei Supabase (Rechenzentrum Frankfurt am Main, EU) gespeichert:
          dein Anzeigename, ein zufälliger Freundescode, ein verschlüsselter (gehashter) Geheimcode, XP, Serie, Puzzle-Wertung, Liga,
          dein Lernfortschritt zur Synchronisation, Freundschaften und Tagespuzzle-Ergebnisse.
        </p>
        <p>
          <b>Öffentlich sichtbar</b> für andere Nutzer sind nur Anzeigename, XP der Woche, Liga und Tagespuzzle-Ergebnis in den Ranglisten.
          Wähle deshalb bitte keinen echten vollständigen Namen. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit
          durch Löschen des Kontos widerrufen kannst – dabei werden alle zugehörigen Daten sofort entfernt.
        </p>
      </S>
      <S h="5. Online-Partien und Tagespuzzle">
        <p>
          Für Online-Partien werden die Züge über Supabase übertragen. Die dafür nötigen Nachrichten enthalten nur den Partie-Code und die Züge
          und werden nach spätestens zwei Tagen automatisch gelöscht. Beim Laden von Ranglisten und Partien stellt dein Browser eine Verbindung
          zu Supabase her; dabei wird technisch deine IP-Adresse übermittelt (Art. 6 Abs. 1 lit. b und f DSGVO).
        </p>
      </S>
      <S h="6. Dienste, die du selbst auslöst">
        <ul>
          <li>
            <b>Partie-Import</b> (Partieanalyse): Gibst du einen Benutzernamen ein, fragt dein Browser öffentliche Partien direkt bei
            lichess.org bzw. api.chess.com ab. Dabei erhalten diese Dienste deine IP-Adresse und den eingegebenen Namen.
          </li>
          <li>
            <b>Endspiel-Datenbank</b>: In der Endspiel-Praxis werden Stellungen (ohne persönliche Daten) an tablebase.lichess.ovh gesendet.
            Ohne Verbindung übernimmt die eingebaute Engine.
          </li>
          <li>
            <b>Browser-KI</b> im Varianten-Assistenten: Nur falls dein Browser eine eingebaute KI anbietet (z. B. Chrome), läuft sie lokal auf deinem Gerät.
            Chessty sendet deinen Text an keinen Server.
          </li>
          <li>
            <b>Tipptraining – Wikipedia-Zufall</b>: Wählst du im Training „Wikipedia“, ruft dein Browser einen zufälligen Artikelanfang von
            de.wikipedia.org bzw. en.wikipedia.org ab (Wikimedia Foundation, USA). Dabei erhält Wikimedia deine IP-Adresse. Ohne diese Funktion findet keine Verbindung statt.
          </li>
          <li>
            <b>Tipptraining – Diktat</b>: Die Vorlesefunktion nutzt die Sprachausgabe deines Browsers bzw. Betriebssystems; Chessty sendet dafür nichts an einen Server.
            Notizen, Tipp-Statistiken, Lernkarten und eigene Texte liegen nur im lokalen Speicher deines Browsers.
          </li>
        </ul>
      </S>
      <S h="7. Kinder und Jugendliche">
        <p>
          Die App ist ohne Konto für alle Altersgruppen nutzbar. Ein Community-Konto sollten Kinder unter 16 Jahren nur mit Zustimmung
          ihrer Eltern anlegen (Art. 8 DSGVO).
        </p>
      </S>
      <S h="8. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch
          (Art. 15–21 DSGVO) sowie auf Widerruf einer Einwilligung. Die meisten Rechte kannst du direkt in der App ausüben (Export und Löschen
          unter „Profil“ bzw. „Community“). Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren.
        </p>
      </S>
    </>
  );
}

function Cookies() {
  return (
    <>
      <S h="Setzt Chessty Cookies?">
        <p>Nein. Chessty setzt keine Cookies und bindet keine Tracking-, Werbe- oder Analyse-Dienste ein. Deshalb gibt es auch kein Cookie-Banner.</p>
      </S>
      <S h="Was wird lokal gespeichert?">
        <ul>
          <li><b>Lernfortschritt</b> (XP, Lektionen, Fehlerheft, Einstellungen) – damit dein Fortschritt erhalten bleibt.</li>
          <li><b>Eigene Pfeile, Varianten, Import-Name</b> – nur wenn du diese Funktionen nutzt.</li>
          <li><b>Sync-Code</b> – nur mit Community-Konto.</li>
          <li><b>Gefundene Lösungen im Spielesalon</b> (Acht Damen) – nur wenn du dort spielst.</li>
          <li><b>Zuletzt gespielte Bot-Partie</b> für Partieanalyse und Fehler-Coach – nur für die Dauer der Sitzung (sessionStorage), danach automatisch gelöscht.</li>
          <li><b>Offline-Speicher</b> (Service Worker) – Programmdateien, Puzzles und Engine, damit die App ohne Internet läuft.</li>
        </ul>
        <p>
          Diese Speicherung ist unbedingt erforderlich, um die von dir ausdrücklich gewünschte App bereitzustellen
          (§ 25 Abs. 2 Nr. 2 TDDDG); eine Einwilligung ist dafür nicht nötig. Du kannst alles über „Profil → Fortschritt löschen“ oder die
          Browser-Einstellungen („Websitedaten löschen“) entfernen.
        </p>
      </S>
    </>
  );
}

function Terms() {
  return (
    <>
      <S h="1. Kostenlos">
        <p>
          Chessty ist vollständig kostenlos. Es gibt keine Käufe, Abos oder Werbung. Da keine Zahlungen anfallen, gibt es auch keine
          Erstattungen oder Widerrufsfristen.
        </p>
      </S>
      <S h="2. Keine Gewähr">
        <p>
          Chessty wird ohne Gewähr bereitgestellt. Engine-Bewertungen, Elo-Angaben der Bots und Erklärungen sind Hilfen zum Lernen, keine
          garantierten Wahrheiten. Die Verfügbarkeit von Server-Funktionen (Konten, Online-Partien) kann nicht zugesichert werden.
        </p>
      </S>
      <S h="3. Faires Verhalten in der Community">
        <ul>
          <li>Keine beleidigenden, diskriminierenden oder fremden Namen als Anzeigename.</li>
          <li>Keine Engine-Hilfe beim Tagespuzzle oder in Online-Partien gegen Menschen.</li>
          <li>Keine Versuche, den Server zu stören oder fremde Konten zu nutzen.</li>
        </ul>
        <p>Konten, die dagegen verstoßen, können ohne Vorankündigung gelöscht werden.</p>
      </S>
      <S h="4. Deine Inhalte">
        <p>
          Eigene Varianten und Pfeile gehören dir. Wenn du einen Varianten-Link teilst, enthält er die Regeln deiner Variante – teile ihn nur,
          wenn das für dich in Ordnung ist.
        </p>
      </S>
      <S h="5. Quellcode">
        <p>
          Chessty ist freie Software unter der GNU General Public License v3 (oder später). Den Quellcode findest du
          unter <a href={SOURCE_URL} target="_blank" rel="noreferrer">{SOURCE_URL.replace('https://', '')}</a>.
        </p>
      </S>
    </>
  );
}

function Accessibility() {
  return (
    <>
      <S h="Unser Ziel">
        <p>Chessty soll für möglichst alle nutzbar sein – auch mit Tastatur, Screenreader oder Sehschwäche. Umgesetzt ist bisher:</p>
        <ul>
          <li><b>Tastatur</b>: Auf jedem Brett, auf dem du ziehen darfst, öffnet die Tab-Taste ein Eingabefeld für Züge (z. B. „e4“, „Sf3“, „O-O“ oder „e2e4“). Leertaste/Enter = weiter, Pfeiltasten = Züge vor/zurück.</li>
          <li><b>Screenreader</b>: Züge werden angesagt, Diagramme und Buttons haben Beschriftungen.</li>
          <li><b>Kontrast</b>: Schwarz-weißes Design mit hohem Kontrast; heller und dunkler Modus.</li>
          <li><b>Vorlesen</b>: Erklärungen in Lektionen können vorgelesen werden.</li>
          <li><b>Bewegung</b>: Animationen werden reduziert, wenn dein System „Bewegung reduzieren“ eingestellt hat.</li>
        </ul>
      </S>
      <S h="Bekannte Einschränkungen">
        <ul>
          <li>Die Varianten-Bretter werden per Klick oder mit Tab + Enter auf den Feldern bedient; eine Texteingabe für Züge fehlt dort noch.</li>
          <li>Einige Trainer (z. B. Feldfarben auf Zeit) sind vor allem visuell.</li>
        </ul>
        <p>Fällt dir eine Barriere auf? Melde sie bitte über die Kontaktdaten im <a href="#/rechtliches/impressum">Impressum</a>.</p>
      </S>
    </>
  );
}

function Licenses() {
  const rows: [string, string, string][] = [
    ['Chessty (dieser Code)', 'GPL-3.0-or-later', SOURCE_URL],
    ['Stockfish 19 (stockfish.js)', 'GPL-3.0', 'https://github.com/nmrugg/stockfish.js'],
    ['Chessground (Brett)', 'GPL-3.0', 'https://github.com/lichess-org/chessground'],
    ['Figuren „cburnett“ (Colin M. L. Burnett)', 'GPL-2.0-or-later / CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces'],
    ['chess.js', 'BSD-2-Clause', 'https://github.com/jhlywa/chess.js'],
    ['React', 'MIT', 'https://react.dev'],
    ['Supabase JS', 'MIT', 'https://github.com/supabase/supabase-js'],
    ['Schrift Space Grotesk (Florian Karsten)', 'SIL Open Font License 1.1', 'https://fonts.google.com/specimen/Space+Grotesk'],
    ['Schrift JetBrains Mono', 'SIL Open Font License 1.1', 'https://www.jetbrains.com/lp/mono/'],
    ['Puzzles (Lichess-Puzzle-Datenbank)', 'CC0', 'https://database.lichess.org/#puzzles'],
    ['Eröffnungsnamen (lichess-org/chess-openings)', 'CC0', 'https://github.com/lichess-org/chess-openings'],
    ['Endspiel-Datenbank (Lichess Tablebase API)', 'freie API', 'https://tablebase.lichess.ovh'],
    ['Meisterpartien (Notationen via PGN Mentor)', 'Partienotationen sind gemeinfrei; Kommentare sind eigene Texte', 'https://www.pgnmentor.com'],
  ];
  return (
    <>
      <S h="Verwendete Werke">
        <p>Alle Texte, Lektionen, Erklärungen und Diagramme sind eigene Inhalte. Chessty nutzt keine fremden Fotos. Folgende freie Werke sind eingebunden:</p>
        <div className="list">
          {rows.map(([n, l, u]) => (
            <div key={n}>
              <span style={{ flex: 1 }}><b>{n}</b></span>
              <span className="mono" style={{ fontSize: 12 }}>{l}</span>
              <a className="btn small ghost" href={u} target="_blank" rel="noreferrer" aria-label={`Quelle von ${n} öffnen`}>Quelle</a>
            </div>
          ))}
        </div>
      </S>
      <S h="Marken">
        <p>
          „Lichess“, „Chess.com“ und „Stockfish“ werden nur zur Quellenangabe genannt. Chessty ist mit diesen Diensten nicht verbunden.
          Die Varianten (z. B. Crazyhouse, Duck Chess) sind freie Spielregeln; Chessty verwendet eigene deutsche Namen und Texte.
        </p>
      </S>
    </>
  );
}
