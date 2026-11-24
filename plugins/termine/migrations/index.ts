import { neueId, type Migration } from '@bautakt/kern';

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
  {
    version: 2,
    name: 'Vorgänge, Beziehungen, Kalender',
    sql: `
      CREATE TABLE t_kalender (
        id TEXT PRIMARY KEY,
        arbeitstage TEXT NOT NULL DEFAULT '1111100', -- Mo … So
        bundesland TEXT DEFAULT 'NW'
      );
      CREATE TABLE t_ruhezeit (
        id TEXT PRIMARY KEY,
        kalender_id TEXT NOT NULL,
        von TEXT NOT NULL,
        bis TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX t_ruhezeit_kalender ON t_ruhezeit (kalender_id);
      CREATE TABLE t_vorgang (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        parent_id TEXT,
        sortierung REAL NOT NULL,
        nr TEXT NOT NULL,
        name TEXT NOT NULL,
        typ TEXT NOT NULL DEFAULT 'vorgang' CHECK (typ IN ('vorgang', 'sammel', 'meilenstein')),
        dauer_at INTEGER NOT NULL DEFAULT 0,
        quelle_annahme TEXT NOT NULL DEFAULT '',
        anmerkung TEXT NOT NULL DEFAULT '',
        gewerk TEXT NOT NULL DEFAULT '',
        rolle TEXT NOT NULL DEFAULT '',
        risiko TEXT NOT NULL DEFAULT '',
        info_braucht TEXT NOT NULL DEFAULT '',
        info_liefert TEXT NOT NULL DEFAULT '',
        dauer_herleitung TEXT NOT NULL DEFAULT '',
        aufwand_ref TEXT,
        bauteil_refs TEXT NOT NULL DEFAULT '[]',
        ort_von TEXT,
        ort_bis TEXT,
        bedingung_typ TEXT NOT NULL DEFAULT 'keine'
          CHECK (bedingung_typ IN ('keine', 'nicht_frueher_als', 'muss_enden_am')),
        bedingung_datum TEXT,
        schnittstelle INTEGER NOT NULL DEFAULT 0,
        netz_x REAL,
        netz_y REAL
      );
      CREATE INDEX t_vorgang_plan ON t_vorgang (plan_id, parent_id, sortierung);
      CREATE TABLE t_beziehung (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        von_id TEXT NOT NULL,
        nach_id TEXT NOT NULL,
        art TEXT NOT NULL CHECK (art IN ('EA', 'AA', 'EE', 'AE')),
        abstand INTEGER NOT NULL DEFAULT 0,
        einheit TEXT NOT NULL DEFAULT 'AT' CHECK (einheit IN ('AT', 'KT'))
      );
      CREATE INDEX t_beziehung_plan ON t_beziehung (plan_id);
    `,
    // Bestehende Pläne aus M0 bekommen Kalender und Projektstart
    daten(db) {
      const heute = new Date();
      const iso = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`;
      for (const p of db.alle<{ id: string }>('SELECT id FROM t_plan WHERE kalender_id IS NULL')) {
        const k = neueId();
        db.ausfuehren('INSERT INTO t_kalender (id) VALUES (?)', k);
        db.ausfuehren('UPDATE t_plan SET kalender_id = ? WHERE id = ?', k, p.id);
      }
      db.ausfuehren('UPDATE t_plan SET projektstart = ? WHERE projektstart IS NULL', iso);
    },
  },
];
