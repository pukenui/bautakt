/** Typen des Plugins „kosten“, geteilt von Main und Renderer (nur Typen). */
import type {
  Flaeche,
  FlaecheEingabe,
  IndexErgebnis,
  IndexModus,
  Steuer,
} from '@bautakt/rechnen-kosten';

export interface EinstellungZeile {
  id: string;
  mwst_satz: number;
  vorsteuerabzug: number; // 0/1
  regionalfaktor: number;
  regionalfaktor_quelle: string;
  index_aktuell: number | null;
  index_aktuell_stand: string;
  index_quelle: string;
}

export interface FlaecheZeile {
  id: string;
  kategorie: FlaecheEingabe;
  wert_m2: number | null;
  quelle: string;
}

/** Kostenzeile (k_zeile, E-15) – genau eine je KG (E-55). */
export interface KostenZeile {
  id: string;
  kg: number;
  /** eigene Bezeichnung; leer = Katalog */
  bezeichnung: string;
  menge: number | null;
  einheit: string;
  menge_quelle: 'manuell' | 'flaeche' | 'ifc';
  /** gekoppelte Fläche bei menge_quelle = 'flaeche' */
  flaeche: Flaeche | null;
  kkw_von: number | null;
  kkw_mittel: number | null;
  kkw_bis: number | null;
  kkw_gewaehlt: number | null;
  /** eingefrorener Bibliothekskennwert (E-58) */
  kkw_ref: string | null;
  kkw_ref_version: number | null;
  kkw_bezeichnung: string;
  kkw_quelle: string;
  kkw_stand: string;
  kkw_stand_index: number | null;
  index_modus: IndexModus;
  index_faktor: number | null;
  index_begruendung: string;
  kommentar: string;
  anmerkung: string;
  bauteil_refs: string | null;
}

/** Kostenzeile mit Rechenergebnis. */
export interface ZeileBerechnet extends KostenZeile {
  katalogBezeichnung: string;
  mengeWirksam: number | null;
  index: IndexErgebnis;
  kkwWirksam: number | null;
  kosten: number | null;
  /** Hinweise und fehlende Pflichtangaben für die Anzeige */
  hinweise: string[];
  /** Aktuelle Bibliotheksversion, wenn neuer als die eingefrorene Kopie */
  neuereVersion: number | null;
}

export interface KnotenDaten {
  kg: number;
  ebene: 1 | 2 | 3;
  bezeichnung: string;
  summe: number | null;
  ausUnterzeilen: boolean;
  kinder: number[];
  /** ID der eigenen Kostenzeile, falls vorhanden */
  zeileId: string | null;
}

export interface KostenDaten {
  einstellung: EinstellungZeile;
  flaechen: Record<Flaeche, number | null>;
  flaechenQuelle: Partial<Record<FlaecheEingabe, string>>;
  zeilen: ZeileBerechnet[];
  /** alle Knoten (KG mit Zeile oder mit Zeilen darunter), aufsteigend nach KG */
  baum: KnotenDaten[];
  /** Summe KG 100–800 */
  gesamt: Steuer;
  /** KG 300 + 400 (Bauwerkskosten) */
  bauwerk: Steuer;
  /** Bauwerkskosten netto je m² BGF; null ohne BGF */
  bauwerkJeBgf: number | null;
}

/** Felder, die `zeile.aendern` setzen darf. */
export const ZEILE_FELDER = [
  'bezeichnung',
  'menge',
  'einheit',
  'menge_quelle',
  'flaeche',
  'kkw_von',
  'kkw_mittel',
  'kkw_bis',
  'kkw_gewaehlt',
  'kkw_bezeichnung',
  'kkw_quelle',
  'kkw_stand',
  'kkw_stand_index',
  'index_modus',
  'index_faktor',
  'index_begruendung',
  'kommentar',
  'anmerkung',
] as const;

// --- Soll-Ist (E-33, E-60–E-63) ---------------------------------------------------------

export interface StufeZeile {
  id: string;
  kg: number;
  stufe: 'rahmen' | 'schaetzung' | 'berechnung';
  betrag_netto: number;
  herkunft: 'planung' | 'hand';
  zeit: string;
}

export interface AuftragZeile {
  id: string;
  kg: number;
  bezeichnung: string;
  auftragnehmer: string;
  betrag_netto: number;
  datum: string | null;
  beleg_nr: string;
  /** Pfad zur Datei (Verweis, E-62) */
  anhang: string | null;
  anmerkung: string;
}

export interface RechnungZeile {
  id: string;
  kg: number;
  auftrag_id: string | null;
  rechnungssteller: string;
  betrag_netto: number;
  datum: string | null;
  beleg_nr: string;
  anhang: string | null;
  anmerkung: string;
}

export interface AbweichungZeile {
  id: string;
  kg: number;
  ursache: string | null;
  text: string;
}

export interface AuftragBerechnet extends AuftragZeile {
  abgerechnet: number;
  offen: number;
  anhangFehlt: boolean;
}

export interface RechnungBerechnet extends RechnungZeile {
  anhangFehlt: boolean;
}

export interface SollIstZeile {
  kg: number;
  ebene: 1 | 2 | 3;
  bezeichnung: string;
  stufen: Record<
    'rahmen' | 'schaetzung' | 'berechnung' | 'anschlag' | 'feststellung',
    number | null
  >;
  /** von Hand korrigierte Stufen dieser KG */
  vonHand: ('rahmen' | 'schaetzung' | 'berechnung')[];
  prognose: number | null;
  abweichung: number | null;
  abweichungProzent: number | null;
  ursache: string | null;
  ursacheText: string;
}

export interface SollIstDaten {
  bezug: 'rahmen' | 'schaetzung' | 'berechnung' | 'anschlag' | 'feststellung';
  zeilen: SollIstZeile[];
  /** Zeitpunkt des letzten Festschreibens je Stufe (UTC) */
  festgeschrieben: Record<'rahmen' | 'schaetzung' | 'berechnung', string | null>;
  auftraege: AuftragBerechnet[];
  rechnungen: RechnungBerechnet[];
  /** Summe KG 100–800 je Stufe sowie Prognose und Abweichung */
  gesamt: Omit<
    SollIstZeile,
    'kg' | 'ebene' | 'bezeichnung' | 'vonHand' | 'ursache' | 'ursacheText'
  >;
}
