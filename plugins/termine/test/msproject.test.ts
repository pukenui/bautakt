import { ProjektSitzung, type StandZeile } from '@bautakt/kern';
import { Arbeitskalender } from '@bautakt/rechnen-kalender';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlanDaten, PlanZeile } from '../gemeinsam/typen.js';
import { terminePlugin } from '../main/index.js';
import { dauerMinuten, msProjectLesen } from '../main/msproject.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));
const kal = new Arbeitskalender({ start: '2026-12-14' });

/** R-01 mit Ist, Bedingung, KT-Abstand, Soll-Stand und Ruhezeit. */
function aufbau() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-msp-'));
  ordner.push(o);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'Halle', {
    appVersion: 'test',
    autosaveMs: 0,
    plugins: [terminePlugin],
  });
  const befehl = (name: string, daten: unknown, plugin = 'termine') =>
    s.befehl({ plugin, name, daten });
  const neu = (name: string, daten: unknown, tabelle: string) =>
    befehl(name, daten).aenderungen.find((a) => a.art === 'einfuegen' && a.tabelle === tabelle)
      ?.id ?? '';
  const planId = neu('plan.anlegen', { name: 'R-01', projektstart: '2026-12-14' }, 't_plan');
  const plan = () => s.abfrage('termine', 'plan', { planId }) as PlanDaten;
  const zeilen: [number, string][] = [
    [70, ''],
    [20, '1EA+10'],
    [20, '1EA+15'],
    [35, '2EA; 3EA'],
    [80, '3EA'],
    [50, '4EA+30; 5EA'],
  ];
  const ids = zeilen.map(([d]) => {
    const id = neu('vorgang.anlegen', { planId }, 't_vorgang');
    befehl('vorgang.aendern', {
      id,
      felder: { dauer_at: d, quelle_annahme: 'UE 05', gewerk: 'Rohbau' },
    });
    return id;
  });
  zeilen.forEach(([, vg], i) => vg && befehl('vorgaenger.setzen', { nachId: ids[i], text: vg }));
  return { s, befehl, neu, planId, plan, ids, o };
}

describe('MS-Project-XML (E-79–E-81)', () => {
  it('Dauerangaben lesen', () => {
    expect(dauerMinuten('PT560H0M0S')).toBe(33600);
    expect(dauerMinuten('PT8H30M0S')).toBe(510);
    expect(dauerMinuten('P2DT4H')).toBe(2 * 1440 + 240);
    expect(dauerMinuten('Unsinn')).toBe(0);
  });

  it('Export → Import (neuer Plan) ergibt dieselben Termine', async () => {
    const u = aufbau();
    // Meilenstein mit Bedingung, KT-Abstand, Ruhezeit
    const m = u.neu(
      'vorgang.anlegen',
      { planId: u.planId, typ: 'meilenstein', name: 'Übergabe' },
      't_vorgang',
    );
    u.befehl('vorgang.aendern', {
      id: m,
      felder: {
        bedingung_typ: 'nicht_frueher_als',
        bedingung_datum: '2027-12-20',
        quelle_annahme: 'Vertrag',
      },
    });
    u.befehl('vorgaenger.setzen', { nachId: m, text: '6EA+14KT' });
    const kalender = u.plan().plan.kalender_id;
    u.befehl('ruhezeit.anlegen', {
      kalenderId: kalender,
      von: '2027-08-02',
      bis: '2027-08-13',
      name: 'Betriebsferien',
    });
    const datei = await u.s.dateiExport('termine', 'msproject', {
      planId: u.planId,
      projektname: 'Halle',
    });
    expect(datei.info).toEqual({ endung: 'xml', beschreibung: 'MS-Project-XML' });
    const xml = String(datei.daten);
    expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
    expect(xml).toContain('<Name>Betriebsferien</Name>');
    expect(xml).toContain('<ConstraintType>4</ConstraintType>');
    expect(xml).toContain('<LagFormat>8</LagFormat>');

    const xmlDatei = path.join(u.o, 'export.xml');
    fs.writeFileSync(xmlDatei, xml);
    const e = u.s.dateiImport('termine', 'msproject', new Uint8Array(fs.readFileSync(xmlDatei)), {
      dateiname: 'export.xml',
    });
    expect(e.bericht).toEqual([]);
    const plaene = u.s.abfrage('termine', 'plaene', undefined) as PlanZeile[];
    expect(plaene).toHaveLength(2);
    const neu = plaene.find((p) => p.id !== u.planId) as PlanZeile;
    expect(neu.name).toBe('Halle – R-01');
    const a = u.plan();
    const b = u.s.abfrage('termine', 'plan', { planId: neu.id }) as PlanDaten;
    if (!a.berechnung.ok || !b.berechnung.ok) throw new Error('nicht rechenbar');
    const termine = (d: PlanDaten) =>
      d.vorgaenge.map((v) => {
        const t = d.berechnung.ok ? d.berechnung.termine[v.id] : undefined;
        return [v.name, v.typ, t?.anfang, t?.ende, t?.gp];
      });
    expect(termine(b)).toEqual(termine(a));
    expect(b.vorgaenge[0]).toMatchObject({ quelle_annahme: 'UE 05', gewerk: 'Rohbau' });
    expect(b.vorgaenge.at(-1)).toMatchObject({
      bedingung_typ: 'nicht_frueher_als',
      bedingung_datum: '2027-12-20',
    });
    expect(b.beziehungen.find((x) => x.einheit === 'KT')).toMatchObject({ art: 'EA', abstand: 14 });
    expect(b.ruhezeiten.some((r) => r.name === 'Betriebsferien' && r.von === '2027-08-02')).toBe(
      true,
    );
    // Rückgängig entfernt den importierten Plan wieder
    u.s.rueckgaengig();
    expect(u.s.abfrage('termine', 'plaene', undefined) as PlanZeile[]).toHaveLength(1);
    u.s.schliessen();
  });

  it('Export mit Ist und Basisplan; Import ersetzt den Plan inklusive Ist', async () => {
    const u = aufbau();
    u.befehl('stand.speichern', { name: 'Soll' }, 'kern');
    const stand = (u.s.abfrage('kern', 'staende', undefined) as StandZeile[])[0];
    const stichtag = kal.endeDatum(100);
    u.befehl('plan.aendern', { id: u.planId, stichtag });
    u.befehl('ist.setzen', {
      vorgangId: u.ids[0],
      stichtag,
      ist_anfang: kal.anfangDatum(0),
      ist_ende: kal.endeDatum(75),
    });
    u.befehl('ist.setzen', {
      vorgangId: u.ids[1],
      stichtag,
      ist_anfang: kal.anfangDatum(85),
      fertig_prozent: 50,
    });
    const xml = String(
      (
        await u.s.dateiExport('termine', 'msproject', {
          planId: u.planId,
          sollStandId: stand?.id,
          projektname: 'Halle',
        })
      ).daten,
    );
    expect(xml).toContain(`<StatusDate>${stichtag}T17:00:00</StatusDate>`);
    expect(xml).toContain(`<ActualFinish>${kal.endeDatum(75)}T17:00:00</ActualFinish>`);
    expect(xml).toContain('<PercentComplete>50</PercentComplete>');
    expect(xml).toContain('<Baseline><Number>0</Number>');

    const vorher = u.plan();
    // in denselben Plan zurückspielen
    const e = u.s.dateiImport('termine', 'msproject', new TextEncoder().encode(xml), {
      dateiname: 'x.xml',
      ziel: 'ersetzen',
      planId: u.planId,
    });
    expect(e.bericht).toEqual([
      'Basispläne weggelassen – bei Bedarf in Bautakt einen Soll-Stand speichern.',
    ]);
    const nachher = u.plan();
    expect(nachher.plan.stichtag).toBe(stichtag);
    if (!vorher.berechnung.ok || !nachher.berechnung.ok) throw new Error('nicht rechenbar');
    expect(nachher.berechnung.projektende).toBe(vorher.berechnung.projektende);
    const istNachher = Object.values(nachher.ist).map((i) => [i.ist_ende, i.fertig_prozent]);
    expect(istNachher).toEqual(
      expect.arrayContaining([
        [kal.endeDatum(75), null],
        [null, 50],
      ]),
    );
    expect(u.s.abfrage('termine', 'plaene', undefined) as PlanZeile[]).toHaveLength(1);
    u.s.rueckgaengig();
    expect(u.plan().vorgaenge.map((v) => v.id)).toEqual(vorher.vorgaenge.map((v) => v.id));
    u.s.schliessen();
  });

  it('Fremde Datei: Stunden, Einschränkungen, Ressourcen, Sammelvorgang-Beziehung → Bericht', () => {
    const xml = `<?xml version="1.0"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>Bürogebäude</Title><StartDate>2027-03-01T08:00:00</StartDate><MinutesPerDay>480</MinutesPerDay><CalendarUID>1</CalendarUID>
  <Calendars><Calendar><UID>1</UID><Name>Standard</Name>
    <WeekDays>
      <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
      <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
      <WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>2027-04-02T00:00:00</FromDate><ToDate>2027-04-05T23:59:00</ToDate></TimePeriod></WeekDay>
    </WeekDays></Calendar></Calendars>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Bürogebäude</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>1</UID><ID>1</ID><Name>Rohbau</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary><Duration>PT80H0M0S</Duration></Task>
    <Task><UID>2</UID><ID>2</ID><Name>Erdarbeiten</Name><OutlineLevel>2</OutlineLevel><Duration>PT36H0M0S</Duration><ConstraintType>2</ConstraintType><ConstraintDate>2027-03-03T08:00:00</ConstraintDate></Task>
    <Task><UID>3</UID><ID>3</ID><Name>Gründung</Name><OutlineLevel>2</OutlineLevel><Duration>PT40H0M0S</Duration><ConstraintType>6</ConstraintType><ConstraintDate>2027-03-20T08:00:00</ConstraintDate>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>2400</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
    <Task><UID>4</UID><ID>4</ID><Name>Rohbau fertig</Name><OutlineLevel>1</OutlineLevel><Milestone>1</Milestone><Duration>PT0H0M0S</Duration>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink>
      <PredecessorLink><PredecessorUID>3</PredecessorUID><Type>3</Type><LinkLag>14400</LinkLag><LagFormat>8</LagFormat></PredecessorLink></Task>
  </Tasks>
  <Resources><Resource><UID>0</UID></Resource><Resource><UID>1</UID><Name>Polier</Name></Resource></Resources>
</Project>`;
    const { daten, bericht } = msProjectLesen(xml, 'buero.xml');
    expect(daten.plan).toMatchObject({
      name: 'Bürogebäude',
      projektstart: '2027-03-01',
      arbeitstage: [true, true, true, true, true, false, false],
    });
    expect(daten.plan.ruhezeiten).toEqual([
      { von: '2027-04-02', bis: '2027-04-05', name: 'arbeitsfrei' },
    ]);
    expect(daten.vorgaenge.map((v) => [v.nr, v.name, v.typ, v.dauer, v.parent])).toEqual([
      ['1', 'Rohbau', 'sammel', 0, null],
      ['2', 'Erdarbeiten', 'vorgang', 5, '1'], // 36 h = 4,5 AT → 5
      ['3', 'Gründung', 'vorgang', 5, '1'],
      ['4', 'Rohbau fertig', 'meilenstein', 0, null],
    ]);
    expect(daten.vorgaenge[1]).toMatchObject({
      bedingung_typ: 'nicht_frueher_als',
      bedingung_datum: '2027-03-03',
      quelle_annahme: 'Import MS Project (buero.xml)',
    });
    expect(daten.beziehungen).toEqual([
      { von: '2', nach: '3', art: 'EA', abstand: 1, einheit: 'AT' }, // 2400 Zehntelminuten = 0,5 AT → 1 (gerundet)
      { von: '3', nach: '4', art: 'AA', abstand: 1, einheit: 'KT' },
    ]);
    expect(bericht).toEqual([
      'Einschränkung von „Gründung“ (Art 6) weggelassen – Bautakt kennt „nicht früher als“ und „muss enden am“.',
      '1 Dauer(n) auf ganze Arbeitstage aufgerundet.',
      'Beziehung an einem Sammelvorgang (UID 1 → 4) weggelassen (E-14).',
      '1 Abstand/Abstände auf ganze Tage gerundet.',
      '1 Ressource(n) weggelassen (Bautakt plant ohne Ressourcen).',
    ]);
  });

  it('keine MS-Project-Datei', () => {
    expect(() => msProjectLesen('<html><body/></html>', 'x.xml')).toThrow(/keine MS-Project-XML/);
  });
});
