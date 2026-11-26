import { ProjektSitzung, type StandZeile } from '@bautakt/kern';
import { Arbeitskalender } from '@bautakt/rechnen-kalender';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IstZeile, PlanDaten } from '../gemeinsam/typen.js';
import { terminePlugin } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

/** Kalender des Testplans (Start Mo 14.12.2026, Mo–Fr, NRW) für Datumsangaben in AT. */
const kal = new Arbeitskalender({ start: '2026-12-14' });
const anfangAm = (t: number) => kal.anfangDatum(t);
const endeAm = (t: number) => kal.endeDatum(t);

/** R-01 über die Befehle anlegen. */
function r01() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-ist-'));
  ordner.push(o);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
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
  const zeilen: [number, string][] = [
    [70, ''],
    [20, '1EA+10'],
    [20, '1EA+15'],
    [35, '2EA; 3EA'],
    [80, '3EA'],
    [50, '4EA+30; 5EA'],
  ];
  const ids = zeilen.map(([dauer]) => {
    const id = neu('vorgang.anlegen', { planId }, 't_vorgang');
    befehl('vorgang.aendern', { id, felder: { dauer_at: dauer, quelle_annahme: 'UE 05' } });
    return id;
  });
  zeilen.forEach(([, vg], i) => vg && befehl('vorgaenger.setzen', { nachId: ids[i], text: vg }));
  const daten = (sollStandId?: string) =>
    s.abfrage('termine', 'plan', { planId, ...(sollStandId ? { sollStandId } : {}) }) as PlanDaten;
  const termine = (i: number, d = daten()) =>
    d.berechnung.ok ? d.berechnung.termine[ids[i] ?? ''] : undefined;
  return { s, befehl, planId, ids, daten, termine };
}

describe('Ist-Erfassung und Prognose (E-32, E-43–E-45)', () => {
  it('R-12 über die Befehle: Sollwerte der Prognose', () => {
    const u = r01();
    const stichtag = endeAm(100);
    u.befehl('plan.aendern', { id: u.planId, stichtag });
    const [v1, v2, v3] = u.ids as [string, string, string];
    u.befehl('ist.setzen', {
      vorgangId: v1,
      stichtag,
      ist_anfang: anfangAm(0),
      ist_ende: endeAm(75),
    });
    u.befehl('ist.setzen', {
      vorgangId: v2,
      stichtag,
      ist_anfang: anfangAm(85),
      fertig_prozent: 50,
      ursache: 'witterung',
    });
    u.befehl('ist.setzen', { vorgangId: v3, stichtag, ist_anfang: anfangAm(90), restdauer_at: 12 });

    const soll = [
      { faz: 0, fez: 75, gp: 0, kritisch: false, status: 'fertig' },
      { faz: 85, fez: 110, saz: 102, sez: 127, gp: 17, fp: 2, status: 'begonnen' },
      { faz: 90, fez: 112, gp: 0, kritisch: true, status: 'begonnen' },
      { faz: 112, fez: 147, gp: 15, fp: 15, status: 'geplant' },
      { faz: 112, fez: 192, kritisch: true },
      { faz: 192, fez: 242, kritisch: true },
    ];
    soll.forEach((w, i) => expect(u.termine(i), `Vorgang ${i + 1}`).toMatchObject(w));
    expect(u.termine(0)).toMatchObject({ anfang: '2026-12-14', ende: endeAm(75) });
    const d = u.daten();
    expect(d.ist[v1]).toMatchObject({ fertig_prozent: 100, restdauer_at: null });
    expect(d.ist[v2]).toMatchObject({ ursache: 'witterung' });
    expect(d.berechnung.ok && d.berechnung.projektende).toBe(242);
    u.s.schliessen();
  });

  it('Soll-Ist-Vergleich gegen einen Stand: Abweichung in AT (E-46)', () => {
    const u = r01();
    u.befehl('stand.speichern', { name: 'Soll Vertrag' }, 'kern');
    const standId = (u.s.abfrage('kern', 'staende', undefined) as StandZeile[])[0]?.id;
    const stichtag = endeAm(100);
    u.befehl('plan.aendern', { id: u.planId, stichtag });
    u.befehl('ist.setzen', {
      vorgangId: u.ids[0],
      stichtag,
      ist_anfang: anfangAm(0),
      ist_ende: endeAm(75),
    });

    const d = u.daten(standId);
    expect(d.vergleich?.standName).toBe('Soll Vertrag');
    const v6 = d.vergleich?.termine[u.ids[5] ?? ''];
    expect(v6).toMatchObject({ faz: 185, fez: 235, ende: endeAm(235) });
    // 2 und 3 nicht begonnen → frühestens am Stichtag 100 (E-44): 3 endet 120, 5 endet 200,
    // Montage 200–250 → 15 AT später als im Soll (235)
    expect(v6?.abweichung).toBe(15);
    expect(d.vergleich?.termine[u.ids[0] ?? '']?.abweichung).toBe(5);
    expect(u.daten().vergleich).toBeNull();
    u.s.schliessen();
  });

  it('Verlauf je Stichtag: die jüngste Meldung bis zum Stichtag zählt (E-45)', () => {
    const u = r01();
    const v1 = u.ids[0] ?? '';
    u.befehl('ist.setzen', {
      vorgangId: v1,
      stichtag: endeAm(20),
      ist_anfang: anfangAm(0),
      fertig_prozent: 20,
    });
    u.befehl('ist.setzen', {
      vorgangId: v1,
      stichtag: endeAm(40),
      ist_anfang: anfangAm(0),
      restdauer_at: 40,
    });
    // gleiche Meldung erneut → Änderung statt neuer Zeile
    u.befehl('ist.setzen', {
      vorgangId: v1,
      stichtag: endeAm(40),
      ist_anfang: anfangAm(0),
      restdauer_at: 45,
    });
    const verlauf = u.s.abfrage('termine', 'istVerlauf', { vorgangId: v1 }) as IstZeile[];
    expect(verlauf.map((z) => [z.stichtag, z.fertig_prozent, z.restdauer_at])).toEqual([
      [endeAm(40), null, 45],
      [endeAm(20), 20, null],
    ]);

    u.befehl('plan.aendern', { id: u.planId, stichtag: endeAm(30) });
    expect(u.termine(0)).toMatchObject({ faz: 0, fez: 30 + 56, status: 'begonnen' }); // ⌈70 × 0,8⌉ = 56
    u.befehl('plan.aendern', { id: u.planId, stichtag: endeAm(40) });
    expect(u.termine(0)).toMatchObject({ fez: 40 + 45 });
    // ohne Stichtag: reiner Plan
    u.befehl('plan.aendern', { id: u.planId, stichtag: null });
    expect(u.termine(0)).toMatchObject({ faz: 0, fez: 70, status: 'geplant' });
    u.s.schliessen();
  });

  it('prüft die Ist-Meldung', () => {
    const u = r01();
    const v = u.ids[0];
    const st = endeAm(50);
    const ist = (felder: object) =>
      u.befehl('ist.setzen', { vorgangId: v, stichtag: st, ...felder });
    expect(() => ist({ ist_anfang: anfangAm(60) })).toThrow(/nach dem Stichtag/);
    expect(() => ist({ ist_anfang: anfangAm(0), ist_ende: endeAm(60) })).toThrow(
      /nach dem Stichtag/,
    );
    expect(() => ist({ ist_anfang: anfangAm(10), ist_ende: endeAm(5) })).toThrow(
      /vor dem Ist-Anfang/,
    );
    expect(() => ist({ ist_anfang: anfangAm(0) })).toThrow(/Fertigstellungsgrad oder Restdauer/);
    expect(() => ist({ ist_anfang: anfangAm(0), fertig_prozent: 100 })).toThrow(/Ist-Ende/);
    expect(() => ist({ fertig_prozent: 30 })).toThrow(/ohne Ist-Anfang/);
    expect(() => ist({ ist_anfang: anfangAm(0), fertig_prozent: 101 })).toThrow(/0–100/);
    expect(() => ist({ ist_ende: endeAm(5) })).toThrow(/Ist-Anfang/);
    u.s.schliessen();
  });

  it('Löschen eines Vorgangs entfernt seine Ist-Meldungen (rückgängig machbar)', () => {
    const u = r01();
    const v = u.ids[5] ?? '';
    u.befehl('ist.setzen', {
      vorgangId: v,
      stichtag: endeAm(10),
      ist_anfang: anfangAm(0),
      fertig_prozent: 10,
    });
    u.befehl('vorgang.loeschen', { ids: [v] });
    expect(JSON.parse(u.s.alsJson()).tabellen.t_ist).toEqual([]);
    u.s.rueckgaengig();
    expect(JSON.parse(u.s.alsJson()).tabellen.t_ist).toHaveLength(1);
    u.s.schliessen();
  });
});
