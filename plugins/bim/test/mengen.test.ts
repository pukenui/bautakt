import { ProjektSitzung } from '@bautakt/kern';
import { kostenPlugin } from '@bautakt/plugin-kosten/main';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BauteilZeile, ModellZeile, RegelZeile } from '../gemeinsam/typen.js';
import {
  STANDARD_REGELN,
  inKg,
  kgMenge,
  kgMengeHinweise,
  zuordnen,
  type BauteilMerkmale,
  type Regel,
} from '../gemeinsam/zuordnung.js';
import { modelleSchliessen, netzMengen } from '../main/ifc.js';
import { bimPlugin } from '../main/index.js';

const modell = (n: string) => path.join(import.meta.dirname, 'modelle', n);
const ordner: string[] = [];
afterEach(() => {
  modelleSchliessen();
  ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true }));
});

/** Quader a × b × c als Dreiecksnetz (12 Dreiecke, außen orientiert). */
function quader(a: number, b: number, c: number): number[] {
  const p = (x: number, y: number, z: number) => [x * a, y * b, z * c];
  const flaechen = [
    [p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)],
    [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
    [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)],
    [p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)],
    [p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)],
    [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)],
  ];
  return flaechen.flatMap(([q, r, s, t]) => [q, r, s, q, s, t].flat() as number[]);
}

const regeln: Regel[] = STANDARD_REGELN.map((r) => ({ ...r, enthaelt: '' }));
const bauteil = (b: Partial<BauteilMerkmale>): BauteilMerkmale => ({
  klasse: 'IfcWall',
  name: '',
  typ: '',
  predefined: '',
  aussen: null,
  tragend: null,
  ...b,
});

describe('Mengen aus der Geometrie (E-92)', () => {
  it('Volumen und Hauptfläche eines Quaders', () => {
    // Wand 6 m lang, 0,24 m dick, 3 m hoch: Seitenfläche 18 m², Volumen 4,32 m³
    expect(netzMengen(quader(6, 0.24, 3))).toEqual({ volumen: 4.32, flaeche: 18 });
    // Decke 12 × 8 × 0,2: Oberseite 96 m²
    expect(netzMengen(quader(12, 8, 0.2))).toEqual({ volumen: 19.2, flaeche: 96 });
  });

  it('gedrehte Bauteile: Hauptfläche bleibt die Seitenfläche', () => {
    const w = Math.PI / 6;
    const gedreht = quader(6, 0.24, 3).map((v, i, alle) => {
      const k = i % 3;
      const x = alle[i - k] ?? 0;
      const y = alle[i - k + 1] ?? 0;
      return k === 0
        ? x * Math.cos(w) - y * Math.sin(w)
        : k === 1
          ? x * Math.sin(w) + y * Math.cos(w)
          : v;
    });
    const m = netzMengen(gedreht);
    expect(m.volumen).toBeCloseTo(4.32, 3);
    expect(m.flaeche).toBeCloseTo(18, 3);
  });
});

describe('Regeln IFC → KG (E-90)', () => {
  it('Standardregeln: Wände nach außen/tragend, Unterklassen, PredefinedType', () => {
    const kg = (b: Partial<BauteilMerkmale>) => zuordnen(bauteil(b), regeln).kg;
    expect(kg({ aussen: 1, tragend: 1 })).toBe(331);
    expect(kg({ aussen: 1, tragend: 0 })).toBe(332);
    expect(kg({ aussen: 1 })).toBe(331); // unbekannt → tragend angenommen
    expect(kg({ aussen: 0, tragend: 1 })).toBe(341);
    expect(kg({})).toBe(342);
    expect(kg({ klasse: 'IfcWallStandardCase', aussen: 1, tragend: 1 })).toBe(331);
    expect(kg({ klasse: 'IfcSlab', predefined: 'BASESLAB' })).toBe(322);
    expect(kg({ klasse: 'IfcSlab', predefined: 'FLOOR' })).toBe(351);
    expect(kg({ klasse: 'IfcSlab', predefined: 'ROOF' })).toBe(361);
    expect(kg({ klasse: 'IfcColumn', aussen: 1 })).toBe(333);
    expect(kg({ klasse: 'IfcColumn' })).toBe(343);
    expect(kg({ klasse: 'IfcCovering', predefined: 'CEILING' })).toBe(354);
    // keine Regel bzw. nie zugeordnet
    expect(kg({ klasse: 'IfcFurniture' })).toBeNull();
    expect(kg({ klasse: 'IfcSpace' })).toBeNull();
    // Präfix allein reicht nicht: IfcWallType o. ä. ist keine Unterklasse
    expect(kg({ klasse: 'IfcWallpaper' })).toBeNull();
  });

  it('„Name/Typ enthält“ und Reihenfolge; Überschreibung je Bauteil', () => {
    const mit: Regel[] = [
      {
        klasse: 'IfcWall',
        predefined: '',
        aussen: null,
        tragend: null,
        enthaelt: 'exterior',
        kg: 331,
        mengenart: 'flaeche',
      },
      ...regeln,
    ];
    expect(zuordnen(bauteil({ typ: 'Exterior - 300mm' }), mit)).toEqual({
      kg: 331,
      mengenart: 'flaeche',
      regel: 0,
      manuell: false,
    });
    expect(zuordnen(bauteil({ typ: 'Interior - 100mm' }), mit).kg).toBe(342);
    expect(zuordnen(bauteil({}), mit, { kg: 335, mengenart: 'flaeche' })).toEqual({
      kg: 335,
      mengenart: 'flaeche',
      regel: null,
      manuell: true,
    });
    expect(zuordnen(bauteil({}), mit, { kg: null, mengenart: 'flaeche' }).kg).toBeNull();
  });

  it('Summe je KG mit Unter-KG, häufigste Mengenart, Hinweise', () => {
    expect([inKg(331, 300), inKg(331, 330), inKg(341, 330), inKg(331, 331)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
    const z = (kg: number, mengenart: 'flaeche' | 'stueck') => ({
      kg,
      mengenart,
      regel: 0,
      manuell: false,
    });
    const alle = [
      { zuordnung: z(331, 'flaeche'), mengen: { flaeche: { wert: 18, herkunft: 'qto' as const } } },
      {
        zuordnung: z(331, 'flaeche'),
        mengen: { flaeche: { wert: 12.5, herkunft: 'geometrie' as const } },
      },
      { zuordnung: z(332, 'flaeche'), mengen: {} },
      { zuordnung: z(333, 'stueck'), mengen: {} },
    ];
    expect(kgMenge(331, alle)).toMatchObject({
      menge: 30.5,
      einheit: 'm²',
      anzahl: 2,
      ausQto: 1,
      ausGeometrie: 1,
    });
    const m330 = kgMenge(330, alle);
    expect(m330).toMatchObject({ menge: 30.5, anzahl: 4, gezaehlt: 2, ohneMenge: 1, andereArt: 1 });
    expect(kgMengeHinweise(m330, 'm³')).toEqual([
      '1 Bauteil(e) ohne Fläche nicht gezählt.',
      '1 Bauteil(e) mit anderer Mengenart nicht gezählt.',
      'Einheit der Zeile (m³) passt nicht zur Modellmenge (m²).',
    ]);
    expect(kgMenge(333, alle)).toMatchObject({ menge: 1, einheit: 'Stk' });
    expect(kgMengeHinweise(kgMenge(361, alle), '')).toEqual([
      'Im Modell ist kein Bauteil der KG 361 zugeordnet.',
    ]);
  });
});

function projekt() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-5d-'));
  ordner.push(o);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), '5D', {
    appVersion: '0.0.1',
    autosaveMs: 0,
    plugins: [kostenPlugin, bimPlugin],
  });
  const befehl = (name: string, daten: unknown, plugin = 'bim') =>
    s.befehl({ plugin, name, daten });
  const einlesen = (datei: string) =>
    s.dateiImport('bim', 'ifc', new Uint8Array(fs.readFileSync(modell(datei))), {
      dateiname: datei,
    });
  return { s, befehl, einlesen };
}

interface Zeile {
  id: string;
  kg: number;
  mengeWirksam: number | null;
  kosten: number | null;
  hinweise: string[];
  modellMenge: { anzahl: number; ausQto: number; ausGeometrie: number } | null;
}
const zeile = (s: ProjektSitzung, kg: number) =>
  (s.abfrage('kosten', 'kosten', undefined) as { zeilen: Zeile[] }).zeilen.find((z) => z.kg === kg);

describe('Mengen beim Einlesen (E-91, E-92)', () => {
  it('BIMCraft: BaseQuantities mit Name; FreeCAD: Geometrie', async () => {
    const { s, einlesen } = projekt();
    await einlesen('bimcraft-haus.ifc');
    await einlesen('freecad-halle.ifc');
    const [haus, halle] = s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    const bt = (m?: ModellZeile) =>
      (s.abfrage('bim', 'struktur', { modellId: m?.id }) as { bauteile: BauteilZeile[] }).bauteile;
    const dach = bt(haus).find((b) => b.klasse === 'IfcRoof');
    expect(dach?.mengen?.flaeche).toEqual({ wert: 108.299, herkunft: 'qto', name: 'NetArea' });
    const wand = bt(haus).find((b) => b.klasse === 'IfcWall');
    expect(wand?.mengen?.flaeche?.name).toBe('NetSideArea');
    expect(wand?.mengen?.laenge?.herkunft).toBe('qto');

    const platte = bt(halle).find((b) => b.name === 'Bodenplatte');
    expect(platte).toMatchObject({ klasse: 'IfcSlab', predefined: 'FLOOR' });
    expect(platte?.mengen).toEqual({
      flaeche: { wert: 96, herkunft: 'geometrie' },
      volumen: { wert: 19.2, herkunft: 'geometrie' },
    });
    // Wand 12 m × 3 m (Dicke 0,24 m), Länge gibt es aus der Geometrie nicht
    const w1 = bt(halle).find((b) => b.name === 'Aussenwand 1');
    expect(w1?.mengen?.flaeche?.wert).toBeCloseTo(36, 1);
    expect(w1?.mengen?.laenge).toBeUndefined();
    s.schliessen();
  });
});

describe('Kosten live an das Modell gekoppelt (E-93)', () => {
  it('Menge folgt Modell, Regeln und Überschreibungen; Stand friert ein', async () => {
    const { s, befehl, einlesen } = projekt();
    befehl('zeile.anlegen', { kg: 351 }, 'kosten');
    befehl('zeile.anlegen', { kg: 343 }, 'kosten');
    const z351 = zeile(s, 351);
    const z343 = zeile(s, 343);
    const koppeln = (z?: Zeile, einheit = 'm²') =>
      befehl(
        'zeile.aendern',
        { id: z?.id, felder: { menge_quelle: 'ifc', einheit, kkw_gewaehlt: 100 } },
        'kosten',
      );
    koppeln(z351);
    koppeln(z343, 'Stk');
    // noch kein Modell
    expect(zeile(s, 351)?.mengeWirksam).toBeNull();
    expect(zeile(s, 351)?.hinweise).toContain(
      'Mengenquelle „Modell“, aber das Projekt enthält kein IFC-Modell.',
    );

    await einlesen('freecad-halle.ifc');
    // Bodenplatte und Dachdecke (beide FLOOR) → 351: 2 × 96 m²; zwei Stützen → 343
    expect(zeile(s, 351)).toMatchObject({ mengeWirksam: 192, kosten: 19200 });
    expect(zeile(s, 351)?.modellMenge).toMatchObject({ anzahl: 2, ausGeometrie: 2 });
    expect(zeile(s, 343)).toMatchObject({ mengeWirksam: 2, kosten: 200 });

    // Überschreibung: Bodenplatte → 322 (Bodenplatten) – 351 sinkt sofort
    const [halle] = s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    const platte = (
      s.abfrage('bim', 'struktur', { modellId: halle?.id }) as { bauteile: BauteilZeile[] }
    ).bauteile.find((b) => b.name === 'Bodenplatte');
    befehl('zuweisung.setzen', {
      modellId: halle?.id,
      globalid: platte?.globalid,
      kg: 322,
      mengenart: 'flaeche',
    });
    expect(zeile(s, 351)?.mengeWirksam).toBe(96);

    // Soll-Stand friert Menge und Kosten ein …
    befehl('stand.speichern', { name: 'Soll Entwurf' }, 'kern');
    // … dann Regel ändern: Decken nach Volumen → Einheit passt nicht mehr
    const regel = (s.abfrage('bim', 'regeln', undefined) as RegelZeile[]).find(
      (r) => r.klasse === 'IfcSlab' && r.predefined === '',
    );
    befehl('regel.aendern', { id: regel?.id, mengenart: 'volumen' });
    expect(zeile(s, 351)?.mengeWirksam).toBeCloseTo(24, 3); // 12 × 8 × 0,25
    expect(zeile(s, 351)?.hinweise).toContain(
      'Einheit der Zeile (m²) passt nicht zur Modellmenge (m³).',
    );
    // Rückgängig: wieder Fläche
    s.rueckgaengig();
    expect(zeile(s, 351)?.mengeWirksam).toBe(96);
    // Stand enthält den eingefrorenen Wert
    const stand = (s.abfrage('kern', 'staende', undefined) as { id: string }[])[0];
    const db = s as unknown as {
      datei: { db: { prepare(sql: string): { get(...a: unknown[]): unknown } } };
    };
    const kopie = db.datei.db
      .prepare('SELECT menge, kosten FROM k_zeile_stand WHERE stand_id = ? AND kg = 351')
      .get(stand?.id);
    expect(kopie).toEqual({ menge: 96, kosten: 9600 });

    // Modell entfernen → Hinweis statt Menge
    befehl('modell.loeschen', { id: halle?.id });
    expect(zeile(s, 351)?.mengeWirksam).toBeNull();
    s.schliessen();
  });

  it('Regeltabelle: anlegen, verschieben, Standard wiederherstellen; KG wird geprüft', async () => {
    const { s, befehl } = projekt();
    const liste = () => s.abfrage('bim', 'regeln', undefined) as RegelZeile[];
    expect(liste()).toHaveLength(STANDARD_REGELN.length);
    befehl('regel.anlegen', { klasse: 'IfcStair', kg: 351, mengenart: 'stueck' });
    const neu = liste().at(-1);
    expect(neu).toMatchObject({ klasse: 'IfcStair', aussen: null, enthaelt: '' });
    befehl('regel.verschieben', { id: neu?.id, richtung: -1 });
    expect(liste().at(-2)?.id).toBe(neu?.id);
    expect(() =>
      befehl('regel.anlegen', { klasse: 'IfcWall', kg: 999, mengenart: 'flaeche' }),
    ).toThrow(/Unbekannte Kostengruppe/);
    befehl('regeln.standard', {});
    expect(liste().map((r) => r.klasse)).toEqual(STANDARD_REGELN.map((r) => r.klasse));
    s.rueckgaengig();
    expect(liste()).toHaveLength(STANDARD_REGELN.length + 1);
    s.schliessen();
  });
});
