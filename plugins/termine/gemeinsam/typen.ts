/** Typen, die Main- und Renderer-Teil des Plugins „termine“ teilen (nur Typen). */
import type { Art, Einheit, Vorgangsstatus } from '@bautakt/rechnen-termine';

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
  /** Stichtag der Prognose (E-32); null = reiner Plan ohne Ist-Stand. */
  stichtag: string | null;
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
  /** Verweis auf die Herleitung in t_aufwand (eingefrorene Bibliothekskopie, E-54). */
  aufwand_ref: string | null;
  /** Ortsbereich (E-31, E-67): IDs aus t_ort, null = ohne Ort */
  ort_von: string | null;
  ort_bis: string | null;
  /** verknüpfte Bauteile (4D, E-101): JSON-Liste aus { m: Modell-ID, g: GlobalId } */
  bauteil_refs: string;
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
  status: Vorgangsstatus;
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

/** Abweichungsursachen (E-32): feste Liste, dazu Freitext. */
export const URSACHEN = {
  witterung: 'Witterung',
  lieferverzug: 'Lieferverzug',
  planaenderung: 'Planänderung',
  personal: 'Personal',
  baugrund: 'Baugrund',
  sonstiges: 'Sonstiges',
} as const;
export type Ursache = keyof typeof URSACHEN;

/** Ist-Meldung eines Vorgangs zu einem Stichtag (t_ist, E-45). */
export interface IstZeile {
  id: string;
  vorgang_id: string;
  stichtag: string;
  ist_anfang: string | null;
  ist_ende: string | null;
  fertig_prozent: number | null;
  restdauer_at: number | null;
  ursache: Ursache | null;
  ursache_text: string;
}

/** Soll-Termine eines Vorgangs aus einem Stand, mit Abweichung der Prognose in AT (> 0 = später). */
export interface SollTermine {
  faz: number;
  fez: number;
  anfang: string;
  ende: string;
  abweichung: number | null;
}

export interface Vergleich {
  standId: string;
  standName: string;
  termine: Record<string, SollTermine>;
  projektendeDatum: string | null;
  /** Prognose-Projektende − Soll-Projektende in AT (> 0 = später). */
  abweichungProjektende: number | null;
}

/** Zu-/Abschlag im Aufwandswert-Rechner (E-53). */
export interface AufwandZuschlag {
  name: string;
  prozent: number;
}

/**
 * Herleitung einer Vorgangsdauer mit dem Aufwandswert-Rechner (E-24, E-54): Eingaben,
 * Formelzeile und eingefrorene Kopie des Bibliothekswerts (t_aufwand, eine Zeile je Vorgang).
 */
export interface AufwandZeile {
  id: string;
  vorgang_id: string;
  /** Bibliothekseintrag (id + Version); null = eigener Aufwandswert */
  bib_id: string | null;
  bib_version: number | null;
  bezeichnung: string;
  einheit: string;
  h_je_me: number;
  quelle: string;
  stand: string;
  menge: number;
  ak: number;
  h_je_at: number;
  /** JSON: AufwandZuschlag[] */
  zuschlaege: string;
  formel: string;
  /** Ergebnis des Rechners in AT */
  dauer: number;
}

/** Kurzinfo zur Herleitung je Vorgang für Tabelle und Hinweise. */
export interface AufwandHinweis {
  formel: string;
  dauer: number;
  bibVersion: number | null;
  /** Aktuelle Version in der Bibliothek, wenn neuer als die eingefrorene Kopie (E-54). */
  neuereVersion: number | null;
}

export type { OrtZeile } from './orte.js';

export interface PlanDaten {
  plan: PlanZeile;
  kalender: KalenderDaten;
  ruhezeiten: RuhezeitZeile[];
  vorgaenge: VorgangMitEbene[];
  beziehungen: BeziehungZeile[];
  berechnung: Berechnung;
  /** Je Vorgang die für die Prognose genutzte Ist-Meldung (jüngste bis zum Stichtag). */
  ist: Record<string, IstZeile>;
  /** Soll-Ist-Vergleich gegen einen Stand (E-46), wenn angefragt. */
  vergleich: Vergleich | null;
  /** Herleitungen mit dem Aufwandswert-Rechner je Vorgang (E-54). */
  aufwand: Record<string, AufwandHinweis>;
  /** Ortsstruktur des Projekts (E-67) */
  orte: import('./orte.js').OrtZeile[];
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
  'ort_von',
  'ort_bis',
] as const;

export type VorgangFelder = Partial<Pick<VorgangZeile, (typeof AENDERBARE_FELDER)[number]>>;
