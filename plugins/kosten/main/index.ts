import type { BautaktPlugin } from '@bautakt/kern';
import type { KennwertZeile } from '@bautakt/plugin-bibliothek/typen';
import { z } from 'zod';
import { MIGRATIONEN } from '../migrations/index.js';
import { kostenBefehle } from './befehle.js';
import { kostenDatenLaden } from './daten.js';
import { kostenStaende } from './staende.js';

export type { KostenDaten } from '../gemeinsam/typen.js';

/**
 * Plugin Kostenplanung (E-15, E-16, E-55–E-59): KG-Baum nach DIN 276, Flächen nach DIN 277,
 * Kennwerte mit Index, Regionalfaktor und MwSt. Kosten werden bei jeder Abfrage gerechnet.
 */
export const kostenPlugin: BautaktPlugin = {
  id: 'kosten',
  name: 'Kostenplanung',
  version: '0.1.0',
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
    ctx.stand.registrieren(kostenStaende);
    ctx.abfragen.registrieren({
      name: 'kosten',
      schema: z.undefined(),
      ausfuehren: (db) => kostenDatenLaden(db, kennwertVersion),
    });
    ctx.dienste.bereitstellen('kosten.daten', () => kostenDatenLaden(ctx.db, kennwertVersion));
  },
};
