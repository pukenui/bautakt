import { neueId, type Migration } from '@bautakt/kern';

/** Schema-Migrationen des Plugins „kosten“ – nur anhängen, nie ändern (Architektur 4.2). */
export const MIGRATIONEN: readonly Migration[] = [
  {
    version: 1,
    name: 'Einstellungen, Flächen DIN 277, Kostenzeilen DIN 276 (E-15, E-16, E-55–E-58)',
    sql: `
      CREATE TABLE k_einstellung (
        id TEXT PRIMARY KEY,
        mwst_satz REAL NOT NULL DEFAULT 19,
        vorsteuerabzug INTEGER NOT NULL DEFAULT 0,
        regionalfaktor REAL NOT NULL DEFAULT 1,
        regionalfaktor_quelle TEXT NOT NULL DEFAULT '',
        index_aktuell REAL,
        index_aktuell_stand TEXT NOT NULL DEFAULT '',
        index_quelle TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE k_flaeche (
        id TEXT PRIMARY KEY,
        kategorie TEXT NOT NULL UNIQUE,
        wert_m2 REAL,
        quelle TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE k_zeile (
        id TEXT PRIMARY KEY,
        kg INTEGER NOT NULL UNIQUE,
        bezeichnung TEXT NOT NULL DEFAULT '',
        menge REAL,
        einheit TEXT NOT NULL DEFAULT '',
        menge_quelle TEXT NOT NULL DEFAULT 'manuell' CHECK (menge_quelle IN ('manuell', 'flaeche', 'ifc')),
        flaeche TEXT,
        kkw_von REAL,
        kkw_mittel REAL,
        kkw_bis REAL,
        kkw_gewaehlt REAL,
        kkw_ref TEXT,
        kkw_ref_version INTEGER,
        kkw_bezeichnung TEXT NOT NULL DEFAULT '',
        kkw_quelle TEXT NOT NULL DEFAULT '',
        kkw_stand TEXT NOT NULL DEFAULT '',
        kkw_stand_index REAL,
        index_modus TEXT NOT NULL DEFAULT 'index' CHECK (index_modus IN ('index', 'ohne', 'eigen')),
        index_faktor REAL,
        index_begruendung TEXT NOT NULL DEFAULT '',
        kommentar TEXT NOT NULL DEFAULT '',
        anmerkung TEXT NOT NULL DEFAULT '',
        bauteil_refs TEXT
      );
      CREATE TABLE k_einstellung_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        mwst_satz REAL, vorsteuerabzug INTEGER, regionalfaktor REAL, regionalfaktor_quelle TEXT,
        index_aktuell REAL, index_aktuell_stand TEXT, index_quelle TEXT
      );
      CREATE TABLE k_flaeche_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        kategorie TEXT, wert_m2 REAL, quelle TEXT
      );
      CREATE TABLE k_zeile_stand (
        id TEXT PRIMARY KEY, stand_id TEXT NOT NULL, orig_id TEXT NOT NULL,
        kg INTEGER, bezeichnung TEXT, menge REAL, einheit TEXT, menge_quelle TEXT, flaeche TEXT,
        kkw_von REAL, kkw_mittel REAL, kkw_bis REAL, kkw_gewaehlt REAL, kkw_ref TEXT,
        kkw_ref_version INTEGER, kkw_bezeichnung TEXT, kkw_quelle TEXT, kkw_stand TEXT,
        kkw_stand_index REAL, index_modus TEXT, index_faktor REAL, index_begruendung TEXT,
        kommentar TEXT, anmerkung TEXT, bauteil_refs TEXT,
        -- Ergebnis zum Zeitpunkt des Stands (für stabile Vergleiche, M8)
        kosten REAL
      );
      CREATE INDEX k_einstellung_stand_s ON k_einstellung_stand (stand_id);
      CREATE INDEX k_flaeche_stand_s ON k_flaeche_stand (stand_id);
      CREATE INDEX k_zeile_stand_s ON k_zeile_stand (stand_id);
    `,
    // Genau eine Einstellungszeile je Projekt
    daten: (db) => db.ausfuehren('INSERT INTO k_einstellung (id) VALUES (?)', neueId()),
  },
];
