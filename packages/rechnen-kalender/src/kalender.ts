import { DatumFehler, datumVonTag, tagVonDatum, wochentag } from './datum.js';
import { feiertage, type Bundesland } from './feiertage.js';

export interface Ruhezeit {
  von: string; // JJJJ-MM-TT, einschließlich
  bis: string; // JJJJ-MM-TT, einschließlich
  name?: string;
}

export interface KalenderEinstellungen {
  /** Projektstart (JJJJ-MM-TT). AT 1 ist der erste Arbeitstag ab diesem Datum. */
  start: string;
  /** Arbeitstage Mo … So, Standard Mo–Fr (E-12). */
  arbeitstage?: readonly boolean[];
  /** Gesetzliche Feiertage; `null` = keine. Standard NW. */
  bundesland?: Bundesland | null;
  ruhezeiten?: readonly Ruhezeit[];
}

export const STANDARD_ARBEITSTAGE: readonly boolean[] = [
  true,
  true,
  true,
  true,
  true,
  false,
  false,
];

/** Spätestens nach so vielen Tagen ohne Arbeitstag wird abgebrochen (Schutz vor leerem Kalender). */
const MAX_LUECKE = 3 * 366;

export type Freigrund = { art: 'wochenende' } | { art: 'feiertag' | 'ruhezeit'; name: string };

/**
 * Arbeitskalender eines Plans (Architektur 5.1 und 5.5).
 *
 * Zeitachse: kontinuierliche Zeitpunkte in AT ab 0. Arbeitstag AT n (n ≥ 1) liegt zwischen den
 * Zeitpunkten n − 1 und n. AT 1 ist der erste Arbeitstag ab Projektstart; AT 0, −1, … sind die
 * Arbeitstage davor (für negative SAZ bei Rückwärtsrechnung vom Soll-Ende).
 */
export class Arbeitskalender {
  readonly start: string;
  private readonly startTag: number;
  private readonly maske: readonly boolean[];
  private readonly bundesland: Bundesland | null;
  private readonly ruhe: { von: number; bis: number; name: string }[];
  private readonly feiertagCache = new Map<number, Map<number, string>>();
  /** Tagesnummern der Arbeitstage ab Start: Index k ↔ AT k + 1. */
  private readonly vor: number[] = [];
  /** Tagesnummern der Arbeitstage vor dem Start, absteigend: Index k ↔ AT −k. */
  private readonly rueck: number[] = [];

  constructor(e: KalenderEinstellungen) {
    this.start = e.start;
    this.startTag = tagVonDatum(e.start);
    const maske = e.arbeitstage ?? STANDARD_ARBEITSTAGE;
    if (maske.length !== 7)
      throw new DatumFehler('Die Arbeitstage-Maske braucht 7 Einträge (Mo–So).');
    if (!maske.some(Boolean))
      throw new DatumFehler('Mindestens ein Wochentag muss Arbeitstag sein.');
    this.maske = maske;
    this.bundesland = e.bundesland === undefined ? 'NW' : e.bundesland;
    this.ruhe = (e.ruhezeiten ?? []).map((r) => {
      const von = tagVonDatum(r.von);
      const bis = tagVonDatum(r.bis);
      if (bis < von) throw new DatumFehler(`Ruhezeit „${r.name ?? ''}“ endet vor ihrem Beginn.`);
      return { von, bis, name: r.name ?? 'Ruhezeit' };
    });
  }

  private feiertageDesJahres(jahr: number): Map<number, string> {
    let m = this.feiertagCache.get(jahr);
    if (!m) {
      m = new Map(
        this.bundesland
          ? feiertage(this.bundesland, jahr).map((f) => [tagVonDatum(f.datum), f.name])
          : [],
      );
      this.feiertagCache.set(jahr, m);
    }
    return m;
  }

  /** Warum ist ein Tag frei? `null` = Arbeitstag. */
  private freigrundTag(tag: number): Freigrund | null {
    const r = this.ruhe.find((z) => tag >= z.von && tag <= z.bis);
    if (r) return { art: 'ruhezeit', name: r.name };
    const jahr = Number(datumVonTag(tag).slice(0, 4));
    const f = this.feiertageDesJahres(jahr).get(tag);
    if (f) return { art: 'feiertag', name: f };
    if (!this.maske[wochentag(tag) - 1]) return { art: 'wochenende' };
    return null;
  }

  freigrund(datum: string): Freigrund | null {
    return this.freigrundTag(tagVonDatum(datum));
  }

  istArbeitstag(datum: string): boolean {
    return this.freigrundTag(tagVonDatum(datum)) === null;
  }

  private naechster(tag: number, schritt: 1 | -1): number {
    for (let i = 0; i < MAX_LUECKE; i++, tag += schritt) {
      if (this.freigrundTag(tag) === null) return tag;
    }
    throw new DatumFehler(`Kein Arbeitstag innerhalb von ${MAX_LUECKE} Tagen gefunden.`);
  }

  private bisIndexVor(k: number): void {
    while (this.vor.length <= k) {
      const letzter = this.vor.at(-1);
      this.vor.push(this.naechster(letzter === undefined ? this.startTag : letzter + 1, 1));
    }
  }

  private bisIndexRueck(k: number): void {
    while (this.rueck.length <= k) {
      const letzter = this.rueck.at(-1);
      this.rueck.push(this.naechster(letzter === undefined ? this.startTag - 1 : letzter - 1, -1));
    }
  }

  /** Tagesnummer des Arbeitstags AT n (beliebiges ganzzahliges n). */
  private tagVonAT(n: number): number {
    if (!Number.isInteger(n)) throw new DatumFehler(`AT muss ganzzahlig sein (${n}).`);
    if (n >= 1) {
      this.bisIndexVor(n - 1);
      return this.vor[n - 1] as number;
    }
    this.bisIndexRueck(-n);
    return this.rueck[-n] as number;
  }

  /** AT-Nummer des ersten Arbeitstags am oder nach `tag`. */
  private atAbTag(tag: number): number {
    if (tag >= this.startTag) {
      while ((this.vor.at(-1) ?? -Infinity) < tag) this.bisIndexVor(this.vor.length);
      return untereGrenze(this.vor, tag) + 1;
    }
    // vor dem Start: rueck ist absteigend; gesucht ist der kleinste Arbeitstag ≥ tag
    while ((this.rueck.at(-1) ?? Infinity) >= tag) this.bisIndexRueck(this.rueck.length);
    // Index des letzten Eintrags ≥ tag
    let k = -1;
    for (let lo = 0, hi = this.rueck.length - 1; lo <= hi;) {
      const mitte = (lo + hi) >> 1;
      if ((this.rueck[mitte] as number) >= tag) {
        k = mitte;
        lo = mitte + 1;
      } else hi = mitte - 1;
    }
    return k === -1 ? 1 : 0 - k || 0; // kein Arbeitstag zwischen tag und Start → AT 1 (ohne −0)
  }

  /** Datum des Arbeitstags AT n (n ≥ 1 ab Start; n ≤ 0 davor). */
  datumVonAT(n: number): string {
    return datumVonTag(this.tagVonAT(n));
  }

  /** AT-Nummer eines Arbeitstags; `null`, wenn das Datum kein Arbeitstag ist. */
  atVonDatum(datum: string): number | null {
    const tag = tagVonDatum(datum);
    if (this.freigrundTag(tag) !== null) return null;
    return this.atAbTag(tag);
  }

  /** Anzeige Anfang: Datum von AT (FAZ + 1) (Architektur 5.1). */
  anfangDatum(zeitpunkt: number): string {
    return this.datumVonAT(zeitpunkt + 1);
  }

  /** Anzeige Ende: Datum von AT (FEZ). */
  endeDatum(zeitpunkt: number): string {
    return this.datumVonAT(zeitpunkt);
  }

  /** Bedingung „nicht früher als Datum“ → frühester Anfangszeitpunkt. */
  zeitpunktFruehestensAb(datum: string): number {
    return this.atAbTag(tagVonDatum(datum)) - 1;
  }

  /** Bedingung „muss enden am Datum“ / Soll-Ende → spätester Endzeitpunkt (Ende des letzten Arbeitstags ≤ Datum). */
  zeitpunktSpaetestensBis(datum: string): number {
    const tag = tagVonDatum(datum);
    const at = this.atAbTag(tag);
    return this.tagVonAT(at) === tag ? at : at - 1;
  }

  /**
   * KT-Abstand (Architektur 5.5): Zeitpunkt in Datum umrechnen (Ende eines Arbeitstags =
   * Beginn des Folgetags), Kalendertage addieren, auf den Beginn des nächsten Arbeitstags
   * runden, zurück in einen Zeitpunkt.
   */
  ktVersatz(zeitpunkt: number, kalendertage: number): number {
    if (!Number.isInteger(kalendertage))
      throw new DatumFehler('Kalendertage müssen ganzzahlig sein.');
    const beginn = this.tagVonAT(zeitpunkt) + 1;
    return this.atAbTag(beginn + kalendertage) - 1;
  }
}

/** Index des ersten Elements ≥ wert in aufsteigend sortiertem Feld. */
function untereGrenze(feld: readonly number[], wert: number): number {
  let lo = 0;
  let hi = feld.length;
  while (lo < hi) {
    const mitte = (lo + hi) >> 1;
    if ((feld[mitte] as number) < wert) lo = mitte + 1;
    else hi = mitte;
  }
  return lo;
}
