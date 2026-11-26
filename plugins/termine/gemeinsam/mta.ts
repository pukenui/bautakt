/**
 * Meilenstein-Trendanalyse (E-30, E-71, E-72): Typen und reine Logik (ohne UI), von Main,
 * Renderer und Druckansicht genutzt.
 */
import { tagVonDatum } from '@bautakt/rechnen-kalender';

export interface MtaBericht {
  id: string;
  plan_id: string;
  /** Berichtsdatum JJJJ-MM-TT (Stichtag bzw. Tag des Festhaltens) */
  berichtsdatum: string;
  /** Zeitpunkt des Festhaltens (UTC) */
  zeit: string;
  notiz: string;
}

export interface MtaWert {
  termin: string;
  erreicht: boolean;
}

export interface MtaMeilenstein {
  id: string;
  nr: string;
  name: string;
  schnittstelle: boolean;
  /** Werte je Bericht (Schlüssel Bericht-ID) */
  werte: Record<string, MtaWert>;
  /** aktueller, noch nicht festgehaltener Stand */
  aktuell: MtaWert | null;
}

export interface MtaDaten {
  /** aufsteigend nach Berichtsdatum */
  berichte: MtaBericht[];
  meilensteine: MtaMeilenstein[];
  /** Datum des aktuellen Stands (Stichtag, sonst heute) */
  aktuellesDatum: string;
}

/** Punkte einer Meilensteinlinie: (Berichtsdatum, Termin) je Bericht, optional aktueller Stand. */
export function mtaPunkte(
  d: MtaDaten,
  m: MtaMeilenstein,
  mitAktuell: boolean,
): { datum: string; termin: string; erreicht: boolean; aktuell: boolean }[] {
  const punkte = d.berichte
    .filter((b) => m.werte[b.id])
    .map((b) => ({ datum: b.berichtsdatum, ...(m.werte[b.id] as MtaWert), aktuell: false }));
  const letzter = punkte.at(-1);
  if (mitAktuell && m.aktuell && (!letzter || d.aktuellesDatum > letzter.datum))
    punkte.push({ datum: d.aktuellesDatum, ...m.aktuell, aktuell: true });
  return punkte;
}

/**
 * Gemeinsamer Zeitraum beider Achsen (gleicher Maßstab, E-72): alle Berichtsdaten und Termine,
 * mit etwas Rand, als Kalendertage.
 */
export function mtaZeitraum(
  d: MtaDaten,
  ids: ReadonlySet<string>,
  mitAktuell: boolean,
): { von: number; bis: number } {
  const tage: number[] = [];
  for (const m of d.meilensteine) {
    if (!ids.has(m.id)) continue;
    for (const p of mtaPunkte(d, m, mitAktuell))
      tage.push(tagVonDatum(p.datum), tagVonDatum(p.termin));
  }
  for (const b of d.berichte) tage.push(tagVonDatum(b.berichtsdatum));
  if (mitAktuell) tage.push(tagVonDatum(d.aktuellesDatum));
  if (!tage.length) return { von: 0, bis: 30 };
  const min = Math.min(...tage);
  const max = Math.max(...tage);
  const rand = Math.max(7, Math.ceil((max - min) * 0.05));
  return { von: min - rand, bis: max + rand };
}

/** Verschiebung des Termins gegenüber dem ersten Bericht in Kalendertagen (+ = später). */
export function mtaVerschiebung(
  d: MtaDaten,
  m: MtaMeilenstein,
  mitAktuell: boolean,
): number | null {
  const p = mtaPunkte(d, m, mitAktuell);
  const erster = p[0];
  const letzter = p.at(-1);
  if (!erster || !letzter || p.length < 2) return null;
  return tagVonDatum(letzter.termin) - tagVonDatum(erster.termin);
}
