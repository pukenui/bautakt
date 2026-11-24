import type Database from 'better-sqlite3';
import { BautaktFehler } from './fehler.js';

/** Eine Schema-Migration eines Plugins (oder des Kerns). Versionen aufsteigend ab 1, lückenlos. */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export function schemaVersion(db: Database.Database, pluginId: string): number {
  const zeile = db
    .prepare('SELECT schema_version FROM plugin_schema WHERE plugin_id = ?')
    .get(pluginId) as { schema_version: number } | undefined;
  return zeile?.schema_version ?? 0;
}

export function pruefeMigrationen(pluginId: string, migrationen: readonly Migration[]): void {
  migrationen.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new BautaktFehler(
        'MIGRATION',
        `Migrationen von „${pluginId}“ müssen lückenlos ab 1 nummeriert sein (gefunden: ${m.version} an Stelle ${i + 1}).`,
      );
    }
  });
}

/** Anzahl der noch nicht angewendeten Migrationen; Fehler, wenn die Datei neuer ist als das Plugin. */
export function offeneMigrationen(
  db: Database.Database,
  pluginId: string,
  migrationen: readonly Migration[],
): Migration[] {
  pruefeMigrationen(pluginId, migrationen);
  const aktuell = schemaVersion(db, pluginId);
  if (aktuell > migrationen.length) {
    throw new BautaktFehler(
      'DATEI_ZU_NEU',
      `Die Projektdatei enthält Daten von „${pluginId}“ in Schema-Version ${aktuell}; diese Bautakt-Version kennt nur bis ${migrationen.length}. Bitte Bautakt aktualisieren.`,
    );
  }
  return migrationen.slice(aktuell);
}

/** Führt alle offenen Migrationen aus – jede in einer eigenen Transaktion. */
export function migrationenAusfuehren(
  db: Database.Database,
  pluginId: string,
  migrationen: readonly Migration[],
): number {
  const offen = offeneMigrationen(db, pluginId, migrationen);
  const setzen = db.prepare(
    `INSERT INTO plugin_schema (plugin_id, schema_version) VALUES (?, ?)
     ON CONFLICT(plugin_id) DO UPDATE SET schema_version = excluded.schema_version`,
  );
  for (const m of offen) {
    db.transaction(() => {
      try {
        db.exec(m.sql);
      } catch (e) {
        throw new BautaktFehler(
          'MIGRATION',
          `Migration ${m.version} („${m.name}“) von „${pluginId}“ fehlgeschlagen: ${(e as Error).message}`,
        );
      }
      setzen.run(pluginId, m.version);
    })();
  }
  return offen.length;
}
