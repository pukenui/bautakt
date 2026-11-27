import type { Mengen, Mengenart } from './zuordnung.js';

/** Datentypen des BIM-Plugins, gemeinsam für Main und Renderer (E-37, E-86–E-93). */

/** Eingebettetes IFC-Modell (b_modell). Die Datei selbst liegt in der Dateiablage des Kerns. */
export interface ModellZeile {
  id: string;
  name: string;
  dateiname: string;
  ifc_schema: string;
  hash: string;
  groesse: number;
  eingelesen: string; // UTC
  reihenfolge: number;
  anzahl: number; // Bauteile (berechnet)
}

/** Geschoss eines Modells (IfcBuildingStorey). */
export interface GeschossZeile {
  id: string;
  modell_id: string;
  express_id: number;
  name: string;
  /** Höhe laut IFC (Elevation) in m, falls angegeben */
  hoehe: number | null;
  reihenfolge: number;
}

/** Bauteil (IfcElement oder IfcSpace) eines Modells. */
export interface BauteilZeile {
  id: string;
  modell_id: string;
  express_id: number;
  globalid: string;
  klasse: string; // z. B. "IfcWall"
  name: string;
  typ: string; // Typname (IfcRelDefinesByType) oder ObjectType
  geschoss_id: string | null;
  predefined: string;
  /** IsExternal: 1/0, null unbekannt */
  aussen: number | null;
  /** LoadBearing: 1/0, null unbekannt */
  tragend: number | null;
  /** Mengen mit Herkunft (E-92); null bei Modellen, die vor B2 eingelesen wurden */
  mengen: Mengen | null;
  /** LongName (vor allem Räume) */
  langname: string;
  /** Räume: Textwerte der Eigenschaften (für Raumregeln, E-94) */
  texte: string;
  /** Zonen (IfcZone, E-102); [] bei Modellen vor B4 */
  zonen: string[];
}

/** Regel IFC → KG (b_kg_regel, E-90). */
export interface RegelZeile {
  id: string;
  reihenfolge: number;
  klasse: string;
  predefined: string;
  aussen: number | null;
  tragend: number | null;
  enthaelt: string;
  kg: number;
  mengenart: Mengenart;
}

/** Manuelle Zuordnung je Bauteil (b_kg_zuweisung, über GlobalId). */
export interface ZuweisungZeile {
  id: string;
  modell_id: string;
  globalid: string;
  kg: number | null;
  mengenart: Mengenart;
}

export interface Eigenschaft {
  name: string;
  wert: string;
}

/** Gruppe in der Eigenschaften-Leiste: Attribute, Typ, Pset oder Mengen (BaseQuantities). */
export interface EigenschaftsGruppe {
  titel: string;
  art: 'attribute' | 'typ' | 'pset' | 'mengen';
  werte: Eigenschaft[];
}

/** Ergebnis des Einlesens (vor dem Befehl): ohne IDs der Projektdatei. */
export interface ModellInhalt {
  schema: string;
  geschosse: { express_id: number; name: string; hoehe: number | null }[];
  bauteile: {
    express_id: number;
    globalid: string;
    klasse: string;
    name: string;
    typ: string;
    /** express_id des Geschosses oder null */
    geschoss: number | null;
    predefined: string;
    aussen: number | null;
    tragend: number | null;
    mengen: Mengen;
    langname: string;
    texte: string;
    /** Namen der Zonen (IfcZone, E-102) */
    zonen: string[];
  }[];
  bericht: string[];
}

/** Änderungsbericht beim Neu-Einlesen (E-96). */
export interface Aenderungsbericht {
  modellId: string;
  modellName: string;
  dateiname: string;
  neu: { globalid: string; klasse: string; name: string }[];
  entfernt: { globalid: string; klasse: string; name: string }[];
  geaendert: { globalid: string; klasse: string; name: string; was: string[] }[];
  /** Kostenzeilen mit Menge aus dem Modell */
  kosten: { kg: number; einheit: string; alt: number | null; neu: number | null }[];
  /** Flächen aus dem Modell (DIN 277) */
  flaechen: { kategorie: string; alt: number | null; neu: number | null }[];
  /** Vorgänge, deren verknüpfte Bauteile entfernt oder geändert werden (4D, E-101) */
  vorgaenge: { plan: string; nr: string; name: string; entfernt: number; geaendert: number }[];
  /** manuelle Zuordnungen, deren Bauteil nicht mehr im Modell ist */
  zuordnungenOhneBauteil: number;
}
