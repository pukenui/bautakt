/** Typen des Plugins „bibliothek“, geteilt von Main, Renderer und anderen Plugins (nur Typen). */

/** Eine Version eines Aufwandswerts (globale Datei `bibliothek.sqlite`, E-23, E-51). */
export interface AufwandswertZeile {
  id: string;
  version: number;
  bezeichnung: string;
  gewerk: string;
  /** Mengeneinheit, z. B. „m²“ */
  einheit: string;
  /** Aufwandswert in h je Mengeneinheit */
  h_je_me: number;
  quelle: string;
  /** Stand der Quelle, z. B. „2024“ */
  stand: string;
  anmerkung: string;
  /** 1 = gelöscht (ausgeblendet); die Version bleibt lesbar. */
  ausgeblendet: number;
  /** Zeitpunkt der Version (UTC) */
  erstellt: string;
}

/** Felder, die der Nutzer pflegt. */
export type AufwandswertFelder = Pick<
  AufwandswertZeile,
  'bezeichnung' | 'gewerk' | 'einheit' | 'h_je_me' | 'quelle' | 'stand' | 'anmerkung'
>;

/** Dienste für Projekt-Plugins (über `dienste.holen`). */
export interface BibliothekDienste {
  /** Eine bestimmte Version, ohne Angabe die aktuelle. */
  'bibliothek.aufwandswert': (id: string, version?: number) => AufwandswertZeile | undefined;
  /** Nummer der aktuellen Version; null, wenn unbekannt. */
  'bibliothek.aktuelleVersion': (id: string) => number | null;
}
