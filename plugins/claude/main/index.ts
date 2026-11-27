import { BautaktFehler, type BautaktPlugin, type MainKontext } from '@bautakt/kern';
import { z } from 'zod';
import type { ClaudeStatus } from '../gemeinsam/typen.js';
import { MODELL } from './agent.js';
import { apiSchluessel, holeHost, hostVorhanden, speicherAendern, speicherLesen } from './host.js';
import { gespraech } from './laufzeit.js';
import type { WerkzeugUmgebung } from './werkzeuge.js';

export { claudeHostEinrichten, type ClaudeHost } from './host.js';
export { anthropicApi } from './api.js';
export { simulierteApi } from './simulation.js';

/** Projektzugriff für die Werkzeuge: nur lesen und prüfen, Vorschläge sammeln (E-97). */
function werkzeugUmgebung(ctx: MainKontext): () => WerkzeugUmgebung {
  return () => ({
    projektName: () => ctx.projekt.name(),
    abfrage: (plugin, name, argumente) => ctx.abfragen.ausfuehren(plugin, name, argumente),
    befehle: () => ctx.befehle.liste(),
    pruefen: (plugin, name, daten) => ctx.befehle.pruefen(plugin, name, daten),
    vorschlagen: (v) => gespraech(ctx.projekt.id, werkzeugUmgebung(ctx)).vorschlagen(v),
  });
}

/**
 * Plugin Claude (E-97–E-100): Assistent mit Lesezugriff auf das Projekt und Änderungsvorschlägen,
 * die erst nach Bestätigung als normale Befehle laufen. Keine eigenen Tabellen in der
 * Projektdatei; Schlüssel, Zustimmung und Sitzung liegen im App-Datenordner.
 *
 * Die Abfragen „senden“, „abbrechen“ usw. ändern keine Projektdaten – sie steuern nur das Gespräch.
 */
export const claudePlugin: BautaktPlugin = {
  id: 'claude',
  name: 'Claude',
  version: '0.1.0',
  tabellenPraefix: 'c_',
  migrationen: [],

  aktivieren(ctx) {
    const g = () => gespraech(ctx.projekt.id, werkzeugUmgebung(ctx));
    const bereit = () => {
      if (!hostVorhanden())
        throw new BautaktFehler('PLUGIN', 'Claude ist in dieser Umgebung nicht eingerichtet.');
    };

    ctx.abfragen.registrieren({
      name: 'status',
      schema: z.undefined(),
      ausfuehren: (): ClaudeStatus => {
        if (!hostVorhanden())
          return {
            verschluesselung: false,
            schluessel: false,
            zustimmung: false,
            laeuft: false,
            sitzung: false,
            modell: MODELL,
            kosten: null,
            simuliert: false,
          };
        const s = speicherLesen();
        const p = s.projekte[ctx.projekt.id];
        return {
          verschluesselung: holeHost().verschluesselungVerfuegbar,
          schluessel: apiSchluessel() !== null,
          zustimmung: !!p?.zustimmung,
          laeuft: g().laeuft,
          sitzung: !!p?.sitzungId,
          modell: MODELL,
          kosten: g().kosten,
          simuliert: !!holeHost().simuliert,
        };
      },
    });

    // API-Schlüssel (E-100): verschlüsselt im App-Datenordner
    ctx.abfragen.registrieren({
      name: 'schluesselSetzen',
      schema: z.object({
        schluessel: z.string().trim().min(20, 'Der Schlüssel ist zu kurz.').max(500),
      }),
      ausfuehren: (_db, a) => {
        bereit();
        const h = holeHost();
        if (!h.verschluesselungVerfuegbar)
          throw new BautaktFehler(
            'PLUGIN',
            'Die Verschlüsselung von Windows ist nicht verfügbar; der Schlüssel wird nicht gespeichert.',
          );
        speicherAendern((s) => {
          s.schluessel = h.verschluesseln(a.schluessel);
        });
        return true;
      },
    });

    ctx.abfragen.registrieren({
      name: 'schluesselEntfernen',
      schema: z.undefined(),
      ausfuehren: () => {
        bereit();
        speicherAendern((s) => {
          delete s.schluessel;
        });
        return true;
      },
    });

    // Zustimmung je Projekt (E-100)
    ctx.abfragen.registrieren({
      name: 'zustimmung',
      schema: z.object({ ja: z.boolean() }),
      ausfuehren: (_db, a) => {
        bereit();
        speicherAendern((s) => {
          s.projekte[ctx.projekt.id] = { ...(s.projekte[ctx.projekt.id] ?? {}), zustimmung: a.ja };
        });
        return true;
      },
    });

    ctx.abfragen.registrieren({
      name: 'senden',
      schema: z.object({ text: z.string().trim().min(1).max(20_000) }),
      ausfuehren: (_db, a) => {
        bereit();
        g().senden(a.text);
        return true;
      },
    });

    ctx.abfragen.registrieren({
      name: 'verlauf',
      schema: z.undefined(),
      ausfuehren: () => (hostVorhanden() ? g().alles() : { eintraege: [], laeuft: false }),
    });

    ctx.abfragen.registrieren({
      name: 'vorschlagErledigt',
      schema: z.object({
        nr: z.number().int().positive(),
        zustand: z.enum(['ausgefuehrt', 'verworfen']),
        fehler: z.string().max(500).optional(),
      }),
      ausfuehren: (_db, a) => {
        g().vorschlagErledigt(a.nr, a.zustand, a.fehler);
        return true;
      },
    });

    ctx.abfragen.registrieren({
      name: 'abbrechen',
      schema: z.undefined(),
      ausfuehren: async () => {
        await g().abbrechen();
        return true;
      },
    });

    ctx.abfragen.registrieren({
      name: 'neuesGespraech',
      schema: z.undefined(),
      ausfuehren: () => {
        g().neuBeginnen();
        return true;
      },
    });

    ctx.abfragen.registrieren({
      name: 'verlaufLoeschen',
      schema: z.undefined(),
      ausfuehren: async () => {
        await g().loeschen();
        return true;
      },
    });
  },
};
