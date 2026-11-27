import { ProjektSitzung } from '@bautakt/kern';
import { kostenPlugin } from '@bautakt/plugin-kosten/main';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  STANDARD_RAUMREGELN,
  flaechenSummen,
  raumRegelPasst,
  raumZuordnen,
  type RaumMerkmale,
} from '../gemeinsam/raeume.js';
import type { Aenderungsbericht, BauteilZeile, ModellZeile } from '../gemeinsam/typen.js';
import { modelleSchliessen } from '../main/ifc.js';
import { bimPlugin } from '../main/index.js';

const modell = (n: string) => path.join(import.meta.dirname, 'modelle', n);
const ordner: string[] = [];
afterEach(() => {
  modelleSchliessen();
  ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true }));
});

const raum = (r: Partial<RaumMerkmale>): RaumMerkmale => ({
  name: '',
  langname: '',
  typ: '',
  texte: '',
  ...r,
});

describe('Raumregeln DIN 277 (E-94)', () => {
  it('Standardregeln am Wortanfang, „sonst“ → NUF 1', () => {
    const kat = (r: Partial<RaumMerkmale>) => raumZuordnen(raum(r), STANDARD_RAUMREGELN).kategorie;
    expect(kat({ langname: 'Flur EG' })).toBe('VF');
    expect(kat({ name: '0.12', langname: 'Treppenhaus' })).toBe('VF');
    expect(kat({ langname: 'Heizungsraum' })).toBe('TF');
    expect(kat({ langname: 'WC Damen' })).toBe('NUF7');
    expect(kat({ langname: 'Büro 3' })).toBe('NUF2');
    expect(kat({ langname: 'Kitchen' })).toBe('NUF1');
    // „Essen“ nur am Wortanfang – „Messraum“ fällt auf die Sonst-Regel
    expect(
      raumRegelPasst({ enthaelt: 'Essen', kategorie: 'NUF1' }, raum({ langname: 'Messraum' })),
    ).toBe(false);
    expect(kat({ langname: 'Lagerhalle' })).toBe('NUF1');
    // Eigenschaftswerte zählen mit (z. B. Kategorie im Pset)
    expect(kat({ texte: 'Technikfläche, Lüftungszentrale' })).toBe('TF');
    expect(
      raumZuordnen(raum({ langname: 'Flur' }), STANDARD_RAUMREGELN, { kategorie: null }),
    ).toEqual({
      kategorie: null,
      regel: null,
      manuell: true,
    });
  });

  it('Summen je Kategorie, Räume ohne Fläche gezählt', () => {
    expect(
      flaechenSummen([
        { kategorie: 'NUF1', flaeche: 22.04 },
        { kategorie: 'NUF1', flaeche: 16.24 },
        { kategorie: 'VF', flaeche: null },
        { kategorie: null, flaeche: 10 },
      ]),
    ).toEqual({ je: { NUF1: 38.28 }, anzahl: { NUF1: 2 }, ohneFlaeche: 1 });
  });
});

function projekt() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-b3-'));
  ordner.push(o);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'B3', {
    appVersion: '0.0.1',
    autosaveMs: 0,
    plugins: [kostenPlugin, bimPlugin],
  });
  const befehl = (name: string, daten: unknown, plugin = 'bim') =>
    s.befehl({ plugin, name, daten });
  const lesen = (datei: string) => new Uint8Array(fs.readFileSync(modell(datei)));
  const einlesen = (datei: string) =>
    s.dateiImport('bim', 'ifc', lesen(datei), { dateiname: datei });
  const modelle = () => s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
  const bauteile = (m?: ModellZeile) =>
    (s.abfrage('bim', 'struktur', { modellId: m?.id }) as { bauteile: BauteilZeile[] }).bauteile;
  const kosten = () =>
    s.abfrage('kosten', 'kosten', undefined) as {
      flaechen: Record<string, number | null>;
      flaechenAusModell: string[];
      zeilen: { kg: number; id: string; mengeWirksam: number | null }[];
    };
  return { s, befehl, lesen, einlesen, modelle, bauteile, kosten };
}

describe('Flächen aus dem Modell (E-94, E-95)', () => {
  it('Räume des BIMCraft-Hauses → NUF 1, live in der Flächentabelle', async () => {
    const u = projekt();
    await u.einlesen('bimcraft-haus.ifc');
    const raeume = u.bauteile(u.modelle()[0]).filter((b) => b.klasse === 'IfcSpace');
    expect(raeume.map((r) => [r.langname, r.mengen?.flaeche])).toContainEqual([
      'Living',
      { wert: 22.04, herkunft: 'qto', name: 'NetFloorArea' },
    ]);
    expect(u.s.abfrage('bim', 'flaechen', undefined)).toMatchObject({ je: { NUF1: 63.36 } });

    u.befehl('flaeche.ausModell', { kategorie: 'NUF1', aus_modell: true }, 'kosten');
    u.befehl('flaeche.ausModell', { kategorie: 'VF', aus_modell: true }, 'kosten');
    expect(u.kosten().flaechen).toMatchObject({ NUF1: 63.36, NUF: 63.36, VF: null });
    expect(u.kosten().flaechenAusModell).toEqual(['NUF1', 'VF']);

    // Küche von Hand als Verkehrsfläche → Flächen folgen sofort
    const kueche = raeume.find((r) => r.langname === 'Kitchen');
    u.befehl('raumzuweisung.setzen', {
      modellId: kueche?.modell_id,
      globalid: kueche?.globalid,
      kategorie: 'VF',
    });
    expect(u.kosten().flaechen).toMatchObject({ NUF1: 47.12, VF: 16.24, NRF: 63.36 });
    u.s.rueckgaengig();
    expect(u.kosten().flaechen.NUF1).toBe(63.36);

    // Raumregel: „Study“ zuerst als Büro
    u.befehl('raumregel.anlegen', { enthaelt: 'Study', kategorie: 'NUF2' });
    const regeln = u.s.abfrage('bim', 'raumregeln', undefined) as { id: string }[];
    for (let i = 0; i < regeln.length - 1; i++)
      u.befehl('raumregel.verschieben', { id: regeln.at(-1)?.id, richtung: -1 });
    expect(u.s.abfrage('bim', 'flaechen', undefined)).toMatchObject({
      je: { NUF1: 50.82, NUF2: 12.54 },
    });

    // Eintragen von Hand beendet die Kopplung
    u.befehl('flaeche.setzen', { kategorie: 'NUF1', wert_m2: 100, quelle: 'Plan' }, 'kosten');
    expect(u.kosten().flaechen.NUF1).toBe(100);
    expect(u.kosten().flaechenAusModell).toEqual(['VF']);
    u.s.schliessen();
  });
});

describe('Neu einlesen mit Vorschau (E-96)', () => {
  it('Halle → Tragwerk: Bericht vorab, Übernehmen ersetzt, Zuordnungen bleiben, Undo', async () => {
    const u = projekt();
    await u.einlesen('freecad-halle.ifc');
    const [m] = u.modelle();
    const platte = u.bauteile(m).find((b) => b.name === 'Bodenplatte');
    u.befehl('zuweisung.setzen', {
      modellId: m?.id,
      globalid: platte?.globalid,
      kg: 322,
      mengenart: 'flaeche',
    });
    u.befehl('zeile.anlegen', { kg: 351 }, 'kosten');
    const z351 = u.kosten().zeilen.find((z) => z.kg === 351);
    u.befehl(
      'zeile.aendern',
      { id: z351?.id, felder: { menge_quelle: 'ifc', einheit: 'm²' } },
      'kosten',
    );
    const idsVorher = new Map(u.bauteile(m).map((b) => [b.globalid, b.id]));

    const e = await u.s.dateiImport('bim', 'ifc-neu', u.lesen('freecad-halle-tragwerk.ifc'), {
      dateiname: 'tragwerk.ifc',
      modellId: m?.id,
    });
    // Vorschau: noch nichts geändert
    expect(e.ergebnis).toBeNull();
    expect(u.bauteile(m)).toHaveLength(8);
    const d = e.vorschau?.details as Aenderungsbericht;
    expect(e.bericht[0]).toBe('0 neu, 0 geändert, 4 entfernt.');
    expect(d.entfernt.map((b) => b.name).sort()).toEqual([
      'Aussenwand 1',
      'Aussenwand 2',
      'Aussenwand 3',
      'Aussenwand 4',
    ]);
    expect(d.kosten).toEqual([{ kg: 351, einheit: 'm²', alt: 96, neu: 96 }]);
    expect(d.zuordnungenOhneBauteil).toBe(0);

    // Übernehmen
    u.s.befehl({ plugin: 'bim', name: e.vorschau?.befehl ?? '', daten: e.vorschau?.daten });
    const nachher = u.bauteile(u.modelle()[0]);
    expect(nachher).toHaveLength(4);
    expect(u.modelle()[0]).toMatchObject({ dateiname: 'tragwerk.ifc', anzahl: 4 });
    // gleiche GlobalId → gleiche Identität; Zuordnung von Hand bleibt
    for (const b of nachher) expect(b.id).toBe(idsVorher.get(b.globalid));
    const zuw = u.s.abfrage('bim', 'zuweisungen', undefined) as { globalid: string; kg: number }[];
    expect(zuw).toEqual([expect.objectContaining({ globalid: platte?.globalid, kg: 322 })]);
    // Geschosse neu angelegt, Bauteile hängen daran
    const st = u.s.abfrage('bim', 'struktur', { modellId: m?.id }) as {
      geschosse: { id: string; name: string }[];
    };
    expect(st.geschosse.map((g) => g.name)).toEqual(['EG', 'Dach']);
    expect(nachher.every((b) => st.geschosse.some((g) => g.id === b.geschoss_id))).toBe(true);

    // ein Undo-Schritt nimmt alles zurück
    u.s.rueckgaengig();
    expect(u.bauteile(u.modelle()[0])).toHaveLength(8);
    expect(u.modelle()[0]?.dateiname).toBe('freecad-halle.ifc');
    u.s.schliessen();
  });

  it('geänderter Name und Mengen werden erkannt', async () => {
    const u = projekt();
    await u.einlesen('bimcraft-haus.ifc');
    const [m] = u.modelle();
    const text = fs
      .readFileSync(modell('bimcraft-haus.ifc'), 'utf8')
      .replace(
        "IFCQUANTITYAREA('NetFloorArea',$,$,22.04,$)",
        "IFCQUANTITYAREA('NetFloorArea',$,$,24.5,$)",
      )
      .replace(",'Living',.ELEMENT.", ",'Wohnen',.ELEMENT.");
    u.befehl('flaeche.ausModell', { kategorie: 'NUF1', aus_modell: true }, 'kosten');
    const e = await u.s.dateiImport('bim', 'ifc-neu', new TextEncoder().encode(text), {
      dateiname: 'haus2.ifc',
      modellId: m?.id,
    });
    const d = e.vorschau?.details as Aenderungsbericht;
    expect(d.neu).toEqual([]);
    expect(d.entfernt).toEqual([]);
    expect(d.geaendert).toEqual([
      expect.objectContaining({ klasse: 'IfcSpace', name: '1', was: ['Langname', 'Fläche'] }),
    ]);
    expect(d.flaechen).toEqual([{ kategorie: 'NUF1', alt: 63.36, neu: 65.82 }]);
    s_uebernehmen(u.s, e.vorschau);
    expect(u.kosten().flaechen.NUF1).toBe(65.82);
    const wohnen = u.bauteile(m).find((b) => b.klasse === 'IfcSpace' && b.name === '1');
    expect(wohnen?.langname).toBe('Wohnen');
    u.s.schliessen();
  });
});

function s_uebernehmen(s: ProjektSitzung, v: { befehl: string; daten: unknown } | null) {
  s.befehl({ plugin: 'bim', name: v?.befehl ?? '', daten: v?.daten });
}
