import { describe, expect, it } from 'vitest';
import {
  faktor,
  gruppieren,
  kennzahlen,
  prozent,
  vorschlagNoetig,
  vorschlagText,
  type Beobachtung,
} from '../src/index.js';

describe('Kennzahlen (E-77)', () => {
  it('Mittel, Median, Streuung (Stichprobe), Min, Max', () => {
    const k = kennzahlen([1.1, 1.2, 1.3, 1.6]);
    expect(k?.n).toBe(4);
    expect(k?.mittel).toBeCloseTo(1.3, 12);
    expect(k?.median).toBeCloseTo(1.25, 12);
    // Abweichungen −0,2 −0,1 0 0,3 → Σ² = 0,14 → ÷ 3 → 0,0467 → 0,2160
    expect(k?.streuung).toBeCloseTo(0.216025, 5);
    expect([k?.min, k?.max]).toEqual([1.1, 1.6]);
    expect(kennzahlen([2])).toMatchObject({ median: 2, streuung: 0 });
    expect(kennzahlen([1, 3, 2])?.median).toBe(2);
    expect(kennzahlen([])).toBeNull();
  });
});

describe('Beobachtungen gruppieren (E-74–E-77)', () => {
  type B = Beobachtung & { aw: string | null; name: string };
  const b = (
    projekt_id: string,
    aw: string | null,
    soll: number,
    ist: number | null,
    prog?: number,
  ): B => ({
    projekt_id,
    aw,
    name: aw ? `AW ${aw}` : '',
    soll,
    ist,
    ist_prognose: prog ?? null,
  });
  const daten: B[] = [
    b('p1', 'schalung', 10, 12),
    b('p1', 'schalung', 10, 11),
    b('p2', 'schalung', 20, 24),
    b('p3', 'schalung', 10, 12.5, 13),
    b('p2', 'bewehrung', 10, 9),
    b('p3', 'bewehrung', 10, null, 9.5),
    b('p3', null, 10, 30),
    b('p4', 'mauer', 0, 5),
  ];

  it('Faktor Ist ÷ Soll, wahlweise Prognose', () => {
    expect(faktor(daten[0] as B)).toBeCloseTo(1.2, 12);
    expect(faktor(daten[3] as B, 'prognose')).toBeCloseTo(1.3, 12);
    expect(faktor(daten[5] as B)).toBeNull();
    expect(faktor(daten[7] as B)).toBeNull(); // Soll 0
  });

  it('Gruppen mit n, Projekten, Kennzahlen erst ab n ≥ 3', () => {
    const g = gruppieren(
      daten,
      (x) => x.aw,
      (x) => x.name,
    );
    expect(g.map((x) => [x.schluessel, x.n, x.projekte])).toEqual([
      ['bewehrung', 1, 1],
      ['schalung', 4, 3],
    ]);
    const s = g.find((x) => x.schluessel === 'schalung');
    // Faktoren 1,2 · 1,1 · 1,2 · 1,25 → Mittel 1,1875
    expect(s?.faktor?.mittel).toBeCloseTo(1.1875, 12);
    expect(g.find((x) => x.schluessel === 'bewehrung')?.faktor).toBeNull();
    const p = gruppieren(
      daten,
      (x) => x.aw,
      (x) => x.name,
      'prognose',
    );
    expect(p.map((x) => [x.schluessel, x.n])).toEqual([
      ['bewehrung', 1],
      ['schalung', 1],
    ]);
  });

  it('Vorschlag ab 5 % mit Text nach E-34', () => {
    const g = gruppieren(
      daten,
      (x) => x.aw,
      (x) => x.name,
    ).find((x) => x.schluessel === 'schalung');
    if (!g) throw new Error('Gruppe fehlt');
    expect(prozent(g.faktor?.mittel ?? 1)).toBe(19);
    expect(vorschlagNoetig(g)).toBe(true);
    expect(vorschlagText('Aufwandswert', 'Schalung Wände', g)).toBe(
      'AW Schalung Wände im Mittel 19 % zu niedrig (n = 4) – Bibliothekswert anpassen?',
    );
    const knapp = { ...g, faktor: { ...(g.faktor as NonNullable<typeof g.faktor>), mittel: 0.95 } };
    expect(vorschlagNoetig(knapp)).toBe(true);
    expect(vorschlagText('Kennwert', 'Halle', knapp)).toBe(
      'KKW Halle im Mittel 5 % zu hoch (n = 4) – Bibliothekswert anpassen?',
    );
    expect(
      vorschlagNoetig({
        ...g,
        faktor: { ...(g.faktor as NonNullable<typeof g.faktor>), mittel: 1.04 },
      }),
    ).toBe(false);
    expect(vorschlagNoetig({ ...g, faktor: null })).toBe(false);
  });
});
