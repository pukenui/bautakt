# Bautakt

Desktop-App (Windows) für Termin- und Kostenplanung von Bauprojekten: Netzplan nach DIN 69900,
Balkenpläne, Kostenplanung nach DIN 276/277, Soll-Ist und projektübergreifende Statistik –
später erweitert zu einem BIM-Ökosystem (IFC-Viewer, 5D, 4D).

Status: M0–M7 umgesetzt (Termine: Netzplan, Balkenplan, Terminliste, Meilensteinplan, Soll-Stände, Ist-Erfassung mit Prognose und Soll-Ist; Kosten nach DIN 276/277 mit Index, Regionalfaktor und MwSt.; Bibliothek mit Aufwandswerten und Kostenkennwerten; PDF/PNG-Export und Hilfe). Letzte Veröffentlichung: Version 0.1.0 (Stand M3).

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
