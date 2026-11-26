import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { nurLesend } from './befehle.js';
import { BautaktFehler } from './fehler.js';
import { migrationenAusfuehren, type Migration } from './migration.js';
import type { AbfrageDefinition, BautaktPlugin, PluginDb } from './plugin.js';
import { pruefeBezeichner, type Wert, type Zeile } from './sql.js';

/**
 * Globale Daten eines Plugins (E-23, Architektur 4.3): eigene SQLite-Datei im App-Datenordner,
 * unabhängig vom geöffneten Projekt (z. B. `bibliothek.sqlite`). Änderungen laufen über
 * registrierte Aktionen; es gibt kein Undo – die Plugins versionieren ihre Einträge (E-51).
 */

/** Schreibzugriff innerhalb einer Aktion (eine Transaktion je Aktion). */
export interface GlobalSchreibzugriff extends PluginDb {
  einfuegen(tabelle: string, zeile: Zeile): void;
  /** Ändert Zeilen, deren Spalten den Schlüsselwerten entsprechen; liefert die Anzahl. */
  aendern(tabelle: string, schluessel: Zeile, felder: Zeile): number;
}

export interface AktionDefinition<T = unknown, R = unknown> {
  name: string;
  titel: string;
  schema: z.ZodType<T>;
  ausfuehren(db: GlobalSchreibzugriff, daten: T): R;
}

export interface GlobalKontext {
  pluginId: string;
  db: PluginDb;
  abfragen: { registrieren<A, R>(def: AbfrageDefinition<A, R>): void };
  aktionen: { registrieren<T, R>(def: AktionDefinition<T, R>): void };
  /** Dienste für Projekt-Plugins (lesend), z. B. „bibliothek.aufwandswert“. */
  dienste: { bereitstellen<T>(name: string, impl: T): void };
}

/** Globaler Teil eines Plugins. */
export interface GlobalTeil {
  /** Dateiname im App-Datenordner, z. B. "bibliothek.sqlite" */
  datei: string;
  migrationen: readonly Migration[];
  aktivieren(ctx: GlobalKontext): void;
}

/** Lesender Zugriff auf eine globale Datei. */
function lesezugriff(db: Database.Database): PluginDb {
  return {
    lesen: <T>(sql: string, ...p: Wert[]) => nurLesend(db, sql).all(...p) as T[],
    eins: <T>(sql: string, ...p: Wert[]) => nurLesend(db, sql).get(...p) as T | undefined,
  };
}

function schreibzugriff(db: Database.Database): GlobalSchreibzugriff {
  return {
    ...lesezugriff(db),
    einfuegen(tabelle, zeile) {
      const spalten = Object.keys(zeile).map(pruefeBezeichner);
      db.prepare(
        `INSERT INTO ${pruefeBezeichner(tabelle)} (${spalten.join(', ')}) VALUES (${spalten.map(() => '?').join(', ')})`,
      ).run(...spalten.map((s) => zeile[s] ?? null));
    },
    aendern(tabelle, schluessel, felder) {
      const setzen = Object.keys(felder).map(pruefeBezeichner);
      const wo = Object.keys(schluessel).map(pruefeBezeichner);
      if (!setzen.length || !wo.length) return 0;
      return db
        .prepare(
          `UPDATE ${pruefeBezeichner(tabelle)} SET ${setzen.map((s) => `${s} = ?`).join(', ')} WHERE ${wo.map((s) => `${s} = ?`).join(' AND ')}`,
        )
        .run(...setzen.map((s) => felder[s] ?? null), ...wo.map((s) => schluessel[s] ?? null))
        .changes;
    },
  };
}

interface GlobalesPlugin {
  db: Database.Database;
  abfragen: Map<string, AbfrageDefinition>;
  aktionen: Map<string, AktionDefinition>;
}

/** Alle globalen Dateien der geladenen Plugins. Wird einmal beim App-Start geöffnet. */
export class GlobaleDaten {
  private readonly plugins = new Map<string, GlobalesPlugin>();
  private readonly dienste = new Map<string, unknown>();
  private readonly hoerer = new Set<(plugin: string) => void>();

  private constructor(readonly ordner: string) {}

  /** Öffnet (bzw. legt an) die globalen Dateien und führt deren Migrationen aus. */
  static oeffnen(ordner: string, plugins: readonly BautaktPlugin[]): GlobaleDaten {
    fs.mkdirSync(ordner, { recursive: true });
    const g = new GlobaleDaten(ordner);
    try {
      for (const p of plugins) if (p.global) g.pluginOeffnen(p.id, p.global);
    } catch (e) {
      g.schliessen();
      throw e;
    }
    return g;
  }

  private pluginOeffnen(pluginId: string, teil: GlobalTeil): void {
    if (!/^[a-z0-9-]+\.sqlite$/.test(teil.datei)) {
      throw new BautaktFehler('PLUGIN', `Ungültiger Dateiname „${teil.datei}“ für ${pluginId}.`);
    }
    const db = new Database(path.join(this.ordner, teil.datei));
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.exec(
        'CREATE TABLE IF NOT EXISTS plugin_schema (plugin_id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL)',
      );
      migrationenAusfuehren(db, pluginId, teil.migrationen);
    } catch (e) {
      db.close();
      throw e;
    }
    const eintrag: GlobalesPlugin = { db, abfragen: new Map(), aktionen: new Map() };
    this.plugins.set(pluginId, eintrag);
    const dienste = this.dienste;
    teil.aktivieren({
      pluginId,
      db: lesezugriff(db),
      abfragen: {
        registrieren(def) {
          if (eintrag.abfragen.has(def.name))
            throw new BautaktFehler('PLUGIN', `Globale Abfrage „${def.name}“ doppelt.`);
          eintrag.abfragen.set(def.name, def as AbfrageDefinition);
        },
      },
      aktionen: {
        registrieren(def) {
          if (eintrag.aktionen.has(def.name))
            throw new BautaktFehler('PLUGIN', `Aktion „${def.name}“ doppelt.`);
          eintrag.aktionen.set(def.name, def as AktionDefinition);
        },
      },
      dienste: {
        bereitstellen(name, impl) {
          if (dienste.has(name)) throw new BautaktFehler('PLUGIN', `Dienst „${name}“ doppelt.`);
          dienste.set(name, impl);
        },
      },
    });
  }

  private plugin(id: string): GlobalesPlugin {
    const p = this.plugins.get(id);
    if (!p) throw new BautaktFehler('ABFRAGE_UNBEKANNT', `„${id}“ hat keine globalen Daten.`);
    return p;
  }

  abfrage(plugin: string, name: string, argumente: unknown): unknown {
    const p = this.plugin(plugin);
    const def = p.abfragen.get(name);
    if (!def)
      throw new BautaktFehler('ABFRAGE_UNBEKANNT', `Unbekannte Abfrage „${plugin}:${name}“.`);
    const geprueft = def.schema.safeParse(argumente);
    if (!geprueft.success)
      throw new BautaktFehler('BEFEHL_DATEN', `Ungültige Argumente für „${plugin}:${name}“.`);
    return def.ausfuehren(lesezugriff(p.db), geprueft.data);
  }

  /** Führt eine Aktion in einer Transaktion aus und benachrichtigt die Hörer. */
  aktion(plugin: string, name: string, daten: unknown): unknown {
    const p = this.plugin(plugin);
    const def = p.aktionen.get(name);
    if (!def) throw new BautaktFehler('BEFEHL_UNBEKANNT', `Unbekannte Aktion „${plugin}:${name}“.`);
    const geprueft = def.schema.safeParse(daten);
    if (!geprueft.success) {
      const meldung = geprueft.error.issues.map((i) => i.message).join('; ');
      throw new BautaktFehler('BEFEHL_DATEN', `${def.titel}: ${meldung}`);
    }
    const ergebnis = p.db.transaction(() => def.ausfuehren(schreibzugriff(p.db), geprueft.data))();
    for (const h of this.hoerer) h(plugin);
    return ergebnis;
  }

  /** Dienst eines globalen Plugin-Teils; undefined, wenn keiner bereitsteht. */
  dienst<T>(name: string): T | undefined {
    return this.dienste.get(name) as T | undefined;
  }

  onGeaendert(fn: (plugin: string) => void): () => void {
    this.hoerer.add(fn);
    return () => this.hoerer.delete(fn);
  }

  schliessen(): void {
    for (const p of this.plugins.values()) p.db.close();
    this.plugins.clear();
    this.hoerer.clear();
  }
}
