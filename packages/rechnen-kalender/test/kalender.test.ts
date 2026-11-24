import { describe, expect, it } from 'vitest';
import {
  Arbeitskalender,
  datumAusDeutsch,
  datumDeutsch,
  feiertageNW,
  isoKalenderwoche,
  ostersonntag,
} from '../src/index.js';

/** Kalender aus R-07: Start Mo 14.12.2026, Mo–Fr, NRW, Weihnachtspause 21.12.2026–01.01.2027. */
const r07 = () =>
  new Arbeitskalender({
    start: '2026-12-14',
    ruhezeiten: [{ von: '2026-12-21', bis: '2027-01-01', name: 'Weihnachtspause' }],
  });

describe('Ostern (Gauß/Meeus)', () => {
  it.each([
    [2019, '2019-04-21'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
    [2285, '2285-03-22'], // frühestmöglicher Termin
  ])('%i → %s', (jahr, datum) => expect(ostersonntag(jahr)).toBe(datum));
});

describe('Feiertage NRW (R-07)', () => {
  it('2027 vollständig', () => {
    expect(feiertageNW(2027).map((f) => f.datum)).toEqual([
      '2027-01-01',
      '2027-03-26',
      '2027-03-29',
      '2027-05-01',
      '2027-05-06',
      '2027-05-17',
      '2027-05-27',
      '2027-10-03',
      '2027-11-01',
      '2027-12-25',
      '2027-12-26',
    ]);
  });

  it('2026 bewegliche Feiertage (Kontrolle)', () => {
    const tage = feiertageNW(2026).map((f) => f.datum);
    for (const d of ['2026-04-03', '2026-04-06', '2026-05-14', '2026-05-25', '2026-06-04']) {
      expect(tage).toContain(d);
    }
    expect(tage).not.toContain('2026-01-06'); // Heilige Drei Könige: in NRW kein Feiertag
  });

  it('Kalender erkennt Feiertage, Wochenende und Ruhezeit', () => {
    const k = r07();
    expect(k.freigrund('2027-03-26')).toEqual({ art: 'feiertag', name: 'Karfreitag' });
    expect(k.freigrund('2026-12-19')).toEqual({ art: 'wochenende' });
    expect(k.freigrund('2026-12-23')).toEqual({ art: 'ruhezeit', name: 'Weihnachtspause' });
    expect(k.istArbeitstag('2027-01-06')).toBe(true);
    expect(k.istArbeitstag('2026-12-18')).toBe(true);
  });
});

describe('AT ↔ Datum (R-07)', () => {
  it('Vorgang A: FAZ 0, D 10 → Mo 14.12.2026 bis Fr 08.01.2027', () => {
    const k = r07();
    expect(k.anfangDatum(0)).toBe('2026-12-14');
    expect(k.endeDatum(10)).toBe('2027-01-08');
    expect([1, 2, 3, 4, 5].map((n) => k.datumVonAT(n))).toEqual([
      '2026-12-14',
      '2026-12-15',
      '2026-12-16',
      '2026-12-17',
      '2026-12-18',
    ]);
    expect(k.datumVonAT(6)).toBe('2027-01-04');
  });

  it('Datum → AT und zurück', () => {
    const k = r07();
    expect(k.atVonDatum('2027-01-04')).toBe(6);
    expect(k.atVonDatum('2026-12-24')).toBeNull();
    for (let n = -30; n <= 300; n++) expect(k.atVonDatum(k.datumVonAT(n))).toBe(n);
  });

  it('Arbeitstage vor dem Start (negative SAZ)', () => {
    const k = r07();
    expect(k.datumVonAT(0)).toBe('2026-12-11'); // Fr vor dem Start
    expect(k.datumVonAT(-1)).toBe('2026-12-10');
    expect(k.datumVonAT(-5)).toBe('2026-12-04');
  });

  it('Bedingungen „nicht früher als“ und „muss enden am“ in Zeitpunkte', () => {
    const k = r07();
    // nicht früher als Mi 23.12. (Ruhezeit) → frühester Anfang Mo 04.01. = AT 6 → Zeitpunkt 5
    expect(k.zeitpunktFruehestensAb('2026-12-23')).toBe(5);
    expect(k.zeitpunktFruehestensAb('2026-12-14')).toBe(0);
    // muss enden am So 10.01. → Ende des Fr 08.01. = AT 10
    expect(k.zeitpunktSpaetestensBis('2027-01-10')).toBe(10);
    expect(k.zeitpunktSpaetestensBis('2027-01-08')).toBe(10);
    // vor dem Start
    expect(k.zeitpunktSpaetestensBis('2026-12-13')).toBe(0);
    expect(k.zeitpunktFruehestensAb('2026-12-12')).toBe(0);
    expect(k.zeitpunktFruehestensAb('2026-12-10')).toBe(-2);
  });
});

describe('KT-Abstand (R-08)', () => {
  it('Ende A Fr 08.01.2027 + 21 KT → Anfang B Mo 01.02.2027 (FAZ_B = 25)', () => {
    const k = r07();
    const fazB = k.ktVersatz(10, 21);
    expect(fazB).toBe(25);
    expect(k.anfangDatum(fazB)).toBe('2027-02-01');
  });

  it('Gegenprobe +21 AT: FAZ_B = 31 → Di 09.02.2027', () => {
    expect(r07().anfangDatum(10 + 21)).toBe('2027-02-09');
  });

  it('0 KT ändert nichts; negative KT sind erlaubt', () => {
    const k = r07();
    for (let t = -5; t < 60; t++) expect(k.ktVersatz(t, 0)).toBe(t);
    // Ende Fr 08.01. (10) − 3 KT → Beginn Sa 09.01. − 3 = Mi 06.01. → AT 8 → Zeitpunkt 7
    expect(k.ktVersatz(10, -3)).toBe(7);
  });

  it('ist monoton', () => {
    const k = r07();
    for (let t = -10; t < 100; t++)
      expect(k.ktVersatz(t + 1, 14)).toBeGreaterThanOrEqual(k.ktVersatz(t, 14));
  });
});

describe('Kalender-Einstellungen', () => {
  it('Arbeitstage-Maske (z. B. Mo–Sa)', () => {
    const k = new Arbeitskalender({
      start: '2026-12-14',
      arbeitstage: [true, true, true, true, true, true, false],
      bundesland: null,
    });
    expect(k.datumVonAT(6)).toBe('2026-12-19');
    expect(k.datumVonAT(7)).toBe('2026-12-21');
  });

  it('ohne Feiertage', () => {
    const k = new Arbeitskalender({ start: '2027-03-25', bundesland: null });
    expect(k.datumVonAT(2)).toBe('2027-03-26'); // Karfreitag zählt
  });

  it('weist ungültige Eingaben ab', () => {
    expect(() => new Arbeitskalender({ start: '2027-02-30' })).toThrow(/Ungültiges Datum/);
    expect(
      () => new Arbeitskalender({ start: '2027-01-01', arbeitstage: Array(7).fill(false) }),
    ).toThrow(/Mindestens ein Wochentag/);
    expect(
      () =>
        new Arbeitskalender({
          start: '2027-01-01',
          ruhezeiten: [{ von: '2027-02-01', bis: '2027-01-01' }],
        }),
    ).toThrow(/endet vor/);
  });
});

describe('Datumsformat und Kalenderwoche', () => {
  it('deutsches Format', () => {
    expect(datumDeutsch('2027-01-08')).toBe('08.01.2027');
    expect(datumAusDeutsch('8.1.2027')).toBe('2027-01-08');
    expect(() => datumAusDeutsch('31.02.2027')).toThrow();
  });

  it.each([
    ['2026-12-31', 2026, 53],
    ['2027-01-01', 2026, 53],
    ['2027-01-04', 2027, 1],
    ['2026-12-14', 2026, 51],
    ['2024-12-30', 2025, 1],
  ])('KW %s → %i/%i', (datum, jahr, woche) => {
    expect(isoKalenderwoche(datum)).toEqual({ jahr, woche });
  });
});
