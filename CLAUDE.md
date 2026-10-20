# CLAUDE.md – Chessty

Kostenlose, interaktive Schach-Lern-PWA auf Deutsch (Duolingo-Stil), live unter https://chessty.netlify.app.
Diese Datei ist das Arbeitshandbuch für Claude Code. Optimierungs- und Ausbauliste: `docs/ROADMAP.md`.

## Feste Regeln (vom Eigentümer vorgegeben)
- **Alles auf Deutsch** – UI-Texte, Erklärungen, Kommentare im Code, Commit-Messages. Kein Englisch in der Oberfläche.
- **Alles kostenlos**: keine kostenpflichtigen APIs, keine Werbung, kein Tracking, keine Cookies. Neue Dienste nur, wenn gratis und datensparsam (dann `src/pages/Legal.tsx` → Datenschutz ergänzen!).
- **Design**: scharf/kantig, nur Schwarz, Weiß, Grau (CSS-Variablen `--fg --bg --g3 --g4 --g5` in `src/styles/global.css`), harte Schatten (`box-shadow: 10px 10px 0 var(--fg)`), Hover-Animationen mit `var(--snap)`. Keine Farben, keine runden Ecken.
- **Nie mehr als 10 Puzzles pro Runde** (`MAX_PER_ROUND` in `src/lib/puzzles.ts`).
- **Falsche Züge werden erklärt, nie einfach übersprungen** (`WrongMovePanel` + `useWrongMove`).
- **Keine Inhalte erfinden, die real sein müssen** (Impressum-Daten, Statistiken, Elo-Behauptungen). Betreiberdaten stehen in `src/content/operator.ts` und sind absichtlich leer, bis der Eigentümer sie liefert.
- Keine Modell-Bezeichnungen in Commits, Code oder Dateien.

## Befehle
```bash
npm ci                         # Abhängigkeiten
npm run dev                    # Vite-Dev-Server (http://localhost:5173)
npm run typecheck              # meta.ts erzeugen + tsc -b (TypeScript 7, strikt)
npm test                       # Unit-Tests (Vitest): Varianten-Perft, Genauigkeit, Spiegelung, Varianten-Einführungen
npm run e2e                    # Rauchtest aller Routen (braucht vite preview auf 4173; lokal unter Windows: E2E_CHANNEL=msedge)
npm run build                  # tsc -b && vite build → dist/
npx vite preview --port 4173   # gebautes dist/ ausliefern (für Browser-Tests)
npm run validate               # ALLE Lektionen/Meisterpartien/Endspiel-Praxis mit Stockfish prüfen (dauert Minuten; exit 1 bei Fehlern)
npm run validate -- <lektions-id>   # nur eine Lektion
npm run validate:glossary      # Diagramme des Fachbegriffe-Hefts prüfen
npm run check:variants         # Varianten-Engine: Perft-Referenzwerte + Bot-Duelle + Regel-Assistent
npx tsx scripts/accuracy-check.ts   # Genauigkeitsformel gegen echte Lichess-Partien
```
CI (`.github/workflows/ci.yml`) führt Typecheck, Build, Glossar- und Inhaltsprüfung aus. Vor jedem Push mindestens `npm run build` laufen lassen; bei Inhaltsänderungen zusätzlich `npm run validate -- <id>`.

## Tarn-Startseite (Wunsch des Eigentümers)
- Beim Öffnen erscheint immer zuerst `src/cover/Cover.tsx` (Ordner-Ansicht im Stil einer Notizen-App, App-Name „Berufsschulordner“, Ordner-Icon). Es sind **echte, lokal gespeicherte Notizen** (`src/cover/store.ts`, Schlüssel `nb.v1`): Ordner und Hefte anlegen, umbenennen, löschen, Text bearbeiten, suchen, sortieren, Papierstil. Startdaten stehen in `src/cover/notes.ts`.
- Zwei geheime Zugänge (`src/cover/Gate.tsx`): Einstellungen → „Ton“ ausschalten öffnet Chessty; Einstellungen → **fünfmal schnell auf „Version“ tippen** öffnet das Tipptraining. Die Freischaltung lebt nur im Arbeitsspeicher: Neuladen, zweimal Esc oder „Zu den Ordnern“ zeigt wieder die Notizen.
- Browser-Tests müssen erst entsperren (siehe `scripts/e2e-smoke.mjs`; Tipptraining: `scripts/e2e-typing.mjs`).

## Tipptraining (`src/typing/`, unabhängig von Chessty)
- Eigene App, lazy geladen aus dem Gate, Speicher `tp.v1` (localStorage, kein Server). Export/Import als JSON unter Einstellungen.
- **Design**: Apple-Stil mit „Liquid Glass“ (`typing.css`: Milchglas `.glass`, große Rundungen, Systemschrift, Hell/Dunkel/Auto, Wallpapers, Akzentfarben, Tab-Leiste am Handy). **Nur die Spiele** (`Games.tsx`, `RaceGame.tsx`, `Arcade.tsx`, Klassen `.wu-*` in `wiiu.css`) sind im Wii-U-Stil (weiß/cyan, glänzende Knöpfe, Miis, GamePad-Rahmen). Die globale Regel „keine runden Ecken“ aus `global.css` gilt für `.tp` und `.nb` nicht.
- **Nur echte Texte** beim Üben: Sätze und Absätze aus `corpus.ts` (keine Einzelbuchstaben-Drills, keine Wortlisten). Wörter einzeln nur im Spiel „Wort-Regen“.
- Dateien: `TypingApp.tsx` (Rahmen, Start), `TextRun.tsx` (Eingabe-Engine: WPM, Genauigkeit, Hardcore/Blind/Zen, Zeitlimit, `onProgress`/`locked` fürs Rennspiel), `Lessons.tsx` + `layouts.ts` (10 Stufen; Tastaturbelegungen nur für die Anzeige), `Train.tsx` (Sprint, Zitate, Code, Wikipedia, Tagestext; Schwachstellen), `RaceGame.tsx` (Tipp-Grand-Prix: Kart-Tempo = Tipptempo, Gegner passen sich an), `Duell.tsx`, `Rocket.tsx`, `Belt.tsx`, `Memory.tsx` (weitere Spiele, Bestwerte in `store.hi`), `Copy.tsx` (Abschreiben: Vorlage oben, eigenes Feld unten, Vergleich am Ende), `Pad.tsx` (GamePad-Rahmen), `polish.css`/`wiiu2.css` (Feinschliff, Spiele-Styles), `Texts.tsx`, `Cards.tsx`, `Dictation.tsx`, `Stats.tsx`, `Settings.tsx`, `gen.ts`, `corpus.ts`, `data.ts`, `store.ts`, `sound.ts`.
- Wikipedia-Zufall und Sprachausgabe sind in `Legal.tsx` (Datenschutz) erwähnt.

## Architektur
- **Stack**: Vite 8, React 19, TypeScript 7, `vite-plugin-pwa` (registerType `prompt` → Update-Hinweis), Hash-Routing (`src/lib/router.ts`, `#/pfad/arg`), Seiten per `React.lazy` in `src/App.tsx` (`page()`-Switch + `NAV`/`MORE`-Menüs).
- **Schach**: `chess.js` 1.4 (Regeln), `chessground` 9 (Brett, `src/components/Board.tsx`), Stockfish 19 lite single-thread als WASM in einem Web Worker (`public/engine/`, Wrapper `src/lib/engine.ts`, Hook `useEngine(fen, enabled, depth)`).
- **Ordner**
  - `src/pages/` – eine Datei pro Route; `src/pages/trainers/` – die 10 Trainer.
  - `src/components/` – Board (Chessground + Pfeile + Tastatur-Zugeingabe), MiniBoard (statisches SVG-Diagramm), Explain (3 Erklärtiefen, `Rich` = **fett**-Markdown), WrongMovePanel, AdminPanel, ErrorBoundary.
  - `src/content/` – alle Lerninhalte als TypeScript-Daten (siehe unten).
  - `src/lib/` – Logik: `progress.ts` (lokaler Fortschritt, XP/Serie/Herzen/Abzeichen via `useSyncExternalStore`, Key `chessty.progress.v1`), `game.ts` (Abzeichen, Tagesquests), `cloud.ts` (Supabase-RPCs), `accuracy.ts` (Lichess-Genauigkeitsformel), `explainMove.ts`/`wrongMove.ts` (Zugbewertung + Erklärungen), `puzzles.ts`, `openings.ts`, `tablebase.ts`, `admin.ts`, `forceMove.ts`.
  - `src/salon/` – Spielesalon (Dame, Mühle, Vier gewinnt, Reversi, Fünf in einer Reihe): Regeln je Spiel, gemeinsame Alpha-Beta-KI (`ai.ts`), Rahmen `Shell.tsx`; Seite `src/pages/Salon.tsx` (Route `#/salon`, nur über „Mehr“ verlinkt).
  - `src/variants/` – eigene Regel-Engine für Schachvarianten (`engine.ts`, beliebige Brettgröße: Feld = Reihe·Breite + Linie, Maße in `pos.w/pos.h`; Figuren-Gangarten in `BUILTIN` bzw. `rules.pieces`), KI (`ai.ts`, Alpha-Beta + Ruhesuche, läuft in `ai.worker.ts`), 10 Varianten (`list.ts`), SVG-Brett, Regel-Assistent (`assistant.ts`).
  - `public/data/` – `puzzles.json` (Lichess-Puzzle-Auszug, 30 Motive × 4 Stärken), `openings.json` (Lichess chess-openings, Namen in `src/lib/openingsDe.ts` übersetzt).
  - `scripts/` – Prüf- und Datenskripte; `data-src/` – Rohdaten für Puzzles/Meisterpartien.
  - `supabase/migrations/` – exaktes SQL des Servers (Stand der Live-Datenbank).

## Inhalte bearbeiten
- **Lektion**: Typ `Lesson` in `src/content/types.ts`. Lektionen liegen nach Kategorie in `src/content/lessons/*.ts` und werden in `src/content/index.ts` gesammelt. Schritte: `info` (Text + Pfeile) oder `move` (Aufgabe mit `solution` in SAN, erster = Hauptlösung; `mistakes` mit eigener Erklärung; `reply` = Gegenzug). Erklärungen immer als `{ short, why?, pro? }`.
- **Pfeil-Kurzschrift**: `"e2e4"` Pfeil, `"e4"` Kreis, `"!e2e4"` Fehler (grau gestrichelt), `"?e2e4"` Alternative.
- **Lektions-Übersicht**: `src/content/meta.ts` wird bei build/typecheck automatisch aus allen Lektionen erzeugt – nicht von Hand bearbeiten. Startseite/Lernpfad nutzen nur diese Übersicht.
- **Praxisteil**: Zuordnung Lektion → Puzzle-Motive/Ausspielen in `src/content/practicePlan.ts` (oder Feld `practice` in der Lektion).
- **Taktik aus echten Partien**: `src/content/lessons/partien.ts` wird von `scripts/build-puzzle-lessons.ts` aus `public/data/puzzles.json` erzeugt (Stellungen gespiegelt, Lernender spielt Weiß).
- **Eröffnungsfallen**: Daten in `src/content/traps.ts`; daraus entstehen je zwei Lektionen (`f-<id>` stellen, `fa-<id>` vermeiden).
- **Danach immer** `npm run validate -- <id>`: Der Validator prüft Legalität, dass Lösungen laut Stockfish gut und `mistakes` wirklich schlecht sind (`soft: true` für prinzipielle Fehler mit kleinem Engine-Unterschied) und Endspiele gegen die Tablebase.
- **Meisterpartien**: `src/content/masters.ts` (Texte) + `masters-moves.ts` (Züge). **Glossar**: `glossary.ts` + `glossaryFen.ts`. **Wissen**: `knowledge.ts`. **Endspiel-Praxis**: `practice.ts`. **Taktik-Motive**: `themes.ts`.
- Nur eigene Texte schreiben; Partienotationen sind gemeinfrei, Kommentare aus Büchern nicht.

## Backend (optional, kostenlos)
- Supabase-Projekt `chessty`, ID `ltrigzesyzpzpluzjtum`, Region eu-central-1 (Frankfurt). URL und Publishable Key stehen in `src/lib/cloud.ts` (öffentlich, das ist so gewollt).
- **Sicherheitsmodell**: Tabellen haben RLS ohne Policies und keine Rechte für `anon`. Zugriff nur über `SECURITY DEFINER`-Funktionen `chessty_*`, die den Sync-Code (`id.secret`, nur SHA-256-Hash gespeichert) per `_auth()` prüfen. Neue Funktionen: gleiches Muster, `set search_path`, `revoke all … from public`, dann gezielt `grant execute … to anon`.
- Änderungen als neue Datei in `supabase/migrations/` **und** per Supabase-MCP `apply_migration` einspielen; danach `get_advisors` (security) prüfen.
- Online-Partien: Realtime-Broadcast mit 6-s-Timeout, sonst Polling über `chessty_game_send/poll` (Nachrichten werden nach 2 Tagen gelöscht).
- Achtung: In derselben Datenbank existiert eine fremde Migration `kraftteller_schema` (nicht von Chessty). Nicht anfassen, Eigentümer fragen.

## Deploy
- Git-Branch: **`chessty-app`** (Remote `noahschaefer44-wq/berufsschulordner`, öffentlich wegen GPL, Standard-Branch). Push: `git push -u origin chessty-app`.
- **Live über GitHub Pages**: https://noahschaefer44-wq.github.io/berufsschulordner/ – jeder Push auf `chessty-app` baut und veröffentlicht automatisch (`.github/workflows/pages.yml`). Netlify war wegen aufgebrauchter Konto-Credits gesperrt.
- Netlify-Site-ID `51c9664c-6707-4908-8618-8434205b70c7` (Name „chessty“). Deploy über das Netlify-MCP: `netlify-deploy-services-updater` → `deploy-site` mit der Site-ID aufrufen, den zurückgegebenen `npx -y @netlify/mcp@latest … --proxy-path …`-Befehl im Repo-Ordner ausführen (baut auf Netlify mit `netlify.toml`). Danach `curl -s -o /dev/null -w "%{http_code}" https://chessty.netlify.app/` → 200.
- Commit-Nachrichten auf Deutsch; Attribution-Zeilen gemäß Sitzungsvorgabe anhängen.

## Testen im Browser
- Chromium liegt unter `/opt/pw-browsers/chromium`; Playwright im Scratchpad installieren (`npm i playwright@1`), nicht `playwright install`.
- Gegen `vite preview` (Port 4173) testen. Jede Playwright-Instanz hat ein frisches Profil, also keinen alten Service Worker.
- Brett-Züge per Maus: Koordinaten aus `cg-board`-BoundingBox berechnen; alternativ das unsichtbare Tastatur-Feld `.kbd-move input` fokussieren und z. B. `e4` + Enter tippen.
- Admin-Panel in Tests: `localStorage['chessty.admin'] = {"unlocked":true,"flags":{...},"tainted":true,"timeOffsetDays":0}` setzen und neu laden.

## Admin-Panel (`src/lib/admin.ts`, `src/components/AdminPanel.tsx`)
- Öffnen: Strg+Umschalt+Alt+A, Konami-Code oder 7× aufs Logo; Passphrase nur als SHA-256(`chessty-admin:` + Passphrase) im Code (Passphrase kennt der Eigentümer).
- Neue Test-Flags in `FLAGS` eintragen (Gruppe Spiel/Optik/Debug); Optik-Flags wirken als CSS-Klasse `adm-<flag>` auf `<html>`. Seiten melden Aktionen mit `registerAdminActions(scope, [...])` (siehe `Play.tsx`).
- Der Eigentümer will vollen Zugriff: **kein Testmodus**, keine Server-Sperre (`serverBlocked()` ist immer false). `taint()` sichert vor dem ersten Eingriff nur still den Fortschritt (im Panel wiederherstellbar). Seiten melden Aktionen mit `registerAdminActions`.

## Stolperfallen
- Chessground cached Brettmaße: vor jedem Pointer-Down `api.state.dom.bounds.clear()` (ist in `Board.tsx`). CSS-Transforms auf Vorfahren des Bretts (Kippen/Skalieren) zerstören die Figurenpositionen – deshalb wirkt das 3D-Flag nur auf SVG-Bretter.
- Engine-Ergebnisse immer gegen die aktuelle FEN prüfen (`useEngine` liefert nur passende Linien); veraltete PVs auf neue Stellungen anwenden hat früher Abstürze verursacht. `uciToSan` ist absturzsicher.
- `chess.js` wirft bei illegalen Zügen → immer `tryMove()` aus `src/lib/chess.ts` benutzen.
- Neue Speicher-Keys mit Präfix `chessty.` und Zugriff über `src/lib/storage.ts` (try/catch für privaten Modus); dann auch in Legal → „Cookies & Speicher“ aufführen.
- Nie `pkill -f <muster>` in der Shell verwenden (trifft die eigene Shell).
- `tsconfig.tsbuildinfo` und `dist/` sind gitignored.
- Barrierefreiheit beibehalten: Eingabefelder brauchen `aria-label`, Icon-Buttons ein Label, Text-Kontrast mind. `--g5`.
