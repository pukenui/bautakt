/**
 * Freigegebene IPC-Kanäle. Nur diese Namen leitet der Preload weiter;
 * der Main-Prozess registriert genau diese Handler und prüft alle Eingaben.
 */
export const AUFRUFE = [
  'projekt:status',
  'projekt:neu',
  'projekt:oeffnen',
  'projekt:speichern',
  'projekt:speichernUnter',
  'projekt:jsonExportieren',
  'projekt:schliessen',
  'befehl:ausfuehren',
  'befehl:rueckgaengig',
  'befehl:wiederholen',
  'export:starten',
  'abfrage',
  'global:abfrage',
  'global:aktion',
] as const;

export type Aufruf = (typeof AUFRUFE)[number];

/** Push-Kanäle Main → Renderer (Präfix + Meldungsname aus `Meldungen`). */
export const MELDUNG_PRAEFIX = 'meldung:';
export const MELDUNGEN = [
  'status',
  'datenGeaendert',
  'hinweis',
  'menue',
  'globalGeaendert',
] as const;
