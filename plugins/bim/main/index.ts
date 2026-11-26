import { BautaktFehler, jetztUtc, neueId, type BautaktPlugin, type Migration } from '@bautakt/kern';
import { z } from 'zod';
import type { BauteilZeile, GeschossZeile, ModellInhalt, ModellZeile } from '../gemeinsam/typen.js';
import { SCHEMATA, eigenschaftenLesen, ifcApi, modellAuslesen, modellOeffnen } from './ifc.js';

const MIGRATIONEN: readonly Migration[] = [
  {
    version: 1,
    name: 'IFC-Modelle, Geschosse und Bauteile (E-37, E-86, E-88)',
    sql: `
      CREATE TABLE b_modell (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dateiname TEXT NOT NULL,
        ifc_schema TEXT NOT NULL,
        hash TEXT NOT NULL,
        groesse INTEGER NOT NULL,
        eingelesen TEXT NOT NULL,
        reihenfolge INTEGER NOT NULL
      );
      CREATE TABLE b_geschoss (
        id TEXT PRIMARY KEY,
        modell_id TEXT NOT NULL REFERENCES b_modell(id),
        express_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        hoehe REAL,
        reihenfolge INTEGER NOT NULL
      );
      CREATE INDEX b_geschoss_modell ON b_geschoss (modell_id);
      CREATE TABLE b_bauteil (
        id TEXT PRIMARY KEY,
        modell_id TEXT NOT NULL REFERENCES b_modell(id),
        express_id INTEGER NOT NULL,
        globalid TEXT NOT NULL,
        klasse TEXT NOT NULL,
        name TEXT NOT NULL,
        typ TEXT NOT NULL,
        geschoss_id TEXT REFERENCES b_geschoss(id)
      );
      CREATE INDEX b_bauteil_modell ON b_bauteil (modell_id);
      CREATE INDEX b_bauteil_globalid ON b_bauteil (globalid);
    `,
  },
];

const einlesenSchema = z.object({
  name: z.string().trim().min(1).max(200),
  dateiname: z.string().max(500),
  schema: z.string(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  groesse: z.number().int().nonnegative(),
  geschosse: z.array(
    z.object({ express_id: z.number().int(), name: z.string(), hoehe: z.number().nullable() }),
  ),
  bauteile: z.array(
    z.object({
      express_id: z.number().int(),
      globalid: z.string(),
      klasse: z.string(),
      name: z.string(),
      typ: z.string(),
      geschoss: z.number().int().nullable(),
    }),
  ),
});

const modellIdSchema = z.object({ modellId: z.string().min(1) });

/**
 * Plugin BIM (B1): IFC-Modelle einbetten (E-86), Bauteile und Geschosse als Liste, Eigenschaften
 * bei Bedarf aus der eingebetteten Datei. Mehrere Modelle je Projekt (E-88).
 */
export const bimPlugin: BautaktPlugin = {
  id: 'bim',
  name: 'BIM',
  version: '0.1.0',
  tabellenPraefix: 'b_',
  migrationen: MIGRATIONEN,

  aktivieren(ctx) {
    void ifcApi(); // web-ifc früh starten, damit der erste Import nicht warten muss
    const modell = (id: string): ModellZeile => {
      const m = ctx.db.eins<ModellZeile>(
        `SELECT m.*, (SELECT COUNT(*) FROM b_bauteil b WHERE b.modell_id = m.id) AS anzahl
         FROM b_modell m WHERE m.id = ?`,
        id,
      );
      if (!m) throw new BautaktFehler('NICHT_GEFUNDEN', 'Das Modell existiert nicht (mehr).');
      return m;
    };

    // Die Projektdatei verweist auf die eingebetteten IFC-Dateien (Aufräumen beim Öffnen, E-86)
    ctx.dateien.verweise((db) =>
      db.lesen<{ hash: string }>('SELECT hash FROM b_modell').map((z) => z.hash),
    );

    ctx.befehle.registrieren({
      name: 'modell.einlesen',
      titel: 'IFC-Modell einlesen',
      schema: einlesenSchema,
      ausfuehren(tx, d) {
        const modellId = neueId();
        const n =
          tx.eins<{ n: number | null }>('SELECT MAX(reihenfolge) AS n FROM b_modell')?.n ?? 0;
        tx.einfuegen('b_modell', {
          id: modellId,
          name: d.name,
          dateiname: d.dateiname,
          ifc_schema: d.schema,
          hash: d.hash,
          groesse: d.groesse,
          eingelesen: jetztUtc(),
          reihenfolge: n + 1,
        });
        const geschossId = new Map<number, string>();
        d.geschosse.forEach((g, i) => {
          const id = neueId();
          geschossId.set(g.express_id, id);
          tx.einfuegen('b_geschoss', {
            id,
            modell_id: modellId,
            express_id: g.express_id,
            name: g.name,
            hoehe: g.hoehe,
            reihenfolge: i,
          });
        });
        for (const b of d.bauteile) {
          tx.einfuegen('b_bauteil', {
            id: neueId(),
            modell_id: modellId,
            express_id: b.express_id,
            globalid: b.globalid,
            klasse: b.klasse,
            name: b.name,
            typ: b.typ,
            geschoss_id: b.geschoss === null ? null : (geschossId.get(b.geschoss) ?? null),
          });
        }
      },
    });

    ctx.befehle.registrieren({
      name: 'modell.umbenennen',
      titel: 'Modell umbenennen',
      schema: z.object({ id: z.string(), name: z.string().trim().min(1, 'Name fehlt').max(200) }),
      ausfuehren: (tx, d) => tx.aendern('b_modell', d.id, { name: d.name }),
    });

    ctx.befehle.registrieren({
      name: 'modell.loeschen',
      titel: 'Modell entfernen',
      schema: z.object({ id: z.string() }),
      ausfuehren(tx, d) {
        for (const b of tx.lesen<{ id: string }>(
          'SELECT id FROM b_bauteil WHERE modell_id = ?',
          d.id,
        ))
          tx.loeschen('b_bauteil', b.id);
        for (const g of tx.lesen<{ id: string }>(
          'SELECT id FROM b_geschoss WHERE modell_id = ?',
          d.id,
        ))
          tx.loeschen('b_geschoss', g.id);
        tx.loeschen('b_modell', d.id);
      },
    });

    ctx.importe.registrieren(
      'ifc',
      async (inhalt, p) => {
        const api = await ifcApi();
        let gelesen: ModellInhalt;
        try {
          gelesen = modellAuslesen(api, inhalt);
        } catch (e) {
          throw new BautaktFehler(
            'DATEI_UNGUELTIG',
            `Die Datei ist keine lesbare IFC-Datei (${(e as Error).message}).`,
          );
        }
        if (!(SCHEMATA as readonly string[]).includes(gelesen.schema.toUpperCase())) {
          throw new BautaktFehler(
            'DATEI_UNGUELTIG',
            `IFC-Schema „${gelesen.schema || 'unbekannt'}“ wird noch nicht unterstützt (gelesen werden IFC2x3 und IFC4).`,
          );
        }
        if (gelesen.bauteile.length === 0)
          throw new BautaktFehler('DATEI_UNGUELTIG', 'Die IFC-Datei enthält keine Bauteile.');
        const dateiname = String(p['dateiname'] ?? 'Modell.ifc');
        const hash = ctx.dateien.ablegen(inhalt);
        return {
          befehl: 'modell.einlesen',
          daten: {
            name: dateiname.replace(/\.ifc$/i, ''),
            dateiname,
            schema: gelesen.schema,
            hash,
            groesse: inhalt.byteLength,
            geschosse: gelesen.geschosse,
            bauteile: gelesen.bauteile,
          },
          bericht: [
            `${gelesen.schema}: ${gelesen.bauteile.length} Bauteile in ${gelesen.geschosse.length} Geschossen.`,
            ...gelesen.bericht,
          ],
        };
      },
      { endungen: ['ifc'], beschreibung: 'IFC-Modell' },
    );

    ctx.abfragen.registrieren({
      name: 'modelle',
      schema: z.undefined(),
      ausfuehren: (db) =>
        db.lesen<ModellZeile>(
          `SELECT m.*, (SELECT COUNT(*) FROM b_bauteil b WHERE b.modell_id = m.id) AS anzahl
           FROM b_modell m ORDER BY m.reihenfolge`,
        ),
    });

    ctx.abfragen.registrieren({
      name: 'struktur',
      schema: modellIdSchema,
      ausfuehren: (db, a) => ({
        geschosse: db.lesen<GeschossZeile>(
          'SELECT * FROM b_geschoss WHERE modell_id = ? ORDER BY reihenfolge',
          a.modellId,
        ),
        bauteile: db.lesen<BauteilZeile>(
          'SELECT * FROM b_bauteil WHERE modell_id = ? ORDER BY klasse, name, express_id',
          a.modellId,
        ),
      }),
    });

    // Die eingebettete IFC-Datei für den Viewer (Geometrie entsteht im Renderer)
    ctx.abfragen.registrieren({
      name: 'datei',
      schema: modellIdSchema,
      ausfuehren: (_db, a) => ctx.dateien.lesen(modell(a.modellId).hash),
    });

    ctx.abfragen.registrieren({
      name: 'eigenschaften',
      schema: modellIdSchema.extend({ expressId: z.number().int().positive() }),
      async ausfuehren(_db, a) {
        const m = modell(a.modellId);
        const api = await ifcApi();
        const g = modellOeffnen(api, m.hash, () => ctx.dateien.lesen(m.hash));
        return eigenschaftenLesen(api, g, a.expressId);
      },
    });
  },
};
