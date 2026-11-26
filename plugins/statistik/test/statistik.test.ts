import { GlobaleDaten, ProjektSitzung } from '@bautakt/kern';
import { bibliothekPlugin } from '@bautakt/plugin-bibliothek/main';
import { kostenPlugin } from '@bautakt/plugin-kosten/main';
import { terminePlugin } from '@bautakt/plugin-termine/main';
import { Arbeitskalender } from '@bautakt/rechnen-kalender';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Auswertung, Erhebung, ErfahrungsProjekt } from '../gemeinsam/typen.js';
import { statistikPlugin } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));
const kal = new Arbeitskalender({ start: '2026-12-14' });

function umgebung() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-statistik-'));
  ordner.push(o);
  const plugins = [bibliothekPlugin, terminePlugin, kostenPlugin, statistikPlugin];
  const g = GlobaleDaten.oeffnen(path.join(o, 'global'), plugins);
  const aw = g.aktion('bibliothek', 'aufwandswert.anlegen', {
    bezeichnung: 'Schalung Wände',
    gewerk: 'Rohbau',
    einheit: 'm²',
    h_je_me: 0.5,
    quelle: 'Test',
  }) as { id: string; version: number };
  const kw = g.aktion('bibliothek', 'kennwert.anlegen', {
    bezeichnung: 'Halle',
    kg: 300,
    einheit: 'm² BGF',
    mittel: 1000,
    quelle: 'Test',
  }) as { id: string; version: number };

  /**
   * Ein Projekt: Vorgang „Wände schalen“ (AW, 4 × 8 h, 640 m² → 10 AT) wird in `istDauer` AT fertig;
   * KG 300 mit Kennwert 1.000 €/m² × 100 m² = 100.000 €, Rechnung `rechnung`.
   */
  const projekt = (
    name: string,
    istDauer: number,
    rechnung: number,
    merkmale: { zaehlt?: boolean; gebaeudeart?: string } = {},
  ) => {
    const s = ProjektSitzung.neu(path.join(o, `${name}.bautakt`), name, {
      appVersion: 'test',
      autosaveMs: 0,
      plugins,
      globaleDienste: g,
    });
    const befehl = (plugin: string, n: string, d: unknown) =>
      s.befehl({ plugin, name: n, daten: d });
    const planId =
      befehl('termine', 'plan.anlegen', { name: 'P', projektstart: '2026-12-14' }).aenderungen.find(
        (a) => a.tabelle === 't_plan',
      )?.id ?? '';
    const v =
      befehl('termine', 'vorgang.anlegen', { planId, name: 'Wände schalen' }).aenderungen.find(
        (a) => a.tabelle === 't_vorgang',
      )?.id ?? '';
    befehl('termine', 'vorgang.aendern', { id: v, felder: { gewerk: 'Rohbau' } });
    befehl('termine', 'aufwand.uebernehmen', {
      vorgangId: v,
      menge: 640,
      ak: 4,
      h_je_at: 8,
      wert: { art: 'bibliothek', id: aw.id, version: 1 },
    });
    befehl('kern', 'stand.speichern', { name: 'Soll' });
    const stichtag = kal.endeDatum(30);
    befehl('termine', 'plan.aendern', { id: planId, stichtag });
    befehl('termine', 'ist.setzen', {
      vorgangId: v,
      stichtag,
      ist_anfang: kal.anfangDatum(0),
      ist_ende: kal.endeDatum(istDauer),
      ursache: istDauer > 10 ? 'witterung' : null,
    });
    // Kosten
    befehl('kosten', 'flaeche.setzen', { kategorie: 'NUF1', wert_m2: 100 });
    befehl('kosten', 'zeile.anlegen', { kg: 300 });
    const z = (s.abfrage('kosten', 'kosten', undefined) as { zeilen: { id: string }[] }).zeilen[0]
      ?.id;
    befehl('kosten', 'zeile.kennwertUebernehmen', { id: z, kennwertId: kw.id, version: 1 });
    befehl('kosten', 'stufe.festschreiben', { stufe: 'berechnung' });
    befehl('kosten', 'auftrag.anlegen', { kg: 300, betrag_netto: rechnung * 0.9 });
    befehl('kosten', 'rechnung.anlegen', { kg: 300, betrag_netto: rechnung });
    if (merkmale.zaehlt === false)
      befehl('statistik', 'merkmale.aendern', { felder: { zaehlt: false } });
    befehl('statistik', 'merkmale.aendern', {
      felder: { gebaeudeart: merkmale.gebaeudeart ?? 'Halle', bauweise: 'Fertigteil' },
    });
    const erhebung = s.abfrage('statistik', 'erhebung', undefined) as Erhebung;
    return { s, befehl, erhebung };
  };
  const auswertung = (a: object) => g.abfrage('statistik', 'auswertung', a) as Auswertung;
  return { g, aw, kw, projekt, auswertung };
}

describe('Statistik: Erfahrungsdatenbank (E-34, E-74–E-78)', () => {
  it('Erhebung je Projekt: Dauer (Soll-Stand vs. Ist), Kosten (Berechnung vs. Feststellung/Prognose), KKW', () => {
    const u = umgebung();
    const p = u.projekt('Projekt A', 12, 110000);
    const e = p.erhebung;
    expect(e.projekt).toMatchObject({
      projektname: 'Projekt A',
      zaehlt: true,
      gebaeudeart: 'Halle',
      bauweise: 'Fertigteil',
      bgf: 100,
    });
    expect(e.projekt.projekt_id).toMatch(/[0-9a-f-]{36}/);
    expect(e.dauer).toEqual([
      {
        bezeichnung: '1 Wände schalen',
        gewerk: 'Rohbau',
        aufwandswert_id: u.aw.id,
        aufwandswert_bez: 'Schalung Wände',
        ursache: 'Witterung',
        soll: 10,
        ist: 12,
      },
    ]);
    expect(e.kosten.find((k) => k.kg === 300)).toMatchObject({
      soll: 100000,
      ist: 110000,
      ist_prognose: 110000,
    });
    expect(e.kkw).toEqual([
      {
        kennwert_id: u.kw.id,
        bezeichnung: 'Halle',
        kg: 300,
        soll: 1000,
        ist: 1100,
        ist_prognose: 1100,
      },
    ]);
    p.s.schliessen();
    u.g.schliessen();
  });

  it('Übertragen, n ≥ 3, Kennzahlen, Vorschläge, „zählt in Statistik“, Filter', () => {
    const u = umgebung();
    const uebertragen = (e: Erhebung) => u.g.aktion('statistik', 'uebertragen', e);
    const a = u.projekt('A', 12, 110000);
    const b = u.projekt('B', 11, 112000);
    // erst zwei Projekte → noch keine Kennzahlen
    uebertragen(a.erhebung);
    uebertragen(b.erhebung);
    let aw = u.auswertung({ art: 'dauer', schluessel: 'aufwandswert' });
    expect(aw.gruppen).toMatchObject([
      { bezeichnung: 'Schalung Wände', n: 2, projekte: 2, faktor: null },
    ]);
    expect(aw.vorschlaege).toEqual([]);

    const c = u.projekt('C', 13, 108000);
    uebertragen(c.erhebung);
    // erneutes Übertragen ersetzt (keine Doppelungen)
    uebertragen(c.erhebung);
    aw = u.auswertung({ art: 'dauer', schluessel: 'aufwandswert' });
    expect(aw.gruppen[0]).toMatchObject({ n: 3, projekte: 3 });
    expect(aw.gruppen[0]?.faktor?.mittel).toBeCloseTo(1.2, 12); // (1,2 + 1,1 + 1,3) / 3
    expect(aw.vorschlaege).toEqual([
      {
        id: u.aw.id,
        art: 'aufwandswert',
        text: 'AW Schalung Wände im Mittel 20 % zu niedrig (n = 3) – Bibliothekswert anpassen?',
        faktor: expect.closeTo(1.2, 12),
      },
    ]);
    // Ursache: nur „Witterung“ (alle drei länger als 10 AT)
    expect(
      u
        .auswertung({ art: 'dauer', schluessel: 'ursache' })
        .gruppen.map((g) => [g.bezeichnung, g.n]),
    ).toEqual([['Witterung', 3]]);
    // Kosten: Faktoren 1,10 · 1,12 · 1,08 → 1,10; Prognose = höherer Wert (Rechnung)
    const kosten = u.auswertung({ art: 'kosten', schluessel: 'kg', basis: 'prognose' });
    expect(kosten.gruppen.find((g) => g.schluessel === '300')?.faktor?.mittel).toBeCloseTo(1.1, 12);
    const kkw = u.auswertung({ art: 'kkw', schluessel: 'kennwert' });
    expect(kkw.vorschlaege[0]?.text).toBe(
      'KKW Halle im Mittel 10 % zu niedrig (n = 3) – Bibliothekswert anpassen?',
    );

    // Projekt C zählt nicht mehr → n = 2
    const pid = c.erhebung.projekt.projekt_id;
    u.g.aktion('statistik', 'projekt.zaehlt', { projekt_id: pid, zaehlt: false });
    expect(u.auswertung({ art: 'dauer', schluessel: 'aufwandswert' }).gruppen[0]?.n).toBe(2);
    // Filter Gebäudeart
    const d = u.projekt('D', 10, 100000, { gebaeudeart: 'Büro' });
    uebertragen(d.erhebung);
    expect(
      u.auswertung({ art: 'dauer', schluessel: 'gewerk', filter: { gebaeudeart: 'Büro' } }),
    ).toMatchObject({
      projekte: 1,
      gruppen: [{ bezeichnung: 'Rohbau', n: 1 }],
    });
    expect(u.g.abfrage('statistik', 'merkmale', undefined)).toEqual({
      gebaeudearten: ['Büro', 'Halle'],
      bauweisen: ['Fertigteil'],
    });
    // Projekt entfernen
    u.g.aktion('statistik', 'projekt.entfernen', { projekt_id: pid });
    const projekte = u.g.abfrage('statistik', 'projekte', undefined) as ErfahrungsProjekt[];
    expect(projekte.map((p) => p.projektname).sort()).toEqual(['A', 'B', 'D']);
    expect(projekte.find((p) => p.projektname === 'A')?.beobachtungen).toBe(3);
    for (const x of [a, b, c, d]) x.s.schliessen();
    u.g.schliessen();
  });

  it('Merkmale und Vermerk im Projekt (Rückgängig)', () => {
    const u = umgebung();
    const p = u.projekt('A', 12, 110000);
    p.befehl('statistik', 'uebertragung.vermerken', { abgeschlossen: true });
    expect(p.s.abfrage('statistik', 'merkmale', undefined)).toMatchObject({
      abgeschlossen: 1,
      uebertragen: expect.stringMatching(/Z$/),
    });
    p.s.rueckgaengig();
    expect(p.s.abfrage('statistik', 'merkmale', undefined)).toMatchObject({
      abgeschlossen: 0,
      uebertragen: null,
    });
    p.s.schliessen();
    u.g.schliessen();
  });
});
