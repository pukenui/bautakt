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
  {
    version: 3,
    name: 'Stände (Soll/Baseline)',
    // Je Datentabelle eine Kopie-Tabelle: eigene ID, Stand-ID, Original-ID, dann alle Spalten.
    // Spätere Migrationen, die Spalten hinzufügen, ergänzen sie auch in der *_stand-Tabelle.
    sql: `
      CREATE TABLE t_plan_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        name TEXT, art TEXT, projektstart TEXT, soll_ende TEXT, rueckwaerts_von TEXT, kalender_id TEXT,
        projektende INTEGER, projektende_datum TEXT
      );
      CREATE TABLE t_kalender_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        arbeitstage TEXT, bundesland TEXT
      );
      CREATE TABLE t_ruhezeit_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        kalender_id TEXT, von TEXT, bis TEXT, name TEXT
      );
      CREATE TABLE t_vorgang_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        plan_id TEXT, parent_id TEXT, sortierung REAL, nr TEXT, name TEXT, typ TEXT, dauer_at INTEGER,
        quelle_annahme TEXT, anmerkung TEXT, gewerk TEXT, rolle TEXT, risiko TEXT,
        info_braucht TEXT, info_liefert TEXT, dauer_herleitung TEXT, aufwand_ref TEXT, bauteil_refs TEXT,
        ort_von TEXT, ort_bis TEXT, bedingung_typ TEXT, bedingung_datum TEXT, schnittstelle INTEGER,
        netz_x REAL, netz_y REAL,
        -- Rechenergebnisse zum Zeitpunkt des Stands (für stabile Soll-Ist-Vergleiche)
        faz INTEGER, fez INTEGER, saz INTEGER, sez INTEGER, gp INTEGER, fp INTEGER, kritisch INTEGER,
        anfang TEXT, ende TEXT
      );
      CREATE TABLE t_beziehung_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        plan_id TEXT, von_id TEXT, nach_id TEXT, art TEXT, abstand INTEGER, einheit TEXT
      );
      CREATE INDEX t_plan_stand_s ON t_plan_stand (stand_id);
      CREATE INDEX t_kalender_stand_s ON t_kalender_stand (stand_id);
      CREATE INDEX t_ruhezeit_stand_s ON t_ruhezeit_stand (stand_id);
      CREATE INDEX t_vorgang_stand_s ON t_vorgang_stand (stand_id, plan_id);
      CREATE INDEX t_beziehung_stand_s ON t_beziehung_stand (stand_id);
    `,
  },
  {
    version: 4,
    name: 'Ist-Erfassung und Stichtag (E-32, E-43–E-45)',
    sql: `
      ALTER TABLE t_plan ADD COLUMN stichtag TEXT;
      ALTER TABLE t_plan_stand ADD COLUMN stichtag TEXT;
      CREATE TABLE t_ist (
        id TEXT PRIMARY KEY,
        vorgang_id TEXT NOT NULL,
        stichtag TEXT NOT NULL,
        ist_anfang TEXT,
        ist_ende TEXT,
        fertig_prozent INTEGER,
        restdauer_at INTEGER,
        ursache TEXT,
        ursache_text TEXT NOT NULL DEFAULT '',
        UNIQUE (vorgang_id, stichtag)
      );
      CREATE INDEX t_ist_vorgang ON t_ist (vorgang_id, stichtag);
    `,
  },
  {
    version: 5,
    name: 'Aufwandswert-Rechner: Herleitung mit eingefrorener Bibliothekskopie (E-24, E-54)',
    sql: `
      CREATE TABLE t_aufwand (
        id TEXT PRIMARY KEY,
        vorgang_id TEXT NOT NULL UNIQUE,
        bib_id TEXT,
        bib_version INTEGER,
        bezeichnung TEXT NOT NULL,
        einheit TEXT NOT NULL,
        h_je_me REAL NOT NULL,
        quelle TEXT NOT NULL,
        stand TEXT NOT NULL DEFAULT '',
        menge REAL NOT NULL,
        ak REAL NOT NULL,
        h_je_at REAL NOT NULL,
        zuschlaege TEXT NOT NULL DEFAULT '[]',
        formel TEXT NOT NULL,
        dauer INTEGER NOT NULL
      );
      CREATE TABLE t_aufwand_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        vorgang_id TEXT, bib_id TEXT, bib_version INTEGER, bezeichnung TEXT, einheit TEXT,
        h_je_me REAL, quelle TEXT, stand TEXT, menge REAL, ak REAL, h_je_at REAL,
        zuschlaege TEXT, formel TEXT, dauer INTEGER
      );
      CREATE INDEX t_aufwand_stand_s ON t_aufwand_stand (stand_id);
    `,
  },
];
