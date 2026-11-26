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

/** Eine Version eines Kostenkennwerts (E-58). */
export interface KennwertZeile {
  id: string;
  version: number;
  bezeichnung: string;
  /** Kostengruppe nach DIN 276, z. B. 300 */
  kg: number;
  /** Bezugseinheit, z. B. „m² BGF“ */
  einheit: string;
  von: number | null;
  mittel: number;
  bis: number | null;
  quelle: string;
  /** Stand der Quelle, z. B. „BKI 2025, Q1“ */
  stand: string;
  /** Baupreisindex zum Stand (z. B. 120,0) */
  index_stand: number | null;
  gebaeudeart: string;
  anmerkung: string;
  ausgeblendet: number;
  erstellt: string;
}

export type KennwertFelder = Pick<
  KennwertZeile,
  | 'bezeichnung'
  | 'kg'
  | 'einheit'
  | 'von'
  | 'mittel'
  | 'bis'
  | 'quelle'
  | 'stand'
  | 'index_stand'
  | 'gebaeudeart'
  | 'anmerkung'
>;

/** Dienste für Projekt-Plugins (über `dienste.holen`). */
export interface BibliothekDienste {
  /** Eine bestimmte Version, ohne Angabe die aktuelle. */
  'bibliothek.aufwandswert': (id: string, version?: number) => AufwandswertZeile | undefined;
  /** Nummer der aktuellen Version; null, wenn unbekannt. */
  'bibliothek.aktuelleVersion': (id: string) => number | null;
  'bibliothek.kennwert': (id: string, version?: number) => KennwertZeile | undefined;
  'bibliothek.kennwertAktuelleVersion': (id: string) => number | null;
}
