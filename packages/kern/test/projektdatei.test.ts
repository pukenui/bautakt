import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BautaktFehler,
  DATEIFORMAT_VERSION,
  Projektdatei,
  schemaVersion,
  sicherungAnlegen,
  sicherungsPfad,
  type Migration,
} from '../src/index.js';
import { tempOrdner } from './hilfen.js';

const optionen = { projektname: 'Testprojekt', appVersion: '0.0.1' };

describe('Projektdatei', () => {
  it('legt eine neue Datei mit meta, Kern-Schema und WAL an', () => {
    const pfad = path.join(tempOrdner(), 'a.bautakt');
    const d = Projektdatei.erstellen(pfad, optionen);
    const meta = d.meta();
    expect(meta.projektname).toBe('Testprojekt');
    expect(meta.dateiformat).toBe(DATEIFORMAT_VERSION);
    expect(meta.projektId).toMatch(/^[0-9a-f-]{36}$/);
    expect(meta.projektId[14]).toBe('7'); // UUID v7
    expect(meta.erstellt).toMatch(/Z$/); // UTC
    expect(d.tabellen()).toEqual(
      expect.arrayContaining([
        'meta',
        'plugin_schema',
        'aenderungsprotokoll',
        'stand',
        'dateiablage',
      ]),
    );
    expect(d.db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(schemaVersion(d.db, 'kern')).toBe(2);
    d.schliessen();
  });

  it('überschreibt nur, wenn ausdrücklich gewünscht', () => {
    const pfad = path.join(tempOrdner(), 'a.bautakt');
    Projektdatei.erstellen(pfad, optionen).schliessen();
    expect(() => Projektdatei.erstellen(pfad, optionen)).toThrow(BautaktFehler);
    Projektdatei.erstellen(pfad, {
      ...optionen,
      projektname: 'Neu',
      ueberschreiben: true,
    }).schliessen();
    const d = Projektdatei.oeffnen(pfad);
    expect(d.meta().projektname).toBe('Neu');
    d.schliessen();
  });

  it('weist fremde und fehlende Dateien ab', () => {
    const o = tempOrdner();
    expect(() => Projektdatei.oeffnen(path.join(o, 'fehlt.bautakt'))).toThrow(/nicht gefunden/);

    const text = path.join(o, 'text.bautakt');
    fs.writeFileSync(text, 'kein sqlite');
    expect(() => Projektdatei.oeffnen(text)).toThrow(/keine gültige/);

    const fremd = path.join(o, 'fremd.bautakt');
    const roh = new Database(fremd);
    roh.exec('CREATE TABLE x (a)');
    roh.close();
    expect(() => Projektdatei.oeffnen(fremd)).toThrow(/keine Bautakt-Projektdatei/);
  });

  it('lehnt Dateien eines neueren Formats ab', () => {
    const pfad = path.join(tempOrdner(), 'a.bautakt');
    const d = Projektdatei.erstellen(pfad, optionen);
    d.db.prepare("UPDATE meta SET wert = '99' WHERE schluessel = 'dateiformat'").run();
    d.schliessen();
    expect(() => Projektdatei.oeffnen(pfad)).toThrow(/neueren Bautakt-Version/);
  });

  it('führt Plugin-Migrationen aufsteigend und nur einmal aus', () => {
    const pfad = path.join(tempOrdner(), 'a.bautakt');
    const m: Migration[] = [
      { version: 1, name: 'eins', sql: 'CREATE TABLE p_a (id TEXT PRIMARY KEY)' },
      { version: 2, name: 'zwei', sql: 'ALTER TABLE p_a ADD COLUMN name TEXT' },
    ];
    const d = Projektdatei.erstellen(pfad, optionen);
    expect(d.migrieren('p', m.slice(0, 1))).toBe(1);
    expect(d.migrieren('p', m)).toBe(1);
    expect(d.migrieren('p', m)).toBe(0);
    expect(schemaVersion(d.db, 'p')).toBe(2);
    d.schliessen();

    // Datei kennt Version 2, Plugin nur 1 → Datei ist zu neu
    const d2 = Projektdatei.oeffnen(pfad);
    expect(() => d2.migrieren('p', m.slice(0, 1))).toThrow(/Bautakt aktualisieren/);
    d2.schliessen();
  });

  it('rollt eine fehlerhafte Migration vollständig zurück', () => {
    const pfad = path.join(tempOrdner(), 'a.bautakt');
    const d = Projektdatei.erstellen(pfad, optionen);
    const m: Migration[] = [
      { version: 1, name: 'kaputt', sql: 'CREATE TABLE p_a (id TEXT); SELEKT falsch' },
    ];
    expect(() => d.migrieren('p', m)).toThrow(/Migration 1/);
    expect(d.tabellen()).not.toContain('p_a');
    expect(schemaVersion(d.db, 'p')).toBe(0);
    d.schliessen();
  });

  it('verlangt lückenlose Migrationsnummern', () => {
    const d = Projektdatei.erstellen(path.join(tempOrdner(), 'a.bautakt'), optionen);
    expect(() => d.migrieren('p', [{ version: 2, name: 'x', sql: '' }])).toThrow(/lückenlos/);
    d.schliessen();
  });

  it('migriert schreibgeschützt nicht, sondern meldet offene Migrationen', () => {
    const pfad = path.join(tempOrdner(), 'a.bautakt');
    Projektdatei.erstellen(pfad, optionen).schliessen();
    const d = Projektdatei.oeffnen(pfad, { schreibgeschuetzt: true });
    expect(() =>
      d.migrieren('p', [{ version: 1, name: 'x', sql: 'CREATE TABLE p_a (id TEXT)' }]),
    ).toThrow(/schreibgeschützt/);
    d.schliessen();
  });
});

describe('Sicherungskopien (E-41)', () => {
  it('rotiert bak1 bis bak5', () => {
    const pfad = path.join(tempOrdner(), 'a.bautakt');
    const d = Projektdatei.erstellen(pfad, optionen);
    for (let i = 1; i <= 7; i++) {
      d.db.prepare("UPDATE meta SET wert = ? WHERE schluessel = 'projektname'").run(`Stand ${i}`);
      sicherungAnlegen(d);
    }
    d.schliessen();
    for (let nr = 1; nr <= 5; nr++) {
      const b = Projektdatei.oeffnen(sicherungsPfad(pfad, nr), { schreibgeschuetzt: true });
      expect(b.meta().projektname).toBe(`Stand ${8 - nr}`);
      b.schliessen();
    }
    expect(fs.existsSync(sicherungsPfad(pfad, 6))).toBe(false);
  });
});

describe('JSON-Export', () => {
  it('enthält alle Tabellen', () => {
    const d = Projektdatei.erstellen(path.join(tempOrdner(), 'a.bautakt'), optionen);
    const j = d.alsJson();
    expect(j.format).toBe('bautakt-json');
    expect(Object.keys(j.tabellen)).toEqual(
      expect.arrayContaining(['meta', 'aenderungsprotokoll']),
    );
    expect(j.tabellen['meta']?.some((z) => z['schluessel'] === 'projektname')).toBe(true);
    d.schliessen();
  });
});
