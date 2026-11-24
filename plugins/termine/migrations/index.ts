import type { Migration } from '@bautakt/kern';

/** Schema-Migrationen des Plugins „termine“ – nur anhängen, nie ändern. */
export const MIGRATIONEN: readonly Migration[] = [
  {
    version: 1,
    name: 'Pläne',
    sql: `
      CREATE TABLE t_plan (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        art TEXT NOT NULL DEFAULT 'bauablauf',
        projektstart TEXT,
        soll_ende TEXT,
        rueckwaerts_von TEXT NOT NULL DEFAULT 'berechnet'
          CHECK (rueckwaerts_von IN ('berechnet', 'soll_ende')),
        kalender_id TEXT
      );
    `,
  },
];
