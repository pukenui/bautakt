import { describe, expect, it } from 'vitest';
import { sollIstBaum, summenAdditiv } from '../src/index.js';

const fest = {
  rahmen: [{ kg: 300, betrag: 220000 }],
  schaetzung: [
    { kg: 330, betrag: 140000 },
    { kg: 350, betrag: 70000 },
  ],
  berechnung: [
    { kg: 331, betrag: 100000 },
    { kg: 334, betrag: 50000 },
    { kg: 350, betrag: 80000 },
    { kg: 440, betrag: 40000 },
  ],
};
const auftraege = [
  { kg: 331, betrag: 60000 },
  { kg: 331, betrag: 50000 },
  { kg: 350, betrag: 75000 },
  { kg: 440, betrag: 42000 },
];
const rechnungen = [
  { kg: 331, betrag: 30000 },
  { kg: 350, betrag: 80000 },
];

describe('Soll-Ist Kosten (E-33, E-60, E-61)', () => {
  it('Stufen je KG: festgeschriebene Stufen wie die Planung, Anschlag/Feststellung aus Ist', () => {
    const b = sollIstBaum({ fest, auftraege, rechnungen, bezug: 'berechnung' });
    expect(b.get(300)?.stufen).toEqual({
      rahmen: 220000,
      schaetzung: 210000,
      berechnung: 230000,
      anschlag: 185000,
      feststellung: 110000,
    });
    expect(b.get(330)?.stufen).toMatchObject({
      rahmen: null,
      schaetzung: 140000,
      berechnung: 150000,
    });
    expect(b.get(334)?.stufen.anschlag).toBeNull();
  });

  it('Prognose: vergeben = höherer Wert aus Aufträgen/Rechnungen, sonst Bezug', () => {
    const b = sollIstBaum({ fest, auftraege, rechnungen, bezug: 'berechnung' });
    expect(b.get(331)).toMatchObject({
      prognose: 110000,
      abweichung: 10000,
      abweichungProzent: 10,
    });
    expect(b.get(334)).toMatchObject({ prognose: 50000, abweichung: 0 });
    expect(b.get(350)).toMatchObject({ prognose: 80000, abweichung: 0 }); // Rechnung > Auftrag
    expect(b.get(330)).toMatchObject({
      prognose: 160000,
      abweichung: 10000,
      abweichungProzent: 6.7,
    });
    expect(b.get(300)).toMatchObject({
      prognose: 240000,
      abweichung: 10000,
      abweichungProzent: 4.3,
    });
    expect(b.get(400)).toMatchObject({ prognose: 42000, abweichung: 2000, abweichungProzent: 5 });
  });

  it('Auftrag auf übergeordneter KG wird zusätzlich gezählt', () => {
    const b = sollIstBaum({
      fest,
      auftraege: [...auftraege, { kg: 330, betrag: 5000 }],
      rechnungen,
      bezug: 'berechnung',
    });
    expect(b.get(330)?.prognose).toBe(165000);
    expect(b.get(330)?.stufen.anschlag).toBe(115000);
  });

  it('Bezugsstufe Kostenrahmen (nur Ebene 1): Ist wird der KG 300 zugeordnet', () => {
    const b = sollIstBaum({ fest, auftraege, rechnungen, bezug: 'rahmen' });
    expect(b.get(300)).toMatchObject({
      prognose: 185000,
      abweichung: -35000,
      abweichungProzent: -15.9,
    });
    // KG 400 hat keinen Rahmen → Prognose aus Aufträgen, Abweichung nicht bestimmbar
    expect(b.get(400)).toMatchObject({ prognose: 42000, abweichung: null });
  });

  it('Bezugsstufe Kostenanschlag: Prognose aus Aufträgen bzw. höheren Rechnungen', () => {
    const b = sollIstBaum({ fest, auftraege, rechnungen, bezug: 'anschlag' });
    expect(b.get(350)).toMatchObject({ prognose: 80000, abweichung: 5000 });
    expect(b.get(300)).toMatchObject({ prognose: 190000, abweichung: 5000 });
  });

  it('additive Summen über den Baum', () => {
    const m = summenAdditiv([
      { kg: 331, betrag: 0.1 },
      { kg: 331, betrag: 0.2 },
      { kg: 330, betrag: 1 },
    ]);
    expect([m.get(331), m.get(330), m.get(300)]).toEqual([0.3, 1.3, 1.3]);
  });
});
