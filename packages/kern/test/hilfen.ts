import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { z } from 'zod';
import { neueId, type BautaktPlugin } from '../src/index.js';

const ordner: string[] = [];

/** Leerer temporärer Ordner; wird nach jedem Test gelöscht. */
export function tempOrdner(): string {
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bautakt-test-'));
  ordner.push(o);
  return o;
}

afterEach(() => {
  for (const o of ordner.splice(0)) fs.rmSync(o, { recursive: true, force: true });
});

/** Kleines Test-Plugin mit einer Tabelle und drei Befehlen. */
export function testPlugin(extra: Partial<BautaktPlugin> = {}): BautaktPlugin {
  return {
    id: 'test',
    name: 'Test',
    version: '1.0.0',
    tabellenPraefix: 'x_',
    migrationen: [
      {
        version: 1,
        name: 'Ding',
        sql: "CREATE TABLE x_ding (id TEXT PRIMARY KEY, name TEXT NOT NULL, menge REAL, art TEXT NOT NULL DEFAULT 'a')",
      },
    ],
    aktivieren(ctx) {
      ctx.befehle.registrieren({
        name: 'ding.anlegen',
        titel: 'Ding anlegen',
        schema: z.object({
          id: z.string().optional(),
          name: z.string().min(1),
          menge: z.number().optional(),
        }),
        ausfuehren(tx, d) {
          tx.einfuegen('x_ding', { id: d.id ?? neueId(), name: d.name, menge: d.menge ?? null });
        },
      });
      ctx.befehle.registrieren({
        name: 'ding.aendern',
        titel: 'Ding ändern',
        schema: z.object({
          id: z.string(),
          name: z.string().optional(),
          menge: z.number().optional(),
        }),
        ausfuehren(tx, d) {
          tx.aendern('x_ding', d.id, {
            ...(d.name !== undefined ? { name: d.name } : {}),
            ...(d.menge !== undefined ? { menge: d.menge } : {}),
          });
        },
      });
      ctx.befehle.registrieren({
        name: 'ding.loeschen',
        titel: 'Ding löschen',
        schema: z.object({ id: z.string() }),
        ausfuehren(tx, d) {
          tx.loeschen('x_ding', d.id);
        },
      });
      ctx.befehle.registrieren({
        name: 'fremd.schreiben',
        titel: 'Fremde Tabelle',
        schema: z.object({}),
        ausfuehren(tx) {
          tx.einfuegen('t_plan', { id: neueId(), name: 'x' });
        },
      });
      ctx.befehle.registrieren({
        name: 'zwei.dann.fehler',
        titel: 'Abbruch',
        schema: z.object({}),
        ausfuehren(tx) {
          tx.einfuegen('x_ding', { id: neueId(), name: 'eins' });
          throw new Error('absichtlich');
        },
      });
      ctx.abfragen.registrieren({
        name: 'dinge',
        schema: z.undefined(),
        ausfuehren: (db) => db.lesen('SELECT * FROM x_ding ORDER BY name'),
      });
    },
    ...extra,
  };
}

export const OPTIONEN = { appVersion: '0.0.1-test', autosaveMs: 0 } as const;
