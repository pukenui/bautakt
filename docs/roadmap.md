# Bautakt – Roadmap

Stand: 24.11.2026. Immer nur am aktuellen Meilenstein arbeiten. Jeder Meilenstein endet mit grünen Tests und einer lauffähigen App.

## Phase K – Kern bis zur Planspiel-Abgabe (20.12.2026)

Ziel: Ab ca. **13.12.** sollen damit F.1 (Rollen-Netzplan) und F.2 (Projektterminplan) erstellbar sein; die Woche danach ist Puffer und Nutzung.

### M0 – Gerüst (bis ca. 28.11.) ✔
- [x] Repo, pnpm-Workspaces, electron-vite, TypeScript strict, ESLint/Prettier, Vitest
- [x] Electron-Sicherheit (contextIsolation, sandbox, typisierte IPC-Liste)
- [x] Kern: Projektdatei `.bautakt` (SQLite, Migrationen je Plugin, `meta`)
- [x] Kern: Befehle + Undo/Redo + Änderungsprotokoll
- [x] Kern: Plugin-Lader + Plugin-API (E-35) mit leerem Plugin `termine`
- [x] Neu/Öffnen/Speichern, Autosave 2 min, Backup bak1–5, Lock → schreibgeschützt (E-41)

### M1 – Rechenkern Termine (bis ca. 03.12.) ✔
- [x] `rechnen-kalender`: Arbeitstage, NRW-Feiertage, Ruhezeiten, AT↔Datum, KT-Umrechnung
- [x] `rechnen-termine`: Vorwärts/Rückwärts, EA/AA/EE/AE, negative Abstände, GP/FP, kritischer Pfad, Soll-Ende, Bedingungen, Zykluserkennung
- [x] Parser Vorgänger-Spalte (Kurz- und Langform)
- [x] Referenztests R-01 bis R-08 grün

### M2 – Oberfläche Termine (bis ca. 10.12.) ✔
- [x] Hauptansicht: Tabelle links, vernetzter Balkenplan rechts (E-18, E-21)
- [x] Vorgangseigenschaften inkl. Pflichtfeld Quelle/Annahme, Anmerkung, Rolle, braucht/liefert, Risiko (E-13)
- [x] Sammelvorgänge (Zuklappen = Rahmenterminplan), mehrere Pläne je Projekt (E-14)
- [x] Beziehungs-Dialog (Langform), Verbinden per Maus
- [x] Netzplan-Reiter im Übungsformat, Auto-Layout + Verschieben (E-20)
- [x] Soll-Ende, Umschalter Rückwärtsrechnung, negative Puffer rot, Schnittstellen-Meilensteine (E-19)
- [x] Kalender-/Ruhezeiten-Dialog

### M3 – Export, Stände, Hilfe (bis ca. 13.12.) ✔
- [x] Druckansicht mit Plankopf, Legende, Risiko-Hinweisen → PDF A3 quer, PNG
- [x] Benannte Soll-Stände speichern/laden (E-22, E-32 Datenmodell)
- [x] Hilfe-Seitenleiste (F1) Grundversion mit Abläufen und Tastenkürzeln für Termine (E-29)
- [x] Windows-Installer + erstes GitHub Release `v0.1.0`

## Phase V – Version 1 (ab 21.12.2026)

- [x] **M4** Ist-Erfassung, Stichtag/Prognose, Soll-Ist-Balken, Abweichungsursachen (E-32)
- [x] **M5** Terminliste und Meilensteinplan (E-30)
- [x] **M6** Bibliothek-Plugin (global, eingefrorene Kopien) + Aufwandswert-Rechner mit Formelzeile (E-23, E-24) · Test R-09
- [x] **M7** Kosten-Plugin: DIN-276-Baum, DIN-277-Flächen, KKW, Index, Regionalfaktor, MwSt./Vorsteuer (E-15, E-16) · Tests R-10, R-11
- [x] **M8** Kosten Soll-Ist: Stufen, Aufträge, Rechnungen (E-33)
- [x] **M9** Excel-Export (Vorgangsliste, Kostentabelle im Dynexite-Aufbau) (E-25)
- [x] **M10** Ortsstruktur, Liniendiagramm, Taktplanung „über Takte vervielfältigen“ (E-30, E-31)
- [x] **M11** Meilenstein-Trendanalyse (E-30)
- [x] **M12** Statistik-Plugin: Erfahrungsdatenbank, Auswertung ab n ≥ 3, Vorschläge, Schalter „zählt in Statistik“ (E-34)
- [x] **M13** MS-Project-XML Im-/Export (E-25)
- [x] **M14** Hilfe komplett: Glossar mit Hover, leere Ansichten, Erststart-Tour (E-29)

## Phase B – BIM

- [x] **B1** IFC-Viewer (IFC2x3/IFC4), Bauteilliste, Testmodelle aus BIMCraft und FreeCAD (E-37, E-40)
- [ ] **B2** 5D: Mengen (Qto/Geometrie, Herkunft sichtbar), Regeltabelle IFC → KG, Übergabe an Kosten
- [ ] **B3** DIN-277-Flächen aus IfcSpace, Reimport über GlobalId mit Änderungsbericht
- [ ] **B4** 4D: Vorgänge ↔ Bauteile, Bauablauf-Simulation, Ort ↔ Geschoss/Zone
- [ ] **B5** Optionale Kopplungs-Plugins BIMCraft-CLI / FreeCAD; GAEB; IFC4.3

## Später / offen

- Fremde Plugins mit Rechteabfrage (E-36), Auto-Update, Code-Signatur
- Destatis-Index automatisch abrufen (E-16)
- Soll-Ist-Vergleich zwischen beliebigen Ständen (Terminen) als eigene Ansicht
- Mac/Linux/Web, Mehrbenutzerbetrieb
- Farb-/Schriftvorlagen für Pläne

## Verlauf

- 24.11.2026 – Planung abgeschlossen (Lastenheft, Architektur, Roadmap, Referenzbeispiele).
- 24.11.2026 – **M0 fertig.** Monorepo (pnpm, electron-vite, TS strict, ESLint/Prettier, Vitest), Kern (Projektdatei mit Migrationen, Befehle/Undo/Redo/Änderungsprotokoll, Ereignisse, Plugin-Lader, Lock/Backup/Autosave/JSON-Export), sichere Electron-Shell, Plugin „termine“ als Gerüst (Pläne anlegen/umbenennen/löschen). 35 Tests grün, Rauchtest der App und des gepackten Installers erfolgreich. Electron vorerst 42 (siehe Architektur 9).
- 24.11.2026 – **M1 fertig.** Reine Bibliotheken `rechnen-kalender` (Arbeitstage, NRW-Feiertage, Ruhezeiten, AT↔Datum, KT-Abstände, ISO-KW) und `rechnen-termine` (Vorwärts-/Rückwärtsrechnung EA/AA/EE/AE mit AT/KT, GP/FP, kritischer Weg inkl. kritischer Pfeile, Soll-Ende, Bedingungen, Sammelvorgänge, Zykluserkennung, Parser Kurz-/Langform). Referenztests R-01 bis R-08 grün, dazu 300 Zufallsnetze als Eigenschaftstests; insgesamt 396 Tests. Präzisierungen in Architektur 10.
- 24.11.2026 – **M2 fertig.** Plugin „termine“ mit Datenmodell (Vorgänge, Beziehungen, Kalender, Ruhezeiten; Migration 2 inkl. Übernahme von M0-Dateien) und allen Änderungen als undo-fähige Befehle. Oberfläche: Terminplan (virtualisierte Tabelle mit Tastatureingabe + vernetzter Balkenplan Tag/KW/Monat/Quartal mit Puffern, Meilensteinen, Schnittstellen, Soll-Ende-/Heute-Linie, Ruhezeiten, Risiko-Legende, Verbinden per Maus), Netzplan im Übungsformat (Auto-Layout, Verschieben, Verbinden), Dialoge für Vorgang, Vorgänger (Langform) und Plan/Kalender/Ruhezeiten, Rahmenterminplan durch Zuklappen, mehrere Pläne. 410 Tests grün; Bedienung in der gebauten App per Tastatur und Maus geprüft. Präzisierungen in Architektur 11.
- 26.11.2026 – **M3 fertig.** Soll-Stände (Kern-Befehle stand.speichern/laden/umbenennen/loeschen, Plugin-Kopien inkl. eingefrorener Termine, automatische Sicherung vor jedem Rücksprung), Export PDF A3 quer (mehrseitig, Plankopf/Legende/Risiken auf jeder Seite) und PNG (1–3-fache Auflösung) für Balken- und Netzplan, Hilfe-Seitenleiste mit Markdown und allgemeiner Hilfe, Installer „Bautakt-Setup-0.1.0.exe“ gebaut. 414 Tests grün. GitHub-Release v0.1.0 (privat) veröffentlicht.
- 26.11.2026 – **M4 fertig** (vorgezogen). Ist-Erfassung je Stichtag mit Verlauf (t_ist), Prognose nach E-43/E-44 im Rechenkern (Referenztest R-12), Soll-Ist-Vergleich gegen wählbaren Stand (E-46) mit Soll-Balken, Fortschritt, Stichtag-Linie, Spalten „%“ und „Abw.“, Status im Netzplan; auch im PDF/PNG-Export. Neue Entscheidungen E-43–E-46. 423 Tests grün.
- 26.11.2026 – **M5 fertig.** Terminliste (Filter Gewerk/Verantwortlich/Zeitraum, Gruppierung nach Gewerk, Soll-Ist-Spalten) und Meilensteinplan (Zeitleiste mit Soll-Rauten, Stichtag-/Soll-Ende-/Heute-Linie, Tabelle mit Bedingung und Schnittstelle), beide direkt bearbeitbar und als PDF/PNG exportierbar. Neue Entscheidungen E-47–E-50. 433 Tests grün; Bedienung und Export in der gebauten App geprüft.
- 26.11.2026 – **M6 fertig.** Kern kann globale Plugin-Dateien im App-Datenordner (Aktionen ohne Undo, eigene Migrationen, Dienste für Projekte). Plugin „Bibliothek“ mit versionierten Aufwandswerten (Quelle Pflicht, Löschen = ausblenden, Versionsverlauf), auch ohne Projekt erreichbar. Rechenbibliothek `rechnen-aufwand` (Referenztest R-09) und Aufwandswert-Rechner im Terminplan: Bibliothekswert oder eigener Wert, Kolonne, addierte Zu-/Abschläge, Formelzeile, eingefrorene Kopie im Projekt, Hinweis bei neuerer Version und bei abweichender Dauer. Neue Entscheidungen E-51–E-54. 454 Tests grün; Bedienung in der gebauten App geprüft.
- 26.11.2026 – **M7 fertig.** Rechenbibliothek `rechnen-kosten` (DIN-276-Katalog bis 3. Ebene, DIN-277-Flächen, Index je Zeile mit Begründungspflicht, Regionalfaktor, Rundung auf Cent, Summen im KG-Baum, MwSt.; Referenztests R-10, R-11). Bibliothek um versionierte Kostenkennwerte erweitert. Kosten-Plugin mit Einstellungen, Flächen, Kostenzeilen (eine je KG, Menge an Fläche koppelbar, eingefrorene Kennwertkopie, Hinweis bei neuerer Version), Ständen und Export PDF/PNG. Neue Entscheidungen E-55–E-59. 472 Tests grün; Bedienung und Export in der gebauten App geprüft (auch Migration einer vorhandenen Projektdatei).
- 26.11.2026 – **M8 fertig.** Kosten Soll-Ist: Kostenrahmen/-schätzung/-berechnung aus der Planung festschreiben und von Hand korrigieren, Kostenanschlag = Σ Aufträge, Kostenfeststellung = Σ Rechnungen, Prognose und Abweichung gegen wählbare Bezugsstufe, Ursachen je KG. Aufträge und Rechnungen mit Zuordnung, abgerechnet/offen und Anhang als Dateiverweis (sicheres Öffnen nur eingetragener Dokumente). Export Soll-Ist als PDF/PNG. Neue Entscheidungen E-60–E-63. 483 Tests grün; Bedienung und Export in der gebauten App geprüft.
- 26.11.2026 – **M9 fertig.** Excel-Export über exceljs: Vorgangsliste aller Vorgänge mit Gliederung, Zeitpunkten, Puffern (GP als Formel), Terminen und Eigenschaften; Kosten-Arbeitsmappe mit Kostentabelle im vereinbarten Aufbau, Flächen, Soll-Ist, Aufträgen und Rechnungen, Beträge als nachrechenbare Formeln mit Ergebnis. Kern: Datei-Exporte der Plugins. Gepacktes Programm enthält exceljs (geprüft). Neue Entscheidungen E-64–E-66. 485 Tests grün.
- 26.11.2026 – **M10 fertig.** Ortsstruktur je Projekt (beliebig tief, Reihenfolge), Ort von–bis am Vorgang, Liniendiagramm/Weg-Zeit-Diagramm mit umschaltbarer Ausrichtung, Farbe je Gewerk und kritischem Weg, Taktplanung „Über Takte vervielfältigen“ als Taktzug (Kopien je Ort, automatische Verkettung, Originale als Sammelvorgänge). Neue Entscheidungen E-67–E-70. 489 Tests grün; Bedienung in der gebauten App geprüft.
- 26.11.2026 – **M11 fertig.** Meilenstein-Trendanalyse: Berichtsstände je Stichtag festhalten (mit Notiz, gleicher Tag ersetzt, einzeln löschbar), Diagramm Berichtsdatum × Termin mit Diagonale, aktueller Stand gestrichelt, Meilensteine auswählbar, Tabelle mit Verschiebung in Kalendertagen, Export PDF/PNG. Neue Entscheidungen E-71–E-73. 491 Tests grün; Bedienung und Export in der gebauten App geprüft.
- 26.11.2026 – **M12 fertig.** Statistik-Plugin mit Erfahrungsdatenbank im App-Datenordner: Projekte übertragen (Dauern fertiger Vorgänge, Kosten je KG, Kostenkennwerte), Merkmale Gebäudeart/Bauweise/BGF, Schalter „zählt in Statistik“, Auswertung je Schlüssel ab n ≥ 3 mit Diagramm und Filtern, Vorschläge zur Bibliothek ab 5 % Abweichung (nur auf Klick). Rechenbibliothek `rechnen-statistik`. Neue Entscheidungen E-74–E-78. 498 Tests grün; Bedienung in der gebauten App geprüft.
- 26.11.2026 – **M13 fertig.** MS-Project-XML (MSPDI): Export eines Plans mit Gliederung, Beziehungen, Kalender, Bedingungen, Ist zum Stichtag und Soll-Stand als Basisplan; Import als neuer Plan oder Ersatz des gewählten Plans mit Rundung und Bericht, Rückgängig in einem Schritt. Kern um Datei-Importe der Plugins erweitert. Neue Abhängigkeit fast-xml-parser (MIT). Neue Entscheidungen E-79–E-82. 503 Tests grün; Export → Import ergibt dieselben Termine, Bedienung in der gebauten App geprüft (MS Project selbst nicht verfügbar).
- 26.11.2026 – **M14 fertig.** Glossar mit rund 55 Fachbegriffen (eigene Erklärungen mit Mini-Beispiel), Hover-Erklärung in Spaltenköpfen, Kennzahl- und Flächenbezeichnungen sowie automatisch in den Hilfetexten, durchsuchbares Glossar in der Hilfe, Erststart-Tour mit sechs Schritten (jederzeit neu startbar), leere Ansichten geprüft und ergänzt. Neue Entscheidungen E-83–E-85. 509 Tests grün; Tour, Hover (Maus und Tastatur), Glossarsuche und Hilfe-Verweise in der gebauten App geprüft.
- 26.11.2026 – **Release v0.2.0** (Phase A komplett, Stand M14): Installer „Bautakt-Setup-0.2.0.exe“ gebaut, gepackte App geprüft (alle Plugins, Version, Abhängigkeiten im Paket), GitHub-Release (privat) veröffentlicht.
- 26.11.2026 – **B1 fertig.** Plugin „bim“: IFC2x3/IFC4 einlesen und in die Projektdatei einbetten (neue Dateiablage im Kern, außerhalb von Undo/Protokoll), mehrere Fachmodelle deckungsgleich, Bauteilliste Modell → Geschoss → Klasse → Bauteil, Eigenschaften (Attribute, Typ, Psets, BaseQuantities in SI-Einheiten), Ein-/Ausblenden und Isolieren, Geschossschnitt und freie Schnittebene, Messen. Viewer mit web-ifc (MPL-2.0) und three.js (MIT) direkt; Geometrie im Worker. Testmodelle aus BIMCraft (Haus, Hochhaus mit 9.500 Bauteilen) und FreeCAD (Halle, Tragwerk). Neue Entscheidungen E-86–E-89. 520 Tests grün; Bedienung in der gebauten und der gepackten App geprüft.
