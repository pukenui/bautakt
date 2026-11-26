/** Typen des Plugins „statistik“ (E-34, E-74–E-78), geteilt von Main und Renderer. */
import type { Gruppe, IstBasis } from '@bautakt/rechnen-statistik';

/** Merkmale des geöffneten Projekts (Projektdatei, Tabelle s_projekt). */
export interface ProjektMerkmale {
  id: string;
  zaehlt: number; // 0/1
  gebaeudeart: string;
  bauweise: string;
  abgeschlossen: number; // 0/1
  /** Zeitpunkt der letzten Übertragung (UTC) */
  uebertragen: string | null;
}

/** Beobachtungen, wie sie Termine und Kosten liefern (Dienste „termine.erfahrung“, „kosten.erfahrung“). */
export interface DauerDaten {
  bezeichnung: string;
  gewerk: string;
  aufwandswert_id: string | null;
  aufwandswert_bez: string;
  ursache: string;
  soll: number;
  ist: number;
}
export interface KostenDaten {
  kg: number;
  bezeichnung: string;
  ursache: string;
  soll: number;
  ist: number | null;
  ist_prognose: number | null;
}
export interface KkwDaten {
  kennwert_id: string;
  bezeichnung: string;
  kg: number;
  soll: number;
  ist: number | null;
  ist_prognose: number | null;
}

/** Was „Übertragen“ in die Erfahrungsdatenbank schreibt. */
export interface Erhebung {
  projekt: {
    projekt_id: string;
    projektname: string;
    zaehlt: boolean;
    gebaeudeart: string;
    bauweise: string;
    bgf: number | null;
    abgeschlossen: boolean;
  };
  dauer: DauerDaten[];
  kosten: KostenDaten[];
  kkw: KkwDaten[];
}

/** Projekt in der Erfahrungsdatenbank. */
export interface ErfahrungsProjekt {
  projekt_id: string;
  projektname: string;
  zaehlt: number;
  gebaeudeart: string;
  bauweise: string;
  bgf: number | null;
  abgeschlossen: number;
  uebertragen: string;
  beobachtungen: number;
}

export type Art = 'dauer' | 'kosten' | 'kkw';
export type Schluessel = 'aufwandswert' | 'gewerk' | 'ursache' | 'kg' | 'kennwert';

export const SCHLUESSEL_JE_ART: Record<Art, Schluessel[]> = {
  dauer: ['aufwandswert', 'gewerk', 'ursache'],
  kosten: ['kg', 'ursache'],
  kkw: ['kennwert'],
};

export interface AuswertungsFilter {
  gebaeudeart?: string | null;
  bauweise?: string | null;
  bgfVon?: number | null;
  bgfBis?: number | null;
}

export interface Vorschlag {
  /** Bibliotheks-ID (Aufwandswert bzw. Kennwert) */
  id: string;
  art: 'aufwandswert' | 'kennwert';
  text: string;
  faktor: number;
}

export interface Auswertung {
  art: Art;
  schluessel: Schluessel;
  basis: IstBasis;
  gruppen: Gruppe[];
  vorschlaege: Vorschlag[];
  /** gezählte Projekte nach Filter */
  projekte: number;
}
