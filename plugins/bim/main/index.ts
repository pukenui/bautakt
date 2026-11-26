import { BautaktFehler, jetztUtc, neueId, type BautaktPlugin, type Migration } from '@bautakt/kern';
import { z } from 'zod';
import { kostengruppe } from '@bautakt/rechnen-kosten';
import type {
  BauteilZeile,
  GeschossZeile,
  ModellInhalt,
  ModellZeile,
  ZuweisungZeile,
} from '../gemeinsam/typen.js';
import { MENGENARTEN, STANDARD_REGELN } from '../gemeinsam/zuordnung.js';
import { SCHEMATA, eigenschaftenLesen, ifcApi, modellAuslesen, modellOeffnen } from './ifc.js';
import { bimMengenDienst, regelnLesen } from './mengen.js';

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
  {
    version: 2,
    name: 'Merkmale und Mengen der Bauteile, Regeltabelle IFC → KG, Zuweisungen (E-90–E-93)',
    sql: `
      ALTER TABLE b_bauteil ADD COLUMN predefined TEXT NOT NULL DEFAULT '';
      ALTER TABLE b_bauteil ADD COLUMN aussen INTEGER;
      ALTER TABLE b_bauteil ADD COLUMN tragend INTEGER;
      -- JSON (Mengen mit Herkunft); NULL bei Modellen, die vor B2 eingelesen wurden
      ALTER TABLE b_bauteil ADD COLUMN mengen TEXT;
      CREATE TABLE b_kg_regel (
        id TEXT PRIMARY KEY,
        reihenfolge INTEGER NOT NULL,
        klasse TEXT NOT NULL,
        predefined TEXT NOT NULL DEFAULT '',
        aussen INTEGER,
        tragend INTEGER,
        enthaelt TEXT NOT NULL DEFAULT '',
        kg INTEGER NOT NULL,
        mengenart TEXT NOT NULL CHECK (mengenart IN ('flaeche', 'volumen', 'laenge', 'stueck'))
      );
      CREATE TABLE b_kg_zuweisung (
        id TEXT PRIMARY KEY,
        modell_id TEXT NOT NULL REFERENCES b_modell(id),
        globalid TEXT NOT NULL,
        kg INTEGER,
        mengenart TEXT NOT NULL CHECK (mengenart IN ('flaeche', 'volumen', 'laenge', 'stueck')),
        UNIQUE (modell_id, globalid)
      );
    `,
    // Standardregeln vorbelegen (E-90)
    daten: (db) =>
      STANDARD_REGELN.forEach((r, i) =>
        db.ausfuehren(
          'INSERT INTO b_kg_regel (id, reihenfolge, klasse, predefined, aussen, tragend, enthaelt, kg, mengenart) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          neueId(),
          i + 1,
          r.klasse,
          r.predefined,
          r.aussen,
          r.tragend,
          '',
          r.kg,
          r.mengenart,
        ),
      ),
  },
];

const mengenartSchema = z.enum(
  MENGENARTEN as unknown as ['flaeche', 'volumen', 'laenge', 'stueck'],
);
const kgSchema = z
  .number()
  .int()
  .refine((kg) => !!kostengruppe(kg), 'Unbekannte Kostengruppe');
const jaNein = z.union([z.literal(0), z.literal(1)]).nullable();
const regelFelder = z.object({
  klasse: z.string().trim().min(1, 'IFC-Klasse fehlt').max(100),
  predefined: z.string().trim().max(100).default(''),
  aussen: jaNein.default(null),
  tragend: jaNein.default(null),
  enthaelt: z.string().trim().max(200).default(''),
  kg: kgSchema,
  mengenart: mengenartSchema,
});
const mengeSchema = z.object({
  wert: z.number(),
  herkunft: z.enum(['qto', 'geometrie']),
  name: z.string().optional(),
});

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
      predefined: z.string(),
      aussen: jaNein,
      tragend: jaNein,
      mengen: z.object({
        flaeche: mengeSchema.optional(),
        volumen: mengeSchema.optional(),
        laenge: mengeSchema.optional(),
      }),
    }),
  ),
});

const modellIdSchema = z.object({ modellId: z.string().min(1) });

/**
 * Plugin BIM (B1, B2): IFC-Modelle einbetten (E-86), Bauteile und Geschosse als Liste, Eigenschaften
 * bei Bedarf aus der eingebetteten Datei, mehrere Modelle je Projekt (E-88). Mengen und Zuordnung
 * IFC → KG über eine Regeltabelle je Projekt; Dienst `bim.mengen` für die Kosten (E-90–E-93).
 */
export const bimPlugin: BautaktPlugin = {
  id: 'bim',
  name: 'BIM',
  version: '0.2.0',
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
            predefined: b.predefined,
            aussen: b.aussen,
            tragend: b.tragend,
            mengen: JSON.stringify(b.mengen),
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
        for (const z of tx.lesen<{ id: string }>(
          'SELECT id FROM b_kg_zuweisung WHERE modell_id = ?',
          d.id,
        ))
          tx.loeschen('b_kg_zuweisung', z.id);
        tx.loeschen('b_modell', d.id);
      },
    });

    // --- Regeltabelle IFC → KG (E-90) --------------------------------------------------------
    ctx.befehle.registrieren({
      name: 'regel.anlegen',
      titel: 'Regel anlegen',
      schema: regelFelder,
      ausfuehren(tx, d) {
        const n =
          tx.eins<{ n: number | null }>('SELECT MAX(reihenfolge) AS n FROM b_kg_regel')?.n ?? 0;
        tx.einfuegen('b_kg_regel', { id: neueId(), reihenfolge: n + 1, ...d });
      },
    });

    ctx.befehle.registrieren({
      name: 'regel.aendern',
      titel: 'Regel ändern',
      schema: regelFelder.partial().extend({ id: z.string() }),
      ausfuehren(tx, { id, ...felder }) {
        const f = Object.fromEntries(Object.entries(felder).filter(([, v]) => v !== undefined));
        tx.aendern('b_kg_regel', id, f as Record<string, string | number | null>);
      },
    });

    ctx.befehle.registrieren({
      name: 'regel.loeschen',
      titel: 'Regel löschen',
      schema: z.object({ id: z.string() }),
      ausfuehren: (tx, d) => tx.loeschen('b_kg_regel', d.id),
    });

    ctx.befehle.registrieren({
      name: 'regel.verschieben',
      titel: 'Regel verschieben',
      schema: z.object({ id: z.string(), richtung: z.union([z.literal(-1), z.literal(1)]) }),
      ausfuehren(tx, d) {
        const liste = regelnLesen(tx);
        const i = liste.findIndex((r) => r.id === d.id);
        const j = i + d.richtung;
        const a = liste[i];
        const b = liste[j];
        if (!a || !b) return;
        tx.aendern('b_kg_regel', a.id, { reihenfolge: b.reihenfolge });
        tx.aendern('b_kg_regel', b.id, { reihenfolge: a.reihenfolge });
      },
    });

    ctx.befehle.registrieren({
      name: 'regeln.standard',
      titel: 'Standardregeln wiederherstellen',
      schema: z.object({}),
      ausfuehren(tx) {
        for (const r of regelnLesen(tx)) tx.loeschen('b_kg_regel', r.id);
        STANDARD_REGELN.forEach((r, i) =>
          tx.einfuegen('b_kg_regel', { id: neueId(), reihenfolge: i + 1, enthaelt: '', ...r }),
        );
      },
    });

    // --- Manuelle Zuordnung je Bauteil (E-90) -------------------------------------------------
    ctx.befehle.registrieren({
      name: 'zuweisung.setzen',
      titel: 'KG des Bauteils festlegen',
      schema: z.object({
        modellId: z.string(),
        globalid: z.string().min(1),
        kg: kgSchema.nullable(),
        mengenart: mengenartSchema,
      }),
      ausfuehren(tx, d) {
        const da = tx.eins<ZuweisungZeile>(
          'SELECT * FROM b_kg_zuweisung WHERE modell_id = ? AND globalid = ?',
          d.modellId,
          d.globalid,
        );
        if (da) tx.aendern('b_kg_zuweisung', da.id, { kg: d.kg, mengenart: d.mengenart });
        else
          tx.einfuegen('b_kg_zuweisung', {
            id: neueId(),
            modell_id: d.modellId,
            globalid: d.globalid,
            kg: d.kg,
            mengenart: d.mengenart,
          });
      },
    });

    ctx.befehle.registrieren({
      name: 'zuweisung.entfernen',
      titel: 'KG des Bauteils wieder nach Regel',
      schema: z.object({ modellId: z.string(), globalid: z.string() }),
      ausfuehren(tx, d) {
        const da = tx.eins<{ id: string }>(
          'SELECT id FROM b_kg_zuweisung WHERE modell_id = ? AND globalid = ?',
          d.modellId,
          d.globalid,
        );
        if (da) tx.loeschen('b_kg_zuweisung', da.id);
      },
    });

    // Modellmengen je KG für die Kosten (E-93)
    ctx.dienste.bereitstellen('bim.mengen', bimMengenDienst);

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
        bauteile: db
          .lesen<Omit<BauteilZeile, 'mengen'> & { mengen: string | null }>(
            'SELECT * FROM b_bauteil WHERE modell_id = ? ORDER BY klasse, name, express_id',
            a.modellId,
          )
          .map((b) => ({ ...b, mengen: b.mengen ? JSON.parse(b.mengen) : null })),
      }),
    });

    ctx.abfragen.registrieren({
      name: 'regeln',
      schema: z.undefined(),
      ausfuehren: (db) => regelnLesen(db),
    });

    ctx.abfragen.registrieren({
      name: 'zuweisungen',
      schema: z.undefined(),
      ausfuehren: (db) => db.lesen<ZuweisungZeile>('SELECT * FROM b_kg_zuweisung'),
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
