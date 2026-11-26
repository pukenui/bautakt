/** Datentypen des BIM-Plugins, gemeinsam für Main und Renderer (E-37, E-86–E-89). */

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
  }[];
  bericht: string[];
}
