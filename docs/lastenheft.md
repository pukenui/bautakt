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
