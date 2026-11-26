import fs from 'node:fs';
import { z } from 'zod';
import {
  Befehlsverwaltung,
  nurLesend,
  transaktionFuerPraefix,
  type BefehlAufruf,
  type BefehlErgebnis,
  type Transaktion,
} from './befehle.js';
import { Ereignisbus } from './ereignisse.js';
import { BautaktFehler } from './fehler.js';
import { jetztUtc, neueId } from './id.js';
import type {
  AbfrageDefinition,
  BautaktPlugin,
  ExportFunktion,
  ExportInfo,
  ImportFunktion,
  ImportInfo,
  MainKontext,
  PluginDb,
  StandHandler,
} from './plugin.js';
import { pluginsOrdnen } from './pluginlader.js';
import { Projektdatei } from './projektdatei.js';
import { sicherungAnlegen } from './sicherung.js';
import { sperreErwerben, type Sperre, type SperrInfo } from './sperre.js';
import type { Wert } from './sql.js';
import type { ProjektStatus, StandZeile } from './vertrag.js';

export const AUTOSAVE_MS = 2 * 60 * 1000;

export interface SitzungsOptionen {
  appVersion: string;
  plugins: readonly BautaktPlugin[];
  /** Intervall für Autosave (Standard 2 min, E-41); 0 = aus (für Tests). */
  autosaveMs?: number;
  fehler?: (e: unknown) => void;
  /** Dienste globaler Plugin-Teile (z. B. Bibliothek), für `dienste.holen`. */
  globaleDienste?: { dienst<T>(name: string): T | undefined };
}

interface Erweiterungen {
  abfragen: Map<string, AbfrageDefinition>;
  dienste: Map<string, unknown>;
  exporte: Map<string, { fn: ExportFunktion; info: ExportInfo }>;
  importe: Map<string, { fn: ImportFunktion; info: ImportInfo }>;
  staende: { plugin: string; praefix: string; handler: StandHandler }[];
  anhaenge: ((db: PluginDb) => string[])[];
  dateiVerweise: ((db: PluginDb) => string[])[];
}

/** Ein geöffnetes Projekt: Datei, Sperre, Befehle, Ereignisse und aktivierte Plugins. */
export class ProjektSitzung {
  readonly ereignisse: Ereignisbus;
  private readonly befehle: Befehlsverwaltung;
  private readonly erw: Erweiterungen = {
    abfragen: new Map(),
    dienste: new Map(),
    exporte: new Map(),
    importe: new Map(),
    staende: [],
    anhaenge: [],
    dateiVerweise: [],
  };
  private timer: NodeJS.Timeout | undefined;
  private geschlossen = false;

  private constructor(
    private readonly datei: Projektdatei,
    private readonly sperre: Sperre | undefined,
    readonly fremdeSperre: SperrInfo | undefined,
    private readonly optionen: SitzungsOptionen,
  ) {
    this.ereignisse = new Ereignisbus(optionen.fehler);
    this.befehle = new Befehlsverwaltung(datei.db, this.ereignisse, datei.schreibgeschuetzt);
    this.ereignisse.on('befehl.ausgefuehrt', () => datei.geaendertVermerken(optionen.appVersion));
  }

  /** Neues Projekt anlegen und öffnen. */
  static neu(
    pfad: string,
    projektname: string,
    optionen: SitzungsOptionen & { ueberschreiben?: boolean },
  ): ProjektSitzung {
    const plugins = pluginsOrdnen(optionen.plugins);
    const s = sperreErwerben(pfad);
    if (s.status === 'belegt') {
      throw new BautaktFehler(
        'SCHREIBGESCHUETZT',
        `Die Datei ist bereits geöffnet (${belegtText(s.info)}).`,
      );
    }
    try {
      const datei = Projektdatei.erstellen(pfad, {
        projektname,
        appVersion: optionen.appVersion,
        ueberschreiben: optionen.ueberschreiben ?? false,
      });
      return new ProjektSitzung(datei, s.sperre, undefined, optionen).starten(plugins);
    } catch (e) {
      s.sperre.freigeben();
      throw e;
    }
  }

  /** Vorhandenes Projekt öffnen. Ist es anderswo geöffnet → schreibgeschützt (E-41). */
  static oeffnen(pfad: string, optionen: SitzungsOptionen): ProjektSitzung {
    const plugins = pluginsOrdnen(optionen.plugins);
    if (!fs.existsSync(pfad)) {
      throw new BautaktFehler('DATEI_FEHLT', `Die Datei wurde nicht gefunden: ${pfad}`);
    }
    const s = sperreErwerben(pfad);
    const sperre = s.status === 'erworben' ? s.sperre : undefined;
    try {
      const datei = Projektdatei.oeffnen(pfad, {
        schreibgeschuetzt: !sperre,
        kernMigrieren: false,
      });
      try {
        if (sperre) sicherungAnlegen(datei); // vor den Migrationen sichern
        const fremd = s.status === 'belegt' ? s.info : undefined;
        return new ProjektSitzung(datei, sperre, fremd, optionen).starten(plugins);
      } catch (e) {
        datei.schliessen();
        throw e;
      }
    } catch (e) {
      sperre?.freigeben();
      throw e;
    }
  }

  private starten(plugins: readonly BautaktPlugin[]): this {
    this.datei.kernMigrieren();
    for (const p of plugins) this.datei.migrieren(p.id, p.migrationen);
    this.kernAktivieren();
    for (const p of plugins) p.aktivieren(this.kontext(p));
    // Abgelegte Dateien ohne Verweis entfernen (Undo-Verlauf ist beim Öffnen leer, E-86)
    const db = this.lesezugriff();
    this.datei.dateienAufraeumen(new Set(this.erw.dateiVerweise.flatMap((fn) => fn(db))));
    const ms = this.optionen.autosaveMs ?? AUTOSAVE_MS;
    if (ms > 0 && !this.datei.schreibgeschuetzt) {
      this.timer = setInterval(() => {
        try {
          this.speichern(true);
        } catch (e) {
          (this.optionen.fehler ?? console.error)(e);
        }
      }, ms);
      this.timer.unref();
    }
    return this;
  }

  private kontext(p: BautaktPlugin): MainKontext {
    const db = this.lesezugriff();
    const erw = this.erw;
    return {
      pluginId: p.id,
      schreibgeschuetzt: this.datei.schreibgeschuetzt,
      db,
      befehle: {
        registrieren: (def) => this.befehle.registrieren(p.id, p.tabellenPraefix, def),
        ausfuehren: (name, daten, grund) =>
          this.befehle.ausfuehren({ plugin: p.id, name, daten, ...(grund ? { grund } : {}) }),
      },
      abfragen: {
        registrieren(def) {
          const k = `${p.id}:${def.name}`;
          if (erw.abfragen.has(k)) throw new BautaktFehler('PLUGIN', `Abfrage „${k}“ doppelt.`);
          erw.abfragen.set(k, def as AbfrageDefinition);
        },
      },
      ereignisse: this.ereignisse,
      dienste: {
        bereitstellen(name, impl) {
          if (erw.dienste.has(name)) throw new BautaktFehler('PLUGIN', `Dienst „${name}“ doppelt.`);
          erw.dienste.set(name, impl);
        },
        holen: <T>(name: string): T => {
          const global = this.optionen.globaleDienste?.dienst<T>(name);
          if (!erw.dienste.has(name) && global !== undefined) return global;
          if (!erw.dienste.has(name)) {
            throw new BautaktFehler('PLUGIN', `Dienst „${name}“ ist nicht verfügbar.`);
          }
          return erw.dienste.get(name) as T;
        },
      },
      exporte: {
        registrieren: (format, fn, info) => {
          const k = `${p.id}:${format}`;
          if (erw.exporte.has(k)) throw new BautaktFehler('PLUGIN', `Export „${k}“ doppelt.`);
          erw.exporte.set(k, { fn, info });
        },
      },
      importe: {
        registrieren: (format, fn, info) => {
          const k = `${p.id}:${format}`;
          if (erw.importe.has(k)) throw new BautaktFehler('PLUGIN', `Import „${k}“ doppelt.`);
          erw.importe.set(k, { fn, info });
        },
      },
      stand: {
        registrieren: (handler) =>
          void erw.staende.push({ plugin: p.id, praefix: p.tabellenPraefix, handler }),
      },
      anhaenge: { registrieren: (fn) => void erw.anhaenge.push(fn) },
      dateien: {
        ablegen: (inhalt) => this.datei.dateiAblegen(inhalt),
        lesen: (hash) => this.datei.dateiLesen(hash),
        verweise: (fn) => void erw.dateiVerweise.push(fn),
      },
    };
  }

  /** Befehle und Abfragen des Kerns: Stände (Soll/Sicherung, Architektur 3.3, E-22). */
  private kernAktivieren(): void {
    const staende = this.erw.staende;
    const fuerAlle = (tx: Transaktion, fn: (h: StandHandler, ptx: Transaktion) => void) => {
      for (const s of staende) fn(s.handler, transaktionFuerPraefix(tx, s.praefix));
    };
    const standLesen = (tx: Transaktion, id: string) => {
      const s = tx.eins<StandZeile>('SELECT * FROM stand WHERE id = ?', id);
      if (!s) throw new BautaktFehler('NICHT_GEFUNDEN', 'Der Stand existiert nicht (mehr).');
      return s;
    };
    const anlegen = (tx: Transaktion, name: string, art: 'soll' | 'sicherung', notiz: string) => {
      const id = neueId();
      tx.einfuegen('stand', { id, name, zeit: jetztUtc(), art, notiz });
      fuerAlle(tx, (h, ptx) => h.speichern(ptx, id));
      return id;
    };
    const name = z.string().trim().min(1, 'Der Stand braucht einen Namen').max(200);
    this.befehle.registrieren('kern', 'stand', {
      name: 'stand.speichern',
      titel: 'Stand speichern',
      schema: z.object({
        name,
        notiz: z.string().max(4000).default(''),
        art: z.enum(['soll', 'sicherung']).default('soll'),
      }),
      ausfuehren: (tx, d) => void anlegen(tx, d.name, d.art, d.notiz),
    });
    this.befehle.registrieren('kern', 'stand', {
      name: 'stand.laden',
      titel: 'Auf Stand zurückspringen',
      schema: z.object({ id: z.string().min(1) }),
      ausfuehren: (tx, d) => {
        const ziel = standLesen(tx, d.id);
        // Aktuellen Stand vorher sichern, damit der Rücksprung auch später noch umkehrbar ist
        anlegen(tx, `Vor Rücksprung auf „${ziel.name}“`, 'sicherung', '');
        fuerAlle(tx, (h, ptx) => h.laden(ptx, ziel.id));
      },
    });
    this.befehle.registrieren('kern', 'stand', {
      name: 'stand.umbenennen',
      titel: 'Stand umbenennen',
      schema: z.object({ id: z.string().min(1), name, notiz: z.string().max(4000).optional() }),
      ausfuehren: (tx, d) => {
        standLesen(tx, d.id);
        tx.aendern('stand', d.id, {
          name: d.name,
          ...(d.notiz !== undefined ? { notiz: d.notiz } : {}),
        });
      },
    });
    this.befehle.registrieren('kern', 'stand', {
      name: 'stand.loeschen',
      titel: 'Stand löschen',
      schema: z.object({ id: z.string().min(1) }),
      ausfuehren: (tx, d) => {
        standLesen(tx, d.id);
        fuerAlle(tx, (h, ptx) => h.loeschen(ptx, d.id));
        tx.loeschen('stand', d.id);
      },
    });
    this.erw.abfragen.set('kern:staende', {
      name: 'staende',
      schema: z.undefined(),
      ausfuehren: (db) => db.lesen<StandZeile>('SELECT * FROM stand ORDER BY zeit DESC, id DESC'),
    });
  }

  private lesezugriff(): PluginDb {
    const db = this.datei.db;
    return {
      lesen: <T>(sql: string, ...parameter: Wert[]) => nurLesend(db, sql).all(...parameter) as T[],
      eins: <T>(sql: string, ...parameter: Wert[]) =>
        nurLesend(db, sql).get(...parameter) as T | undefined,
    };
  }

  get pfad(): string {
    return this.datei.pfad;
  }

  get offen(): boolean {
    return !this.geschlossen;
  }

  get schreibgeschuetzt(): boolean {
    return this.datei.schreibgeschuetzt;
  }

  status(): ProjektStatus {
    const meta = this.datei.meta();
    return {
      pfad: this.datei.pfad,
      projektname: meta.projektname,
      erstellt: meta.erstellt,
      geaendert: meta.geaendert,
      schreibgeschuetzt: this.datei.schreibgeschuetzt,
      gesperrtVon: this.fremdeSperre ? belegtText(this.fremdeSperre) : null,
      undo: this.befehle.status(),
    };
  }

  befehl(aufruf: BefehlAufruf): BefehlErgebnis {
    return this.befehle.ausfuehren(aufruf);
  }

  rueckgaengig(): boolean {
    return this.befehle.rueckgaengig();
  }

  wiederholen(): boolean {
    return this.befehle.wiederholen();
  }

  abfrage(plugin: string, name: string, argumente: unknown): unknown {
    const def = this.erw.abfragen.get(`${plugin}:${name}`);
    if (!def)
      throw new BautaktFehler('ABFRAGE_UNBEKANNT', `Unbekannte Abfrage „${plugin}:${name}“.`);
    const geprueft = def.schema.safeParse(argumente);
    if (!geprueft.success) {
      throw new BautaktFehler('BEFEHL_DATEN', `Ungültige Argumente für „${plugin}:${name}“.`);
    }
    return def.ausfuehren(this.lesezugriff(), geprueft.data);
  }

  /** Datei-Export eines Plugins (z. B. Excel) – nur lesend, liefert Inhalt und Endung. */
  async dateiExport(
    plugin: string,
    format: string,
    parameter: Record<string, unknown>,
  ): Promise<{ daten: Uint8Array | string; info: ExportInfo }> {
    const e = this.erw.exporte.get(`${plugin}:${format}`);
    if (!e)
      throw new BautaktFehler('ABFRAGE_UNBEKANNT', `Unbekannter Export „${plugin}:${format}“.`);
    return { daten: await e.fn(this.lesezugriff(), parameter), info: e.info };
  }

  /** Angaben zu einem Datei-Import (Dateiendungen für den Öffnen-Dialog). */
  importInfo(plugin: string, format: string): ImportInfo {
    const e = this.erw.importe.get(`${plugin}:${format}`);
    if (!e)
      throw new BautaktFehler('ABFRAGE_UNBEKANNT', `Unbekannter Import „${plugin}:${format}“.`);
    return e.info;
  }

  /** Datei-Import: Datei lesen, dann den gelieferten Befehl ausführen (ein Undo-Schritt). */
  async dateiImport(
    plugin: string,
    format: string,
    inhalt: Uint8Array,
    parameter: Record<string, unknown>,
  ): Promise<{ bericht: string[]; ergebnis: BefehlErgebnis }> {
    const e = this.erw.importe.get(`${plugin}:${format}`);
    if (!e)
      throw new BautaktFehler('ABFRAGE_UNBEKANNT', `Unbekannter Import „${plugin}:${format}“.`);
    const auftrag = await e.fn(inhalt, parameter, this.lesezugriff());
    const ergebnis = this.befehle.ausfuehren({
      plugin,
      name: auftrag.befehl,
      daten: auftrag.daten,
    });
    return { bericht: auftrag.bericht, ergebnis };
  }

  /** Verweist das Projekt auf diese Datei (Anhang)? Groß-/Kleinschreibung egal (Windows). */
  anhangBekannt(pfad: string): boolean {
    const ziel = pfad.toLowerCase();
    const db = this.lesezugriff();
    return this.erw.anhaenge.some((fn) => fn(db).some((p) => p.toLowerCase() === ziel));
  }

  /** Sicherungspunkt: WAL in die Datei schreiben, Sperre auffrischen. */
  speichern(automatisch = false): void {
    if (this.datei.schreibgeschuetzt) return;
    this.datei.checkpoint();
    this.sperre?.auffrischen();
    this.ereignisse.emit('projekt.gespeichert', { pfad: this.datei.pfad, automatisch });
  }

  /** Kopie an neuem Ort speichern; die aktuelle Sitzung wird geschlossen, die neue geöffnet. */
  speichernUnter(ziel: string): ProjektSitzung {
    if (ziel === this.datei.pfad) {
      this.speichern();
      return this;
    }
    const s = sperreErwerben(ziel);
    if (s.status === 'belegt') {
      throw new BautaktFehler(
        'SCHREIBGESCHUETZT',
        `Die Zieldatei ist geöffnet (${belegtText(s.info)}).`,
      );
    }
    s.sperre.freigeben();
    for (const endung of ['-wal', '-shm']) fs.rmSync(ziel + endung, { force: true });
    this.datei.kopieSchreiben(ziel);
    this.schliessen();
    return ProjektSitzung.oeffnen(ziel, this.optionen);
  }

  /** Gesamtes Projekt als JSON (zum Sichern/Vergleichen). */
  alsJson(): string {
    return JSON.stringify({ ...this.datei.alsJson(), meta: this.datei.meta() }, null, 2);
  }

  schliessen(): void {
    if (this.geschlossen) return;
    this.geschlossen = true;
    if (this.timer) clearInterval(this.timer);
    this.ereignisse.leeren();
    try {
      this.datei.schliessen();
    } finally {
      this.sperre?.freigeben();
    }
  }
}

function belegtText(info: SperrInfo): string {
  const zeit = info.zeit ? new Date(info.zeit).toLocaleString('de-DE') : 'unbekannt';
  return `Rechner ${info.rechner}, Prozess ${info.pid}, seit ${zeit}`;
}
