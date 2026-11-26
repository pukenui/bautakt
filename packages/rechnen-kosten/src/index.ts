/**
 * Kostenplanung (E-15, E-16, E-55–E-57): Katalog DIN 276, Flächen DIN 277, Indexierung,
 * Regionalfaktor, Rundung auf Cent, Summen im KG-Baum, MwSt. – ohne UI-Abhängigkeit.
 */
import { kgEltern } from './katalog.js';

export * from './katalog.js';

// --- Flächen DIN 277 (R-11) -------------------------------------------------------------

/** Eingabeflächen; NUF, NRF und BGF werden abgeleitet. */
export const FLAECHEN_EINGABE = [
  'NUF1',
  'NUF2',
  'NUF3',
  'NUF4',
  'NUF5',
  'NUF6',
  'NUF7',
  'TF',
  'VF',
  'KGF',
  'AF',
  'GF',
] as const;
export type FlaecheEingabe = (typeof FLAECHEN_EINGABE)[number];
export type FlaecheAbgeleitet = 'NUF' | 'NRF' | 'BGF';
export type Flaeche = FlaecheEingabe | FlaecheAbgeleitet;

export const FLAECHE_TEXT: Record<Flaeche, string> = {
  NUF1: 'NUF 1 Wohnen und Aufenthalt',
  NUF2: 'NUF 2 Büroarbeit',
  NUF3: 'NUF 3 Produktion, Hand- und Maschinenarbeit, Forschung',
  NUF4: 'NUF 4 Lagern, Verteilen und Verkaufen',
  NUF5: 'NUF 5 Bildung, Unterricht und Kultur',
  NUF6: 'NUF 6 Heilen und Pflegen',
  NUF7: 'NUF 7 Sonstige Nutzungen',
  NUF: 'NUF Nutzungsfläche',
  TF: 'TF Technikfläche',
  VF: 'VF Verkehrsfläche',
  NRF: 'NRF Netto-Raumfläche',
  KGF: 'KGF Konstruktions-Grundfläche',
  BGF: 'BGF Brutto-Grundfläche',
  AF: 'AF Außenanlagenfläche',
  GF: 'GF Grundstücksfläche',
};

/**
 * Abgeleitete Flächen (E-15): NUF = Σ NUF 1–7, NRF = NUF + TF + VF, BGF = NRF + KGF.
 * Eine Summe ist null, solange keiner ihrer Summanden eingetragen ist.
 */
export function flaechenAbleiten(
  werte: Partial<Record<FlaecheEingabe, number | null>>,
): Record<Flaeche, number | null> {
  const summe = (...teile: (number | null | undefined)[]) =>
    teile.some((t) => t != null)
      ? rundeCent(teile.reduce<number>((s, t) => s + (t ?? 0), 0))
      : null;
  const e = (k: FlaecheEingabe) => werte[k] ?? null;
  const nuf = summe(e('NUF1'), e('NUF2'), e('NUF3'), e('NUF4'), e('NUF5'), e('NUF6'), e('NUF7'));
  const nrf = summe(nuf, e('TF'), e('VF'));
  const bgf = summe(nrf, e('KGF'));
  const ergebnis = {} as Record<Flaeche, number | null>;
  for (const k of FLAECHEN_EINGABE) ergebnis[k] = e(k);
  return { ...ergebnis, NUF: nuf, NRF: nrf, BGF: bgf };
}

// --- Rundung, Index, Regionalfaktor (R-10) ------------------------------------------------

/** Kaufmännisch auf Cent runden (robust gegen Gleitkomma-Reste wie 2.771,9999999). */
export function rundeCent(x: number): number {
  const v = Math.round(Math.abs(x) * 100 + 1e-7) / 100;
  return x < 0 ? -v : v;
}

export type IndexModus = 'index' | 'ohne' | 'eigen';

export interface IndexAngaben {
  modus: IndexModus;
  /** Index zum Stand des Kennwerts (z. B. 120,0) */
  indexStand: number | null;
  /** aktueller Baupreisindex des Projekts (z. B. 132,0) */
  indexAktuell: number | null;
  eigenerFaktor: number | null;
  begruendung: string;
}

export interface IndexErgebnis {
  faktor: number;
  /** Rechenweg, z. B. „132,0 ÷ 120,0 = 1,1000“ */
  text: string;
  hinweis: string | null;
  /** Fehlende Pflichtangabe (z. B. Begründung bei Abweichung, E-56). */
  fehler: string | null;
}

const fmt = (n: number, stellen: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/** Indexfaktor einer Kostenzeile (E-16, E-56). */
export function indexfaktor(a: IndexAngaben): IndexErgebnis {
  const ohneBegruendung = !a.begruendung.trim();
  switch (a.modus) {
    case 'ohne':
      return {
        faktor: 1,
        text: 'ohne Indexierung',
        hinweis: null,
        fehler: ohneBegruendung ? 'Begründung für „ohne Indexierung“ fehlt (E-56).' : null,
      };
    case 'eigen': {
      const f = a.eigenerFaktor;
      if (f == null || !(f > 0))
        return {
          faktor: 1,
          text: 'eigener Faktor fehlt',
          hinweis: null,
          fehler: 'Eigener Indexfaktor fehlt.',
        };
      return {
        faktor: f,
        text: `eigener Faktor ${fmt(f, 4)}`,
        hinweis: null,
        fehler: ohneBegruendung ? 'Begründung für den eigenen Indexfaktor fehlt (E-56).' : null,
      };
    }
    case 'index': {
      if (!(a.indexStand && a.indexStand > 0) || !(a.indexAktuell && a.indexAktuell > 0))
        return {
          faktor: 1,
          text: 'Index fehlt → Faktor 1',
          hinweis: !(a.indexAktuell && a.indexAktuell > 0)
            ? 'Aktueller Baupreisindex ist nicht eingetragen – Faktor 1.'
            : 'Index zum Stand des Kennwerts fehlt – Faktor 1.',
          fehler: null,
        };
      const faktor = a.indexAktuell / a.indexStand;
      return {
        faktor,
        text: `${fmt(a.indexAktuell, 1)} ÷ ${fmt(a.indexStand, 1)} = ${fmt(faktor, 4)}`,
        hinweis: null,
        fehler: null,
      };
    }
  }
}

/** KKW wirksam = KKW gewählt × Indexfaktor × Regionalfaktor, auf Cent (E-57, R-10). */
export function kkwWirksam(gewaehlt: number, indexFaktor: number, regionalfaktor: number): number {
  return rundeCent(gewaehlt * indexFaktor * regionalfaktor);
}

/** Kosten einer Zeile = Menge × KKW wirksam, auf Cent (E-57). */
export function zeilenkosten(menge: number, kkw: number): number {
  return rundeCent(menge * kkw);
}

// --- Summen im KG-Baum (E-15) -------------------------------------------------------------

export interface KnotenSumme {
  kg: number;
  /** Maßgebende Summe: aus Unterzeilen, sonst eigene Kosten; null = nichts eingetragen */
  summe: number | null;
  /** Kosten der eigenen Zeile (falls vorhanden) */
  eigene: number | null;
  /** true, wenn Unterzeilen existieren und damit maßgebend sind */
  ausUnterzeilen: boolean;
  /** direkt untergeordnete KG im Baum (aufsteigend) */
  kinder: number[];
}

/**
 * Summen nach oben (E-15): Jede KG mit Zeile oder mit Zeilen darunter wird Knoten.
 * Existieren Unterzeilen, sind diese maßgebend; die eigene Zeile zählt dann nicht.
 */
export function kostenBaum(
  zeilen: readonly { kg: number; kosten: number | null }[],
): Map<number, KnotenSumme> {
  const eigene = new Map<number, number | null>();
  for (const z of zeilen) eigene.set(z.kg, z.kosten);
  const knoten = new Map<number, KnotenSumme>();
  const holen = (kg: number) => {
    let k = knoten.get(kg);
    if (!k) {
      k = { kg, summe: null, eigene: eigene.get(kg) ?? null, ausUnterzeilen: false, kinder: [] };
      knoten.set(kg, k);
    }
    return k;
  };
  for (const z of zeilen) {
    let kind = holen(z.kg);
    for (let e = kgEltern(z.kg); e !== null; e = kgEltern(e)) {
      const eltern = holen(e);
      if (!eltern.kinder.includes(kind.kg)) eltern.kinder.push(kind.kg);
      kind = eltern;
    }
  }
  const rechnen = (k: KnotenSumme): number | null => {
    k.kinder.sort((a, b) => a - b);
    if (k.kinder.length) {
      k.ausUnterzeilen = true;
      const werte = k.kinder.map((c) => rechnen(knoten.get(c) as KnotenSumme));
      k.summe = werte.some((w) => w !== null)
        ? rundeCent(werte.reduce<number>((s, w) => s + (w ?? 0), 0))
        : null;
    } else k.summe = k.eigene;
    return k.summe;
  };
  for (const k of knoten.values()) if (kgEltern(k.kg) === null) rechnen(k);
  return knoten;
}

export interface Steuer {
  netto: number;
  mwst: number;
  brutto: number;
  /** netto bei Vorsteuerabzug, sonst brutto (E-16) */
  massgebend: number;
}

/** MwSt. auf eine Summe, auf Cent (E-57). */
export function steuer(netto: number, satzProzent: number, vorsteuerabzug: boolean): Steuer {
  const mwst = rundeCent((netto * satzProzent) / 100);
  const brutto = rundeCent(netto + mwst);
  return { netto, mwst, brutto, massgebend: vorsteuerabzug ? netto : brutto };
}

/** Euro-Betrag im deutschen Format: 3.326.400,00 € */
export function euro(x: number): string {
  return `${fmt(x, 2)} €`;
}
export * from './sollist.js';
