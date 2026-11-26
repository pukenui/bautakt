import { ProjektSitzung } from '@bautakt/kern';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  BauteilZeile,
  EigenschaftsGruppe,
  GeschossZeile,
  ModellZeile,
} from '../gemeinsam/typen.js';
import { modelleSchliessen } from '../main/ifc.js';
import { bimPlugin } from '../main/index.js';

/** Testmodell aus BIMCraft 0.12.0 (`bimcraft-cli run --sample`, IFC4, Längen in mm), E-40. */
const HAUS = path.join(import.meta.dirname, 'modelle', 'bimcraft-haus.ifc');
/** Testmodell aus FreeCAD 1.1.1 (BIM, Export über IfcOpenShell 0.8.4, IFC4, Längen in m), E-40. */
const HALLE = path.join(import.meta.dirname, 'modelle', 'freecad-halle.ifc');

const ordner: string[] = [];
afterEach(() => {
  modelleSchliessen();
  ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true }));
});

function projekt() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-bim-'));
  ordner.push(o);
  const pfad = path.join(o, 'p.bautakt');
  const optionen = { appVersion: '0.0.1', autosaveMs: 0, plugins: [bimPlugin] };
  return { pfad, optionen, s: ProjektSitzung.neu(pfad, 'BIM-Test', optionen) };
}

const einlesen = (s: ProjektSitzung, datei = HAUS) =>
  s.dateiImport('bim', 'ifc', new Uint8Array(fs.readFileSync(datei)), {
    dateiname: path.basename(datei),
  });

describe('IFC einlesen (B1, E-37, E-86)', () => {
  it('liest Geschosse und Bauteile des BIMCraft-Hauses', async () => {
    const { s } = projekt();
    const e = await einlesen(s);
    expect(e.bericht[0]).toBe('IFC4: 37 Bauteile in 2 Geschossen.');
    const [m] = s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    expect(m).toMatchObject({ name: 'bimcraft-haus', ifc_schema: 'IFC4', anzahl: 37 });
    expect(m?.hash).toMatch(/^[0-9a-f]{64}$/);

    const st = s.abfrage('bim', 'struktur', { modellId: m?.id }) as {
      geschosse: GeschossZeile[];
      bauteile: BauteilZeile[];
    };
    // Elevation in mm → m
    expect(st.geschosse.map((g) => [g.name, g.hoehe])).toEqual([
      ['Level 1', 0],
      ['Level 2', 3],
    ]);
    const zaehlen = (k: string) => st.bauteile.filter((b) => b.klasse === k).length;
    expect([
      zaehlen('IfcWall'),
      zaehlen('IfcDoor'),
      zaehlen('IfcWindow'),
      zaehlen('IfcSpace'),
    ]).toEqual([7, 4, 5, 4]);
    // keine Öffnungen, Raster oder räumliche Struktur als Bauteile
    expect(
      st.bauteile.some((b) =>
        ['IfcOpeningElement', 'IfcGrid', 'IfcBuildingStorey'].includes(b.klasse),
      ),
    ).toBe(false);
    // Wände hängen am Geschoss, Typname aus IfcRelDefinesByType bzw. ObjectType
    const wand = st.bauteile.find((b) => b.klasse === 'IfcWall');
    expect(st.geschosse.find((g) => g.id === wand?.geschoss_id)?.name).toBe('Level 1');
    expect(wand?.globalid).toHaveLength(22);
    expect(wand?.typ).not.toBe('');
    s.schliessen();
  });

  it('zeigt Eigenschaften mit Mengen in SI-Einheiten', async () => {
    const { s } = projekt();
    await einlesen(s);
    const [m] = s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    const st = s.abfrage('bim', 'struktur', { modellId: m?.id }) as { bauteile: BauteilZeile[] };
    const wand = st.bauteile.find((b) => b.klasse === 'IfcWall' && b.name === 'Exterior - 300mm');
    const gruppen = (await s.abfrage('bim', 'eigenschaften', {
      modellId: m?.id,
      expressId: wand?.express_id,
    })) as EigenschaftsGruppe[];
    expect(gruppen[0]?.werte).toContainEqual({ name: 'Klasse', wert: 'IfcWall' });
    expect(gruppen[0]?.werte).toContainEqual({ name: 'GlobalId', wert: wand?.globalid });
    const qto = gruppen.find((g) => g.titel === 'Qto_WallBaseQuantities');
    expect(qto?.art).toBe('mengen');
    // Länge 7000 mm → 7 m
    expect(qto?.werte.find((w) => w.name === 'Length')?.wert).toBe('7 m');
    expect(gruppen.some((g) => g.art === 'pset')).toBe(true);
    s.schliessen();
  });

  it('Einlesen und Entfernen sind rückgängig machbar; die Datei bleibt eingebettet', async () => {
    const { s, pfad, optionen } = projekt();
    await einlesen(s);
    const [m] = s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    const datei = s.abfrage('bim', 'datei', { modellId: m?.id }) as Uint8Array;
    expect(datei.byteLength).toBe(fs.statSync(HAUS).size);

    s.befehl({ plugin: 'bim', name: 'modell.loeschen', daten: { id: m?.id } });
    expect(s.abfrage('bim', 'modelle', undefined)).toEqual([]);
    s.rueckgaengig();
    expect((s.abfrage('bim', 'modelle', undefined) as ModellZeile[])[0]?.anzahl).toBe(37);
    s.rueckgaengig(); // Einlesen zurück
    expect(s.abfrage('bim', 'modelle', undefined)).toEqual([]);
    s.wiederholen();
    expect((s.abfrage('bim', 'modelle', undefined) as ModellZeile[])[0]?.anzahl).toBe(37);
    s.schliessen();

    // Projekt woanders hin kopieren: das Modell ist enthalten (E-86)
    const kopie = pfad.replace('p.bautakt', 'kopie.bautakt');
    fs.copyFileSync(pfad, kopie);
    const s2 = ProjektSitzung.oeffnen(kopie, optionen);
    const [m2] = s2.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    expect((s2.abfrage('bim', 'datei', { modellId: m2?.id }) as Uint8Array).byteLength).toBe(
      fs.statSync(HAUS).size,
    );
    s2.schliessen();
  });

  it('mehrere Modelle je Projekt (E-88)', async () => {
    const { s } = projekt();
    await einlesen(s);
    await einlesen(s);
    const modelle = s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    expect(modelle.map((m) => m.reihenfolge)).toEqual([1, 2]);
    // gleiche Datei: nur einmal abgelegt
    expect(new Set(modelle.map((m) => m.hash)).size).toBe(1);
    s.befehl({
      plugin: 'bim',
      name: 'modell.umbenennen',
      daten: { id: modelle[1]?.id, name: 'Tragwerk' },
    });
    expect((s.abfrage('bim', 'modelle', undefined) as ModellZeile[])[1]?.name).toBe('Tragwerk');
    s.schliessen();
  });

  it('weist Nicht-IFC-Dateien und fremde Schemata ab', async () => {
    const { s } = projekt();
    await expect(
      s.dateiImport('bim', 'ifc', new TextEncoder().encode('kein IFC'), { dateiname: 'x.ifc' }),
    ).rejects.toThrow(/keine (lesbare IFC-Datei|Bauteile)|Schema/);
    const ifc43 = fs
      .readFileSync(HAUS, 'utf8')
      .replace("FILE_SCHEMA(('IFC4'));", "FILE_SCHEMA(('IFC4X3_ADD2'));");
    await expect(
      s.dateiImport('bim', 'ifc', new TextEncoder().encode(ifc43), { dateiname: 'x.ifc' }),
    ).rejects.toThrow(/IFC4X3.*noch nicht unterstützt/);
    expect(s.abfrage('bim', 'modelle', undefined)).toEqual([]);
    s.schliessen();
  });

  it('liest das FreeCAD-Modell (ohne Geschosshöhen und ohne BaseQuantities)', async () => {
    const { s } = projekt();
    const e = await einlesen(s, HALLE);
    expect(e.bericht).toEqual([
      'IFC4: 8 Bauteile in 2 Geschossen.',
      'Mengen: 0 Bauteil(e) mit BaseQuantities, 8 nur aus der Geometrie.',
    ]);
    const [m] = s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    const st = s.abfrage('bim', 'struktur', { modellId: m?.id }) as {
      geschosse: GeschossZeile[];
      bauteile: BauteilZeile[];
    };
    expect(st.geschosse.map((g) => [g.name, g.hoehe])).toEqual([
      ['EG', null],
      ['Dach', null],
    ]);
    const imGeschoss = (name: string) => {
      const id = st.geschosse.find((g) => g.name === name)?.id;
      return st.bauteile
        .filter((b) => b.geschoss_id === id)
        .map((b) => b.name)
        .sort();
    };
    expect(imGeschoss('EG')).toEqual([
      'Aussenwand 1',
      'Aussenwand 2',
      'Aussenwand 3',
      'Aussenwand 4',
      'Bodenplatte',
      'Stuetze 1',
      'Stuetze 2',
    ]);
    expect(imGeschoss('Dach')).toEqual(['Dachdecke']);
    const stuetze = st.bauteile.find((b) => b.name === 'Stuetze 1');
    const gruppen = (await s.abfrage('bim', 'eigenschaften', {
      modellId: m?.id,
      expressId: stuetze?.express_id,
    })) as EigenschaftsGruppe[];
    expect(gruppen[0]?.werte).toContainEqual({ name: 'Klasse', wert: 'IfcColumn' });
    expect(gruppen.some((g) => g.art === 'mengen')).toBe(false);
    s.schliessen();
  });
});
