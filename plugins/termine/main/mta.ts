import {
  BautaktFehler,
  jetztUtc,
  neueId,
  type BefehlDefinition,
  type PluginDb,
} from '@bautakt/kern';
import { z } from 'zod';
import type { MtaBericht, MtaDaten, MtaMeilenstein } from '../gemeinsam/mta.js';
import { heuteIso, planDatenLaden, planLesen } from './daten.js';

const fehler = (meldung: string) => new BautaktFehler('BEFEHL_DATEN', meldung);
const id = z.string().min(1);

type Def = BefehlDefinition<never>;
const def = <T>(d: BefehlDefinition<T>) => d as unknown as Def;

/** Befehle der Meilenstein-Trendanalyse (E-71). */
export const MTA_BEFEHLE: Def[] = [
  def({
    name: 'mta.festhalten',
    titel: 'MTA-Berichtsstand festhalten',
    schema: z.object({ planId: id, notiz: z.string().trim().max(2000).default('') }),
    ausfuehren(tx, d) {
      const plan = planLesen(tx, d.planId);
      const daten = planDatenLaden(tx, d.planId);
      if (!daten.berechnung.ok)
        throw fehler(`Der Plan ist nicht rechenbar: ${daten.berechnung.fehler}`);
      const meilensteine = daten.vorgaenge.filter((v) => v.typ === 'meilenstein');
      if (!meilensteine.length) throw fehler('Der Plan enthält keine Meilensteine.');
      const berichtsdatum = plan.stichtag ?? heuteIso();
      // gleicher Tag → Bericht ersetzen
      const alt = tx.eins<{ id: string }>(
        'SELECT id FROM t_mta_bericht WHERE plan_id = ? AND berichtsdatum = ?',
        d.planId,
        berichtsdatum,
      );
      if (alt) {
        for (const t of tx.lesen<{ id: string }>(
          'SELECT id FROM t_mta_termin WHERE bericht_id = ?',
          alt.id,
        ))
          tx.loeschen('t_mta_termin', t.id);
        tx.loeschen('t_mta_bericht', alt.id);
      }
      const bericht = neueId();
      tx.einfuegen('t_mta_bericht', {
        id: bericht,
        plan_id: d.planId,
        berichtsdatum,
        zeit: jetztUtc(),
        notiz: d.notiz,
      });
      const termine = daten.berechnung.termine;
      for (const m of meilensteine) {
        const t = termine[m.id];
        if (!t) continue;
        tx.einfuegen('t_mta_termin', {
          id: neueId(),
          bericht_id: bericht,
          vorgang_id: m.id,
          termin: t.ende,
          erreicht: t.status === 'fertig' ? 1 : 0,
        });
      }
    },
  }),
  def({
    name: 'mta.loeschen',
    titel: 'MTA-Bericht löschen',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      if (!tx.eins('SELECT 1 FROM t_mta_bericht WHERE id = ?', d.id))
        throw new BautaktFehler('NICHT_GEFUNDEN', 'Den Bericht gibt es nicht (mehr).');
      for (const t of tx.lesen<{ id: string }>(
        'SELECT id FROM t_mta_termin WHERE bericht_id = ?',
        d.id,
      ))
        tx.loeschen('t_mta_termin', t.id);
      tx.loeschen('t_mta_bericht', d.id);
    },
  }),
];

/** MTA-Daten eines Plans (E-71, E-72). */
export function mtaLaden(db: PluginDb, planId: string): MtaDaten {
  const daten = planDatenLaden(db, planId);
  const berichte = db.lesen<MtaBericht>(
    'SELECT * FROM t_mta_bericht WHERE plan_id = ? ORDER BY berichtsdatum',
    planId,
  );
  const werte = db.lesen<{
    bericht_id: string;
    vorgang_id: string;
    termin: string;
    erreicht: number;
  }>(
    `SELECT t.* FROM t_mta_termin t JOIN t_mta_bericht b ON b.id = t.bericht_id WHERE b.plan_id = ?`,
    planId,
  );
  const termine = daten.berechnung.ok ? daten.berechnung.termine : {};
  const meilensteine: MtaMeilenstein[] = daten.vorgaenge
    .filter((v) => v.typ === 'meilenstein')
    .map((v) => {
      const t = termine[v.id];
      const eigene = werte.filter((w) => w.vorgang_id === v.id);
      return {
        id: v.id,
        nr: v.nr,
        name: v.name,
        schnittstelle: !!v.schnittstelle,
        werte: Object.fromEntries(
          eigene.map((w) => [w.bericht_id, { termin: w.termin, erreicht: !!w.erreicht }]),
        ),
        aktuell: t ? { termin: t.ende, erreicht: t.status === 'fertig' } : null,
      };
    });
  return { berichte, meilensteine, aktuellesDatum: daten.plan.stichtag ?? heuteIso() };
}
