import type { BautaktPlugin } from '@bautakt/kern';
import { z } from 'zod';
import type { PlanZeile } from '../gemeinsam/typen.js';
import { MIGRATIONEN } from '../migrations/index.js';
import { BEFEHLE } from './befehle.js';
import { planDatenLaden } from './daten.js';

export type { PlanZeile } from '../gemeinsam/typen.js';

/**
 * Plugin Terminplanung (E-11 bis E-21): Pläne, Vorgänge, Anordnungsbeziehungen, Kalender.
 * Berechnete Termine werden bei jeder Abfrage neu gerechnet (Architektur 4.1).
 */
export const terminePlugin: BautaktPlugin = {
  id: 'termine',
  name: 'Terminplanung',
  version: '0.2.0',
  tabellenPraefix: 't_',
  migrationen: MIGRATIONEN,

  aktivieren(ctx) {
    for (const b of BEFEHLE) ctx.befehle.registrieren(b);

    const plaene = () => ctx.db.lesen<PlanZeile>('SELECT * FROM t_plan ORDER BY id');

    ctx.abfragen.registrieren({ name: 'plaene', schema: z.undefined(), ausfuehren: plaene });
    ctx.abfragen.registrieren({
      name: 'plan',
      schema: z.object({ planId: z.string().min(1) }),
      ausfuehren: (db, a) => planDatenLaden(db, a.planId),
    });
    ctx.dienste.bereitstellen('termine.plaene', plaene);
    ctx.dienste.bereitstellen('termine.plan', (planId: string) => planDatenLaden(ctx.db, planId));
  },
};
