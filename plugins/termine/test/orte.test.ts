import { ProjektSitzung } from '@bautakt/kern';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { blattAnzahl, ortsBaum, ortsBereich, taktDauerVorschlag } from '../gemeinsam/orte.js';
import type { PlanDaten } from '../gemeinsam/typen.js';
import { terminePlugin } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

function aufbau() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-orte-'));
  ordner.push(o);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
    appVersion: 'test',
    autosaveMs: 0,
    plugins: [terminePlugin],
  });
  const befehl = (name: string, daten: unknown) => s.befehl({ plugin: 'termine', name, daten });
  const planId =
    befehl('plan.anlegen', { name: 'Takt', projektstart: '2026-12-14' }).aenderungen.find(
      (a) => a.art === 'einfuegen' && a.tabelle === 't_plan',
    )?.id ?? '';
  const daten = () => s.abfrage('termine', 'plan', { planId }) as PlanDaten;
  const ort = (name: string) => daten().orte.find((x) => x.name === name)?.id ?? '';
  const vorgang = (nr: string) => daten().vorgaenge.find((v) => v.nr === nr);
  return { s, befehl, planId, daten, ort, vorgang };
}

describe('Ortsstruktur (E-31, E-67)', () => {
  it('Baum, Blätter und Bereiche', () => {
    const orte = [
      { id: 'a', parent_id: null, name: 'BA A', reihenfolge: 1 },
      { id: 'b', parent_id: null, name: 'BA B', reihenfolge: 2 },
      { id: 'a1', parent_id: 'a', name: 'EG', reihenfolge: 1 },
      { id: 'a2', parent_id: 'a', name: 'OG', reihenfolge: 2 },
      { id: 'b1', parent_id: 'b', name: 'EG', reihenfolge: 1 },
    ];
    const baum = ortsBaum(orte);
    expect(baum.map((o) => [o.pfad, o.ebene, o.blattVon, o.blattBis])).toEqual([
      ['BA A', 0, 0, 1],
      ['BA A › EG', 1, 0, 0],
      ['BA A › OG', 1, 1, 1],
      ['BA B', 0, 2, 2],
      ['BA B › EG', 1, 2, 2],
    ]);
    expect(blattAnzahl(baum)).toBe(3);
    expect(ortsBereich(baum, 'a1', 'a1')).toEqual({ start: 0, ende: 1 });
    expect(ortsBereich(baum, 'a1', 'b1')).toEqual({ start: 0, ende: 3 });
    expect(ortsBereich(baum, 'a', null)).toEqual({ start: 0, ende: 2 });
    // rückwärts: von oben nach unten
    expect(ortsBereich(baum, 'a2', 'a1')).toEqual({ start: 2, ende: 0 });
    expect(ortsBereich(baum, null, null)).toBeNull();
    expect(taktDauerVorschlag(12, 3)).toBe(4);
    expect(taktDauerVorschlag(10, 3)).toBe(4);
    expect(taktDauerVorschlag(1, 5)).toBe(1);
  });

  it('Befehle: anlegen (auch mehrere), verschieben, umbenennen, löschen leert Verweise', () => {
    const u = aufbau();
    u.befehl('ort.anlegen', { name: 'Bauabschnitt A' });
    u.befehl('ort.anlegen', {
      name: 'EG, 1. OG; 2. OG',
      parentId: u.ort('Bauabschnitt A'),
      mehrere: true,
    });
    expect(ortsBaum(u.daten().orte).map((o) => o.pfad)).toEqual([
      'Bauabschnitt A',
      'Bauabschnitt A › EG',
      'Bauabschnitt A › 1. OG',
      'Bauabschnitt A › 2. OG',
    ]);
    u.befehl('ort.verschieben', { id: u.ort('2. OG'), richtung: 'hoch' });
    expect(
      ortsBaum(u.daten().orte)
        .map((o) => o.name)
        .slice(1),
    ).toEqual(['EG', '2. OG', '1. OG']);
    u.befehl('ort.umbenennen', { id: u.ort('EG'), name: 'Erdgeschoss' });

    const vid =
      u
        .befehl('vorgang.anlegen', { planId: u.planId })
        .aenderungen.find((a) => a.tabelle === 't_vorgang')?.id ?? '';
    u.befehl('vorgang.aendern', {
      id: vid,
      felder: { ort_von: u.ort('Erdgeschoss'), ort_bis: u.ort('1. OG') },
    });
    expect(() =>
      u.befehl('vorgang.aendern', { id: vid, felder: { ort_von: 'gibt-es-nicht' } }),
    ).toThrow(/Ort/);
    u.befehl('ort.loeschen', { id: u.ort('Bauabschnitt A') });
    expect(u.daten().orte).toEqual([]);
    expect(u.daten().vorgaenge[0]).toMatchObject({ ort_von: null, ort_bis: null });
    u.s.rueckgaengig();
    expect(u.daten().vorgaenge[0]?.ort_von).toBe(u.ort('Erdgeschoss'));
    u.s.schliessen();
  });
});

describe('Taktzug: über Takte vervielfältigen (E-69, E-70)', () => {
  /** A → Schalen → Bewehren → Betonieren → N, alles EA. */
  function taktAufbau() {
    const u = aufbau();
    u.befehl('ort.anlegen', { name: 'EG, 1. OG, 2. OG', mehrere: true });
    const ids: string[] = [];
    for (const [name, dauer] of [
      ['Vorbereitung', 5],
      ['Schalen', 12],
      ['Bewehren', 9],
      ['Betonieren', 6],
      ['Nacharbeit', 2],
    ] as const) {
      const vid =
        u
          .befehl('vorgang.anlegen', { planId: u.planId, name })
          .aenderungen.find((a) => a.tabelle === 't_vorgang')?.id ?? '';
      u.befehl('vorgang.aendern', {
        id: vid,
        felder: { dauer_at: dauer, quelle_annahme: 'UE 05', gewerk: 'Rohbau' },
      });
      ids.push(vid);
    }
    for (let i = 1; i < ids.length; i++)
      u.befehl('vorgaenger.setzen', { nachId: ids[i], text: `${i}EA` });
    const orte = ['EG', '1. OG', '2. OG'].map(u.ort);
    return { ...u, ids, orte };
  }

  it('Kopien je Ort, Verkettung, Originale als Sammelvorgang, Termine', () => {
    const u = taktAufbau();
    const [, sch, bew, bet] = u.ids as [string, string, string, string, string];
    u.befehl('takt.vervielfaeltigen', {
      vorgaenge: [
        { id: sch, taktdauer: 4 },
        { id: bew, taktdauer: 3 },
        { id: bet, taktdauer: 2 },
      ],
      orte: u.orte,
    });
    const d = u.daten();
    expect(u.vorgang('2')).toMatchObject({ typ: 'sammel', ort_von: u.orte[0], ort_bis: u.orte[2] });
    expect(u.vorgang('2.1')).toMatchObject({
      name: 'Schalen – EG',
      dauer_at: 4,
      parent_id: sch,
      ort_von: u.orte[0],
      quelle_annahme: 'UE 05 (Takt 1/3)',
      gewerk: 'Rohbau',
    });
    expect(u.vorgang('4.3')).toMatchObject({ name: 'Betonieren – 2. OG', dauer_at: 2 });
    const b = d.berechnung;
    if (!b.ok) throw new Error(b.fehler);
    const t = (nr: string) => {
      const v = u.vorgang(nr);
      const x = v ? b.termine[v.id] : undefined;
      return [x?.faz, x?.fez];
    };
    expect([t('2.1'), t('2.2'), t('2.3')]).toEqual([
      [5, 9],
      [9, 13],
      [13, 17],
    ]);
    expect([t('3.1'), t('3.2'), t('3.3')]).toEqual([
      [9, 12],
      [13, 16],
      [17, 20],
    ]);
    expect([t('4.1'), t('4.2'), t('4.3')]).toEqual([
      [12, 14],
      [16, 18],
      [20, 22],
    ]);
    expect(t('5')).toEqual([22, 24]);
    expect(b.projektende).toBe(24);
    // Sammelvorgänge haben keine Beziehungen mehr (E-14)
    const sammel = new Set([sch, bew, bet]);
    expect(d.beziehungen.some((x) => sammel.has(x.von_id) || sammel.has(x.nach_id))).toBe(false);
    // 3 Beziehungen nach außen/innen: 1→2.1, 4.3→5, 2×3 Ortsketten, 2×3 Taktzugketten
    expect(d.beziehungen).toHaveLength(2 + 6 + 6);

    u.s.rueckgaengig();
    const zurueck = u.daten();
    expect(zurueck.vorgaenge).toHaveLength(5);
    expect(zurueck.vorgaenge.find((v) => v.id === sch)?.typ).toBe('vorgang');
    expect(zurueck.beziehungen).toHaveLength(4);
    u.s.schliessen();
  });

  it('Prüfungen: nicht aufeinanderfolgend, Meilenstein, Ist-Meldungen, zu wenige Orte', () => {
    const u = taktAufbau();
    const [a, sch, , bet] = u.ids as [string, string, string, string, string];
    expect(() =>
      u.befehl('takt.vervielfaeltigen', {
        vorgaenge: [
          { id: sch, taktdauer: 1 },
          { id: bet, taktdauer: 1 },
        ],
        orte: u.orte,
      }),
    ).toThrow(/direkt aufeinanderfolgen/);
    expect(() =>
      u.befehl('takt.vervielfaeltigen', {
        vorgaenge: [{ id: sch, taktdauer: 1 }],
        orte: [u.orte[0]],
      }),
    ).toThrow(/mindestens zwei Orte/);
    u.befehl('vorgang.aendern', { id: a, felder: { typ: 'meilenstein' } });
    expect(() =>
      u.befehl('takt.vervielfaeltigen', { vorgaenge: [{ id: a, taktdauer: 1 }], orte: u.orte }),
    ).toThrow(/kein Einzelvorgang/);
    u.befehl('plan.aendern', { id: u.planId, stichtag: '2027-01-15' });
    u.befehl('ist.setzen', {
      vorgangId: sch,
      stichtag: '2027-01-15',
      ist_anfang: '2026-12-21',
      fertig_prozent: 10,
    });
    expect(() =>
      u.befehl('takt.vervielfaeltigen', { vorgaenge: [{ id: sch, taktdauer: 1 }], orte: u.orte }),
    ).toThrow(/Ist-Meldungen/);
    u.s.schliessen();
  });
});
