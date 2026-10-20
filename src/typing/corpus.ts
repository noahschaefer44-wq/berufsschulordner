// Übungstexte: ausschließlich zusammenhängende Sätze und Absätze (keine einzelnen Buchstaben oder Wortlisten).
// Alles ist auf einer deutschen Tastatur ohne Sonderbelegung tippbar (gerade Anführungszeichen, normaler Bindestrich).

export interface Pool { id: string; name: string; info: string; texts: string[] }

const KURZ = [
  'Die Sonne scheint am Morgen.', 'Wir gehen heute in die Stadt.', 'Der Zug kommt in zehn Minuten.', 'Ich lese ein gutes Buch.',
  'Das Wasser im See ist klar.', 'Mein Bruder spielt Gitarre.', 'Am Abend kocht Anna Reis.', 'Der Kaffee riecht sehr gut.',
  'Im Garten wachsen viele Blumen.', 'Wir warten auf den Bus.', 'Die Katze sitzt am Fenster.', 'Heute lerne ich schnell tippen.',
  'Der Himmel ist blau und weit.', 'Er malt ein Bild mit Farben.', 'Die Tasse steht auf dem Tisch.', 'Nach dem Essen gehen wir spazieren.',
];

const LANG = [
  'Wenn die Sonne untergeht, wird der Himmel rot, orange und manchmal sogar violett.',
  'Beim Tippen kommt es nicht nur auf Tempo an, sondern vor allem auf einen ruhigen Rhythmus.',
  'Anna kauft Brot, Milch und Eier, bevor sie mit dem Rad nach Hause fährt.',
  'Obwohl es regnet, gehen die Kinder raus, weil sie in den Pfützen spielen wollen.',
  'Wer jeden Tag zehn Minuten übt, wird nach einigen Wochen merklich schneller schreiben.',
  'Der Bus kommt pünktlich, doch die Straße ist voll, und alle Fahrgäste sind müde.',
  'Zuerst wäscht er das Obst, dann schneidet er es klein und gibt es in eine große Schale.',
  'In der Pause sitzen wir im Hof, trinken Saft, essen Kekse und planen das Wochenende.',
  'Mit etwas Geduld, einer guten Haltung und lockeren Händen gelingt fast jede Übung.',
  'Der alte Leuchtturm steht seit vielen Jahren am Rand der Klippen, und jeden Abend geht sein Licht an.',
  'Sie packt ihren Rucksack, nimmt eine Flasche Wasser mit und macht sich auf den Weg in die Berge.',
  'Weil der Zug Verspätung hatte, kam er zu spät, aber das Treffen hatte noch nicht begonnen.',
];

const SATZ = [
  'Wie spät ist es eigentlich?', 'Achtung! Der Boden ist nass.', 'Kommst du heute Abend mit, oder bleibst du lieber zu Hause?',
  'Er sagte: "Ich bin gleich da!" - und kam doch zu spät.', 'Auf dem Tisch lagen Äpfel, Birnen, Nüsse (frisch geerntet) und Brot.',
  'Warum ist der Himmel blau? Weil Licht gestreut wird; kurze Wellenlängen sieht man stärker.',
  '"Hallo!", rief Lena. "Hast du Zeit?" "Leider nicht", antwortete Tom, "aber morgen gern."',
  'Bitte beachten: Der Eingang ist links (nicht rechts), und die Tür klemmt manchmal.',
  'Das ist wichtig: Erst denken, dann tippen; erst lesen, dann antworten.',
  'Drei Dinge brauche ich heute: Kaffee, Ruhe und ein gutes Lied!',
  'Wirklich? Ja, wirklich! Na dann: viel Erfolg...',
  'Sie fragte leise: "Wo ist mein Schlüssel?" Niemand wusste es.',
];

const ZAHLEN = [
  'Das Brot kostet 2,49 Euro, die Butter 1,99 Euro und der Käse 3,79 Euro.',
  'Am 24.12.2026 öffnet das Geschäft um 9:00 Uhr und schließt um 14:30 Uhr.',
  'Die Rechnung Nr. 20458 über 1.250,00 Euro ist bis zum 30.11. zu begleichen.',
  'Im Jahr 2025 besuchten rund 48.000 Gäste die Ausstellung, 2026 waren es schon 52.300.',
  'Der Zug 1583 fährt um 7:42 Uhr auf Gleis 5 ab und kommt um 10:15 Uhr in München an.',
  'Zehn Prozent von 450 sind 45, und fünfzehn Prozent von 80 sind genau 12.',
  'Das Lager hat 3 Hallen mit je 1.200 Quadratmetern und 85 Regalen mit 6 Ebenen.',
  'Bestellung 7731: 12 Stück zu 4,50 Euro, 8 Stück zu 6,25 Euro, zusammen 104,00 Euro.',
  'Seine Telefonnummer endet auf 4 7 1 1, und sein Geburtstag ist der 03.09.2004.',
  'Von 100 Teilnehmern bestanden 87 die Prüfung, das sind 87 Prozent.',
];

const UMLAUT = [
  'Müde Mädchen möchten schöne Träume über große Wälder und grüne Täler haben.',
  'Für das Frühstück brauchen wir Brötchen, Käse, Äpfel und frische Milch.',
  'Der Bäcker hört früh am Morgen den Wecker und bäckt Brötchen für die ganze Straße.',
  'Über die Brücke führt ein schmaler Weg, der im Herbst unter bunten Blättern verschwindet.',
  'Natürlich müssen wir unsere Gäste herzlich begrüßen und ihnen etwas zu essen anbieten.',
  'Die Größe des Zimmers überrascht jeden, der durch die schwere Tür tritt.',
  'Weiß, grün, süß und mächtig: Die Königin liebte die Süßigkeiten ihrer Köchin.',
  'Wir müssen heute früh aufstehen, weil der Zug schon um fünf Uhr abfährt.',
  'Öl, Äpfel und Würstchen stehen auf der Einkaufsliste für das Straßenfest.',
  'Der Jäger lüftete seinen Hut, grüßte die Müllerin und ging über die Wiese zurück.',
];

const SONDER = [
  'Schreib mir bitte an max.muster@beispiel.de oder ruf unter 0151 / 234 5678 an.',
  'Der Rabatt beträgt 15 % auf alles, außer Bücher (nur 5 %) - Preis ab 9,99 EUR.',
  'Ich habe a + b = c gerechnet und bekam 25 * 4 = 100 heraus, also (3 + 2) * 20.',
  'Unser Kürzel lautet R&D, die Seite heißt www.beispiel-shop.de/angebote und das Thema #lernen.',
  'Das Passwort "Sommer#2026!" ist zu einfach; besser sind Sätze wie "Mein_Hund=Bello@Park".',
  'Bestellt wurden 5 x Kabel (2 m), 3 x Adapter [USB-C] und 1 x Ladegerät {65 W}.',
  'In der Tabelle steht: Soll 1.200 EUR / Ist 1.150 EUR = Abweichung von -50 EUR (4,2 %).',
  'Datei speichern unter: C:\\Berichte\\2026\\Bericht_01.txt - oder per E-Mail an info@firma.de.',
];

const ABSATZ = [
  'Ein gutes Tipptraining beginnt mit einer ruhigen Haltung. Die Handgelenke schweben leicht über der Tastatur, die Schultern bleiben locker. Wer den Bildschirm im Blick behält, statt auf die Tasten zu schauen, wird mit der Zeit immer sicherer.',
  'Am Samstag fahren wir mit dem Zug ans Meer. Wir nehmen Brote, Obst und eine große Decke mit. Am Strand suchen wir Muscheln, bauen eine Burg aus Sand und schauen den Schiffen hinterher.',
  'Der Wald ist im Herbst besonders schön. Die Blätter färben sich gelb, rot und braun, und der Boden riecht nach Moos und feuchter Erde. Manchmal huscht ein Eichhörnchen über den Weg und verschwindet im Geäst.',
  'Lernen funktioniert am besten in kleinen Schritten. Wer täglich ein wenig übt, behält mehr als jemand, der einmal stundenlang paukt. Pausen sind dabei kein Zeitverlust, sondern helfen dem Gehirn, Neues zu festigen.',
  'Die Bibliothek ist ein ruhiger Ort mit hohen Regalen und weichen Sesseln. Zwischen den Büchern liegt der Duft von altem Papier. Wer hier eine Stunde liest, vergisst schnell, wie laut die Welt draußen sein kann.',
  'Im Sommer verwandelt sich der Marktplatz in ein buntes Fest. Es gibt frisches Gemüse, duftende Blumen, Honig aus der Region und Musik von einer kleinen Band. Kinder laufen zwischen den Ständen umher und probieren Kirschen.',
];

const FACH = [
  'Das Handelsregister enthält wichtige Angaben über Kaufleute, zum Beispiel Firma, Sitz, Geschäftsführer und Haftungsverhältnisse.',
  'Bei der Zuschlagskalkulation werden die Einzelkosten um Gemeinkostenzuschläge erhöht, bis die Selbstkosten und schließlich der Verkaufspreis feststehen.',
  'Ein Kaufvertrag kommt durch zwei übereinstimmende Willenserklärungen zustande: den Antrag und die Annahme.',
  'Die Sozialversicherung besteht aus Kranken-, Pflege-, Renten-, Arbeitslosen- und Unfallversicherung; die Beiträge teilen sich Arbeitgeber und Beschäftigte.',
  'Eine Mahnung ist zulässig, wenn der Kunde trotz Fälligkeit nicht gezahlt hat; nach der dritten Mahnung droht oft das gerichtliche Mahnverfahren.',
  'Der Betriebsrat vertritt die Interessen der Belegschaft und hat unter anderem Mitbestimmungsrechte bei Arbeitszeit, Urlaub und Einstellungen.',
  'Die Inventur dient dazu, alle Vermögenswerte und Schulden zu einem bestimmten Stichtag mengen- und wertmäßig zu erfassen.',
  'Beim Skonto gewährt der Lieferant einen Preisnachlass, wenn die Rechnung innerhalb einer kurzen Frist bezahlt wird, zum Beispiel 2 % bei Zahlung in 10 Tagen.',
  'Datensicherung bedeutet, wichtige Dateien regelmäßig zu kopieren, damit sie nach einem Ausfall oder Angriff wiederhergestellt werden können.',
  'Das Berichtsheft dokumentiert die Ausbildung und ist eine Voraussetzung für die Zulassung zur Abschlussprüfung.',
];

const NATUR = [
  'Bienen sammeln Nektar und Pollen, bestäuben dabei unzählige Pflanzen und produzieren nebenbei Honig, den wir gern essen.',
  'Der Mond braucht rund 27 Tage, um die Erde einmal zu umrunden, und zeigt uns dabei immer dieselbe Seite.',
  'Wasser kann als Eis, als Flüssigkeit und als Dampf vorkommen, und alle drei Zustände findet man in der Natur.',
  'Ein Regenbogen entsteht, wenn Sonnenlicht in Regentropfen gebrochen und zurückgeworfen wird, sodass sich die Farben auffächern.',
  'Bäume nehmen Kohlendioxid auf und geben Sauerstoff ab; ein einzelner großer Baum versorgt mehrere Menschen mit Luft zum Atmen.',
  'Im Meer leben Millionen verschiedener Arten, von winzigen Algen bis zum Blauwal, dem größten Tier, das je auf der Erde gelebt hat.',
  'Vulkane entstehen dort, wo heißes Gestein aus dem Erdinneren nach oben steigt und durch Spalten an die Oberfläche gelangt.',
  'Zugvögel orientieren sich am Magnetfeld der Erde, an den Sternen und an markanten Landschaften, wenn sie im Herbst nach Süden fliegen.',
];

const TECHNIK = [
  'Ein Computer verarbeitet Daten in Form von Nullen und Einsen und führt Befehle in unglaublicher Geschwindigkeit nacheinander aus.',
  'Ein starkes Passwort ist lang, enthält verschiedene Zeichen und wird nicht für mehrere Konten gleichzeitig verwendet.',
  'Das Internet verbindet Millionen von Rechnern weltweit; Webseiten werden über Adressen abgerufen und vom Browser dargestellt.',
  'Mit einer Tabellenkalkulation lassen sich Zahlen sortieren, summieren und in anschaulichen Diagrammen darstellen.',
  'Ein Algorithmus ist eine genaue Schrittfolge, mit der sich eine Aufgabe lösen lässt, zum Beispiel das Sortieren einer Liste.',
  'Regelmäßige Updates schließen Sicherheitslücken, deshalb sollte man Betriebssystem und Programme aktuell halten.',
  'In einer Datenbank werden Informationen in Tabellen gespeichert, die über Schlüssel miteinander verknüpft sind.',
  'Cloud-Speicher legt Dateien auf entfernten Servern ab, sodass man von verschiedenen Geräten darauf zugreifen kann.',
];

const KULTUR = [
  'Die Erfindung des Buchdrucks mit beweglichen Lettern durch Johannes Gutenberg um 1450 machte Wissen für viele Menschen zugänglich.',
  'Das Brandenburger Tor in Berlin wurde Ende des 18. Jahrhunderts erbaut und ist heute ein Symbol für Einheit und Freiheit.',
  'Ludwig van Beethoven wurde 1770 in Bonn geboren und komponierte neun Sinfonien, obwohl er später fast taub war.',
  'Die Schreibmaschine veränderte im 19. Jahrhundert die Arbeit in Büros, weil Briefe plötzlich schnell und gut lesbar geschrieben werden konnten.',
  'Märchen wie Hänsel und Gretel oder Rotkäppchen wurden von den Brüdern Grimm gesammelt und weltweit bekannt gemacht.',
  'Die Olympischen Spiele der Neuzeit finden seit 1896 statt, und die Idee dazu stammt aus dem antiken Griechenland.',
  'Der Rhein ist einer der wichtigsten Flüsse Europas und fließt von den Alpen bis zur Nordsee durch mehrere Länder.',
  'Im Mittelalter schrieben Mönche Bücher noch von Hand ab, und ein einziges Werk konnte dabei viele Monate dauern.',
];

const ENGLISH = [
  'The quick brown fox jumps over the lazy dog.', 'Practice makes perfect, but patience makes it fun.',
  'Dear Sir or Madam, we would like to place an order for 250 units of your latest model.',
  'Please send us the invoice by Friday at 12 noon, and we will transfer the amount immediately.',
  'Typing fast is easy when you stay relaxed, keep your eyes on the screen and find a steady rhythm.',
  'Yours sincerely, Mr Smith, Head of Purchasing, Smith & Sons Ltd.',
  'A good letter is short, polite and clear, and it ends with a friendly request for a quick reply.',
  'The meeting has been moved to Thursday at 10 a.m., so please bring the report and the new price list.',
  'On a sunny afternoon in July, we walked along the river, shared an ice cream and talked about our plans.',
  'If you have any questions about the delivery, do not hesitate to contact our customer service team.',
];

const MEISTER = [
  'Wer schnell schreiben will, muss zuerst lernen, langsam und sauber zu arbeiten. Jeder Fehler, der sich einschleicht, kostet mehr Zeit als der Gewinn durch hastige Anschläge. Mit der Zeit wird aus der bewussten Bewegung eine Gewohnheit, und der Kopf hat plötzlich Platz für den Inhalt des Textes statt für die Suche nach der nächsten Taste.',
  'Als der Morgen graute, lag die Stadt noch in einem sanften Nebel. Die ersten Lieferwagen rollten durch die leeren Straßen, und in den Bäckereien brannte schon Licht. Wer um diese Uhrzeit unterwegs war, hörte nur das leise Brummen der Motoren und das ferne Klappern der Rollläden, die langsam nach oben fuhren.',
  'Ein Unternehmen lebt von der Zusammenarbeit seiner Abteilungen. Der Einkauf besorgt Material zu guten Preisen, das Lager sorgt für Ordnung und Verfügbarkeit, der Vertrieb pflegt die Kundenkontakte, und die Buchhaltung behält den Überblick über Einnahmen und Ausgaben. Nur wenn alle Rädchen ineinandergreifen, läuft der Betrieb reibungslos.',
  'Die Entdeckung neuer Länder war für Seefahrer stets ein Wagnis. Sie wussten nicht, welche Stürme sie erwarteten, wie lange die Vorräte reichen würden oder ob es überhaupt Land hinter dem Horizont gab. Und doch brachen sie auf, getrieben von Neugier, Mut und der Hoffnung auf ein besseres Leben.',
];

export const POOLS: Pool[] = [
  { id: 'kurz', name: 'Kurze Sätze', info: 'Einfache Sätze mit Punkt – zum Einfinden.', texts: KURZ },
  { id: 'lang', name: 'Längere Sätze', info: 'Sätze mit Kommas und Nebensätzen.', texts: LANG },
  { id: 'satz', name: 'Satzzeichen', info: 'Fragen, Ausrufe, Klammern und Anführungszeichen.', texts: SATZ },
  { id: 'zahlen', name: 'Zahlen & Preise', info: 'Uhrzeiten, Daten, Beträge und Rechnungen.', texts: ZAHLEN },
  { id: 'umlaut', name: 'Umlaute & ß', info: 'Texte mit ä, ö, ü und ß.', texts: UMLAUT },
  { id: 'sonder', name: 'Sonderzeichen', info: 'E-Mail, Prozent, Klammern, Rechenzeichen, Pfade.', texts: SONDER },
  { id: 'absatz', name: 'Absätze', info: 'Zusammenhängende Mini-Texte.', texts: ABSATZ },
  { id: 'fach', name: 'Beruf & Büro', info: 'Fachtexte aus Wirtschaft, Büro und Verwaltung.', texts: FACH },
  { id: 'natur', name: 'Natur & Wissen', info: 'Kurze Sachtexte über Natur und Wissenschaft.', texts: NATUR },
  { id: 'technik', name: 'Technik & IT', info: 'Computer, Internet und Datenschutz.', texts: TECHNIK },
  { id: 'kultur', name: 'Geschichte & Kultur', info: 'Menschen, Orte und Ereignisse.', texts: KULTUR },
  { id: 'englisch', name: 'Englisch', info: 'English sentences for business and daily life.', texts: ENGLISH },
  { id: 'meister', name: 'Lange Absätze', info: 'Ausdauer: längere Absätze am Stück.', texts: MEISTER },
];
export const poolById = (id: string) => POOLS.find((p) => p.id === id);
export const ALL_TEXTS = POOLS.flatMap((p) => p.texts);
