# Bautakt – Lastenheft

Stand: 24.11.2026 · Ergebnis des Planungsgesprächs (Grilling, 5 Runden)
Grundlage: Unterlagen „Integrale Planung“ WS 2026/27 (RWTH, ICoM/IMB/E3D), insbesondere
UE 05 „Termine, Kosten, Nachhaltigkeit“ und VL 03 „Integrale Kosten- und Terminplanung“.

Jede Entscheidung hat eine Nummer (E-xx). Änderungen werden hier eingetragen, nicht still umgesetzt.

---

## 1. Ziel und Rahmen

| Nr. | Entscheidung |
|---|---|
| E-01 | **Persönliches Werkzeug und Portfolio-Projekt.** Code so sauber, dass eine spätere Veröffentlichung (Open Source o. Ä.) möglich bleibt. |
| E-02 | **Einzelnutzer, lokal.** Ein Projekt = eine Datei. Datenformat mehrbenutzertauglich vorbereitet (UUIDs, Änderungsprotokoll). Kein Server, keine Konten. |
| E-03 | **Kern bis 20.12.2026** (Abgabe Phase 1 Planspiel). Nicht alles muss bis dahin fertig sein, aber der Termin-Kern muss stehen (siehe E-11). |
| E-04 | **Version 1 = Termine + Kosten.** Reihenfolge: zuerst Termine, dann Kosten. Nachhaltigkeit/CO₂, Variantenvergleich, Protokolle und BIM nicht in v1. |
| E-05 | **Zuerst nur Windows.** Technik plattformunabhängig, damit Mac/Linux/Web später ohne Neuschreiben möglich sind. |
| E-06 | **BIM-Reihenfolge nach v1:** IFC-Viewer + 5D (Mengen aus Modell → Kosten), danach 4D. Vorgänge und Kostenzeilen haben schon in v1 ein Feld für verknüpfte Bauteile/Mengenquelle. |
| E-07 | **Kennwerte:** Bautakt ergänzt den BKI-Kostenplaner, ersetzt ihn nicht. Keine BKI-Daten mitgeliefert, kein BKI-Import. Eigene Kennwert-Bibliothek mit Quellenpflicht, Stand und Index. (Für die Planspiel-Abgabe sind BKI-PDF und `.bkikpx` weiterhin mit dem BKI-Kostenplaner zu erstellen.) |
| E-08 | **Sprache: nur Deutsch.** Fachbegriffe nach DIN 276:2018-12, DIN 277:2021-08, DIN 69900:2009-01. Keine Mehrsprachigkeit vorgesehen. |

## 2. Technik

| Nr. | Entscheidung |
|---|---|
| E-09 | **Electron + React + TypeScript.** Rechenlogik als reine TS-Bibliothek ohne UI-Abhängigkeit. IFC später über That Open Engine (web-ifc + three.js); für schwere IFC-Analysen optional IfcOpenShell als Python-Hilfsprozess. |
| E-10 | **Projektdatei = SQLite**, eine Datei je Projekt, Endung `.bautakt`. Zusätzlich JSON-Export zum Sichern/Vergleichen. |
| E-26 | **Modularer Kern mit Plugin-System** (siehe E-35). |
| E-27 | **Arbeitsname „Bautakt“**, Dateiendung `.bautakt`. |
| E-38 | **Installation:** Windows-Installer (electron-builder/NSIS), ohne Code-Signatur (einmalige SmartScreen-Warnung akzeptiert). Versionen als GitHub Releases im privaten Repo. Auto-Update später. |
| E-39 | **Ablage:** Repo unter `Dokumente\Projekte\bautakt`, privates GitHub-Repo (Account vorhanden). Planungsdokumente als Markdown im Repo. |
| E-17 | **Qualitätssicherung:** automatische Tests der Rechenlogik mit Referenzbeispielen aus den Kursunterlagen (`docs/referenzbeispiele.md`). Feature fertig = Tests grün. |
| E-41 | **Datensicherheit:** Autospeichern alle 2 Minuten; beim Öffnen Sicherungskopie, die letzten 5 Versionen (`.bautakt.bak1–5`); ist die Datei bereits offen → zweites Öffnen schreibgeschützt mit Hinweis. Deutsches Zahlen-/Datumsformat, KW nach ISO. |
| E-42 | **Electron vorerst 42.x** (24.11.2026): better-sqlite3 liefert vorkompilierte Windows-Binaries nur bis Electron 42; Visual-Studio-Buildtools werden vorerst nicht installiert. Electron 42 erhält keine Sicherheitsupdates mehr – akzeptiert, da nur lokale Inhalte geladen werden. Upgrade, sobald Prebuilds für eine aktuelle Version vorliegen (siehe `architektur.md` Abschnitt 9). |

## 3. Terminplanung

### 3.1 Kern bis 20.12. (E-11)

1. Vorgangstabelle (Nr., Name, Dauer, Quelle/Annahme)
2. Anordnungsbeziehungen EA/AA/EE/AE mit Zeitabstand (auch negativ)
3. Vorwärts-/Rückwärtsrechnung, GP, FP, kritischer Pfad
4. Netzplan-Ansicht mit DIN-Vorgangsknoten (automatisch angeordnet, manuell verschiebbar, kritischer Pfad rot)
5. Vernetzter Balkenplan mit Meilensteinen und sichtbaren Pufferbalken
6. Export PDF (A3 quer) und PNG

Zusätzlich im Kern, weil sie das Fundament betreffen: Kalender (E-12), Soll-Ende und Bedingungen (E-19), Gliederung (E-14), Undo/Protokoll/Soll-Stände (E-22, E-32), Plugin-Gerüst (E-35), Hilfe-Seitenleiste Grundversion (E-29).

### 3.2 Festlegungen

| Nr. | Entscheidung |
|---|---|
| E-12 | **Zeit und Kalender:** Gerechnet wird intern in Arbeitstagen (AT) mit Projektkalender: Mo–Fr, gesetzliche Feiertage NRW automatisch, frei definierbare Ruhezeiten (z. B. Weihnachtspause, Winterbau). Anzeige wahlweise als AT-Zahl ab 0 (wie im DIN-Netzplan) oder als Datum. Zeitabstände je Beziehung wahlweise in **AT oder Kalendertagen (KT)** (technologische Pausen wie Ausschalfristen laufen auch am Wochenende). |
| E-13 | **Vorgangseigenschaften:** Nr., Name, Typ (Vorgang/Sammelvorgang/Meilenstein), Dauer, **Quelle/Annahme (Pflicht – leer → Warnung)**, eigenes Feld Anmerkung/Begründung, Gewerk, Rolle/verantwortlich, Risiko-Kommentar (im Plan angezeigt), Informationsbedarf „braucht“/„liefert“ (für Rollen-Netzplan), Herleitung der Dauer (Verknüpfung mit Aufwandswert-Rechner), Bauteil-Verknüpfung (leer bis BIM), Ort von–bis (E-31). Pflicht: Name, Dauer, Quelle/Annahme. |
| E-14 | **Gliederung und mehrere Pläne:** Sammelvorgänge in beliebiger Tiefe; der **Rahmenterminplan entsteht durch Zuklappen**, kein doppelter Pflegeaufwand. Ein Projekt kann **mehrere unabhängige Pläne** enthalten (z. B. „Rollen-Netzplan“, „Terminplan Gesamtprojekt“). Festlegung für den Kern: Anordnungsbeziehungen nur zwischen Einzelvorgängen und Meilensteinen; Sammelvorgänge sind reine Verdichtung (Anfang = min. Anfang, Ende = max. Ende der Kinder). |
| E-18 | **Eingabe:** Hauptansicht geteilt – links Tabelle, rechts Balkenplan; Netzplan als zweiter Reiter. Spalte „Vorgänger“ mit Kurzschrift (`1EA+10; 3EA+15; 4EA+30KT`, ohne Einheit = AT). Zusätzlich Verbindungen per Maus im Balken- und Netzplan. Sofortige Neuberechnung; Zirkelbezüge werden blockiert und mit Pfad markiert. |
| E-28 | **Langform:** Zusätzlich (a) Eingabedialog mit Feldern (Vorgänger, Art im Klartext „Ende → Anfang“, Abstand, AT/KT) und (b) ausgeschriebene Eingabe in der Spalte, z. B. `3 Ende-Anfang +15 Tage`. Intern gleich gespeichert; Anzeige kurz oder lang umschaltbar. |
| E-19 | **Soll-Ende und Bedingungen:** Projekt hat ein Soll-Ende (z. B. Start + 15 Monate). Standard: Rückwärtsrechnung vom berechneten Ende (wie in der Übung). Umschaltbar: Rückwärtsrechnung vom Soll-Ende → **negative Puffer** werden rot gezeigt (macht „15 Monate nicht erreicht“ sichtbar). Schnittstellentermine (z. B. „Übergabe des freien Baufelds“, „Freigabe der Aufstellflächen für die Forschungsgeräte“) als Meilensteine mit Bedingung „nicht früher als“ oder „muss enden am“. |
| E-20 | **Netzplan-Knoten exakt im Übungsformat:** oben „Nr. Vorgangsname“, Mitte FAZ \| Dauer \| FEZ, unten SAZ \| GP \| FP \| SEZ. Beziehung an den Pfeilen (z. B. „10EA“). Start- und Ende-Knoten als eigene Meilensteine. Kritischer Pfad rot und dick. Automatische Anordnung in Spalten nach FAZ, danach manuell verschiebbar, Positionen werden gespeichert. |
| E-21 | **Balkenplan für die Bauherrschaft:** Zeitachse KW/Monat/Quartal, zoombar; Sammelvorgänge als Klammerbalken; Meilensteine als Raute; Schnittstellentermine farbig hervorgehoben; GP als schraffierter Anschlussbalken; Soll-Ende-Linie und Heute-Linie; Risiko-Kommentare als nummerierte Hinweise mit Legende am Rand; Ruhezeiten grau hinterlegt; Druck mit Plankopf (Projekt, Stand, Ersteller, Legende). Farb-/Schriftvorlagen später. |
| E-30 | **Alle Formen von Terminplänen** als Ansichten auf dieselben Vorgänge: Terminliste, Meilensteinplan, Balkenplan (einfach und vernetzt), Netzplan, Liniendiagramm/Weg-Zeit-Diagramm mit Taktplanung, Meilenstein-Trendanalyse (MTA). Reihenfolge: Kern = Netzplan + vernetzter Balkenplan → Terminliste + Meilensteinplan → Liniendiagramm → MTA. |
| E-31 | **Ortsstruktur:** frei definierbar (z. B. Bauabschnitt → Geschoss → Achse/Station) mit Reihenfolge; Vorgänge erhalten Ortsbereich von–bis. Funktion „Vorgang über Takte vervielfältigen“ (gleiche Arbeit, mehrere Abschnitte, automatisch verkettet). Später Verknüpfung mit IFC-Geschossen/-Zonen. |
| E-24 | **Aufwandswert-Rechner:** Dauer [AT] = Menge × AW [h/ME] ÷ (AK × h/AT), mit benannten prozentualen Zu-/Abschlägen (Einarbeitung, Wiederholeffekt, Witterung/Winterbau), Rundung auf ganze AT, Übergabe an den Vorgang. Gespeichert wird **nur ein Rechenweg als Formelzeile**, kein Fließtext. Zusätzlich ein freies Feld für eigene Anmerkungen/Begründung. |

### 3.3 Soll-Ist Termine (E-22, E-32)

- **Soll** = eingefrorener, benannter Stand (z. B. „Soll Vertrag“, „Stand Sprechstunde 26.11.“); mehrere Soll-Stände möglich; Rücksprung auf einen Stand möglich.
- **Ist-Erfassung** je Vorgang: Ist-Anfang, Ist-Ende, Fertigstellungsgrad %, Restdauer, Abweichungsursache.
- **Abweichungsursachen** (feste Liste + Freitext): Witterung, Lieferverzug, Planänderung, Personal, Baugrund, Sonstiges.
- **Stichtag** → Neuberechnung (Prognose).
- Balkenplan: Soll-Balken dünn unter Ist-/Prognose-Balken.
- Datenmodell und Soll-Stände im Kern; Ist-Erfassung und Vergleichsansicht als erstes nach dem 20.12.

| Nr. | Entscheidung |
|---|---|
| E-43 | **Prognose begonnener Vorgänge** (26.11.2026): Eine eingetragene **Restdauer** ist maßgebend; fehlt sie, gilt Rest = ⌈Dauer × (100 − Fertigstellungsgrad) / 100⌉ AT. Prognostiziertes Ende = Stichtag + Rest. Für begonnene Vorgänge ist Restdauer oder Fertigstellungsgrad Pflicht. |
| E-44 | **Nicht begonnene Vorgänge** beginnen in der Prognose **frühestens am Stichtag** (FAZ ≥ Stichtag), zusätzlich zu ihren Anordnungsbeziehungen. |
| E-45 | **Ist-Verlauf:** Ist-Meldungen werden **je Stichtag** gespeichert (Verlauf bleibt erhalten). Die Prognose nutzt je Vorgang die jüngste Meldung bis zum gewählten Stichtag. |
| E-46 | **Soll-Ist-Vergleich** gegen einen **wählbaren Soll-Stand**; vorbelegt mit dem jüngsten Stand der Art „Soll“. |
| E-47 | **Terminliste:** Vorgänge in Gliederungsreihenfolge mit Nr., Vorgang, Gewerk, Verantwortlich, Dauer, Anfang, Ende, GP, Quelle/Annahme; mit Stichtag zusätzlich %, mit Soll-Vergleich Soll-Ende und Abw. Filter nach Gewerk, Verantwortlich und Zeitraum (nächste 2/4/8 Wochen ab Stichtag bzw. heute oder frei von–bis; ein Vorgang passt, wenn er den Zeitraum berührt). Sammelvorgänge bleiben sichtbar, solange ein Unterpunkt passt. Wahlweise **gruppiert nach Gewerk** (je Gruppe chronologisch, ohne Sammelvorgänge, „ohne Gewerk“ zuletzt). |
| E-48 | **Meilensteinplan:** Zeitleiste mit Rauten (Schnittstellentermine orange, Soll-Termin als graue Raute, Stichtag/Soll-Ende/Heute als Linien) und darunter Tabelle aller Meilensteine chronologisch: Nr., Meilenstein, Termin, GP, Soll-Termin, Abw., Bedingung, Bedingungsdatum, Schnittstelle, Verantwortlich. |
| E-49 | **Terminliste und Meilensteinplan sind direkt bearbeitbar** (Nr., Name, Gewerk, Verantwortlich, Dauer, Quelle/Annahme bzw. Bedingung, Schnittstelle) – über dieselben Befehle wie der Terminplan. Wird eine Bedingung ohne Datum gewählt, wird der aktuelle Termin des Meilensteins vorbelegt. |
| E-50 | **Export** beider Ansichten als PDF (A3 quer, mehrseitig) oder PNG mit Plankopf, wie Balkenplan und Netzplan; Filter und Gruppierung der Terminliste werden übernommen und im Fuß genannt. |
| E-51 | **Bibliothek versioniert statt Undo:** Jede Änderung eines Bibliothekseintrags legt eine neue Version an (id + Version); Löschen blendet den Eintrag aus (ebenfalls als Version). Alte Versionen bleiben lesbar. Kein Rückgängig-Stapel für die Bibliothek. Quelle ist Pflicht, dazu Stand (z. B. Jahr). |
| E-52 | **Umfang M6:** Bibliothek-Gerüst und **Aufwandswerte** (Bezeichnung, Gewerk, Einheit, h/ME, Quelle, Stand, Anmerkung). Die Kennwert-Tabelle folgt mit dem Kosten-Plugin (M7). |
| E-53 | **Zu-/Abschläge werden addiert:** Lohnstunden × (1 + Σ Prozent). Formelzeile z. B. `650 m² × 0,50 h/m² = 325 h × (1 + 15 % Winterbau) = 373,75 h ÷ (4 × 8 h) = 11,7 → 12 AT`. Immer aufrunden auf ganze AT; die exakte Dauer steht mit einer Nachkommastelle (zwei, wenn eine Stelle eine ganze Zahl vortäuschen würde). |
| E-54 | **Übernahme in den Vorgang:** Gespeichert werden die Formelzeile (Herleitung), die Eingaben (Menge, AW, AK, h/AT, Zu-/Abschläge) zum erneuten Öffnen und die **eingefrorene Kopie** des Bibliothekswerts (id, Version, Werte, Quelle, Stand). Leere Quelle/Annahme wird mit „AW <Bezeichnung> (<Quelle>, <Stand>)“ vorbelegt. Gibt es eine neuere Bibliotheksversion, zeigt Bautakt einen Hinweis; umgestellt wird nur auf Klick. Wird die Dauer danach von Hand geändert, weist Bautakt auf die Abweichung zur Herleitung hin. Eigene Aufwandswerte ohne Bibliothek sind erlaubt (mit Quelle). |
| E-55 | **KG-Katalog** komplett bis zur 3. Ebene (KG 100–800, nur Nummer und Kurzbezeichnung, kein Normtext; aus Fachwissen erstellt, gegen DIN 276:2018-12 zu prüfen). **Eine Kostenzeile je KG**; übergeordnete KG ergeben sich aus dem Katalog und summieren automatisch. Bezeichnung je Zeile überschreibbar. Vorgeschlagene Bezugseinheit: KG 100/200 → GF, 300/400/600/700/800 → BGF, 500 → AF. |
| E-56 | **Index je Zeile:** Standard KKW × Index aktuell ÷ Index zum Stand des Kennwerts. Je Zeile abschaltbar oder mit eigenem Faktor – dann ist eine **Begründung Pflicht**. Fehlt ein Indexwert, rechnet Bautakt mit Faktor 1 und zeigt einen Hinweis. |
| E-57 | **Rundung:** KKW wirksam = KKW gewählt × Indexfaktor × Regionalfaktor, auf Cent gerundet; Kosten = Menge × KKW wirksam, auf Cent; Summen aus den gerundeten Zeilen; MwSt. auf die Summen, auf Cent. |
| E-58 | **Kennwerte in der Bibliothek** (Bezeichnung, KG, Bezugseinheit, Von/Mittel/Bis, Quelle, Stand, Index zum Stand, Gebäudeart, Anmerkung), versioniert wie E-51. Übernahme in eine Kostenzeile friert Werte, Quelle, Stand und Index ein; KKW gewählt wird mit Mittel vorbelegt. Hinweis bei neuerer Version (Umstellen nur auf Klick) und wenn KKW gewählt außerhalb der indexierten Spanne liegt. Menge einer Zeile kann an eine DIN-277-Fläche gekoppelt werden und folgt ihr dann automatisch. |
| E-59 | **Export der Kostentabelle** als PDF (A3 quer) bzw. PNG mit Plankopf, Flächen und Summen (netto, MwSt., brutto, maßgebend); Excel folgt mit M9. |
| E-60 | **Stufen füllen:** Kostenrahmen, Kostenschätzung und Kostenberechnung werden aus der aktuellen Planung **festgeschrieben** (Kopie der maßgebenden Zeilenkosten je KG, ersetzt die Stufe), danach je KG von Hand korrigierbar; Summen wie in der Planung (Untergruppen maßgebend). **Kostenanschlag = Σ Aufträge**, **Kostenfeststellung = Σ Rechnungen** je KG, automatisch und additiv über den KG-Baum. |
| E-61 | **Vergleich gegen wählbare Bezugsstufe** (Standard Kostenberechnung). **Prognose** je KG = Aufträge bzw. Rechnungen (der höhere Wert), wo schon vergeben, sonst Bezugswert; gerechnet auf den maßgebenden KG der Bezugsstufe, Aufträge darunter werden ihrer KG zugeordnet. Abweichung = Prognose − Bezug, absolut und in %. |
| E-62 | **Aufträge und Rechnungen** (netto): KG, Bezeichnung, Auftragnehmer bzw. Rechnungssteller, Betrag, Datum, Beleg-Nr., Anmerkung, optional **Anhang als Verweis auf eine Datei** (Pfad; Öffnen mit dem Standardprogramm nur für Dokument- und Bildformate, fehlende Dateien werden markiert). Eine Rechnung kann einem Auftrag zugeordnet sein (dann gilt dessen KG); je Auftrag werden abgerechnet und offen angezeigt. |
| E-63 | **Ursache je KG** aus der Liste Planungsänderung, Nutzerwunsch/Nachtrag, Mengenänderung, Marktpreise/Ausschreibung, Baugrund/Bestand, Behördenauflage, Sonstiges, dazu eigener Text. Export der Soll-Ist-Tabelle als PDF/PNG wie die Kostentabelle. |
| E-64 | **Kosten-Excel** (eine Arbeitsmappe): Blatt **Kostentabelle** im Aufbau KG | Bezeichnung | Menge | Einheit | KKW von | KKW mittel | KKW bis | KKW gewählt | Faktor Index×Region | KKW wirksam | Kosten netto | Anteil % | Quelle/Stand | Kommentar, Ebenen 1–3 eingerückt, darunter Summe netto, MwSt., brutto, maßgebend (dieser Aufbau gilt als „Dynexite-Aufbau“, bis eine Vorlage vorliegt); dazu Blätter **Flächen DIN 277**, **Soll-Ist**, **Aufträge**, **Rechnungen**. |
| E-65 | **Formeln mit Ergebnis:** KKW wirksam = RUNDEN(KKW gewählt × Faktor; 2), Kosten = RUNDEN(Menge × KKW wirksam; 2), Summen = SUMME der maßgebenden Unterzeilen, MwSt. = RUNDEN(netto × Satz; 2), an Flächen gekoppelte Mengen verweisen auf das Flächenblatt, NUF/NRF/BGF als Summenformeln; Abweichungen im Soll-Ist als Formeln. Die von Bautakt berechneten Werte stehen als Ergebnis in den Zellen. |
| E-66 | **Vorgangsliste-Excel:** alle Vorgänge des Plans mit Gliederung (Excel-Gruppierung): Nr., Vorgang, Typ, Dauer, Vorgänger, FAZ, FEZ, SAZ, SEZ, GP (= SAZ − FAZ als Formel), FP, Anfang, Ende, kritisch, Gewerk, Verantwortlich, Quelle/Annahme, Herleitung; mit Stichtag zusätzlich %, mit Soll-Vergleich Soll-Ende und Abw. |
| E-67 | **Ortsstruktur je Projekt** (für alle Pläne), beliebig tief mit Reihenfolge. Ort von/bis eines Vorgangs darf auf jeder Ebene liegen; ein übergeordneter Ort umfasst alle seine Unterorte. |
| E-68 | **Liniendiagramm** (Weg-Zeit-Diagramm), Ausrichtung **umschaltbar**: Zeit waagerecht und Orte senkrecht (erster Ort unten, Standard) oder Orte waagerecht und Zeit nach unten. Jeder Vorgang mit Ort ist eine Linie von (Anfang, Beginn „Ort von“) nach (Ende, Ende „Ort bis“); Farbe je Gewerk, kritischer Weg rot, Meilensteine als Raute. Sammelvorgänge und Vorgänge ohne Ort werden nicht gezeichnet (Anzahl wird angezeigt). |
| E-69 | **Über Takte vervielfältigen (Taktzug):** ein oder mehrere aufeinanderfolgende Vorgänge und eine Auswahl von Orten. Je Ort eine Kopie (Nr. „5.1, 5.2 …“, Name „… – Ort“), gleiche Arbeit von Ort zu Ort EA-verkettet, innerhalb eines Orts die gewählten Vorgänge in ihrer Reihenfolge EA-verkettet. Die Originale werden Sammelvorgänge mit den Kopien darunter; Vorgänger der Originale (außerhalb des Taktzugs) gehen an den ersten Ort, Nachfolger an den letzten. Nicht möglich bei Sammelvorgängen, Meilensteinen und Vorgängen mit Ist-Meldungen; eine Herleitung (Aufwandswert) des Originals entfällt. Rückgängig wie jeder Befehl. |
| E-70 | **Taktdauer** je Vorgang im Dialog, Vorschlag ⌈Dauer ÷ Anzahl Orte⌉; alle Kopien eines Vorgangs gleich, danach einzeln änderbar. Quelle/Annahme der Kopien = Quelle des Originals mit Zusatz „(Takt j/n)“. |
| E-71 | **MTA-Berichte:** „Berichtsstand festhalten“ speichert je Plan zum Berichtsdatum (Stichtag, ohne Stichtag heute) für jeden Meilenstein den aktuell prognostizierten Termin und ob er erreicht ist. Ein zweiter Bericht am selben Datum ersetzt den ersten. Berichte sind einzeln löschbar; Stände kopieren sie nicht (Verlauf bleibt). Der aktuelle, noch nicht festgehaltene Stand wird gestrichelt angehängt. |
| E-72 | **MTA-Diagramm:** waagerecht Berichtsdatum, senkrecht Meilensteintermin (später = oben), beide Achsen im gleichen Maßstab mit Diagonale (Termin = Berichtsdatum); je Meilenstein eine Linie, Schnittstellentermine hervorgehoben, erreichte Meilensteine enden mit gefüllter Raute. Meilensteine auswählbar (Standard alle, Auswahl wird gemerkt). Darunter Tabelle der Termine je Bericht mit Verschiebung gegenüber dem ersten Bericht in Kalendertagen (+ = später). |
| E-73 | **Export der MTA** als PDF (A3 quer) bzw. PNG mit Plankopf, Diagramm und Tabelle. |
| E-74 | **Beobachtungen Termine:** nur fertige Vorgänge (Ist-Anfang und Ist-Ende). Soll = Dauer im jüngsten Soll-Stand (sonst aktuelle Plandauer), Ist = Ist-Dauer in AT, Faktor = Ist ÷ Soll. Schlüssel: Aufwandswert der Bibliothek (falls die Dauer damit hergeleitet ist), Gewerk, Abweichungsursache der jüngsten Ist-Meldung. |
| E-75 | **Beobachtungen Kosten:** je KG Soll = Kostenberechnung (sonst Schätzung, sonst Rahmen), Ist wahlweise **Kostenfeststellung** (Σ Rechnungen, nur wo Rechnungen vorliegen) oder **Prognose** (Aufträge bzw. Rechnungen); in der Auswertung umschaltbar. Je Bibliothekskennwert Soll = KKW wirksam, Ist = Ist-Kosten ÷ Menge (gleiche Umschaltung). Schlüssel: KG, Kennwert, Abweichungsursache der KG. |
| E-76 | **Übertragen:** in der Statistik „Projekt übertragen“ (jederzeit) bzw. „Projekt abschließen und übertragen“; ein erneutes Übertragen ersetzt die Beobachtungen dieses Projekts. Projektmerkmale: Gebäudeart und Bauweise als Freitext mit Vorschlägen bereits verwendeter Werte, BGF automatisch aus den Kosten-Flächen, Schalter **„zählt in Statistik“** (Standard ja; nicht zählende Projekte bleiben gespeichert, werden aber nicht ausgewertet). n zählt Beobachtungen; die Anzahl der Projekte wird mit angezeigt. |
| E-77 | **Auswertung** je Schlüssel: n, Projekte, Mittelwert, Median, Streuung (Standardabweichung), Min/Max des Ist/Soll-Faktors; Kennzahlen erst ab **n ≥ 3**. Filter nach Gebäudeart, Bauweise und BGF-Bereich. Diagramm: mittlerer Faktor je Schlüssel mit Spanne Min–Max und Median, Bezugslinie 1,0. |
| E-78 | **Vorschläge** bei n ≥ 3 und mittlerem Faktor **mindestens 5 %** von 1 entfernt, z. B. „AW Schalung Wände im Mittel 18 % zu niedrig (n = 4) – Bibliothekswert anpassen?“. Neuer Wert = aktueller Bibliothekswert × mittlerer Faktor als Vorschlag in einem Dialog, änderbar; gespeichert wird nur auf Klick (neue Bibliotheksversion), nie automatisch. |
| E-79 | **MS-Project-XML (MSPDI) – Import** wahlweise als **neuer Plan** oder **Ersatz des gewählten Plans** (Auswahl im Dialog); ein Befehl, also Rückgängig möglich. |
| E-80 | **MS-Project-XML – Export** eines Plans: Vorgänge mit Gliederung, Dauern, Anordnungsbeziehungen (EA/AA/EE/AE ↔ EA/AA/EE/AE mit Abstand in AT bzw. KT), Meilensteine, Bedingungen, Kalender (Arbeitstage, Feiertage und Ruhezeiten als Ausnahmen), Quelle/Annahme, Gewerk und Verantwortlich als Notiz, berechnete Termine; dazu Statusdatum = Stichtag mit Ist-Anfang, Ist-Ende, % fertig sowie der Soll-Vergleichsstand als Basisplan (Basisplan 0). |
| E-81 | **Abweichungen beim Import:** Dauern und Abstände auf ganze AT bzw. KT gerundet (Dauern aufgerundet), „Anfang nicht früher als“ und „Muss anfangen am“ → „nicht früher als“, „Muss enden am“ → „muss enden am“; Ressourcen, übrige Einschränkungsarten, Beziehungen an Sammelvorgängen und Basispläne werden weggelassen. Nach dem Import ein **Bericht**, was gerundet oder weggelassen wurde. Fehlt eine Quelle/Annahme, wird „Import MS Project (<Datei>)“ eingetragen. |
| E-82 | **XML lesen mit fast-xml-parser** (MIT, kleine gepflegte Bibliothek); geschrieben wird die XML-Datei selbst. |
| E-83 | **Glossar mit Hover:** Fachbegriffe sind in Tabellenköpfen, Kennzahlen und wichtigen Feldbeschriftungen sowie automatisch in allen Hilfetexten gepunktet unterstrichen; beim Darüberfahren (oder mit der Tastatur fokussiert) erscheint eine kurze Erklärung mit Mini-Beispiel. In der Hilfe-Seitenleiste eine durchsuchbare **Glossar-Seite**. Erklärungen in eigenen Worten, kein Normtext. |
| E-84 | **Erststart-Tour:** beim allerersten Start etwa 6 Schritte mit hervorgehobenen Bedienelementen (Begrüßung, Reiter, Projekt anlegen, Bibliothek/Statistik, Hilfe und Glossar, typischer Ablauf); überspringbar, danach nicht mehr automatisch, über die Hilfe jederzeit neu startbar. Fehlt ein Bedienelement (z. B. ohne Projekt), steht der Schritt in der Mitte. |
| E-85 | **Leere Ansichten** (Vervollständigung von E-29): jede Ansicht ohne Inhalt nennt den nächsten Schritt und bietet, wo möglich, den passenden Knopf an. |

### 3.4 Undo und Änderungsprotokoll (E-22)

- Unbegrenztes Undo/Redo in der Sitzung.
- Dauerhaftes Änderungsprotokoll in der Projektdatei (wann, was, alt → neu, optional Grund), exportierbar.

## 4. Kostenplanung

| Nr. | Entscheidung |
|---|---|
| E-15 | **Kostenmodell:** KG-Baum nach DIN 276 bis 3. Ebene; Zeile = Menge, Einheit, KKW Von/Mittel/Bis/Gewählt, Kosten, Kommentar (+ eigenes Anmerkungsfeld). Bezugseinheit je KG vorgeschlagen (KG 300/400/600/700 → BGF, 500 → AF, 200 → GF), überschreibbar. Flächen nach DIN 277 in eigener Flächentabelle (BGF = KGF + NRF; NRF = NUF + TF + VF; dazu AF, GF), automatische Ableitung und Übernahme in die Kosten. Summen nach oben automatisch; existieren Unterzeilen, sind diese maßgebend. |
| E-16 | **Index, Region, Steuer:** Jeder Kennwert speichert seinen Stand (z. B. „BKI 2025, Q1“) und wird mit dem Baupreisindex (Destatis; in v1 manuell mit Quelle eingetragen) auf den aktuellen Stand hochgerechnet; Regionalfaktor (z. B. Aachen); MwSt. 19 %; Schalter „Bauherrschaft vorsteuerabzugsberechtigt“ → netto bzw. brutto maßgebend. Abweichung vom Index nur mit Begründungsfeld. Automatischer Index-Abruf (Destatis-Schnittstelle) später. |
| E-33 | **Soll-Ist Kosten:** Je Kostenzeile die Stufen nach DIN 276 nebeneinander: Kostenrahmen → Kostenschätzung → Kostenberechnung → Kostenanschlag → Kostenfeststellung. Ist: Aufträge und Rechnungen (Betrag, Datum, KG-Zuordnung, Beleg-Nr., optional Anhang). Abweichungen je KG absolut und in %, mit Ursachenliste. |

## 5. Bibliotheken, Statistik

| Nr. | Entscheidung |
|---|---|
| E-23 | **Bibliotheken (Kennwerte, Aufwandswerte) global** in eigener Datei im App-Datenordner. Bei Verwendung im Projekt wird der Wert **als Kopie im Projekt eingefroren** (mit Quelle, Stand). Bibliotheksänderungen verändern alte Projekte nicht; Hinweis, wenn es eine neuere Version gibt. |
| E-34 | **Projektübergreifende Statistik:** **Erfahrungsdatenbank** im App-Datenordner. Kennzahlen werden beim Markieren als „abgeschlossen“ (oder auf Knopfdruck zwischendurch) übertragen; Projektdateien bleiben unabhängig. Vergleichsschlüssel: Aufwandswert-/Kennwert-ID der Bibliothek, Gewerk, KG, Abweichungsursache, Gebäudeart, BGF, Bauweise. Auswertung: Mittelwert, Median, Streuung, Ist/Soll-Faktor je Schlüssel, erst ab **n ≥ 3**, mit Diagrammen. Rückkopplung **nur als Vorschlag** („AW Schalung Wände im Mittel 18 % zu niedrig – Bibliothekswert anpassen?“), nie automatisch. Schalter je Projekt **„zählt in Statistik“** (Übungs-/Planspielprojekte ausschließen). |

## 6. Import/Export

| Nr. | Entscheidung |
|---|---|
| E-11/E-25 | Kern: PDF (A3 quer) und PNG. Danach **Excel-Export** (Vorgangsliste; Kostentabelle im Aufbau der Dynexite-Tabelle), danach **MS-Project-XML** (Im- und Export). **GAEB** und **IFC** erst in der BIM-Phase. |

## 7. Bedienung und Hilfe

| Nr. | Entscheidung |
|---|---|
| E-29 | **Hilfe für Neulinge:** Hilfe-Button (F1) → kontextabhängige Seitenleiste zur aktuellen Ansicht (typische Abläufe in 3–5 Schritten, Tastenkürzel der Ansicht, Bedienhinweise). **Glossar** aller Fachbegriffe mit Mini-Beispielen, Begriffe in der App per Hover erklärt. **Leere Ansichten** sagen, was als Nächstes zu tun ist. Optionale kurze Tour beim ersten Start. Alles offline; Hilfetexte als Markdown im Repo, jedes Plugin bringt seine eigene Hilfe mit. |

## 8. Architektur und Erweiterbarkeit

| Nr. | Entscheidung |
|---|---|
| E-35 | **Plugin-System:** Ein Plugin kann eigene Ansichten, Menüpunkte und Hilfeseiten mitbringen, eigene Tabellen in der Projektdatei anlegen (mit Versionierung/Migrationen), Rechenfunktionen, Importe und Exporte bereitstellen, auf Ereignisse reagieren („Vorgang geändert“) und über definierte Schnittstellen Daten anderer Plugins lesen. **Termine, Kosten, Bibliothek, Statistik und BIM sind selbst Plugins** auf einem schlanken Kern. Im Kern bis 20.12.: Gerüst + ein echtes Plugin (Termine). |
| E-36 | **Nur eigene Plugins** (aus dem Repo). Fremde Plugins aus lokalem Ordner erst später, dann mit Warnung, Bestätigung und Liste der angeforderten Rechte. Kein Marktplatz. |

## 9. BIM

| Nr. | Entscheidung |
|---|---|
| E-37 | **IFC und 5D:** Lesen IFC2x3 und IFC4, IFC4.3 später; Schreiben vorerst nicht. Mengen zuerst aus BaseQuantities (`Qto_WallBaseQuantities` usw.), sonst aus Geometrie berechnet – Herkunft jeder Menge sichtbar. Zuordnung IFC → KG über **editierbare Regeltabelle** (z. B. `IfcWall + IsExternal + LoadBearing → 331`, `IfcSlab ROOF → 361`) mit manueller Überschreibung je Bauteil. DIN-277-Flächen aus `IfcSpace`. Reimport: Wiedererkennung über **GlobalId**, Änderungsbericht (neu/geändert/gelöscht → betroffene Vorgänge und Kosten). |
| E-40 | **Kein eigener Modellierer.** Modelliert wird in Autorenwerkzeugen – ausdrücklich **BIMCraft und FreeCAD** (sowie Revit, Archicad …). Austausch über IFC, **ohne Abhängigkeit** von einem bestimmten Werkzeug. Testmodelle für den BIM-Ausbau aus BIMCraft- und FreeCAD-IFC-Exporten. Direkte Kopplung (z. B. BIMCraft-CLI, FreeCAD-Schnittstelle: „Modell geändert → neu einlesen“) später als optionale Plugins. |
| E-86 | **IFC-Modelle eingebettet:** Eingelesene IFC-Dateien werden in die Projektdatei kopiert („ein Projekt = eine Datei“ bleibt). Der Kern führt dafür eine Dateiablage: jede Datei einmal, adressiert über ihren SHA-256-Hash, außerhalb von Undo und Änderungsprotokoll; Plugin-Zeilen verweisen nur auf den Hash. Nicht mehr verwiesene Dateien entfernt der Kern beim Öffnen. Der JSON-Export enthält nur Hash und Größe. |
| E-87 | **Viewer mit web-ifc + three.js direkt** (statt @thatopen/components, abweichend von E-09/Architektur 7): weniger Abhängigkeiten, eigene Werkzeuge für Auswahl, Ein-/Ausblenden, Schnitt und Messen. Bauteildaten (Attribute, Psets, BaseQuantities, Geschoss) liest der Main-Prozess beim Einlesen und speichert sie im Projekt; die Geometrie erzeugt ein Worker im Renderer. |
| E-88 | **Mehrere Modelle je Projekt** (z. B. Architektur, Tragwerk, TGA): werden gemeinsam angezeigt, sind einzeln ein-/ausblendbar und löschbar (Undo). Neu einlesen mit Abgleich über GlobalId folgt in B3. |
| E-89 | **Werkzeuge des IFC-Viewers (B1):** Auswahl im Modell oder in der Bauteilliste (Modell → Geschoss → IFC-Klasse) mit Eigenschaften-Leiste (Attribute, Psets, BaseQuantities); Ein-/Ausblenden und Isolieren je Bauteil, Klasse oder Geschoss, „alles zeigen“; Schnittebene als Geschossschnitt oder frei verschiebbar entlang X/Y/Z; Messen des Abstands zweier Punkte auf Bauteiloberflächen (in m). Sichtbarkeit, Schnitt und Messungen sind Ansichtszustand und werden nicht im Projekt gespeichert. |
| E-90 | **Regeltabelle IFC → KG je Projekt** (Änderungen mit Undo und Protokoll), beim Anlegen mit Standardregeln vorbelegt, jederzeit auf die Standardregeln zurücksetzbar. Eine Regel: IFC-Klasse (einschließlich Unterklassen, z. B. IfcWall auch für IfcWallStandardCase), optional PredefinedType, außen (IsExternal) ja/nein/beliebig, tragend (LoadBearing) ja/nein/beliebig und „Name/Typ enthält“ → KG und Mengenart. Die erste passende Regel in der Reihenfolge gilt. Je Bauteil ist eine **manuelle Überschreibung** möglich (andere KG und Mengenart oder „keiner KG zuordnen“), gespeichert über die GlobalId. Räume (IfcSpace) werden keiner KG zugeordnet (Flächen folgen in B3). |
| E-91 | **Mengenart je Regel:** Fläche (m²), Volumen (m³), Länge (m) oder Stück (Stk). Gewählt wird je Bauteil zuerst die passende BaseQuantity (Fläche: NetSideArea, NetArea, GrossSideArea, GrossArea, Area, NetFootprintArea, GrossFootprintArea; Volumen: NetVolume, GrossVolume, Volume; Länge: Length), sonst die Menge aus der Geometrie. |
| E-92 | **Mengen aus der Geometrie**, wenn BaseQuantities fehlen: Volumen aus dem Netz, **Hauptfläche** = Fläche der größten Ansichtsseite (Wand: Seitenfläche, Decke: Oberseite), Stück. Eine Länge gibt es nur aus BaseQuantities. Die Herkunft jeder Menge („BaseQuantities“ mit Name bzw. „Geometrie“) ist in Eigenschaften und Bauteilliste sichtbar. Ermittelt beim Einlesen; Modelle, die vor B2 eingelesen wurden, müssen für Mengen neu eingelesen werden (Hinweis). |
| E-93 | **Übergabe an Kosten live gekoppelt:** Eine Kostenzeile kann als Mengenquelle „Modell (IFC)“ haben. Ihre Menge ist dann die Summe der Bauteile dieser KG und ihrer Unter-KG (in der Einheit der Mengenart) und folgt jeder Änderung an Modellen, Regeln und Zuordnungen automatisch – wie die Kopplung an Flächen. Hinweise bei: keine Bauteile, Bauteile ohne passende Menge, gemischte Mengenarten (es zählt die häufigste), Zeileneinheit passt nicht zur Modellmenge. Soll-Stände frieren Menge und Kosten wie bisher ein. |
| E-94 | **Räume → DIN-277-Kategorie** (NUF 1–7, TF, VF) über eine **Raumregeltabelle je Projekt** wie E-90: „Name/Langname/Typ/Eigenschaftswert enthält …“ → Kategorie, erste passende Regel gilt, vorbelegt mit eindeutigen Begriffen (z. B. Flur/Treppe → VF, Technik/Heizung → TF, WC/Sanitär → NUF 7, Büro → NUF 2, Wohnen/Schlafen/Küche → NUF 1, zuletzt „sonst“ → NUF 1). Je Raum ist eine Zuordnung von Hand möglich (andere Kategorie oder „nicht zählen“), über die GlobalId. Grundfläche eines Raums: NetFloorArea, sonst GrossFloorArea (BaseQuantities), sonst Projektion der Geometrie von oben. |
| E-95 | **Flächen live aus dem Modell:** In der Flächentabelle der Kosten ist je Kategorie NUF 1–7, TF und VF die Quelle „von Hand“ oder „aus dem Modell“ wählbar; aus dem Modell ist sie die Summe der zugeordneten Räume aller Modelle und folgt Modell, Raumregeln und Zuordnungen automatisch. KGF, AF und GF bleiben von Hand; NUF, NRF und BGF werden wie bisher abgeleitet. Soll-Stände frieren die Werte ein. |
| E-96 | **Neu einlesen** eines Modells mit **Vorschau**: Bautakt liest die neue Datei, gleicht die Bauteile über die GlobalId ab und zeigt vorab einen Änderungsbericht – neu, geändert (Klasse, Name, Typ, Geschoss, Merkmale, Mengen) und entfernt, dazu die betroffenen Kostenzeilen und Flächen „aus dem Modell“ mit altem und neuem Wert. Erst „Übernehmen“ ersetzt das Modell (ein Undo-Schritt). Bauteile mit gleicher GlobalId behalten ihre Identität; Zuordnungen von Hand bleiben über die GlobalId erhalten. Betroffene Vorgänge folgen mit der 4D-Verknüpfung (B4). |
| E-97 | **Claude-Assistent als Plugin:** eine Seitenleiste „Claude“ beantwortet Fragen zum geöffneten Projekt über lesende Werkzeuge (Pläne, Vorgänge, Termine, Puffer, Kosten, Flächen, Modelle, Bauteile, Hilfe/Glossar). Änderungen schlägt Claude als Befehle vor; sie laufen erst nach Klick auf „Ausführen“ als normale Befehle (Undo, Änderungsprotokoll mit Grund „Vorschlag von Claude“). |
| E-98 | **KI-Entwürfe für Freitextfelder** (Ausnahme zur Regel „keine generierten Begründungstexte“, gilt nur für das Claude-Plugin): Auf Anfrage darf Claude Texte für Felder wie Quelle/Annahme, Anmerkung, Begründung, Risiko oder Kommentar vorschlagen. Sie werden als Vorschlag angezeigt, erst nach Bestätigung übernommen und beginnen mit der Kennzeichnung „[KI-Entwurf] “, die der Nutzer nach Prüfung selbst entfernt. Bautakt selbst erzeugt weiterhin keine Begründungen. |
| E-99 | **Anbindung über Claude Managed Agents** (Beta): Anthropic betreibt die Agent-Schleife, die Bautakt-Werkzeuge laufen lokal in der App (Custom Tools). Modell Claude Opus 5.5. Je Projekt eine Sitzung; „Neues Gespräch“ beginnt eine neue, „Verlauf löschen“ löscht sie bei Anthropic. Kosten: Tokens plus Sitzungslaufzeit; der Sitzungsverlauf liegt bei Anthropic, bis er gelöscht wird. |
| E-100 | **Zugang und Datenschutz:** eigener Anthropic-API-Schlüssel, einmal eingegeben, mit dem Windows-Schutz der App verschlüsselt im App-Datenordner gespeichert, nie in der Projektdatei. Vor dem ersten Senden je Projekt fragt Bautakt, ob Projektdaten an Anthropic übertragen werden dürfen; die Zustimmung gilt für das Projekt und ist widerrufbar. |

## 10. Bewusst nicht im Umfang (vorerst)

- Mehrbenutzerbetrieb, Server, Cloud-Synchronisation
- Mac/Linux/Web-Version
- Nachhaltigkeit/CO₂-Bilanz, EPD/Ökobaudat, EU-Taxonomie, Variantenvergleich
- Besprechungsprotokolle
- IFC schreiben, Kollisionsprüfung, BCF, CDE
- Automatische Textgenerierung für Begründungen

## 11. Bezug zum Planspiel (Phase 1, Abgabe 20.12.2026)

Bautakt soll die Aufgaben der Rolle Termine & Kosten unterstützen:

- **F.1 Netzplan „Rollen und Informationsbedarfe“** – Plan mit Rollen-Aufgaben (Rolle, braucht/liefert), DIN-69900-Knoten, kritischer Pfad.
- **F.2 Projektterminplan** – Rahmenterminplan (15 Monate prüfen, Soll-Ende), Bauausführung ≥ 8 Vorgänge, Abhängigkeiten, Meilensteine, Schnittstellentermine, offene Puffer, Dauer + Quelle/Annahme je Vorgang, Risiken als Kommentar; Herleitung von 2 Rohbaudauern (Aufwandswerte, 4 AK × 8 h).
- **F.3 Kostenplanung** – erst nach dem Kern; die BKI-Abgabe bleibt im BKI-Kostenplaner.

Hinweise: Begründungstexte schreibt der Nutzer selbst. Laut Planspielregeln ist die Nutzung KI-gestützter Werkzeuge im Literaturverzeichnis zu dokumentieren – dazu gehört, dass Bautakt mit Claude Code programmiert wurde.
