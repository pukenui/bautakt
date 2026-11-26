import type { BautaktPlugin } from '@bautakt/kern';
import type { KennwertZeile } from '@bautakt/plugin-bibliothek/typen';
import { z } from 'zod';
import { MIGRATIONEN } from '../migrations/index.js';
import { kostenBefehle } from './befehle.js';
import { kostenDatenLaden } from './daten.js';
import { kostenExcel } from './excel.js';
import { sollIstLaden } from './sollist.js';
import { SOLLIST_BEFEHLE } from './sollistBefehle.js';
import { kostenStaende } from './staende.js';

export type { KostenDaten } from '../gemeinsam/typen.js';

/**
 * Plugin Kostenplanung (E-15, E-16, E-55–E-59): KG-Baum nach DIN 276, Flächen nach DIN 277,
 * Kennwerte mit Index, Regionalfaktor und MwSt. Kosten werden bei jeder Abfrage gerechnet.
 */
export const kostenPlugin: BautaktPlugin = {
  id: 'kosten',
  name: 'Kostenplanung',
  version: '0.2.0',
  tabellenPraefix: 'k_',
  migrationen: MIGRATIONEN,

  aktivieren(ctx) {
    // Bibliothek (global) ist optional
    const holen = <T>(name: string): T | null => {
      try {
        return ctx.dienste.holen<T>(name);
      } catch {
        return null;
      }
    };
    const kennwert = () =>
      holen<(id: string, version?: number) => KennwertZeile | undefined>('bibliothek.kennwert');
    const kennwertVersion = (kid: string) =>
      holen<(id: string) => number | null>('bibliothek.kennwertAktuelleVersion')?.(kid) ?? null;

    for (const b of kostenBefehle(kennwert)) ctx.befehle.registrieren(b);
    for (const b of SOLLIST_BEFEHLE) ctx.befehle.registrieren(b);
    ctx.abfragen.registrieren({
      name: 'sollist',
      schema: z
        .object({
          bezug: z.enum(['rahmen', 'schaetzung', 'berechnung', 'anschlag', 'feststellung']),
        })
        .optional(),
      ausfuehren: (db, a) => sollIstLaden(db, a?.bezug ?? 'berechnung'),
    });
    // Anhänge (E-62): nur diese Dateien darf die Oberfläche öffnen
    ctx.anhaenge.registrieren((db) =>
      db
        .lesen<{ anhang: string }>(
          'SELECT anhang FROM k_auftrag WHERE anhang IS NOT NULL UNION SELECT anhang FROM k_rechnung WHERE anhang IS NOT NULL',
        )
        .map((a) => a.anhang),
    );
    ctx.stand.registrieren(kostenStaende);
    ctx.exporte.registrieren('excel', (db, p) => kostenExcel(db, p, kennwertVersion), {
      endung: 'xlsx',
      beschreibung: 'Excel-Arbeitsmappe',
    });
    ctx.abfragen.registrieren({
      name: 'kosten',
      schema: z.undefined(),
      ausfuehren: (db) => kostenDatenLaden(db, kennwertVersion),
    });
    ctx.dienste.bereitstellen('kosten.daten', () => kostenDatenLaden(ctx.db, kennwertVersion));
  },
};
