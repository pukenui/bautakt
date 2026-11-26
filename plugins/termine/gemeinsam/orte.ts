/**
 * Ortsstruktur (E-31, E-67): Baum in Reihenfolge, Bereiche „Ort von–bis“ in Blatt-Einheiten
 * für das Liniendiagramm (E-68). Reine Logik ohne UI, von Main und Renderer genutzt.
 */

export interface OrtZeile {
  id: string;
  parent_id: string | null;
  name: string;
  reihenfolge: number;
}

export interface OrtMitEbene extends OrtZeile {
  ebene: number;
  /** z. B. „Bauabschnitt A › EG“ */
  pfad: string;
  /** erstes und letztes Blatt (0-basiert), das dieser Ort umfasst */
  blattVon: number;
  blattBis: number;
  hatKinder: boolean;
}

/** Orte in Baumreihenfolge mit Ebene, Pfad und überdeckten Blättern. */
export function ortsBaum(orte: readonly OrtZeile[]): OrtMitEbene[] {
  const kinder = new Map<string | null, OrtZeile[]>();
  for (const o of orte) {
    const p = o.parent_id && orte.some((x) => x.id === o.parent_id) ? o.parent_id : null;
    kinder.set(p, [...(kinder.get(p) ?? []), o]);
  }
  for (const l of kinder.values())
    l.sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de'));
  const ergebnis: OrtMitEbene[] = [];
  let blatt = 0;
  const gehe = (p: string | null, ebene: number, pfad: string) => {
    for (const o of kinder.get(p) ?? []) {
      const eigenerPfad = pfad ? `${pfad} › ${o.name}` : o.name;
      const eintrag: OrtMitEbene = {
        ...o,
        ebene,
        pfad: eigenerPfad,
        blattVon: blatt,
        blattBis: blatt,
        hatKinder: (kinder.get(o.id) ?? []).length > 0,
      };
      ergebnis.push(eintrag);
      if (eintrag.hatKinder) {
        gehe(o.id, ebene + 1, eigenerPfad);
        eintrag.blattBis = blatt - 1;
      } else blatt++;
    }
  };
  gehe(null, 0, '');
  return ergebnis;
}

/** Anzahl der Blätter (Zeilen/Spalten im Liniendiagramm). */
export function blattAnzahl(baum: readonly OrtMitEbene[]): number {
  return baum.reduce((n, o) => (o.hatKinder ? n : n + 1), 0);
}

/**
 * Bereich eines Vorgangs in Blatt-Koordinaten [0 … Blattanzahl]: von Beginn „Ort von“ bis Ende
 * „Ort bis“; liegt „bis“ vor „von“, läuft der Bereich rückwärts. null, wenn kein Ort gesetzt ist.
 */
export function ortsBereich(
  baum: readonly OrtMitEbene[],
  vonId: string | null,
  bisId: string | null,
): { start: number; ende: number } | null {
  const von = baum.find((o) => o.id === (vonId ?? bisId));
  const bis = baum.find((o) => o.id === (bisId ?? vonId));
  if (!von || !bis) return null;
  if (bis.blattVon >= von.blattVon)
    return { start: von.blattVon, ende: Math.max(von.blattBis, bis.blattBis) + 1 };
  // rückwärts (z. B. Rückbau von oben nach unten)
  return { start: von.blattBis + 1, ende: bis.blattVon };
}

/** Vorschlag für die Taktdauer (E-70): ⌈Dauer ÷ Anzahl Orte⌉, mindestens 1 AT. */
export function taktDauerVorschlag(dauer: number, orte: number): number {
  return Math.max(1, Math.ceil(dauer / Math.max(1, orte)));
}

/** Gewerk → feste Farbe für das Liniendiagramm (gleiches Gewerk, gleiche Farbe). */
const FARBEN = [
  '#1f5fa8',
  '#2e7d32',
  '#8e44ad',
  '#e07b00',
  '#00838f',
  '#6d4c41',
  '#c2185b',
  '#5d6d7e',
];
export function gewerkFarbe(gewerk: string): string {
  if (!gewerk.trim()) return '#4a4a46';
  let h = 0;
  for (const z of gewerk.trim().toLowerCase()) h = (h * 31 + z.charCodeAt(0)) >>> 0;
  return FARBEN[h % FARBEN.length] ?? '#4a4a46';
}
