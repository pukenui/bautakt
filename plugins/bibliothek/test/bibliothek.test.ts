import { GlobaleDaten } from '@bautakt/kern';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AufwandswertZeile } from '../gemeinsam/typen.js';
import { bibliothekPlugin } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

function oeffnen(o?: string) {
  const pfad = o ?? fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-bib-'));
  if (!o) ordner.push(pfad);
  const g = GlobaleDaten.oeffnen(pfad, [bibliothekPlugin]);
  const aktion = (name: string, daten: unknown) =>
    g.aktion('bibliothek', name, daten) as { id: string; version: number };
  const liste = (mitAusgeblendeten = false) =>
    g.abfrage('bibliothek', 'aufwandswerte', { mitAusgeblendeten }) as AufwandswertZeile[];
  return { g, pfad, aktion, liste };
}

const schalung = {
  bezeichnung: 'Schalung Ortbetonwände',
  gewerk: 'Rohbau',
  einheit: 'm²',
  h_je_me: 0.5,
  quelle: 'UE 05, Folie 21',
  stand: '2024',
};

describe('Bibliothek: Aufwandswerte versioniert (E-23, E-51)', () => {
  it('Anlegen, Ändern = neue Version, alte Version bleibt lesbar', () => {
    const b = oeffnen();
    const { id, version } = b.aktion('aufwandswert.anlegen', schalung);
    expect(version).toBe(1);
    expect(b.aktion('aufwandswert.aendern', { id, ...schalung, h_je_me: 0.55 }).version).toBe(2);
    // ohne Änderung keine neue Version
    expect(b.aktion('aufwandswert.aendern', { id, ...schalung, h_je_me: 0.55 }).version).toBe(2);
    expect(b.liste()).toMatchObject([{ id, version: 2, h_je_me: 0.55 }]);
    expect(b.g.abfrage('bibliothek', 'aufwandswert', { id, version: 1 })).toMatchObject({
      h_je_me: 0.5,
    });
    expect(
      (b.g.abfrage('bibliothek', 'versionen', { id }) as AufwandswertZeile[]).map((v) => v.version),
    ).toEqual([2, 1]);
    // Dienste für Projekt-Plugins
    const aufwandswert =
      b.g.dienst<(id: string, v?: number) => AufwandswertZeile | undefined>(
        'bibliothek.aufwandswert',
      );
    expect(aufwandswert?.(id)?.version).toBe(2);
    expect(aufwandswert?.(id, 1)?.h_je_me).toBe(0.5);
    expect(b.g.dienst<(id: string) => number | null>('bibliothek.aktuelleVersion')?.(id)).toBe(2);
    expect(b.g.dienst<(id: string) => number | null>('bibliothek.aktuelleVersion')?.('x')).toBe(
      null,
    );
    b.g.schliessen();
  });

  it('Löschen blendet aus (als Version), Wiederherstellen blendet ein', () => {
    const b = oeffnen();
    const { id } = b.aktion('aufwandswert.anlegen', schalung);
    expect(b.aktion('aufwandswert.ausblenden', { id }).version).toBe(2);
    expect(b.liste()).toEqual([]);
    expect(b.liste(true)).toMatchObject([{ id, ausgeblendet: 1 }]);
    expect(b.aktion('aufwandswert.einblenden', { id }).version).toBe(3);
    expect(b.liste()).toMatchObject([{ id, version: 3, ausgeblendet: 0, h_je_me: 0.5 }]);
    b.g.schliessen();
  });

  it('Pflichtfelder und Prüfungen', () => {
    const b = oeffnen();
    expect(() => b.aktion('aufwandswert.anlegen', { ...schalung, quelle: ' ' })).toThrow(
      /Quelle ist Pflicht/,
    );
    expect(() => b.aktion('aufwandswert.anlegen', { ...schalung, h_je_me: 0 })).toThrow(
      /größer als 0/,
    );
    expect(() => b.aktion('aufwandswert.anlegen', { ...schalung, einheit: '' })).toThrow(
      /Mengeneinheit/,
    );
    expect(() => b.aktion('aufwandswert.aendern', { id: 'gibtsnicht', ...schalung })).toThrow(
      /existiert nicht/,
    );
    b.g.schliessen();
  });

  it('Datei bleibt erhalten und wird beim nächsten Start wieder geöffnet', () => {
    const b = oeffnen();
    b.aktion('aufwandswert.anlegen', schalung);
    b.g.schliessen();
    expect(fs.existsSync(path.join(b.pfad, 'bibliothek.sqlite'))).toBe(true);
    const b2 = oeffnen(b.pfad);
    expect(b2.liste()).toHaveLength(1);
    b2.g.schliessen();
  });
});

describe('Bibliothek: Kostenkennwerte (E-58)', () => {
  const kkw = {
    bezeichnung: 'Hallen, Fertigteilbau',
    kg: 300,
    einheit: 'm² BGF',
    von: 1800,
    mittel: 2400,
    bis: 3100,
    quelle: 'eigene Auswertung (fiktiv)',
    stand: '2024, Q1',
    index_stand: 120,
  };
  it('versioniert wie Aufwandswerte, mit Prüfungen', () => {
    const b = oeffnen();
    const { id } = b.aktion('kennwert.anlegen', kkw);
    expect(b.aktion('kennwert.aendern', { id, ...kkw, mittel: 2500 }).version).toBe(2);
    const liste = b.g.abfrage('bibliothek', 'kennwerte', {}) as {
      mittel: number;
      gebaeudeart: string;
    }[];
    expect(liste).toMatchObject([{ mittel: 2500, gebaeudeart: '' }]);
    expect(
      b.g.dienst<(id: string) => number | null>('bibliothek.kennwertAktuelleVersion')?.(id),
    ).toBe(2);
    expect(b.aktion('kennwert.ausblenden', { id }).version).toBe(3);
    expect(() => b.aktion('kennwert.anlegen', { ...kkw, kg: 999 })).toThrow(/Katalog/);
    expect(() => b.aktion('kennwert.anlegen', { ...kkw, von: 2500 })).toThrow(/Von darf nicht/);
    expect(() => b.aktion('kennwert.anlegen', { ...kkw, quelle: '' })).toThrow(/Quelle/);
    // Aufwandswerte und Kennwerte bleiben getrennt
    expect(b.liste()).toEqual([]);
    b.g.schliessen();
  });
});
