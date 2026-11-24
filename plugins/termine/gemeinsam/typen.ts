/** Typen, die Main- und Renderer-Teil des Plugins „termine“ teilen (nur Typen). */
import type { Art, Einheit } from '@bautakt/rechnen-termine';

export type PlanArt = 'bauablauf' | 'rollen' | 'frei';
export type VorgangTyp = 'vorgang' | 'sammel' | 'meilenstein';
export type BedingungTyp = 'keine' | 'nicht_frueher_als' | 'muss_enden_am';

export interface PlanZeile {
  id: string;
  name: string;
  art: PlanArt | string;
  projektstart: string | null; // JJJJ-MM-TT
  soll_ende: string | null;
  rueckwaerts_von: 'berechnet' | 'soll_ende';
  kalender_id: string | null;
}

export interface KalenderDaten {
  id: string;
  /** Mo … So */
  arbeitstage: boolean[];
  bundesland: 'NW' | null;
}

export interface RuhezeitZeile {
  id: string;
  kalender_id: string;
  von: string;
  bis: string;
  name: string;
}

/** Felder eines Vorgangs (E-13), wie in `t_vorgang` gespeichert. */
export interface VorgangZeile {
  id: string;
  plan_id: string;
  parent_id: string | null;
  sortierung: number;
  nr: string;
  name: string;
  typ: VorgangTyp;
  dauer_at: number;
  quelle_annahme: string;
  anmerkung: string;
  gewerk: string;
  rolle: string;
  risiko: string;
  info_braucht: string;
  info_liefert: string;
  dauer_herleitung: string;
  bedingung_typ: BedingungTyp;
  bedingung_datum: string | null;
  schnittstelle: number; // 0/1
  netz_x: number | null;
  netz_y: number | null;
}

/** Vorgang in Baumreihenfolge mit Gliederungsebene. */
export interface VorgangMitEbene extends VorgangZeile {
  ebene: number;
  hatKinder: boolean;
}

export interface BeziehungZeile {
  id: string;
  plan_id: string;
  von_id: string;
  nach_id: string;
  art: Art;
  abstand: number;
  einheit: Einheit;
}

export interface VorgangTermine {
  faz: number;
  fez: number;
  saz: number;
  sez: number;
  gp: number;
  fp: number | null;
  kritisch: boolean;
  /** Anzeige-Daten (JJJJ-MM-TT): Anfang/Ende früheste und späteste Lage. */
  anfang: string;
  ende: string;
  spaetAnfang: string;
  spaetEnde: string;
}

export type Berechnung =
  | {
      ok: true;
      termine: Record<string, VorgangTermine>;
      kritischeBeziehungen: string[];
      projektende: number;
      projektendeDatum: string;
      sollEnde: number | null;
      sollEndeDatum: string | null;
      abweichungSollEnde: number | null;
      minGp: number;
    }
  | { ok: false; fehler: string };

export interface PlanDaten {
  plan: PlanZeile;
  kalender: KalenderDaten;
  ruhezeiten: RuhezeitZeile[];
  vorgaenge: VorgangMitEbene[];
  beziehungen: BeziehungZeile[];
  berechnung: Berechnung;
}

/** Felder, die der Befehl `vorgang.aendern` setzen darf. */
export const AENDERBARE_FELDER = [
  'nr',
  'name',
  'typ',
  'dauer_at',
  'quelle_annahme',
  'anmerkung',
  'gewerk',
  'rolle',
  'risiko',
  'info_braucht',
  'info_liefert',
  'bedingung_typ',
  'bedingung_datum',
  'schnittstelle',
] as const;

export type VorgangFelder = Partial<Pick<VorgangZeile, (typeof AENDERBARE_FELDER)[number]>>;
