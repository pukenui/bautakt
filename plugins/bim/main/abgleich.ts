import type { Aenderungsbericht, ModellInhalt } from '../gemeinsam/typen.js';
import type { Mengen } from '../gemeinsam/zuordnung.js';

/** Vorhandenes Bauteil (Zeile der Projektdatei) für den Abgleich. */
export interface AltBauteil {
  globalid: string;
  klasse: string;
  name: string;
  langname: string;
  typ: string;
  geschoss: string; // Name des Geschosses ('' ohne)
  predefined: string;
  aussen: number | null;
  tragend: number | null;
  mengen: Mengen | null;
}

type Neu = ModellInhalt['bauteile'][number];

const ART_TEXT = { flaeche: 'Fläche', volumen: 'Volumen', laenge: 'Länge' } as const;

/** Mengen unterscheiden sich, wenn ein Wert neu/weg ist oder um mehr als 0,1 % (mind. 0,001) abweicht. */
function mengenUnterschied(a: Mengen | null, b: Mengen): string[] {
  if (!a) return ['Mengen'];
  const was: string[] = [];
  for (const art of ['flaeche', 'volumen', 'laenge'] as const) {
    const x = a[art]?.wert;
    const y = b[art]?.wert;
    if (x === undefined && y === undefined) continue;
    if (
      x === undefined ||
      y === undefined ||
      Math.abs(x - y) > Math.max(0.001, Math.abs(x) * 0.001)
    )
      was.push(ART_TEXT[art]);
  }
  return was;
}

/**
 * Abgleich über die GlobalId (E-96): neu, entfernt, geändert mit den geänderten Merkmalen.
 * Bei doppelten GlobalIds in der neuen Datei zählt das erste Vorkommen.
 */
export function abgleichen(
  alt: readonly AltBauteil[],
  neu: readonly Neu[],
  geschossName: (expressId: number | null) => string,
): Pick<Aenderungsbericht, 'neu' | 'entfernt' | 'geaendert'> {
  const altJe = new Map(alt.map((b) => [b.globalid, b]));
  const gesehen = new Set<string>();
  const bericht: Pick<Aenderungsbericht, 'neu' | 'entfernt' | 'geaendert'> = {
    neu: [],
    entfernt: [],
    geaendert: [],
  };
  for (const n of neu) {
    if (gesehen.has(n.globalid)) continue;
    gesehen.add(n.globalid);
    const a = altJe.get(n.globalid);
    const kurz = { globalid: n.globalid, klasse: n.klasse, name: n.name || n.typ };
    if (!a) {
      bericht.neu.push(kurz);
      continue;
    }
    const was: string[] = [];
    if (a.klasse !== n.klasse) was.push('Klasse');
    if (a.name !== n.name) was.push('Name');
    if (a.langname !== n.langname) was.push('Langname');
    if (a.typ !== n.typ) was.push('Typ');
    if (a.geschoss !== geschossName(n.geschoss)) was.push('Geschoss');
    if (a.predefined !== n.predefined || a.aussen !== n.aussen || a.tragend !== n.tragend)
      was.push('Merkmale');
    was.push(...mengenUnterschied(a.mengen, n.mengen));
    if (was.length) bericht.geaendert.push({ ...kurz, was });
  }
  for (const a of alt)
    if (!gesehen.has(a.globalid))
      bericht.entfernt.push({ globalid: a.globalid, klasse: a.klasse, name: a.name || a.typ });
  return bericht;
}
