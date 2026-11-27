import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { Ereignisbus } from './ereignisse.js';
import { BautaktFehler } from './fehler.js';
import { jetztUtc, neueId } from './id.js';
import { pruefeBezeichner, type Wert, type Zeile } from './sql.js';

/** Eine einzelne Datenänderung. Daraus werden Undo, Redo und das Änderungsprotokoll abgeleitet. */
export type Aenderung =
  | { art: 'einfuegen'; tabelle: string; id: string; neu: Zeile }
  | {
      art: 'aendern';
      tabelle: string;
      id: string;
      felder: Record<string, { alt: Wert; neu: Wert }>;
    }
  | { art: 'loeschen'; tabelle: string; id: string; alt: Zeile };

export type BefehlAktion = 'ausfuehren' | 'rueckgaengig' | 'wiederholen';

/**
 * Schreibzugriff für Befehle. Jede Tabelle braucht eine Spalte `id TEXT PRIMARY KEY`.
 * Alle Schreibvorgänge werden als Änderung aufgezeichnet.
 */
export interface Transaktion {
  einfuegen(tabelle: string, zeile: Zeile & { id: string }): void;
  /** Ändert nur Felder, deren Wert sich tatsächlich ändert. */
  aendern(tabelle: string, id: string, felder: Zeile): void;
  loeschen(tabelle: string, id: string): void;
  lesen<T = Zeile>(sql: string, ...parameter: Wert[]): T[];
  eins<T = Zeile>(sql: string, ...parameter: Wert[]): T | undefined;
}

/** Definition eines Befehls, registriert von einem Plugin (vgl. Architektur 3.2). */
export interface BefehlDefinition<T = unknown> {
  name: string; // z. B. "plan.umbenennen"
  /** Kurzbezeichnung für Menü/Protokoll, z. B. „Plan umbenennen“. */
  titel: string;
  schema: z.ZodType<T>;
  ausfuehren(tx: Transaktion, daten: T): void;
}

export interface BefehlAufruf {
  plugin: string;
  name: string;
  daten: unknown;
  grund?: string;
}

export interface BefehlErgebnis {
  befehlId: string;
  aenderungen: readonly Aenderung[];
}

interface Eintrag {
  befehlId: string;
  plugin: string;
  befehl: string;
  titel: string;
  grund: string | undefined;
  aenderungen: readonly Aenderung[];
}

interface Registriert {
  plugin: string;
  praefix: string;
  def: BefehlDefinition<unknown>;
}

export interface UndoStatus {
  rueckgaengig: string | null; // Titel des nächsten Undo, sonst null
  wiederholen: string | null;
}

const schluessel = (plugin: string, name: string) => `${plugin}:${name}`;

/** Führt Befehle aus und verwaltet Undo/Redo (unbegrenzt je Sitzung) sowie das Änderungsprotokoll. */
export class Befehlsverwaltung {
  private readonly befehle = new Map<string, Registriert>();
  private readonly undo: Eintrag[] = [];
  private readonly redo: Eintrag[] = [];
  private readonly protokollStmt: Database.Statement | undefined;

  constructor(
    private readonly db: Database.Database,
    private readonly ereignisse: Ereignisbus,
    private readonly schreibgeschuetzt: boolean,
  ) {
    this.protokollStmt = schreibgeschuetzt
      ? undefined
      : db.prepare(
          `INSERT INTO aenderungsprotokoll
           (id, zeit, befehl_id, befehl, aktion, plugin, entitaet, entitaet_id, feld, alt, neu, grund)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
  }

  registrieren<T>(plugin: string, praefix: string, def: BefehlDefinition<T>): void {
    const k = schluessel(plugin, def.name);
    if (this.befehle.has(k)) {
      throw new BautaktFehler('PLUGIN', `Befehl „${k}“ ist bereits registriert.`);
    }
    this.befehle.set(k, { plugin, praefix, def: def as BefehlDefinition<unknown> });
  }

  /** Alle Befehle mit JSON-Schema der Eingabedaten (für Assistenten). */
  liste(): { plugin: string; name: string; titel: string; schema: unknown }[] {
    return [...this.befehle.values()].map((r) => {
      let schema: unknown;
      try {
        schema = z.toJSONSchema(r.def.schema, { io: 'input', unrepresentable: 'any' });
      } catch {
        schema = { type: 'object' };
      }
      return { plugin: r.plugin, name: r.def.name, titel: r.def.titel, schema };
    });
  }

  /** Prüft Daten gegen das Schema eines Befehls, ohne ihn auszuführen. */
  pruefen(
    plugin: string,
    name: string,
    daten: unknown,
  ): { ok: true } | { ok: false; fehler: string } {
    const reg = this.befehle.get(schluessel(plugin, name));
    if (!reg) return { ok: false, fehler: `Unbekannter Befehl „${plugin}:${name}“.` };
    const g = reg.def.schema.safeParse(daten);
    return g.success
      ? { ok: true }
      : {
          ok: false,
          fehler: g.error.issues
            .map((i) => `${i.path.join('.') || 'Daten'}: ${i.message}`)
            .join('; '),
        };
  }

  ausfuehren(aufruf: BefehlAufruf): BefehlErgebnis {
    this.pruefeSchreibbar();
    const reg = this.befehle.get(schluessel(aufruf.plugin, aufruf.name));
    if (!reg) {
      throw new BautaktFehler(
        'BEFEHL_UNBEKANNT',
        `Unbekannter Befehl „${aufruf.plugin}:${aufruf.name}“.`,
      );
    }
    const geprueft = reg.def.schema.safeParse(aufruf.daten);
    if (!geprueft.success) {
      throw new BautaktFehler(
        'BEFEHL_DATEN',
        `Ungültige Daten für „${reg.def.titel}“: ${geprueft.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const eintrag: Eintrag = {
      befehlId: neueId(),
      plugin: reg.plugin,
      befehl: reg.def.name,
      titel: reg.def.titel,
      grund: aufruf.grund?.trim() || undefined,
      aenderungen: [],
    };
    const aenderungen: Aenderung[] = [];
    this.db.transaction(() => {
      reg.def.ausfuehren(new TransaktionImpl(this.db, reg.praefix, aenderungen), geprueft.data);
      this.protokollieren(eintrag, aenderungen, 'ausfuehren');
    })();
    if (aenderungen.length === 0) return { befehlId: eintrag.befehlId, aenderungen };
    const fertig = { ...eintrag, aenderungen };
    this.undo.push(fertig);
    this.redo.length = 0;
    this.melden(fertig, 'ausfuehren');
    return { befehlId: fertig.befehlId, aenderungen };
  }

  rueckgaengig(): boolean {
    this.pruefeSchreibbar();
    const eintrag = this.undo.at(-1);
    if (!eintrag) return false;
    const umgekehrt = [...eintrag.aenderungen].reverse().map(umkehren);
    this.db.transaction(() => {
      umgekehrt.forEach((a) => anwenden(this.db, a));
      this.protokollieren(eintrag, umgekehrt, 'rueckgaengig');
    })();
    this.undo.pop();
    this.redo.push(eintrag);
    this.melden({ ...eintrag, aenderungen: umgekehrt }, 'rueckgaengig');
    return true;
  }

  wiederholen(): boolean {
    this.pruefeSchreibbar();
    const eintrag = this.redo.at(-1);
    if (!eintrag) return false;
    this.db.transaction(() => {
      eintrag.aenderungen.forEach((a) => anwenden(this.db, a));
      this.protokollieren(eintrag, eintrag.aenderungen, 'wiederholen');
    })();
    this.redo.pop();
    this.undo.push(eintrag);
    this.melden(eintrag, 'wiederholen');
    return true;
  }

  status(): UndoStatus {
    return {
      rueckgaengig: this.undo.at(-1)?.titel ?? null,
      wiederholen: this.redo.at(-1)?.titel ?? null,
    };
  }

  private pruefeSchreibbar(): void {
    if (this.schreibgeschuetzt) {
      throw new BautaktFehler('SCHREIBGESCHUETZT', 'Das Projekt ist schreibgeschützt geöffnet.');
    }
  }

  private melden(eintrag: Eintrag, aktion: BefehlAktion): void {
    this.ereignisse.emit('befehl.ausgefuehrt', {
      befehlId: eintrag.befehlId,
      plugin: eintrag.plugin,
      befehl: eintrag.befehl,
      aktion,
      aenderungen: eintrag.aenderungen,
    });
  }

  private protokollieren(
    eintrag: Eintrag,
    aenderungen: readonly Aenderung[],
    aktion: BefehlAktion,
  ): void {
    const stmt = this.protokollStmt;
    if (!stmt) return;
    const zeit = jetztUtc();
    const zeile = (a: Aenderung, feld: string | null, alt: string | null, neu: string | null) =>
      stmt.run(
        neueId(),
        zeit,
        eintrag.befehlId,
        `${eintrag.plugin}:${eintrag.befehl}`,
        aktion,
        eintrag.plugin,
        a.tabelle,
        a.id,
        feld,
        alt,
        neu,
        eintrag.grund ?? null,
      );
    for (const a of aenderungen) {
      if (a.art === 'einfuegen') zeile(a, null, null, JSON.stringify(a.neu));
      else if (a.art === 'loeschen') zeile(a, null, JSON.stringify(a.alt), null);
      else {
        for (const [feld, w] of Object.entries(a.felder)) {
          zeile(a, feld, textWert(w.alt), textWert(w.neu));
        }
      }
    }
  }
}

function textWert(w: Wert): string | null {
  return w === null ? null : String(w);
}

function umkehren(a: Aenderung): Aenderung {
  switch (a.art) {
    case 'einfuegen':
      return { art: 'loeschen', tabelle: a.tabelle, id: a.id, alt: a.neu };
    case 'loeschen':
      return { art: 'einfuegen', tabelle: a.tabelle, id: a.id, neu: a.alt };
    case 'aendern':
      return {
        art: 'aendern',
        tabelle: a.tabelle,
        id: a.id,
        felder: Object.fromEntries(
          Object.entries(a.felder).map(([f, w]) => [f, { alt: w.neu, neu: w.alt }]),
        ),
      };
  }
}

function anwenden(db: Database.Database, a: Aenderung): void {
  const t = pruefeBezeichner(a.tabelle);
  switch (a.art) {
    case 'einfuegen': {
      const spalten = Object.keys(a.neu).map(pruefeBezeichner);
      db.prepare(
        `INSERT INTO ${t} (${spalten.join(', ')}) VALUES (${spalten.map(() => '?').join(', ')})`,
      ).run(...spalten.map((s) => a.neu[s] ?? null));
      return;
    }
    case 'loeschen':
      db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(a.id);
      return;
    case 'aendern': {
      const spalten = Object.keys(a.felder).map(pruefeBezeichner);
      db.prepare(`UPDATE ${t} SET ${spalten.map((s) => `${s} = ?`).join(', ')} WHERE id = ?`).run(
        ...spalten.map((s) => a.felder[s]?.neu ?? null),
        a.id,
      );
      return;
    }
  }
}

/**
 * Nur für Kern-Befehle (z. B. Stände): dieselbe Transaktion mit den Schreibrechten eines
 * Plugins. Alle Änderungen landen im selben Undo-Eintrag.
 */
export function transaktionFuerPraefix(tx: Transaktion, praefix: string): Transaktion {
  if (!(tx instanceof TransaktionImpl)) {
    throw new BautaktFehler('ZUGRIFF', 'Unbekannte Transaktion.');
  }
  return tx.mitPraefix(praefix);
}

class TransaktionImpl implements Transaktion {
  constructor(
    private readonly db: Database.Database,
    private readonly praefix: string,
    private readonly aenderungen: Aenderung[],
  ) {}

  mitPraefix(praefix: string): TransaktionImpl {
    return new TransaktionImpl(this.db, praefix, this.aenderungen);
  }

  private tabelle(name: string): string {
    pruefeBezeichner(name);
    if (!name.startsWith(this.praefix)) {
      throw new BautaktFehler(
        'ZUGRIFF',
        `Kein Schreibzugriff auf „${name}“ (erlaubt: Tabellen mit Präfix „${this.praefix}“).`,
      );
    }
    return name;
  }

  private zeileLesen(tabelle: string, id: string): Zeile | undefined {
    return this.db.prepare(`SELECT * FROM ${tabelle} WHERE id = ?`).get(id) as Zeile | undefined;
  }

  einfuegen(tabelle: string, zeile: Zeile & { id: string }): void {
    const t = this.tabelle(tabelle);
    const a: Aenderung = { art: 'einfuegen', tabelle: t, id: zeile.id, neu: { ...zeile } };
    anwenden(this.db, a);
    // gespeicherte Zeile (inkl. Standardwerten) aufzeichnen, damit Redo exakt gleich ist
    a.neu = this.zeileLesen(t, zeile.id) ?? a.neu;
    this.aenderungen.push(a);
  }

  aendern(tabelle: string, id: string, felder: Zeile): void {
    const t = this.tabelle(tabelle);
    const alt = this.zeileLesen(t, id);
    if (!alt) throw new BautaktFehler('NICHT_GEFUNDEN', `Eintrag ${id} in „${t}“ nicht gefunden.`);
    const diff: Record<string, { alt: Wert; neu: Wert }> = {};
    for (const [feld, neu] of Object.entries(felder)) {
      pruefeBezeichner(feld);
      if (feld === 'id') throw new BautaktFehler('ZUGRIFF', 'Die ID darf nicht geändert werden.');
      if (!(feld in alt))
        throw new BautaktFehler('ZUGRIFF', `Unbekanntes Feld „${feld}“ in „${t}“.`);
      const vorher = alt[feld] ?? null;
      if (vorher !== neu) diff[feld] = { alt: vorher, neu };
    }
    if (Object.keys(diff).length === 0) return;
    const a: Aenderung = { art: 'aendern', tabelle: t, id, felder: diff };
    anwenden(this.db, a);
    this.aenderungen.push(a);
  }

  loeschen(tabelle: string, id: string): void {
    const t = this.tabelle(tabelle);
    const alt = this.zeileLesen(t, id);
    if (!alt) throw new BautaktFehler('NICHT_GEFUNDEN', `Eintrag ${id} in „${t}“ nicht gefunden.`);
    const a: Aenderung = { art: 'loeschen', tabelle: t, id, alt };
    anwenden(this.db, a);
    this.aenderungen.push(a);
  }

  lesen<T = Zeile>(sql: string, ...parameter: Wert[]): T[] {
    return nurLesend(this.db, sql).all(...parameter) as T[];
  }

  eins<T = Zeile>(sql: string, ...parameter: Wert[]): T | undefined {
    return nurLesend(this.db, sql).get(...parameter) as T | undefined;
  }
}

/** Bereitet eine Abfrage vor und stellt sicher, dass sie nichts schreibt. */
export function nurLesend(db: Database.Database, sql: string): Database.Statement {
  const stmt = db.prepare(sql);
  if (!stmt.readonly || !stmt.reader) {
    throw new BautaktFehler(
      'ZUGRIFF',
      'Nur lesende Abfragen erlaubt; Änderungen laufen über Befehle.',
    );
  }
  return stmt;
}
