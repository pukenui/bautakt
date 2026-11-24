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
