/** Anordnungsbeziehungen nach DIN 69900. */
export type Art = 'EA' | 'AA' | 'EE' | 'AE';
/** Einheit des Zeitabstands: Arbeitstage oder Kalendertage (E-12). */
export type Einheit = 'AT' | 'KT';
export type Vorgangstyp = 'vorgang' | 'sammel' | 'meilenstein';

export const ARTEN: readonly Art[] = ['EA', 'AA', 'EE', 'AE'];

export interface VorgangEingabe {
  id: string;
  /** Anzeige-Nr. (für Fehlermeldungen), sonst wird die ID verwendet. */
  nr?: string;
  typ?: Vorgangstyp;
  /** Dauer in AT, ganzzahlig ≥ 0. Meilensteine: 0. Bei Sammelvorgängen ignoriert. */
  dauer: number;
  /** Übergeordneter Sammelvorgang (E-14). */
  parent?: string | null;
  /** Bedingung „nicht früher als“ als Zeitpunkt (frühester Anfang). */
  fruehestensAb?: number | null;
  /** Bedingung „muss enden am“ als Zeitpunkt (spätestes Ende). */
  spaetestensBis?: number | null;
  /** Ist-Stand zum Stichtag (Prognose, E-43–E-45); fehlt er, gilt der Vorgang als nicht begonnen. */
  ist?: IstEingabe | null;
}

/** Ist-Stand eines Vorgangs als Zeitpunkte in AT. */
export interface IstEingabe {
  /** Ist-Anfang (Zeitpunkt, an dem der Vorgang begonnen hat). */
  anfang: number;
  /** Ist-Ende; gesetzt = Vorgang fertig. */
  ende?: number | null;
  /** Restdauer ab Stichtag in AT (nur begonnen, nicht fertig). */
  rest?: number | null;
}

export type Vorgangsstatus = 'geplant' | 'begonnen' | 'fertig';

export interface BeziehungEingabe {
  id?: string;
  von: string; // Vorgänger-ID
  nach: string; // Nachfolger-ID
  art: Art;
  /** Zeitabstand, ganzzahlig, auch negativ (Überlappung). */
  abstand: number;
  einheit?: Einheit; // Standard AT
}

/** Was die Netzplanrechnung vom Kalender braucht (nur für KT-Abstände). */
export interface KtKalender {
  ktVersatz(zeitpunkt: number, kalendertage: number): number;
}

export interface NetzplanOptionen {
  /** Nötig, sobald eine Beziehung in KT angegeben ist. */
  kalender?: KtKalender;
  /** Soll-Ende als Zeitpunkt (E-19). */
  sollEnde?: number | null;
  /** Rückwärtsrechnung vom berechneten Ende (Standard) oder vom Soll-Ende. */
  rueckwaertsVon?: 'berechnet' | 'soll_ende';
  /** Stichtag als Zeitpunkt: nicht begonnene Vorgänge beginnen frühestens hier (E-44). */
  stichtag?: number | null;
}

export interface VorgangErgebnis {
  id: string;
  faz: number;
  fez: number;
  saz: number;
  sez: number;
  /** Gesamtpuffer; kann bei Rückwärtsrechnung vom Soll-Ende negativ sein. */
  gp: number;
  /** Freier Puffer; bei Sammelvorgängen `null`. */
  fp: number | null;
  kritisch: boolean;
  status: Vorgangsstatus;
}

export interface BeziehungErgebnis {
  /** Index in der Eingabeliste. */
  index: number;
  id?: string;
  /** Teil des kritischen Wegs (beide Vorgänge kritisch, kein Spielraum bei spätester Lage). */
  kritisch: boolean;
}

export interface NetzplanErgebnis {
  vorgaenge: Map<string, VorgangErgebnis>;
  beziehungen: BeziehungErgebnis[];
  /** Berechnetes Projektende = max FEZ. */
  projektende: number;
  /** Ende, von dem rückwärts gerechnet wurde (T). */
  bezugsende: number;
  /** projektende − sollEnde, wenn ein Soll-Ende gesetzt ist (> 0 = Überschreitung). */
  abweichungSollEnde: number | null;
  /** Kleinster GP aller Einzelvorgänge. */
  minGp: number;
  /** Kritische Einzelvorgänge und Meilensteine in zeitlicher Reihenfolge. */
  kritischerPfad: string[];
  /** Einzelvorgänge in topologischer Reihenfolge. */
  reihenfolge: string[];
}

export class NetzplanFehler extends Error {
  constructor(
    readonly code: 'ZYKLUS' | 'UNGUELTIG' | 'KALENDER_FEHLT',
    message: string,
    /** Bei ZYKLUS: Nr. der beteiligten Vorgänge, erster = letzter. */
    readonly zyklus?: string[],
  ) {
    super(message);
    this.name = 'NetzplanFehler';
  }
}
