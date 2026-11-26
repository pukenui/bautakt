import { jetztUtc, neueId, type BautaktPlugin, type Migration, type PluginDb } from '@bautakt/kern';
import { z } from 'zod';
import type {
  DauerDaten,
  Erhebung,
  KkwDaten,
  KostenDaten,
  ProjektMerkmale,
} from '../gemeinsam/typen.js';
import { statistikGlobal } from '../global/index.js';

/** Projektdatei: Merkmale für die Statistik (E-76). */
const MIGRATIONEN: readonly Migration[] = [
  {
    version: 1,
    name: 'Projektmerkmale für die Statistik (E-34, E-76)',
    sql: `
      CREATE TABLE s_projekt (
        id TEXT PRIMARY KEY,
        zaehlt INTEGER NOT NULL DEFAULT 1,
        gebaeudeart TEXT NOT NULL DEFAULT '',
        bauweise TEXT NOT NULL DEFAULT '',
        abgeschlossen INTEGER NOT NULL DEFAULT 0,
        uebertragen TEXT
      );
    `,
    daten: (db) => db.ausfuehren('INSERT INTO s_projekt (id) VALUES (?)', neueId()),
  },
];

function merkmale(db: PluginDb): ProjektMerkmale {
  const m = db.eins<ProjektMerkmale>('SELECT * FROM s_projekt LIMIT 1');
  if (!m) throw new Error('Die Statistik-Merkmale fehlen in der Projektdatei.');
  return m;
}

/**
 * Plugin Statistik (E-34, E-74–E-78): Erfahrungsdatenbank im App-Datenordner. Im Projekt nur
 * Merkmale; die Beobachtungen liefern Termine und Kosten über Dienste.
 */
export const statistikPlugin: BautaktPlugin = {
  id: 'statistik',
  name: 'Statistik',
  version: '0.1.0',
  tabellenPraefix: 's_',
  migrationen: MIGRATIONEN,
  global: statistikGlobal,

  aktivieren(ctx) {
    const holen = <T>(name: string): T | null => {
      try {
        return ctx.dienste.holen<T>(name);
      } catch {
        return null;
      }
    };

    ctx.befehle.registrieren({
      name: 'merkmale.aendern',
      titel: 'Statistik-Merkmale ändern',
      schema: z.object({
        felder: z
          .object({
            zaehlt: z.boolean().transform((b) => (b ? 1 : 0)),
            gebaeudeart: z.string().trim().max(300),
            bauweise: z.string().trim().max(300),
          })
          .partial()
          .strict(),
      }),
      ausfuehren(tx, d) {
        tx.aendern('s_projekt', merkmale(tx).id, d.felder);
      },
    });
    ctx.befehle.registrieren({
      name: 'uebertragung.vermerken',
      titel: 'Übertragung in die Statistik vermerken',
      schema: z.object({ abgeschlossen: z.boolean().optional() }),
      ausfuehren(tx, d) {
        tx.aendern('s_projekt', merkmale(tx).id, {
          uebertragen: jetztUtc(),
          ...(d.abgeschlossen ? { abgeschlossen: 1 } : {}),
        });
      },
    });

    ctx.abfragen.registrieren({
      name: 'merkmale',
      schema: z.undefined(),
      ausfuehren: (db) => merkmale(db),
    });
    // Was „Übertragen“ schreiben würde (E-74–E-76); die Oberfläche reicht es an die globale Aktion weiter
    ctx.abfragen.registrieren({
      name: 'erhebung',
      schema: z.object({ abschliessen: z.boolean().optional() }).optional(),
      ausfuehren: (db, a): Erhebung => {
        const m = merkmale(db);
        const meta = (k: string) =>
          db.eins<{ wert: string }>('SELECT wert FROM meta WHERE schluessel = ?', k)?.wert ?? '';
        const dauer = holen<() => DauerDaten[]>('termine.erfahrung')?.() ?? [];
        const kosten =
          holen<() => { kosten: KostenDaten[]; kkw: KkwDaten[]; bgf: number | null }>(
            'kosten.erfahrung',
          )?.() ?? null;
        return {
          projekt: {
            projekt_id: meta('projektId'),
            projektname: meta('projektname'),
            zaehlt: m.zaehlt === 1,
            gebaeudeart: m.gebaeudeart,
            bauweise: m.bauweise,
            bgf: kosten?.bgf ?? null,
            abgeschlossen: m.abgeschlossen === 1 || !!a?.abschliessen,
          },
          dauer,
          kosten: kosten?.kosten ?? [],
          kkw: kosten?.kkw ?? [],
        };
      },
    });
  },
};
