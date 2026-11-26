import { ProjektSitzung } from '@bautakt/kern';
import { Arbeitskalender, tagVonDatum } from '@bautakt/rechnen-kalender';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mtaPunkte, mtaVerschiebung, mtaZeitraum, type MtaDaten } from '../gemeinsam/mta.js';
import { terminePlugin } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

const kal = new Arbeitskalender({ start: '2026-12-14' });

/** Vorgang 20 AT → Meilenstein M (Zwischentermin) → Vorgang 30 AT → Meilenstein E. */
function aufbau() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-mta-'));
  ordner.push(o);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
    appVersion: 'test',
    autosaveMs: 0,
    plugins: [terminePlugin],
  });
  const befehl = (name: string, daten: unknown) => s.befehl({ plugin: 'termine', name, daten });
  const neu = (name: string, daten: unknown, tabelle: string) =>
    befehl(name, daten).aenderungen.find((a) => a.art === 'einfuegen' && a.tabelle === tabelle)
      ?.id ?? '';
  const planId = neu('plan.anlegen', { name: 'MTA', projektstart: '2026-12-14' }, 't_plan');
  const a = neu('vorgang.anlegen', { planId, name: 'Rohbau' }, 't_vorgang');
  const m = neu(
    'vorgang.anlegen',
    { planId, typ: 'meilenstein', name: 'Rohbau fertig' },
    't_vorgang',
  );
  const b = neu('vorgang.anlegen', { planId, name: 'Ausbau' }, 't_vorgang');
  const e = neu('vorgang.anlegen', { planId, typ: 'meilenstein', name: 'Übergabe' }, 't_vorgang');
  befehl('vorgang.aendern', { id: a, felder: { dauer_at: 20 } });
  befehl('vorgang.aendern', { id: m, felder: { schnittstelle: 1 } });
  befehl('vorgang.aendern', { id: b, felder: { dauer_at: 30 } });
  befehl('vorgaenger.setzen', { nachId: m, text: '1EA' });
  befehl('vorgaenger.setzen', { nachId: b, text: '2EA' });
  befehl('vorgaenger.setzen', { nachId: e, text: '3EA' });
  const mta = () => s.abfrage('termine', 'mta', { planId }) as MtaDaten;
  return { s, befehl, planId, ids: { a, m, b, e }, mta };
}

describe('Meilenstein-Trendanalyse (E-71, E-72)', () => {
  it('Berichte festhalten, gleicher Tag ersetzt, Verschiebung, erreicht', () => {
    const u = aufbau();
    const m = () => u.mta().meilensteine.find((x) => x.id === u.ids.m);
    const e = () => u.mta().meilensteine.find((x) => x.id === u.ids.e);
    // Bericht 1 zum Stichtag 04.01.2027 (Ende AT 14): Rohbau läuft, Rest 6 AT → M wie geplant (AT 20)
    const st1 = kal.endeDatum(14);
    u.befehl('plan.aendern', { id: u.planId, stichtag: st1 });
    u.befehl('ist.setzen', {
      vorgangId: u.ids.a,
      stichtag: st1,
      ist_anfang: kal.anfangDatum(0),
      restdauer_at: 6,
    });
    u.befehl('mta.festhalten', { planId: u.planId, notiz: 'Jour fixe 1' });
    let d = u.mta();
    expect(d.berichte.map((b) => [b.berichtsdatum, b.notiz])).toEqual([[st1, 'Jour fixe 1']]);
    expect(Object.values(m()?.werte ?? {})).toEqual([
      { termin: kal.endeDatum(20), erreicht: false },
    ]);
    expect(e()?.aktuell).toEqual({ termin: kal.endeDatum(50), erreicht: false });
    expect(m()?.schnittstelle).toBe(true);

    // gleicher Stichtag → ersetzt
    u.befehl('mta.festhalten', { planId: u.planId });
    expect(u.mta().berichte).toHaveLength(1);

    // Bericht 2 zum Stichtag Ende AT 24: Rohbau fertig, M erreicht, Ausbau 5 AT länger
    const st2 = kal.endeDatum(24);
    u.befehl('vorgang.aendern', { id: u.ids.b, felder: { dauer_at: 35 } });
    u.befehl('plan.aendern', { id: u.planId, stichtag: st2 });
    u.befehl('ist.setzen', {
      vorgangId: u.ids.a,
      stichtag: st2,
      ist_anfang: kal.anfangDatum(0),
      ist_ende: kal.endeDatum(20),
    });
    u.befehl('ist.setzen', { vorgangId: u.ids.m, stichtag: st2, ist_ende: kal.endeDatum(20) });
    u.befehl('ist.setzen', {
      vorgangId: u.ids.b,
      stichtag: st2,
      ist_anfang: kal.anfangDatum(20),
      restdauer_at: 31,
    });
    u.befehl('mta.festhalten', { planId: u.planId });
    d = u.mta();
    expect(d.berichte.map((b) => b.berichtsdatum)).toEqual([st1, st2]);
    const ende = e();
    if (!ende) throw new Error('E fehlt');
    expect(mtaPunkte(d, ende, false).map((p) => p.termin)).toEqual([
      kal.endeDatum(50),
      kal.endeDatum(55),
    ]);
    expect(mtaVerschiebung(d, ende, false)).toBe(
      tagVonDatum(kal.endeDatum(55)) - tagVonDatum(kal.endeDatum(50)),
    );
    expect(m()?.werte[d.berichte[1]?.id ?? '']).toEqual({
      termin: kal.endeDatum(20),
      erreicht: true,
    });
    expect(mtaVerschiebung(d, m() ?? ende, false)).toBe(0);

    // aktueller Stand = Datum des letzten Berichts → nicht doppelt angehängt
    expect(mtaPunkte(d, ende, true)).toHaveLength(2);
    const z = mtaZeitraum(d, new Set([u.ids.m, u.ids.e]), true);
    expect(z.von).toBeLessThan(tagVonDatum(st1));
    expect(z.bis).toBeGreaterThan(tagVonDatum(kal.endeDatum(55)));

    // Bericht löschen, Rückgängig
    u.befehl('mta.loeschen', { id: d.berichte[1]?.id });
    expect(u.mta().berichte).toHaveLength(1);
    u.s.rueckgaengig();
    expect(u.mta().berichte).toHaveLength(2);
    // Meilenstein löschen entfernt seine Werte
    u.befehl('vorgang.loeschen', { ids: [u.ids.e] });
    expect(u.mta().meilensteine.map((x) => x.nr)).toEqual(['2']);
    u.s.schliessen();
  });

  it('ohne Meilensteine oder ohne Stichtag', () => {
    const u = aufbau();
    u.befehl('mta.festhalten', { planId: u.planId });
    expect(u.mta().berichte[0]?.berichtsdatum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    u.befehl('vorgang.loeschen', { ids: [u.ids.m, u.ids.e] });
    expect(() => u.befehl('mta.festhalten', { planId: u.planId })).toThrow(/keine Meilensteine/);
    u.s.schliessen();
  });
});
