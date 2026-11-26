/**
 * Statistik der Erfahrungsdatenbank (E-34, E-74–E-78): Kennzahlen des Ist/Soll-Faktors,
 * Gruppierung nach Schlüssel, Vorschläge – reine Rechenlogik ohne UI.
 */

/** Mindestanzahl Beobachtungen für Kennzahlen (E-34). */
export const MINDEST_N = 3;
/** Ab dieser Abweichung des mittleren Faktors von 1 gibt es einen Vorschlag (E-78). */
export const VORSCHLAG_SCHWELLE = 0.05;

export interface Kennzahlen {
  n: number;
  mittel: number;
  median: number;
  /** Stichproben-Standardabweichung (n − 1); 0 bei n = 1 */
  streuung: number;
  min: number;
  max: number;
}

/** Kennzahlen einer Zahlenreihe; null bei leerer Reihe. */
export function kennzahlen(werte: readonly number[]): Kennzahlen | null {
  const w = werte.filter((x) => Number.isFinite(x));
  const n = w.length;
  if (!n) return null;
  const sortiert = [...w].sort((a, b) => a - b);
  const mittel = w.reduce((s, x) => s + x, 0) / n;
  const mitte = Math.floor(n / 2);
  const median =
    n % 2
      ? (sortiert[mitte] as number)
      : ((sortiert[mitte - 1] as number) + (sortiert[mitte] as number)) / 2;
  const streuung = n > 1 ? Math.sqrt(w.reduce((s, x) => s + (x - mittel) ** 2, 0) / (n - 1)) : 0;
  return {
    n,
    mittel,
    median,
    streuung,
    min: sortiert[0] as number,
    max: sortiert[n - 1] as number,
  };
}

/** Eine Beobachtung Soll/Ist (E-74, E-75). */
export interface Beobachtung {
  projekt_id: string;
  soll: number;
  ist: number | null;
  /** Kosten: Prognose als zweite Ist-Basis */
  ist_prognose?: number | null;
}

export type IstBasis = 'ist' | 'prognose';

/** Faktor Ist ÷ Soll; null, wenn nicht bestimmbar. */
export function faktor(b: Beobachtung, basis: IstBasis = 'ist'): number | null {
  const ist = basis === 'prognose' ? (b.ist_prognose ?? null) : b.ist;
  if (ist === null || !(b.soll > 0)) return null;
  return ist / b.soll;
}

export interface Gruppe {
  schluessel: string;
  bezeichnung: string;
  /** Anzahl Beobachtungen mit bestimmbarem Faktor */
  n: number;
  projekte: number;
  /** Kennzahlen des Faktors; null, solange n < MINDEST_N */
  faktor: Kennzahlen | null;
  sollMittel: number | null;
  istMittel: number | null;
}

/**
 * Gruppiert Beobachtungen nach Schlüssel (E-77). Beobachtungen ohne Schlüssel (leer/null)
 * zählen nicht. Kennzahlen erst ab n ≥ 3.
 */
export function gruppieren<T extends Beobachtung>(
  beobachtungen: readonly T[],
  schluessel: (b: T) => string | null | undefined,
  bezeichnung: (b: T) => string,
  basis: IstBasis = 'ist',
): Gruppe[] {
  const gruppen = new Map<string, T[]>();
  for (const b of beobachtungen) {
    const k = schluessel(b);
    if (k === null || k === undefined || k === '') continue;
    if (faktor(b, basis) === null) continue;
    gruppen.set(k, [...(gruppen.get(k) ?? []), b]);
  }
  return [...gruppen.entries()]
    .map(([k, liste]) => {
      const faktoren = liste.map((b) => faktor(b, basis) as number);
      const ist = liste.map((b) => (basis === 'prognose' ? (b.ist_prognose ?? 0) : (b.ist ?? 0)));
      return {
        schluessel: k,
        bezeichnung: bezeichnung(liste[liste.length - 1] as T),
        n: liste.length,
        projekte: new Set(liste.map((b) => b.projekt_id)).size,
        faktor: liste.length >= MINDEST_N ? kennzahlen(faktoren) : null,
        sollMittel: liste.reduce((s, b) => s + b.soll, 0) / liste.length,
        istMittel: ist.reduce((s, x) => s + x, 0) / ist.length,
      };
    })
    .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, 'de'));
}

/** Abweichung in Prozent (Faktor 1,18 → +18 %), auf ganze Prozent gerundet. */
export function prozent(f: number): number {
  return Math.round((f - 1) * 100);
}

/** Gibt es einen Vorschlag (E-78)? */
export function vorschlagNoetig(g: Gruppe, schwelle = VORSCHLAG_SCHWELLE): boolean {
  return !!g.faktor && Math.abs(g.faktor.mittel - 1) >= schwelle - 1e-12;
}

/**
 * Text eines Vorschlags (Formulierung nach E-34). `art` bestimmt die Richtung:
 * Dauer länger als geplant ⇒ Aufwandswert zu niedrig; Kosten höher ⇒ Kennwert zu niedrig.
 */
export function vorschlagText(art: 'Aufwandswert' | 'Kennwert', name: string, g: Gruppe): string {
  const f = g.faktor?.mittel ?? 1;
  const p = Math.abs(prozent(f));
  const kurz = art === 'Aufwandswert' ? 'AW' : 'KKW';
  return `${kurz} ${name} im Mittel ${p} % zu ${f > 1 ? 'niedrig' : 'hoch'} (n = ${g.n}) – Bibliothekswert anpassen?`;
}
