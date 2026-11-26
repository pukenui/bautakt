import { describe, expect, it } from 'vitest';
import {
  aufwandRechnen,
  AufwandFehler,
  zahlDeutsch,
  zahlLesen,
  type AufwandEingabe,
} from '../src/index.js';

const kolonne = { ak: 4, hJeAt: 8, zuschlaege: [] } as const;

describe('R-09 Aufwandswerte (UE 05, Folie 21)', () => {
  it('Schalung Ortbetonwände: 650 m² × 0,50 h/m² → 11 AT', () => {
    const r = aufwandRechnen({ menge: 650, einheit: 'm²', aw: 0.5, ...kolonne });
    expect(r.lohnstunden).toBe(325);
    expect(r.stundenJeAt).toBe(32);
    expect(r.dauerExakt).toBeCloseTo(10.15625, 10);
    expect(r.dauer).toBe(11);
    expect(r.formel).toBe('650 m² × 0,50 h/m² = 325 h ÷ (4 × 8 h) = 10,2 → 11 AT');
  });

  it('Montage Fertigteilstützen: 24 Stk × 2,0 h/Stk → 2 AT', () => {
    const r = aufwandRechnen({ menge: 24, einheit: 'Stk', aw: 2, ...kolonne });
    expect(r.lohnstunden).toBe(48);
    expect(r.dauer).toBe(2);
    expect(r.formel).toBe('24 Stk × 2,00 h/Stk = 48 h ÷ (4 × 8 h) = 1,5 → 2 AT');
  });

  it('Schalung mit Zuschlag Winterbau +15 % → 373,75 h → 12 AT', () => {
    const r = aufwandRechnen({
      menge: 650,
      einheit: 'm²',
      aw: 0.5,
      ...kolonne,
      zuschlaege: [{ name: 'Winterbau', prozent: 15 }],
    });
    expect(r.stunden).toBeCloseTo(373.75, 10);
    expect(r.dauerExakt).toBeCloseTo(11.6796875, 10);
    expect(r.dauer).toBe(12);
    expect(r.formel).toBe(
      '650 m² × 0,50 h/m² = 325 h × (1 + 15 % Winterbau) = 373,75 h ÷ (4 × 8 h) = 11,7 → 12 AT',
    );
  });
});

describe('Aufwandswert-Rechner (E-24, E-53)', () => {
  const basis: AufwandEingabe = { menge: 650, einheit: 'm²', aw: 0.5, ...kolonne };

  it('mehrere Zu-/Abschläge werden addiert', () => {
    const r = aufwandRechnen({
      ...basis,
      zuschlaege: [
        { name: 'Einarbeitung', prozent: 10 },
        { name: 'Winterbau', prozent: 15 },
        { name: 'Wiederholeffekt', prozent: -5 },
      ],
    });
    expect(r.faktor).toBeCloseTo(1.2, 12);
    expect(r.stunden).toBeCloseTo(390, 10);
    expect(r.dauer).toBe(13); // 390 / 32 = 12,19
    expect(r.formel).toBe(
      '650 m² × 0,50 h/m² = 325 h × (1 + 10 % Einarbeitung + 15 % Winterbau − 5 % Wiederholeffekt) = 390 h ÷ (4 × 8 h) = 12,2 → 13 AT',
    );
  });

  it('glatte Dauer wird nicht aufgerundet, auch mit Gleitkomma-Rest', () => {
    const r = aufwandRechnen({ ...basis, menge: 640 }); // 320 h ÷ 32 = 10
    expect(r.dauer).toBe(10);
    expect(r.formel.endsWith('= 10,0 → 10 AT')).toBe(true);
    // 0,1 × 3 = 0,30000000000000004
    expect(aufwandRechnen({ ...basis, menge: 3, aw: 0.1, ak: 0.3, hJeAt: 1 }).dauer).toBe(1);
  });

  it('zwei Nachkommastellen, wenn eine Stelle eine ganze Zahl vortäuscht', () => {
    const r = aufwandRechnen({ ...basis, menge: 642 }); // 321 h ÷ 32 = 10,03
    expect(r.dauer).toBe(11);
    expect(r.formel.endsWith('= 10,03 → 11 AT')).toBe(true);
  });

  it('mindestens 1 AT, Dezimalwerte und Tausenderpunkt in der Formel', () => {
    const r = aufwandRechnen({
      menge: 1250.5,
      einheit: 'm³',
      aw: 0.125,
      ak: 3,
      hJeAt: 8.5,
      zuschlaege: [],
    });
    expect(r.formel).toBe('1.250,5 m³ × 0,125 h/m³ = 156,31 h ÷ (3 × 8,5 h) = 6,1 → 7 AT');
    expect(aufwandRechnen({ ...basis, menge: 1, aw: 0.1 }).dauer).toBe(1);
  });

  it('ungültige Eingaben mit verständlicher Meldung', () => {
    expect(() => aufwandRechnen({ ...basis, menge: 0 })).toThrow(AufwandFehler);
    expect(() => aufwandRechnen({ ...basis, aw: -1 })).toThrow(/Aufwandswert/);
    expect(() => aufwandRechnen({ ...basis, ak: Number.NaN })).toThrow(/Arbeitskräfte/);
    expect(() => aufwandRechnen({ ...basis, hJeAt: 25 })).toThrow(/24 h/);
    expect(() => aufwandRechnen({ ...basis, einheit: ' ' })).toThrow(/Mengeneinheit/);
    expect(() =>
      aufwandRechnen({ ...basis, zuschlaege: [{ name: 'Abschlag', prozent: -100 }] }),
    ).toThrow(/100 %/);
    expect(() => aufwandRechnen({ ...basis, zuschlaege: [{ name: '', prozent: 5 }] })).toThrow(
      /Namen/,
    );
  });

  it('Zahlen aus Eingaben lesen', () => {
    expect(zahlLesen('0,5')).toBe(0.5);
    expect(zahlLesen('0.5')).toBe(0.5);
    expect(zahlLesen('1.250,5')).toBe(1250.5);
    expect(zahlLesen(' 12 ')).toBe(12);
    expect(zahlLesen('-5')).toBe(-5);
    expect(zahlLesen('')).toBeNaN();
    expect(zahlLesen('1,2,3')).toBeNaN();
    expect(zahlLesen('abc')).toBeNaN();
  });

  it('Zahlformat', () => {
    expect(zahlDeutsch(1234567.891)).toBe('1.234.567,89');
    expect(zahlDeutsch(0.5, 2, 2)).toBe('0,50');
    expect(zahlDeutsch(12.5)).toBe('12,5');
    expect(zahlDeutsch(-3)).toBe('−3');
    expect(zahlDeutsch(-0.001)).toBe('0');
  });
});
