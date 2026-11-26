# Bautakt – Architektur

Stand: 24.11.2026. Bezieht sich auf die Entscheidungen in `lastenheft.md` (E-xx).

## 1. Überblick

```
┌──────────────────────────── Electron ────────────────────────────┐
│  Renderer (React, sandboxed)          Main-Prozess (Node)         │
│  ┌──────────────────────────┐        ┌──────────────────────────┐ │
│  │ App-Shell (Menü, Reiter, │  IPC   │ Kern                     │ │
│  │ Hilfe-Seitenleiste)      │◄──────►│  - Projektdatei (SQLite) │ │
│  │ Plugin-Ansichten         │preload │  - Befehle/Undo/Protokoll│ │
│  │  termine/ kosten/ ...    │        │  - Ereignisse            │ │
│  └──────────────────────────┘        │  - Plugin-Lader          │ │
│                                       │  - Autosave/Backup/Lock  │ │
│                                       │ Plugins (Main-Teil)      │ │
│                                       └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
          ▲ beide nutzen reine Bibliotheken (ohne Electron/React):
          packages/rechnen-termine · rechnen-kalender · rechnen-kosten
```

Grundsätze:

- **Schlanker Kern + Plugins** (E-35). Termine, Kosten, Bibliothek, Statistik und BIM sind Plugins.
- **Reine Rechenbibliotheken** ohne UI-Abhängigkeit, vollständig getestet (E-17).
- **Jede Änderung ist ein Befehl** → Undo/Redo + Änderungsprotokoll automatisch (E-22).
- **Eine SQLite-Datei je Projekt** (E-10), globale Dateien für Bibliothek und Erfahrungsdatenbank (E-23, E-34).

## 2. Repo-Struktur

```
bautakt/
├─ CLAUDE.md
├─ docs/                      Lastenheft, Architektur, Roadmap, Referenzbeispiele
├─ apps/desktop/
│  ├─ src/main/               Electron-Main: Fenster, IPC, Kern-Anbindung
│  ├─ src/preload/            contextBridge, typisierte IPC-Liste
│  └─ src/renderer/           React-Shell, Plugin-Ansichten einhängen
├─ packages/
│  ├─ kern/                   Projektdatei, Befehle, Undo, Protokoll, Ereignisse, Plugin-API
│  ├─ rechnen-kalender/       Arbeitskalender, NRW-Feiertage, AT↔Datum, KT-Umrechnung
│  ├─ rechnen-termine/        Netzplanrechnung (DIN 69900), Syntax-Parser Beziehungen
│  ├─ rechnen-kosten/         DIN 276/277, Indexierung, Summen (ab v1)
│  └─ ui/                     gemeinsame UI-Bausteine (Tabelle, Dialoge, Glossar-Hover)
├─ plugins/
│  ├─ termine/                main/ + renderer/ + migrations/ + hilfe/
│  ├─ kosten/                 (v1)
│  ├─ bibliothek/             (v1)
│  ├─ statistik/              (v1)
│  └─ bim/                    (BIM-Phase)
└─ hilfe/                     allgemeine Hilfe + Glossar (Markdown)
```

Werkzeuge: pnpm-Workspaces, electron-vite, Vitest, ESLint, Prettier, electron-builder (NSIS).

## 3. Kern

### 3.1 Projektdatei

- SQLite über better-sqlite3 im Main-Prozess, WAL-Modus.
- Tabelle `meta` (Dateiformat-Version, App-Version, Projektname, Erstellt/Geändert).
- Tabelle `plugin_schema` (plugin_id, schema_version) – Migrationen je Plugin, aufsteigend nummeriert.
- **Sperre:** Lock-Datei `<name>.bautakt.lock` (PID, Rechnername, Zeit). Ist sie aktiv → schreibgeschützt öffnen + Hinweis (E-41).
- **Backup:** Beim Öffnen Kopie nach `.bautakt.bak1`, ältere rotieren bis `bak5`.
- **Autosave** alle 2 Minuten (Befehle werden sofort in die DB geschrieben; Autosave = Checkpoint/Flush und Sicherungspunkt).
- **JSON-Export** des gesamten Projekts (alle Plugin-Tabellen) zum Sichern/Vergleichen.

### 3.2 Befehle, Undo, Änderungsprotokoll

```ts
interface Befehl<T = unknown> {
  id: string;            // UUID v7
  plugin: string;        // z. B. "termine"
  name: string;          // z. B. "vorgang.dauerAendern"
  daten: T;
  ausfuehren(tx: Transaktion): Aenderung[];   // liefert Feldänderungen alt→neu
  rueckgaengig(tx: Transaktion): void;
  grund?: string;        // optionaler Änderungsgrund (vom Nutzer)
}
```

- Undo/Redo-Stapel unbegrenzt je Sitzung.
- Tabelle `aenderungsprotokoll`: id, zeit (UTC), befehl_id, plugin, entitaet, entitaet_id, feld, alt, neu, grund.
- Export des Protokolls als Excel/CSV/PDF.

### 3.3 Stände (Soll/Baseline)

- Tabelle `stand`: id, name, zeit, art (`soll` | `sicherung`), notiz.
- Jedes Plugin implementiert `standSpeichern(standId)` / `standLaden(standId)` für seine Daten (Kopie in `<tabelle>_stand`). Rücksprung = Laden eines Stands als Befehl (undo-fähig).

### 3.4 Ereignisse

Typisierter Event-Bus, z. B. `vorgang.geaendert`, `beziehung.geaendert`, `plan.berechnet`, `kosten.geaendert`, `projekt.gespeichert`. Plugins abonnieren nur, was sie brauchen.

### 3.5 Plugin-API

```ts
interface BautaktPlugin {
  id: string;                    // "termine"
  name: string;                  // "Terminplanung"
  version: string;
  abhaengigkeiten?: string[];    // z. B. ["bibliothek"]
  migrationen: Migration[];      // SQL je Schema-Version
  aktivierenMain(ctx: MainKontext): void | Promise<void>;
  renderer: () => Promise<RendererModul>;   // Ansichten, Menüs, Hilfe
}

interface MainKontext {
  db: PluginDb;                               // Zugriff auf eigene Tabellen (Präfix)
  befehle: { registrieren(...); ausfuehren(...) };
  ereignisse: { on(...); emit(...) };
  dienste: { bereitstellen<T>(name, impl: T); holen<T>(name): T };  // Daten anderer Plugins lesen
  exporte: { registrieren(format, fn) };
  importe: { registrieren(format, fn) };
  stand: { registrieren(speichern, laden) };
}

interface RendererModul {
  ansichten: { id; titel; reiter?; komponente; hilfe: string /* Markdown-Pfad */ }[];
  menues?: MenuEintrag[];
  tastenkuerzel?: Tastenkuerzel[];
}
```

- Plugins lesen fremde Daten nur über `dienste` (z. B. `termine.vorgaenge()`, später `bim.mengen(kg)`), nie direkt über deren Tabellen.
- Geladen werden vorerst nur Plugins aus `plugins/` (E-36).

## 4. Datenmodell (Plugin-Tabellen, Auszug)

### 4.1 termine

| Tabelle | Wichtige Felder |
|---|---|
| `t_plan` | id, name, art (`bauablauf` \| `rollen` \| frei), projektstart (Datum), soll_ende (Datum, optional), rueckwaerts_von (`berechnet` \| `soll_ende`), kalender_id |
| `t_kalender` | id, arbeitstage (Mo–So Maske, Standard Mo–Fr), bundesland (Standard NW) |
| `t_ruhezeit` | id, kalender_id, von, bis, name |
| `t_vorgang` | id, plan_id, parent_id, sortierung, nr, name, typ (`vorgang` \| `sammel` \| `meilenstein`), dauer_at, quelle_annahme, anmerkung, gewerk, rolle, risiko, info_braucht, info_liefert, dauer_herleitung (Formelzeile), aufwand_ref (Bibliothek-Kopie), bauteil_refs (JSON, leer bis BIM), ort_von, ort_bis, bedingung_typ (`keine` \| `nicht_frueher_als` \| `muss_enden_am`), bedingung_datum, schnittstelle (bool), netz_x, netz_y |
| `t_beziehung` | id, von_id, nach_id, art (`EA` \| `AA` \| `EE` \| `AE`), abstand (ganzzahlig, auch negativ), einheit (`AT` \| `KT`) |
| `t_ort` | id, parent_id, name, reihenfolge |
| `t_ist` | vorgang_id, stichtag, ist_anfang, ist_ende, fertig_prozent, restdauer_at, ursache (Liste), ursache_text |
| `t_vorgang_stand` usw. | Kopien je Soll-Stand |

Berechnete Werte (FAZ, FEZ, SAZ, SEZ, GP, FP, kritisch) werden **nicht** gespeichert, sondern bei jeder Änderung neu gerechnet (Ausnahme: Soll-Stände speichern ihre Ergebnisse mit, damit Vergleiche stabil sind).

### 4.2 kosten (v1)

| Tabelle | Wichtige Felder |
|---|---|
| `k_einstellung` | mwst_satz (19 %), vorsteuerabzug (bool), regionalfaktor, regionalfaktor_quelle, index_aktuell, index_aktuell_stand, index_quelle |
| `k_flaeche` | kategorie (DIN 277: NUF1–7, TF, VF, KGF, AF, GF …), wert_m2, quelle |
| `k_zeile` | id, kg (z. B. 331), ebene (1–3), menge, einheit, menge_quelle (`manuell` \| `flaeche` \| `ifc`), kkw_von, kkw_mittel, kkw_bis, kkw_gewaehlt, kkw_ref (Bibliothek-Kopie), kkw_stand_index, index_abweichung_begruendung, kommentar, anmerkung, bauteil_refs |
| `k_stufe` | zeile_id, stufe (`rahmen` \| `schaetzung` \| `berechnung` \| `anschlag` \| `feststellung`), betrag_netto |
| `k_auftrag` / `k_rechnung` | id, kg, betrag_netto, datum, beleg_nr, anhang |

### 4.3 Global (App-Datenordner `%APPDATA%\Bautakt\`)

- `bibliothek.sqlite`: `kennwert` (id, version, bezeichnung, kg, einheit, von/mittel/bis, quelle, stand, index_stand, gebaeudeart), `aufwandswert` (id, version, bezeichnung, gewerk, einheit, h_je_me, quelle).
  Verwendung im Projekt = Kopie mit (id, version) → Hinweis, wenn neuere Version existiert.
- `erfahrung.sqlite`: je abgeschlossenem Projekt Kennzahlen (projekt_id, zaehlt_in_statistik, gebaeudeart, bgf, bauweise) und Datenpunkte (schluessel: aufwandswert_id/kennwert_id/gewerk/kg/ursache; soll, ist, faktor).

## 5. Rechenregeln Termine (DIN 69900, Vorgangsknotennetz)

### 5.1 Zeitpunkte

- Zeitachse in **AT, kontinuierliche Zeitpunkte ab 0** (wie in UE 05): Ein Vorgang mit FAZ = 0 und D = 70 hat FEZ = 70; ein Nachfolger mit „0EA“ beginnt bei 70.
- FEZ = FAZ + D; SAZ = SEZ − D. Meilensteine haben D = 0.
- **Anzeige als Datum:** Anfang = Datum von AT (FAZ + 1), Ende = Datum von AT (FEZ). Beispiel: FAZ 0, D 5, Start Mo 14.12.2026 → Mo 14.12. bis Fr 18.12.

### 5.2 Vorwärtsrechnung (FAZ)

Für jede Beziehung i → j mit Abstand z (in AT):

| Art | Bedingung |
|---|---|
| EA | FAZ_j ≥ FEZ_i + z |
| AA | FAZ_j ≥ FAZ_i + z |
| EE | FAZ_j ≥ FEZ_i + z − D_j |
| AE | FAZ_j ≥ FAZ_i + z − D_j |

FAZ_j = Maximum aller Bedingungen, mindestens 0 (Projektstart) bzw. Bedingung „nicht früher als“.
Reihenfolge per topologischer Sortierung (Kahn); Zyklus → Fehler mit Zyklus-Pfad, Eingabe wird abgelehnt.

### 5.3 Rückwärtsrechnung (SEZ)

Projektende T = max FEZ (Standard) bzw. Soll-Ende in AT (E-19). Vorgänge ohne Nachfolger hängen implizit am Ende-Meilenstein (0EA).

| Art | Bedingung für i |
|---|---|
| EA | SEZ_i ≤ SAZ_j − z |
| AA | SEZ_i ≤ SAZ_j − z + D_i |
| EE | SEZ_i ≤ SEZ_j − z |
| AE | SEZ_i ≤ SEZ_j − z + D_i |

SEZ_i = Minimum aller Bedingungen (und ≤ T; bei „muss enden am“ ≤ Bedingungsdatum).

### 5.4 Puffer

- **GP** = SAZ − FAZ = SEZ − FEZ. Bei Rückwärtsrechnung vom Soll-Ende kann GP < 0 sein → rot.
- **FP** = Minimum über alle Nachfolgebeziehungen des „Spielraums bei frühester Lage“:
  EA: FAZ_j − z − FEZ_i · AA: FAZ_j − z − FAZ_i · EE: FEZ_j − z − FEZ_i · AE: FEZ_j − z − FAZ_i.
  Ohne Nachfolger: (berechnetes Projektende max FEZ) − FEZ_i.
  Danach **FP = max(0, min(Spielraum, GP))**. Im Normalfall ändert das nichts; bei Rückwärtsrechnung vom Soll-Ende verhindert es FP > GP und negative FP. FP ≤ GP muss immer gelten, sofern GP ≥ 0 ist (Test).
- **Kritisch**: GP = 0 (bzw. GP = minimaler GP, wenn vom Soll-Ende gerechnet).

### 5.5 Kalender und KT-Abstände

- Arbeitstage: Wochentags-Maske minus NRW-Feiertage minus Ruhezeiten.
- NRW-Feiertage: Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, Fronleichnam, 3. Oktober, Allerheiligen, 1. und 2. Weihnachtstag (Ostern nach Gauß/Meeus berechnet).
- **KT-Abstand** (z. B. `EA+21KT`): Zeitpunkt FEZ_i in Datum umrechnen (Ende des Arbeitstags = Beginn des Folgetags), z Kalendertage addieren, auf den Beginn des nächsten Arbeitstags runden → zurück in AT-Index. Gilt sinngemäß für AA/EE/AE.
- Negative Abstände erlaubt (Überlappung).

### 5.6 Syntax der Vorgänger-Spalte (E-18, E-28)

```
Eintrag   := Bezug { ";" Bezug }
Bezug     := Nr [Art] [Abstand]
Art       := "EA" | "AA" | "EE" | "AE"                     (Standard: EA)
           | "Ende-Anfang" | "Anfang-Anfang" | "Ende-Ende" | "Anfang-Ende"
Abstand   := ("+" | "-") Zahl [Einheit]
Einheit   := "AT" | "KT" | "Tage" | "Arbeitstage" | "Kalendertage"   (Standard: AT; "Tage" = AT)
```

Beispiele: `1EA+10`, `3`, `4EA+30KT`, `3 Ende-Anfang +15 Tage`, `2AA-2`. Leerzeichen und Groß-/Kleinschreibung egal. Fehler werden mit Position angezeigt.

## 6. Darstellung

- **Netzplan** (E-20): eigene SVG-Komponente. Knotenraster 3 Zeilen (Nr./Name · FAZ\|D\|FEZ · SAZ\|GP\|FP\|SEZ). Auto-Layout: Spalte = Rang in topologischer Sortierung (gruppiert nach FAZ), Reihenfolge innerhalb der Spalte per Kreuzungsminimierung (Barycenter). Manuelle Positionen überschreiben das Auto-Layout und werden gespeichert. Pfeile orthogonal, Beschriftung „10EA“, kritischer Pfad rot und dick.
- **Balkenplan** (E-21): eigene SVG-Komponente, virtualisierte Zeilen (große Pläne), Zoomstufen Tag/KW/Monat/Quartal.
- **Export:** eigene Druckansicht (Plankopf, Legende, Risiko-Hinweise) → `webContents.printToPDF` (A3 quer, mehrseitig mit Wiederholung des Kopfs) und PNG (SVG → Canvas, wählbare Auflösung).
- **Excel** (v1): exceljs (umgesetzt in M9, siehe Abschnitt 18).

## 7. BIM (spätere Phase)

- Viewer: @thatopen/components (web-ifc + three.js) im Renderer; Parsen großer Dateien in einem Worker.
- Bauteile: Tabelle `b_bauteil` (globalid, ifc_klasse, name, geschoss, eigenschaften JSON, mengen JSON mit Herkunft `qto` \| `geometrie`).
- Regeltabelle IFC → KG (`b_kg_regel`: ifc_klasse, bedingungen, kg, priorität) + manuelle Überschreibung je Bauteil.
- Dienst `bim.mengen(kg)` und `bim.flaechenDin277()` für das Kosten-Plugin; `bim.bauteile(filter)` für 4D-Verknüpfung in Terminen.
- Reimport: Abgleich über GlobalId → Änderungsbericht.
- Autorenwerkzeuge (BIMCraft, FreeCAD, Revit …) nur über IFC-Dateien; optionale Kopplungs-Plugins später (E-40).

## 8. Sicherheit

- Renderer: `contextIsolation`, `sandbox`, kein `nodeIntegration`; Content-Security-Policy ohne externe Quellen.
- IPC nur über freigegebene, typisierte Kanäle; Eingaben im Main validieren (zod).
- Keine Netzwerkzugriffe im Kern (später nur Destatis-Index-Abruf, ausdrücklich ausgelöst).

## 9. Umsetzungsnotizen (M0)

Ergänzungen und Präzisierungen, die sich bei der Umsetzung ergeben haben (technisch, ohne fachliche Auswirkung):

- **Änderungen statt eigener Undo-Logik.** Befehle schreiben nur über eine `Transaktion` (`einfuegen`, `aendern`, `loeschen`, `lesen`). Jede Schreiboperation wird als `Aenderung` aufgezeichnet (einfügen mit ganzer Zeile, ändern mit Feldern alt→neu, löschen mit ganzer Zeile). Undo wendet die Umkehrung an, Redo dieselben Änderungen erneut – deterministisch, IDs bleiben gleich. Befehle ohne Wirkung landen nicht auf dem Undo-Stapel. Jede Plugin-Tabelle braucht `id TEXT PRIMARY KEY`.
- **Schreibrechte per Tabellenpräfix.** Jedes Plugin deklariert `tabellenPraefix` (z. B. `t_`) und darf nur dort schreiben; Präfixe dürfen sich nicht überschneiden. Lesezugriffe (`ctx.db`, `tx.lesen`) lassen nur nicht schreibende SQL-Anweisungen zu.
- **Änderungsprotokoll** hat zusätzlich die Spalten `befehl` (z. B. `termine:plan.umbenennen`) und `aktion` (`ausfuehren` | `rueckgaengig` | `wiederholen`). Einfügen/Löschen werden als eine Zeile mit `feld = NULL` und der ganzen Zeile als JSON in `neu` bzw. `alt` protokolliert, Änderungen je Feld.
- **Kern-Schema** wird wie ein Plugin mit der ID `kern` in `plugin_schema` versioniert; `meta.dateiformat` (aktuell 1) schützt vor zu neuen Dateien.
- **Plugin-API getrennt nach Prozess.** Main-Teil `BautaktPlugin` (`@bautakt/kern`) und Renderer-Teil `RendererPlugin` (`@bautakt/ui`) sind getrennte Objekte mit gleicher `id`, weil Main und Renderer getrennt gebündelt werden. Neu im `MainKontext`: `abfragen.registrieren(...)` – lesende, mit zod geprüfte Abfragen, die der Renderer über IPC aufrufen darf (`dienste` bleiben für Plugin-zu-Plugin).
- **Sperre:** Lock-Datei gilt als aktiv, wenn sie auf diesem Rechner zu einem laufenden Prozess gehört, bzw. auf einem anderen Rechner jünger als 10 min ist (wird beim Autosave aufgefrischt). Verwaiste Sperren werden übernommen.
- **Speichern** = Checkpoint (WAL → Datei), da Befehle sofort geschrieben werden. „Speichern unter“ schreibt eine Kopie (`VACUUM INTO`) und öffnet sie; der Undo-Verlauf beginnt dort neu. Sicherungen beim Öffnen werden vor den Migrationen angelegt.
- **IPC:** Kanalliste in `apps/desktop/src/shared/kanaele.ts`, Vertrag (Typen) in `@bautakt/kern/vertrag`. Main nimmt nur Aufrufe aus dem eigenen Fenster an und prüft Eingaben mit zod; Fehler gehen als `{ ok: false, fehler }` zurück. Tastenkürzel werden im Renderer behandelt, damit Strg+Z in Eingabefeldern das Feld betrifft.
- **Electron-Version und natives Modul.** better-sqlite3 veröffentlicht vorkompilierte Windows-Binaries derzeit bis Electron 42 (ABI 146); ohne Visual-Studio-Buildtools ist Electron daher auf 42.x festgelegt (`scripts/native.mjs` lädt das passende Binary beim `pnpm install`). Electron 42 erhält keine Sicherheitsupdates mehr; vertretbar, weil nur lokale Inhalte geladen werden. Upgrade, sobald Prebuilds für eine aktuelle Version erscheinen oder Buildtools installiert sind.
- **Tests** laufen mit der Node-Laufzeit von Electron (`ELECTRON_RUN_AS_NODE`, `scripts/test.mjs`), damit nur ein better-sqlite3-Binary nötig ist.

## 10. Umsetzungsnotizen (M1)

Präzisierungen der Rechenregeln aus Abschnitt 5, wie sie in `packages/rechnen-*` umgesetzt und getestet sind:

- **Zeitachse vor dem Start.** AT 0, −1, … sind die Arbeitstage vor dem Projektstart (AT 0 = letzter Arbeitstag davor). So lassen sich negative SAZ bei Rückwärtsrechnung vom Soll-Ende als Datum anzeigen.
- **Bedingungen als Zeitpunkte.** Die Netzplanrechnung arbeitet nur mit Zeitpunkten; das Plugin rechnet Daten vorher um: „nicht früher als Datum“ → Beginn des ersten Arbeitstags ab Datum (`zeitpunktFruehestensAb`), „muss enden am Datum“ bzw. Soll-Ende → Ende des letzten Arbeitstags bis Datum (`zeitpunktSpaetestensBis`). „Muss enden am“ begrenzt nur die Rückwärtsrechnung (wie 5.3); ist sie nicht einhaltbar, wird GP negativ.
- **Allgemeine Abstandsfunktion.** Jede Beziehung ist eine Funktion f(t) (AT: t + z; KT: über den Kalender) mit Umkehrung g(t) = größtes s mit f(s) ≤ t. Vorwärts gilt Zielpunkt ≥ f(Quellpunkt), rückwärts Quellpunkt ≤ g(Zielpunkt); FP-Spielraum entsprechend mit g. Für AT ergeben sich genau die Tabellen aus 5.2–5.4.
- **Kritisch** = GP ≤ 0 bei Rechnung vom berechneten Ende (negative GP entstehen dann nur durch „muss enden am“), bzw. GP = minimaler GP bei Rechnung vom Soll-Ende (wie 5.4). **Kritische Beziehung** (roter Pfeil): beide Vorgänge kritisch und kein Spielraum in spätester Lage.
- **Sammelvorgänge** (E-14): FAZ/SAZ = Minimum, FEZ/SEZ = Maximum der Einzelvorgänge darunter (beliebige Tiefe), GP = SEZ − FEZ, FP entfällt, kritisch, wenn ein Kind kritisch ist. Beziehungen an Sammelvorgängen werden abgelehnt.
- **Abweichung zum Soll-Ende** wird immer gemeldet, wenn ein Soll-Ende gesetzt ist (`projektende − sollEnde`, > 0 = Überschreitung), auch bei Standard-Rückwärtsrechnung.
- **Vorgänger-Spalte.** Nr. ist eine Zahl (auch gegliedert, `1.2.3`) oder ein Kürzel aus Buchstaben/Ziffern; nach einem Kürzel steht vor der Art ein Leerzeichen (`A EE+2`). Abstände nur ganzzahlig mit Vorzeichen; `−` (typografisch) wird akzeptiert, leere Einträge (`;;`) werden übergangen. Langform-Ausgabe: `3 Ende-Anfang +15 Arbeitstage` bzw. `… Kalendertage` (eindeutig wieder einlesbar). Mehrere Beziehungen zwischen denselben Vorgängen (z. B. AA und EE) sind erlaubt.
- **Topologische Reihenfolge** nach Kahn mit Warteschlange in Eingabereihenfolge (deterministisch). Zyklus beim Rechnen → Fehler mit Pfad; beim Eingeben einer Beziehung prüft `zyklusDurchNeueBeziehung` vorab (R-05).

## 11. Umsetzungsnotizen (M2)

- **Tabellen** wie in 4.1, zusätzlich `t_beziehung.plan_id`; `t_kalender.arbeitstage` als Maske `1111100` (Mo–So). Jeder Plan hat einen eigenen Kalender. Keine Fremdschlüssel in SQL; die Befehle halten die Daten konsistent (Löschen eines Vorgangs entfernt Unterpunkte und Beziehungen, Löschen eines Plans alles Zugehörige – jeweils undo-fähig).
- **Migrationen mit Datenschritt:** `Migration.daten(db)` läuft nach dem SQL in derselben Transaktion, damit z. B. Kalender für bestehende Pläne mit UUID-v7-IDs angelegt werden können.
- **Befehlsantwort an die Oberfläche** enthält die IDs der neu eingefügten Zeilen (`BefehlAntwort.eingefuegt`), damit z. B. ein neuer Vorgang direkt ausgewählt ist.
- **Planabfrage** `termine:plan` liefert Plan, Kalender, Ruhezeiten, Vorgänge in Gliederungsreihenfolge (mit Ebene) und das Rechenergebnis inkl. Anzeige-Daten; gerechnet wird bei jeder Abfrage im Main-Prozess.
- **Nr.** ist je Plan eindeutig (ohne Groß-/Kleinschreibung), neue Vorgänge bekommen die nächste freie Zahl. **Vorgänger-Spalte** ersetzt die Vorgänger des Vorgangs; unveränderte Beziehungen behalten ihre ID.
- **Einrücken** hängt den Vorgang unter den Vorgang darüber; ist dieser noch kein Sammelvorgang, wird er dazu – außer er hat Anordnungsbeziehungen (E-14), dann Fehlermeldung. Ausrücken setzt den Vorgang direkt hinter seinen bisherigen Sammelvorgang.
- **Anzeige von Meilensteinen:** Zeitpunkt t ≥ 1 → Ende des Arbeitstags AT t; t ≤ 0 → Beginn des ersten Arbeitstags (Projektbeginn). Gilt auch für Vorgänge mit Dauer 0.
- **Soll-Ende aus Dauer** im Plandialog: „Start + n Monate“ = Tag vor demselben Kalendertag n Monate später (z. B. 14.12.2026 + 15 Monate → 13.03.2028).
- **Anzeigezustand** (gewählter Plan, Datum/AT, Kurz-/Langform, Zoom, zugeklappte Sammelvorgänge) liegt nur in der Oberfläche (localStorage), nicht in der Projektdatei.
- **Netzplan:** Pfeile verlassen den Knoten rechts und erreichen ihn links (unabhängig von der Art; die Art steht am Pfeil, z. B. `+10EA`); Ein-/Ausgänge werden über die Knotenhöhe verteilt. Positionen in Pixeln, gerundet.
- Renderer nutzt `rechnen-kalender`/`rechnen-termine` direkt für Datumsanzeige, Zeitachse und Formatierung der Vorgänger (reine Bibliotheken, ohne Node).

## 12. Umsetzungsnotizen (M3)

- **Stände** sind projektweit (alle Pläne aller Plugins). Kern-Befehle `kern:stand.speichern`, `stand.laden`, `stand.umbenennen`, `stand.loeschen` und Abfrage `kern:staende`. Plugins registrieren einen `StandHandler { speichern, laden, loeschen }`, der innerhalb des Kern-Befehls mit den eigenen Schreibrechten läuft (`transaktionFuerPraefix`) – so ist jeder Stand-Befehl ein einziger Undo-Schritt.
- **Rücksprung** legt vorher automatisch einen Stand der Art `sicherung` („Vor Rücksprung auf …“) an; damit bleibt der Rücksprung auch nach dem Schließen der Datei umkehrbar.
- **termine** kopiert in `t_plan_stand`, `t_kalender_stand`, `t_ruhezeit_stand`, `t_vorgang_stand`, `t_beziehung_stand` (eigene ID, `stand_id`, `orig_id`, Spalten der Quelle). `t_vorgang_stand` speichert zusätzlich FAZ/FEZ/SAZ/SEZ/GP/FP/kritisch/Anfang/Ende, `t_plan_stand` das Projektende (stabile Soll-Ist-Vergleiche ab M4). Kopiert werden nur Spalten, die in beiden Tabellen existieren.
- **Export:** Renderer-Plugins melden `druckansichten` an. Der Main-Prozess öffnet für den Export ein unsichtbares Fenster mit `#druck=<Auftrag>`, wartet auf `data-druck-fertig` und erzeugt `printToPDF` (A3 quer, ohne Ränder; Seitenränder und Umbruch macht die Druckansicht selbst) bzw. eine PNG-Aufnahme (Offscreen-Fenster, Auflösung über Zoomfaktor, max. 16 000 px Kante). Druckfenster dürfen nur `projekt:status` und `abfrage` aufrufen.
- **Balkenplan-Druck:** Plan auf Seitenbreite skaliert (Zeitachse mit eigenem Maßstab), 41 Zeilen je A3-Seite, Plankopf (Projekt, Plan, Stand = Exportdatum, Ersteller, Kennzahlen, Seite), Legende und Risiko-Hinweise der Seite unten. Beziehungspfeile über Seitengrenzen werden nicht gezeichnet.
- **Netzplan-Druck:** auf eine Seite eingepasst; unter 55 % Maßstab wird auf mehrere Seiten gekachelt („Ausschnitt n“).
- **Hilfe:** eigener kleiner Markdown-Renderer (`@bautakt/ui`, ohne HTML-Einfügung); Seitenleiste zeigt die Hilfe der Ansicht und darunter `hilfe/allgemein.md`.
- **Test-Schalter:** `BAUTAKT_TEST_EXPORT_ORDNER` ersetzt den Speichern-Dialog nur in nicht gepackten Builds (automatische Oberflächentests).

## 13. Umsetzungsnotizen (M4)

- **Prognose im Rechenkern:** `VorgangEingabe.ist = { anfang, ende?, rest? }` (Zeitpunkte) und `NetzplanOptionen.stichtag`. Fertig: FAZ/FEZ = Ist, in der Rückwärtsrechnung fest (SAZ = FAZ, SEZ = FEZ), GP = FP = 0, nie kritisch, nicht im minimalen GP. Begonnen: FAZ = Ist-Anfang, FEZ = max(Stichtag, Ist-Anfang) + Rest, Dauer = FEZ − FAZ, eingehende Beziehungen gelten nicht mehr. Nicht begonnen: FAZ ≥ Stichtag. Ergebnis je Vorgang mit `status` (geplant/begonnen/fertig); Sammelvorgang „fertig“, wenn alle Kinder fertig, „begonnen“, sobald eines läuft. Referenztest R-12.
- **Datumsumrechnung:** Ist-Anfang = Beginn des Tages (`zeitpunktFruehestensAb`), Ist-Ende und Stichtag = Ende des Tages (`zeitpunktSpaetestensBis`). Rest aus Prozent im Plugin: ⌈Dauer × (100 − %) / 100⌉ (E-43).
- **`t_ist`** (Migration 4): eine Meldung je (Vorgang, Stichtag); gleiche Meldung am selben Stichtag wird geändert. `t_plan.stichtag` steuert die Prognose; ohne Stichtag ist der Plan reine Planung. Prüfregeln: Ist-Daten ≤ Stichtag, Ende ≥ Anfang, begonnen braucht % oder Restdauer, 100 % braucht Ist-Ende, Fortschritt braucht Ist-Anfang; Meilensteine haben nur „erreicht am“. Ist-Meldungen werden mit dem Vorgang gelöscht; Stände kopieren sie nicht (Rücksprung auf einen Soll-Stand lässt die Ist-Meldungen unberührt).
- **Soll-Vergleich:** Abfrage `termine:plan` mit `sollStandId` liefert `vergleich` (Soll-Termine aus `t_vorgang_stand`, Abweichung = Prognose-FEZ − Soll-Ende im aktuellen Kalender, Projektende-Abweichung). Die Oberfläche merkt sich die Wahl je Plan; ohne Wahl gilt der jüngste Soll-Stand.
- **Darstellung:** Soll-Balken grau und dünn unter dem Prognose-Balken (Meilenstein: kleine Raute), erledigter Anteil begonnener Vorgänge als dunkler Streifen bis zum Stichtag, fertige Vorgänge dunkler, Stichtag-Linie orange gestrichelt; Netzplan-Knoten grün (fertig) bzw. gelb (begonnen).

## 14. Umsetzungsnotizen (M5)

- **Listenlogik** rein in `plugins/termine/renderer/listen.ts` (ohne React, getestet in `test/listen.test.ts`): `terminliste()` (Filter Gewerk/Verantwortlich/Zeitraum, Sammelvorgänge mit passendem Unterpunkt, Gruppierung nach Gewerk), `zeitfenster()`, `meilensteinliste()`, `spurenVerteilen()` für die Beschriftungen der Zeitleiste, `filterText()`/`filterLesen()` für den Export.
- **Zeitraumfilter:** Bezugstag = Stichtag, sonst heute; „nächste n Wochen“ = [Bezug, Bezug + 7n − 1]. Ein Vorgang passt, wenn [Anfang, Ende] das Fenster berührt; Meilensteine zählen mit ihrem Termin. Zugeklappte Sammelvorgänge des Terminplans bleiben auch in der Terminliste zu (nicht bei Gruppierung).
- **Bearbeitung:** gemeinsame Komponente `ListenTabelle` (Text, Datum, Auswahl, Haken) mit Spaltendefinitionen in `listenSpalten.tsx`; dieselben Spalten liefern im Druck die Texte. Alle Änderungen laufen über `vorgang.aendern`. Bedingung ohne Datum → Termin des Meilensteins vorbelegt (E-49).
- **Anzeigezustand:** `listeFilter` wird mit den übrigen Anzeigeeinstellungen im localStorage gehalten (nicht Teil der Projektdaten). Dialoge der Planansichten liegen gemeinsam in `PlanDialoge`.
- **Export:** Druckansichten `termine.terminliste` (Parameter `filter`, `zugeklappt`) und `termine.meilensteinplan` (Zeitleiste auf Seite 1, Tabelle mehrseitig). PNG-Export misst jetzt die Höhe des Inhalts (`.druck`) statt des Fensters, kurze Pläne haben keinen leeren Rand mehr.

## 15. Umsetzungsnotizen (M6)

- **Rechenbibliothek `packages/rechnen-aufwand`:** `aufwandRechnen()` (Menge × AW × (1 + Σ %) ÷ (AK × h/AT), aufrunden mit Toleranz 1e-9, mindestens 1 AT) mit Formelzeile nach E-53, `zahlDeutsch()`, `zahlLesen()` (Eingaben „0,5“, „0.5“, „1.250,5“). Referenztest R-09.
- **Globale Daten im Kern (`GlobaleDaten`, `packages/kern/src/global.ts`):** Ein Plugin kann `global: { datei, migrationen, aktivieren }` mitbringen. Die Datei liegt im App-Datenordner (`%APPDATA%\Bautakt\`, in der Entwicklung über `BAUTAKT_DATENORDNER` umlenkbar), hat eine eigene `plugin_schema`-Tabelle und wird beim App-Start geöffnet. Änderungen laufen über registrierte **Aktionen** (eine Transaktion je Aktion, kein Undo – E-51), Lesen über globale Abfragen. Projekt-Plugins erreichen globale Dienste über `dienste.holen` (`SitzungsOptionen.globaleDienste`).
- **IPC:** `global:abfrage`, `global:aktion` (auch ohne Projekt), Meldung `globalGeaendert`; die Oberfläche lädt daraufhin auch die Projektansichten neu (Hinweis „neuere Version“).
- **Plugin `bibliothek`:** Tabelle `aufwandswert` (id, version, …, ausgeblendet, erstellt) in `bibliothek.sqlite`; aktuelle Version = höchste Versionsnummer. Aktionen anlegen/aendern (neue Version nur bei echter Änderung)/ausblenden/einblenden. Dienste `bibliothek.aufwandswert(id, version?)` und `bibliothek.aktuelleVersion(id)`. Globale Ansicht „Bibliothek“ (`RendererPlugin.globaleAnsichten`), auch ohne geöffnetes Projekt.
- **Eingefrorene Kopie beim nutzenden Plugin:** Termine speichert sie in `t_aufwand` (Migration 5; eine Zeile je Vorgang mit bib_id/bib_version, Werten, Quelle, Stand, Eingaben, Formelzeile, Rechner-Dauer), Verweis `t_vorgang.aufwand_ref`, Formelzeile in `t_vorgang.dauer_herleitung`. `t_aufwand` wird in Ständen mitkopiert und mit dem Vorgang gelöscht. Kosten nutzt später dasselbe Muster für Kennwerte (`k_zeile.kkw_ref`).
- **Befehle:** `aufwand.uebernehmen` liest den Bibliothekswert im Main-Prozess über den Dienst und rechnet selbst nach (der Renderer liefert nur Eingaben); `aufwand.entfernen`. Ohne Bibliothek-Plugin sind nur eigene Werte möglich. `PlanDaten.aufwand` liefert je Vorgang Formel, Rechner-Dauer und ggf. die neuere Bibliotheksversion; die Tabelle zeigt „ƒ“ bzw. „ƒ⚠“.

## 16. Umsetzungsnotizen (M7)

- **Rechenbibliothek `packages/rechnen-kosten`:** KG-Katalog DIN 276 bis zur 3. Ebene (`KG_KATALOG`, `kgEbene`, `kgEltern`, `kgUnter`, `bezugsflaecheVorschlag`), Flächen DIN 277 (`flaechenAbleiten`: NUF = Σ NUF 1–7, NRF = NUF + TF + VF, BGF = NRF + KGF), `indexfaktor` (Modi index/ohne/eigen, Begründungspflicht), `kkwWirksam` und `zeilenkosten` mit Rundung auf Cent, `kostenBaum` (Summen nach oben, Unterzeilen maßgebend), `steuer`. Referenztests R-10, R-11. Der Katalog ist aus Fachwissen erstellt (E-55) und gegen DIN 276:2018-12 zu prüfen.
- **Bibliothek:** globale Migration 2 mit Tabelle `kennwert`; Aufwandswerte und Kennwerte teilen sich eine generische versionierte Sammlung (Abfragen `kennwerte`/`kennwert`/`kennwertVersionen`, Aktionen `kennwert.*`, Dienste `bibliothek.kennwert`, `bibliothek.kennwertAktuelleVersion`). Der Reiter „Bibliothek“ hat die Unterreiter Aufwandswerte und Kostenkennwerte.
- **Plugin `kosten`** (Präfix `k_`, Migration 1): `k_einstellung` (eine Zeile, beim Migrieren angelegt), `k_flaeche` (je Kategorie), `k_zeile` (eine je KG, eingefrorene Kennwertkopie direkt in der Zeile: kkw_ref/kkw_ref_version, Von/Mittel/Bis, Quelle, Stand, Index zum Stand). Stand-Tabellen `*_stand`, Zeilen mit Kosten zum Zeitpunkt des Stands (für M8). Stände von vor dem Kosten-Plugin lassen die Kostendaten beim Rücksprung unverändert.
- **Befehle:** `einstellung.aendern`, `flaeche.setzen` (leer ohne Quelle = löschen), `zeile.anlegen` (Einheit und Flächenkopplung nach Vorschlag), `zeile.aendern` (eingefrorene Kennwertfelder gesperrt), `zeile.kennwertUebernehmen` (gewählt = Mittel, falls leer; Fläche aus der Bezugseinheit), `zeile.kennwertLoesen`, `zeile.loeschen`. Abfrage `kosten:kosten` rechnet alles bei jedem Aufruf (Menge aus Fläche, Index, Region, Kosten, Hinweise, Baum, Summen netto/MwSt./brutto/maßgebend, Bauwerk je m² BGF).
- **Oberfläche:** Reiter „Kosten“ mit KG-Baum (Ebene 1 immer sichtbar, zuklappbar), Direkteingabe von Menge und KKW gewählt per Doppelklick, Flächenleiste DIN 277, Dialoge Einstellungen/Kostengruppe/Zeile, ⚠ mit Hinweisen. Druckansicht `kosten.kostentabelle` (A3 quer bzw. PNG, Gliederung bis Ebene 1–3, Flächen, Summen, Einstellungen); sie nutzt die Seiten- und Kopf-Stile der Terminplan-Druckansichten.

## 17. Umsetzungsnotizen (M8)

- **Rechnung (`rechnen-kosten/src/sollist.ts`):** `sollIstBaum` – Stufen Rahmen/Schätzung/Berechnung summieren wie die Planung (Untergruppen maßgebend), Anschlag/Feststellung additiv aus Aufträgen/Rechnungen (`summenAdditiv`). Prognose: Die maßgebenden KG der Bezugsstufe sind „Posten“; Aufträge und Rechnungen werden dem Posten zugeordnet, unter dem sie liegen (sonst eigener Posten); je Posten Prognose = max(Aufträge, Rechnungen), falls > 0, sonst Bezug; Summen additiv. Abweichung = Prognose − Bezugssumme, Prozent auf eine Nachkommastelle.
- **Daten (Migration 2):** `k_stufe` (kg, stufe, betrag, herkunft planung/hand, zeit; eine Zeile je KG und Stufe), `k_auftrag`, `k_rechnung` (auftrag_id optional, KG folgt dem Auftrag), `k_abweichung` (Ursache je KG); alle mit Stand-Tabellen.
- **Befehle:** `stufe.festschreiben` (ersetzt die Stufe durch die maßgebenden Zeilenkosten), `stufe.setzen` (Korrektur von Hand, leer = entfernen), `auftrag.*`, `rechnung.*` (Löschen eines Auftrags löst nur die Zuordnung seiner Rechnungen), `abweichung.setzen`. Abfrage `kosten:sollist` mit Bezugsstufe.
- **Anhänge (E-62):** Kern-API `MainKontext.anhaenge.registrieren` und `ProjektSitzung.anhangBekannt(pfad)`. IPC `anhang:waehlen` (Datei-Dialog) und `anhang:oeffnen`: geöffnet wird mit `shell.openPath` nur, wenn der Pfad absolut ist, die Endung auf der Liste der Dokument-/Bildformate steht, das Projekt genau diesen Pfad als Anhang führt und die Datei existiert. So kann die Oberfläche keine Programme starten.
- **Oberfläche:** Reiter „Kosten“ mit Unterreitern Kostenplanung, Soll-Ist, Aufträge & Rechnungen; Bezugsstufe und Unterreiter werden im localStorage gemerkt. Druckansicht `kosten.sollist`.

## 18. Umsetzungsnotizen (M9)

- **Datei-Exporte der Plugins:** `MainKontext.exporte.registrieren(format, fn, { endung, beschreibung })`; `fn(db, parameter)` darf asynchron sein und liefert den Dateiinhalt. `ProjektSitzung.dateiExport(plugin, format, parameter)`. Die Oberfläche nutzt denselben Aufruf `export.starten` mit `format: 'xlsx'` und `ansicht: 'plugin.format'`; der Main-Prozess erzeugt zuerst die Datei und zeigt dann den Speichern-Dialog.
- **exceljs** (MIT) als `dependency` von `apps/desktop`: wird wie better-sqlite3 nicht gebündelt, sondern zur Laufzeit geladen und von electron-builder mit allen Unterpaketen ins Paket übernommen (geprüft mit `electron-builder --dir`). Lizenzprüfung der Unterpakete: MIT/ISC/Apache/BSD, dazu freizügige Einzelfälle (Unlicense: big-integer, BlueOak-1.0.0: graceful-fs, MIT AND Zlib: pako, MIT/X11: buffers, chainsaw; jszip „MIT OR GPL-3.0“ wird unter MIT genutzt) – keine GPL/AGPL-Pflicht.
- **Kosten (`plugins/kosten/main/excel.ts`):** Blätter Kostentabelle (E-64), Flächen DIN 277, Soll-Ist, Aufträge, Rechnungen. Formeln mit Ergebnis (E-65): `ROUND(H*I,2)` für KKW wirksam, `ROUND(C*J,2)` für Kosten, Summen über die direkten Untergruppen, Anteil, MwSt. über die Einstellungszelle, Mengenverweise auf das Flächenblatt, Abweichungen im Soll-Ist. Faktor = Indexfaktor × Regionalfaktor als Wert. `fullCalcOnLoad` ist gesetzt, weil exceljs Ergebnisse 0 nicht schreibt.
- **Termine (`plugins/termine/main/excel.ts`):** Vorgangsliste aller Vorgänge (E-66) mit Excel-Gliederung (outlineLevel = Ebene), fixierter Kopfzeile und Autofilter; GP als Formel SAZ − FAZ; Datumswerte als echte Excel-Daten (UTC).

## 19. Umsetzungsnotizen (M10)

- **Ortsstruktur:** Migration 6 legt `t_ort` (id, parent_id, name, reihenfolge) und `t_ort_stand` an; Orte gelten für das ganze Projekt und werden in Ständen mitkopiert. `t_vorgang.ort_von/ort_bis` verweisen auf beliebige Ebenen. Befehle `ort.anlegen` (auch mehrere, kommagetrennt), `ort.umbenennen`, `ort.verschieben`, `ort.loeschen` (mit Unterorten; Verweise der Vorgänge werden geleert). `PlanDaten.orte` liefert die Struktur.
- **Reine Logik `plugins/termine/gemeinsam/orte.ts`:** `ortsBaum` (Reihenfolge, Ebene, Pfad, überdeckte Blätter), `ortsBereich` (Bereich in Blatt-Koordinaten, auch rückwärts), `taktDauerVorschlag`, `gewerkFarbe`.
- **Taktzug `takt.vervielfaeltigen`** (ein Befehl, also ein Rückgängig-Schritt): prüft Einzelvorgänge, direkte Folge auf gleicher Ebene, keine Ist-Meldungen, ≥ 2 Orte. Legt je Ort Kopien unter dem Original an (Nr. „x.j“), verschiebt Außenbeziehungen (Vorgänger → erster Ort, Nachfolger → letzter Ort, gleiche Art und Abstand), löscht Beziehungen innerhalb des Taktzugs und verkettet neu (Ort zu Ort, innerhalb eines Orts in Taktzug-Reihenfolge, EA ohne Abstand). Originale werden Sammelvorgänge mit Ortsbereich erster–letzter Ort; ihre Herleitung entfällt. Zum Schluss wird das Netz gerechnet; ist es nicht rechenbar, wird der Befehl verworfen.
- **Liniendiagramm** (`termine.linien`): eigene SVG-Ansicht, Ausrichtung im Anzeigezustand (`linienAusrichtung`). Koordinatenfunktion bildet (Zeit längs der Zeitachse, Ort in Blatt-Einheiten) auf den Bildpunkt ab, damit beide Ausrichtungen dieselbe Zeichenlogik nutzen. Zeitachse wie im Balkenplan (`Zeitachse`, Zoom geteilt). Export als PDF/PNG ist für das Liniendiagramm noch nicht vorgesehen.

## 20. Umsetzungsnotizen (M11)

- **Daten (Migration 7):** `t_mta_bericht` (plan_id, berichtsdatum, zeit, notiz; eindeutig je Plan und Datum) und `t_mta_termin` (bericht_id, vorgang_id, termin, erreicht). Nicht in Ständen kopiert (Verlauf wie `t_ist`). Gelöscht mit dem Meilenstein bzw. dem Plan.
- **Befehle:** `mta.festhalten` (Berichtsdatum = Stichtag, sonst heute; gleicher Tag ersetzt; Werte = aktuelle Prognose `ende` je Meilenstein, erreicht = Status „fertig“), `mta.loeschen`. Abfrage `termine:mta` liefert Berichte, je Meilenstein die Werte je Bericht und den aktuellen Stand.
- **Reine Logik `gemeinsam/mta.ts`:** `mtaPunkte` (aktueller Stand nur, wenn sein Datum nach dem letzten Bericht liegt), `mtaZeitraum` (gemeinsamer Bereich beider Achsen), `mtaVerschiebung` (Kalendertage gegenüber dem ersten Bericht).
- **Oberfläche:** Reiter „MTA“ mit SVG-Diagramm (`MtaDiagramm`, quadratisch, gleicher Maßstab, Diagonale, Beschriftungen rechts ohne Überlappung) und Tabelle (`MtaTabelle`); beide werden auch in der Druckansicht `termine.mta` verwendet. Ausgeblendete Meilensteine und „aktuellen Stand zeigen“ im Anzeigezustand; der Export übernimmt sie.

## 21. Umsetzungsnotizen (M12)

- **Rechenbibliothek `packages/rechnen-statistik`:** `kennzahlen` (n, Mittel, Median, Stichproben-Standardabweichung, Min, Max), `faktor` (Ist ÷ Soll, wahlweise Prognose), `gruppieren` (Kennzahlen erst ab `MINDEST_N = 3`), `vorschlagNoetig` (Schwelle 5 %), `vorschlagText`.
- **Beobachtungen aus den Fachplugins über Dienste:** `termine.erfahrung` (fertige Vorgänge; Soll aus `t_vorgang_stand` des jüngsten Soll-Stands, Ist = FEZ − FAZ der Prognose, Aufwandswert aus `t_aufwand`, Ursache der jüngsten Ist-Meldung) und `kosten.erfahrung` (Soll-Ist je KG aus `sollIstLaden`, KKW nur für maßgebende Zeilen mit Bibliothekskennwert, BGF). Das Statistik-Plugin liest keine fremden Tabellen.
- **Plugin `statistik`:** Projektdatei `s_projekt` (zählt, Gebäudeart, Bauweise, abgeschlossen, übertragen) mit Befehlen `merkmale.aendern`, `uebertragung.vermerken`; Abfrage `erhebung` bündelt Merkmale (Projekt-ID und -name aus `meta`) und Beobachtungen. Global `erfahrung.sqlite`: `projekt`, `beobachtung` (je Beobachtung alle Schlüssel als Spalten, gruppiert wird erst bei der Abfrage). Aktionen `uebertragen` (ersetzt die Beobachtungen des Projekts), `projekt.zaehlt`, `projekt.entfernen`; Abfragen `projekte`, `merkmale`, `auswertung` (Filter Gebäudeart/Bauweise/BGF, Vorschläge für Aufwandswerte und Kennwerte).
- **Ablauf „Übertragen“ in der Oberfläche:** Abfrage `erhebung` → globale Aktion `uebertragen` → Projektbefehl `uebertragung.vermerken` (undo-fähig, die globale Übertragung selbst nicht – sie wird durch erneutes Übertragen ersetzt).
- **Kern:** `GlobalSchreibzugriff.loeschen(tabelle, schluessel)` (nur mit Bedingung).
- **Vorschläge:** Der neue Wert (bisher × mittlerer Faktor, bei Kennwerten Von/Mittel/Bis) wird im Dialog vorgeschlagen und erst auf Klick als neue Bibliotheksversion gespeichert; die Anmerkung vermerkt den Faktor.

## 22. Umsetzungsnotizen (M13)

- **Kern: Datei-Importe der Plugins.** `MainKontext.importe.registrieren(format, fn, { endungen, beschreibung })`; `fn(inhalt, parameter, db)` liest nur und liefert `{ befehl, daten, bericht }`. `ProjektSitzung.dateiImport` führt den gelieferten Befehl aus – der Import ist damit ein Undo-Schritt und läuft wie jede Änderung über das Protokoll. IPC `import:starten` (Öffnen-Dialog im Main-Prozess; in Entwicklungs-Builds über `BAUTAKT_TEST_IMPORT_DATEI` ohne Dialog). Datei-Exporte kennen jetzt auch `xml`.
- **MSPDI (`plugins/termine/main/msproject.ts`):** Export schreibt XML als Text (1 AT = 8 h = 480 min, Beginn 08:00, Ende 17:00; Abstände in Zehntelminuten, `LagFormat` 7 = AT, 8 = KT; Bedingungen als `ConstraintType` 4/3; Feiertage und Ruhezeiten als `Exceptions`; Quelle/Annahme, Gewerk, Verantwortlich, Herleitung, Anmerkung in `Notes`; Ist als `ActualStart/ActualFinish/PercentComplete` mit `StatusDate`; Soll-Vergleichsstand als `Baseline` 0). Import liest mit fast-xml-parser, rechnet Dauern über `MinutesPerDay` in AT (aufrunden), Abstände in AT/KT (runden), Wochentage und Ausnahmen in Arbeitstage und Ruhezeiten (ohne automatischen Feiertagskalender), Notizen aus einem Bautakt-Export zurück in die Felder, und erstellt einen Bericht.
- **Befehl `plan.importieren`:** neuer Plan (eigener Kalender) oder Ersatz eines Plans (Vorgänge samt Ist, Herleitung und MTA-Werten, Beziehungen und Ruhezeiten werden ersetzt). Abschließend wird das Netz gerechnet; ist es nicht rechenbar, wird der Import verworfen.
- **Grenzen:** Die XML-Dateien sind gegen das MSPDI-Schema geschrieben und mit dem eigenen Import im Kreis getestet (gleiche Termine); ein Test mit MS Project selbst stand nicht zur Verfügung.

