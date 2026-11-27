import type { PluginDb } from '@bautakt/kern';
import type { RegelZeile, ZuweisungZeile } from '../gemeinsam/typen.js';
import {
  flaechenSummen,
  raumZuordnen,
  type RaumKategorie,
  type RaumRegel,
} from '../gemeinsam/raeume.js';
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

/** Bauteildaten, die Zuordnung und Mengen brauchen (Zeile der Datenbank oder neu eingelesen). */
export interface BauteilDaten {
  modell_id: string;
  globalid: string;
  klasse: string;
  name: string;
  typ: string;
  predefined: string;
  aussen: number | null;
  tragend: number | null;
  mengen: Mengen | null;
  langname: string;
  texte: string;
}

/** Alle Bauteile aller Modelle; mit `ersatz` stattdessen die neuen Bauteile eines Modells (Vorschau, E-96). */
export function bauteileLaden(
  db: PluginDb,
  ersatz?: { modellId: string; bauteile: BauteilDaten[] },
): BauteilDaten[] {
  const alle = db
    .lesen<Omit<BauteilDaten, 'mengen'> & { mengen: string | null }>(
      'SELECT modell_id, globalid, klasse, name, typ, predefined, aussen, tragend, mengen, langname, texte FROM b_bauteil',
    )
    .map((b) => ({ ...b, mengen: b.mengen ? (JSON.parse(b.mengen) as Mengen) : null }));
  return ersatz
    ? [...alle.filter((b) => b.modell_id !== ersatz.modellId), ...ersatz.bauteile]
    : alle;
}

/** Alle Bauteile mit Zuordnung (Regeln und Überschreibungen) und Mengen. */
export function zuordnungenLaden(
  db: PluginDb,
  ersatz?: { modellId: string; bauteile: BauteilDaten[] },
): BauteilMitZuordnung[] {
  const regeln = regelnLesen(db);
  const ueber = new Map<string, Ueberschreibung>(
    db
      .lesen<ZuweisungZeile>('SELECT * FROM b_kg_zuweisung')
      .map((z) => [
        zuweisungSchluessel(z.modell_id, z.globalid),
        { kg: z.kg, mengenart: z.mengenart },
      ]),
  );
  return bauteileLaden(db, ersatz).map((b) => ({
    zuordnung: zuordnen(b, regeln, ueber.get(zuweisungSchluessel(b.modell_id, b.globalid))),
    mengen: b.mengen ?? {},
  }));
}

export const raumRegelnLesen = (db: PluginDb) =>
  db.lesen<RaumRegel & { id: string; reihenfolge: number }>(
    'SELECT * FROM b_raum_regel ORDER BY reihenfolge',
  );

/** Flächen je DIN-277-Kategorie aus den Räumen aller Modelle (E-94, E-95). */
export function raumFlaechen(
  db: PluginDb,
  ersatz?: { modellId: string; bauteile: BauteilDaten[] },
) {
  const regeln = raumRegelnLesen(db);
  const vonHand = new Map(
    db
      .lesen<{ modell_id: string; globalid: string; kategorie: RaumKategorie | null }>(
        'SELECT modell_id, globalid, kategorie FROM b_raum_zuweisung',
      )
      .map((z) => [zuweisungSchluessel(z.modell_id, z.globalid), { kategorie: z.kategorie }]),
  );
  const raeume = bauteileLaden(db, ersatz).filter((b) => b.klasse === 'IfcSpace');
  return flaechenSummen(
    raeume.map((b) => ({
      kategorie: raumZuordnen(b, regeln, vonHand.get(zuweisungSchluessel(b.modell_id, b.globalid)))
        .kategorie,
      flaeche: b.mengen?.flaeche?.wert ?? null,
    })),
  );
}

/** Dienst `bim.flaechen` für die Flächentabelle der Kosten (E-95). */
export interface BimFlaechenDienst {
  /** Summen je Kategorie; null, wenn das Projekt kein Modell enthält */
  jeKategorie(
    db: PluginDb,
  ): { werte: Partial<Record<RaumKategorie, number>>; hinweise: string[] } | null;
}

export const bimFlaechenDienst: BimFlaechenDienst = {
  jeKategorie(db) {
    if (!db.eins('SELECT id FROM b_modell LIMIT 1')) return null;
    const f = raumFlaechen(db);
    const hinweise: string[] = [];
    if (f.ohneFlaeche) hinweise.push(`${f.ohneFlaeche} Raum/Räume ohne Grundfläche nicht gezählt.`);
    return { werte: f.je, hinweise };
  },
};

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
