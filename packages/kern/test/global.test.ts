import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GlobaleDaten, ProjektSitzung, type BautaktPlugin } from '../src/index.js';
import { OPTIONEN, tempOrdner, testPlugin } from './hilfen.js';

/** Plugin mit globaler Datei: Einträge versioniert anlegen, Dienst „glob.anzahl“. */
function globalPlugin(): BautaktPlugin {
  return testPlugin({
    id: 'glob',
    tabellenPraefix: 'g_',
    migrationen: [],
    aktivieren(ctx) {
      ctx.abfragen.registrieren({
        name: 'anzahl',
        schema: z.undefined(),
        ausfuehren: () => ctx.dienste.holen<() => number>('glob.anzahl')(),
      });
    },
    global: {
      datei: 'glob.sqlite',
      migrationen: [
        {
          version: 1,
          name: 'eintrag',
          sql: 'CREATE TABLE eintrag (id TEXT, version INTEGER, name TEXT, PRIMARY KEY (id, version))',
        },
      ],
      aktivieren(ctx) {
        ctx.abfragen.registrieren({
          name: 'liste',
          schema: z.undefined(),
          ausfuehren: (db) => db.lesen('SELECT * FROM eintrag ORDER BY id, version'),
        });
        ctx.aktionen.registrieren({
          name: 'anlegen',
          titel: 'Eintrag anlegen',
          schema: z.object({ id: z.string(), name: z.string().min(1, 'Name fehlt') }),
          ausfuehren(db, d) {
            const v =
              db.eins<{ v: number | null }>(
                'SELECT max(version) AS v FROM eintrag WHERE id = ?',
                d.id,
              )?.v ?? 0;
            db.einfuegen('eintrag', { id: d.id, version: v + 1, name: d.name });
            if (d.name === 'Fehler') throw new Error('absichtlich');
            return v + 1;
          },
        });
        ctx.dienste.bereitstellen(
          'glob.anzahl',
          () => ctx.db.eins<{ n: number }>('SELECT count(*) AS n FROM eintrag')?.n ?? 0,
        );
      },
    },
  });
}

describe('Globale Daten (E-23, E-51)', () => {
  it('legt die Datei an, migriert, führt Aktionen aus und benachrichtigt', () => {
    const ordner = path.join(tempOrdner(), 'Bautakt');
    const g = GlobaleDaten.oeffnen(ordner, [globalPlugin()]);
    const gemeldet: string[] = [];
    g.onGeaendert((p) => gemeldet.push(p));
    expect(g.aktion('glob', 'anlegen', { id: 'a', name: 'Alpha' })).toBe(1);
    expect(g.aktion('glob', 'anlegen', { id: 'a', name: 'Alpha 2' })).toBe(2);
    expect(gemeldet).toEqual(['glob', 'glob']);
    expect(g.abfrage('glob', 'liste', undefined)).toEqual([
      { id: 'a', version: 1, name: 'Alpha' },
      { id: 'a', version: 2, name: 'Alpha 2' },
    ]);
    // Fehler → Transaktion zurückgerollt
    expect(() => g.aktion('glob', 'anlegen', { id: 'b', name: 'Fehler' })).toThrow('absichtlich');
    expect(() => g.aktion('glob', 'anlegen', { id: 'b', name: '' })).toThrow(
      'Eintrag anlegen: Name fehlt',
    );
    expect((g.abfrage('glob', 'liste', undefined) as unknown[]).length).toBe(2);
    expect(() => g.aktion('glob', 'gibtsnicht', {})).toThrow(/Unbekannte Aktion/);
    g.schliessen();

    // erneut öffnen: Daten bleiben, keine doppelte Migration
    const g2 = GlobaleDaten.oeffnen(ordner, [globalPlugin()]);
    expect((g2.abfrage('glob', 'liste', undefined) as unknown[]).length).toBe(2);
    g2.schliessen();
  });

  it('Projekt-Plugins erreichen globale Dienste über dienste.holen', () => {
    const o = tempOrdner();
    const g = GlobaleDaten.oeffnen(path.join(o, 'global'), [globalPlugin()]);
    g.aktion('glob', 'anlegen', { id: 'x', name: 'X' });
    const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
      ...OPTIONEN,
      plugins: [globalPlugin()],
      globaleDienste: g,
    });
    expect(s.abfrage('glob', 'anzahl', undefined)).toBe(1);
    s.schliessen();
    g.schliessen();
  });
});
