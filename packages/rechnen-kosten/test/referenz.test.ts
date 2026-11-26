import { describe, expect, it } from 'vitest';
import {
  bezugsflaecheVorschlag,
  flaechenAbleiten,
  indexfaktor,
  KG_KATALOG,
  kgEbene,
  kgEltern,
  kgUnter,
  kostenBaum,
  kostengruppe,
  kkwWirksam,
  rundeCent,
  steuer,
  zeilenkosten,
} from '../src/index.js';

describe('R-10 Kostenzeile mit Index, Regionalfaktor, MwSt.', () => {
  it('KKW indexiert 2.640,00, mit Regionalfaktor 2.772,00; Kosten 3.326.400,00 €', () => {
    const i = indexfaktor({
      modus: 'index',
      indexStand: 120,
      indexAktuell: 132,
      eigenerFaktor: null,
      begruendung: '',
    });
    expect(i.faktor).toBeCloseTo(1.1, 12);
    expect(i.text).toBe('132,0 ÷ 120,0 = 1,1000');
    expect(kkwWirksam(2400, i.faktor, 1)).toBe(2640);
    const kkw = kkwWirksam(2400, i.faktor, 1.05);
    expect(kkw).toBe(2772);
    const netto = zeilenkosten(1200, kkw);
    expect(netto).toBe(3326400);
    expect(steuer(netto, 19, true)).toEqual({
      netto: 3326400,
      mwst: 632016,
      brutto: 3958416,
      massgebend: 3326400,
    });
    expect(steuer(netto, 19, false).massgebend).toBe(3958416);
  });
});

describe('R-11 DIN 277 Flächenableitung', () => {
  it('NRF = NUF + TF + VF = 1.000 m², BGF = NRF + KGF = 1.150 m²', () => {
    const f = flaechenAbleiten({ NUF1: 500, NUF4: 300, TF: 60, VF: 140, KGF: 150 });
    expect(f.NUF).toBe(800);
    expect(f.NRF).toBe(1000);
    expect(f.BGF).toBe(1150);
    expect(f.AF).toBeNull();
  });

  it('ohne Eingaben keine Summen; Teilsummen sobald ein Summand da ist', () => {
    expect(flaechenAbleiten({}).BGF).toBeNull();
    const f = flaechenAbleiten({ KGF: 150 });
    expect(f.NRF).toBeNull();
    expect(f.BGF).toBe(150);
  });
});

describe('DIN-276-Katalog (E-55)', () => {
  it('Ebenen und Eltern', () => {
    expect([kgEbene(300), kgEbene(330), kgEbene(331)]).toEqual([1, 2, 3]);
    expect([kgEltern(331), kgEltern(330), kgEltern(300)]).toEqual([330, 300, null]);
    expect(kgUnter(331, 300)).toBe(true);
    expect(kgUnter(331, 331)).toBe(false);
    expect(kgUnter(341, 330)).toBe(false);
  });

  it('Katalog vollständig, eindeutig, aufsteigend und mit Eltern', () => {
    const nummern = KG_KATALOG.map((k) => k.kg);
    expect(new Set(nummern).size).toBe(nummern.length);
    expect([...nummern].sort((a, b) => a - b)).toEqual(nummern);
    for (const h of [100, 200, 300, 400, 500, 600, 700, 800]) expect(kostengruppe(h)).toBeDefined();
    for (const k of KG_KATALOG) {
      const e = kgEltern(k.kg);
      if (e !== null) expect(kostengruppe(e), `Eltern von ${k.kg}`).toBeDefined();
      expect(k.bezeichnung.length).toBeGreaterThan(2);
    }
    expect(kostengruppe(331)?.bezeichnung).toBe('Tragende Außenwände');
    expect(kostengruppe(300)?.bezeichnung).toBe('Bauwerk – Baukonstruktionen');
  });

  it('Bezugsfläche wird je KG vorgeschlagen', () => {
    expect([100, 200, 331, 440, 500, 610, 730, 810].map(bezugsflaecheVorschlag)).toEqual([
      'GF',
      'GF',
      'BGF',
      'BGF',
      'AF',
      'BGF',
      'BGF',
      'BGF',
    ]);
  });
});

describe('Indexierung je Zeile (E-56)', () => {
  const basis = { indexStand: 120, indexAktuell: 132, eigenerFaktor: null, begruendung: '' };
  it('ohne Indexierung und eigener Faktor brauchen eine Begründung', () => {
    expect(indexfaktor({ ...basis, modus: 'ohne' })).toMatchObject({
      faktor: 1,
      fehler: expect.stringMatching(/Begründung/),
    });
    expect(
      indexfaktor({ ...basis, modus: 'ohne', begruendung: 'Angebot liegt vor' }).fehler,
    ).toBeNull();
    expect(
      indexfaktor({ ...basis, modus: 'eigen', eigenerFaktor: 1.08, begruendung: 'Marktlage' }),
    ).toMatchObject({
      faktor: 1.08,
      fehler: null,
      text: 'eigener Faktor 1,0800',
    });
    expect(indexfaktor({ ...basis, modus: 'eigen', eigenerFaktor: 1.08 }).fehler).toMatch(
      /Begründung/,
    );
    expect(indexfaktor({ ...basis, modus: 'eigen', begruendung: 'x' }).fehler).toMatch(/fehlt/);
  });
  it('fehlender Index → Faktor 1 mit Hinweis', () => {
    expect(indexfaktor({ ...basis, modus: 'index', indexAktuell: null })).toMatchObject({
      faktor: 1,
      hinweis: expect.stringMatching(/Aktueller Baupreisindex/),
    });
    expect(indexfaktor({ ...basis, modus: 'index', indexStand: null }).hinweis).toMatch(
      /zum Stand/,
    );
  });
});

describe('Rundung und Summen (E-15, E-57)', () => {
  it('rundet kaufmännisch auf Cent', () => {
    expect(rundeCent(1.005)).toBe(1.01);
    expect(rundeCent(2771.9999999)).toBe(2772);
    expect(rundeCent(-1.005)).toBe(-1.01);
    // KKW wird vor der Multiplikation gerundet: 333,333… → 333,33 × 3 = 999,99
    expect(zeilenkosten(3, kkwWirksam(1000 / 3, 1, 1))).toBe(999.99);
  });

  it('Summen nach oben; Unterzeilen sind maßgebend', () => {
    const b = kostenBaum([
      { kg: 330, kosten: 999 }, // wird durch 331 + 334 überdeckt
      { kg: 331, kosten: 100.1 },
      { kg: 334, kosten: 200.2 },
      { kg: 350, kosten: 50 },
      { kg: 440, kosten: 10 },
      { kg: 361, kosten: null },
    ]);
    expect(b.get(330)).toMatchObject({
      summe: 300.3,
      eigene: 999,
      ausUnterzeilen: true,
      kinder: [331, 334],
    });
    expect(b.get(300)).toMatchObject({ summe: 350.3, kinder: [330, 350, 360] });
    expect(b.get(360)).toMatchObject({ summe: null });
    expect(b.get(400)?.summe).toBe(10);
    expect(b.get(500)).toBeUndefined();
  });
});
