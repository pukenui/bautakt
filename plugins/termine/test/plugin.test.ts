import { ProjektSitzung } from '@bautakt/kern';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { terminePlugin, type PlanZeile } from '../main/index.js';

const ordner: string[] = [];
afterEach(() => ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true })));

function sitzung() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-termine-'));
  ordner.push(o);
  return ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'P', {
    appVersion: 'test',
    autosaveMs: 0,
    plugins: [terminePlugin],
  });
}

describe('Plugin termine (Gerüst)', () => {
  it('legt Pläne an, benennt um, löscht – alles rückgängig machbar', () => {
    const s = sitzung();
    const plaene = () => s.abfrage('termine', 'plaene', undefined) as PlanZeile[];
    s.befehl({
      plugin: 'termine',
      name: 'plan.anlegen',
      daten: { name: 'Rollen-Netzplan', art: 'rollen' },
    });
    s.befehl({
      plugin: 'termine',
      name: 'plan.anlegen',
      daten: { name: '  Terminplan Gesamtprojekt ' },
    });
    const [rollen, gesamt] = plaene();
    if (!rollen || !gesamt) throw new Error('zwei Pläne erwartet');
    expect(rollen).toMatchObject({
      name: 'Rollen-Netzplan',
      art: 'rollen',
      rueckwaerts_von: 'berechnet',
    });
    expect(gesamt).toMatchObject({ name: 'Terminplan Gesamtprojekt', art: 'bauablauf' });

    s.befehl({
      plugin: 'termine',
      name: 'plan.umbenennen',
      daten: { id: gesamt.id, name: 'F.2 Terminplan' },
    });
    s.befehl({ plugin: 'termine', name: 'plan.loeschen', daten: { id: rollen.id } });
    expect(plaene().map((p) => p.name)).toEqual(['F.2 Terminplan']);

    s.rueckgaengig();
    s.rueckgaengig();
    expect(plaene().map((p) => p.name)).toEqual(['Rollen-Netzplan', 'Terminplan Gesamtprojekt']);
    s.schliessen();
  });

  it('verlangt einen Namen', () => {
    const s = sitzung();
    expect(() =>
      s.befehl({ plugin: 'termine', name: 'plan.anlegen', daten: { name: '   ' } }),
    ).toThrow(/Name darf nicht leer sein/);
    s.schliessen();
  });
});
