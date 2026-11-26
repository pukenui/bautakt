import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ProjektSitzung,
  sicherungsPfad,
  type BautaktPlugin,
  type MainKontext,
} from '../src/index.js';
import { OPTIONEN, tempOrdner } from './hilfen.js';

/** Test-Plugin, das Dateien ablegt und in einer Zeile auf den Hash verweist. */
function ablagePlugin(merken: (ctx: MainKontext) => void = () => {}): BautaktPlugin {
  return {
    id: 'ablage',
    name: 'Ablage',
    version: '1.0.0',
    tabellenPraefix: 'a_',
    migrationen: [
      {
        version: 1,
        name: 'Modelle',
        sql: 'CREATE TABLE a_modell (id TEXT PRIMARY KEY, hash TEXT NOT NULL)',
      },
    ],
    aktivieren(ctx) {
      merken(ctx);
      ctx.dateien.verweise((db) =>
        db.lesen<{ hash: string }>('SELECT hash FROM a_modell').map((z) => z.hash),
      );
      ctx.befehle.registrieren({
        name: 'modell.anlegen',
        titel: 'Modell anlegen',
        schema: z.object({ id: z.string(), hash: z.string() }),
        ausfuehren: (tx, d) => tx.einfuegen('a_modell', d),
      });
      ctx.befehle.registrieren({
        name: 'modell.loeschen',
        titel: 'Modell löschen',
        schema: z.object({ id: z.string() }),
        ausfuehren: (tx, d) => tx.loeschen('a_modell', d.id),
      });
    },
  };
}

const inhalt = new TextEncoder().encode('ISO-10303-21;\nHEADER;\nENDSEC;\n');
const sha = createHash('sha256').update(inhalt).digest('hex');

describe('Dateiablage des Kerns (E-86)', () => {
  it('legt Dateien einmal unter ihrem SHA-256 ab und liest sie zurück', () => {
    const pfad = path.join(tempOrdner(), 'p.bautakt');
    let ctx: MainKontext | undefined;
    const s = ProjektSitzung.neu(pfad, 'P', {
      ...OPTIONEN,
      plugins: [ablagePlugin((c) => (ctx = c))],
    });
    expect(ctx?.dateien.ablegen(inhalt)).toBe(sha);
    expect(ctx?.dateien.ablegen(inhalt)).toBe(sha); // zweites Mal: keine Kopie
    expect(Buffer.from(ctx?.dateien.lesen(sha) ?? []).equals(Buffer.from(inhalt))).toBe(true);
    expect(() => ctx?.dateien.lesen('0'.repeat(64))).toThrow(/fehlt/);
    // Undo und Protokoll enthalten nur den Hash, nie den Inhalt
    s.befehl({ plugin: 'ablage', name: 'modell.anlegen', daten: { id: 'm1', hash: sha } });
    const json = JSON.parse(s.alsJson()) as { tabellen: Record<string, Record<string, unknown>[]> };
    expect(json.tabellen.dateiablage).toEqual([
      { hash: sha, groesse: inhalt.byteLength, angelegt: expect.stringMatching(/Z$/) },
    ]);
    expect(JSON.stringify(json.tabellen.aenderungsprotokoll)).not.toContain('ISO-10303');
    s.schliessen();
  });

  it('entfernt beim Öffnen Dateien ohne Verweis, behält verwiesene', () => {
    const pfad = path.join(tempOrdner(), 'p.bautakt');
    let ctx: MainKontext | undefined;
    const s = ProjektSitzung.neu(pfad, 'P', {
      ...OPTIONEN,
      plugins: [ablagePlugin((c) => (ctx = c))],
    });
    const anderer = ctx?.dateien.ablegen(new Uint8Array([1, 2, 3])) ?? '';
    ctx?.dateien.ablegen(inhalt);
    s.befehl({ plugin: 'ablage', name: 'modell.anlegen', daten: { id: 'm1', hash: sha } });
    s.schliessen();

    const zaehlen = () => {
      const db = new Database(pfad, { readonly: true });
      const n = (db.prepare('SELECT hash FROM dateiablage').all() as { hash: string }[]).map(
        (z) => z.hash,
      );
      db.close();
      return n;
    };
    const s2 = ProjektSitzung.oeffnen(pfad, { ...OPTIONEN, plugins: [ablagePlugin()] });
    s2.schliessen();
    expect(zaehlen()).toEqual([sha]);
    expect(anderer).not.toBe(sha);

    // gelöschtes Modell: Datei bleibt bis zum nächsten Öffnen (Undo könnte sie noch brauchen)
    const s3 = ProjektSitzung.oeffnen(pfad, { ...OPTIONEN, plugins: [ablagePlugin()] });
    s3.befehl({ plugin: 'ablage', name: 'modell.loeschen', daten: { id: 'm1' } });
    s3.schliessen();
    expect(zaehlen()).toEqual([sha]);
    ProjektSitzung.oeffnen(pfad, { ...OPTIONEN, plugins: [ablagePlugin()] }).schliessen();
    expect(zaehlen()).toEqual([]);
  });

  it('sichert ältere Dateien vor der Kern-Migration', () => {
    const pfad = path.join(tempOrdner(), 'p.bautakt');
    ProjektSitzung.neu(pfad, 'P', { ...OPTIONEN, plugins: [] }).schliessen();
    // Zustand einer Datei aus 0.2.0 herstellen: Kern-Schema 1 ohne Dateiablage
    const db = new Database(pfad);
    db.exec('DROP TABLE dateiablage');
    db.prepare("UPDATE plugin_schema SET schema_version = 1 WHERE plugin_id = 'kern'").run();
    db.close();
    ProjektSitzung.oeffnen(pfad, { ...OPTIONEN, plugins: [] }).schliessen();
    const alt = new Database(sicherungsPfad(pfad, 1), { readonly: true });
    const tabellen = (
      alt.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name);
    alt.close();
    expect(tabellen).not.toContain('dateiablage');
    expect(fs.existsSync(pfad)).toBe(true);
  });
});
