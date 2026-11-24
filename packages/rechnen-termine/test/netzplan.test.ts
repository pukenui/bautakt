import { Arbeitskalender } from '@bautakt/rechnen-kalender';
import { describe, expect, it } from 'vitest';
import {
  ARTEN,
  bezugFormatieren,
  netzplanBerechnen,
  vorgaengerFormatieren,
  vorgaengerParsen,
  type BeziehungEingabe,
  type Einheit,
  type NetzplanOptionen,
  type VorgangEingabe,
} from '../src/index.js';

/** Einfacher reproduzierbarer Zufallsgenerator (mulberry32). */
function zufall(saat: number) {
  return () => {
    saat |= 0;
    saat = (saat + 0x6d2b79f5) | 0;
    let t = Math.imul(saat ^ (saat >>> 15), 1 | saat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zufälliges azyklisches Netz: Beziehungen nur von kleinerem zu größerem Index. */
function zufallsnetz(saat: number, mitKt: boolean) {
  const r = zufall(saat);
  const n = 2 + Math.floor(r() * 25);
  const vorgaenge: VorgangEingabe[] = Array.from({ length: n }, (_, i) => {
    const meilenstein = r() < 0.1;
    return {
      id: `v${i}`,
      nr: String(i + 1),
      dauer: meilenstein ? 0 : 1 + Math.floor(r() * 20),
      ...(meilenstein ? { typ: 'meilenstein' as const } : {}),
      ...(r() < 0.1 ? { fruehestensAb: Math.floor(r() * 30) } : {}),
    };
  });
  const beziehungen: BeziehungEingabe[] = [];
  for (let j = 1; j < n; j++) {
    const anzahl = Math.floor(r() * 3);
    for (let x = 0; x < anzahl; x++) {
      const einheit: Einheit = mitKt && r() < 0.3 ? 'KT' : 'AT';
      beziehungen.push({
        von: `v${Math.floor(r() * j)}`,
        nach: `v${j}`,
        art: ARTEN[Math.floor(r() * 4)] ?? 'EA',
        abstand: Math.floor(r() * 21) - 5,
        einheit,
      });
    }
  }
  return { vorgaenge, beziehungen };
}

describe('Eigenschaften der Netzplanrechnung (Zufallsnetze)', () => {
  const kalender = new Arbeitskalender({
    start: '2026-12-14',
    ruhezeiten: [{ von: '2026-12-21', bis: '2027-01-01', name: 'Weihnachtspause' }],
  });

  it.each(Array.from({ length: 300 }, (_, i) => i + 1))('Netz %i', (saat) => {
    const { vorgaenge, beziehungen } = zufallsnetz(saat, saat % 2 === 0);
    const optionen: NetzplanOptionen = { kalender };
    if (saat % 3 === 0) Object.assign(optionen, { sollEnde: 40, rueckwaertsVon: 'soll_ende' });
    const e = netzplanBerechnen(vorgaenge, beziehungen, optionen);
    const v = (id: string) =>
      e.vorgaenge.get(id) as NonNullable<ReturnType<typeof e.vorgaenge.get>>;

    for (const x of e.vorgaenge.values()) {
      const d = vorgaenge.find((y) => y.id === x.id)?.dauer ?? 0;
      expect(x.fez).toBe(x.faz + d);
      expect(x.saz).toBe(x.sez - d);
      expect(x.faz).toBeGreaterThanOrEqual(0);
      expect(x.gp).toBe(x.sez - x.fez);
      expect(x.fp).toBeGreaterThanOrEqual(0);
      if (x.gp >= 0) expect(x.fp).toBeLessThanOrEqual(x.gp);
      expect(x.sez).toBeLessThanOrEqual(e.bezugsende);
    }
    // Alle Beziehungen sind in frühester und spätester Lage erfüllt
    for (const b of beziehungen) {
      const i = v(b.von);
      const j = v(b.nach);
      const f = (t: number) =>
        (b.einheit ?? 'AT') === 'KT' ? kalender.ktVersatz(t, b.abstand) : t + b.abstand;
      const [von, nach, vonS, nachS] =
        b.art === 'EA'
          ? [i.fez, j.faz, i.sez, j.saz]
          : b.art === 'AA'
            ? [i.faz, j.faz, i.saz, j.saz]
            : b.art === 'EE'
              ? [i.fez, j.fez, i.sez, j.sez]
              : [i.faz, j.fez, i.saz, j.sez];
      expect(nach).toBeGreaterThanOrEqual(f(von));
      expect(nachS).toBeGreaterThanOrEqual(f(vonS));
    }
    // Es gibt immer mindestens einen kritischen Vorgang; vom berechneten Ende ist min GP = 0
    expect(e.kritischerPfad.length).toBeGreaterThan(0);
    if (!optionen.rueckwaertsVon) expect(e.minGp).toBe(0);
  });
});

describe('Bedingungen und Sammelvorgänge', () => {
  it('„nicht früher als“ verschiebt FAZ, „muss enden am“ begrenzt SEZ', () => {
    const e = netzplanBerechnen(
      [
        { id: 'a', dauer: 5 },
        { id: 'm', dauer: 0, typ: 'meilenstein', fruehestensAb: 12 },
        { id: 'b', dauer: 3, spaetestensBis: 14 },
      ],
      [
        { von: 'a', nach: 'm', art: 'EA', abstand: 0 },
        { von: 'm', nach: 'b', art: 'EA', abstand: 0 },
      ],
    );
    expect(e.vorgaenge.get('m')).toMatchObject({ faz: 12, fez: 12 });
    expect(e.vorgaenge.get('b')).toMatchObject({
      faz: 12,
      fez: 15,
      sez: 14,
      gp: -1,
      kritisch: true,
    });
    expect(e.vorgaenge.get('a')).toMatchObject({ sez: 11, gp: 6, fp: 6 }); // Spielraum 7, begrenzt auf GP;
  });

  it('Sammelvorgang verdichtet seine Kinder (beliebige Tiefe), ohne eigene Beziehungen', () => {
    const vorgaenge: VorgangEingabe[] = [
      { id: 'S', typ: 'sammel', dauer: 0 },
      { id: 'T', typ: 'sammel', dauer: 0, parent: 'S' },
      { id: 'a', dauer: 4, parent: 'S' },
      { id: 'b', dauer: 6, parent: 'T' },
      { id: 'c', dauer: 2 },
    ];
    const e = netzplanBerechnen(vorgaenge, [
      { von: 'a', nach: 'b', art: 'EA', abstand: 1 },
      { von: 'a', nach: 'c', art: 'EA', abstand: 0 },
    ]);
    expect(e.vorgaenge.get('T')).toMatchObject({ faz: 5, fez: 11, fp: null, kritisch: true });
    expect(e.vorgaenge.get('S')).toMatchObject({
      faz: 0,
      fez: 11,
      saz: 0,
      sez: 11,
      gp: 0,
      fp: null,
    });
    expect(e.reihenfolge).toEqual(['a', 'b', 'c']);
    expect(() =>
      netzplanBerechnen(vorgaenge, [{ von: 'S', nach: 'c', art: 'EA', abstand: 0 }]),
    ).toThrow(/Sammelvorgänge können keine Anordnungsbeziehungen/);
  });

  it('weist ungültige Eingaben ab', () => {
    const a = { id: 'a', nr: '1', dauer: 2 };
    expect(() => netzplanBerechnen([a, a], [])).toThrow(/doppelt/);
    expect(() => netzplanBerechnen([{ ...a, dauer: 1.5 }], [])).toThrow(/ganze Zahl/);
    expect(() => netzplanBerechnen([{ ...a, dauer: -1 }], [])).toThrow(/negativ/);
    expect(() => netzplanBerechnen([{ ...a, typ: 'meilenstein' }], [])).toThrow(/Dauer 0/);
    expect(() => netzplanBerechnen([a], [{ von: 'a', nach: 'x', art: 'EA', abstand: 0 }])).toThrow(
      /existiert nicht/,
    );
    expect(() => netzplanBerechnen([a], [{ von: 'a', nach: 'a', art: 'EA', abstand: 0 }])).toThrow(
      /eigener Vorgänger/,
    );
    expect(() => netzplanBerechnen([a], [], { rueckwaertsVon: 'soll_ende' })).toThrow(
      /Soll-Ende fehlt/,
    );
  });

  it('leerer Plan', () => {
    const e = netzplanBerechnen([], []);
    expect(e.projektende).toBe(0);
    expect(e.kritischerPfad).toEqual([]);
  });
});

describe('Vorgänger-Spalte: Formatieren und Fehler', () => {
  it('Kurz- und Langform lassen sich wieder einlesen', () => {
    const eingaben = ['1EA+10; 3EA+15; 4EA+30KT', '2AA-2', 'A EE+2; B AE-1KT', '7', '1.2.3EE+0KT'];
    for (const text of eingaben) {
      const p = vorgaengerParsen(text);
      if (!p.ok) throw new Error(p.fehler.meldung);
      const ohnePos = (b: (typeof p.bezuege)[number]) => ({ ...b, position: 0 });
      for (const form of ['kurz', 'lang'] as const) {
        const wieder = vorgaengerParsen(vorgaengerFormatieren(p.bezuege, form));
        if (!wieder.ok) throw new Error(`${form}: ${wieder.fehler.meldung}`);
        expect(wieder.bezuege.map(ohnePos)).toEqual(p.bezuege.map(ohnePos));
      }
    }
  });

  it('Formate', () => {
    expect(bezugFormatieren({ nr: '3', art: 'EA', abstand: 15, einheit: 'AT' }, 'lang')).toBe(
      '3 Ende-Anfang +15 Arbeitstage',
    );
    expect(bezugFormatieren({ nr: '4', art: 'EA', abstand: 30, einheit: 'KT' })).toBe('4EA+30KT');
    expect(bezugFormatieren({ nr: 'B', art: 'EA', abstand: -1, einheit: 'AT' })).toBe('B EA-1');
    expect(bezugFormatieren({ nr: '3', art: 'EA', abstand: 0, einheit: 'AT' })).toBe('3EA');
  });

  it('akzeptiert Leerzeichen, Groß-/Kleinschreibung, typografisches Minus, leere Einträge', () => {
    const p = vorgaengerParsen('  1 ea + 10 at ;; 2 AA − 3 ;');
    expect(p.ok && p.bezuege.map((b) => [b.nr, b.art, b.abstand, b.einheit])).toEqual([
      ['1', 'EA', 10, 'AT'],
      ['2', 'AA', -3, 'AT'],
    ]);
    expect(vorgaengerParsen('')).toEqual({ ok: true, bezuege: [] });
  });

  it.each([
    ['1EA10', 4, /Vorzeichen/],
    ['1EA+', 5, /Zahl/],
    ['1EA+2,5', 6, /ganze Zahl/],
    ['1EA+2 Wochen', 7, /unbekannte Einheit/],
    ['1EA+2 x', 7, /unbekannte Einheit/],
    ['+3', 1, /Vorgangsnummer/],
    ['1EA+2 3', 7, /unerwartetes Zeichen/],
  ])('„%s“ → Fehler an Position %i', (text, position, meldung) => {
    const p = vorgaengerParsen(text);
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.fehler.position).toBe(position);
      expect(p.fehler.meldung).toMatch(meldung);
    }
  });
});
