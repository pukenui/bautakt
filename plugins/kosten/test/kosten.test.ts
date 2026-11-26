import { GlobaleDaten, ProjektSitzung, type StandZeile } from '@bautakt/kern';
import { bibliothekPlugin } from '@bautakt/plugin-bibliothek/main';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { KostenDaten } from '../gemeinsam/typen.js';
import { flaecheAusEinheit } from '../main/befehle.js';
import { kostenPlugin } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

function aufbau() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-kosten-'));
  ordner.push(o);
  const g = GlobaleDaten.oeffnen(path.join(o, 'global'), [bibliothekPlugin]);
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
    appVersion: 'test',
    autosaveMs: 0,
    plugins: [bibliothekPlugin, kostenPlugin],
    globaleDienste: g,
  });
  const befehl = (name: string, daten: unknown, plugin = 'kosten') =>
    s.befehl({ plugin, name, daten });
  const daten = () => s.abfrage('kosten', 'kosten', undefined) as KostenDaten;
  const zeile = (kg: number) => daten().zeilen.find((z) => z.kg === kg);
  const anlegen = (kg: number) => {
    befehl('zeile.anlegen', { kg });
    return zeile(kg)?.id ?? '';
  };
  const bib = (name: string, d: unknown) =>
    g.aktion('bibliothek', name, d) as { id: string; version: number };
  const schliessen = () => {
    s.schliessen();
    g.schliessen();
  };
  return { s, befehl, daten, zeile, anlegen, bib, schliessen };
}

const kennwert = {
  bezeichnung: 'Hallen, Fertigteilbau (fiktiv)',
  kg: 300,
  einheit: 'm² BGF',
  von: 1800,
  mittel: 2400,
  bis: 3100,
  quelle: 'Testwert R-10',
  stand: '2024, Q1',
  index_stand: 120,
};

describe('Kostenplanung (E-15, E-16, E-55–E-58)', () => {
  it('R-10 über die Befehle: Kennwert aus der Bibliothek, Index, Regionalfaktor, MwSt.', () => {
    const u = aufbau();
    const k = u.bib('kennwert.anlegen', kennwert);
    u.befehl('einstellung.aendern', {
      felder: {
        index_aktuell: 132,
        index_aktuell_stand: '2026, Q3',
        regionalfaktor: 1.05,
        vorsteuerabzug: true,
      },
    });
    const id = u.anlegen(300);
    expect(u.zeile(300)).toMatchObject({
      einheit: 'm² BGF',
      menge_quelle: 'flaeche',
      flaeche: 'BGF',
    });
    u.befehl('zeile.kennwertUebernehmen', { id, kennwertId: k.id, version: 1 });
    expect(u.zeile(300)).toMatchObject({
      kkw_gewaehlt: 2400,
      kkw_stand_index: 120,
      kkw_ref_version: 1,
    });
    u.befehl('zeile.aendern', { id, felder: { menge_quelle: 'manuell', menge: 1200 } });
    const z = u.zeile(300);
    expect(z?.kkwWirksam).toBe(2772);
    expect(z?.kosten).toBe(3326400);
    expect(z?.index.text).toBe('132,0 ÷ 120,0 = 1,1000');
    expect(z?.hinweise).toEqual([]);
    const d = u.daten();
    expect(d.gesamt).toEqual({
      netto: 3326400,
      mwst: 632016,
      brutto: 3958416,
      massgebend: 3326400,
    });
    expect(d.bauwerk.netto).toBe(3326400);
    u.befehl('einstellung.aendern', { felder: { vorsteuerabzug: false } });
    expect(u.daten().gesamt.massgebend).toBe(3958416);
    u.schliessen();
  });

  it('R-11: Menge an BGF gekoppelt, Fläche folgt automatisch', () => {
    const u = aufbau();
    for (const [kategorie, wert] of [
      ['NUF1', 800],
      ['TF', 60],
      ['VF', 140],
      ['KGF', 150],
    ] as const)
      u.befehl('flaeche.setzen', { kategorie, wert_m2: wert, quelle: 'Testwert R-11' });
    const d = u.daten();
    expect([d.flaechen.NUF, d.flaechen.NRF, d.flaechen.BGF]).toEqual([800, 1000, 1150]);
    const id = u.anlegen(300);
    u.befehl('zeile.aendern', { id, felder: { kkw_gewaehlt: 2000 } });
    expect(u.zeile(300)).toMatchObject({ mengeWirksam: 1150, kosten: 2300000 });
    u.befehl('flaeche.setzen', { kategorie: 'KGF', wert_m2: 250 });
    expect(u.zeile(300)?.mengeWirksam).toBe(1250);
    expect(u.daten().bauwerkJeBgf).toBe(2000);
    // Fläche ganz entfernen (ohne Quelle) → Zeile weist darauf hin
    for (const kategorie of ['NUF1', 'TF', 'VF', 'KGF'] as const)
      u.befehl('flaeche.setzen', { kategorie, wert_m2: null, quelle: '' });
    expect(u.zeile(300)?.hinweise[0]).toMatch(/BGF ist noch nicht eingetragen/);
    u.schliessen();
  });

  it('Summen im KG-Baum: Unterzeilen sind maßgebend', () => {
    const u = aufbau();
    const z330 = u.anlegen(330);
    const z331 = u.anlegen(331);
    const z334 = u.anlegen(334);
    const manuell = (zid: string, menge: number, kkw: number) =>
      u.befehl('zeile.aendern', {
        id: zid,
        felder: { menge_quelle: 'manuell', menge, kkw_gewaehlt: kkw },
      });
    manuell(z330, 1, 999);
    manuell(z331, 100, 250.5);
    manuell(z334, 20, 800);
    const k = (kg: number) => u.daten().baum.find((b) => b.kg === kg);
    expect(k(330)).toMatchObject({ summe: 41050, ausUnterzeilen: true, kinder: [331, 334] });
    expect(k(300)?.summe).toBe(41050);
    expect(u.daten().gesamt.netto).toBe(41050);
    expect(() => u.befehl('zeile.anlegen', { kg: 331 })).toThrow(/bereits eine Zeile/);
    expect(() => u.befehl('zeile.anlegen', { kg: 999 })).toThrow(/Katalog/);
    u.befehl('zeile.loeschen', { ids: [z331, z334] });
    expect(k(330)).toMatchObject({ summe: 999, ausUnterzeilen: false });
    u.s.rueckgaengig();
    expect(k(330)?.summe).toBe(41050);
    u.schliessen();
  });

  it('Index je Zeile: ohne/eigener Faktor brauchen Begründung (E-56)', () => {
    const u = aufbau();
    u.befehl('einstellung.aendern', { felder: { index_aktuell: 132 } });
    const id = u.anlegen(400);
    u.befehl('zeile.aendern', {
      id,
      felder: { menge_quelle: 'manuell', menge: 10, kkw_gewaehlt: 100, kkw_stand_index: 120 },
    });
    expect(u.zeile(400)?.kosten).toBe(1100);
    u.befehl('zeile.aendern', { id, felder: { index_modus: 'ohne' } });
    expect(u.zeile(400)).toMatchObject({
      kosten: 1000,
      hinweise: [expect.stringMatching(/Begründung/)],
    });
    u.befehl('zeile.aendern', {
      id,
      felder: { index_modus: 'eigen', index_faktor: 1.2, index_begruendung: 'Angebot' },
    });
    expect(u.zeile(400)).toMatchObject({ kosten: 1200, hinweise: [] });
    // gewählt außerhalb der Spanne → Hinweis
    u.befehl('zeile.aendern', { id, felder: { kkw_von: 120, kkw_mittel: 150, kkw_bis: 180 } });
    expect(u.zeile(400)?.hinweise[0]).toMatch(/außerhalb der Spanne/);
    u.schliessen();
  });

  it('Bibliothekskopie eingefroren, Hinweis auf neuere Version, Lösen', () => {
    const u = aufbau();
    const k = u.bib('kennwert.anlegen', kennwert);
    const id = u.anlegen(300);
    u.befehl('zeile.kennwertUebernehmen', { id, kennwertId: k.id, version: 1 });
    u.bib('kennwert.aendern', { id: k.id, ...kennwert, mittel: 2500 });
    expect(u.zeile(300)).toMatchObject({ kkw_mittel: 2400, neuereVersion: 2 });
    expect(() => u.befehl('zeile.aendern', { id, felder: { kkw_mittel: 2500 } })).toThrow(
      /eingefroren/,
    );
    // gewählter KKW bleibt frei änderbar
    u.befehl('zeile.aendern', { id, felder: { kkw_gewaehlt: 2450 } });
    u.befehl('zeile.kennwertUebernehmen', { id, kennwertId: k.id, version: 2 });
    expect(u.zeile(300)).toMatchObject({
      kkw_mittel: 2500,
      kkw_gewaehlt: 2450,
      neuereVersion: null,
    });
    u.befehl('zeile.kennwertLoesen', { id });
    u.befehl('zeile.aendern', { id, felder: { kkw_mittel: 2600 } });
    expect(u.zeile(300)).toMatchObject({ kkw_ref: null, kkw_mittel: 2600 });
    u.schliessen();
  });

  it('Stände kopieren die Kosten und springen zurück', () => {
    const u = aufbau();
    const id = u.anlegen(300);
    u.befehl('zeile.aendern', {
      id,
      felder: { menge_quelle: 'manuell', menge: 100, kkw_gewaehlt: 10 },
    });
    u.befehl('stand.speichern', { name: 'Kostenschätzung' }, 'kern');
    u.befehl('zeile.aendern', { id, felder: { kkw_gewaehlt: 20 } });
    u.befehl('einstellung.aendern', { felder: { mwst_satz: 7 } });
    expect(u.daten().gesamt.netto).toBe(2000);
    const stand = (u.s.abfrage('kern', 'staende', undefined) as StandZeile[])[0];
    u.befehl('stand.laden', { id: stand?.id }, 'kern');
    expect(u.daten().gesamt).toMatchObject({ netto: 1000, mwst: 190 });
    u.schliessen();
  });

  it('Fläche aus der Bezugseinheit', () => {
    expect(['m² BGF', 'm² NUF', '€/m² AF', 'Stk'].map(flaecheAusEinheit)).toEqual([
      'BGF',
      'NUF',
      'AF',
      null,
    ]);
  });
});
