import type { Migration } from './migration.js';

/** Schema des Kerns. Wird wie ein Plugin mit der ID „kern“ versioniert. */
export const KERN_MIGRATIONEN: readonly Migration[] = [
  {
    version: 1,
    name: 'Grundtabellen',
    sql: `
      CREATE TABLE meta (
        schluessel TEXT PRIMARY KEY,
        wert TEXT NOT NULL
      );
      CREATE TABLE aenderungsprotokoll (
        id TEXT PRIMARY KEY,
        zeit TEXT NOT NULL,
        befehl_id TEXT NOT NULL,
        befehl TEXT NOT NULL,
        aktion TEXT NOT NULL CHECK (aktion IN ('ausfuehren', 'rueckgaengig', 'wiederholen')),
        plugin TEXT NOT NULL,
        entitaet TEXT NOT NULL,
        entitaet_id TEXT NOT NULL,
        feld TEXT,
        alt TEXT,
        neu TEXT,
        grund TEXT
      );
      CREATE INDEX aenderungsprotokoll_entitaet ON aenderungsprotokoll (entitaet, entitaet_id);
      CREATE INDEX aenderungsprotokoll_zeit ON aenderungsprotokoll (zeit);
      CREATE TABLE stand (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        zeit TEXT NOT NULL,
        art TEXT NOT NULL CHECK (art IN ('soll', 'sicherung')),
        notiz TEXT
      );
    `,
  },
];
