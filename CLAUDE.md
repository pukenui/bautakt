# CLAUDE.md – Regeln für die Arbeit an Bautakt

Bautakt ist eine Windows-Desktop-App für Termin- und Kostenplanung von Bauprojekten
(Netzplan nach DIN 69900, Balkenpläne, Kosten nach DIN 276/277, Soll-Ist, Statistik),
die schrittweise zu einem BIM-Ökosystem (IFC-Viewer, 5D, 4D) ausgebaut wird.

**Vor jeder Arbeit lesen:**

1. `docs/lastenheft.md` – alle fachlichen Entscheidungen (E-01 … E-66). Verbindlich.
2. `docs/architektur.md` – Kern, Plugins, Datenmodell, Rechenregeln.
3. `docs/roadmap.md` – welcher Meilenstein gerade dran ist. Nur daran arbeiten.
4. `docs/referenzbeispiele.md` – Testfälle mit Sollwerten.

## Stack (festgelegt, nicht ohne Rückfrage ändern)

- Electron + React + TypeScript (strict), Build mit electron-vite
- pnpm-Workspaces (Monorepo), Vitest für Tests
- SQLite über better-sqlite3, nur im Main-Prozess
- Installer: electron-builder (NSIS), Auslieferung als GitHub Release (privates Repo)
- Später BIM: @thatopen/components, web-ifc, three.js

## Arbeitsweise

- **Testpflicht:** Rechenlogik (Netzplan, Kalender, Kosten, Aufwandswerte) liegt als reine
  TypeScript-Bibliothek ohne UI-/Electron-Abhängigkeit vor und wird zuerst gegen
  `docs/referenzbeispiele.md` getestet. Ein Feature gilt erst als fertig, wenn alle
  Referenztests grün sind (`pnpm test`).
- Ein Meilenstein nach dem anderen (siehe Roadmap). Am Ende eines Meilensteins:
  Roadmap-Häkchen setzen, kurze Notiz in `docs/roadmap.md` unter „Verlauf“.
- Weicht die Umsetzung von einer Entscheidung im Lastenheft ab oder ist etwas dort
  nicht geregelt: **nachfragen**, nicht still annehmen. Neue Entscheidungen ins
  Lastenheft eintragen.
- Jede Datenänderung läuft über einen Befehl (Command) des Kerns → automatisch
  Undo/Redo und Eintrag im Änderungsprotokoll. Keine direkten DB-Schreibzugriffe aus
  Plugins vorbei am Kern.
- Datenbankänderungen nur über versionierte Migrationen je Plugin.

## Konventionen

- **Oberfläche nur auf Deutsch.** Fachbegriffe exakt nach Norm: FAZ, FEZ, SAZ, SEZ, GP, FP,
  EA/AA/EE/AE, AT/KT, KG, BGF, NUF, NRF, TF, VF, KGF, AF, GF, KKW.
- Code-Bezeichner für Fachobjekte deutsch ohne Umlaute (`vorgang`, `beziehung`,
  `kostengruppe`, `faz`, `gesamtpuffer`), technische Bezeichner englisch
  (`useStore`, `handler`, `migration`). Kommentare deutsch.
- Zahlen/Datum im deutschen Format (1.234,56 €; TT.MM.JJJJ; KW nach ISO 8601).
- IDs: UUID v7. Zeitstempel in UTC speichern, lokal anzeigen.
- **Keine generierten Begründungstexte.** Die App erzeugt Rechenwege als Formelzeilen
  (z. B. `650 m² × 0,50 h/m² = 325 h ÷ (4 × 8 h) = 10,2 → 11 AT`), aber niemals
  Fließtext-Begründungen. Begründungen/Anmerkungen schreibt der Nutzer selbst in
  eigene Felder.
- Keine Normtexte (DIN-Wortlaut) und keine BKI-Daten im Repo. Kostengruppen-Nummern und
  Kurzbezeichnungen sind erlaubt; Kennwerte trägt der Nutzer selbst mit Quelle ein.

## Electron-Sicherheit

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` im Renderer.
- Kommunikation Renderer ↔ Main nur über eine typisierte, freigegebene IPC-Liste im
  Preload (`contextBridge`).
- Vorerst werden nur Plugins aus diesem Repo geladen (keine fremden Plugins).

## Abhängigkeiten

- Nur Lizenzen MIT, Apache-2.0, BSD, ISC, MPL-2.0. Keine GPL/AGPL im App-Bundle
  (spätere Veröffentlichung soll möglich bleiben). Externe Programme wie FreeCAD (LGPL)
  oder BIMCraft werden nur über IFC-Dateien bzw. deren CLI angesprochen, nie eingebunden.
- Neue Abhängigkeit → kurz begründen; keine kostenpflichtigen Komponenten (z. B. Gantt-Libs).
  Netzplan und Balkenplan werden als eigene SVG-Komponenten gebaut.

## Befehle (Ziel nach M0)

```
pnpm install        # Abhängigkeiten
pnpm dev            # App im Entwicklungsmodus
pnpm test           # alle Tests (Vitest)
pnpm lint           # ESLint + Typprüfung
pnpm build:win      # Windows-Installer (NSIS)
```
