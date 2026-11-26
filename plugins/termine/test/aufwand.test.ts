import { GlobaleDaten, ProjektSitzung, type StandZeile } from '@bautakt/kern';
import { bibliothekPlugin } from '@bautakt/plugin-bibliothek/main';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AufwandZeile, PlanDaten, VorgangZeile } from '../gemeinsam/typen.js';
import { terminePlugin } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

const schalung = {
  bezeichnung: 'Schalung Ortbetonwände',
  gewerk: 'Rohbau',
  einheit: 'm²',
  h_je_me: 0.5,
  quelle: 'UE 05, Folie 21',
  stand: '2024',
};

/** Projekt mit Bibliothek (global) und einem Plan mit Vorgang und Meilenstein. */
function aufbau(mitBibliothek = true) {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-aufwand-'));
  ordner.push(o);
  const g = mitBibliothek ? GlobaleDaten.oeffnen(path.join(o, 'global'), [bibliothekPlugin]) : null;
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
    appVersion: 'test',
    autosaveMs: 0,
    plugins: mitBibliothek ? [bibliothekPlugin, terminePlugin] : [terminePlugin],
    ...(g ? { globaleDienste: g } : {}),
  });
  const befehl = (name: string, daten: unknown, plugin = 'termine') =>
    s.befehl({ plugin, name, daten });
  const neu = (name: string, daten: unknown, tabelle: string) =>
    befehl(name, daten).aenderungen.find((a) => a.art === 'einfuegen' && a.tabelle === tabelle)
      ?.id ?? '';
  const planId = neu('plan.anlegen', { name: 'P', projektstart: '2026-12-14' }, 't_plan');
  const vorgangId = neu('vorgang.anlegen', { planId, name: 'Wände schalen' }, 't_vorgang');
  const meilenstein = neu('vorgang.anlegen', { planId, typ: 'meilenstein' }, 't_vorgang');
  const vorgang = () =>
    s.abfrage('termine', 'plan', { planId }) as PlanDaten & { vorgaenge: VorgangZeile[] };
  const v = () => vorgang().vorgaenge.find((x) => x.id === vorgangId) as VorgangZeile;
  const aufwand = () =>
    s.abfrage('termine', 'aufwand', { vorgangId }) as {
      aufwand: AufwandZeile | null;
      aktuelleVersion: number | null;
    };
  const bib = (name: string, daten: unknown) =>
    g?.aktion('bibliothek', name, daten) as { id: string; version: number };
  const schliessen = () => {
    s.schliessen();
    g?.schliessen();
  };
  return {
    s,
    g,
    befehl,
    planId,
    vorgangId,
    meilenstein,
    plan: vorgang,
    v,
    aufwand,
    bib,
    schliessen,
  };
}

const kolonne = { ak: 4, h_je_at: 8 };

describe('Aufwandswert-Rechner im Vorgang (E-24, E-54)', () => {
  it('Übernahme aus der Bibliothek: Dauer, Formelzeile, Quelle, eingefrorene Kopie (R-09)', () => {
    const u = aufbau();
    const w = u.bib('aufwandswert.anlegen', schalung);
    u.befehl('aufwand.uebernehmen', {
      vorgangId: u.vorgangId,
      menge: 650,
      ...kolonne,
      wert: { art: 'bibliothek', id: w.id, version: w.version },
    });
    expect(u.v()).toMatchObject({
      dauer_at: 11,
      dauer_herleitung: '650 m² × 0,50 h/m² = 325 h ÷ (4 × 8 h) = 10,2 → 11 AT',
      quelle_annahme: 'AW Schalung Ortbetonwände (UE 05, Folie 21, 2024)',
    });
    const a = u.aufwand().aufwand;
    expect(a).toMatchObject({ bib_id: w.id, bib_version: 1, h_je_me: 0.5, menge: 650, dauer: 11 });
    expect(u.v().aufwand_ref).toBe(a?.id);
    expect(u.plan().aufwand[u.vorgangId]).toMatchObject({ dauer: 11, neuereVersion: null });

    // erneut mit Zuschlag: dieselbe Zeile wird geändert, Quelle bleibt
    u.befehl('aufwand.uebernehmen', {
      vorgangId: u.vorgangId,
      menge: 650,
      ...kolonne,
      zuschlaege: [{ name: 'Winterbau', prozent: 15 }],
      wert: { art: 'bibliothek', id: w.id, version: 1 },
    });
    expect(u.v().dauer_at).toBe(12);
    expect(u.aufwand().aufwand?.id).toBe(a?.id);
    expect(JSON.parse(u.aufwand().aufwand?.zuschlaege ?? '')).toEqual([
      { name: 'Winterbau', prozent: 15 },
    ]);

    // Undo: zurück auf 11 AT, dann vor die erste Übernahme
    u.s.rueckgaengig();
    expect(u.v().dauer_at).toBe(11);
    u.s.rueckgaengig();
    expect(u.v()).toMatchObject({ dauer_herleitung: '', aufwand_ref: null, quelle_annahme: '' });
    expect(u.aufwand().aufwand).toBeNull();
    u.schliessen();
  });

  it('neuere Bibliotheksversion: Hinweis, Kopie bleibt eingefroren (E-23)', () => {
    const u = aufbau();
    const w = u.bib('aufwandswert.anlegen', schalung);
    u.befehl('aufwand.uebernehmen', {
      vorgangId: u.vorgangId,
      menge: 650,
      ...kolonne,
      wert: { art: 'bibliothek', id: w.id, version: 1 },
    });
    u.bib('aufwandswert.aendern', { id: w.id, ...schalung, h_je_me: 0.6 });
    expect(u.v().dauer_at).toBe(11);
    expect(u.aufwand()).toMatchObject({ aufwand: { h_je_me: 0.5 }, aktuelleVersion: 2 });
    expect(u.plan().aufwand[u.vorgangId]?.neuereVersion).toBe(2);
    // Umstellen nur auf Wunsch: Übernahme mit Version 2
    u.befehl('aufwand.uebernehmen', {
      vorgangId: u.vorgangId,
      menge: 650,
      ...kolonne,
      wert: { art: 'bibliothek', id: w.id, version: 2 },
    });
    expect(u.v().dauer_at).toBe(13); // 390 h ÷ 32 = 12,2
    expect(u.plan().aufwand[u.vorgangId]?.neuereVersion).toBeNull();
    u.schliessen();
  });

  it('eigener Aufwandswert, vorhandene Quelle bleibt, Prüfungen', () => {
    const u = aufbau();
    u.befehl('vorgang.aendern', { id: u.vorgangId, felder: { quelle_annahme: 'eigene Annahme' } });
    u.befehl('aufwand.uebernehmen', {
      vorgangId: u.vorgangId,
      menge: 24,
      ...kolonne,
      wert: {
        art: 'eigen',
        bezeichnung: 'Stützen',
        einheit: 'Stk',
        h_je_me: 2,
        quelle: 'Hersteller',
      },
    });
    expect(u.v()).toMatchObject({
      dauer_at: 2,
      quelle_annahme: 'eigene Annahme',
      dauer_herleitung: '24 Stk × 2,00 h/Stk = 48 h ÷ (4 × 8 h) = 1,5 → 2 AT',
    });
    expect(u.aufwand().aufwand).toMatchObject({ bib_id: null, quelle: 'Hersteller' });

    const eigen = { art: 'eigen', bezeichnung: 'X', einheit: 'm', h_je_me: 1, quelle: 'Q' };
    expect(() =>
      u.befehl('aufwand.uebernehmen', {
        vorgangId: u.vorgangId,
        menge: 1,
        ...kolonne,
        wert: { ...eigen, quelle: ' ' },
      }),
    ).toThrow(/Quelle Pflicht/);
    expect(() =>
      u.befehl('aufwand.uebernehmen', {
        vorgangId: u.meilenstein,
        menge: 1,
        ...kolonne,
        wert: eigen,
      }),
    ).toThrow(/Nur Einzelvorgänge/);
    expect(() =>
      u.befehl('aufwand.uebernehmen', {
        vorgangId: u.vorgangId,
        menge: 1,
        ...kolonne,
        zuschlaege: [{ name: 'Abschlag', prozent: -120 }],
        wert: eigen,
      }),
    ).toThrow(/100 %/);
    expect(() =>
      u.befehl('aufwand.uebernehmen', {
        vorgangId: u.vorgangId,
        menge: 1,
        ...kolonne,
        wert: { art: 'bibliothek', id: 'gibtsnicht', version: 1 },
      }),
    ).toThrow(/nicht \(mehr\) vorhanden/);
    u.schliessen();
  });

  it('Entfernen, Löschen des Vorgangs und Stände', () => {
    const u = aufbau();
    const eigen = { art: 'eigen', bezeichnung: 'X', einheit: 'm', h_je_me: 1, quelle: 'Q' };
    const uebernehmen = (menge: number) =>
      u.befehl('aufwand.uebernehmen', { vorgangId: u.vorgangId, menge, ...kolonne, wert: eigen });
    uebernehmen(64); // 2 AT
    u.befehl('aufwand.entfernen', { vorgangId: u.vorgangId });
    expect(u.v()).toMatchObject({ dauer_at: 2, dauer_herleitung: '', aufwand_ref: null });
    expect(u.aufwand().aufwand).toBeNull();

    uebernehmen(96); // 3 AT
    u.befehl('stand.speichern', { name: 'Soll' }, 'kern');
    uebernehmen(160); // 5 AT
    const stand = (u.s.abfrage('kern', 'staende', undefined) as StandZeile[])[0];
    u.befehl('stand.laden', { id: stand?.id }, 'kern');
    expect(u.v().dauer_at).toBe(3);
    expect(u.aufwand().aufwand).toMatchObject({ menge: 96, dauer: 3 });

    u.befehl('vorgang.loeschen', { ids: [u.vorgangId] });
    expect(u.s.abfrage('termine', 'aufwand', { vorgangId: u.vorgangId })).toMatchObject({
      aufwand: null,
    });
    u.s.rueckgaengig();
    expect(u.aufwand().aufwand).toMatchObject({ menge: 96 });
    u.schliessen();
  });

  it('ohne Bibliothek-Plugin: nur eigene Aufwandswerte', () => {
    const u = aufbau(false);
    expect(() =>
      u.befehl('aufwand.uebernehmen', {
        vorgangId: u.vorgangId,
        menge: 1,
        ...kolonne,
        wert: { art: 'bibliothek', id: 'a', version: 1 },
      }),
    ).toThrow(/nicht verfügbar/);
    u.befehl('aufwand.uebernehmen', {
      vorgangId: u.vorgangId,
      menge: 32,
      ...kolonne,
      wert: { art: 'eigen', bezeichnung: 'X', einheit: 'm', h_je_me: 1, quelle: 'Q' },
    });
    expect(u.v().dauer_at).toBe(1);
    expect(u.plan().aufwand[u.vorgangId]?.neuereVersion).toBeNull();
    u.schliessen();
  });
});
