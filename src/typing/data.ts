// Übungsmaterial für das Tipptraining: Wortlisten, Sätze, Zitate, Code, Lernkarten.

const w = (s: string) => s.split(/\s+/).filter(Boolean);

export const WORDS_DE = w(`
und der die das ist nicht ein eine zu mit den von sie auch auf für als an er es dem im ich wir ihr aber wie nach noch wenn nur schon
oder mehr kann haben sein wird werden hier dann doch immer alle viel sehr gut neu groß klein lang kurz alt jung hoch tief schnell
langsam Haus Tisch Stuhl Fenster Tür Wasser Brot Milch Kaffee Tee Apfel Birne Wald Baum Blume Garten Straße Auto Zug Bus Fahrrad
Schule Lehrer Schüler Buch Heft Stift Papier Computer Tastatur Maus Bildschirm Handy Telefon Brief Nachricht Zeit Tag Woche Monat Jahr
Morgen Mittag Abend Nacht Sonne Mond Stern Wolke Regen Schnee Wind Sturm Meer See Fluss Berg Tal Stadt Dorf Land Welt Mensch Kind
Mutter Vater Bruder Schwester Freund Arbeit Beruf Chef Kollege Kunde Firma Büro Lager Ware Preis Rechnung Vertrag Angebot Bestellung
Lieferung Zahlung Konto Bank Geld Euro Cent Steuer Gehalt Urlaub Pause Termin Aufgabe Ziel Plan Idee Frage Antwort Problem Lösung
Fehler Erfolg Glück Freude Ruhe Kraft Mut Geduld Übung Training Tempo Rhythmus Genauigkeit Konzentration Gedächtnis Wissen Lernen
laufen gehen kommen sehen hören sagen machen geben nehmen finden denken fragen lesen schreiben tippen spielen arbeiten leben lieben
helfen warten fahren fliegen schwimmen kochen essen trinken schlafen träumen lachen weinen singen tanzen bauen öffnen schließen
müssen sollen dürfen wollen können möchten brauchen bleiben stehen sitzen liegen heute gestern morgen jetzt bald gleich oft selten
manchmal nie immer überall nirgends vielleicht natürlich eigentlich besonders zusammen allein draußen drinnen oben unten links rechts
Käse Bäcker Äpfel Möbel Mädchen Bücher Gemüse Süßigkeiten Größe Straße Fuß Gruß Spaß Maß weiß heiß schön hören müde fröhlich für über
`);

export const WORDS_EN = w(`
the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all
would there their what so up out if about who get which go me when make can like time no just him know take people into year your good
some could them see other than then now look only come its over think also back after use two how our work first well way even new
want because any these give day most us house water music light world school never little again under every story always together
keyboard computer screen window mouse typing speed practice learn study office invoice order delivery payment customer supplier
warehouse company manager meeting project deadline report email letter answer question problem solution quick brown fox jumps lazy dog
`);

export const WORDS_FACH = w(`
Bilanz Inventur Kalkulation Skonto Rabatt Umsatzsteuer Vorsteuer Gewinn Verlust Eigenkapital Fremdkapital Abschreibung Buchführung
Kaufvertrag Lieferschein Mahnung Kündigung Probezeit Tarifvertrag Betriebsrat Sozialversicherung Berufsgenossenschaft Ausbildungsvertrag
Berichtsheft Zwischenprüfung Abschlussprüfung Berufsschule Lernfeld Handelsregister Geschäftsführer Gesellschafter Aktiengesellschaft
Wirtschaftlichkeit Produktivität Rentabilität Liquidität Zahlungsziel Rechnungsprüfung Wareneingang Warenausgang Lagerkennzahl
Datenschutz Datensicherung Netzwerk Betriebssystem Arbeitsspeicher Festplatte Prozessor Benutzerkonto Passwort Verschlüsselung
Tabellenkalkulation Textverarbeitung Präsentation Datenbank Schnittstelle Programmierung Algorithmus Variable Schleife Funktion
`);

export const WORDS_CODE = w(`
function return const let var if else for while switch case break continue class import export default async await try catch throw
new this null undefined true false typeof array object string number boolean map filter reduce forEach push pop shift split join
def self print range len list dict tuple lambda yield with as in not and or is pass raise except finally
SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE JOIN LEFT INNER GROUP BY ORDER HAVING LIMIT CREATE TABLE PRIMARY KEY
div span href src class style margin padding border display flex grid color background width height font position relative absolute
git commit push pull merge branch checkout status clone rebase stash npm install build test deploy
`);

export interface Quote { text: string; by: string }
export const QUOTES: Quote[] = [
  { text: 'Der Mensch ist nur da ganz Mensch, wo er spielt.', by: 'Friedrich Schiller' },
  { text: 'Man sieht nur mit dem Herzen gut. Das Wesentliche ist für die Augen unsichtbar.', by: 'Antoine de Saint-Exupéry' },
  { text: 'Habe Mut, dich deines eigenen Verstandes zu bedienen!', by: 'Immanuel Kant' },
  { text: 'Wer immer tut, was er schon kann, bleibt immer das, was er schon ist.', by: 'Henry Ford' },
  { text: 'Es ist nicht genug zu wissen, man muss auch anwenden; es ist nicht genug zu wollen, man muss auch tun.', by: 'Johann Wolfgang von Goethe' },
  { text: 'Die beste Art, die Zukunft vorauszusagen, ist, sie zu gestalten.', by: 'Willy Brandt' },
  { text: 'Nichts ist so beständig wie der Wandel.', by: 'Heraklit' },
  { text: 'Ich weiß, dass ich nichts weiß.', by: 'Sokrates' },
  { text: 'Der Weg ist das Ziel.', by: 'Konfuzius' },
  { text: 'Wer Fehler macht, hat zumindest etwas versucht.', by: 'Sprichwort' },
  { text: 'Phantasie ist wichtiger als Wissen, denn Wissen ist begrenzt.', by: 'Albert Einstein' },
  { text: 'Was man nicht messen kann, kann man nicht verbessern.', by: 'Peter Drucker' },
  { text: 'Geduld ist bitter, aber ihre Frucht ist süß.', by: 'Jean-Jacques Rousseau' },
  { text: 'Wer A sagt, muss nicht B sagen. Er kann auch erkennen, dass A falsch war.', by: 'Bertolt Brecht' },
  { text: 'Das Leben ist wie Fahrradfahren. Um die Balance zu halten, musst du in Bewegung bleiben.', by: 'Albert Einstein' },
  { text: 'Eile mit Weile.', by: 'Sprichwort' },
  { text: 'Aller Anfang ist schwer.', by: 'Sprichwort' },
  { text: 'Wer will, findet Wege. Wer nicht will, findet Gründe.', by: 'Sprichwort' },
  { text: 'Not all those who wander are lost.', by: 'J. R. R. Tolkien' },
  { text: 'The only way to do great work is to love what you do.', by: 'Steve Jobs' },
];

export interface Snippet { lang: string; title: string; code: string }
export const SNIPPETS: Snippet[] = [
  { lang: 'HTML', title: 'Grundgerüst', code: '<!DOCTYPE html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<title>Titel</title>\n</head>\n<body>\n<h1>Hallo Welt</h1>\n</body>\n</html>' },
  { lang: 'HTML', title: 'Liste & Link', code: '<ul>\n<li><a href="https://example.com">Beispiel</a></li>\n<li class="aktiv">Zweiter Punkt</li>\n</ul>' },
  { lang: 'CSS', title: 'Flexbox', code: '.box {\ndisplay: flex;\ngap: 12px;\nalign-items: center;\nbackground: #222;\ncolor: #fff;\n}' },
  { lang: 'JavaScript', title: 'Funktion', code: 'function summe(a, b) {\nreturn a + b;\n}\nconsole.log(summe(2, 3));' },
  { lang: 'JavaScript', title: 'Array', code: 'const zahlen = [1, 2, 3, 4];\nconst doppelt = zahlen.map((n) => n * 2);\nconst gross = doppelt.filter((n) => n > 4);' },
  { lang: 'JavaScript', title: 'Fetch', code: 'const res = await fetch("/api/daten");\nif (!res.ok) throw new Error("Fehler");\nconst json = await res.json();' },
  { lang: 'Python', title: 'Schleife', code: 'for i in range(1, 11):\nif i % 2 == 0:\nprint(f"{i} ist gerade")' },
  { lang: 'Python', title: 'Dictionary', code: 'preise = {"Apfel": 0.5, "Brot": 2.8}\nfor name, preis in preise.items():\nprint(name, preis)' },
  { lang: 'SQL', title: 'Abfrage', code: 'SELECT name, SUM(betrag) AS summe\nFROM rechnungen\nWHERE jahr = 2026\nGROUP BY name\nORDER BY summe DESC;' },
  { lang: 'SQL', title: 'Tabelle', code: 'CREATE TABLE kunden (\nid INTEGER PRIMARY KEY,\nname TEXT NOT NULL,\nort TEXT\n);' },
  { lang: 'Shell', title: 'Git', code: 'git add .\ngit commit -m "Neue Funktion"\ngit push origin main' },
  { lang: 'Excel', title: 'Formeln', code: '=SUMME(B2:B20)\n=WENN(C2>100;"ja";"nein")\n=SVERWEIS(A2;Tabelle1!A:C;3;FALSCH)' },
];

export interface CardDef { q: string; a: string }
export const DEFAULT_DECKS: { name: string; cards: CardDef[] }[] = [
  { name: 'Englisch – Büro', cards: [
    { q: 'Rechnung', a: 'invoice' }, { q: 'Lieferschein', a: 'delivery note' }, { q: 'Bestellung aufgeben', a: 'to place an order' },
    { q: 'Reklamation', a: 'complaint' }, { q: 'Lager', a: 'warehouse' }, { q: 'Angebot', a: 'offer' },
    { q: 'Lieferant', a: 'supplier' }, { q: 'Kunde', a: 'customer' }, { q: 'Termin', a: 'appointment' }, { q: 'Frist', a: 'deadline' },
  ] },
  { name: 'Wirtschaft – Begriffe', cards: [
    { q: 'Wie heißt die Mehrwertsteuer in der Buchführung?', a: 'Umsatzsteuer' },
    { q: 'Wie lang darf die Probezeit höchstens sein (Monate)?', a: '6' },
    { q: 'Welche Versicherung zahlt nur der Arbeitgeber?', a: 'Unfallversicherung' },
    { q: 'Selbstkosten + Gewinn =', a: 'Barverkaufspreis' },
    { q: 'Wie heißt die Verhandlungsfreiheit der Tarifparteien?', a: 'Tarifautonomie' },
    { q: 'Prozentwert = Grundwert mal Prozentsatz durch ...', a: '100' },
  ] },
  { name: 'Tastatur – Kürzel', cards: [
    { q: 'Kopieren (Windows)', a: 'Strg+C' }, { q: 'Einfügen (Windows)', a: 'Strg+V' }, { q: 'Rückgängig (Windows)', a: 'Strg+Z' },
    { q: 'Alles markieren (Windows)', a: 'Strg+A' }, { q: 'Fenster wechseln (Windows)', a: 'Alt+Tab' }, { q: 'Suchen (Windows)', a: 'Strg+F' },
  ] },
];
