import { ProjektSitzung, type StandZeile } from '@bautakt/kern';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlanDaten } from '../gemeinsam/typen.js';
import { terminePlugin } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

function umgebung() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-stand-'));
  ordner.push(o);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
    appVersion: 'test',
    autosaveMs: 0,
    plugins: [terminePlugin],
  });
  const befehl = (plugin: string, name: string, daten: unknown) =>
    s.befehl({ plugin, name, daten });
  const neu = (name: string, daten: unknown, tabelle: string) =>
    befehl('termine', name, daten).aenderungen.find(
      (a) => a.art === 'einfuegen' && a.tabelle === tabelle,
    )?.id ?? '';
  const planId = neu('plan.anlegen', { name: 'Plan', projektstart: '2026-12-14' }, 't_plan');
  const vorgang = (name: string, dauer: number) => {
    const id = neu('vorgang.anlegen', { planId }, 't_vorgang');
    befehl('termine', 'vorgang.aendern', { id, felder: { name, dauer_at: dauer } });
    return id;
  };
  const daten = () => s.abfrage('termine', 'plan', { planId }) as PlanDaten;
  const staende = () => s.abfrage('kern', 'staende', undefined) as StandZeile[];
  const json = () => JSON.parse(s.alsJson()).tabellen as Record<string, Record<string, unknown>[]>;
  return { s, befehl, planId, vorgang, daten, staende, json };
}

describe('Soll-Stände (E-22, E-32, Architektur 3.3)', () => {
  it('speichern friert Daten und Rechenergebnisse ein', () => {
    const u = umgebung();
    const a = u.vorgang('Rohbau', 10);
    const b = u.vorgang('Ausbau', 5);
    u.befehl('termine', 'beziehung.anlegen', { von: a, nach: b });
    u.befehl('kern', 'stand.speichern', { name: 'Soll Vertrag', notiz: 'unterschrieben' });

    const [stand] = u.staende();
    expect(stand).toMatchObject({ name: 'Soll Vertrag', art: 'soll', notiz: 'unterschrieben' });
    expect(stand?.zeit).toMatch(/Z$/);
    const kopie = u.json()['t_vorgang_stand'] ?? [];
    expect(kopie).toHaveLength(2);
    expect(kopie.find((z) => z['orig_id'] === b)).toMatchObject({
      stand_id: stand?.id,
      name: 'Ausbau',
      faz: 10,
      fez: 15,
      kritisch: 1,
      // AT 1–9 = 14.–24.12., 25./26.12. Feiertage, AT 10 = Mo 28.12. → Anfang AT 11 = Di 29.12.
      anfang: '2026-12-29',
    });
    expect(u.json()['t_plan_stand']?.[0]).toMatchObject({ orig_id: u.planId, projektende: 15 });
    expect(() => u.befehl('kern', 'stand.speichern', { name: ' ' })).toThrow(/Namen/);
    u.s.schliessen();
  });

  it('Rücksprung stellt den Stand her, sichert vorher automatisch und ist rückgängig machbar', () => {
    const u = umgebung();
    const a = u.vorgang('Rohbau', 10);
    u.befehl('kern', 'stand.speichern', { name: 'Soll Vertrag' });
    const soll = JSON.stringify(u.daten());
    const sollId = u.staende()[0]?.id;

    // Änderungen nach dem Stand
    u.befehl('termine', 'vorgang.aendern', { id: a, felder: { dauer_at: 30 } });
    const b = u.vorgang('Ausbau', 5);
    u.befehl('termine', 'beziehung.anlegen', { von: a, nach: b });
    u.befehl('termine', 'ruhezeit.anlegen', {
      kalenderId: u.daten().plan.kalender_id,
      von: '2026-12-21',
      bis: '2027-01-01',
    });
    const geaendert = JSON.stringify(u.daten());

    u.befehl('kern', 'stand.laden', { id: sollId });
    expect(JSON.stringify(u.daten())).toBe(soll);
    const liste = u.staende();
    expect(liste.map((x) => [x.name, x.art])).toEqual([
      ['Vor Rücksprung auf „Soll Vertrag“', 'sicherung'],
      ['Soll Vertrag', 'soll'],
    ]);

    // Rücksprung auf die automatische Sicherung = Zustand vor dem Rücksprung
    u.befehl('kern', 'stand.laden', { id: liste[0]?.id });
    expect(JSON.stringify(u.daten())).toBe(geaendert);

    // Undo beider Rücksprünge
    u.s.rueckgaengig();
    expect(JSON.stringify(u.daten())).toBe(soll);
    u.s.rueckgaengig();
    expect(JSON.stringify(u.daten())).toBe(geaendert);
    expect(u.staende()).toHaveLength(1);
    u.s.schliessen();
  });

  it('Löschen entfernt den Stand samt Kopien; Umbenennen; schreibgeschützt nicht möglich', () => {
    const u = umgebung();
    u.vorgang('Rohbau', 10);
    u.befehl('kern', 'stand.speichern', { name: 'Stand 1' });
    const id = u.staende()[0]?.id;
    u.befehl('kern', 'stand.umbenennen', { id, name: 'Stand Sprechstunde 26.11.' });
    expect(u.staende()[0]?.name).toBe('Stand Sprechstunde 26.11.');
    u.befehl('kern', 'stand.loeschen', { id });
    expect(u.staende()).toEqual([]);
    for (const t of ['t_plan_stand', 't_vorgang_stand', 't_kalender_stand'])
      expect(u.json()[t]).toEqual([]);
    u.s.rueckgaengig();
    expect(u.staende()).toHaveLength(1);
    expect(u.json()['t_vorgang_stand']).toHaveLength(1);
    expect(() => u.befehl('kern', 'stand.laden', { id: 'gibt-es-nicht' })).toThrow(
      /existiert nicht/,
    );
    u.s.schliessen();
  });
});
