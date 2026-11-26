import {
  BautaktFehler,
  jetztUtc,
  neueId,
  type GlobalSchreibzugriff,
  type GlobalTeil,
  type Migration,
  type PluginDb,
} from '@bautakt/kern';
import { z } from 'zod';
import type { AufwandswertZeile } from '../gemeinsam/typen.js';

/** Schema der globalen Datei `bibliothek.sqlite` (Architektur 4.3). */
export const GLOBAL_MIGRATIONEN: readonly Migration[] = [
  {
    version: 1,
    name: 'Aufwandswerte, versioniert',
    sql: `
      CREATE TABLE aufwandswert (
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        bezeichnung TEXT NOT NULL,
        gewerk TEXT NOT NULL DEFAULT '',
        einheit TEXT NOT NULL,
        h_je_me REAL NOT NULL CHECK (h_je_me > 0),
        quelle TEXT NOT NULL,
        stand TEXT NOT NULL DEFAULT '',
        anmerkung TEXT NOT NULL DEFAULT '',
        ausgeblendet INTEGER NOT NULL DEFAULT 0,
        erstellt TEXT NOT NULL,
        PRIMARY KEY (id, version)
      );
    `,
  },
];

const text = (max = 2000) => z.string().trim().max(max);
const felder = z.object({
  bezeichnung: text(200).min(1, 'Die Bezeichnung fehlt'),
  gewerk: text(200).default(''),
  einheit: text(30).min(1, 'Die Mengeneinheit fehlt'),
  h_je_me: z
    .number({ error: 'Der Aufwandswert muss eine Zahl sein' })
    .positive('Der Aufwandswert muss größer als 0 sein')
    .max(100_000),
  quelle: text().min(1, 'Die Quelle ist Pflicht (E-51)'),
  stand: text(50).default(''),
  anmerkung: text(4000).default(''),
});

/** Aktuelle Version je Eintrag (höchste Versionsnummer). */
const AKTUELL = `
  SELECT a.* FROM aufwandswert a
  WHERE a.version = (SELECT max(version) FROM aufwandswert b WHERE b.id = a.id)`;

export function aktuelle(db: PluginDb, mitAusgeblendeten = false): AufwandswertZeile[] {
  return db.lesen<AufwandswertZeile>(
    `${AKTUELL} ${mitAusgeblendeten ? '' : 'AND a.ausgeblendet = 0'}
     ORDER BY a.gewerk COLLATE NOCASE, a.bezeichnung COLLATE NOCASE`,
  );
}

export function version(db: PluginDb, id: string, nr?: number): AufwandswertZeile | undefined {
  return nr === undefined
    ? db.eins<AufwandswertZeile>(`${AKTUELL} AND a.id = ?`, id)
    : db.eins<AufwandswertZeile>('SELECT * FROM aufwandswert WHERE id = ? AND version = ?', id, nr);
}

/**
 * Globaler Teil der Bibliothek (E-23, E-51): Jede Änderung legt eine neue Version an,
 * Löschen blendet aus. Projekte frieren eine Version als Kopie ein.
 */
export const bibliothekGlobal: GlobalTeil = {
  datei: 'bibliothek.sqlite',
  migrationen: GLOBAL_MIGRATIONEN,
  aktivieren(ctx) {
    const id = z.string().min(1);
    ctx.abfragen.registrieren({
      name: 'aufwandswerte',
      schema: z.object({ mitAusgeblendeten: z.boolean().optional() }).optional(),
      ausfuehren: (db, a) => aktuelle(db, a?.mitAusgeblendeten ?? false),
    });
    ctx.abfragen.registrieren({
      name: 'aufwandswert',
      schema: z.object({ id, version: z.number().int().positive().optional() }),
      ausfuehren: (db, a) => version(db, a.id, a.version) ?? null,
    });
    ctx.abfragen.registrieren({
      name: 'versionen',
      schema: z.object({ id }),
      ausfuehren: (db, a) =>
        db.lesen<AufwandswertZeile>(
          'SELECT * FROM aufwandswert WHERE id = ? ORDER BY version DESC',
          a.id,
        ),
    });

    const neueVersion = (
      db: GlobalSchreibzugriff,
      alt: AufwandswertZeile,
      aenderung: Partial<AufwandswertZeile>,
    ) => {
      const zeile = { ...alt, ...aenderung, version: alt.version + 1, erstellt: jetztUtc() };
      db.einfuegen('aufwandswert', { ...zeile });
      return zeile.version;
    };
    const vorhanden = (db: PluginDb, eintrag: string) => {
      const v = version(db, eintrag);
      if (!v) throw new BautaktFehler('NICHT_GEFUNDEN', 'Der Aufwandswert existiert nicht (mehr).');
      return v;
    };

    ctx.aktionen.registrieren({
      name: 'aufwandswert.anlegen',
      titel: 'Aufwandswert anlegen',
      schema: felder,
      ausfuehren(db, d) {
        const neu = neueId();
        db.einfuegen('aufwandswert', {
          id: neu,
          version: 1,
          ...d,
          ausgeblendet: 0,
          erstellt: jetztUtc(),
        });
        return { id: neu, version: 1 };
      },
    });
    ctx.aktionen.registrieren({
      name: 'aufwandswert.aendern',
      titel: 'Aufwandswert ändern',
      schema: felder.extend({ id }),
      ausfuehren(db, { id: eintrag, ...d }) {
        const alt = vorhanden(db, eintrag);
        const gleich = (Object.keys(d) as (keyof typeof d)[]).every((k) => alt[k] === d[k]);
        if (gleich) return { id: eintrag, version: alt.version }; // keine neue Version ohne Änderung
        return { id: eintrag, version: neueVersion(db, alt, d) };
      },
    });
    for (const [name, titel, wert] of [
      ['aufwandswert.ausblenden', 'Aufwandswert löschen', 1],
      ['aufwandswert.einblenden', 'Aufwandswert wiederherstellen', 0],
    ] as const) {
      ctx.aktionen.registrieren({
        name,
        titel,
        schema: z.object({ id }),
        ausfuehren(db, d) {
          const alt = vorhanden(db, d.id);
          if (alt.ausgeblendet === wert) return { id: d.id, version: alt.version };
          return { id: d.id, version: neueVersion(db, alt, { ausgeblendet: wert }) };
        },
      });
    }

    ctx.dienste.bereitstellen('bibliothek.aufwandswert', (eintrag: string, nr?: number) =>
      version(ctx.db, eintrag, nr),
    );
    ctx.dienste.bereitstellen(
      'bibliothek.aktuelleVersion',
      (eintrag: string) => version(ctx.db, eintrag)?.version ?? null,
    );
  },
};
