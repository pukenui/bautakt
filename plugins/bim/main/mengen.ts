import type { PluginDb } from '@bautakt/kern';
import type { RegelZeile, ZuweisungZeile } from '../gemeinsam/typen.js';
import {
  kgMenge,
  kgMengeHinweise,
  zuordnen,
  type BauteilMitZuordnung,
  type KgMenge,
  type Mengen,
  type Ueberschreibung,
} from '../gemeinsam/zuordnung.js';

/** Dienst `bim.mengen` für das Kosten-Plugin (E-93): Modellmengen je KG, live aus Modell und Regeln. */
export interface BimMengenDienst {
  /**
   * Liefert eine Funktion „Menge je KG“ oder null, wenn das Projekt kein Modell enthält.
   * `db` ist der lesende Zugriff des Aufrufers (auch innerhalb eines Befehls).
   */
  jeKg(
    db: PluginDb,
  ): ((kg: number, zeilenEinheit: string) => KgMenge & { hinweise: string[] }) | null;
}

export const regelnLesen = (db: PluginDb) =>
  db.lesen<RegelZeile>('SELECT * FROM b_kg_regel ORDER BY reihenfolge');

export const zuweisungSchluessel = (modellId: string, globalid: string) =>
  `${modellId}:${globalid}`;

/** Alle Bauteile mit Zuordnung (Regeln und Überschreibungen) und Mengen. */
export function zuordnungenLaden(db: PluginDb): BauteilMitZuordnung[] {
  const regeln = regelnLesen(db);
  const ueber = new Map<string, Ueberschreibung>(
    db
      .lesen<ZuweisungZeile>('SELECT * FROM b_kg_zuweisung')
      .map((z) => [
        zuweisungSchluessel(z.modell_id, z.globalid),
        { kg: z.kg, mengenart: z.mengenart },
      ]),
  );
  return db
    .lesen<{
      modell_id: string;
      globalid: string;
      klasse: string;
      name: string;
      typ: string;
      predefined: string;
      aussen: number | null;
      tragend: number | null;
      mengen: string | null;
    }>(
      'SELECT modell_id, globalid, klasse, name, typ, predefined, aussen, tragend, mengen FROM b_bauteil',
    )
    .map((b) => ({
      zuordnung: zuordnen(b, regeln, ueber.get(zuweisungSchluessel(b.modell_id, b.globalid))),
      mengen: b.mengen ? (JSON.parse(b.mengen) as Mengen) : {},
    }));
}

export const bimMengenDienst: BimMengenDienst = {
  jeKg(db) {
    if (!db.eins('SELECT id FROM b_modell LIMIT 1')) return null;
    const alle = zuordnungenLaden(db);
    const ohneMengen = db.eins<{ n: number }>(
      'SELECT COUNT(*) AS n FROM b_bauteil WHERE mengen IS NULL',
    )?.n;
    return (kg, zeilenEinheit) => {
      const m = kgMenge(kg, alle);
      const hinweise = kgMengeHinweise(m, zeilenEinheit);
      // Modelle aus der Zeit vor B2 haben keine Mengen (E-92)
      if (ohneMengen)
        hinweise.push(`${ohneMengen} Bauteil(e) ohne Mengen – Modell für Mengen neu einlesen.`);
      return { ...m, hinweise };
    };
  },
};
