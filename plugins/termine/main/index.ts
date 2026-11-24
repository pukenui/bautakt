import { neueId, type BautaktPlugin } from '@bautakt/kern';
import { z } from 'zod';
import { MIGRATIONEN } from '../migrations/index.js';

export interface PlanZeile {
  id: string;
  name: string;
  art: string;
  projektstart: string | null;
  soll_ende: string | null;
  rueckwaerts_von: 'berechnet' | 'soll_ende';
}

const name = z.string().trim().min(1, 'Name darf nicht leer sein').max(200);

/**
 * Plugin Terminplanung. M0: Gerüst mit Tabelle `t_plan` und Befehlen zum Anlegen,
 * Umbenennen und Löschen von Plänen (E-14: mehrere Pläne je Projekt).
 * Vorgänge, Beziehungen und Kalender folgen in M1/M2.
 */
export const terminePlugin: BautaktPlugin = {
  id: 'termine',
  name: 'Terminplanung',
  version: '0.0.1',
  tabellenPraefix: 't_',
  migrationen: MIGRATIONEN,

  aktivieren(ctx) {
    ctx.befehle.registrieren({
      name: 'plan.anlegen',
      titel: 'Plan anlegen',
      schema: z.object({ name, art: z.string().trim().min(1).default('bauablauf') }),
      ausfuehren(tx, d) {
        tx.einfuegen('t_plan', { id: neueId(), name: d.name, art: d.art });
      },
    });

    ctx.befehle.registrieren({
      name: 'plan.umbenennen',
      titel: 'Plan umbenennen',
      schema: z.object({ id: z.string().min(1), name }),
      ausfuehren(tx, d) {
        tx.aendern('t_plan', d.id, { name: d.name });
      },
    });

    ctx.befehle.registrieren({
      name: 'plan.loeschen',
      titel: 'Plan löschen',
      schema: z.object({ id: z.string().min(1) }),
      ausfuehren(tx, d) {
        tx.loeschen('t_plan', d.id);
      },
    });

    const plaene = () =>
      ctx.db.lesen<PlanZeile>(
        'SELECT id, name, art, projektstart, soll_ende, rueckwaerts_von FROM t_plan ORDER BY id',
      );

    ctx.abfragen.registrieren({ name: 'plaene', schema: z.undefined(), ausfuehren: plaene });
    ctx.dienste.bereitstellen('termine.plaene', plaene);
  },
};
