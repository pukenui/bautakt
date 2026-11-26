import type { PluginDb } from '@bautakt/kern';
import { KOSTEN_URSACHEN, kgUnter, rundeCent, type KostenUrsache } from '@bautakt/rechnen-kosten';
import { kostenDatenLaden } from './daten.js';
import { sollIstLaden } from './sollist.js';

/** Beobachtung „Kosten je KG“ (E-75). */
export interface KostenBeobachtung {
  kg: number;
  bezeichnung: string;
  ursache: string;
  soll: number;
  /** Kostenfeststellung (Σ Rechnungen); null ohne Rechnungen */
  ist: number | null;
  ist_prognose: number | null;
}

/** Beobachtung „KKW je Bibliothekskennwert“ (E-75). */
export interface KkwBeobachtung {
  kennwert_id: string;
  bezeichnung: string;
  kg: number;
  soll: number;
  ist: number | null;
  ist_prognose: number | null;
}

export interface KostenErfahrung {
  kosten: KostenBeobachtung[];
  kkw: KkwBeobachtung[];
  bgf: number | null;
}

/** Soll = Berechnung (sonst Schätzung, sonst Rahmen); Ist = Feststellung bzw. Prognose. */
export function kostenBeobachtungen(db: PluginDb): KostenErfahrung {
  const s = sollIstLaden(db, 'berechnung');
  const k = kostenDatenLaden(db);
  const kosten: KostenBeobachtung[] = [];
  for (const z of s.zeilen) {
    const soll = z.stufen.berechnung ?? z.stufen.schaetzung ?? z.stufen.rahmen;
    if (soll === null || !(soll > 0)) continue;
    const ist = z.stufen.feststellung;
    const prognose = Math.max(z.stufen.anschlag ?? 0, z.stufen.feststellung ?? 0) || null;
    if (ist === null && prognose === null) continue;
    kosten.push({
      kg: z.kg,
      bezeichnung: `${z.kg} ${z.bezeichnung}`,
      ursache: z.ursache ? (KOSTEN_URSACHEN[z.ursache as KostenUrsache] ?? '') : '',
      soll,
      ist,
      ist_prognose: prognose,
    });
  }
  // KKW: Ist-Kosten der KG (einschließlich Untergruppen) ÷ Menge
  const istJeKg = new Map(s.zeilen.map((z) => [z.kg, z]));
  const kkw: KkwBeobachtung[] = [];
  for (const z of k.zeilen) {
    if (!z.kkw_ref || z.kkwWirksam === null || !z.mengeWirksam || z.mengeWirksam <= 0) continue;
    // Untergruppen mit eigener Zeile würden die KG überdecken – dann ist der Kennwert nicht maßgebend
    if (k.zeilen.some((u) => kgUnter(u.kg, z.kg))) continue;
    const knoten = istJeKg.get(z.kg);
    const fest = knoten?.stufen.feststellung ?? null;
    const prog = Math.max(knoten?.stufen.anschlag ?? 0, knoten?.stufen.feststellung ?? 0) || null;
    if (fest === null && prog === null) continue;
    kkw.push({
      kennwert_id: z.kkw_ref,
      bezeichnung: z.kkw_bezeichnung || `${z.kg} ${z.katalogBezeichnung}`,
      kg: z.kg,
      soll: z.kkwWirksam,
      ist: fest === null ? null : rundeCent(fest / z.mengeWirksam),
      ist_prognose: prog === null ? null : rundeCent(prog / z.mengeWirksam),
    });
  }
  return { kosten, kkw, bgf: k.flaechen.BGF };
}
