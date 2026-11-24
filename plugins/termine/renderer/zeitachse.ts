import {
  datumVonTag,
  isoKalenderwoche,
  tagVonDatum,
  type Arbeitskalender,
} from '@bautakt/rechnen-kalender';

export type Zoom = 'tag' | 'woche' | 'monat' | 'quartal';

/** Pixel je Kalendertag je Zoomstufe (E-21: Tag/KW/Monat/Quartal). */
export const PX_JE_TAG: Record<Zoom, number> = { tag: 26, woche: 9, monat: 3, quartal: 1.1 };

const MONAT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export interface Abschnitt {
  x: number;
  breite: number;
  text: string;
}

/** Zeitachse: Kalendertag ↔ x und Umrechnung der AT-Zeitpunkte in Positionen. */
export class Zeitachse {
  readonly pxJeTag: number;

  constructor(
    readonly vonTag: number,
    readonly bisTag: number, // ausschließlich
    readonly zoom: Zoom,
    private readonly kal: Arbeitskalender,
  ) {
    this.pxJeTag = PX_JE_TAG[zoom];
  }

  get breite(): number {
    return (this.bisTag - this.vonTag) * this.pxJeTag;
  }

  xTag(tag: number): number {
    return (tag - this.vonTag) * this.pxJeTag;
  }

  xDatum(iso: string): number {
    return this.xTag(tagVonDatum(iso));
  }

  /** Beginn des Arbeitstags AT (t + 1) – Anfang eines Vorgangs mit FAZ = t. */
  xAnfang(t: number): number {
    return this.xTag(tagVonDatum(this.kal.anfangDatum(t)));
  }

  /** Ende des Arbeitstags AT t – Ende eines Vorgangs mit FEZ = t. */
  xEnde(t: number): number {
    return this.xTag(tagVonDatum(this.kal.endeDatum(t)) + 1);
  }

  /** Position eines Meilensteins (Zeitpunkt t): Ende von AT t, bei t ≤ 0 Projektbeginn. */
  xPunkt(t: number): number {
    return t >= 1 ? this.xEnde(t) : this.xAnfang(t);
  }

  /** Kopfzeilen der Zeitachse (oben grob, unten fein). */
  kopf(): { oben: Abschnitt[]; unten: Abschnitt[] } {
    const gruppen = (
      schluessel: (iso: string) => string,
      text: (iso: string) => string,
    ): Abschnitt[] => {
      const liste: Abschnitt[] = [];
      for (let t = this.vonTag; t < this.bisTag; t++) {
        const iso = datumVonTag(t);
        const k = schluessel(iso);
        const letzter = liste.at(-1) as (Abschnitt & { k?: string }) | undefined;
        if (letzter && letzter.k === k) letzter.breite += this.pxJeTag;
        else
          liste.push(
            Object.assign({ x: this.xTag(t), breite: this.pxJeTag, text: text(iso) }, { k }),
          );
      }
      return liste.map(({ x, breite, text }) => ({ x, breite, text }));
    };
    const monat = (iso: string) => iso.slice(0, 7);
    const monatText = (iso: string) => `${MONAT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
    const kw = (iso: string) => {
      const w = isoKalenderwoche(iso);
      return `${w.jahr}-${w.woche}`;
    };
    const kwText = (iso: string) => `KW ${isoKalenderwoche(iso).woche}`;
    const jahr = (iso: string) => iso.slice(0, 4);
    const quartal = (iso: string) =>
      `${iso.slice(0, 4)}-Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}`;
    switch (this.zoom) {
      case 'tag':
        return {
          oben: gruppen(kw, (iso) => `${kwText(iso)} · ${monatText(iso)}`),
          unten: gruppen(
            (iso) => iso,
            (iso) => String(Number(iso.slice(8, 10))),
          ),
        };
      case 'woche':
        return {
          oben: gruppen(monat, monatText),
          unten: gruppen(kw, (iso) => String(isoKalenderwoche(iso).woche)),
        };
      case 'monat':
        return {
          oben: gruppen(jahr, jahr),
          unten: gruppen(monat, (iso) => MONAT[Number(iso.slice(5, 7)) - 1] ?? ''),
        };
      case 'quartal':
        return {
          oben: gruppen(jahr, jahr),
          unten: gruppen(quartal, (iso) => quartal(iso).slice(5)),
        };
    }
  }

  /** Arbeitsfreie Zeiträume als zusammenhängende Streifen (Wochenende/Feiertag bzw. Ruhezeit). */
  freieStreifen(): { x: number; breite: number; art: 'frei' | 'ruhezeit'; text: string }[] {
    const liste: {
      x: number;
      breite: number;
      art: 'frei' | 'ruhezeit';
      text: string;
      bis: number;
    }[] = [];
    for (let t = this.vonTag; t < this.bisTag; t++) {
      const g = this.kal.freigrund(datumVonTag(t));
      if (!g) continue;
      const art = g.art === 'ruhezeit' ? 'ruhezeit' : 'frei';
      const text = g.art === 'wochenende' ? '' : g.name;
      const letzter = liste.at(-1);
      if (letzter && letzter.bis === t && letzter.art === art && letzter.text === text) {
        letzter.breite += this.pxJeTag;
        letzter.bis = t + 1;
      } else liste.push({ x: this.xTag(t), breite: this.pxJeTag, art, text, bis: t + 1 });
    }
    return liste.map(({ bis: _b, ...s }) => s);
  }
}

/**
 * Orthogonaler Pfeilweg zwischen zwei Ankerpunkten.
 * `ausRechts`: Pfeil verlässt die Quelle nach rechts (Ende) bzw. links (Anfang);
 * `inLinks`: Pfeil erreicht das Ziel von links (Anfang) bzw. von rechts (Ende).
 */
export function pfeilWeg(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ausRechts: boolean,
  inLinks: boolean,
  abstand = 8,
  zwischenY?: number,
): string {
  const a = x1 + (ausRechts ? abstand : -abstand);
  const b = x2 - (inLinks ? abstand : -abstand);
  if (ausRechts && inLinks && a <= b) return `M${x1},${y1} H${a} V${y2} H${x2}`;
  if (!ausRechts && !inLinks && a >= b) return `M${x1},${y1} H${a} V${y2} H${x2}`;
  if (ausRechts && !inLinks) {
    const m = Math.max(a, b);
    return `M${x1},${y1} H${m} V${y2} H${x2}`;
  }
  if (!ausRechts && inLinks) {
    const m = Math.min(a, b);
    return `M${x1},${y1} H${m} V${y2} H${x2}`;
  }
  const ym = zwischenY ?? (y1 + y2) / 2;
  return `M${x1},${y1} H${a} V${ym} H${b} V${y2} H${x2}`;
}
