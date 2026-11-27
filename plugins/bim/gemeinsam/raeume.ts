/*
 * Räume (IfcSpace) → Kategorie nach DIN 277 (E-94). Reine Funktionen, gemeinsam für Main,
 * Renderer und Tests.
 */

export const RAUM_KATEGORIEN = [
  'NUF1',
  'NUF2',
  'NUF3',
  'NUF4',
  'NUF5',
  'NUF6',
  'NUF7',
  'TF',
  'VF',
] as const;
export type RaumKategorie = (typeof RAUM_KATEGORIEN)[number];

export const RAUM_KATEGORIE_TEXT: Record<RaumKategorie, string> = {
  NUF1: 'NUF 1 Wohnen und Aufenthalt',
  NUF2: 'NUF 2 Büroarbeit',
  NUF3: 'NUF 3 Produktion, Hand- und Maschinenarbeit, Forschung',
  NUF4: 'NUF 4 Lagern, Verteilen und Verkaufen',
  NUF5: 'NUF 5 Bildung, Unterricht und Kultur',
  NUF6: 'NUF 6 Heilen und Pflegen',
  NUF7: 'NUF 7 Sonstige Nutzungen',
  TF: 'TF Technikfläche',
  VF: 'VF Verkehrsfläche',
};

export interface RaumRegel {
  /** Suchtexte, durch Komma getrennt (einer genügt); leer = jeder Raum */
  enthaelt: string;
  kategorie: RaumKategorie;
}

/** Was die Raumregeln von einem Raum sehen: Name, Langname, Typ und Eigenschaftswerte. */
export interface RaumMerkmale {
  name: string;
  langname: string;
  typ: string;
  texte: string;
}

/**
 * Standardregeln (E-94): nur eindeutige Begriffe, deutsch und englisch; zuletzt „sonst“ → NUF 1.
 * Die Tabelle ist je Projekt änderbar.
 */
export const STANDARD_RAUMREGELN: readonly RaumRegel[] = [
  {
    enthaelt:
      'Flur, Diele, Treppe, Aufzug, Eingang, Foyer, Windfang, Corridor, Hallway, Stair, Elevator, Lift, Lobby, Entrance',
    kategorie: 'VF',
  },
  {
    enthaelt:
      'Technik, Heizung, Hausanschluss, Lüftung, Elektro, Mechanical, Technical, Plant room, Boiler',
    kategorie: 'TF',
  },
  {
    enthaelt: 'WC, Toilette, Sanitär, Dusche, Umkleide, Toilet, Restroom, Shower',
    kategorie: 'NUF7',
  },
  { enthaelt: 'Büro, Besprechung, Office, Meeting', kategorie: 'NUF2' },
  {
    enthaelt: 'Wohnen, Schlafen, Küche, Essen, Kinder, Living, Bedroom, Kitchen, Dining, Study',
    kategorie: 'NUF1',
  },
  { enthaelt: '', kategorie: 'NUF1' },
];

const woerter = (t: string) =>
  t
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

export function raumRegelPasst(r: RaumRegel, raum: RaumMerkmale): boolean {
  const suche = woerter(r.enthaelt);
  if (suche.length === 0) return true;
  const text = `${raum.name}\n${raum.langname}\n${raum.typ}\n${raum.texte}`.toLowerCase();
  // am Wortanfang, damit z. B. „Essen“ nicht in „Messen“ passt
  return suche.some((w) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(text),
  );
}

export interface RaumZuordnung {
  kategorie: RaumKategorie | null;
  /** Index der Regel (0-basiert); null bei Zuordnung von Hand oder ohne Treffer */
  regel: number | null;
  manuell: boolean;
}

/** Kategorie eines Raums: Zuordnung von Hand (null = nicht zählen), sonst erste passende Regel. */
export function raumZuordnen(
  raum: RaumMerkmale,
  regeln: readonly RaumRegel[],
  vonHand?: { kategorie: RaumKategorie | null },
): RaumZuordnung {
  if (vonHand) return { kategorie: vonHand.kategorie, regel: null, manuell: true };
  const i = regeln.findIndex((r) => raumRegelPasst(r, raum));
  const r = regeln[i];
  return r
    ? { kategorie: r.kategorie, regel: i, manuell: false }
    : { kategorie: null, regel: null, manuell: false };
}

/** Flächensummen je Kategorie in m² (gerundet auf 0,001); Räume ohne Fläche zählen in `ohneFlaeche`. */
export function flaechenSummen(
  raeume: readonly { kategorie: RaumKategorie | null; flaeche: number | null }[],
): {
  je: Partial<Record<RaumKategorie, number>>;
  anzahl: Partial<Record<RaumKategorie, number>>;
  ohneFlaeche: number;
} {
  const je: Partial<Record<RaumKategorie, number>> = {};
  const anzahl: Partial<Record<RaumKategorie, number>> = {};
  let ohneFlaeche = 0;
  for (const r of raeume) {
    if (!r.kategorie) continue;
    if (r.flaeche === null) {
      ohneFlaeche++;
      continue;
    }
    je[r.kategorie] = Math.round(((je[r.kategorie] ?? 0) + r.flaeche) * 1000) / 1000;
    anzahl[r.kategorie] = (anzahl[r.kategorie] ?? 0) + 1;
  }
  return { je, anzahl, ohneFlaeche };
}
