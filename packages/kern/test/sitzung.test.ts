import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ProjektSitzung,
  pluginsOrdnen,
  sicherungsPfad,
  sperrPfad,
  type BautaktPlugin,
} from '../src/index.js';
import { OPTIONEN, tempOrdner, testPlugin } from './hilfen.js';

const plugin = (id: string, praefix: string, abhaengigkeiten?: string[]): BautaktPlugin => ({
  id,
  name: id,
  version: '1',
  tabellenPraefix: praefix,
  migrationen: [],
  aktivieren: () => {},
  ...(abhaengigkeiten ? { abhaengigkeiten } : {}),
});

describe('Plugin-Lader (E-35)', () => {
  it('ordnet Abhängigkeiten vor die abhängigen Plugins', () => {
    const r = pluginsOrdnen([
      plugin('kosten', 'k_', ['bibliothek']),
      plugin('bibliothek', 'b_'),
      plugin('termine', 't_'),
    ]);
    expect(r.map((p) => p.id)).toEqual(['bibliothek', 'kosten', 'termine']);
  });

  it('weist fehlende/zyklische Abhängigkeiten, doppelte IDs und Präfixe ab', () => {
    expect(() => pluginsOrdnen([plugin('a', 'a_', ['fehlt'])])).toThrow(/nicht vorhanden/);
    expect(() => pluginsOrdnen([plugin('a', 'a_', ['b']), plugin('b', 'b_', ['a'])])).toThrow(
      /Zyklische.*a → b → a/,
    );
    expect(() => pluginsOrdnen([plugin('a', 'a_'), plugin('a', 'b_')])).toThrow(/doppelt/);
    expect(() => pluginsOrdnen([plugin('a', 'x_'), plugin('b', 'x_')])).toThrow(/überschneidet/);
    expect(() => pluginsOrdnen([plugin('kern', 'k_')])).toThrow(/Ungültige Plugin-ID/);
    expect(() => pluginsOrdnen([plugin('a', 'meta')])).toThrow(/Tabellenpräfix/);
  });

  it('stellt Dienste zwischen Plugins bereit', () => {
    let gelesen: unknown;
    const anbieter: BautaktPlugin = {
      ...plugin('anbieter', 'a_'),
      aktivieren: (ctx) => ctx.dienste.bereitstellen('anbieter.wert', () => 42),
    };
    const nutzer: BautaktPlugin = {
      ...plugin('nutzer', 'n_', ['anbieter']),
      aktivieren: (ctx) => (gelesen = ctx.dienste.holen<() => number>('anbieter.wert')()),
    };
    const s = ProjektSitzung.neu(path.join(tempOrdner(), 'p.bautakt'), 'P', {
      ...OPTIONEN,
      plugins: [nutzer, anbieter],
    });
    expect(gelesen).toBe(42);
    s.schliessen();
  });
});

describe('Projektsitzung: Neu/Öffnen/Speichern (E-41)', () => {
  it('legt Sperre an, gibt sie beim Schließen frei und erhält Daten', () => {
    const pfad = path.join(tempOrdner(), 'p.bautakt');
    const s = ProjektSitzung.neu(pfad, 'Labor', { ...OPTIONEN, plugins: [testPlugin()] });
    expect(fs.existsSync(sperrPfad(pfad))).toBe(true);
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'a', name: 'A' } });
    s.schliessen();
    expect(fs.existsSync(sperrPfad(pfad))).toBe(false);

    const s2 = ProjektSitzung.oeffnen(pfad, { ...OPTIONEN, plugins: [testPlugin()] });
    expect(s2.status()).toMatchObject({
      projektname: 'Labor',
      schreibgeschuetzt: false,
      gesperrtVon: null,
    });
    expect(s2.abfrage('test', 'dinge', undefined)).toHaveLength(1);
    // Undo-Stapel gilt nur je Sitzung
    expect(s2.status().undo.rueckgaengig).toBeNull();
    s2.schliessen();
  });

  it('legt beim Öffnen eine Sicherung an (vor den Migrationen)', () => {
    const pfad = path.join(tempOrdner(), 'p.bautakt');
    ProjektSitzung.neu(pfad, 'P', { ...OPTIONEN, plugins: [] }).schliessen();
    ProjektSitzung.oeffnen(pfad, { ...OPTIONEN, plugins: [testPlugin()] }).schliessen();
    expect(fs.existsSync(sicherungsPfad(pfad, 1))).toBe(true);
    // Sicherung zeigt den Zustand vor der Migration des Test-Plugins
    const b = ProjektSitzung.oeffnen(sicherungsPfad(pfad, 1), { ...OPTIONEN, plugins: [] });
    expect(JSON.parse(b.alsJson()).tabellen.x_ding).toBeUndefined();
    b.schliessen();
  });

  it('öffnet schreibgeschützt, wenn die Datei woanders geöffnet ist', () => {
    const pfad = path.join(tempOrdner(), 'p.bautakt');
    const s = ProjektSitzung.neu(pfad, 'P', { ...OPTIONEN, plugins: [testPlugin()] });
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'a', name: 'A' } });
    s.schliessen();
    // fremde, aktive Sperre (lebender Elternprozess)
    fs.writeFileSync(
      sperrPfad(pfad),
      JSON.stringify({ pid: process.ppid, rechner: os.hostname(), zeit: new Date().toISOString() }),
    );

    const ro = ProjektSitzung.oeffnen(pfad, { ...OPTIONEN, plugins: [testPlugin()] });
    expect(ro.schreibgeschuetzt).toBe(true);
    expect(ro.status().gesperrtVon).toContain(`Prozess ${process.ppid}`);
    expect(ro.abfrage('test', 'dinge', undefined)).toHaveLength(1); // Lesen geht
    expect(() => ro.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { name: 'B' } })).toThrow(
      /schreibgeschützt/,
    );
    expect(() => ro.rueckgaengig()).toThrow(/schreibgeschützt/);
    expect(fs.existsSync(sicherungsPfad(pfad, 1))).toBe(false); // keine Sicherung im Lesemodus
    ro.schliessen();
    expect(fs.existsSync(sperrPfad(pfad))).toBe(true); // fremde Sperre bleibt
  });

  it('„Speichern unter“ schreibt eine Kopie und öffnet sie', () => {
    const o = tempOrdner();
    const alt = path.join(o, 'alt.bautakt');
    const neu = path.join(o, 'neu.bautakt');
    const s = ProjektSitzung.neu(alt, 'P', { ...OPTIONEN, plugins: [testPlugin()] });
    s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { id: 'a', name: 'A' } });
    const s2 = s.speichernUnter(neu);
    expect(s.offen).toBe(false);
    expect(fs.existsSync(sperrPfad(alt))).toBe(false);
    expect(s2.pfad).toBe(neu);
    expect(s2.abfrage('test', 'dinge', undefined)).toHaveLength(1);
    s2.schliessen();
  });

  it('speichert automatisch im eingestellten Intervall (Standard 2 min)', () => {
    vi.useFakeTimers();
    try {
      const s = ProjektSitzung.neu(path.join(tempOrdner(), 'p.bautakt'), 'P', {
        ...OPTIONEN,
        autosaveMs: undefined as unknown as number, // Standard verwenden
        plugins: [],
      });
      const gespeichert: boolean[] = [];
      s.ereignisse.on('projekt.gespeichert', (e) => gespeichert.push(e.automatisch));
      vi.advanceTimersByTime(119_000);
      expect(gespeichert).toEqual([]);
      vi.advanceTimersByTime(1_000);
      expect(gespeichert).toEqual([true]);
      s.schliessen();
      vi.advanceTimersByTime(240_000);
      expect(gespeichert).toEqual([true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('vermerkt die Änderungszeit in meta', () => {
    const s = ProjektSitzung.neu(path.join(tempOrdner(), 'p.bautakt'), 'P', {
      ...OPTIONEN,
      plugins: [testPlugin()],
    });
    const vorher = s.status().geaendert;
    const spaeter = new Date(Date.parse(vorher) + 5000);
    vi.useFakeTimers({ now: spaeter, toFake: ['Date'] });
    try {
      s.befehl({ plugin: 'test', name: 'ding.anlegen', daten: { name: 'A' } });
      expect(s.status().geaendert).toBe(spaeter.toISOString());
    } finally {
      vi.useRealTimers();
      s.schliessen();
    }
  });
});
