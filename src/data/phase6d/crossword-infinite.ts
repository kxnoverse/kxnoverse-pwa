export type CrosswordDifficulty = "easy" | "medium" | "hard" | "expert";
export type CrosswordDirection = "across" | "down";

interface WordClue {
  word: string;
  clue: string;
  tier: 1 | 2 | 3 | 4;
}

export interface CrosswordEntry {
  id: string;
  number: number;
  row: number;
  column: number;
  direction: CrosswordDirection;
  answer: string;
  clue: string;
  tier: 1 | 2 | 3 | 4;
}

export interface CrosswordCell {
  letter: string;
  number?: number;
  across?: string;
  down?: string;
}

export interface CrosswordPuzzle {
  version: 1;
  seed: number;
  difficulty: CrosswordDifficulty;
  rows: number;
  columns: number;
  entries: CrosswordEntry[];
  cells: Record<string, CrosswordCell>;
  fingerprint: string;
}

export interface CrosswordSession {
  puzzle: CrosswordPuzzle;
  letters: Record<string, string>;
  mistakes: number;
  hints: number;
  startedAt: number;
  completedAt: number | null;
}

export interface CrosswordStats {
  completed: number;
  bestSeconds: number | null;
  totalMistakes: number;
  totalHints: number;
}

interface PlacedWord extends WordClue {
  row: number;
  column: number;
  direction: CrosswordDirection;
}

interface OccupiedCell {
  letter: string;
  across?: string;
  down?: string;
}

function normalizeAnswer(word: string): string {
  return word.toUpperCase()
    .replaceAll("Ä", "AE")
    .replaceAll("Ö", "OE")
    .replaceAll("Ü", "UE")
    .replaceAll("ß", "SS");
}

const WORDS: WordClue[] = ([
  { word: "ABEND", clue: "Tageszeit nach dem Nachmittag", tier: 1 },
  { word: "ADLER", clue: "Großer Greifvogel mit Hakenschnabel", tier: 1 },
  { word: "AMPEL", clue: "Regelt den Verkehr mit drei Farben", tier: 1 },
  { word: "APFEL", clue: "Runde Frucht, oft rot oder grün", tier: 1 },
  { word: "ARM", clue: "Körperteil zwischen Schulter und Hand", tier: 1 },
  { word: "AST", clue: "Seitlicher Teil eines Baumes", tier: 1 },
  { word: "AUTO", clue: "Fahrzeug mit vier Rädern", tier: 1 },
  { word: "BALL", clue: "Rundes Spielgerät", tier: 1 },
  { word: "BAUM", clue: "Pflanze mit Stamm und Krone", tier: 1 },
  { word: "BEIN", clue: "Körperteil zum Stehen und Gehen", tier: 1 },
  { word: "BERG", clue: "Hohe Erhebung in der Landschaft", tier: 1 },
  { word: "BILD", clue: "Gemalte oder fotografierte Darstellung", tier: 1 },
  { word: "BIRNE", clue: "Süße Frucht mit schmalem oberen Ende", tier: 1 },
  { word: "BLATT", clue: "Grüner Pflanzenteil oder einzelne Papierseite", tier: 1 },
  { word: "BLUME", clue: "Pflanze mit auffälliger Blüte", tier: 1 },
  { word: "BOOT", clue: "Wasserfahrzeug", tier: 1 },
  { word: "BROT", clue: "Gebackenes Grundnahrungsmittel aus Mehl", tier: 1 },
  { word: "BUCH", clue: "Gebundene Sammlung bedruckter Seiten", tier: 1 },
  { word: "BURG", clue: "Befestigtes Gebäude aus vergangenen Zeiten", tier: 1 },
  { word: "DACH", clue: "Oberer Schutz eines Hauses", tier: 1 },
  { word: "DORF", clue: "Kleine Ortschaft auf dem Land", tier: 1 },
  { word: "EIS", clue: "Gefrorenes Wasser oder kalte Süßspeise", tier: 1 },
  { word: "ELFE", clue: "Wesen aus Sagen mit Zauberkräften", tier: 1 },
  { word: "ERDE", clue: "Boden unter unseren Füßen und unser Planet", tier: 1 },
  { word: "FADEN", clue: "Dünnes Garn zum Nähen", tier: 1 },
  { word: "FALKE", clue: "Schneller Greifvogel", tier: 1 },
  { word: "FARBE", clue: "Eigenschaft, die Rot von Blau unterscheidet", tier: 1 },
  { word: "FELD", clue: "Landwirtschaftliche Fläche", tier: 1 },
  { word: "FEST", clue: "Feier mit Gästen und Programm", tier: 1 },
  { word: "FISCH", clue: "Wassertier mit Kiemen und Flossen", tier: 1 },
  { word: "FLUSS", clue: "Natürliches Gewässer, das zur Mündung fließt", tier: 1 },
  { word: "FORM", clue: "Äußere Gestalt eines Gegenstands", tier: 1 },
  { word: "FUCHS", clue: "Rotbraunes Tier mit buschigem Schwanz", tier: 1 },
  { word: "GABEL", clue: "Besteck mit mehreren Zinken", tier: 1 },
  { word: "GARTEN", clue: "Bepflanzte Fläche am Haus", tier: 1 },
  { word: "GAS", clue: "Aggregatzustand ohne feste Gestalt", tier: 1 },
  { word: "GAST", clue: "Eingeladene Person", tier: 1 },
  { word: "GEBURT", clue: "Beginn eines neuen Lebens", tier: 1 },
  { word: "GELD", clue: "Zahlungsmittel für Waren und Dienste", tier: 1 },
  { word: "GLAS", clue: "Durchsichtiger Werkstoff und Trinkgefäß", tier: 1 },
  { word: "GLOCKE", clue: "Läutet, wenn man ihren Klöppel bewegt", tier: 1 },
  { word: "GRAS", clue: "Grüne Pflanze auf einer Wiese", tier: 1 },
  { word: "GRIFF", clue: "Teil, an dem man einen Gegenstand hält", tier: 1 },
  { word: "HAAR", clue: "Wächst auf dem Kopf", tier: 1 },
  { word: "HAFEN", clue: "Geschützter Platz für Schiffe", tier: 1 },
  { word: "HALS", clue: "Verbindet Kopf und Rumpf", tier: 1 },
  { word: "HAND", clue: "Körperteil mit fünf Fingern", tier: 1 },
  { word: "HAUS", clue: "Gebäude, in dem Menschen wohnen", tier: 1 },
  { word: "HEFT", clue: "Kleines Buch mit leeren oder linierten Seiten", tier: 1 },
  { word: "HELD", clue: "Mutige Hauptfigur einer Geschichte", tier: 1 },
  { word: "HERZ", clue: "Pumpt Blut durch den Körper", tier: 1 },
  { word: "HIMMEL", clue: "Raum über der Erde, an dem Wolken ziehen", tier: 1 },
  { word: "HOLZ", clue: "Werkstoff aus dem Stamm eines Baumes", tier: 1 },
  { word: "HUND", clue: "Haustier, das oft bellt", tier: 1 },
  { word: "INSEL", clue: "Land, das ganz von Wasser umgeben ist", tier: 1 },
  { word: "JACKE", clue: "Kleidungsstück für den Oberkörper", tier: 1 },
  { word: "JUNGE", clue: "Männliches Kind", tier: 1 },
  { word: "KAMIN", clue: "Stelle im Haus, an der ein Feuer brennt", tier: 1 },
  { word: "KARTE", clue: "Zeigt Wege oder dient als Spielblatt", tier: 1 },
  { word: "KATZE", clue: "Haustier, das schnurrt und Mäuse jagt", tier: 1 },
  { word: "KETTE", clue: "Reihe verbundener Metallglieder", tier: 1 },
  { word: "KIND", clue: "Junger Mensch", tier: 1 },
  { word: "KLEID", clue: "Einteiliges Kleidungsstück", tier: 1 },
  { word: "KNIE", clue: "Gelenk in der Mitte des Beins", tier: 1 },
  { word: "KORB", clue: "Gefäß aus geflochtenen Zweigen", tier: 1 },
  { word: "KRAFT", clue: "Fähigkeit, etwas zu bewegen oder auszuhalten", tier: 1 },
  { word: "KREIS", clue: "Runde geometrische Form", tier: 1 },
  { word: "KREUZ", clue: "Zeichen aus zwei sich schneidenden Linien", tier: 1 },
  { word: "KUGEL", clue: "Runder Körper im Raum", tier: 1 },
  { word: "KUNST", clue: "Kreatives Schaffen wie Malerei oder Musik", tier: 1 },
  { word: "LADEN", clue: "Geschäft zum Einkaufen", tier: 1 },
  { word: "LAMPE", clue: "Spendet Licht in einem Zimmer", tier: 1 },
  { word: "LAND", clue: "Gebiet oder Gegenteil von Meer", tier: 1 },
  { word: "LATERNE", clue: "Tragbare oder aufgehängte Lichtquelle", tier: 1 },
  { word: "LAUF", clue: "Bewegung zu Fuß mit hohem Tempo", tier: 1 },
  { word: "LEITER", clue: "Hilfsmittel zum Hinaufsteigen", tier: 1 },
  { word: "LICHT", clue: "Macht Dinge sichtbar", tier: 1 },
  { word: "LIEBE", clue: "Starke Zuneigung zu einem Menschen", tier: 1 },
  { word: "LUFT", clue: "Unsichtbares Gemisch, das wir atmen", tier: 1 },
  { word: "MAUS", clue: "Kleines Nagetier oder Computergerät", tier: 1 },
  { word: "MEER", clue: "Großes Salzwassergebiet", tier: 1 },
  { word: "MEHL", clue: "Fein gemahlenes Korn zum Backen", tier: 1 },
  { word: "MILCH", clue: "Weißes Getränk von der Kuh", tier: 1 },
  { word: "MOND", clue: "Begleiter der Erde am Nachthimmel", tier: 1 },
  { word: "MOTOR", clue: "Maschine, die Bewegung erzeugt", tier: 1 },
  { word: "MUT", clue: "Bereitschaft, trotz Angst etwas zu wagen", tier: 1 },
  { word: "NACHT", clue: "Dunkle Tageszeit nach dem Abend", tier: 1 },
  { word: "NASE", clue: "Riechorgan mitten im Gesicht", tier: 1 },
  { word: "NEST", clue: "Wohnplatz eines Vogels", tier: 1 },
  { word: "NETZ", clue: "Gewebe aus miteinander verbundenen Fäden", tier: 1 },
  { word: "NORDEN", clue: "Himmelsrichtung zum Polarstern", tier: 1 },
  { word: "NOTE", clue: "Zeichen für einen Ton oder eine Schulbewertung", tier: 1 },
  { word: "OFEN", clue: "Gerät zum Backen oder Heizen", tier: 1 },
  { word: "OHR", clue: "Organ zum Hören", tier: 1 },
  { word: "ÖL", clue: "Flüssiger Stoff zum Kochen oder Schmieren", tier: 1 },
  { word: "PAPIER", clue: "Dünner Werkstoff zum Schreiben und Drucken", tier: 1 },
  { word: "PARK", clue: "Grüne Anlage in einer Stadt", tier: 1 },
  { word: "PFERD", clue: "Großes Huftier, das geritten werden kann", tier: 1 },
  { word: "PILZ", clue: "Lebewesen mit Hut und Stiel", tier: 1 },
  { word: "PLAN", clue: "Vorstellung davon, was man tun möchte", tier: 1 },
  { word: "PLATZ", clue: "Freie Fläche oder Ort in einer Reihe", tier: 1 },
  { word: "RAD", clue: "Rundes Teil, das sich um eine Achse dreht", tier: 1 },
  { word: "RAND", clue: "Äußerer Abschluss einer Fläche", tier: 1 },
  { word: "RAUM", clue: "Teil eines Gebäudes mit Wänden und Decke", tier: 1 },
  { word: "REGEN", clue: "Wasser, das aus Wolken fällt", tier: 1 },
  { word: "REISE", clue: "Fahrt oder Weg an einen anderen Ort", tier: 1 },
  { word: "RING", clue: "Rundes Schmuckstück für einen Finger", tier: 1 },
  { word: "ROSE", clue: "Blume mit duftenden Blüten und Dornen", tier: 1 },
  { word: "SALZ", clue: "Würzmittel aus kleinen weißen Kristallen", tier: 1 },
  { word: "SAND", clue: "Feine Körner an Strand oder Wüste", tier: 1 },
  { word: "SATZ", clue: "Folge von Wörtern mit einem Gedanken", tier: 1 },
  { word: "SCHAF", clue: "Wolliges Nutztier, das auf der Weide grast", tier: 1 },
  { word: "SCHIFF", clue: "Großes Fahrzeug auf dem Wasser", tier: 1 },
  { word: "SCHUH", clue: "Kleidungsstück für den Fuß", tier: 1 },
  { word: "SEE", clue: "Binnengewässer, das von Land umgeben ist", tier: 1 },
  { word: "SEIL", clue: "Dicke Schnur zum Ziehen oder Klettern", tier: 1 },
  { word: "SEIFE", clue: "Reinigungsmittel zum Waschen", tier: 1 },
  { word: "SEITE", clue: "Eine Fläche eines Blattes oder Buches", tier: 1 },
  { word: "SIEG", clue: "Erfolg am Ende eines Wettkampfs", tier: 1 },
  { word: "SONNE", clue: "Stern, der Licht und Wärme auf die Erde bringt", tier: 1 },
  { word: "SPIEL", clue: "Beschäftigung mit Regeln und Spaß", tier: 1 },
  { word: "STADT", clue: "Großer Ort mit vielen Häusern und Straßen", tier: 1 },
  { word: "STERN", clue: "Leuchtender Himmelskörper in weiter Ferne", tier: 1 },
  { word: "STIFT", clue: "Werkzeug zum Schreiben oder Zeichnen", tier: 1 },
  { word: "STIMME", clue: "Mit ihr sprechen oder singen wir", tier: 1 },
  { word: "STOCK", clue: "Langes Stück Holz zum Gehen oder Stützen", tier: 1 },
  { word: "STUHL", clue: "Sitzmöbel für eine Person", tier: 1 },
  { word: "TAG", clue: "Helle Zeit zwischen Morgen und Abend", tier: 1 },
  { word: "TAL", clue: "Tiefe Landschaft zwischen Bergen", tier: 1 },
  { word: "TANZ", clue: "Bewegung zur Musik", tier: 1 },
  { word: "TASSE", clue: "Trinkgefäß mit Henkel", tier: 1 },
  { word: "TASTE", clue: "Knopf auf einer Tastatur", tier: 1 },
  { word: "TELLER", clue: "Flaches Geschirr für eine Mahlzeit", tier: 1 },
  { word: "TIER", clue: "Lebewesen, das sich selbst ernährt und bewegt", tier: 1 },
  { word: "TISCH", clue: "Möbel mit einer ebenen Platte", tier: 1 },
  { word: "TOR", clue: "Öffnung in einer Mauer oder Treffer im Sport", tier: 1 },
  { word: "TORTE", clue: "Kuchen mit mehreren Schichten", tier: 1 },
  { word: "UFER", clue: "Rand eines Flusses oder Sees", tier: 1 },
  { word: "UHR", clue: "Zeigt die aktuelle Zeit an", tier: 1 },
  { word: "WALD", clue: "Große Fläche mit dichtem Baumbestand", tier: 1 },
  { word: "WAND", clue: "Begrenzt einen Raum seitlich", tier: 1 },
  { word: "WASSER", clue: "Klare Flüssigkeit, die Menschen zum Leben brauchen", tier: 1 },
  { word: "WELT", clue: "Alles, was es auf der Erde gibt", tier: 1 },
  { word: "WIND", clue: "Bewegte Luft", tier: 1 },
  { word: "WOLKE", clue: "Schwebende Ansammlung von Wassertröpfchen", tier: 1 },
  { word: "WURZEL", clue: "Pflanzenteil, der Wasser aus dem Boden aufnimmt", tier: 1 },
  { word: "ZAUN", clue: "Abgrenzung aus Holz oder Metall", tier: 1 },
  { word: "ZEIT", clue: "Was auf einer Uhr vergeht", tier: 1 },
  { word: "ZELT", clue: "Leichte Unterkunft aus Stoff für draußen", tier: 1 },
  { word: "ZIEGE", clue: "Kletterfreudiges Nutztier mit Hörnern", tier: 1 },
  { word: "ZUG", clue: "Langes Fahrzeug auf Schienen", tier: 1 },
  { word: "ZWEIG", clue: "Dünner Ast eines Baumes", tier: 1 },
  { word: "ABENTEUER", clue: "Aufregendes Erlebnis mit ungewissem Ausgang", tier: 2 },
  { word: "ANFANG", clue: "Erster Teil eines Geschehens", tier: 2 },
  { word: "ANLASS", clue: "Grund oder Gelegenheit für etwas", tier: 2 },
  { word: "ANMUT", clue: "Elegante, leichte Art der Bewegung", tier: 2 },
  { word: "ANTWORT", clue: "Reaktion auf eine Frage", tier: 2 },
  { word: "ARBEIT", clue: "Tätigkeit, für die man sich anstrengt", tier: 2 },
  { word: "AUFGABE", clue: "Zu erledigende Arbeit oder Schulübung", tier: 2 },
  { word: "AUGENBLICK", clue: "Sehr kurzer Zeitraum", tier: 2 },
  { word: "AUSFLUG", clue: "Kurze Reise zur Erholung", tier: 2 },
  { word: "BEGRIFF", clue: "Wort oder Vorstellung für eine Sache", tier: 2 },
  { word: "BEISPIEL", clue: "Einzelner Fall, der etwas veranschaulicht", tier: 2 },
  { word: "BERUF", clue: "Dauerhafte Tätigkeit zum Lebensunterhalt", tier: 2 },
  { word: "BESUCH", clue: "Aufenthalt bei einer anderen Person", tier: 2 },
  { word: "BEWEIS", clue: "Zeigt, dass eine Behauptung stimmt", tier: 2 },
  { word: "BLICK", clue: "Richtung, in die man mit den Augen schaut", tier: 2 },
  { word: "BRIEFMARKE", clue: "Wertzeichen für einen Postbrief", tier: 2 },
  { word: "BRÜCKE", clue: "Bauwerk über einem Fluss oder einer Straße", tier: 2 },
  { word: "DANKBAR", clue: "Voller Anerkennung für eine Hilfe", tier: 2 },
  { word: "DENKEN", clue: "Gedanken im Kopf entwickeln", tier: 2 },
  { word: "DREIECK", clue: "Vieleck mit drei Seiten", tier: 2 },
  { word: "EINBLICK", clue: "Verständnis für einen Zusammenhang", tier: 2 },
  { word: "EINFLUSS", clue: "Wirkung, die man auf etwas ausübt", tier: 2 },
  { word: "ERFAHRUNG", clue: "Wissen aus selbst erlebten Situationen", tier: 2 },
  { word: "ERFOLG", clue: "Gelingen eines Vorhabens", tier: 2 },
  { word: "ERINNERUNG", clue: "Bild eines vergangenen Erlebnisses im Gedächtnis", tier: 2 },
  { word: "FÄHIGKEIT", clue: "Können, eine bestimmte Sache zu tun", tier: 2 },
  { word: "FREIHEIT", clue: "Zustand ohne Zwang", tier: 2 },
  { word: "FREUNDSCHAFT", clue: "Vertrauensvolle Beziehung zwischen Menschen", tier: 2 },
  { word: "GEDANKE", clue: "Inhalt, mit dem sich der Kopf beschäftigt", tier: 2 },
  { word: "GEDULD", clue: "Ruhe beim Warten oder bei Schwierigkeiten", tier: 2 },
  { word: "GEFÜHL", clue: "Inneres Erleben wie Freude oder Sorge", tier: 2 },
  { word: "GELINGEN", clue: "Erfolgreich zustande kommen", tier: 2 },
  { word: "GEMEINSAM", clue: "Zusammen mit anderen", tier: 2 },
  { word: "GESCHICHTE", clue: "Erzählung oder Bericht über Vergangenes", tier: 2 },
  { word: "GESPRÄCH", clue: "Wechsel von Äußerungen zwischen Menschen", tier: 2 },
  { word: "GEWITTER", clue: "Unwetter mit Blitz und Donner", tier: 2 },
  { word: "GLÜCK", clue: "Gutes Gefühl oder günstiger Zufall", tier: 2 },
  { word: "GRENZE", clue: "Linie, die ein Gebiet von einem anderen trennt", tier: 2 },
  { word: "GRUNDSATZ", clue: "Wichtige Regel, an der man sich orientiert", tier: 2 },
  { word: "HÄUFIG", clue: "Oft vorkommend", tier: 2 },
  { word: "HERAUSFORDERUNG", clue: "Schwierige Aufgabe, die Können verlangt", tier: 2 },
  { word: "HILFE", clue: "Unterstützung in einer schwierigen Lage", tier: 2 },
  { word: "HOFFNUNG", clue: "Zuversicht auf etwas Gutes in der Zukunft", tier: 2 },
  { word: "IDEAL", clue: "Vorbildlicher, angestrebter Zustand", tier: 2 },
  { word: "INHALT", clue: "Das, worum es in einem Text oder Gefäß geht", tier: 2 },
  { word: "INTERESSE", clue: "Aufmerksamkeit und Neugier für ein Thema", tier: 2 },
  { word: "KAPITEL", clue: "Abgeteilter Abschnitt eines Buches", tier: 2 },
  { word: "KOMPASS", clue: "Gerät, das die Himmelsrichtung anzeigt", tier: 2 },
  { word: "KONFLIKT", clue: "Streit oder Gegensatz zwischen Interessen", tier: 2 },
  { word: "KÖRPER", clue: "Physische Gestalt eines Lebewesens", tier: 2 },
  { word: "LÖSUNG", clue: "Ergebnis, das eine Aufgabe beantwortet", tier: 2 },
  { word: "MÖGLICH", clue: "Kann geschehen oder getan werden", tier: 2 },
  { word: "MUSTER", clue: "Wiederkehrende Form oder Vorlage", tier: 2 },
  { word: "NACHBAR", clue: "Person, die nebenan wohnt", tier: 2 },
  { word: "NATUR", clue: "Pflanzen, Tiere und Landschaft ohne Bauwerke", tier: 2 },
  { word: "ORDNUNG", clue: "Zustand, in dem alles am passenden Platz ist", tier: 2 },
  { word: "PFLANZE", clue: "Lebewesen, das meist im Boden wächst", tier: 2 },
  { word: "PHANTASIE", clue: "Fähigkeit, sich neue Dinge auszudenken", tier: 2 },
  { word: "PROBLEM", clue: "Schwierigkeit, für die eine Lösung gesucht wird", tier: 2 },
  { word: "PRÜFUNG", clue: "Kontrolliert, was jemand gelernt hat", tier: 2 },
  { word: "RICHTUNG", clue: "Weg, in den etwas zeigt oder sich bewegt", tier: 2 },
  { word: "SCHATTEN", clue: "Dunkle Fläche hinter einem lichtundurchlässigen Körper", tier: 2 },
  { word: "SCHLÜSSEL", clue: "Öffnet ein Schloss oder erklärt eine Lösung", tier: 2 },
  { word: "SCHRIFT", clue: "Zeichen zum Festhalten von Sprache", tier: 2 },
  { word: "SCHULWEG", clue: "Strecke, die man zur Schule zurücklegt", tier: 2 },
  { word: "SPANNUNG", clue: "Aufregendes Warten auf den weiteren Verlauf", tier: 2 },
  { word: "SPRACHE", clue: "System aus Wörtern und Regeln zur Verständigung", tier: 2 },
  { word: "STÄRKE", clue: "Kraft oder besondere gute Eigenschaft", tier: 2 },
  { word: "STRECKE", clue: "Entfernung zwischen zwei Punkten", tier: 2 },
  { word: "TEILUNG", clue: "Aufspaltung in mehrere gleiche oder verschiedene Teile", tier: 2 },
  { word: "UMGEBUNG", clue: "Bereich, der einen Ort unmittelbar umgibt", tier: 2 },
  { word: "UNTERSCHIED", clue: "Merkmal, durch das sich Dinge voneinander abheben", tier: 2 },
  { word: "VERGLEICH", clue: "Betrachtung von Gemeinsamkeiten und Abweichungen", tier: 2 },
  { word: "VERSUCH", clue: "Bemühung, etwas zu erreichen oder herauszufinden", tier: 2 },
  { word: "VORTEIL", clue: "Günstiger Umstand gegenüber einer anderen Möglichkeit", tier: 2 },
  { word: "WETTBEWERB", clue: "Vergleich, bei dem mehrere um den Sieg antreten", tier: 2 },
  { word: "WISSEN", clue: "Gesammelte Kenntnisse und Erkenntnisse", tier: 2 },
  { word: "ZEICHEN", clue: "Sichtbare Darstellung mit einer bestimmten Bedeutung", tier: 2 },
  { word: "ZUKUNFT", clue: "Zeit, die noch vor uns liegt", tier: 2 },
  { word: "ZUSAMMENHANG", clue: "Beziehung, die mehrere Dinge miteinander verbindet", tier: 2 },
  { word: "ABWÄGUNG", clue: "Sorgfältiger Vergleich möglicher Entscheidungen", tier: 3 },
  { word: "ANALYSE", clue: "Untersuchung eines Gegenstands in seine Bestandteile", tier: 3 },
  { word: "ANNAHME", clue: "Vorläufige Erklärung, die noch geprüft wird", tier: 3 },
  { word: "ARGUMENT", clue: "Begründung, die eine Meinung stützen soll", tier: 3 },
  { word: "AUSWIRKUNG", clue: "Folge, die ein Ereignis nach sich zieht", tier: 3 },
  { word: "BEDEUTUNG", clue: "Sinn oder Wichtigkeit einer Sache", tier: 3 },
  { word: "BEDINGUNG", clue: "Voraussetzung, die erfüllt sein muss", tier: 3 },
  { word: "BEOBACHTUNG", clue: "Genaues Wahrnehmen eines Vorgangs", tier: 3 },
  { word: "BERECHNUNG", clue: "Ergebnis, das durch Rechnen entsteht", tier: 3 },
  { word: "BEWERTUNG", clue: "Einschätzung nach bestimmten Maßstäben", tier: 3 },
  { word: "DEUTUNG", clue: "Erklärung, wie eine Aussage verstanden werden kann", tier: 3 },
  { word: "EINHEIT", clue: "Festgelegtes Maß oder zusammengehörige Gruppe", tier: 3 },
  { word: "ENTWICKLUNG", clue: "Allmähliche Veränderung über einen Zeitraum", tier: 3 },
  { word: "ERKENNTNIS", clue: "Gewonnene Einsicht in einen Sachverhalt", tier: 3 },
  { word: "ERKLÄRUNG", clue: "Macht einen Zusammenhang verständlich", tier: 3 },
  { word: "FORSCHUNG", clue: "Systematische Suche nach neuen Erkenntnissen", tier: 3 },
  { word: "FUNKTION", clue: "Aufgabe oder Wirkungsweise eines Teils", tier: 3 },
  { word: "GEGENSATZ", clue: "Deutlicher Unterschied zwischen zwei Aussagen", tier: 3 },
  { word: "GELTUNG", clue: "Anerkannte Wirksamkeit einer Regel", tier: 3 },
  { word: "GERECHTIGKEIT", clue: "Gleichbehandlung nach fairen Regeln", tier: 3 },
  { word: "GESETZMÄSSIG", clue: "Entspricht einer erkennbaren Regel", tier: 3 },
  { word: "HYPOTHESE", clue: "Vermutung, die durch Beobachtung geprüft wird", tier: 3 },
  { word: "IDENTITÄT", clue: "Eigene unverwechselbare Persönlichkeit", tier: 3 },
  { word: "KATEGORIE", clue: "Gruppe ähnlicher Dinge in einer Einteilung", tier: 3 },
  { word: "KOMPROMISS", clue: "Einigung, bei der beide Seiten nachgeben", tier: 3 },
  { word: "KONSEQUENZ", clue: "Folge, die sich aus einer Handlung ergibt", tier: 3 },
  { word: "KONTEXT", clue: "Sprachlicher oder sachlicher Zusammenhang einer Aussage", tier: 3 },
  { word: "KRITERIUM", clue: "Merkmal zur Beurteilung einer Sache", tier: 3 },
  { word: "LEISTUNG", clue: "Ergebnis einer Anstrengung", tier: 3 },
  { word: "MASSSTAB", clue: "Regel, mit der Größen oder Leistungen verglichen werden", tier: 3 },
  { word: "METHODIK", clue: "Geordnete Vorgehensweise bei einer Untersuchung", tier: 3 },
  { word: "MERKMAL", clue: "Eigenschaft, an der man etwas erkennt", tier: 3 },
  { word: "OBJEKTIV", clue: "Unabhängig von persönlichen Gefühlen beurteilt", tier: 3 },
  { word: "PERSPEKTIVE", clue: "Blickwinkel, aus dem man etwas betrachtet", tier: 3 },
  { word: "PRINZIP", clue: "Grundlegende Regel oder Überzeugung", tier: 3 },
  { word: "PROZESS", clue: "Abfolge von Veränderungen oder Arbeitsschritten", tier: 3 },
  { word: "QUELLE", clue: "Ursprung einer Nachricht oder eines Stoffes", tier: 3 },
  { word: "REAKTION", clue: "Antwort auf einen Reiz oder ein Ereignis", tier: 3 },
  { word: "REDUKTION", clue: "Verringerung auf eine kleinere Menge", tier: 3 },
  { word: "REGELUNG", clue: "Festlegung, wie ein Ablauf gesteuert wird", tier: 3 },
  { word: "SCHLUSSFOLGERUNG", clue: "Ergebnis, das aus vorherigen Aussagen abgeleitet wird", tier: 3 },
  { word: "STRUKTUR", clue: "Aufbau und Ordnung einzelner Bestandteile", tier: 3 },
  { word: "TENDENZ", clue: "Erkennbare Richtung einer Veränderung", tier: 3 },
  { word: "THEORIE", clue: "System aus Erklärungen für bestimmte Beobachtungen", tier: 3 },
  { word: "ÜBERTRAGUNG", clue: "Weitergabe von Information oder Energie", tier: 3 },
  { word: "VARIANTE", clue: "Eine mögliche Ausführung neben anderen", tier: 3 },
  { word: "VERFAHREN", clue: "Festgelegte Art, eine Aufgabe zu lösen", tier: 3 },
  { word: "VERHÄLTNIS", clue: "Beziehung oder Größenvergleich zwischen Dingen", tier: 3 },
  { word: "VERMUTUNG", clue: "Annahme ohne vollständigen Beweis", tier: 3 },
  { word: "WIRKUNG", clue: "Veränderung, die durch eine Ursache entsteht", tier: 3 },
  { word: "ZEITRAUM", clue: "Begrenzte Spanne zwischen zwei Zeitpunkten", tier: 3 },
  { word: "ZUSAMMENFASSUNG", clue: "Kurze Wiedergabe der wichtigsten Gedanken", tier: 3 },
  { word: "ÄQUIVALENZ", clue: "Gleichwertigkeit zweier mathematischer Aussagen", tier: 4 },
  { word: "AMBIGUITÄT", clue: "Mehrdeutigkeit einer Aussage oder eines Ausdrucks", tier: 4 },
  { word: "ANALOGIE", clue: "Ähnlichkeit in Beziehungen zwischen verschiedenen Dingen", tier: 4 },
  { word: "ANTITHESE", clue: "Gegensatz, der einer Behauptung gegenübergestellt wird", tier: 4 },
  { word: "BEFUND", clue: "Ergebnis einer systematischen Untersuchung", tier: 4 },
  { word: "BEGRÜNDUNG", clue: "Erklärung, warum eine Aussage gelten soll", tier: 4 },
  { word: "DEDUKTION", clue: "Logischer Schluss vom Allgemeinen auf einen Einzelfall", tier: 4 },
  { word: "DIVERGENZ", clue: "Auseinanderlaufen von Meinungen oder Entwicklungen", tier: 4 },
  { word: "EMANZIPATION", clue: "Befreiung aus Abhängigkeit oder Bevormundung", tier: 4 },
  { word: "EMPIRISCH", clue: "Auf Erfahrung und Beobachtung beruhend", tier: 4 },
  { word: "EPISTEMISCH", clue: "Das Wissen und seine Bedingungen betreffend", tier: 4 },
  { word: "EXEMPLAR", clue: "Einzelnes Stück einer Art oder Ausgabe", tier: 4 },
  { word: "FALSIFIZIEREN", clue: "Eine Behauptung durch Gegenbelege widerlegen", tier: 4 },
  { word: "HEURISTIK", clue: "Methode, mit begrenztem Aufwand Lösungen zu finden", tier: 4 },
  { word: "INDUKTION", clue: "Schluss von Einzelfällen auf eine allgemeine Regel", tier: 4 },
  { word: "INFERENZ", clue: "Logische Ableitung einer Aussage aus anderen Aussagen", tier: 4 },
  { word: "KAUSALITÄT", clue: "Beziehung zwischen Ursache und Wirkung", tier: 4 },
  { word: "KOHÄRENZ", clue: "Innerer Zusammenhang und Widerspruchsfreiheit", tier: 4 },
  { word: "KONTINGENZ", clue: "Möglichkeit, dass etwas auch anders sein könnte", tier: 4 },
  { word: "KORRELATION", clue: "Messbarer Zusammenhang zwischen zwei Größen", tier: 4 },
  { word: "LEGITIMITÄT", clue: "Anerkennung als rechtmäßig oder gerechtfertigt", tier: 4 },
  { word: "METAPHER", clue: "Bildlicher Ausdruck, der ein Wort in anderem Sinn nutzt", tier: 4 },
  { word: "PARADIGMA", clue: "Grundlegendes Denk- und Erklärungsmodell", tier: 4 },
  { word: "POSTULAT", clue: "Forderung oder Annahme, die als Ausgangspunkt gilt", tier: 4 },
  { word: "PRÄMISSE", clue: "Vorausgesetzte Aussage in einem logischen Schluss", tier: 4 },
  { word: "REDUNDANZ", clue: "Mehrfach vorhandene Information ohne zusätzlichen Nutzen", tier: 4 },
  { word: "REFLEXION", clue: "Nachdenkliche Prüfung des eigenen Handelns", tier: 4 },
  { word: "SEQUENZ", clue: "Geordnete Folge einzelner Elemente", tier: 4 },
  { word: "SUBJEKTIV", clue: "Von persönlichen Eindrücken und Gefühlen geprägt", tier: 4 },
  { word: "SYNTHESE", clue: "Verbindung mehrerer Teile zu einem Ganzen", tier: 4 },
  { word: "TAXONOMIE", clue: "Systematische Einteilung in Gruppen und Untergruppen", tier: 4 },
  { word: "VALIDITÄT", clue: "Gültigkeit und Aussagekraft einer Messung", tier: 4 },
  { word: "VARIABILITÄT", clue: "Ausmaß, in dem Werte oder Formen schwanken", tier: 4 },
  { word: "VERIFIZIEREN", clue: "Durch Prüfung bestätigen, dass etwas zutrifft", tier: 4 },
  { word: "WIDERSPRUCH", clue: "Gleichzeitige Behauptung unvereinbarer Aussagen", tier: 4 },
] satisfies WordClue[]).map((entry) => ({ ...entry, word: normalizeAnswer(entry.word) }));

const DIFFICULTIES: CrosswordDifficulty[] = ["easy", "medium", "hard", "expert"];
const TARGET_WORDS: Record<CrosswordDifficulty, number> = { easy: 7, medium: 9, hard: 11, expert: 13 };
const MIN_WORDS: Record<CrosswordDifficulty, number> = { easy: 6, medium: 7, hard: 8, expert: 9 };
const GRID_SIZE: Record<CrosswordDifficulty, number> = { easy: 11, medium: 13, hard: 15, expert: 17 };
const REQUIRED_TOP_TIER_WORDS: Record<CrosswordDifficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 };

function randomFromSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function key(row: number, column: number): string {
  return `${row},${column}`;
}

function lengthFor(word: PlacedWord): number {
  return word.word.length;
}

function validPlacement(
  candidate: PlacedWord,
  occupied: Map<string, OccupiedCell>,
): number {
  const across = candidate.direction === "across";
  const rowStep = across ? 0 : 1;
  const columnStep = across ? 1 : 0;
  const perpendicularRow = across ? 1 : 0;
  const perpendicularColumn = across ? 0 : 1;
  let crossings = 0;

  const before = occupied.get(key(candidate.row - rowStep, candidate.column - columnStep));
  const after = occupied.get(key(
    candidate.row + rowStep * lengthFor(candidate),
    candidate.column + columnStep * lengthFor(candidate),
  ));
  if (before || after) return 0;

  for (let index = 0; index < candidate.word.length; index += 1) {
    const row = candidate.row + rowStep * index;
    const column = candidate.column + columnStep * index;
    const existing = occupied.get(key(row, column));
    if (existing) {
      if (existing.letter !== candidate.word[index] ||
          (across ? existing.across : existing.down) ||
          !(across ? existing.down : existing.across)) return 0;
      const perpendicularDirection = across ? "down" : "across";
      const beforeCrossing = occupied.get(key(row - perpendicularRow, column - perpendicularColumn));
      const afterCrossing = occupied.get(key(row + perpendicularRow, column + perpendicularColumn));
      const crossingId = existing[perpendicularDirection];
      if ((beforeCrossing?.[perpendicularDirection] && beforeCrossing[perpendicularDirection] !== crossingId) ||
          (afterCrossing?.[perpendicularDirection] && afterCrossing[perpendicularDirection] !== crossingId)) return 0;
      crossings += 1;
      continue;
    }
    if (occupied.has(key(row - perpendicularRow, column - perpendicularColumn)) ||
        occupied.has(key(row + perpendicularRow, column + perpendicularColumn))) return 0;
  }
  return crossings;
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function layoutFingerprint(words: PlacedWord[]): string {
  return words
    .map(({ word, row, column, direction }) => `${word}:${row}:${column}:${direction}`)
    .sort()
    .join("|");
}

function buildAttempt(
  difficulty: CrosswordDifficulty,
  random: () => number,
  maxGrid: number,
): PlacedWord[] {
  const eligible = WORDS.filter((entry) => entry.tier <= DIFFICULTIES.indexOf(difficulty) + 1);
  const center = Math.floor(maxGrid / 2);
  const topTier = (DIFFICULTIES.indexOf(difficulty) + 1) as WordClue["tier"];
  const advancedStarters = eligible.filter((entry) => entry.tier === topTier && entry.word.length >= 4 && entry.word.length <= 14);
  const starters = shuffle(
    (advancedStarters.length ? advancedStarters : eligible).filter((entry) => entry.word.length >= 4 && entry.word.length <= 14),
    random,
  );
  const first = starters[0] ?? eligible[0];
  const placed: PlacedWord[] = [{
    ...first,
    row: center,
    column: center - Math.floor(first.word.length / 2),
    direction: "across",
  }];
  const occupied = new Map<string, OccupiedCell>();
  const addToGrid = (word: PlacedWord) => {
    const across = word.direction === "across";
    for (let index = 0; index < word.word.length; index += 1) {
      const row = word.row + (across ? 0 : index);
      const column = word.column + (across ? index : 0);
      const cellKey = key(row, column);
      const existing = occupied.get(cellKey);
      occupied.set(cellKey, existing
        ? { ...existing, ...(across ? { across: word.word } : { down: word.word }) }
        : { letter: word.word[index], ...(across ? { across: word.word } : { down: word.word }) });
    }
  };
  addToGrid(placed[0]);

  while (placed.length < TARGET_WORDS[difficulty]) {
    const usedWords = new Set(placed.map((entry) => entry.word));
    const candidates: Array<{ word: PlacedWord; crossings: number; score: number }> = [];
    const needsTopTier = placed.filter((entry) => entry.tier === topTier).length < REQUIRED_TOP_TIER_WORDS[difficulty];
    for (const clue of shuffle(eligible.filter((entry) =>
      !usedWords.has(entry.word) && (!needsTopTier || entry.tier === topTier)), random)) {
      for (const anchor of shuffle(placed, random)) {
        const direction: CrosswordDirection = anchor.direction === "across" ? "down" : "across";
        const anchorAcross = anchor.direction === "across";
        for (let anchorIndex = 0; anchorIndex < anchor.word.length; anchorIndex += 1) {
          for (let wordIndex = 0; wordIndex < clue.word.length; wordIndex += 1) {
            if (anchor.word[anchorIndex] !== clue.word[wordIndex]) continue;
            const anchorRow = anchor.row + (anchorAcross ? 0 : anchorIndex);
            const anchorColumn = anchor.column + (anchorAcross ? anchorIndex : 0);
            const candidateAcross = direction === "across";
            const candidate: PlacedWord = {
              ...clue,
              row: anchorRow - (candidateAcross ? 0 : wordIndex),
              column: anchorColumn - (candidateAcross ? wordIndex : 0),
              direction,
            };
            const endRow = candidate.row + (candidateAcross ? 0 : clue.word.length - 1);
            const endColumn = candidate.column + (candidateAcross ? clue.word.length - 1 : 0);
            if (candidate.row < 1 || candidate.column < 1 ||
                endRow >= maxGrid - 1 || endColumn >= maxGrid - 1) continue;
            const crossings = validPlacement(candidate, occupied);
            if (!crossings) continue;
            const centerRow = (candidate.row + endRow) / 2;
            const centerColumn = (candidate.column + endColumn) / 2;
            const score = crossings * 16 + clue.tier * 4 + random() * 5 -
              (Math.abs(centerRow - center) + Math.abs(centerColumn - center)) * 0.55 -
              clue.word.length * 0.12;
            candidates.push({ word: candidate, crossings, score });
          }
        }
      }
    }
    if (!candidates.length) break;
    candidates.sort((left, right) => right.score - left.score);
    const choice = candidates[Math.floor(random() * Math.min(5, candidates.length))];
    if (!choice || choice.crossings === 0) break;
    placed.push(choice.word);
    addToGrid(choice.word);
  }
  return placed;
}

function toPuzzle(difficulty: CrosswordDifficulty, seed: number, placed: PlacedWord[]): CrosswordPuzzle {
  const minRow = Math.min(...placed.map((entry) => entry.row));
  const minColumn = Math.min(...placed.map((entry) => entry.column));
  const normalized = placed.map((entry) => ({ ...entry, row: entry.row - minRow, column: entry.column - minColumn }));
  const rows = Math.max(...normalized.map((entry) => entry.row + (entry.direction === "down" ? entry.word.length : 1)));
  const columns = Math.max(...normalized.map((entry) => entry.column + (entry.direction === "across" ? entry.word.length : 1)));
  const starts = new Map<string, { across?: PlacedWord; down?: PlacedWord; number: number }>();
  let number = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const across = normalized.find((entry) => entry.direction === "across" && entry.row === row && entry.column === column);
      const down = normalized.find((entry) => entry.direction === "down" && entry.row === row && entry.column === column);
      if (across || down) starts.set(key(row, column), { across, down, number: ++number });
    }
  }
  const cells: Record<string, CrosswordCell> = {};
  const entries: CrosswordEntry[] = [];
  for (const [cellKey, start] of starts) {
    const [row, column] = cellKey.split(",").map(Number);
    if (start.across) {
      const entry: CrosswordEntry = {
        id: `${start.number}-across`,
        number: start.number,
        row,
        column,
        direction: "across",
        answer: start.across.word,
        clue: start.across.clue,
        tier: start.across.tier,
      };
      entries.push(entry);
      for (let index = 0; index < entry.answer.length; index += 1) {
        const position = key(row, column + index);
        const cell = cells[position] ?? { letter: entry.answer[index] };
        cells[position] = { ...cell, letter: entry.answer[index], number: index === 0 ? start.number : cell.number, across: entry.id };
      }
    }
    if (start.down) {
      const entry: CrosswordEntry = {
        id: `${start.number}-down`,
        number: start.number,
        row,
        column,
        direction: "down",
        answer: start.down.word,
        clue: start.down.clue,
        tier: start.down.tier,
      };
      entries.push(entry);
      for (let index = 0; index < entry.answer.length; index += 1) {
        const position = key(row + index, column);
        const cell = cells[position] ?? { letter: entry.answer[index] };
        cells[position] = { ...cell, letter: entry.answer[index], number: index === 0 ? start.number : cell.number, down: entry.id };
      }
    }
  }
  entries.sort((left, right) => left.number - right.number || left.direction.localeCompare(right.direction));
  const fingerprint = hashString(layoutFingerprint(normalized)).toString(36);
  return { version: 1, seed, difficulty, rows, columns, entries, cells, fingerprint };
}

export function createCrosswordPuzzle(difficulty: CrosswordDifficulty, seed: number): CrosswordPuzzle {
  if (!DIFFICULTIES.includes(difficulty)) throw new Error("Unknown crossword difficulty.");
  if (!Number.isSafeInteger(seed)) throw new Error("Crossword seed must be a safe integer.");
  const random = randomFromSeed(seed);
  const maxGrid = GRID_SIZE[difficulty];
  const fingerprints = new Set<string>();
  let best: PlacedWord[] = [];
  let bestQualified: PlacedWord[] = [];
  const topTier = (DIFFICULTIES.indexOf(difficulty) + 1) as WordClue["tier"];

  for (let attempt = 0; attempt < 36; attempt += 1) {
    const layout = buildAttempt(difficulty, random, maxGrid);
    const fingerprint = layoutFingerprint(layout);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    if (layout.length > best.length) best = layout;
    const topTierCount = layout.filter((entry) => entry.tier === topTier).length;
    if (layout.length >= MIN_WORDS[difficulty] && topTierCount >= REQUIRED_TOP_TIER_WORDS[difficulty]) {
      if (layout.length > bestQualified.length) bestQualified = layout;
      if (layout.length >= TARGET_WORDS[difficulty]) {
        bestQualified = layout;
        break;
      }
    }
  }
  if (bestQualified.length) {
    best = bestQualified;
  }
  if (best.length < MIN_WORDS[difficulty] ||
      best.filter((entry) => entry.tier === topTier).length < REQUIRED_TOP_TIER_WORDS[difficulty]) {
    throw new Error(`Could not generate a connected ${difficulty} crossword for seed ${seed}.`);
  }
  const puzzle = toPuzzle(difficulty, seed, best);
  if (!validateCrosswordPuzzle(puzzle)) throw new Error(`Generated crossword ${seed} failed validation.`);
  return puzzle;
}

export function validateCrosswordPuzzle(value: unknown): value is CrosswordPuzzle {
  if (!value || typeof value !== "object") return false;
  const puzzle = value as Partial<CrosswordPuzzle>;
  if (puzzle.version !== 1 || !DIFFICULTIES.includes(puzzle.difficulty as CrosswordDifficulty) ||
      !Number.isSafeInteger(puzzle.seed) || !Number.isInteger(puzzle.rows) ||
      !Number.isInteger(puzzle.columns) || (puzzle.rows ?? 0) < 1 || (puzzle.columns ?? 0) < 1 ||
      (puzzle.rows ?? 0) > GRID_SIZE[puzzle.difficulty as CrosswordDifficulty] ||
      (puzzle.columns ?? 0) > GRID_SIZE[puzzle.difficulty as CrosswordDifficulty] ||
      !Array.isArray(puzzle.entries) || puzzle.entries.length < MIN_WORDS[puzzle.difficulty as CrosswordDifficulty] ||
      !puzzle.cells || typeof puzzle.cells !== "object" || Array.isArray(puzzle.cells) ||
      typeof puzzle.fingerprint !== "string") return false;
  const entries = puzzle.entries as CrosswordEntry[];
  const cells = puzzle.cells as Record<string, CrosswordCell>;
  const eligible = new Map(WORDS.map((entry) => [entry.word, entry]));
  const occupied = new Map<string, { letter: string; across?: string; down?: string }>();
  const starts = new Set<string>();
  const entryIds = new Set<string>();
  const startNumbers = new Map<string, number>();
  const edges = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || !Number.isInteger(entry.row) ||
        !Number.isInteger(entry.column) || entry.row < 0 || entry.column < 0 ||
        !["across", "down"].includes(entry.direction) ||
        !Number.isInteger(entry.number) || entry.number < 1 || entryIds.has(entry.id) ||
        !Number.isInteger(entry.tier) || entry.tier < 1 || entry.tier > DIFFICULTIES.indexOf(puzzle.difficulty as CrosswordDifficulty) + 1 ||
        typeof entry.answer !== "string" || !/^[A-Z]+$/.test(entry.answer) ||
        eligible.get(entry.answer)?.clue !== entry.clue || eligible.get(entry.answer)?.tier !== entry.tier || entry.answer.length < 2) return false;
    const endRow = entry.row + (entry.direction === "down" ? entry.answer.length - 1 : 0);
    const endColumn = entry.column + (entry.direction === "across" ? entry.answer.length - 1 : 0);
    if (endRow >= (puzzle.rows ?? 0) || endColumn >= (puzzle.columns ?? 0)) return false;
    const startKey = key(entry.row, entry.column);
    if (starts.has(`${startKey}:${entry.direction}`)) return false;
    starts.add(`${startKey}:${entry.direction}`);
    const previousNumber = startNumbers.get(startKey);
    if (previousNumber !== undefined && previousNumber !== entry.number) return false;
    startNumbers.set(startKey, entry.number);
    entryIds.add(entry.id);
    for (let index = 0; index < entry.answer.length; index += 1) {
      const cellKey = key(
        entry.row + (entry.direction === "down" ? index : 0),
        entry.column + (entry.direction === "across" ? index : 0),
      );
      const existing = occupied.get(cellKey);
      if (existing) {
        if (existing.letter !== entry.answer[index] || existing[entry.direction]) return false;
        occupied.set(cellKey, { ...existing, [entry.direction]: entry.id });
      } else {
        occupied.set(cellKey, { letter: entry.answer[index], [entry.direction]: entry.id });
      }
    }
  }
  const entriesByCell = new Map<string, string[]>();
  for (const entry of entries) {
    for (let index = 0; index < entry.answer.length; index += 1) {
      const cellKey = key(
        entry.row + (entry.direction === "down" ? index : 0),
        entry.column + (entry.direction === "across" ? index : 0),
      );
      const stepRow = entry.direction === "down" ? 1 : 0;
      const stepColumn = entry.direction === "across" ? 1 : 0;
      if (index === 0 && occupied.has(key(entry.row - stepRow, entry.column - stepColumn))) return false;
      if (index === entry.answer.length - 1 &&
          occupied.has(key(entry.row + stepRow * entry.answer.length, entry.column + stepColumn * entry.answer.length))) return false;
      const position = occupied.get(cellKey);
      if (!position) return false;
      if (entry.direction === "across" && !position.down &&
          (occupied.has(key(entry.row - 1, entry.column + index)) || occupied.has(key(entry.row + 1, entry.column + index)))) return false;
      if (entry.direction === "down" && !position.across &&
          (occupied.has(key(entry.row + index, entry.column - 1)) || occupied.has(key(entry.row + index, entry.column + 1)))) return false;
      const ids = entriesByCell.get(cellKey) ?? [];
      ids.push(entry.id);
      entriesByCell.set(cellKey, ids);
    }
  }
  for (const [cellKey, position] of occupied) {
    const cell = cells[cellKey];
    if (!cell || typeof cell.letter !== "string" || cell.letter !== position.letter ||
        cell.across !== position.across || cell.down !== position.down ||
        cell.number !== startNumbers.get(cellKey)) return false;
  }
  if (Object.keys(cells).length !== occupied.size) return false;
  for (const ids of entriesByCell.values()) {
    if (ids.length > 2) return false;
    for (const id of ids) {
      const adjacent = edges.get(id) ?? new Set<string>();
      ids.filter((other) => other !== id).forEach((other) => adjacent.add(other));
      edges.set(id, adjacent);
    }
  }
  const visited = new Set<string>();
  const queue = [entries[0].id];
  while (queue.length) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    edges.get(id)?.forEach((neighbor) => { if (!visited.has(neighbor)) queue.push(neighbor); });
  }
  if (visited.size !== entries.length) return false;
  const difficulty = puzzle.difficulty as CrosswordDifficulty;
  const topTier = DIFFICULTIES.indexOf(difficulty) + 1;
  if (entries.filter((entry) => entry.tier === topTier).length < REQUIRED_TOP_TIER_WORDS[difficulty]) return false;
  const fingerprint = hashString(layoutFingerprint(entries.map((entry) => ({ ...entry, word: entry.answer })))).toString(36);
  if (puzzle.fingerprint !== fingerprint) return false;
  return true;
}

export function createCrosswordSession(puzzle: CrosswordPuzzle, startedAt = Date.now()): CrosswordSession {
  if (!validateCrosswordPuzzle(puzzle)) throw new Error("Cannot create a session from an invalid crossword puzzle.");
  if (!Number.isFinite(startedAt)) throw new Error("Crossword session start time must be finite.");
  return { puzzle, letters: {}, mistakes: 0, hints: 0, startedAt, completedAt: null };
}

export function validateCrosswordSession(session: unknown): session is CrosswordSession {
  if (!session || typeof session !== "object") return false;
  const value = session as Partial<CrosswordSession>;
  if (!value.puzzle || !validateCrosswordPuzzle(value.puzzle) ||
      !value.letters || typeof value.letters !== "object" ||
      !Number.isInteger(value.mistakes) || (value.mistakes ?? -1) < 0 ||
      !Number.isInteger(value.hints) || (value.hints ?? -1) < 0 ||
      !Number.isFinite(value.startedAt) ||
      !(value.completedAt === null || Number.isFinite(value.completedAt))) return false;
  return Object.entries(value.letters).every(([cellKey, letter]) =>
    Boolean(value.puzzle!.cells[cellKey]) && typeof letter === "string" &&
    (letter === "" || /^[A-Z]$/.test(letter)));
}

export function crosswordCellKey(row: number, column: number): string {
  return key(row, column);
}

export function checkCrosswordEntry(session: CrosswordSession, entryId: string): {
  session: CrosswordSession;
  correct: boolean;
} {
  if (session.completedAt !== null) return { session, correct: true };
  const entry = session.puzzle.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return { session, correct: false };
  const guess = Array.from({ length: entry.answer.length }, (_, index) =>
    session.letters[key(entry.row + (entry.direction === "down" ? index : 0), entry.column + (entry.direction === "across" ? index : 0))] ?? "");
  const correct = guess.every((letter, index) => letter === entry.answer[index]);
  const letters = { ...session.letters };
  if (correct) {
    entry.answer.split("").forEach((letter, index) => {
      const cellKey = key(entry.row + (entry.direction === "down" ? index : 0), entry.column + (entry.direction === "across" ? index : 0));
      letters[cellKey] = letter;
    });
  }
  const completed = correct && session.puzzle.entries.every((candidate) =>
    candidate.answer.split("").every((letter, index) => {
      const cellKey = key(candidate.row + (candidate.direction === "down" ? index : 0), candidate.column + (candidate.direction === "across" ? index : 0));
      return (letters[cellKey] ?? session.letters[cellKey]) === letter;
    }));
  return {
    session: {
      ...session,
      letters,
      mistakes: session.mistakes + (correct ? 0 : 1),
      completedAt: completed ? Date.now() : session.completedAt,
    },
    correct,
  };
}

export function revealCrosswordHint(session: CrosswordSession, entryId: string, random = Math.random): CrosswordSession {
  if (session.completedAt !== null) return session;
  const entry = session.puzzle.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return session;
  const empty = Array.from({ length: entry.answer.length }, (_, index) => ({
    key: key(entry.row + (entry.direction === "down" ? index : 0), entry.column + (entry.direction === "across" ? index : 0)),
    letter: entry.answer[index],
  })).filter((cell) => session.letters[cell.key] !== cell.letter);
  if (!empty.length) return session;
  const revealed = empty[Math.min(empty.length - 1, Math.floor(random() * empty.length))];
  const letters = { ...session.letters, [revealed.key]: revealed.letter };
  const completed = session.puzzle.entries.every((candidate) =>
    candidate.answer.split("").every((letter, index) => {
      const cellKey = key(candidate.row + (candidate.direction === "down" ? index : 0), candidate.column + (candidate.direction === "across" ? index : 0));
      return (letters[cellKey] ?? "") === letter;
    }));
  return {
    ...session,
    letters,
    hints: session.hints + 1,
    completedAt: completed ? Date.now() : null,
  };
}

export function seededCrosswordSeed(seed = Date.now()): number {
  return (seed >>> 0) || 1;
}

export function crosswordPuzzleFingerprint(puzzle: CrosswordPuzzle): string {
  return hashString(puzzle.entries
    .map((entry) => `${entry.number}:${entry.direction}:${entry.answer}:${entry.clue}`)
    .join("|")).toString(36);
}
