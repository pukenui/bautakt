import type { z } from 'zod';
import type { BefehlDefinition, BefehlErgebnis, Transaktion } from './befehle.js';
import type { Ereignisbus } from './ereignisse.js';
import type { GlobalTeil } from './global.js';
import type { Migration } from './migration.js';
import type { Wert, Zeile } from './sql.js';

/** Nur lesender Zugriff auf die Projektdatei. Geschrieben wird ausschließlich über Befehle. */
export interface PluginDb {
  lesen<T = Zeile>(sql: string, ...parameter: Wert[]): T[];
  eins<T = Zeile>(sql: string, ...parameter: Wert[]): T | undefined;
}

/** Lesende Abfrage, die die Oberfläche (Renderer) über IPC aufrufen darf. */
export interface AbfrageDefinition<A = unknown, R = unknown> {
  name: string;
  schema: z.ZodType<A>;
  ausfuehren(db: PluginDb, argumente: A): R;
}

/** Datei-Export eines Plugins (z. B. Excel, E-25); liefert den Dateiinhalt. */
export type ExportFunktion = (
  db: PluginDb,
  parameter: Record<string, unknown>,
) => Uint8Array | string | Promise<Uint8Array | string>;

export interface ExportInfo {
  /** Dateiendung ohne Punkt, z. B. "xlsx" */
  endung: string;
  /** Bezeichnung für den Speichern-Dialog, z. B. "Excel-Arbeitsmappe" */
  beschreibung: string;
}
/**
 * Datei-Import eines Plugins (z. B. MS-Project-XML, E-79): liest die Datei (nur lesender
 * Datenzugriff) und liefert den Befehl, der die Daten übernimmt – so bleibt der Import
 * rückgängig machbar. `bericht` listet, was gerundet oder weggelassen wurde.
 */
export type ImportFunktion = (
  inhalt: Uint8Array,
  parameter: Record<string, unknown>,
  db: PluginDb,
) => ImportAuftrag | Promise<ImportAuftrag>;

export interface ImportAuftrag {
  befehl: string;
  daten: unknown;
  bericht: string[];
}

export interface ImportInfo {
  /** Dateiendungen ohne Punkt, z. B. ["xml"] */
  endungen: string[];
  beschreibung: string;
}

/**
 * Stände (Soll/Baseline, Architektur 3.3): Jedes Plugin kopiert seine Daten in eigene
 * Stand-Tabellen. Alle drei Funktionen laufen innerhalb eines Kern-Befehls (undo-fähig).
 */
export interface StandHandler {
  /** Kopiert die eigenen Daten (und ggf. Rechenergebnisse) unter der Stand-ID. */
  speichern(tx: Transaktion, standId: string): void;
  /** Rücksprung: ersetzt die eigenen Daten durch die Kopie des Stands. */
  laden(tx: Transaktion, standId: string): void;
  /** Entfernt die Kopie des Stands. */
  loeschen(tx: Transaktion, standId: string): void;
}

/** Was ein Plugin im Main-Prozess je geöffnetem Projekt bekommt (Architektur 3.5). */
export interface MainKontext {
  pluginId: string;
  schreibgeschuetzt: boolean;
  db: PluginDb;
  befehle: {
    registrieren<T>(def: BefehlDefinition<T>): void;
    ausfuehren(name: string, daten: unknown, grund?: string): BefehlErgebnis;
  };
  abfragen: {
    registrieren<A, R>(def: AbfrageDefinition<A, R>): void;
  };
  ereignisse: Ereignisbus;
  dienste: {
    bereitstellen<T>(name: string, impl: T): void;
    /** Dienst eines Projekt-Plugins oder eines globalen Plugin-Teils. */
    holen<T>(name: string): T;
  };
  exporte: { registrieren(format: string, fn: ExportFunktion, info: ExportInfo): void };
  importe: { registrieren(format: string, fn: ImportFunktion, info: ImportInfo): void };
  stand: { registrieren(handler: StandHandler): void };
  /**
   * Dateien, auf die das Projekt verweist (z. B. Rechnungs-PDF, E-62). Nur solche Pfade darf die
   * Oberfläche mit dem Standardprogramm öffnen.
   */
  anhaenge: { registrieren(fn: (db: PluginDb) => string[]): void };
  /**
   * Eingebettete Dateien (E-86): ablegen liefert den SHA-256-Hash (außerhalb von Undo).
   * `verweise` meldet die Hashes, auf die das Plugin noch verweist (auch in Ständen) –
   * alle übrigen entfernt der Kern beim Öffnen.
   */
  dateien: {
    ablegen(inhalt: Uint8Array): string;
    lesen(hash: string): Uint8Array;
    verweise(fn: (db: PluginDb) => string[]): void;
  };
}

/**
 * Main-Teil eines Plugins. Der Renderer-Teil (Ansichten, Menüs, Hilfe) wird getrennt im
 * Renderer-Bundle registriert (`@bautakt/ui`, `RendererPlugin`) und über `id` zugeordnet.
 */
export interface BautaktPlugin {
  id: string; // "termine"
  name: string; // "Terminplanung"
  version: string;
  /** Präfix aller eigenen Tabellen, z. B. "t_". Nur darauf hat das Plugin Schreibzugriff. */
  tabellenPraefix: string;
  abhaengigkeiten?: string[];
  migrationen: readonly Migration[];
  /** Wird für jedes geöffnete Projekt einmal aufgerufen. */
  aktivieren(ctx: MainKontext): void;
  /** Globale Daten im App-Datenordner (z. B. Bibliothek, E-23), unabhängig vom Projekt. */
  global?: GlobalTeil;
}
