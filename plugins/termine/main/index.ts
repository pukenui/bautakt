import type { BautaktPlugin } from '@bautakt/kern';
import { z } from 'zod';
import type { AufwandZeile, IstZeile, PlanZeile } from '../gemeinsam/typen.js';
import { MIGRATIONEN } from '../migrations/index.js';
import { aufwandBefehle, type BibliothekZugriff } from './aufwand.js';
import { BEFEHLE } from './befehle.js';
import { ORTE_BEFEHLE } from './orte.js';
import { vorgangslisteExcel } from './excel.js';
import { planDatenLaden } from './daten.js';
import { termineStaende } from './staende.js';

export type { PlanZeile } from '../gemeinsam/typen.js';

/**
 * Plugin Terminplanung (E-11 bis E-21): Pläne, Vorgänge, Anordnungsbeziehungen, Kalender.
 * Berechnete Termine werden bei jeder Abfrage neu gerechnet (Architektur 4.1).
 */
export const terminePlugin: BautaktPlugin = {
  id: 'termine',
  name: 'Terminplanung',
  version: '0.6.0',
  tabellenPraefix: 't_',
  migrationen: MIGRATIONEN,

  aktivieren(ctx) {
    for (const b of BEFEHLE) ctx.befehle.registrieren(b);
    for (const b of ORTE_BEFEHLE) ctx.befehle.registrieren(b);

    // Bibliothek (global, E-23) ist optional: ohne sie nur eigene Aufwandswerte
    const bibliothek = (): BibliothekZugriff | null => {
      try {
        return {
          aufwandswert: ctx.dienste.holen('bibliothek.aufwandswert'),
          aktuelleVersion: ctx.dienste.holen('bibliothek.aktuelleVersion'),
        };
      } catch {
        return null;
      }
    };
    const aktuelleVersion = (bibId: string) => bibliothek()?.aktuelleVersion(bibId) ?? null;
    for (const b of aufwandBefehle(bibliothek)) ctx.befehle.registrieren(b);
    ctx.stand.registrieren(termineStaende);

    const plaene = () => ctx.db.lesen<PlanZeile>('SELECT * FROM t_plan ORDER BY id');

    ctx.abfragen.registrieren({ name: 'plaene', schema: z.undefined(), ausfuehren: plaene });
    ctx.abfragen.registrieren({
      name: 'plan',
      schema: z.object({
        planId: z.string().min(1),
        sollStandId: z.string().min(1).nullable().optional(),
      }),
      ausfuehren: (db, a) => planDatenLaden(db, a.planId, a.sollStandId ?? null, aktuelleVersion),
    });
    ctx.abfragen.registrieren({
      name: 'istVerlauf',
      schema: z.object({ vorgangId: z.string().min(1) }),
      ausfuehren: (db, a) =>
        db.lesen<IstZeile>(
          'SELECT * FROM t_ist WHERE vorgang_id = ? ORDER BY stichtag DESC',
          a.vorgangId,
        ),
    });
    ctx.abfragen.registrieren({
      name: 'aufwand',
      schema: z.object({ vorgangId: z.string().min(1) }),
      ausfuehren: (db, a) => {
        const aufwand =
          db.eins<AufwandZeile>('SELECT * FROM t_aufwand WHERE vorgang_id = ?', a.vorgangId) ??
          null;
        return {
          aufwand,
          aktuelleVersion: aufwand?.bib_id ? aktuelleVersion(aufwand.bib_id) : null,
        };
      },
    });
    ctx.exporte.registrieren(
      'vorgangsliste',
      (db, p) => vorgangslisteExcel(db, p, aktuelleVersion),
      {
        endung: 'xlsx',
        beschreibung: 'Excel-Arbeitsmappe',
      },
    );
    ctx.dienste.bereitstellen('termine.plaene', plaene);
    ctx.dienste.bereitstellen('termine.plan', (planId: string) => planDatenLaden(ctx.db, planId));
  },
};
