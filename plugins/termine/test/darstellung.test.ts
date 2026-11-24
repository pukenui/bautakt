import { Arbeitskalender } from '@bautakt/rechnen-kalender';
import { describe, expect, it } from 'vitest';
import { KNOTEN, kreuzungen, netzLayout } from '../renderer/netzlayout.js';
import { pfeilWeg, Zeitachse } from '../renderer/zeitachse.js';
import { sichtbareVorgaenge } from '../renderer/daten.js';
import type { VorgangMitEbene } from '../gemeinsam/typen.js';

describe('Netzplan-Layout (E-20)', () => {
  const kanten = [
    { von: '1', nach: '2' },
    { von: '1', nach: '3' },
    { von: '2', nach: '4' },
    { von: '3', nach: '4' },
    { von: '3', nach: '5' },
    { von: '4', nach: '6' },
    { von: '5', nach: '6' },
  ];
  const knoten = (manuell: Record<string, [number, number]> = {}) =>
    ['1', '2', '3', '4', '5', '6'].map((id) => ({
      id,
      x: manuell[id]?.[0] ?? null,
      y: manuell[id]?.[1] ?? null,
      faz: 0,
    }));

  it('Spalten nach Rang (R-01: 1 | 2,3 | 4,5 | 6)', () => {
    const l = netzLayout(knoten(), kanten);
    const spalte = (id: string) => ((l.get(id)?.x ?? 0) - KNOTEN.rand) / KNOTEN.spalte;
    expect(['1', '2', '3', '4', '5', '6'].map(spalte)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(kreuzungen(l, kanten)).toBe(0);
  });

  it('Barycenter vermeidet Kreuzungen', () => {
    // 2 und 3 vertauscht in der Eingabe: a→y, b→x führt ohne Sortierung zu einer Kreuzung
    const k = [
      { id: 'a', x: null, y: null, faz: 0 },
      { id: 'b', x: null, y: null, faz: 0 },
      { id: 'x', x: null, y: null, faz: 0 },
      { id: 'y', x: null, y: null, faz: 0 },
    ];
    const e = [
      { von: 'a', nach: 'y' },
      { von: 'b', nach: 'x' },
    ];
    expect(kreuzungen(netzLayout(k, e), e)).toBe(0);
  });

  it('manuelle Positionen überschreiben das Auto-Layout', () => {
    const l = netzLayout(knoten({ '4': [999, 555] }), kanten);
    expect(l.get('4')).toEqual({ x: 999, y: 555, manuell: true });
    expect(l.get('1')?.manuell).toBe(false);
  });
});

describe('Zeitachse des Balkenplans', () => {
  const kal = new Arbeitskalender({
    start: '2026-12-14',
    ruhezeiten: [{ von: '2026-12-21', bis: '2027-01-01', name: 'Weihnachtspause' }],
  });
  const achse = new Zeitachse(
    20_000 + 436, // beliebiger Beginn
    20_000 + 500,
    'tag',
    kal,
  );

  it('Anfang/Ende/Meilenstein liegen auf Tagesgrenzen', () => {
    // FAZ 0 → Beginn Mo 14.12.; FEZ 10 → Ende Fr 08.01. (= Beginn Sa 09.01.)
    expect(achse.xAnfang(0)).toBe(achse.xDatum('2026-12-14'));
    expect(achse.xEnde(10)).toBe(achse.xDatum('2027-01-09'));
    expect(achse.xPunkt(0)).toBe(achse.xDatum('2026-12-14'));
    expect(achse.xPunkt(5)).toBe(achse.xDatum('2026-12-19'));
  });

  it('Kopfzeilen und freie Streifen', () => {
    const a = new Zeitachse(20_436, 20_451, 'tag', kal); // 15 Tage ab 14.12.2025? (nur Struktur prüfen)
    const { oben, unten } = a.kopf();
    expect(unten).toHaveLength(15);
    expect(oben.reduce((s, x) => s + x.breite, 0)).toBeCloseTo(a.breite);
    const w = new Zeitachse(20_801, 20_830, 'woche', kal); // 14.12.2026 …
    const streifen = w.freieStreifen();
    expect(streifen.some((s) => s.art === 'ruhezeit' && s.text === 'Weihnachtspause')).toBe(true);
  });

  it('Pfeilwege sind orthogonal', () => {
    expect(pfeilWeg(0, 0, 50, 20, true, true)).toBe('M0,0 H8 V20 H50');
    expect(pfeilWeg(50, 0, 10, 20, true, true, 8, 10)).toBe('M50,0 H58 V10 H2 V20 H10');
  });
});

describe('Zuklappen (Rahmenterminplan, E-14)', () => {
  const v = (id: string, ebene: number, hatKinder = false) =>
    ({ id, ebene, hatKinder }) as unknown as VorgangMitEbene;
  it('blendet Unterpunkte zugeklappter Sammelvorgänge aus', () => {
    const liste = [v('A', 0, true), v('A1', 1, true), v('A11', 2), v('A2', 1), v('B', 0)];
    expect(sichtbareVorgaenge(liste, ['A1']).map((x) => x.id)).toEqual(['A', 'A1', 'A2', 'B']);
    expect(sichtbareVorgaenge(liste, ['A']).map((x) => x.id)).toEqual(['A', 'B']);
  });
});
