import { ProjektSitzung } from '@bautakt/kern';
import { kostenPlugin } from '@bautakt/plugin-kosten/main';
import { terminePlugin } from '@bautakt/plugin-termine/main';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  Aenderungsbericht,
  BauteilZeile,
  GeschossZeile,
  ModellZeile,
  RegelZeile,
} from '../gemeinsam/typen.js';
import {
  ortFilter,
  refsLesen,
  vorschlag4d,
  zeitraeume,
  zustandAm,
  type Bauteil4d,
  type OrtZuordnung,
} from '../gemeinsam/vierd.js';
import { zuordnen } from '../gemeinsam/zuordnung.js';
import { modelleSchliessen } from '../main/ifc.js';
import { bimPlugin } from '../main/index.js';

const modell = (n: string) => path.join(import.meta.dirname, 'modelle', n);
const ordner: string[] = [];
afterEach(() => {
  modelleSchliessen();
  ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true }));
});

// Ortsstruktur: BA 1 › EG, OG; BA 2 › EG
const ORTE = [
  { id: 'ba1', parent_id: null, name: 'BA 1', reihenfolge: 1 },
  { id: 'ba1eg', parent_id: 'ba1', name: 'EG', reihenfolge: 1 },
  { id: 'ba1og', parent_id: 'ba1', name: 'OG', reihenfolge: 2 },
  { id: 'ba2', parent_id: null, name: 'BA 2', reihenfolge: 2 },
  { id: 'ba2eg', parent_id: 'ba2', name: 'EG', reihenfolge: 1 },
];
const ZU: OrtZuordnung[] = [
  { ort_id: 'ba1', geschosse: [], zonen: ['BA 1'] },
  { ort_id: 'ba2', geschosse: [], zonen: ['BA 2'] },
  { ort_id: 'ba1eg', geschosse: ['EG'], zonen: [] },
  { ort_id: 'ba1og', geschosse: ['OG'], zonen: [] },
  { ort_id: 'ba2eg', geschosse: ['EG'], zonen: [] },
];
const bt = (b: Partial<Bauteil4d>): Bauteil4d => ({
  modell_id: 'm',
  globalid: 'g',
  klasse: 'IfcWall',
  geschoss: 'EG',
  zonen: ['BA 1'],
  kg: 342,
  ...b,
});

describe('4D-Logik (E-101–E-103)', () => {
  it('Ortsfilter: Orte im Bereich samt übergeordneten, Geschoss und Zone', () => {
    expect(ortFilter(ORTE, null, null, ZU)).toBeNull();
    const eg1 = ortFilter(ORTE, 'ba1eg', 'ba1eg', ZU);
    expect([...(eg1?.geschosse ?? [])]).toEqual(['EG']);
    expect([...(eg1?.zonen ?? [])]).toEqual(['BA 1']);
    // BA 1 ganz: EG und OG, Zone BA 1
    const ba1 = ortFilter(ORTE, 'ba1', 'ba1', ZU);
    expect([...(ba1?.geschosse ?? [])].sort()).toEqual(['EG', 'OG']);
    // Bereich über beide Bauabschnitte
    const alle = ortFilter(ORTE, 'ba1eg', 'ba2eg', ZU);
    expect([...(alle?.zonen ?? [])].sort()).toEqual(['BA 1', 'BA 2']);
  });

  it('Vorschlag aus 4D-Regel und Ort', () => {
    const teile = [
      bt({ globalid: 'w1' }),
      bt({ globalid: 'w2', geschoss: 'OG' }),
      bt({ globalid: 'w3', zonen: ['BA 2'] }),
      bt({ globalid: 's1', klasse: 'IfcColumn', kg: 343 }),
      bt({ globalid: 'd1', klasse: 'IfcSlab', kg: 351 }),
    ];
    const f = ortFilter(ORTE, 'ba1eg', 'ba1eg', ZU);
    expect(vorschlag4d({ kgs: [340], klassen: [] }, f, teile).map((r) => r.g)).toEqual([
      'w1',
      's1',
    ]);
    expect(vorschlag4d({ kgs: [], klassen: ['IfcColumn'] }, null, teile).map((r) => r.g)).toEqual([
      's1',
    ]);
    expect(vorschlag4d({ kgs: [], klassen: [] }, null, teile)).toEqual([]);
  });

  it('Zustände am Stichtag, mehrere Vorgänge, Soll-Vergleich', () => {
    const z = zeitraeume([
      {
        bauteil_refs: '[{"m":"m","g":"w1"}]',
        anfang: '2027-03-01',
        ende: '2027-03-10',
        gewerk: 'Rohbau',
      },
      {
        bauteil_refs: '[{"m":"m","g":"w1"},{"m":"m","g":"w2"}]',
        anfang: '2027-03-05',
        ende: '2027-03-20',
        gewerk: 'Putz',
      },
    ]);
    expect(z.get('m:w1')).toEqual({ anfang: '2027-03-01', ende: '2027-03-20', gewerk: 'Rohbau' });
    const w1 = z.get('m:w1');
    expect([
      zustandAm('2027-02-28', w1),
      zustandAm('2027-03-01', w1),
      zustandAm('2027-03-20', w1),
      zustandAm('2027-03-21', w1),
      zustandAm('2027-03-21', undefined),
    ]).toEqual(['zukunft', 'laufend', 'laufend', 'fertig', 'ohne']);
    // laut Soll bis 15.03. fertig, im Plan bis 20.03. → am 16.03. rot
    const soll = { anfang: '2027-03-01', ende: '2027-03-15', gewerk: '' };
    expect(zustandAm('2027-03-16', w1, soll)).toBe('verspaetet');
    expect(zustandAm('2027-03-21', w1, soll)).toBe('fertig');
    expect(refsLesen('kaputt')).toEqual([]);
  });
});

describe('4D im Projekt', () => {
  it('Zonen, Ort-Zuordnung, Regel, Verknüpfung und betroffene Vorgänge beim Neu-Einlesen', async () => {
    const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-b4-'));
    ordner.push(o);
    const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'B4', {
      appVersion: '0.0.1',
      autosaveMs: 0,
      plugins: [terminePlugin, kostenPlugin, bimPlugin],
    });
    const befehl = (plugin: string, name: string, daten: unknown) =>
      s.befehl({ plugin, name, daten });
    const neu = (plugin: string, name: string, daten: unknown, tabelle: string) =>
      befehl(plugin, name, daten).aenderungen.find(
        (a) => a.art === 'einfuegen' && a.tabelle === tabelle,
      )?.id ?? '';
    await s.dateiImport(
      'bim',
      'ifc',
      new Uint8Array(fs.readFileSync(modell('freecad-halle-zonen.ifc'))),
      {
        dateiname: 'halle.ifc',
      },
    );
    const [m] = s.abfrage('bim', 'modelle', undefined) as ModellZeile[];
    const st = s.abfrage('bim', 'struktur', { modellId: m?.id }) as {
      geschosse: GeschossZeile[];
      bauteile: BauteilZeile[];
    };
    expect(st.bauteile.find((b) => b.name === 'Aussenwand 1')?.zonen).toEqual(['BA 1']);
    expect(st.bauteile.find((b) => b.name === 'Stuetze 2')?.zonen).toEqual(['BA 2']);
    expect(st.bauteile.find((b) => b.name === 'Bodenplatte')?.zonen).toEqual([]);

    // Termine: Plan, Ort „BA 1“, Vorgang „Rohbau BA 1“ mit diesem Ort
    const planId = neu(
      'termine',
      'plan.anlegen',
      { name: 'Bau', projektstart: '2027-03-01' },
      't_plan',
    );
    const ba1 = neu('termine', 'ort.anlegen', { name: 'BA 1' }, 't_ort');
    const v = neu(
      'termine',
      'vorgang.anlegen',
      { planId, name: 'Rohbau BA 1', dauer: 10 },
      't_vorgang',
    );
    befehl('termine', 'vorgang.aendern', { id: v, felder: { ort_von: ba1, ort_bis: ba1 } });
    befehl('bim', 'ortzuordnung.setzen', {
      zuordnungen: [{ ortId: ba1, geschosse: ['EG'], zonen: ['BA 1'] }],
    });
    befehl('bim', 'regel4d.setzen', { vorgangId: v, kgs: [340], klassen: ['IfcColumn'] });
    const vierD = s.abfrage('bim', 'vierD', undefined) as {
      ortZuordnungen: OrtZuordnung[];
      regeln: { vorgang_id: string; kgs: number[]; klassen: string[] }[];
    };
    expect(vierD.regeln).toEqual([{ vorgang_id: v, kgs: [340], klassen: ['IfcColumn'] }]);

    // Vorschlag wie in der Oberfläche: Regel + Ort → Bauteile
    const plan = s.abfrage('termine', 'plan', { planId }) as {
      vorgaenge: {
        id: string;
        ort_von: string | null;
        ort_bis: string | null;
        bauteil_refs: string;
      }[];
      orte: { id: string; parent_id: string | null; name: string; reihenfolge: number }[];
    };
    const vg = plan.vorgaenge.find((x) => x.id === v);
    const regeln = s.abfrage('bim', 'regeln', undefined) as RegelZeile[];
    const geschossName = new Map(st.geschosse.map((g) => [g.id, g.name]));
    const teile: Bauteil4d[] = st.bauteile.map((b) => ({
      modell_id: b.modell_id,
      globalid: b.globalid,
      klasse: b.klasse,
      geschoss: b.geschoss_id ? (geschossName.get(b.geschoss_id) ?? '') : '',
      zonen: b.zonen,
      kg: zuordnen(b, regeln).kg,
    }));
    const f = ortFilter(plan.orte, vg?.ort_von ?? null, vg?.ort_bis ?? null, vierD.ortZuordnungen);
    const refs = vorschlag4d({ kgs: [340], klassen: ['IfcColumn'] }, f, teile);
    const name = (g: string) => st.bauteile.find((b) => b.globalid === g)?.name;
    expect(refs.map((r) => name(r.g)).sort()).toEqual([
      'Aussenwand 1',
      'Aussenwand 2',
      'Stuetze 1',
    ]);

    befehl('termine', 'bauteile.setzen', { aenderungen: [{ vorgangId: v, bauteile: refs }] });
    // hinzufügen ohne Doppelte, lösen
    befehl('termine', 'bauteile.setzen', {
      aenderungen: [{ vorgangId: v, bauteile: refs.slice(0, 1), modus: 'hinzufuegen' }],
    });
    const lesenRefs = () =>
      refsLesen(
        (s.abfrage('termine', 'plan', { planId }) as typeof plan).vorgaenge.find((x) => x.id === v)
          ?.bauteil_refs,
      );
    expect(lesenRefs()).toHaveLength(3);
    befehl('termine', 'bauteile.setzen', {
      aenderungen: [{ vorgangId: v, bauteile: refs.slice(0, 1), modus: 'loesen' }],
    });
    expect(lesenRefs()).toHaveLength(2);
    s.rueckgaengig();
    expect(lesenRefs()).toHaveLength(3);

    // Neu einlesen ohne Wände → Bericht nennt den Vorgang
    const e = await s.dateiImport(
      'bim',
      'ifc-neu',
      new Uint8Array(fs.readFileSync(modell('freecad-halle-tragwerk.ifc'))),
      {
        dateiname: 'tragwerk.ifc',
        modellId: m?.id,
      },
    );
    expect((e.vorschau?.details as Aenderungsbericht).vorgaenge).toEqual([
      { plan: 'Bau', nr: '1', name: 'Rohbau BA 1', entfernt: 2, geaendert: 0 },
    ]);
    s.schliessen();
  });
});
