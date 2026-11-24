import { ProjektSitzung, Projektdatei, migrationenAusfuehren } from '@bautakt/kern';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlanDaten, PlanZeile } from '../gemeinsam/typen.js';
import { terminePlugin } from '../main/index.js';
import { MIGRATIONEN } from '../migrations/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

function tempPfad() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-termine-'));
  ordner.push(o);
  return path.join(o, 'p.bautakt');
}

const optionen = { appVersion: 'test', autosaveMs: 0, plugins: [terminePlugin] };

/** Kleine Testhilfe rund um eine Sitzung mit einem Plan. */
function umgebung(planName = 'Terminplan') {
  const s = ProjektSitzung.neu(tempPfad(), 'P', optionen);
  const befehl = (name: string, daten: unknown) => s.befehl({ plugin: 'termine', name, daten });
  const eingefuegt = (name: string, daten: unknown, tabelle: string) =>
    befehl(name, daten).aenderungen.find((a) => a.art === 'einfuegen' && a.tabelle === tabelle)
      ?.id ?? '';
  const planId = eingefuegt(
    'plan.anlegen',
    { name: planName, projektstart: '2026-12-14' },
    't_plan',
  );
  const daten = () => s.abfrage('termine', 'plan', { planId }) as PlanDaten;
  const vorgang = (felder: Record<string, unknown>, typ = 'vorgang', extra: object = {}) => {
    const id = eingefuegt('vorgang.anlegen', { planId, typ, ...extra }, 't_vorgang');
    if (Object.keys(felder).length) befehl('vorgang.aendern', { id, felder });
    return id;
  };
  const termine = (nr: string) => {
    const d = daten();
    const v = d.vorgaenge.find((x) => x.nr === nr);
    if (!d.berechnung.ok) throw new Error(d.berechnung.fehler);
    return v ? d.berechnung.termine[v.id] : undefined;
  };
  return { s, befehl, planId, daten, vorgang, termine };
}

describe('Plugin termine: R-01 über die Befehle eingegeben', () => {
  it('Vorgänge + Vorgänger-Spalte → Sollwerte; Undo/Redo; Soll-Ende (R-02)', () => {
    const u = umgebung();
    const zeilen: [string, number, string][] = [
      ['Planung', 70, ''],
      ['Erdarbeiten', 20, '1EA+10'],
      ['Beschaffung/Vormontage FTE', 20, '1EA+15'],
      ['Fundamente', 35, '2EA; 3EA'],
      ['Produktion/Lieferung', 80, '3EA'],
      ['Montage', 50, '4EA+30; 5EA'],
    ];
    const ids = zeilen.map(([name, dauer]) =>
      u.vorgang({ name, dauer_at: dauer, quelle_annahme: 'UE 05' }),
    );
    zeilen.forEach(
      ([, , vg], i) => vg && u.befehl('vorgaenger.setzen', { nachId: ids[i], text: vg }),
    );

    expect(u.daten().vorgaenge.map((v) => v.nr)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(u.termine('2')).toMatchObject({
      faz: 80,
      fez: 100,
      saz: 100,
      sez: 120,
      gp: 20,
      fp: 5,
      kritisch: false,
    });
    expect(u.termine('4')).toMatchObject({ gp: 15, fp: 15 });
    expect(u.termine('6')).toMatchObject({ faz: 185, fez: 235, kritisch: true });
    const d = u.daten();
    if (!d.berechnung.ok) throw new Error();
    expect(d.berechnung.projektende).toBe(235);
    expect(d.berechnung.kritischeBeziehungen).toHaveLength(3); // 1→3, 3→5, 5→6
    expect(u.termine('1')).toMatchObject({ anfang: '2026-12-14' });

    // Undo der letzten Vorgänger-Eingabe → 6 hat keine Vorgänger mehr
    u.s.rueckgaengig();
    expect(u.termine('6')).toMatchObject({ faz: 0 });
    u.s.wiederholen();
    expect(u.termine('6')).toMatchObject({ faz: 185 });

    // Soll-Ende = Ende des 220. Arbeitstags (R-02)
    const soll = datumVonAT(u, 220);
    u.befehl('plan.aendern', { id: u.planId, soll_ende: soll, rueckwaerts_von: 'soll_ende' });
    expect(u.termine('1')).toMatchObject({ saz: -15, gp: -15, kritisch: true });
    expect(u.termine('4')).toMatchObject({ gp: 0, kritisch: false });
    const d2 = u.daten();
    expect(d2.berechnung.ok && d2.berechnung.abweichungSollEnde).toBe(15);
    // ohne Soll-Ende ist die Rückwärtsrechnung vom Soll-Ende nicht möglich
    expect(() => u.befehl('plan.aendern', { id: u.planId, soll_ende: null })).toThrow(/Soll-Ende/);
    u.s.schliessen();
  });

  it('Vorgänger-Spalte lehnt Zirkelbezug, unbekannte Nr. und Syntaxfehler ab – ohne Änderung', () => {
    const u = umgebung();
    const [a, b, c] = [u.vorgang({}), u.vorgang({}), u.vorgang({})];
    u.befehl('vorgaenger.setzen', { nachId: b, text: '1' });
    u.befehl('vorgaenger.setzen', { nachId: c, text: '2' });
    expect(() => u.befehl('vorgaenger.setzen', { nachId: a, text: '3' })).toThrow(
      'Zirkelbezug: 1 → 2 → 3 → 1',
    );
    expect(() => u.befehl('vorgaenger.setzen', { nachId: a, text: '99' })).toThrow(
      /Position 1: Vorgang 99 existiert nicht/,
    );
    expect(() => u.befehl('vorgaenger.setzen', { nachId: a, text: '1XY+3' })).toThrow(
      /Position 2: unbekannte Beziehungsart/,
    );
    expect(() => u.befehl('vorgaenger.setzen', { nachId: a, text: '1' })).toThrow(
      /eigener Vorgänger/,
    );
    expect(u.daten().beziehungen).toHaveLength(2);
    // gleiche Eingabe erneut → keine Änderung, kein neuer Undo-Eintrag
    const anzahlVorher = JSON.parse(u.s.alsJson()).tabellen.aenderungsprotokoll.length;
    u.befehl('vorgaenger.setzen', { nachId: c, text: '2EA' });
    expect(JSON.parse(u.s.alsJson()).tabellen.aenderungsprotokoll.length).toBe(anzahlVorher);
    u.s.schliessen();
  });
});

describe('Gliederung (E-14)', () => {
  it('einrücken macht den Vorgang darüber zum Sammelvorgang, ausrücken stellt die Ebene wieder her', () => {
    const u = umgebung();
    const rohbau = u.vorgang({ name: 'Rohbau' });
    const wand = u.vorgang({ name: 'Wände', dauer_at: 10 });
    const decke = u.vorgang({ name: 'Decken', dauer_at: 5 });
    u.befehl('vorgaenger.setzen', { nachId: decke, text: '2' });
    u.befehl('vorgang.einruecken', { id: wand });
    u.befehl('vorgang.einruecken', { id: decke });
    let d = u.daten();
    expect(d.vorgaenge.map((v) => [v.name, v.ebene, v.typ])).toEqual([
      ['Rohbau', 0, 'sammel'],
      ['Wände', 1, 'vorgang'],
      ['Decken', 1, 'vorgang'],
    ]);
    expect(u.termine('1')).toMatchObject({ faz: 0, fez: 15, fp: null });

    expect(() => u.befehl('beziehung.anlegen', { von: rohbau, nach: decke })).toThrow(
      /Sammelvorgang 1/,
    );
    u.befehl('vorgang.ausruecken', { id: decke });
    expect(() => u.befehl('vorgang.einruecken', { id: decke })).not.toThrow(); // unter Rohbau (Sammel)
    u.befehl('vorgang.ausruecken', { id: decke });
    d = u.daten();
    expect(d.vorgaenge.map((v) => [v.name, v.ebene])).toEqual([
      ['Rohbau', 0],
      ['Wände', 1],
      ['Decken', 0],
    ]);
    // Vorgang mit Beziehungen kann nicht Sammelvorgang werden
    const x = u.vorgang({ name: 'X' });
    expect(() => u.befehl('vorgang.einruecken', { id: x })).toThrow(/Anordnungsbeziehungen/);
    // Neuer Vorgang nach „Wände“ landet auf derselben Ebene
    u.befehl('vorgang.anlegen', { planId: u.planId, nachId: wand, name: 'Stützen' });
    expect(u.daten().vorgaenge.map((v) => [v.name, v.ebene])).toEqual([
      ['Rohbau', 0],
      ['Wände', 1],
      ['Stützen', 1],
      ['Decken', 0],
      ['X', 0],
    ]);
    u.befehl('vorgang.verschieben', { id: x, richtung: 'hoch' });
    expect(u.daten().vorgaenge.map((v) => v.name)).toEqual([
      'Rohbau',
      'Wände',
      'Stützen',
      'X',
      'Decken',
    ]);
    u.s.schliessen();
  });

  it('Löschen eines Sammelvorgangs entfernt Unterpunkte und Beziehungen; Undo stellt alles her', () => {
    const u = umgebung();
    const s = u.vorgang({ name: 'S' }, 'sammel');
    const a = u.vorgang({}, 'vorgang', { parentId: s });
    const b = u.vorgang({});
    u.befehl('beziehung.anlegen', { von: a, nach: b, art: 'EA', abstand: 2, einheit: 'KT' });
    const vorher = JSON.stringify(u.daten());
    u.befehl('vorgang.loeschen', { ids: [s] });
    expect(u.daten().vorgaenge.map((v) => v.id)).toEqual([b]);
    expect(u.daten().beziehungen).toEqual([]);
    u.s.rueckgaengig();
    expect(JSON.stringify(u.daten())).toBe(vorher);
    u.s.schliessen();
  });
});

describe('Vorgangseigenschaften (E-13) und Bedingungen (E-19)', () => {
  it('prüft Nr., Daten und Bedingungen; Schnittstellen-Meilenstein mit „nicht früher als“', () => {
    const u = umgebung();
    const a = u.vorgang({ dauer_at: 5 });
    const m = u.vorgang({});
    expect(() => u.befehl('vorgang.aendern', { id: m, felder: { nr: '1' } })).toThrow(
      /schon vergeben/,
    );
    expect(() => u.befehl('vorgang.aendern', { id: m, felder: { dauer_at: 1.5 } })).toThrow(
      /ganze Zahl/,
    );
    expect(() => u.befehl('vorgang.aendern', { id: m, felder: { unbekannt: 1 } })).toThrow();
    expect(() =>
      u.befehl('vorgang.aendern', { id: m, felder: { bedingung_typ: 'nicht_frueher_als' } }),
    ).toThrow(/Datum/);
    u.befehl('vorgang.aendern', {
      id: m,
      felder: {
        typ: 'meilenstein',
        name: 'Übergabe des freien Baufelds',
        schnittstelle: true,
        bedingung_typ: 'nicht_frueher_als',
        bedingung_datum: '2027-01-11',
      },
    });
    u.befehl('beziehung.anlegen', { von: m, nach: a });
    const mm = u.daten().vorgaenge.find((v) => v.id === m);
    expect(mm).toMatchObject({ dauer_at: 0, schnittstelle: 1, typ: 'meilenstein' });
    // 14.12. AT1 … 24.12. AT9, 25./26.12. Feiertag, 28.–31.12. AT10–13, 01.01. Feiertag,
    // 04.–08.01. AT14–18, Mo 11.01. = AT19 → frühester Anfang Zeitpunkt 18
    expect(u.termine('2')).toMatchObject({ faz: 18, anfang: '2027-01-08' });
    expect(u.termine('1')).toMatchObject({ faz: 18, anfang: '2027-01-11' });
    u.s.schliessen();
  });
});

describe('Kalender und Ruhezeiten (E-12)', () => {
  it('Ruhezeit verschiebt Termine (R-07), Arbeitstage-Maske wirkt', () => {
    const u = umgebung();
    u.vorgang({ dauer_at: 10 });
    const kalId = u.daten().plan.kalender_id ?? '';
    u.befehl('ruhezeit.anlegen', {
      kalenderId: kalId,
      von: '2026-12-21',
      bis: '2027-01-01',
      name: 'Weihnachtspause',
    });
    expect(u.termine('1')).toMatchObject({ anfang: '2026-12-14', ende: '2027-01-08' });
    expect(() =>
      u.befehl('ruhezeit.anlegen', { kalenderId: kalId, von: '2027-02-01', bis: '2027-01-01' }),
    ).toThrow(/endet vor/);
    u.befehl('kalender.aendern', {
      id: kalId,
      arbeitstage: [true, true, true, true, true, true, false],
    });
    // Sa 19.12. und Sa 02.01. zählen jetzt: AT6 = 19.12., AT7 = 02.01., … AT10 = Mi 06.01.
    expect(u.termine('1')).toMatchObject({ ende: '2027-01-06' });
    expect(() =>
      u.befehl('kalender.aendern', { id: kalId, arbeitstage: Array(7).fill(false) }),
    ).toThrow(/Mindestens ein/);
    u.s.schliessen();
  });

  it('Plan löschen entfernt alles und lässt sich rückgängig machen', () => {
    const u = umgebung();
    const a = u.vorgang({});
    const b = u.vorgang({});
    u.befehl('beziehung.anlegen', { von: a, nach: b });
    u.befehl('ruhezeit.anlegen', {
      kalenderId: u.daten().plan.kalender_id,
      von: '2027-01-01',
      bis: '2027-01-02',
    });
    const vorher = JSON.stringify(u.daten());
    u.befehl('plan.loeschen', { id: u.planId });
    const json = JSON.parse(u.s.alsJson());
    for (const t of ['t_plan', 't_vorgang', 't_beziehung', 't_kalender', 't_ruhezeit']) {
      expect(json.tabellen[t]).toEqual([]);
    }
    u.s.rueckgaengig();
    expect(JSON.stringify(u.daten())).toBe(vorher);
    u.s.schliessen();
  });
});

describe('Netzplan-Positionen (E-20)', () => {
  it('Verschieben speichert Positionen, Zurücksetzen löscht sie', () => {
    const u = umgebung();
    const a = u.vorgang({});
    u.befehl('netz.position', { positionen: [{ id: a, x: 120.4, y: 80.6 }] });
    expect(u.daten().vorgaenge[0]).toMatchObject({ netz_x: 120, netz_y: 81 });
    u.befehl('netz.zuruecksetzen', { planId: u.planId });
    expect(u.daten().vorgaenge[0]).toMatchObject({ netz_x: null, netz_y: null });
    u.s.schliessen();
  });
});

describe('Migration eines M0-Projekts', () => {
  it('bestehende Pläne bekommen Kalender (UUID v7) und Projektstart', () => {
    const pfad = tempPfad();
    const d = Projektdatei.erstellen(pfad, { projektname: 'Alt', appVersion: '0.0.1' });
    migrationenAusfuehren(d.db, 'termine', MIGRATIONEN.slice(0, 1));
    d.db.prepare("INSERT INTO t_plan (id, name) VALUES ('alt', 'Alter Plan')").run();
    d.schliessen();

    const s = ProjektSitzung.oeffnen(pfad, optionen);
    const [plan] = s.abfrage('termine', 'plaene', undefined) as PlanZeile[];
    expect(plan?.kalender_id?.[14]).toBe('7');
    expect(plan?.projektstart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const daten = s.abfrage('termine', 'plan', { planId: 'alt' }) as PlanDaten;
    expect(daten.kalender).toMatchObject({
      arbeitstage: [true, true, true, true, true, false, false],
      bundesland: 'NW',
    });
    s.schliessen();
  });
});

/** Datum des n-ten Arbeitstags im Plankalender (über einen Hilfsvorgang mit Dauer n). */
function datumVonAT(u: ReturnType<typeof umgebung>, n: number): string {
  const id = u.vorgang({ dauer_at: n, name: 'Hilfe' });
  const d = u.daten();
  const ende = d.berechnung.ok ? d.berechnung.termine[id]?.ende : undefined;
  u.befehl('vorgang.loeschen', { ids: [id] });
  if (!ende) throw new Error('kein Datum');
  return ende;
}
