import type { BeziehungEingabe, VorgangEingabe } from './typen.js';

type Kante = Pick<BeziehungEingabe, 'von' | 'nach'>;

function nachfolgerListe(kanten: readonly Kante[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const k of kanten) {
    const l = m.get(k.von);
    if (l) l.push(k.nach);
    else m.set(k.von, [k.nach]);
  }
  return m;
}

/** Weg von `start` nach `ziel` (Breitensuche) oder `null`. */
function weg(nachfolger: Map<string, string[]>, start: string, ziel: string): string[] | null {
  const vorher = new Map<string, string | null>([[start, null]]);
  const schlange = [start];
  for (let i = 0; i < schlange.length; i++) {
    const knoten = schlange[i] as string;
    if (knoten === ziel) {
      const pfad: string[] = [];
      for (let k: string | null = ziel; k !== null; k = vorher.get(k) ?? null) pfad.unshift(k);
      return pfad;
    }
    for (const n of nachfolger.get(knoten) ?? []) {
      if (!vorher.has(n)) {
        vorher.set(n, knoten);
        schlange.push(n);
      }
    }
  }
  return null;
}

/**
 * Würde die neue Beziehung einen Zirkelbezug erzeugen? Liefert dann den Zyklus als
 * ID-Folge (erster = letzter, beginnend beim Nachfolger der neuen Beziehung), sonst `null` (R-05).
 */
export function zyklusDurchNeueBeziehung(
  beziehungen: readonly Kante[],
  neu: Kante,
): string[] | null {
  if (neu.von === neu.nach) return [neu.von, neu.von];
  const pfad = weg(nachfolgerListe(beziehungen), neu.nach, neu.von);
  return pfad ? [...pfad, neu.nach] : null;
}

/** Findet irgendeinen Zyklus im Graphen (Tiefensuche), erster = letzter, oder `null`. */
export function findeZyklus(
  ids: readonly string[],
  beziehungen: readonly Kante[],
): string[] | null {
  const nachfolger = nachfolgerListe(beziehungen);
  const zustand = new Map<string, 1 | 2>(); // 1 = auf dem Stapel, 2 = fertig
  const stapel: string[] = [];
  const besuchen = (k: string): string[] | null => {
    zustand.set(k, 1);
    stapel.push(k);
    for (const n of nachfolger.get(k) ?? []) {
      const z = zustand.get(n);
      if (z === 1) return [...stapel.slice(stapel.indexOf(n)), n];
      if (z === undefined) {
        const r = besuchen(n);
        if (r) return r;
      }
    }
    stapel.pop();
    zustand.set(k, 2);
    return null;
  };
  for (const id of ids) {
    if (!zustand.has(id)) {
      const r = besuchen(id);
      if (r) return r;
    }
  }
  return null;
}

/** IDs → Anzeige-Nr. für Meldungen. */
export function alsNummern(ids: readonly string[], vorgaenge: readonly VorgangEingabe[]): string[] {
  const nr = new Map(vorgaenge.map((v) => [v.id, v.nr ?? v.id]));
  return ids.map((id) => nr.get(id) ?? id);
}

export function zyklusText(nummern: readonly string[]): string {
  return `Zirkelbezug: ${nummern.join(' → ')}`;
}
