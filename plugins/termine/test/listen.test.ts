import { ProjektSitzung, type StandZeile } from '@bautakt/kern';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlanDaten } from '../gemeinsam/typen.js';
import { terminePlugin } from '../main/index.js';
import { sichtbareVorgaenge } from '../renderer/daten.js';
import {
  auswahlWerte,
  filterLesen,
  filterText,
  meilensteinliste,
  OHNE_FILTER,
  spurenVerteilen,
  terminliste,
  zeitfenster,
  type ListenEintrag,
  type ListenFilter,
} from '../renderer/listen.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

/**
 * R-01 mit Gliederung, Gewerken und Meilensteinen:
 * 1 (Rohbau) · S { 2 (Rohbau), 3 (Ausbau) } · 4 (–) · 5 (Ausbau) · 6 (TGA) · ME (6EA) · MM (3EA)
 */
function aufbau() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-listen-'));
  ordner.push(o);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
    appVersion: 'test',
    autosaveMs: 0,
    plugins: [terminePlugin],
  });
  const befehl = (name: string, daten: unknown, plugin = 'termine') =>
    s.befehl({ plugin, name, daten });
  const neu = (daten: unknown) =>
    befehl('vorgang.anlegen', daten).aenderungen.find(
      (a) => a.art === 'einfuegen' && a.tabelle === 't_vorgang',
    )?.id ?? '';
  const planId =
    befehl('plan.anlegen', { name: 'R-01', projektstart: '2026-12-14' }).aenderungen.find(
      (a) => a.art === 'einfuegen' && a.tabelle === 't_plan',
    )?.id ?? '';
  const v1 = neu({ planId });
  const sammel = neu({ planId, typ: 'sammel', name: 'Rohbau Untergeschoss' });
  const v2 = neu({ planId, parentId: sammel });
  const v3 = neu({ planId, parentId: sammel });
  const v4 = neu({ planId });
  const v5 = neu({ planId });
  const v6 = neu({ planId });
  const me = neu({ planId, typ: 'meilenstein', name: 'Abnahme' });
  const mm = neu({ planId, typ: 'meilenstein', name: 'Rohbau fertig' });
  // Nummern wie in R-01 (Sammelvorgang „S“), damit die Vorgänger-Texte passen
  befehl('vorgang.aendern', { id: sammel, felder: { nr: 'S' } });
  [v1, v2, v3, v4, v5, v6].forEach((id, i) =>
    befehl('vorgang.aendern', { id, felder: { nr: String(i + 1) } }),
  );
  befehl('vorgang.aendern', { id: me, felder: { nr: 'ME' } });
  befehl('vorgang.aendern', { id: mm, felder: { nr: 'MM' } });
  const daten: [string, number, string, string, string][] = [
    [v1, 70, '', 'Rohbau', 'Polier A'],
    [v2, 20, '1EA+10', 'Rohbau', 'Polier A'],
    [v3, 20, '1EA+15', 'Ausbau', ''],
    [v4, 35, '2EA; 3EA', '', ''],
    [v5, 80, '3EA', 'Ausbau', 'BL'],
    [v6, 50, '4EA+30; 5EA', 'TGA', 'BL'],
  ];
  for (const [id, dauer, vg, gewerk, rolle] of daten) {
    befehl('vorgang.aendern', { id, felder: { dauer_at: dauer, gewerk, rolle } });
    if (vg) befehl('vorgaenger.setzen', { nachId: id, text: vg });
  }
  befehl('vorgaenger.setzen', { nachId: me, text: '6EA' });
  befehl('vorgaenger.setzen', { nachId: mm, text: '3EA' });
  const plan = (sollStandId?: string) =>
    s.abfrage('termine', 'plan', { planId, ...(sollStandId ? { sollStandId } : {}) }) as PlanDaten;
  return { s, befehl, plan, ids: { v1, sammel, v2, v3, v4, v5, v6, me, mm } };
}

const ids = (liste: ListenEintrag[]) =>
  liste.map((e) => (e.art === 'gruppe' ? `[${e.titel}:${e.anzahl}]` : e.v.id));
const mit = (f: Partial<ListenFilter>): ListenFilter => ({ ...OHNE_FILTER, ...f });

describe('Terminliste (E-47)', () => {
  it('ohne Filter: sichtbare Vorgänge in Gliederungsreihenfolge', () => {
    const u = aufbau();
    const d = u.plan();
    const sichtbar = sichtbareVorgaenge(d.vorgaenge, []);
    const { v1, sammel, v2, v3, v4, v5, v6, me, mm } = u.ids;
    expect(ids(terminliste(d, sichtbar, OHNE_FILTER, '2026-12-14'))).toEqual([
      v1,
      sammel,
      v2,
      v3,
      v4,
      v5,
      v6,
      me,
      mm,
    ]);
    u.s.schliessen();
  });

  it('Filter Gewerk: Sammelvorgang bleibt, solange ein Unterpunkt passt', () => {
    const u = aufbau();
    const d = u.plan();
    const { sammel, v3, v5, v4, me, mm } = u.ids;
    const alle = sichtbareVorgaenge(d.vorgaenge, []);
    expect(ids(terminliste(d, alle, mit({ gewerk: 'Ausbau' }), '2026-12-14'))).toEqual([
      sammel,
      v3,
      v5,
    ]);
    // „ohne Gewerk“: kein Unterpunkt des Sammelvorgangs passt → er fällt weg
    expect(ids(terminliste(d, alle, mit({ gewerk: '' }), '2026-12-14'))).toEqual([v4, me, mm]);
    // zugeklappt: Unterpunkte bleiben verborgen, der Sammelvorgang steht stellvertretend
    const zu = sichtbareVorgaenge(d.vorgaenge, [sammel]);
    expect(ids(terminliste(d, zu, mit({ gewerk: 'Ausbau' }), '2026-12-14'))).toEqual([sammel, v5]);
    u.s.schliessen();
  });

  it('Filter Verantwortlich und Kombination', () => {
    const u = aufbau();
    const d = u.plan();
    const { v5, v6 } = u.ids;
    const alle = sichtbareVorgaenge(d.vorgaenge, []);
    expect(ids(terminliste(d, alle, mit({ rolle: 'BL' }), '2026-12-14'))).toEqual([v5, v6]);
    expect(ids(terminliste(d, alle, mit({ rolle: 'BL', gewerk: 'TGA' }), '2026-12-14'))).toEqual([
      v6,
    ]);
    u.s.schliessen();
  });

  it('Zeitraum: Vorgang passt, wenn er das Fenster berührt', () => {
    const u = aufbau();
    const d = u.plan();
    const b = d.berechnung;
    if (!b.ok) throw new Error(b.fehler);
    const { v5, v6, me } = u.ids;
    const t6 = b.termine[v6];
    const t5 = b.termine[v5];
    if (!t6 || !t5) throw new Error('Termine fehlen');
    const alle = sichtbareVorgaenge(d.vorgaenge, []);
    // ab Anfang von 6: nur 6 und der Ende-Meilenstein (5 endet am Tag davor)
    expect(
      ids(terminliste(d, alle, mit({ zeitraum: 'frei', von: t6.anfang }), '2026-12-14')),
    ).toEqual([v6, me]);
    // genau der letzte Tag von 5: 5 berührt, 6 nicht
    expect(
      ids(
        terminliste(d, alle, mit({ zeitraum: 'frei', von: t5.ende, bis: t5.ende }), '2026-12-14'),
      ),
    ).toEqual([v5]);
    u.s.schliessen();
  });

  it('Zeitfenster in Wochen ab Bezugstag', () => {
    expect(zeitfenster(mit({ zeitraum: '4' }), '2026-12-14')).toEqual({
      von: '2026-12-14',
      bis: '2027-01-10',
    });
    expect(zeitfenster(mit({ zeitraum: '2' }), '2026-12-31')).toEqual({
      von: '2026-12-31',
      bis: '2027-01-13',
    });
    expect(zeitfenster(mit({ zeitraum: 'frei' }), '2026-12-14')).toBeNull();
    expect(zeitfenster(OHNE_FILTER, '2026-12-14')).toBeNull();
  });

  it('gruppiert nach Gewerk: alphabetisch, „ohne Gewerk“ zuletzt, je Gruppe chronologisch', () => {
    const u = aufbau();
    const d = u.plan();
    const { v1, v2, v3, v4, v5, v6, me, mm } = u.ids;
    const liste = terminliste(d, [], mit({ gruppieren: true }), '2026-12-14');
    // MM (FAZ = FEZ = 105) vor 4 (FAZ 105, FEZ 140)
    expect(ids(liste)).toEqual([
      '[Ausbau:2]',
      v3,
      v5,
      '[Rohbau:2]',
      v1,
      v2,
      '[TGA:1]',
      v6,
      '[ohne Gewerk:3]',
      mm,
      v4,
      me,
    ]);
    u.s.schliessen();
  });

  it('Auswahlwerte für die Filter', () => {
    const u = aufbau();
    expect(auswahlWerte(u.plan())).toEqual({
      gewerke: ['Ausbau', 'Rohbau', 'TGA', ''],
      rollen: ['BL', 'Polier A', ''],
    });
    u.s.schliessen();
  });

  it('Filter aus Export-Parametern lesen und beschreiben', () => {
    expect(filterLesen(null)).toEqual(OHNE_FILTER);
    expect(filterLesen({ zeitraum: 'x', gruppieren: 'ja', gewerk: 3 })).toEqual(OHNE_FILTER);
    const f = filterLesen({ gewerk: '', zeitraum: '4', gruppieren: true });
    const datum = (iso: string) => iso.split('-').reverse().join('.');
    expect(filterText(f, '2026-12-14', datum)).toBe(
      'Gewerk: ohne · Zeitraum: 14.12.2026 – 10.01.2027 · gruppiert nach Gewerk',
    );
    expect(filterText(mit({ zeitraum: 'frei', von: '2027-02-01' }), '2026-12-14', datum)).toBe(
      'Zeitraum: 01.02.2027 – …',
    );
    expect(filterText(OHNE_FILTER, '2026-12-14', datum)).toBe('alle Vorgänge');
  });
});

describe('Meilensteinplan (E-48)', () => {
  it('chronologisch mit Termin, Soll-Termin und Abweichung', () => {
    const u = aufbau();
    const { me, mm, v6 } = u.ids;
    let liste = meilensteinliste(u.plan());
    expect(liste.map((m) => [m.v.id, m.t?.fez, m.soll])).toEqual([
      [mm, 105, null],
      [me, 235, null],
    ]);
    u.befehl('stand.speichern', { name: 'Soll Vertrag' }, 'kern');
    const stand = (u.s.abfrage('kern', 'staende', undefined) as StandZeile[])[0];
    u.befehl('vorgang.aendern', { id: v6, felder: { dauer_at: 60 } });
    liste = meilensteinliste(u.plan(stand?.id));
    expect(liste.map((m) => [m.v.id, m.t?.fez, m.sollFez, m.abweichung])).toEqual([
      [mm, 105, 105, 0],
      [me, 245, 235, 10],
    ]);
    expect(liste[1]?.soll).toBe(u.plan(stand?.id).vergleich?.termine[me]?.ende);
    u.s.schliessen();
  });

  it('Beschriftungen der Zeitleiste auf Spuren verteilen', () => {
    expect(
      spurenVerteilen([
        { x: 0, breite: 50 },
        { x: 30, breite: 50 },
        { x: 60, breite: 50 },
        { x: 70, breite: 10 },
        { x: 120, breite: 10 },
      ]),
    ).toEqual([0, 1, 0, 2, 0]);
  });
});
