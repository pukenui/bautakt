import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjektSitzung, type KernEreignisse } from '../src/index.js';
import { OPTIONEN, tempOrdner, testPlugin } from './hilfen.js';

function sitzung() {
  return ProjektSitzung.neu(path.join(tempOrdner(), 'p.bautakt'), 'P', {
    ...OPTIONEN,
    plugins: [testPlugin()],
  });
}

type Ding = { id: string; name: string; menge: number | null; art: string };
const dinge = (s: ProjektSitzung) => s.abfrage('test', 'dinge', undefined) as Ding[];

function protokoll(s: ProjektSitzung) {
  return JSON.parse(s.alsJson()).tabellen.aenderungsprotokoll as Record<string, string | null>[];
}

describe('Befehle, Undo/Redo (E-22)', () => {
  it('führt Einfügen/Ändern/Löschen aus und macht alles rückgängig und wieder', () => {
    const s = sitzung();
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'a', name: 'Alpha', menge: 1 } });
    s.befehl({
      plugin: 'test',
      name: 'ding.aendern',
      daten: { id: 'a', name: 'Alpha 2', menge: 2.5 },
    });
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'b', name: 'Beta' } });
    s.befehl({ plugin: 'test', name: 'ding.loeschen', daten: { id: 'a' } });
    expect(dinge(s).map((d) => d.name)).toEqual(['Beta']);
    expect(s.status().undo.rueckgaengig).toBe('Ding löschen');

    expect(s.rueckgaengig()).toBe(true); // Löschen zurück
    expect(dinge(s)).toEqual([
      { id: 'a', name: 'Alpha 2', menge: 2.5, art: 'a' },
      { id: 'b', name: 'Beta', menge: null, art: 'a' },
    ]);
    s.rueckgaengig(); // Beta weg
    s.rueckgaengig(); // Änderung zurück
    expect(dinge(s)).toEqual([{ id: 'a', name: 'Alpha', menge: 1, art: 'a' }]);
    s.rueckgaengig();
    expect(dinge(s)).toEqual([]);
    expect(s.rueckgaengig()).toBe(false);
    expect(s.status().undo).toEqual({ rueckgaengig: null, wiederholen: 'Ding anlegen' });

    while (s.wiederholen());
    expect(dinge(s).map((d) => d.name)).toEqual(['Beta']);
    s.rueckgaengig();
    expect(dinge(s).map((d) => d.name)).toEqual(['Alpha 2', 'Beta']);
    s.schliessen();
  });

  it('verwirft den Redo-Stapel bei einem neuen Befehl', () => {
    const s = sitzung();
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'a', name: 'A' } });
    s.rueckgaengig();
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'b', name: 'B' } });
    expect(s.wiederholen()).toBe(false);
    s.schliessen();
  });

  it('Undo ist unbegrenzt', () => {
    const s = sitzung();
    for (let i = 0; i < 500; i++) {
      s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { name: `D${i}` } });
    }
    let n = 0;
    while (s.rueckgaengig()) n++;
    expect(n).toBe(500);
    expect(dinge(s)).toEqual([]);
    s.schliessen();
  });

  it('legt Befehle ohne Wirkung nicht auf den Undo-Stapel', () => {
    const s = sitzung();
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'a', name: 'A' } });
    s.befehl({ plugin: 'test', name: 'ding.aendern', daten: { id: 'a', name: 'A' } });
    expect(s.status().undo.rueckgaengig).toBe('Ding anlegen');
    s.schliessen();
  });

  it('rollt einen fehlschlagenden Befehl vollständig zurück', () => {
    const s = sitzung();
    expect(() => s.befehl({ plugin: 'test', name: 'zwei.dann.fehler', daten: {} })).toThrow(
      'absichtlich',
    );
    expect(dinge(s)).toEqual([]);
    expect(protokoll(s)).toEqual([]);
    expect(s.status().undo.rueckgaengig).toBeNull();
    s.schliessen();
  });

  it('prüft Befehlsdaten, Befehlsnamen und Tabellenrechte', () => {
    const s = sitzung();
    expect(() => s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { name: '' } })).toThrow(
      /Ungültige Daten/,
    );
    expect(() => s.befehl({ plugin: 'test', name: 'gibtsnicht', daten: {} })).toThrow(
      /Unbekannter Befehl/,
    );
    expect(() => s.befehl({ plugin: 'andere', name: 'ding.anlegen', daten: {} })).toThrow(
      /Unbekannter/,
    );
    expect(() => s.befehl({ plugin: 'test', name: 'fremd.schreiben', daten: {} })).toThrow(
      /Kein Schreibzugriff/,
    );
    expect(() =>
      s.befehl({ plugin: 'test', name: 'ding.aendern', daten: { id: 'x', name: 'n' } }),
    ).toThrow(/nicht gefunden/);
    s.schliessen();
  });

  it('erlaubt über den Lesezugriff keine schreibenden Abfragen', () => {
    let fehler: unknown;
    const s = ProjektSitzung.neu(path.join(tempOrdner(), 'p.bautakt'), 'P', {
      ...OPTIONEN,
      plugins: [
        testPlugin({
          aktivieren(ctx) {
            try {
              ctx.db.lesen("DELETE FROM meta WHERE schluessel = 'projektname'");
            } catch (e) {
              fehler = e;
            }
          },
        }),
      ],
    });
    expect(String(fehler)).toMatch(/Nur lesende Abfragen/);
    expect(s.status().projektname).toBe('P');
    s.schliessen();
  });

  it('meldet jede Ausführung, Rückgängig und Wiederholung als Ereignis', () => {
    const s = sitzung();
    const ereignisse: KernEreignisse['befehl.ausgefuehrt'][] = [];
    s.ereignisse.on('befehl.ausgefuehrt', (e) => ereignisse.push(e));
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'a', name: 'A' } });
    s.rueckgaengig();
    s.wiederholen();
    expect(ereignisse.map((e) => e.aktion)).toEqual(['ausfuehren', 'rueckgaengig', 'wiederholen']);
    expect(ereignisse[1]?.aenderungen[0]?.art).toBe('loeschen');
    s.schliessen();
  });
});

describe('Änderungsprotokoll (E-22)', () => {
  it('schreibt wann, was, alt → neu und Grund dauerhaft in die Datei', () => {
    const pfad = path.join(tempOrdner(), 'p.bautakt');
    const s = ProjektSitzung.neu(pfad, 'P', { ...OPTIONEN, plugins: [testPlugin()] });
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'a', name: 'Alpha', menge: 1 } });
    s.befehl({
      plugin: 'test',
      name: 'ding.aendern',
      daten: { id: 'a', name: 'Alpha 2', menge: 1 },
      grund: 'Planänderung',
    });
    s.rueckgaengig();
    s.schliessen();

    const s2 = ProjektSitzung.oeffnen(pfad, { ...OPTIONEN, plugins: [testPlugin()] });
    const p = protokoll(s2);
    expect(p).toHaveLength(3);
    const [anlegen, aendern, zurueck] = p;
    expect(anlegen).toMatchObject({
      befehl: 'test:ding.anlegen',
      aktion: 'ausfuehren',
      plugin: 'test',
      entitaet: 'x_ding',
      entitaet_id: 'a',
      feld: null,
      alt: null,
    });
    expect(JSON.parse(anlegen?.['neu'] ?? '')).toEqual({
      id: 'a',
      name: 'Alpha',
      menge: 1,
      art: 'a',
    });
    expect(anlegen?.['zeit']).toMatch(/Z$/);
    // nur das tatsächlich geänderte Feld
    expect(aendern).toMatchObject({
      feld: 'name',
      alt: 'Alpha',
      neu: 'Alpha 2',
      grund: 'Planänderung',
    });
    expect(zurueck).toMatchObject({
      aktion: 'rueckgaengig',
      feld: 'name',
      alt: 'Alpha 2',
      neu: 'Alpha',
    });
    expect(zurueck?.['befehl_id']).toBe(aendern?.['befehl_id']);
    s2.schliessen();
  });
});
