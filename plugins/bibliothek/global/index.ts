import {
  BautaktFehler,
  jetztUtc,
  neueId,
  type GlobalKontext,
  type GlobalSchreibzugriff,
  type GlobalTeil,
  type Migration,
  type PluginDb,
  type Zeile,
} from '@bautakt/kern';
import { kostengruppe } from '@bautakt/rechnen-kosten';
import { z } from 'zod';
import type { AufwandswertZeile, KennwertZeile } from '../gemeinsam/typen.js';

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
  {
    version: 2,
    name: 'Kostenkennwerte, versioniert (E-58)',
    sql: `
      CREATE TABLE kennwert (
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        bezeichnung TEXT NOT NULL,
        kg INTEGER NOT NULL,
        einheit TEXT NOT NULL,
        von REAL,
        mittel REAL NOT NULL,
        bis REAL,
        quelle TEXT NOT NULL,
        stand TEXT NOT NULL DEFAULT '',
        index_stand REAL,
        gebaeudeart TEXT NOT NULL DEFAULT '',
        anmerkung TEXT NOT NULL DEFAULT '',
        ausgeblendet INTEGER NOT NULL DEFAULT 0,
        erstellt TEXT NOT NULL,
        PRIMARY KEY (id, version)
      );
    `,
  },
];

const text = (max = 2000) => z.string().trim().max(max);
const quelle = text().min(1, 'Die Quelle ist Pflicht (E-51)');

const aufwandFelder = z.object({
  bezeichnung: text(200).min(1, 'Die Bezeichnung fehlt'),
  gewerk: text(200).default(''),
  einheit: text(30).min(1, 'Die Mengeneinheit fehlt'),
  h_je_me: z
    .number({ error: 'Der Aufwandswert muss eine Zahl sein' })
    .positive('Der Aufwandswert muss größer als 0 sein')
    .max(100_000),
  quelle,
  stand: text(50).default(''),
  anmerkung: text(4000).default(''),
});

const betrag = (was: string) =>
  z.number({ error: `${was} muss eine Zahl sein` }).positive(`${was} muss größer als 0 sein`);
const kennwertFelder = z
  .object({
    bezeichnung: text(200).min(1, 'Die Bezeichnung fehlt'),
    kg: z
      .number()
      .int()
      .refine((kg) => !!kostengruppe(kg), 'Die Kostengruppe gibt es im Katalog nicht (E-55)'),
    einheit: text(30).min(1, 'Die Bezugseinheit fehlt'),
    von: betrag('Von').nullable().default(null),
    mittel: betrag('Mittel'),
    bis: betrag('Bis').nullable().default(null),
    quelle,
    stand: text(100).default(''),
    index_stand: betrag('Der Index zum Stand').nullable().default(null),
    gebaeudeart: text(200).default(''),
    anmerkung: text(4000).default(''),
  })
  .refine((k) => k.von === null || k.von <= k.mittel, 'Von darf nicht größer als Mittel sein')
  .refine((k) => k.bis === null || k.bis >= k.mittel, 'Bis darf nicht kleiner als Mittel sein');

/** Aktuelle Version je Eintrag (höchste Versionsnummer). */
const aktuellSql = (tabelle: string) => `
  SELECT a.* FROM ${tabelle} a
  WHERE a.version = (SELECT max(version) FROM ${tabelle} b WHERE b.id = a.id)`;

type Versioniert = Zeile & { id: string; version: number; ausgeblendet: number };

/** Versionierte Sammlung (E-51): anlegen, ändern (= neue Version), ausblenden, einblenden. */
function sammlung<T extends Versioniert>(
  ctx: GlobalKontext,
  o: {
    tabelle: 'aufwandswert' | 'kennwert';
    titel: string;
    liste: string;
    einzeln: string;
    versionen: string;
    sortierung: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    felder: z.ZodType<any>;
    dienstEinzeln: string;
    dienstVersion: string;
  },
) {
  const aktuell = aktuellSql(o.tabelle);
  const version = (db: PluginDb, id: string, nr?: number): T | undefined =>
    nr === undefined
      ? db.eins<T>(`${aktuell} AND a.id = ?`, id)
      : db.eins<T>(`SELECT * FROM ${o.tabelle} WHERE id = ? AND version = ?`, id, nr);
  const vorhanden = (db: PluginDb, id: string) => {
    const v = version(db, id);
    if (!v) throw new BautaktFehler('NICHT_GEFUNDEN', `${o.titel} existiert nicht (mehr).`);
    return v;
  };
  const neueVersion = (db: GlobalSchreibzugriff, alt: T, aenderung: Zeile) => {
    const zeile = { ...alt, ...aenderung, version: alt.version + 1, erstellt: jetztUtc() };
    db.einfuegen(o.tabelle, zeile);
    return zeile.version;
  };
  const id = z.string().min(1);

  ctx.abfragen.registrieren({
    name: o.liste,
    schema: z.object({ mitAusgeblendeten: z.boolean().optional() }).optional(),
    ausfuehren: (db, a) =>
      db.lesen<T>(
        `${aktuell} ${a?.mitAusgeblendeten ? '' : 'AND a.ausgeblendet = 0'} ORDER BY ${o.sortierung}`,
      ),
  });
  ctx.abfragen.registrieren({
    name: o.einzeln,
    schema: z.object({ id, version: z.number().int().positive().optional() }),
    ausfuehren: (db, a) => version(db, a.id, a.version) ?? null,
  });
  ctx.abfragen.registrieren({
    name: o.versionen,
    schema: z.object({ id }),
    ausfuehren: (db, a) =>
      db.lesen<T>(`SELECT * FROM ${o.tabelle} WHERE id = ? ORDER BY version DESC`, a.id),
  });

  ctx.aktionen.registrieren({
    name: `${o.tabelle}.anlegen`,
    titel: `${o.titel} anlegen`,
    schema: o.felder,
    ausfuehren(db, d: Zeile) {
      const neu = neueId();
      db.einfuegen(o.tabelle, { id: neu, version: 1, ...d, ausgeblendet: 0, erstellt: jetztUtc() });
      return { id: neu, version: 1 };
    },
  });
  ctx.aktionen.registrieren({
    name: `${o.tabelle}.aendern`,
    titel: `${o.titel} ändern`,
    schema: z.intersection(o.felder, z.object({ id })),
    ausfuehren(db, alles: Zeile & { id: string }) {
      const { id: eintrag, ...d } = alles;
      const alt = vorhanden(db, eintrag);
      const gleich = Object.keys(d).every((k) => alt[k] === d[k]);
      if (gleich) return { id: eintrag, version: alt.version }; // keine neue Version ohne Änderung
      return { id: eintrag, version: neueVersion(db, alt, d) };
    },
  });
  for (const [name, titel, wert] of [
    ['ausblenden', 'löschen', 1],
    ['einblenden', 'wiederherstellen', 0],
  ] as const) {
    ctx.aktionen.registrieren({
      name: `${o.tabelle}.${name}`,
      titel: `${o.titel} ${titel}`,
      schema: z.object({ id }),
      ausfuehren(db, d) {
        const alt = vorhanden(db, d.id);
        if (alt.ausgeblendet === wert) return { id: d.id, version: alt.version };
        return { id: d.id, version: neueVersion(db, alt, { ausgeblendet: wert }) };
      },
    });
  }
  ctx.dienste.bereitstellen(o.dienstEinzeln, (eintrag: string, nr?: number) =>
    version(ctx.db, eintrag, nr),
  );
  ctx.dienste.bereitstellen(
    o.dienstVersion,
    (eintrag: string) => version(ctx.db, eintrag)?.version ?? null,
  );
}

/**
 * Globaler Teil der Bibliothek (E-23, E-51, E-58): Aufwandswerte und Kostenkennwerte,
 * versioniert. Projekte frieren eine Version als Kopie ein.
 */
export const bibliothekGlobal: GlobalTeil = {
  datei: 'bibliothek.sqlite',
  migrationen: GLOBAL_MIGRATIONEN,
  aktivieren(ctx) {
    sammlung<AufwandswertZeile & Versioniert>(ctx, {
      tabelle: 'aufwandswert',
      titel: 'Aufwandswert',
      liste: 'aufwandswerte',
      einzeln: 'aufwandswert',
      versionen: 'versionen',
      sortierung: 'a.gewerk COLLATE NOCASE, a.bezeichnung COLLATE NOCASE',
      felder: aufwandFelder,
      dienstEinzeln: 'bibliothek.aufwandswert',
      dienstVersion: 'bibliothek.aktuelleVersion',
    });
    sammlung<KennwertZeile & Versioniert>(ctx, {
      tabelle: 'kennwert',
      titel: 'Kennwert',
      liste: 'kennwerte',
      einzeln: 'kennwert',
      versionen: 'kennwertVersionen',
      sortierung: 'a.kg, a.bezeichnung COLLATE NOCASE',
      felder: kennwertFelder,
      dienstEinzeln: 'bibliothek.kennwert',
      dienstVersion: 'bibliothek.kennwertAktuelleVersion',
    });
  },
};
