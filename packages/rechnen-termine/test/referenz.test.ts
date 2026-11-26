/**
 * Referenzbeispiele aus docs/referenzbeispiele.md (verbindliche Sollwerte).
 * Die Vorgänger werden wie in der App über den Parser der Vorgänger-Spalte eingegeben.
 */
import { Arbeitskalender } from '@bautakt/rechnen-kalender';
import { describe, expect, it } from 'vitest';
import {
  bezuegeAufloesen,
  netzplanBerechnen,
  NetzplanFehler,
  vorgaengerParsen,
  zyklusDurchNeueBeziehung,
  alsNummern,
  zyklusText,
  type BeziehungEingabe,
  type NetzplanOptionen,
  type VorgangEingabe,
} from '../src/index.js';

interface Zeile {
  nr: string;
  dauer: number;
  vorgaenger?: string;
  typ?: VorgangEingabe['typ'];
}

/** Baut Vorgänge und Beziehungen aus einer Tabelle wie in den Referenzbeispielen. */
function plan(zeilen: Zeile[]): { vorgaenge: VorgangEingabe[]; beziehungen: BeziehungEingabe[] } {
  const vorgaenge = zeilen.map((z) => ({
    id: `v${z.nr}`,
    nr: z.nr,
    dauer: z.dauer,
    ...(z.typ ? { typ: z.typ } : {}),
  }));
  const liste = vorgaenge.map((v) => ({ id: v.id, nr: v.nr }));
  const beziehungen: BeziehungEingabe[] = [];
  for (const z of zeilen) {
    if (!z.vorgaenger) continue;
    const p = vorgaengerParsen(z.vorgaenger);
    if (!p.ok) throw new Error(`${z.vorgaenger}: ${p.fehler.meldung}`);
    const a = bezuegeAufloesen(p.bezuege, liste, `v${z.nr}`);
    if (!a.ok) throw new Error(a.fehler.meldung);
    beziehungen.push(...a.beziehungen);
  }
  return { vorgaenge, beziehungen };
}

type Soll = Partial<Record<'faz' | 'fez' | 'saz' | 'sez' | 'gp' | 'fp', number>> & {
  kritisch?: boolean;
};

function pruefe(zeilen: Zeile[], soll: Record<string, Soll>, optionen: NetzplanOptionen = {}) {
  const { vorgaenge, beziehungen } = plan(zeilen);
  const e = netzplanBerechnen(vorgaenge, beziehungen, optionen);
  for (const [nr, werte] of Object.entries(soll)) {
    const ist = e.vorgaenge.get(`v${nr}`);
    expect(ist, `Vorgang ${nr}`).toBeDefined();
    const auswahl = Object.fromEntries(Object.keys(werte).map((s) => [s, ist?.[s as keyof Soll]]));
    expect(auswahl, `Vorgang ${nr}`).toEqual(werte);
  }
  // Prüfregeln für alle Vorgänge
  for (const v of e.vorgaenge.values()) {
    expect(v.fez - v.faz).toBe(v.sez - v.saz);
    expect(v.gp).toBe(v.sez - v.fez);
    if (v.gp >= 0 && v.fp !== null) expect(v.fp).toBeLessThanOrEqual(v.gp);
  }
  return e;
}

const nr = (ids: string[]) => ids.map((id) => id.slice(1));

// ---------------------------------------------------------------------------------------------
const R01: Zeile[] = [
  { nr: '1', dauer: 70 },
  { nr: '2', dauer: 20, vorgaenger: '1EA+10' },
  { nr: '3', dauer: 20, vorgaenger: '1EA+15' },
  { nr: '4', dauer: 35, vorgaenger: '2EA; 3EA' },
  { nr: '5', dauer: 80, vorgaenger: '3EA' },
  { nr: '6', dauer: 50, vorgaenger: '4EA+30; 5EA' },
];

const R01_SOLL: Record<string, Soll> = {
  '1': { faz: 0, fez: 70, saz: 0, sez: 70, gp: 0, fp: 0, kritisch: true },
  '2': { faz: 80, fez: 100, saz: 100, sez: 120, gp: 20, fp: 5, kritisch: false },
  '3': { faz: 85, fez: 105, saz: 85, sez: 105, gp: 0, fp: 0, kritisch: true },
  '4': { faz: 105, fez: 140, saz: 120, sez: 155, gp: 15, fp: 15, kritisch: false },
  '5': { faz: 105, fez: 185, saz: 105, sez: 185, gp: 0, fp: 0, kritisch: true },
  '6': { faz: 185, fez: 235, saz: 185, sez: 235, gp: 0, fp: 0, kritisch: true },
};

describe('R-01 Fertigteilhalle – Netzplan EA', () => {
  it('Sollwerte, Projektdauer 235 AT, kritischer Pfad 1 → 3 → 5 → 6', () => {
    const e = pruefe(R01, R01_SOLL);
    expect(e.projektende).toBe(235);
    expect(nr(e.kritischerPfad)).toEqual(['1', '3', '5', '6']);
  });

  it('mit Start-Meilenstein „Beauftragung“ und Ende-Meilenstein „Abnahme“', () => {
    const zeilen: Zeile[] = [
      { nr: 'S', dauer: 0, typ: 'meilenstein' },
      ...R01.map((z) => (z.nr === '1' ? { ...z, vorgaenger: 'S' } : z)),
      { nr: 'E', dauer: 0, typ: 'meilenstein', vorgaenger: '6' },
    ];
    const e = pruefe(zeilen, {
      ...R01_SOLL,
      S: { faz: 0, fez: 0, saz: 0, sez: 0, gp: 0, fp: 0, kritisch: true },
      E: { faz: 235, fez: 235, saz: 235, sez: 235, gp: 0, fp: 0, kritisch: true },
    });
    expect(nr(e.kritischerPfad)).toEqual(['S', '1', '3', '5', '6', 'E']);
    // kritische Pfeile: genau die Kette S→1→3→5→6→E
    const { beziehungen } = plan(zeilen);
    const kritischePfeile = e.beziehungen
      .filter((b) => b.kritisch)
      .map((b) => {
        const x = beziehungen[b.index] as BeziehungEingabe;
        return `${x.von.slice(1)}→${x.nach.slice(1)}`;
      });
    expect(kritischePfeile.sort()).toEqual(['1→3', '3→5', '5→6', '6→E', 'S→1'].sort());
  });
});

describe('R-02 Fertigteilhalle mit Soll-Ende 220 AT (negative Puffer)', () => {
  it('Rückwärtsrechnung vom Soll-Ende', () => {
    const e = pruefe(
      R01,
      {
        '1': { faz: 0, fez: 70, saz: -15, sez: 55, gp: -15, fp: 0, kritisch: true },
        '2': { faz: 80, fez: 100, saz: 85, sez: 105, gp: 5, fp: 5, kritisch: false },
        '3': { faz: 85, fez: 105, saz: 70, sez: 90, gp: -15, fp: 0, kritisch: true },
        '4': { faz: 105, fez: 140, saz: 105, sez: 140, gp: 0, fp: 0, kritisch: false },
        '5': { faz: 105, fez: 185, saz: 90, sez: 170, gp: -15, fp: 0, kritisch: true },
        '6': { faz: 185, fez: 235, saz: 170, sez: 220, gp: -15, fp: 0, kritisch: true },
      },
      { sollEnde: 220, rueckwaertsVon: 'soll_ende' },
    );
    expect(e.projektende).toBe(235);
    expect(e.bezugsende).toBe(220);
    expect(e.abweichungSollEnde).toBe(15); // Überschreitung 15 AT
    expect(e.minGp).toBe(-15);
    expect(nr(e.kritischerPfad)).toEqual(['1', '3', '5', '6']);
  });

  it('Standard (vom berechneten Ende) meldet nur die Abweichung zum Soll-Ende', () => {
    const e = pruefe(R01, R01_SOLL, { sollEnde: 220 });
    expect(e.abweichungSollEnde).toBe(15);
    expect(e.bezugsende).toBe(235);
  });
});

describe('R-03 Anfang-Anfang mit Abstand', () => {
  it('Baugrube 6 AT, Sauberkeitsschicht 1AA+4', () => {
    const e = pruefe(
      [
        { nr: '1', dauer: 6 },
        { nr: '2', dauer: 1, vorgaenger: '1AA+4' },
      ],
      {
        '1': { faz: 0, fez: 6, saz: 0, sez: 6, gp: 0, fp: 0 },
        '2': { faz: 4, fez: 5, saz: 5, sez: 6, gp: 1, fp: 1 },
      },
    );
    expect(e.projektende).toBe(6);
  });
});

describe('R-04 Alle Beziehungsarten und negativer Abstand', () => {
  it('EE, AE, EA mit −1', () => {
    const e = pruefe(
      [
        { nr: 'A', dauer: 5 },
        { nr: 'B', dauer: 3, vorgaenger: 'A EE+2' },
        { nr: 'C', dauer: 4, vorgaenger: 'A AE+6' },
        { nr: 'D', dauer: 2, vorgaenger: 'B EA-1' },
      ],
      {
        A: { faz: 0, fez: 5, saz: 0, sez: 5, gp: 0, fp: 0, kritisch: true },
        B: { faz: 4, fez: 7, saz: 4, sez: 7, gp: 0, fp: 0, kritisch: true },
        C: { faz: 2, fez: 6, saz: 4, sez: 8, gp: 2, fp: 2, kritisch: false },
        D: { faz: 6, fez: 8, saz: 6, sez: 8, gp: 0, fp: 0, kritisch: true },
      },
    );
    expect(e.projektende).toBe(8);
  });
});

describe('R-05 Zirkelbezug', () => {
  const vorgaenge: VorgangEingabe[] = ['1', '2', '3'].map((n) => ({
    id: `v${n}`,
    nr: n,
    dauer: 1,
  }));
  const vorhanden: BeziehungEingabe[] = [
    { von: 'v1', nach: 'v2', art: 'EA', abstand: 0 },
    { von: 'v2', nach: 'v3', art: 'EA', abstand: 0 },
  ];
  const neu: BeziehungEingabe = { von: 'v3', nach: 'v1', art: 'EA', abstand: 0 };

  it('die letzte Beziehung wird abgelehnt, Meldung nennt 1 → 2 → 3 → 1', () => {
    const zyklus = zyklusDurchNeueBeziehung(vorhanden, neu);
    expect(zyklus).not.toBeNull();
    expect(zyklusText(alsNummern(zyklus ?? [], vorgaenge))).toBe('Zirkelbezug: 1 → 2 → 3 → 1');
    expect(zyklusDurchNeueBeziehung(vorhanden, { von: 'v1', nach: 'v3' })).toBeNull();
  });

  it('die Rechnung bricht bei einem Zyklus mit Pfad ab', () => {
    try {
      netzplanBerechnen(vorgaenge, [...vorhanden, neu]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(NetzplanFehler);
      expect((e as NetzplanFehler).code).toBe('ZYKLUS');
      expect((e as NetzplanFehler).zyklus).toEqual(['1', '2', '3', '1']);
      expect((e as NetzplanFehler).message).toBe('Zirkelbezug: 1 → 2 → 3 → 1');
    }
  });
});

describe('R-06 Syntax der Vorgänger-Spalte', () => {
  it.each([
    ['3', [{ nr: '3', art: 'EA', abstand: 0, einheit: 'AT' }]],
    ['1EA+10', [{ nr: '1', art: 'EA', abstand: 10, einheit: 'AT' }]],
    ['4ea+30kt', [{ nr: '4', art: 'EA', abstand: 30, einheit: 'KT' }]],
    ['2AA-2', [{ nr: '2', art: 'AA', abstand: -2, einheit: 'AT' }]],
    ['3 Ende-Anfang +15 Tage', [{ nr: '3', art: 'EA', abstand: 15, einheit: 'AT' }]],
    ['5 Anfang-Anfang +3 Kalendertage', [{ nr: '5', art: 'AA', abstand: 3, einheit: 'KT' }]],
    [
      '1EA+10; 3EA+15',
      [
        { nr: '1', art: 'EA', abstand: 10, einheit: 'AT' },
        { nr: '3', art: 'EA', abstand: 15, einheit: 'AT' },
      ],
    ],
  ])('„%s“', (eingabe, erwartet) => {
    const p = vorgaengerParsen(eingabe);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.bezuege.map(({ position: _p, ...b }) => b)).toEqual(erwartet);
  });

  it('„1XY+3“ → Fehler an Position 2: unbekannte Beziehungsart', () => {
    const p = vorgaengerParsen('1XY+3');
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.fehler.position).toBe(2);
      expect(p.fehler.meldung).toMatch(/^unbekannte Beziehungsart/);
    }
  });

  it('„99“ (gibt es nicht) → Vorgang 99 existiert nicht', () => {
    const p = vorgaengerParsen('99');
    if (!p.ok) throw new Error('Parsen sollte gelingen');
    const a = bezuegeAufloesen(p.bezuege, [{ id: 'v1', nr: '1' }], 'v2');
    expect(a).toEqual({
      ok: false,
      fehler: { position: 1, meldung: 'Vorgang 99 existiert nicht' },
    });
  });
});

describe('R-08 Kalendertage-Abstand im Netzplan', () => {
  const kalender = new Arbeitskalender({
    start: '2026-12-14',
    ruhezeiten: [{ von: '2026-12-21', bis: '2027-01-01', name: 'Weihnachtspause' }],
  });

  it('A EA+21KT → FAZ_B = 25, Anfang Mo 01.02.2027', () => {
    const e = pruefe(
      [
        { nr: 'A', dauer: 10 },
        { nr: 'B', dauer: 5, vorgaenger: 'A EA+21KT' },
      ],
      { A: { faz: 0, fez: 10, gp: 0 }, B: { faz: 25, fez: 30, gp: 0 } },
      { kalender },
    );
    expect(kalender.anfangDatum(e.vorgaenge.get('vB')?.faz ?? NaN)).toBe('2027-02-01');
    expect(e.vorgaenge.get('vA')).toMatchObject({ sez: 10, kritisch: true });
  });

  it('Gegenprobe A EA+21 (AT) → FAZ_B = 31, Anfang Di 09.02.2027', () => {
    const e = pruefe(
      [
        { nr: 'A', dauer: 10 },
        { nr: 'B', dauer: 5, vorgaenger: 'A EA+21' },
      ],
      { B: { faz: 31 } },
    );
    expect(kalender.anfangDatum(e.vorgaenge.get('vB')?.faz ?? NaN)).toBe('2027-02-09');
  });

  it('KT ohne Kalender → Fehler', () => {
    expect(() =>
      pruefe(
        [
          { nr: 'A', dauer: 1 },
          { nr: 'B', dauer: 1, vorgaenger: 'A EA+3KT' },
        ],
        {},
      ),
    ).toThrow(/Kalender/);
  });
});

describe('R-12 Fertigteilhalle mit Ist-Stand zum Stichtag (Prognose)', () => {
  const istStand: Record<string, VorgangEingabe['ist']> = {
    '1': { anfang: 0, ende: 75 },
    '2': { anfang: 85, rest: 10 }, // 50 % von 20 AT → Rest 10 (Umrechnung im Plugin)
    '3': { anfang: 90, rest: 12 },
  };
  const rechnen = () => {
    const { vorgaenge, beziehungen } = plan(R01);
    const mitIst = vorgaenge.map((v) => ({ ...v, ist: istStand[v.nr ?? ''] ?? null }));
    return netzplanBerechnen(mitIst, beziehungen, { stichtag: 100 });
  };

  it('Sollwerte der Prognose, Projektende 242 AT', () => {
    const e = rechnen();
    const soll: Record<string, Soll & { status: string }> = {
      '1': { faz: 0, fez: 75, saz: 0, sez: 75, gp: 0, fp: 0, kritisch: false, status: 'fertig' },
      '2': {
        faz: 85,
        fez: 110,
        saz: 102,
        sez: 127,
        gp: 17,
        fp: 2,
        kritisch: false,
        status: 'begonnen',
      },
      '3': {
        faz: 90,
        fez: 112,
        saz: 90,
        sez: 112,
        gp: 0,
        fp: 0,
        kritisch: true,
        status: 'begonnen',
      },
      '4': {
        faz: 112,
        fez: 147,
        saz: 127,
        sez: 162,
        gp: 15,
        fp: 15,
        kritisch: false,
        status: 'geplant',
      },
      '5': {
        faz: 112,
        fez: 192,
        saz: 112,
        sez: 192,
        gp: 0,
        fp: 0,
        kritisch: true,
        status: 'geplant',
      },
      '6': {
        faz: 192,
        fez: 242,
        saz: 192,
        sez: 242,
        gp: 0,
        fp: 0,
        kritisch: true,
        status: 'geplant',
      },
    };
    for (const [n, werte] of Object.entries(soll)) {
      expect(e.vorgaenge.get(`v${n}`), `Vorgang ${n}`).toMatchObject(werte);
    }
    expect(e.projektende).toBe(242);
    expect(nr(e.kritischerPfad)).toEqual(['3', '5', '6']);
  });

  it('ohne Ist-Stand, aber mit Stichtag beginnen offene Vorgänge frühestens am Stichtag', () => {
    const { vorgaenge, beziehungen } = plan(R01);
    const e = netzplanBerechnen(vorgaenge, beziehungen, { stichtag: 100 });
    expect(e.vorgaenge.get('v1')).toMatchObject({ faz: 100, fez: 170, status: 'geplant' });
    expect(e.projektende).toBe(335);
  });

  it('prüft den Ist-Stand', () => {
    const { vorgaenge, beziehungen } = plan(R01);
    const mit = (ist: VorgangEingabe['ist']) =>
      netzplanBerechnen(
        vorgaenge.map((v) => (v.nr === '1' ? { ...v, ist } : v)),
        beziehungen,
        { stichtag: 100 },
      );
    expect(() => mit({ anfang: 10, ende: 5 })).toThrow(/vor dem Ist-Anfang/);
    expect(() => mit({ anfang: 10 })).toThrow(/Restdauer/);
    expect(() => mit({ anfang: 10, rest: -1 })).toThrow(/negativ/);
  });

  it('Sammelvorgang: Status aus den Kindern', () => {
    const e = netzplanBerechnen(
      [
        { id: 'S', typ: 'sammel', dauer: 0 },
        { id: 'a', dauer: 2, parent: 'S', ist: { anfang: 0, ende: 2 } },
        { id: 'b', dauer: 2, parent: 'S' },
      ],
      [],
      { stichtag: 2 },
    );
    expect(e.vorgaenge.get('S')?.status).toBe('begonnen');
    expect(e.vorgaenge.get('b')).toMatchObject({ faz: 2, status: 'geplant' });
  });
});
