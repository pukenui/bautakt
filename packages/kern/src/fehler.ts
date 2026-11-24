/** Fehler des Kerns mit maschinenlesbarem Code und deutscher Meldung für die Oberfläche. */
export type FehlerCode =
  | 'DATEI_EXISTIERT'
  | 'DATEI_FEHLT'
  | 'DATEI_UNGUELTIG'
  | 'DATEI_ZU_NEU'
  | 'SCHREIBGESCHUETZT'
  | 'MIGRATION'
  | 'PLUGIN'
  | 'BEFEHL_UNBEKANNT'
  | 'BEFEHL_DATEN'
  | 'ABFRAGE_UNBEKANNT'
  | 'ZUGRIFF'
  | 'NICHT_GEFUNDEN';

export class BautaktFehler extends Error {
  constructor(
    readonly code: FehlerCode,
    message: string,
  ) {
    super(message);
    this.name = 'BautaktFehler';
  }
}
