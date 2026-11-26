import type { PluginDb } from '@bautakt/kern';
import { URSACHEN, type AufwandZeile, type PlanZeile } from '../gemeinsam/typen.js';
import { planDatenLaden } from './daten.js';

/** Beobachtung „Dauer“ für die Erfahrungsdatenbank (E-74). */
export interface DauerBeobachtung {
  bezeichnung: string;
  gewerk: string;
  aufwandswert_id: string | null;
  aufwandswert_bez: string;
  ursache: string;
  soll: number;
  ist: number;
}

/**
 * Fertige Vorgänge aller Pläne: Soll = Dauer im jüngsten Soll-Stand (sonst Plandauer),
 * Ist = Ist-Dauer in AT laut Prognose-Rechnung (FEZ − FAZ fertiger Vorgänge).
 */
export function dauerBeobachtungen(db: PluginDb): DauerBeobachtung[] {
  const soll = db.eins<{ id: string }>(
    "SELECT id FROM stand WHERE art = 'soll' ORDER BY zeit DESC, id DESC LIMIT 1",
  );
  const sollDauer = new Map(
    soll
      ? db
          .lesen<{ orig_id: string; dauer_at: number }>(
            'SELECT orig_id, dauer_at FROM t_vorgang_stand WHERE stand_id = ?',
            soll.id,
          )
          .map((z) => [z.orig_id, z.dauer_at])
      : [],
  );
  const aufwand = new Map(
    db.lesen<AufwandZeile>('SELECT * FROM t_aufwand').map((a) => [a.vorgang_id, a]),
  );
  const ergebnis: DauerBeobachtung[] = [];
  for (const plan of db.lesen<PlanZeile>('SELECT * FROM t_plan')) {
    const d = planDatenLaden(db, plan.id);
    if (!d.berechnung.ok) continue;
    for (const v of d.vorgaenge) {
      const t = d.berechnung.termine[v.id];
      if (v.typ !== 'vorgang' || !t || t.status !== 'fertig') continue;
      const s = sollDauer.get(v.id) ?? v.dauer_at;
      const a = aufwand.get(v.id);
      const ursache = d.ist[v.id]?.ursache;
      ergebnis.push({
        bezeichnung: `${v.nr} ${v.name}`,
        gewerk: v.gewerk.trim(),
        aufwandswert_id: a?.bib_id ?? null,
        aufwandswert_bez: a?.bib_id ? a.bezeichnung : '',
        ursache: ursache ? URSACHEN[ursache] : '',
        soll: s,
        ist: t.fez - t.faz,
      });
    }
  }
  return ergebnis;
}
