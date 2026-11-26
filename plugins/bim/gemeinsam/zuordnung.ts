/*
 * Zuordnung IFC → KG und Mengen (E-37, E-90–E-93). Reine Funktionen ohne Datenbank, gemeinsam
 * für Main (Dienst an Kosten), Renderer (Anzeige) und Tests.
 */

export type Mengenart = 'flaeche' | 'volumen' | 'laenge' | 'stueck';

export const MENGENARTEN: readonly Mengenart[] = ['flaeche', 'volumen', 'laenge', 'stueck'];

export const EINHEIT: Record<Mengenart, string> = {
  flaeche: 'm²',
  volumen: 'm³',
  laenge: 'm',
  stueck: 'Stk',
};

export const MENGENART_TEXT: Record<Mengenart, string> = {
  flaeche: 'Fläche',
  volumen: 'Volumen',
  laenge: 'Länge',
  stueck: 'Stück',
};

/** Eine Menge mit Herkunft (E-92): aus BaseQuantities (mit Name) oder aus der Geometrie. */
export interface Menge {
  wert: number;
  herkunft: 'qto' | 'geometrie';
  /** Name der BaseQuantity, z. B. „NetSideArea“ */
  name?: string;
}

/** Mengen eines Bauteils (Stück ist immer 1). */
export type Mengen = Partial<Record<'flaeche' | 'volumen' | 'laenge', Menge>>;

/** Reihenfolge der BaseQuantities je Mengenart (E-91). */
export const QTO_NAMEN: Record<'flaeche' | 'volumen' | 'laenge', readonly string[]> = {
  flaeche: [
    'NetSideArea',
    'NetArea',
    'GrossSideArea',
    'GrossArea',
    'Area',
    'NetFootprintArea',
    'GrossFootprintArea',
  ],
  volumen: ['NetVolume', 'GrossVolume', 'Volume'],
  laenge: ['Length'],
};

/** Was die Regeln von einem Bauteil brauchen. */
export interface BauteilMerkmale {
  klasse: string;
  name: string;
  typ: string;
  predefined: string;
  /** IsExternal: 1 ja, 0 nein, null unbekannt */
  aussen: number | null;
  /** LoadBearing: 1 ja, 0 nein, null unbekannt */
  tragend: number | null;
}

export interface Regel {
  klasse: string;
  /** leer = beliebig */
  predefined: string;
  /** null = beliebig */
  aussen: number | null;
  tragend: number | null;
  /** „Name/Typ enthält“, leer = beliebig (ohne Groß-/Kleinschreibung) */
  enthaelt: string;
  kg: number;
  mengenart: Mengenart;
}

/** Manuelle Zuordnung je Bauteil: kg null = keiner KG zuordnen. */
export interface Ueberschreibung {
  kg: number | null;
  mengenart: Mengenart;
}

/**
 * Standardregeln (E-90): nur eindeutige Zuordnungen; die erste passende Regel gilt. Unklare Fälle
 * (z. B. Treppen, Geländer) bleiben ohne Regel und werden in der Tabelle ergänzt.
 */
export const STANDARD_REGELN: readonly Omit<Regel, 'enthaelt'>[] = [
  { klasse: 'IfcWall', predefined: '', aussen: 1, tragend: 0, kg: 332, mengenart: 'flaeche' },
  { klasse: 'IfcWall', predefined: '', aussen: 1, tragend: null, kg: 331, mengenart: 'flaeche' },
  { klasse: 'IfcWall', predefined: '', aussen: null, tragend: 1, kg: 341, mengenart: 'flaeche' },
  { klasse: 'IfcWall', predefined: '', aussen: null, tragend: null, kg: 342, mengenart: 'flaeche' },
  {
    klasse: 'IfcCurtainWall',
    predefined: '',
    aussen: null,
    tragend: null,
    kg: 337,
    mengenart: 'flaeche',
  },
  { klasse: 'IfcColumn', predefined: '', aussen: 1, tragend: null, kg: 333, mengenart: 'stueck' },
  {
    klasse: 'IfcColumn',
    predefined: '',
    aussen: null,
    tragend: null,
    kg: 343,
    mengenart: 'stueck',
  },
  { klasse: 'IfcWindow', predefined: '', aussen: 0, tragend: null, kg: 344, mengenart: 'flaeche' },
  {
    klasse: 'IfcWindow',
    predefined: '',
    aussen: null,
    tragend: null,
    kg: 334,
    mengenart: 'flaeche',
  },
  { klasse: 'IfcDoor', predefined: '', aussen: 1, tragend: null, kg: 334, mengenart: 'flaeche' },
  { klasse: 'IfcDoor', predefined: '', aussen: null, tragend: null, kg: 344, mengenart: 'flaeche' },
  {
    klasse: 'IfcFooting',
    predefined: '',
    aussen: null,
    tragend: null,
    kg: 322,
    mengenart: 'volumen',
  },
  { klasse: 'IfcPile', predefined: '', aussen: null, tragend: null, kg: 323, mengenart: 'stueck' },
  {
    klasse: 'IfcSlab',
    predefined: 'BASESLAB',
    aussen: null,
    tragend: null,
    kg: 322,
    mengenart: 'flaeche',
  },
  {
    klasse: 'IfcSlab',
    predefined: 'ROOF',
    aussen: null,
    tragend: null,
    kg: 361,
    mengenart: 'flaeche',
  },
  { klasse: 'IfcSlab', predefined: '', aussen: null, tragend: null, kg: 351, mengenart: 'flaeche' },
  { klasse: 'IfcRoof', predefined: '', aussen: null, tragend: null, kg: 361, mengenart: 'flaeche' },
  { klasse: 'IfcBeam', predefined: '', aussen: null, tragend: null, kg: 351, mengenart: 'laenge' },
  {
    klasse: 'IfcCovering',
    predefined: 'ROOFING',
    aussen: null,
    tragend: null,
    kg: 363,
    mengenart: 'flaeche',
  },
  {
    klasse: 'IfcCovering',
    predefined: 'FLOORING',
    aussen: null,
    tragend: null,
    kg: 353,
    mengenart: 'flaeche',
  },
  {
    klasse: 'IfcCovering',
    predefined: 'CEILING',
    aussen: null,
    tragend: null,
    kg: 354,
    mengenart: 'flaeche',
  },
  {
    klasse: 'IfcCovering',
    predefined: 'CLADDING',
    aussen: 1,
    tragend: null,
    kg: 335,
    mengenart: 'flaeche',
  },
  {
    klasse: 'IfcCovering',
    predefined: 'CLADDING',
    aussen: null,
    tragend: null,
    kg: 345,
    mengenart: 'flaeche',
  },
];

/** Klasse passt, wenn sie gleich ist oder eine Unterklasse mit Namenszusatz (IfcWallStandardCase). */
function klassePasst(regel: string, klasse: string): boolean {
  const r = regel.trim().toLowerCase();
  const k = klasse.toLowerCase();
  if (!r) return false;
  if (k === r) return true;
  // Unterklassen der IFC-Schemata tragen den Namen der Oberklasse plus Zusatz
  return k.startsWith(r) && /^(standardcase|elementedcase|flight|part)/.test(k.slice(r.length));
}

export function regelPasst(r: Regel, b: BauteilMerkmale): boolean {
  if (b.klasse === 'IfcSpace') return false;
  if (!klassePasst(r.klasse, b.klasse)) return false;
  if (r.predefined.trim() && r.predefined.trim().toUpperCase() !== b.predefined.toUpperCase())
    return false;
  if (r.aussen !== null && b.aussen !== r.aussen) return false;
  if (r.tragend !== null && b.tragend !== r.tragend) return false;
  const t = r.enthaelt.trim().toLowerCase();
  if (t && !`${b.name}\n${b.typ}`.toLowerCase().includes(t)) return false;
  return true;
}

export interface Zuordnung {
  kg: number | null;
  mengenart: Mengenart | null;
  /** Index der Regel (0-basiert), null bei Überschreibung oder ohne Treffer */
  regel: number | null;
  manuell: boolean;
}

/** KG eines Bauteils: Überschreibung, sonst erste passende Regel (E-90). */
export function zuordnen(
  b: BauteilMerkmale,
  regeln: readonly Regel[],
  ueberschreibung?: Ueberschreibung,
): Zuordnung {
  if (ueberschreibung)
    return {
      kg: ueberschreibung.kg,
      mengenart: ueberschreibung.kg === null ? null : ueberschreibung.mengenart,
      regel: null,
      manuell: true,
    };
  const i = regeln.findIndex((r) => regelPasst(r, b));
  const r = regeln[i];
  return r
    ? { kg: r.kg, mengenart: r.mengenart, regel: i, manuell: false }
    : { kg: null, mengenart: null, regel: null, manuell: false };
}

/** Menge eines Bauteils für eine Mengenart (null = keine passende Menge). */
export function mengeFuer(m: Mengen, art: Mengenart): Menge | null {
  if (art === 'stueck') return { wert: 1, herkunft: 'geometrie' };
  return m[art] ?? null;
}

/** Liegt `kg` in der Gruppe `oben` (gleich oder Unter-KG)? */
export function inKg(kg: number, oben: number): boolean {
  if (kg === oben) return true;
  if (oben % 100 === 0) return Math.floor(kg / 100) === oben / 100;
  if (oben % 10 === 0) return Math.floor(kg / 10) === oben / 10;
  return false;
}

/** Modellmenge einer KG für die Kosten (E-93). */
export interface KgMenge {
  kg: number;
  menge: number | null;
  einheit: string;
  mengenart: Mengenart | null;
  /** zugeordnete Bauteile (alle Mengenarten) */
  anzahl: number;
  /** davon gezählt */
  gezaehlt: number;
  ausQto: number;
  ausGeometrie: number;
  /** Bauteile ohne passende Menge */
  ohneMenge: number;
  /** Bauteile mit anderer Mengenart (nicht gezählt) */
  andereArt: number;
}

export interface BauteilMitZuordnung {
  zuordnung: Zuordnung;
  mengen: Mengen;
}

/** Summe je KG (einschließlich Unter-KG) in der häufigsten Mengenart. */
export function kgMenge(kg: number, bauteile: readonly BauteilMitZuordnung[]): KgMenge {
  const treffer = bauteile.filter((b) => b.zuordnung.kg !== null && inKg(b.zuordnung.kg, kg));
  const haeufigkeit = new Map<Mengenart, number>();
  for (const b of treffer) {
    const a = b.zuordnung.mengenart;
    if (a) haeufigkeit.set(a, (haeufigkeit.get(a) ?? 0) + 1);
  }
  // häufigste Mengenart; bei Gleichstand die frühere in MENGENARTEN
  let art: Mengenart | null = null;
  for (const a of MENGENARTEN)
    if ((haeufigkeit.get(a) ?? 0) > (art ? (haeufigkeit.get(art) ?? 0) : 0)) art = a;
  let summe = 0;
  let gezaehlt = 0;
  let ausQto = 0;
  let ausGeometrie = 0;
  let ohneMenge = 0;
  let andereArt = 0;
  for (const b of treffer) {
    if (b.zuordnung.mengenart !== art || !art) {
      andereArt++;
      continue;
    }
    const m = mengeFuer(b.mengen, art);
    if (!m) {
      ohneMenge++;
      continue;
    }
    summe += m.wert;
    gezaehlt++;
    if (art !== 'stueck') {
      if (m.herkunft === 'qto') ausQto++;
      else ausGeometrie++;
    }
  }
  return {
    kg,
    menge: gezaehlt > 0 ? Math.round(summe * 1000) / 1000 : null,
    einheit: art ? EINHEIT[art] : '',
    mengenart: art,
    anzahl: treffer.length,
    gezaehlt,
    ausQto,
    ausGeometrie,
    ohneMenge,
    andereArt,
  };
}

/** Hinweise zur Modellmenge einer Kostenzeile (E-93). */
export function kgMengeHinweise(m: KgMenge, zeilenEinheit: string): string[] {
  const h: string[] = [];
  if (m.anzahl === 0) return [`Im Modell ist kein Bauteil der KG ${m.kg} zugeordnet.`];
  if (m.ohneMenge)
    h.push(
      `${m.ohneMenge} Bauteil(e) ohne ${m.mengenart ? MENGENART_TEXT[m.mengenart] : 'Menge'} nicht gezählt.`,
    );
  if (m.andereArt) h.push(`${m.andereArt} Bauteil(e) mit anderer Mengenart nicht gezählt.`);
  const e = zeilenEinheit.trim();
  if (e && m.einheit && !e.startsWith(m.einheit))
    h.push(`Einheit der Zeile (${e}) passt nicht zur Modellmenge (${m.einheit}).`);
  return h;
}
