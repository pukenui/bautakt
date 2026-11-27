import * as W from 'web-ifc';
import type { EigenschaftsGruppe, ModellInhalt } from '../gemeinsam/typen.js';
import { QTO_NAMEN, type Mengen } from '../gemeinsam/zuordnung.js';

/*
 * IFC lesen im Main-Prozess (E-37, E-87): Bauteile, Geschosse und – bei Bedarf – Eigenschaften.
 * Die Geometrie erzeugt der Renderer selbst (Worker).
 */

/** Unterstützte Schemata (E-37: IFC2x3 und IFC4; IFC4.3 später). */
export const SCHEMATA = ['IFC2X3', 'IFC4'] as const;

/** Klassen, die keine Bauteile sind (räumliche Struktur, Öffnungen, Hilfsobjekte). */
const KEINE_BAUTEILE = new Set([
  'IfcProject',
  'IfcSite',
  'IfcBuilding',
  'IfcBuildingStorey',
  'IfcSpatialZone',
  'IfcExternalSpatialElement',
  'IfcOpeningElement',
  'IfcOpeningStandardCase',
  'IfcVirtualElement',
  'IfcGrid',
  'IfcAnnotation',
  'IfcFacility',
  'IfcFacilityPart',
]);

let api: W.IfcAPI | undefined;
let start: Promise<W.IfcAPI> | undefined;

/** web-ifc einmal je Prozess starten. */
export function ifcApi(): Promise<W.IfcAPI> {
  start ??= (async () => {
    const a = new W.IfcAPI();
    await a.Init(undefined, true);
    a.SetLogLevel(W.LogLevel.LOG_LEVEL_OFF);
    api = a;
    return a;
  })();
  return start;
}

/** Wert eines IFC-Attributs (Objekt mit value) als Rohwert. */
function roh(a: unknown): unknown {
  if (a === null || a === undefined) return null;
  if (typeof a !== 'object') return a;
  const o = a as { value?: unknown; _representationValue?: unknown };
  return o.value ?? o._representationValue ?? null;
}

function text(a: unknown): string {
  const v = roh(a);
  return v === null || v === undefined ? '' : String(v).trim();
}

const zahl = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });

/** Anzeigeform eines Eigenschaftswerts (deutsches Zahlenformat, Wahrheitswerte als ja/nein). */
function anzeigen(a: unknown): string {
  const v = roh(a);
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return zahl.format(v);
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  const s = String(v);
  if (s === 'T' || s === 'TRUE' || s === '.T.') return 'ja';
  if (s === 'F' || s === 'FALSE' || s === '.F.') return 'nein';
  return s;
}

/** Umrechnungsfaktoren der Projekteinheiten auf m, m², m³ und kg. */
export interface Einheiten {
  laenge: number;
  flaeche: number;
  volumen: number;
  masse: number;
}

const PRAEFIX: Record<string, number> = {
  EXA: 1e18,
  PETA: 1e15,
  TERA: 1e12,
  GIGA: 1e9,
  MEGA: 1e6,
  KILO: 1e3,
  HECTO: 1e2,
  DECA: 1e1,
  DECI: 1e-1,
  CENTI: 1e-2,
  MILLI: 1e-3,
  MICRO: 1e-6,
  NANO: 1e-9,
};

export function einheitenLesen(a: W.IfcAPI, m: number): Einheiten {
  const e: Einheiten = { laenge: 1, flaeche: 1, volumen: 1, masse: 1 };
  const projekt = a.GetLineIDsWithType(m, W.IFCPROJECT);
  if (projekt.size() === 0) return e;
  const p = a.GetLine(m, projekt.get(0)) as { UnitsInContext?: { value: number } | null };
  if (!p.UnitsInContext) return e;
  const zuweisung = a.GetLine(m, p.UnitsInContext.value, true) as {
    Units?: Record<string, unknown>[];
  };
  const siFaktor = (u: Record<string, unknown>): number => {
    const praefix = text(u['Prefix']);
    const basis = praefix ? (PRAEFIX[praefix] ?? 1) : 1;
    const name = text(u['Name']);
    // Masse: SI-Basis ist das Gramm (mit Präfix KILO → kg)
    return name === 'GRAM' ? basis / 1000 : basis;
  };
  for (const u of zuweisung.Units ?? []) {
    const art = text(u['UnitType']);
    let f: number;
    if (u['ConversionFactor']) {
      // umgerechnete Einheit (z. B. FOOT): Faktor × SI-Einheit
      const cf = u['ConversionFactor'] as Record<string, unknown>;
      const komponente = cf['UnitComponent'] as Record<string, unknown> | undefined;
      f = Number(roh(cf['ValueComponent'])) * (komponente ? siFaktor(komponente) : 1);
    } else f = siFaktor(u);
    if (!Number.isFinite(f) || f <= 0) continue;
    if (art === 'LENGTHUNIT') e.laenge = f;
    else if (art === 'AREAUNIT') e.flaeche = f;
    else if (art === 'VOLUMEUNIT') e.volumen = f;
    else if (art === 'MASSUNIT') e.masse = f;
  }
  return e;
}

/** Klassennamen (z. B. „IfcWall“) je Typcode eines Modells. */
function klassenNamen(a: W.IfcAPI, m: number): Map<number, string> {
  return new Map(a.GetAllTypesOfModel(m).map((t) => [t.typeID, t.typeName]));
}

function ids(v: W.Vector<number>): number[] {
  const r: number[] = [];
  for (let i = 0; i < v.size(); i++) r.push(v.get(i));
  return r;
}

const verweise = (a: unknown): number[] =>
  Array.isArray(a) ? a.map((x) => Number(roh(x))).filter(Number.isFinite) : [];

/** Liest Schema, Geschosse und Bauteile eines IFC-Modells. */
export function modellAuslesen(a: W.IfcAPI, inhalt: Uint8Array): ModellInhalt {
  const m = a.OpenModel(inhalt, { COORDINATE_TO_ORIGIN: true });
  try {
    const schema = a.GetModelSchema(m) ?? '';
    const bericht: string[] = [];
    const einheiten = einheitenLesen(a, m);

    // Geschosse
    const geschosse = ids(a.GetLineIDsWithType(m, W.IFCBUILDINGSTOREY)).map((id) => {
      const g = a.GetLine(m, id) as Record<string, unknown>;
      const hoehe = roh(g['Elevation']);
      return {
        express_id: id,
        name: text(g['Name']) || text(g['LongName']) || `Geschoss ${id}`,
        hoehe:
          typeof hoehe === 'number' ? Math.round(hoehe * einheiten.laenge * 1000) / 1000 : null,
      };
    });
    geschosse.sort((x, y) => (x.hoehe ?? 0) - (y.hoehe ?? 0));
    const istGeschoss = new Set(geschosse.map((g) => g.express_id));

    // Struktur: Enthaltensein (Element → Raumstruktur) und Zerlegung (Teil → Ganzes)
    const eltern = new Map<number, number>();
    for (const r of ids(a.GetLineIDsWithType(m, W.IFCRELCONTAINEDINSPATIALSTRUCTURE))) {
      const rel = a.GetLine(m, r) as Record<string, unknown>;
      const ziel = Number(roh(rel['RelatingStructure']));
      for (const e of verweise(rel['RelatedElements'])) eltern.set(e, ziel);
    }
    for (const r of ids(a.GetLineIDsWithType(m, W.IFCRELAGGREGATES))) {
      const rel = a.GetLine(m, r) as Record<string, unknown>;
      const ganzes = Number(roh(rel['RelatingObject']));
      for (const t of verweise(rel['RelatedObjects'])) if (!eltern.has(t)) eltern.set(t, ganzes);
    }
    const geschossVon = (id: number): number | null => {
      for (let n = 0, x: number | undefined = eltern.get(id); x !== undefined && n < 50; n++) {
        if (istGeschoss.has(x)) return x;
        x = eltern.get(x);
      }
      return null;
    };

    // Typen (Name, PredefinedType, Psets des Typs)
    const typVon = new Map<number, Record<string, unknown>>();
    for (const r of ids(a.GetLineIDsWithType(m, W.IFCRELDEFINESBYTYPE))) {
      const rel = a.GetLine(m, r) as Record<string, unknown>;
      const typ = a.GetLine(m, Number(roh(rel['RelatingType']))) as Record<string, unknown>;
      for (const e of verweise(rel['RelatedObjects'])) typVon.set(e, typ);
    }

    // Eigenschaften und Mengen je Element (IfcRelDefinesByProperties)
    const defs = new Map<number, number[]>();
    for (const r of ids(a.GetLineIDsWithType(m, W.IFCRELDEFINESBYPROPERTIES))) {
      const rel = a.GetLine(m, r) as Record<string, unknown>;
      const def = Number(roh(rel['RelatingPropertyDefinition']));
      for (const e of verweise(rel['RelatedObjects'])) defs.set(e, [...(defs.get(e) ?? []), def]);
    }
    const geometrie = geometrieMengen(a, m);
    // Werte je Eigenschaftssatz einmal lesen (Typ-Psets gelten für viele Elemente)
    const psetZwischen = new Map<number, Map<string, string>>();
    const psetWerte = (def: number): Map<string, string> => {
      let w = psetZwischen.get(def);
      if (!w) {
        const ps = a.GetLine(m, def, true) as Record<string, unknown>;
        w = new Map(
          ((ps['HasProperties'] as Record<string, unknown>[] | undefined) ?? []).map((p) => [
            text(p['Name']),
            anzeigen(p['NominalValue']),
          ]),
        );
        psetZwischen.set(def, w);
      }
      return w;
    };

    // Bauteile: alle IfcElement-Klassen außer Hilfsobjekten, dazu Räume (IfcSpace)
    const klassen = klassenNamen(a, m);
    const bauteile: ModellInhalt['bauteile'] = [];
    let ausQto = 0;
    let ausGeometrie = 0;
    for (const [code, klasse] of klassen) {
      if (!a.IsIfcElement(code) || KEINE_BAUTEILE.has(klasse)) continue;
      for (const id of ids(a.GetLineIDsWithType(m, code))) {
        const e = a.GetLine(m, id) as Record<string, unknown>;
        const typ = typVon.get(id);
        const d = [...(defs.get(id) ?? []), ...verweise(typ?.['HasPropertySets'])];
        const merkmal = (name: string): number | null => {
          // Element vor Typ: Element-Psets stehen zuerst in d
          for (const def of d) {
            const v = psetWerte(def).get(name);
            if (v === 'ja') return 1;
            if (v === 'nein') return 0;
          }
          return null;
        };
        const raum = klasse === 'IfcSpace';
        const qto = qtoMengen(a, m, defs.get(id) ?? [], einheiten, raum);
        const geo = geometrie.get(id);
        const mengen: Mengen = {};
        for (const art of ['flaeche', 'volumen', 'laenge'] as const) {
          const q = qto[art];
          const g =
            art === 'flaeche'
              ? raum
                ? geo?.grundflaeche
                : geo?.flaeche
              : art === 'volumen'
                ? geo?.volumen
                : undefined;
          if (q) mengen[art] = q;
          else if (g !== undefined && g > 0) mengen[art] = { wert: g, herkunft: 'geometrie' };
        }
        if (qto.flaeche || qto.volumen || qto.laenge) ausQto++;
        else if (mengen.flaeche || mengen.volumen) ausGeometrie++;
        const pre = text(e['PredefinedType']);
        bauteile.push({
          express_id: id,
          globalid: text(e['GlobalId']),
          klasse,
          name: text(e['Name']),
          typ: (typ ? text(typ['Name']) : '') || text(e['ObjectType']),
          geschoss: geschossVon(id),
          predefined:
            pre && pre !== 'NOTDEFINED' && pre !== 'USERDEFINED'
              ? pre
              : text(typ?.['PredefinedType']).replace(/^(NOTDEFINED|USERDEFINED)$/, ''),
          aussen: merkmal('IsExternal'),
          tragend: merkmal('LoadBearing'),
          mengen,
          langname: text(e['LongName']),
          // Räume: alle Textwerte ihrer Eigenschaften, für „enthält“ in den Raumregeln (E-94)
          texte: raum
            ? [...new Set(d.flatMap((def) => [...psetWerte(def).values()]))]
                .filter((v) => v && !/^[\d.,\s-]+$/.test(v) && v !== 'ja' && v !== 'nein')
                .join(', ')
                .slice(0, 500)
            : '',
        });
      }
    }
    bauteile.sort((x, y) => x.express_id - y.express_id);
    const ohneGeschoss = bauteile.filter((b) => b.geschoss === null).length;
    if (ohneGeschoss) bericht.push(`${ohneGeschoss} Bauteil(e) ohne Geschoss-Zuordnung.`);
    const doppelt = bauteile.length - new Set(bauteile.map((b) => b.globalid)).size;
    if (doppelt) bericht.push(`${doppelt} Bauteil(e) mit doppelter GlobalId.`);
    bericht.push(
      `Mengen: ${ausQto} Bauteil(e) mit BaseQuantities, ${ausGeometrie} nur aus der Geometrie.`,
    );
    return { schema, geschosse, bauteile, bericht };
  } finally {
    a.CloseModel(m);
  }
}

/** BaseQuantities eines Elements in SI-Einheiten, je Mengenart die erste nach E-91. */
/** Grundfläche von Räumen aus BaseQuantities (E-94). */
const RAUM_FLAECHE = ['NetFloorArea', 'GrossFloorArea'] as const;

function qtoMengen(
  a: W.IfcAPI,
  m: number,
  defs: readonly number[],
  e: Einheiten,
  raum = false,
): Mengen {
  const gefunden = new Map<string, number>();
  for (const def of defs) {
    const d = a.GetLine(m, def, true) as Record<string, unknown>;
    for (const q of (d['Quantities'] as Record<string, unknown>[] | undefined) ?? []) {
      const name = text(q['Name']);
      const felder: [string, number][] = [
        ['LengthValue', e.laenge],
        ['AreaValue', e.flaeche],
        ['VolumeValue', e.volumen],
      ];
      for (const [feld, faktor] of felder) {
        const v = roh(q[feld]);
        if (typeof v === 'number' && !gefunden.has(name)) gefunden.set(name, v * faktor);
      }
    }
  }
  const r: Mengen = {};
  for (const art of ['flaeche', 'volumen', 'laenge'] as const)
    for (const name of art === 'flaeche' && raum ? RAUM_FLAECHE : QTO_NAMEN[art]) {
      const v = gefunden.get(name);
      if (v !== undefined && v > 0) {
        r[art] = { wert: Math.round(v * 1000) / 1000, herkunft: 'qto', name };
        break;
      }
    }
  return r;
}

/**
 * Mengen aus der Geometrie (E-92): Volumen aus dem Netz (Summe der Tetraeder) und Hauptfläche =
 * Fläche der größten Ansichtsseite (größte Projektion einer Seite auf eine Ebene).
 */
export function geometrieMengen(
  a: W.IfcAPI,
  m: number,
): Map<number, { volumen: number; flaeche: number; grundflaeche: number }> {
  const dreiecke = new Map<number, number[]>(); // je Element: x1,y1,z1,x2,…
  a.StreamAllMeshes(m, (mesh) => {
    const liste = dreiecke.get(mesh.expressID) ?? [];
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const pg = mesh.geometries.get(i);
      if (pg.geomType !== 0) continue;
      const g = a.GetGeometry(m, pg.geometryExpressID);
      const v = a.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const ix = a.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
      const t = pg.flatTransformation;
      const p = (k: number): [number, number, number] => {
        const x = v[k * 6] ?? 0;
        const y = v[k * 6 + 1] ?? 0;
        const z = v[k * 6 + 2] ?? 0;
        return [0, 1, 2].map(
          (c) => (t[c] ?? 0) * x + (t[4 + c] ?? 0) * y + (t[8 + c] ?? 0) * z + (t[12 + c] ?? 0),
        ) as [number, number, number];
      };
      for (let j = 0; j + 2 < ix.length; j += 3)
        liste.push(...p(ix[j] ?? 0), ...p(ix[j + 1] ?? 0), ...p(ix[j + 2] ?? 0));
      g.delete();
    }
    dreiecke.set(mesh.expressID, liste);
  });
  const ergebnis = new Map<number, { volumen: number; flaeche: number; grundflaeche: number }>();
  for (const [id, d] of dreiecke) ergebnis.set(id, netzMengen(d));
  return ergebnis;
}

/** Volumen und Hauptfläche eines Dreiecksnetzes (Koordinaten je Dreieck hintereinander). */
export function netzMengen(d: readonly number[]): {
  volumen: number;
  flaeche: number;
  grundflaeche: number;
} {
  let vol = 0;
  const flaechen: { n: [number, number, number]; a: number }[] = [];
  for (let i = 0; i + 8 < d.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = d.slice(i, i + 9) as number[] as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    // Volumen über Tetraeder zum Ursprung (Vorzeichen hebt sich bei geschlossenen Netzen auf)
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l > 1e-12) flaechen.push({ n: [nx / l, ny / l, nz / l], a: l / 2 });
  }
  // Kandidaten für die Blickrichtung: Achsen und die Normalen der größten Dreiecke
  const kandidaten: [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
    ...[...flaechen]
      .sort((x, y) => y.a - x.a)
      .slice(0, 12)
      .map((f) => f.n),
  ];
  let flaeche = 0;
  for (const k of kandidaten) {
    let s = 0;
    for (const f of flaechen) {
      const c = f.n[0] * k[0] + f.n[1] * k[1] + f.n[2] * k[2];
      if (c > 0) s += f.a * c;
    }
    flaeche = Math.max(flaeche, s);
  }
  // Grundfläche: Projektion von oben (web-ifc liefert y nach oben)
  let grund = 0;
  for (const f of flaechen) if (f.n[1] > 0) grund += f.a * f.n[1];
  const runden = (x: number) => Math.round(x * 1000) / 1000;
  return { volumen: runden(Math.abs(vol)), flaeche: runden(flaeche), grundflaeche: runden(grund) };
}

/** Geöffnetes Modell mit Verweisen Element → Eigenschaftsdefinitionen (für die Eigenschaften-Leiste). */
interface Geoeffnet {
  m: number;
  einheiten: Einheiten;
  psets: Map<number, number[]>;
  typ: Map<number, number>;
}

const offen = new Map<string, Geoeffnet>();

/** Modell für Eigenschaftsabfragen öffnen; hält höchstens zwei Modelle offen. */
export function modellOeffnen(
  a: W.IfcAPI,
  schluessel: string,
  inhalt: () => Uint8Array,
): Geoeffnet {
  const da = offen.get(schluessel);
  if (da) {
    offen.delete(schluessel);
    offen.set(schluessel, da); // zuletzt benutzt nach hinten
    return da;
  }
  const m = a.OpenModel(inhalt());
  const psets = new Map<number, number[]>();
  for (const r of ids(a.GetLineIDsWithType(m, W.IFCRELDEFINESBYPROPERTIES))) {
    const rel = a.GetLine(m, r) as Record<string, unknown>;
    const def = Number(roh(rel['RelatingPropertyDefinition']));
    for (const e of verweise(rel['RelatedObjects'])) psets.set(e, [...(psets.get(e) ?? []), def]);
  }
  const typ = new Map<number, number>();
  for (const r of ids(a.GetLineIDsWithType(m, W.IFCRELDEFINESBYTYPE))) {
    const rel = a.GetLine(m, r) as Record<string, unknown>;
    for (const e of verweise(rel['RelatedObjects'])) typ.set(e, Number(roh(rel['RelatingType'])));
  }
  const g: Geoeffnet = { m, einheiten: einheitenLesen(a, m), psets, typ };
  offen.set(schluessel, g);
  while (offen.size > 2) {
    const [k, alt] = offen.entries().next().value as [string, Geoeffnet];
    a.CloseModel(alt.m);
    offen.delete(k);
  }
  return g;
}

/** Alle offenen Modelle schließen (z. B. beim Schließen des Projekts). */
export function modelleSchliessen(): void {
  for (const g of offen.values()) api?.CloseModel(g.m);
  offen.clear();
}

/** Menge in SI-Einheiten mit Einheitenzeichen (BaseQuantities, E-37). */
function menge(q: Record<string, unknown>, e: Einheiten): string {
  const art: [string, number, string][] = [
    ['LengthValue', e.laenge, 'm'],
    ['AreaValue', e.flaeche, 'm²'],
    ['VolumeValue', e.volumen, 'm³'],
    ['WeightValue', e.masse, 'kg'],
    ['CountValue', 1, 'Stk'],
    ['TimeValue', 1, 's'],
  ];
  for (const [feld, faktor, zeichen] of art) {
    const v = roh(q[feld]);
    if (typeof v === 'number') return `${zahl.format(v * faktor)} ${zeichen}`;
  }
  return '';
}

/** Eigenschaften eines Bauteils: Attribute, Typ, Psets und Mengen. */
export function eigenschaftenLesen(
  a: W.IfcAPI,
  g: Geoeffnet,
  expressId: number,
): EigenschaftsGruppe[] {
  const m = g.m;
  const e = a.GetLine(m, expressId) as Record<string, unknown>;
  const klassen = klassenNamen(a, m);
  const attribute: EigenschaftsGruppe = {
    titel: 'Attribute',
    art: 'attribute',
    werte: [
      { name: 'Klasse', wert: klassen.get(a.GetLineType(m, expressId) as number) ?? '' },
      ...['GlobalId', 'Name', 'Description', 'ObjectType', 'LongName', 'Tag', 'PredefinedType'].map(
        (f) => ({ name: f, wert: anzeigen(e[f]) }),
      ),
    ].filter((w) => w.wert),
  };
  const gruppen: EigenschaftsGruppe[] = [attribute];
  const typId = g.typ.get(expressId);
  const defs = [...(g.psets.get(expressId) ?? [])];
  if (typId !== undefined) {
    const t = a.GetLine(m, typId) as Record<string, unknown>;
    gruppen.push({
      titel: 'Typ',
      art: 'typ',
      werte: [
        { name: 'Klasse', wert: klassen.get(a.GetLineType(m, typId) as number) ?? '' },
        { name: 'Name', wert: anzeigen(t['Name']) },
        { name: 'PredefinedType', wert: anzeigen(t['PredefinedType']) },
      ].filter((w) => w.wert),
    });
    // Psets des Typs gelten für alle Exemplare
    defs.push(...verweise(t['HasPropertySets']));
  }
  for (const id of defs) {
    const d = a.GetLine(m, id, true) as Record<string, unknown>;
    const titel = text(d['Name']) || `#${id}`;
    if (Array.isArray(d['Quantities'])) {
      gruppen.push({
        titel,
        art: 'mengen',
        werte: (d['Quantities'] as Record<string, unknown>[])
          .map((q) => ({ name: text(q['Name']), wert: menge(q, g.einheiten) }))
          .filter((w) => w.wert),
      });
    } else if (Array.isArray(d['HasProperties'])) {
      gruppen.push({
        titel,
        art: 'pset',
        werte: (d['HasProperties'] as Record<string, unknown>[])
          .map((p) => ({
            name: text(p['Name']),
            wert: p['NominalValue'] !== undefined ? anzeigen(p['NominalValue']) : '',
          }))
          .filter((w) => w.name),
      });
    }
  }
  return gruppen;
}
