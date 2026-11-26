import { jetztUtc, neueId, type GlobalTeil, type Migration, type PluginDb } from '@bautakt/kern';
import {
  gruppieren,
  vorschlagNoetig,
  vorschlagText,
  type Beobachtung,
} from '@bautakt/rechnen-statistik';
import { z } from 'zod';
import type { Auswertung, ErfahrungsProjekt, Vorschlag } from '../gemeinsam/typen.js';

/** Schema der globalen Datei `erfahrung.sqlite` (Architektur 4.3). */
export const GLOBAL_MIGRATIONEN: readonly Migration[] = [
  {
    version: 1,
    name: 'Erfahrungsdatenbank: Projekte und Beobachtungen (E-34)',
    sql: `
      CREATE TABLE projekt (
        projekt_id TEXT PRIMARY KEY,
        projektname TEXT NOT NULL,
        zaehlt INTEGER NOT NULL DEFAULT 1,
        gebaeudeart TEXT NOT NULL DEFAULT '',
        bauweise TEXT NOT NULL DEFAULT '',
        bgf REAL,
        abgeschlossen INTEGER NOT NULL DEFAULT 0,
        uebertragen TEXT NOT NULL
      );
      CREATE TABLE beobachtung (
        id TEXT PRIMARY KEY,
        projekt_id TEXT NOT NULL,
        art TEXT NOT NULL CHECK (art IN ('dauer', 'kosten', 'kkw')),
        bezeichnung TEXT NOT NULL DEFAULT '',
        soll REAL NOT NULL,
        ist REAL,
        ist_prognose REAL,
        aufwandswert_id TEXT,
        aufwandswert_bez TEXT NOT NULL DEFAULT '',
        kennwert_id TEXT,
        kennwert_bez TEXT NOT NULL DEFAULT '',
        gewerk TEXT NOT NULL DEFAULT '',
        kg INTEGER,
        kg_bez TEXT NOT NULL DEFAULT '',
        ursache TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX beobachtung_p ON beobachtung (projekt_id);
      CREATE INDEX beobachtung_a ON beobachtung (art);
    `,
  },
];

interface BeobachtungZeile extends Beobachtung {
  id: string;
  art: string;
  bezeichnung: string;
  aufwandswert_id: string | null;
  aufwandswert_bez: string;
  kennwert_id: string | null;
  kennwert_bez: string;
  gewerk: string;
  kg: number | null;
  kg_bez: string;
  ursache: string;
}

const text = (max = 300) => z.string().trim().max(max);
const zahl = z.number().refine(Number.isFinite, 'Ungültige Zahl');

const uebertragung = z.object({
  projekt: z.object({
    projekt_id: z.string().min(1),
    projektname: text(300),
    zaehlt: z.boolean(),
    gebaeudeart: text(),
    bauweise: text(),
    bgf: zahl.nullable(),
    abgeschlossen: z.boolean(),
  }),
  dauer: z
    .array(
      z.object({
        bezeichnung: text(),
        gewerk: text(),
        aufwandswert_id: z.string().nullable(),
        aufwandswert_bez: text(),
        ursache: text(),
        soll: zahl,
        ist: zahl,
      }),
    )
    .max(100_000),
  kosten: z
    .array(
      z.object({
        kg: z.number().int(),
        bezeichnung: text(),
        ursache: text(),
        soll: zahl,
        ist: zahl.nullable(),
        ist_prognose: zahl.nullable(),
      }),
    )
    .max(100_000),
  kkw: z
    .array(
      z.object({
        kennwert_id: z.string().min(1),
        bezeichnung: text(),
        kg: z.number().int(),
        soll: zahl,
        ist: zahl.nullable(),
        ist_prognose: zahl.nullable(),
      }),
    )
    .max(100_000),
});

const filter = z
  .object({
    gebaeudeart: z.string().nullable().optional(),
    bauweise: z.string().nullable().optional(),
    bgfVon: z.number().nullable().optional(),
    bgfBis: z.number().nullable().optional(),
  })
  .optional();

/** Beobachtungen der zählenden Projekte, gefiltert nach Merkmalen (E-76, E-77). */
function beobachtungen(
  db: PluginDb,
  art: string,
  f: z.infer<typeof filter>,
): { liste: BeobachtungZeile[]; projekte: number } {
  const projekte = db
    .lesen<ErfahrungsProjekt>('SELECT * FROM projekt WHERE zaehlt = 1')
    .filter(
      (p) =>
        (!f?.gebaeudeart || p.gebaeudeart === f.gebaeudeart) &&
        (!f?.bauweise || p.bauweise === f.bauweise) &&
        (f?.bgfVon == null || (p.bgf ?? -1) >= f.bgfVon) &&
        (f?.bgfBis == null || (p.bgf !== null && p.bgf <= f.bgfBis)),
    );
  const ids = new Set(projekte.map((p) => p.projekt_id));
  const liste = db
    .lesen<BeobachtungZeile>('SELECT * FROM beobachtung WHERE art = ?', art)
    .filter((b) => ids.has(b.projekt_id));
  return { liste, projekte: ids.size };
}

/** Globaler Teil der Statistik: Erfahrungsdatenbank im App-Datenordner (E-34). */
export const statistikGlobal: GlobalTeil = {
  datei: 'erfahrung.sqlite',
  migrationen: GLOBAL_MIGRATIONEN,
  aktivieren(ctx) {
    ctx.abfragen.registrieren({
      name: 'projekte',
      schema: z.undefined(),
      ausfuehren: (db) =>
        db.lesen<ErfahrungsProjekt>(
          `SELECT p.*, (SELECT count(*) FROM beobachtung b WHERE b.projekt_id = p.projekt_id) AS beobachtungen
           FROM projekt p ORDER BY p.uebertragen DESC`,
        ),
    });
    ctx.abfragen.registrieren({
      name: 'merkmale',
      schema: z.undefined(),
      ausfuehren: (db) => ({
        gebaeudearten: db
          .lesen<{ w: string }>(
            "SELECT DISTINCT gebaeudeart AS w FROM projekt WHERE gebaeudeart <> '' ORDER BY w",
          )
          .map((x) => x.w),
        bauweisen: db
          .lesen<{ w: string }>(
            "SELECT DISTINCT bauweise AS w FROM projekt WHERE bauweise <> '' ORDER BY w",
          )
          .map((x) => x.w),
      }),
    });
    ctx.abfragen.registrieren({
      name: 'auswertung',
      schema: z.object({
        art: z.enum(['dauer', 'kosten', 'kkw']),
        schluessel: z.enum(['aufwandswert', 'gewerk', 'ursache', 'kg', 'kennwert']),
        basis: z.enum(['ist', 'prognose']).default('ist'),
        filter,
      }),
      ausfuehren: (db, a): Auswertung => {
        const { liste, projekte } = beobachtungen(db, a.art, a.filter);
        const basis = a.art === 'dauer' ? 'ist' : a.basis;
        const sch = (b: BeobachtungZeile): string | null => {
          switch (a.schluessel) {
            case 'aufwandswert':
              return b.aufwandswert_id;
            case 'kennwert':
              return b.kennwert_id;
            case 'gewerk':
              return b.gewerk || null;
            case 'ursache':
              return b.ursache || null;
            case 'kg':
              return b.kg === null ? null : String(b.kg);
          }
        };
        const bez = (b: BeobachtungZeile): string => {
          switch (a.schluessel) {
            case 'aufwandswert':
              return b.aufwandswert_bez || '(Aufwandswert)';
            case 'kennwert':
              return b.kennwert_bez || '(Kennwert)';
            case 'gewerk':
              return b.gewerk;
            case 'ursache':
              return b.ursache;
            case 'kg':
              return b.kg_bez || String(b.kg);
          }
        };
        const gruppen = gruppieren(liste, sch, bez, basis);
        if (a.schluessel === 'kg')
          gruppen.sort((x, y) => Number(x.schluessel) - Number(y.schluessel));
        const vorschlaege: Vorschlag[] =
          a.schluessel === 'aufwandswert' || a.schluessel === 'kennwert'
            ? gruppen
                .filter((g) => vorschlagNoetig(g))
                .map((g) => ({
                  id: g.schluessel,
                  art: a.schluessel as 'aufwandswert' | 'kennwert',
                  text: vorschlagText(
                    a.schluessel === 'aufwandswert' ? 'Aufwandswert' : 'Kennwert',
                    g.bezeichnung,
                    g,
                  ),
                  faktor: g.faktor?.mittel ?? 1,
                }))
            : [];
        return { art: a.art, schluessel: a.schluessel, basis, gruppen, vorschlaege, projekte };
      },
    });

    ctx.aktionen.registrieren({
      name: 'uebertragen',
      titel: 'Projekt in die Erfahrungsdatenbank übertragen',
      schema: uebertragung,
      ausfuehren(db, d) {
        const p = d.projekt;
        // erneutes Übertragen ersetzt die Beobachtungen dieses Projekts (E-76)
        db.loeschen('beobachtung', { projekt_id: p.projekt_id });
        const zeile = {
          projektname: p.projektname,
          zaehlt: p.zaehlt ? 1 : 0,
          gebaeudeart: p.gebaeudeart,
          bauweise: p.bauweise,
          bgf: p.bgf,
          abgeschlossen: p.abgeschlossen ? 1 : 0,
          uebertragen: jetztUtc(),
        };
        if (db.eins('SELECT 1 FROM projekt WHERE projekt_id = ?', p.projekt_id))
          db.aendern('projekt', { projekt_id: p.projekt_id }, zeile);
        else db.einfuegen('projekt', { projekt_id: p.projekt_id, ...zeile });
        for (const b of d.dauer)
          db.einfuegen('beobachtung', {
            id: neueId(),
            projekt_id: p.projekt_id,
            art: 'dauer',
            bezeichnung: b.bezeichnung,
            soll: b.soll,
            ist: b.ist,
            aufwandswert_id: b.aufwandswert_id,
            aufwandswert_bez: b.aufwandswert_bez,
            gewerk: b.gewerk,
            ursache: b.ursache,
          });
        for (const b of d.kosten)
          db.einfuegen('beobachtung', {
            id: neueId(),
            projekt_id: p.projekt_id,
            art: 'kosten',
            bezeichnung: b.bezeichnung,
            soll: b.soll,
            ist: b.ist,
            ist_prognose: b.ist_prognose,
            kg: b.kg,
            kg_bez: b.bezeichnung,
            ursache: b.ursache,
          });
        for (const b of d.kkw)
          db.einfuegen('beobachtung', {
            id: neueId(),
            projekt_id: p.projekt_id,
            art: 'kkw',
            bezeichnung: b.bezeichnung,
            soll: b.soll,
            ist: b.ist,
            ist_prognose: b.ist_prognose,
            kennwert_id: b.kennwert_id,
            kennwert_bez: b.bezeichnung,
            kg: b.kg,
          });
        return { beobachtungen: d.dauer.length + d.kosten.length + d.kkw.length };
      },
    });
    ctx.aktionen.registrieren({
      name: 'projekt.zaehlt',
      titel: '„Zählt in Statistik“ ändern',
      schema: z.object({ projekt_id: z.string().min(1), zaehlt: z.boolean() }),
      ausfuehren(db, d) {
        db.aendern('projekt', { projekt_id: d.projekt_id }, { zaehlt: d.zaehlt ? 1 : 0 });
      },
    });
    ctx.aktionen.registrieren({
      name: 'projekt.entfernen',
      titel: 'Projekt aus der Erfahrungsdatenbank entfernen',
      schema: z.object({ projekt_id: z.string().min(1) }),
      ausfuehren(db, d) {
        db.loeschen('beobachtung', { projekt_id: d.projekt_id });
        db.loeschen('projekt', { projekt_id: d.projekt_id });
      },
    });
  },
};
