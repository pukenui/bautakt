# Bautakt

Desktop-App (Windows) für Termin- und Kostenplanung von Bauprojekten: Netzplan nach DIN 69900,
Balkenpläne, Kostenplanung nach DIN 276/277, Soll-Ist und projektübergreifende Statistik –
später erweitert zu einem BIM-Ökosystem (IFC-Viewer, 5D, 4D).

Status: M0–M14, B1–B4 und Claude-Assistent umgesetzt (Termine: Netzplan, Balkenplan, Terminliste, Meilensteinplan, Liniendiagramm mit Taktplanung, Meilenstein-Trendanalyse, Soll-Stände, Ist-Erfassung mit Prognose und Soll-Ist; Kosten nach DIN 276/277 mit Index, Regionalfaktor, MwSt. und Soll-Ist mit Stufen, Aufträgen und Rechnungen; Bibliothek mit Aufwandswerten und Kostenkennwerten; Statistik mit Erfahrungsdatenbank; Export als PDF/PNG, Excel und MS-Project-XML, Import aus MS Project, Hilfe mit Glossar und Einführungstour; IFC-Viewer mit Bauteilliste, Eigenschaften, Schnitt und Messen; Mengen aus dem Modell und Zuordnung IFC → KG mit Kopplung an die Kosten; Flächen nach DIN 277 aus Räumen; Neu-Einlesen mit Änderungsbericht; 4D mit Verknüpfung Vorgang ↔ Bauteile und Bauablauf-Simulation). Letzte Veröffentlichung: Version 0.3.0 (Stand B4 mit Claude-Assistent).

## Installation

Installer `Bautakt-Setup-<Version>.exe` aus den GitHub-Releases herunterladen und ausführen. Der Installer ist nicht signiert; Windows SmartScreen zeigt beim ersten Start eine Warnung ("Weitere Informationen" → "Trotzdem ausführen"). `.bautakt`-Dateien werden mit Bautakt verknüpft.

## Entwicklung

Voraussetzungen: Node.js ≥ 24, pnpm 10 (`npm install -g pnpm@10`).

```
pnpm install        # Abhängigkeiten (lädt Electron und das passende better-sqlite3-Binary)
pnpm dev            # App im Entwicklungsmodus
pnpm test           # alle Tests (Vitest, laufen mit der Node-Laufzeit von Electron)
pnpm lint           # ESLint + Typprüfung
pnpm build:win      # Windows-Installer (NSIS) nach apps/desktop/release/
```

- Lastenheft: [docs/lastenheft.md](docs/lastenheft.md)
- Architektur: [docs/architektur.md](docs/architektur.md)
- Roadmap: [docs/roadmap.md](docs/roadmap.md)
- Referenzbeispiele/Tests: [docs/referenzbeispiele.md](docs/referenzbeispiele.md)
- Regeln für Claude Code: [CLAUDE.md](CLAUDE.md)
