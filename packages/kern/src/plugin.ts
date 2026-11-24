import type { z } from 'zod';
import type { BefehlDefinition, BefehlErgebnis } from './befehle.js';
import type { Ereignisbus } from './ereignisse.js';
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

export type ExportFunktion = (db: PluginDb) => Uint8Array | string;
export type ImportFunktion = (inhalt: Uint8Array) => void;

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
    holen<T>(name: string): T;
  };
  exporte: { registrieren(format: string, fn: ExportFunktion): void };
  importe: { registrieren(format: string, fn: ImportFunktion): void };
  stand: {
    registrieren(speichern: (standId: string) => void, laden: (standId: string) => void): void;
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
}
