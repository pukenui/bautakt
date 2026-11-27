## Allgemein

- **Ein Projekt = eine Datei** (`.bautakt`). Jede Änderung wird sofort gespeichert;
  zusätzlich sichert Bautakt alle 2 Minuten automatisch. Beim Öffnen entsteht eine
  Sicherungskopie (`.bautakt.bak1` … `bak5`).
- Ist eine Datei bereits geöffnet (z. B. auf einem anderen Rechner), öffnet Bautakt sie
  **schreibgeschützt**.
- **Rückgängig/Wiederholen** gilt für jede Änderung der Sitzung. Alle Änderungen stehen
  dauerhaft im Änderungsprotokoll der Datei.
- **Soll-Stände** (Schaltfläche „Stände …“) frieren alle Pläne ein, z. B. „Soll Vertrag“.
  Zurückspringen ist jederzeit möglich; der aktuelle Zustand wird vorher automatisch gesichert.
- **Export …** erzeugt PDF (A3 quer, mit Plankopf, Legende und Risiko-Hinweisen) oder PNG.
- **Fachbegriffe** sind gepunktet unterstrichen: Maus darüber oder mit der Tab-Taste
  hinspringen zeigt eine kurze Erklärung. Alle Begriffe stehen im Reiter **Glossar** dieser
  Hilfe.
- Die **Einführungstour** vom ersten Start lässt sich unten mit „Tour starten“ wiederholen.
- **✦ Claude** (oben rechts, mit geöffnetem Projekt) öffnet den Assistenten: Er beantwortet
  Fragen zum Projekt und schlägt Änderungen vor, die Sie mit **Ausführen** übernehmen
  (Rückgängig wie jede Änderung) oder verwerfen. Dafür brauchen Sie einen eigenen
  Anthropic-API-Schlüssel; vor dem ersten Senden fragt Bautakt je Projekt, ob Projektdaten an
  Anthropic übertragen werden dürfen. Texte für Freitextfelder schreibt Claude nur auf Wunsch,
  gekennzeichnet als „[KI-Entwurf]“ – bitte prüfen und die Kennzeichnung danach selbst
  entfernen.

### Tastenkürzel (überall)

| Kürzel          | Wirkung                     |
| --------------- | --------------------------- |
| F1              | Hilfe ein-/ausblenden       |
| Strg+N          | neues Projekt               |
| Strg+O          | Projekt öffnen              |
| Strg+S          | speichern (Sicherungspunkt) |
| Strg+Umschalt+S | speichern unter             |
| Strg+Z / Strg+Y | Rückgängig / Wiederholen    |
