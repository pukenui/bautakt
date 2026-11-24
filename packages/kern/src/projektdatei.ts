import Database from 'better-sqlite3';
import fs from 'node:fs';
import { BautaktFehler } from './fehler.js';
import { jetztUtc, neueId } from './id.js';
import { KERN_MIGRATIONEN } from './kern-migrationen.js';
import { migrationenAusfuehren, offeneMigrationen, type Migration } from './migration.js';
import { pruefeBezeichner, type Zeile } from './sql.js';

/** Version des Dateiformats (Struktur von meta/plugin_schema). Plugin-Schemata sind separat versioniert. */
export const DATEIFORMAT_VERSION = 1;
export const DATEIENDUNG = '.bautakt';

export interface ProjektMeta {
  projektId: string;
  projektname: string;
  dateiformat: number;
  appVersion: string;
  erstellt: string;
  geaendert: string;
}

const KERN_ID = 'kern';

/** Eine geöffnete `.bautakt`-Datei (SQLite). Nur im Main-Prozess verwenden. */
export class Projektdatei {
  private constructor(
    readonly pfad: string,
    readonly db: Database.Database,
    readonly schreibgeschuetzt: boolean,
  ) {}

  /** Legt eine neue, leere Projektdatei an. */
  static erstellen(
    pfad: string,
    optionen: { projektname: string; appVersion: string; ueberschreiben?: boolean },
  ): Projektdatei {
    if (fs.existsSync(pfad)) {
      if (!optionen.ueberschreiben) {
        throw new BautaktFehler('DATEI_EXISTIERT', `Die Datei existiert bereits: ${pfad}`);
      }
      for (const endung of ['', '-wal', '-shm']) fs.rmSync(pfad + endung, { force: true });
    }
    const db = new Database(pfad);
    const datei = new Projektdatei(pfad, db, false);
    datei.grundeinstellungen();
    datei.migrieren(KERN_ID, KERN_MIGRATIONEN);
    const jetzt = jetztUtc();
    datei.metaSchreiben({
      projektId: neueId(),
      projektname: optionen.projektname,
      dateiformat: String(DATEIFORMAT_VERSION),
      appVersion: optionen.appVersion,
      erstellt: jetzt,
      geaendert: jetzt,
    });
    return datei;
  }

  /** Öffnet eine vorhandene Projektdatei. */
  static oeffnen(pfad: string, optionen: { schreibgeschuetzt?: boolean } = {}): Projektdatei {
    if (!fs.existsSync(pfad)) {
      throw new BautaktFehler('DATEI_FEHLT', `Die Datei wurde nicht gefunden: ${pfad}`);
    }
    const schreibgeschuetzt = optionen.schreibgeschuetzt ?? false;
    let db: Database.Database | undefined;
    try {
      db = new Database(pfad, { readonly: schreibgeschuetzt, fileMustExist: true });
      db.pragma('schema_version'); // erzwingt das Lesen des Datei-Kopfs
    } catch (e) {
      db?.close(); // sonst bleibt die Datei unter Windows gesperrt
      throw new BautaktFehler(
        'DATEI_UNGUELTIG',
        `Die Datei ist keine gültige Bautakt-Projektdatei: ${(e as Error).message}`,
      );
    }
    const datei = new Projektdatei(pfad, db, schreibgeschuetzt);
    try {
      datei.pruefeFormat();
      if (!schreibgeschuetzt) datei.grundeinstellungen();
      datei.migrieren(KERN_ID, KERN_MIGRATIONEN);
    } catch (e) {
      db.close();
      throw e;
    }
    return datei;
  }

  private grundeinstellungen(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`CREATE TABLE IF NOT EXISTS plugin_schema (
      plugin_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL
    )`);
  }

  private pruefeFormat(): void {
    const tabellen = this.tabellen();
    if (!tabellen.includes('plugin_schema') || !tabellen.includes('meta')) {
      throw new BautaktFehler('DATEI_UNGUELTIG', 'Die Datei ist keine Bautakt-Projektdatei.');
    }
    const format = Number(this.metaWert('dateiformat'));
    if (!Number.isInteger(format) || format < 1) {
      throw new BautaktFehler(
        'DATEI_UNGUELTIG',
        'Die Projektdatei hat keine gültige Formatversion.',
      );
    }
    if (format > DATEIFORMAT_VERSION) {
      throw new BautaktFehler(
        'DATEI_ZU_NEU',
        `Die Projektdatei wurde mit einer neueren Bautakt-Version erstellt (Format ${format}). Bitte Bautakt aktualisieren.`,
      );
    }
  }

  /** Führt offene Migrationen aus. Schreibgeschützt: nur Prüfung, offene Migrationen → Fehler. */
  migrieren(pluginId: string, migrationen: readonly Migration[]): number {
    if (this.schreibgeschuetzt) {
      const offen = offeneMigrationen(this.db, pluginId, migrationen);
      if (offen.length > 0) {
        throw new BautaktFehler(
          'SCHREIBGESCHUETZT',
          `Die Datei muss für „${pluginId}“ aktualisiert werden, ist aber nur schreibgeschützt geöffnet.`,
        );
      }
      return 0;
    }
    return migrationenAusfuehren(this.db, pluginId, migrationen);
  }

  private metaWert(schluessel: string): string | undefined {
    const z = this.db.prepare('SELECT wert FROM meta WHERE schluessel = ?').get(schluessel) as
      { wert: string } | undefined;
    return z?.wert;
  }

  private metaSchreiben(werte: Record<string, string>): void {
    const stmt = this.db.prepare(
      `INSERT INTO meta (schluessel, wert) VALUES (?, ?)
       ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert`,
    );
    this.db.transaction(() => {
      for (const [k, v] of Object.entries(werte)) stmt.run(k, v);
    })();
  }

  meta(): ProjektMeta {
    return {
      projektId: this.metaWert('projektId') ?? '',
      projektname: this.metaWert('projektname') ?? '',
      dateiformat: Number(this.metaWert('dateiformat') ?? 0),
      appVersion: this.metaWert('appVersion') ?? '',
      erstellt: this.metaWert('erstellt') ?? '',
      geaendert: this.metaWert('geaendert') ?? '',
    };
  }

  /** Vermerkt Änderungszeit und App-Version (kein Nutzerdatum, daher nicht im Änderungsprotokoll). */
  geaendertVermerken(appVersion: string): void {
    if (this.schreibgeschuetzt) return;
    this.metaSchreiben({ geaendert: jetztUtc(), appVersion });
  }

  /** Schreibt das WAL in die Hauptdatei zurück (Sicherungspunkt). */
  checkpoint(): void {
    if (this.schreibgeschuetzt) return;
    this.db.pragma('wal_checkpoint(TRUNCATE)');
  }

  /** Schreibt eine vollständige, konsistente Kopie an einen anderen Ort. */
  kopieSchreiben(ziel: string): void {
    fs.rmSync(ziel, { force: true });
    this.db.prepare('VACUUM INTO ?').run(ziel);
  }

  tabellen(): string[] {
    const zeilen = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    return zeilen.map((z) => z.name);
  }

  /** Gesamtes Projekt als JSON-taugliches Objekt (alle Tabellen). */
  alsJson(): { format: 'bautakt-json'; dateiformat: number; tabellen: Record<string, Zeile[]> } {
    const tabellen: Record<string, Zeile[]> = {};
    for (const name of this.tabellen()) {
      const sql = 'SELECT * FROM "' + pruefeBezeichner(name) + '" ORDER BY rowid';
      tabellen[name] = this.db.prepare(sql).all() as Zeile[];
    }
    return { format: 'bautakt-json', dateiformat: DATEIFORMAT_VERSION, tabellen };
  }

  schliessen(): void {
    if (!this.db.open) return;
    this.checkpoint();
    this.db.close();
  }
}
