import { ProjektSitzung } from '@bautakt/kern';
import { bimPlugin } from '@bautakt/plugin-bim/main';
import { kostenPlugin } from '@bautakt/plugin-kosten/main';
import { terminePlugin } from '@bautakt/plugin-termine/main';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClaudeStatus, Verlauf } from '../gemeinsam/typen.js';
import { AGENT_KONFIG } from '../main/agent.js';
import { claudeHostEinrichten } from '../main/host.js';
import { claudePlugin } from '../main/index.js';
import { gespraecheZuruecksetzen } from '../main/laufzeit.js';
import { simulierteApi } from '../main/simulation.js';
import { KI_KENNZEICHEN, kiEntwuerfeKennzeichnen } from '../main/werkzeuge.js';

const ordner: string[] = [];
afterEach(() => {
  claudeHostEinrichten(null);
  gespraecheZuruecksetzen();
  ordner.splice(0).forEach((o) => fs.rmSync(o, { recursive: true, force: true }));
});

function umgebung() {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-claude-'));
  ordner.push(o);
  const sim = simulierteApi();
  claudeHostEinrichten({
    ordner: path.join(o, 'app'),
    verschluesselungVerfuegbar: true,
    verschluesseln: (t) => `x${Buffer.from(t).toString('base64')}`,
    entschluesseln: (g) => Buffer.from(g.slice(1), 'base64').toString(),
    api: () => sim,
    simuliert: true,
  });
  const s = ProjektSitzung.neu(path.join(o, 'p.bautakt'), 'Fertigteilhalle', {
    appVersion: '0.0.1',
    autosaveMs: 0,
    plugins: [terminePlugin, kostenPlugin, bimPlugin, claudePlugin],
  });
  const befehl = (plugin: string, name: string, daten: unknown) =>
    s.befehl({ plugin, name, daten });
  const eingefuegt = (plugin: string, name: string, daten: unknown, tabelle: string) =>
    befehl(plugin, name, daten).aenderungen.find(
      (a) => a.art === 'einfuegen' && a.tabelle === tabelle,
    )?.id ?? '';
  const planId = eingefuegt(
    'termine',
    'plan.anlegen',
    { name: 'Gesamtprojekt', projektstart: '2026-12-14' },
    't_plan',
  );
  const v1 = eingefuegt(
    'termine',
    'vorgang.anlegen',
    { planId, name: 'Planung', dauer: 70 },
    't_vorgang',
  );
  eingefuegt(
    'termine',
    'vorgang.anlegen',
    { planId, nachId: v1, name: 'Montage', dauer: 50 },
    't_vorgang',
  );
  const claude = (name: string, argumente?: unknown) => s.abfrage('claude', name, argumente);
  const fertig = async () => {
    for (let i = 0; i < 200; i++) {
      if (!(claude('verlauf') as Verlauf).laeuft) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('Claude wurde nicht fertig');
  };
  return { o, s, sim, befehl, planId, v1, claude, fertig };
}

describe('KI-Entwürfe (E-98)', () => {
  it('kennzeichnet nur Freitextfelder, auch verschachtelt, nicht doppelt', () => {
    const r = kiEntwuerfeKennzeichnen({
      id: 'a',
      felder: { anmerkung: 'Dauer prüfen', name: 'Montage', risiko: '' },
      quelle_annahme: `${KI_KENNZEICHEN}schon markiert`,
    });
    expect(r.daten).toEqual({
      id: 'a',
      felder: { anmerkung: '[KI-Entwurf] Dauer prüfen', name: 'Montage', risiko: '' },
      quelle_annahme: '[KI-Entwurf] schon markiert',
    });
    expect(r.felder).toEqual(['anmerkung']);
  });
});

describe('Claude-Assistent mit simulierter Sitzung (E-97–E-100)', () => {
  it('Schlüssel und Zustimmung sind Voraussetzung; Schlüssel liegt verschlüsselt im App-Ordner', async () => {
    const u = umgebung();
    expect(u.claude('status')).toMatchObject({
      schluessel: false,
      zustimmung: false,
      simuliert: true,
    });
    await expect(async () => u.claude('senden', { text: 'Hallo' })).rejects.toThrow(
      /API-Schlüssel/,
    );
    u.claude('schluesselSetzen', { schluessel: 'sk-ant-test-0123456789abcdef' });
    await expect(async () => u.claude('senden', { text: 'Hallo' })).rejects.toThrow(/Zustimmung/);
    u.claude('zustimmung', { ja: true });
    expect(u.claude('status')).toMatchObject({ schluessel: true, zustimmung: true });
    const gespeichert = fs.readFileSync(path.join(u.o, 'app', 'claude.json'), 'utf8');
    expect(gespeichert).not.toContain('sk-ant-test');
    // nichts in der Projektdatei
    expect(u.s.alsJson()).not.toContain('sk-ant');
    u.s.schliessen();
  });

  it('liest das Projekt, schlägt eine Änderung vor; Ausführen läuft als Befehl mit Grund', async () => {
    const u = umgebung();
    u.claude('schluesselSetzen', { schluessel: 'sk-ant-test-0123456789abcdef' });
    u.claude('zustimmung', { ja: true });

    u.claude('senden', { text: 'Bitte einen Vorschlag für den ersten Vorgang.' });
    await u.fertig();
    const v = u.claude('verlauf') as Verlauf;
    expect(v.eintraege.map((e) => e.art)).toEqual([
      'nutzer',
      'werkzeug',
      'werkzeug',
      'vorschlag',
      'claude',
    ]);
    const vorschlag = v.eintraege.find((e) => e.art === 'vorschlag')?.vorschlag;
    expect(vorschlag).toMatchObject({
      nr: 1,
      plugin: 'termine',
      befehl: 'vorgang.aendern',
      titel: 'Vorgang ändern',
      kiEntwurf: ['anmerkung'],
      zustand: 'offen',
      daten: {
        id: u.v1,
        felder: { anmerkung: '[KI-Entwurf] Dauer mit dem Lieferanten abstimmen.' },
      },
    });
    // Werkzeugergebnis an Claude: Plan mit berechneten Terminen
    const ergebnis = u.sim.gesendet.find(
      (e) => e.type === 'user.custom_tool_result' && e.content[0]?.text.includes('"faz"'),
    );
    expect(ergebnis).toBeDefined();
    // Agent und Sitzung angelegt, Kosten gemeldet
    expect(u.sim.agentKonfig).toEqual([AGENT_KONFIG]);
    expect(u.claude('status')).toMatchObject({ sitzung: true, kosten: '0,12 USD' });

    // Ausführen durch den Nutzer (wie die Oberfläche): normaler Befehl mit Grund
    u.s.befehl({
      plugin: vorschlag?.plugin ?? '',
      name: vorschlag?.befehl ?? '',
      daten: vorschlag?.daten,
      grund: 'Vorschlag von Claude',
    });
    u.claude('vorschlagErledigt', { nr: 1, zustand: 'ausgefuehrt' });
    const plan = u.s.abfrage('termine', 'plan', { planId: u.planId }) as {
      vorgaenge: { id: string; anmerkung: string }[];
    };
    expect(plan.vorgaenge.find((x) => x.id === u.v1)?.anmerkung).toBe(
      '[KI-Entwurf] Dauer mit dem Lieferanten abstimmen.',
    );
    expect(u.s.alsJson()).toContain('Vorschlag von Claude'); // Änderungsprotokoll

    // Claude erfährt das Ergebnis mit der nächsten Nachricht; Agent wird nicht neu angelegt
    u.claude('senden', { text: 'Welche Vorgänge sind kritisch?' });
    await u.fertig();
    const letzte = u.sim.gesendet.filter((e) => e.type === 'user.message').at(-1);
    expect(letzte?.type === 'user.message' && letzte.content[0]?.text).toMatch(
      /^\[Vorschlag 1 wurde ausgeführt\.\]/,
    );
    expect((u.claude('verlauf') as Verlauf).eintraege.at(-1)?.text).toBe(
      'Simulation: 1 kritische Vorgänge – Planung.',
    );
    expect(u.sim.agentKonfig).toHaveLength(1);
    u.s.schliessen();
  });

  it('ungültige Vorschläge gehen als Fehler an Claude zurück; Befehlsliste mit Schema', async () => {
    const u = umgebung();
    const { werkzeugAusfuehren } = await import('../main/werkzeuge.js');
    const vorschlaege: unknown[] = [];
    const um = {
      projektName: () => 'P',
      abfrage: (p: string, n: string, a?: unknown) => u.s.abfrage(p, n, a),
      befehle: () => (u.s as unknown as { befehle: { liste(): never[] } }).befehle.liste(),
      pruefen: (p: string, n: string, d: unknown) =>
        (
          u.s as unknown as { befehle: { pruefen(p: string, n: string, d: unknown): never } }
        ).befehle.pruefen(p, n, d),
      vorschlagen: (v: unknown) => vorschlaege.push(v),
    };
    const liste = await werkzeugAusfuehren('befehle_beschreiben', { plugin: 'termine' }, um);
    const befehle = JSON.parse(liste.text) as { befehl: string; schema: { type: string } }[];
    expect(befehle.find((b) => b.befehl === 'vorgang.aendern')?.schema.type).toBe('object');
    const falsch = await werkzeugAusfuehren(
      'aenderung_vorschlagen',
      {
        plugin: 'termine',
        befehl: 'vorgang.aendern',
        daten: { id: u.v1, felder: { dauer_at: -3 } },
        beschreibung: 'x',
      },
      um,
    );
    expect(falsch.fehler).toBe(true);
    expect(falsch.text).toMatch(/passen nicht/);
    const fremd = await werkzeugAusfuehren(
      'aenderung_vorschlagen',
      { plugin: 'kern', befehl: 'stand.laden', daten: {}, beschreibung: 'x' },
      um,
    );
    expect(fremd).toMatchObject({ fehler: true });
    expect(vorschlaege).toEqual([]);
    u.s.schliessen();
  });

  it('neues Gespräch und Verlauf löschen; Zustimmung widerrufen', async () => {
    const u = umgebung();
    u.claude('schluesselSetzen', { schluessel: 'sk-ant-test-0123456789abcdef' });
    u.claude('zustimmung', { ja: true });
    u.claude('senden', { text: 'Hallo' });
    await u.fertig();
    expect((u.claude('status') as ClaudeStatus).sitzung).toBe(true);
    await u.claude('verlaufLoeschen');
    expect(u.claude('status')).toMatchObject({ sitzung: false });
    expect((u.claude('verlauf') as Verlauf).eintraege).toEqual([]);
    u.claude('zustimmung', { ja: false });
    await expect(async () => u.claude('senden', { text: 'Hallo' })).rejects.toThrow(/Zustimmung/);
    u.s.schliessen();
  });
});
