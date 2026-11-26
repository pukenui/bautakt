import { BautaktFehler, neueId, type BefehlDefinition, type PluginDb } from '@bautakt/kern';
import { aufwandRechnen, AufwandFehler } from '@bautakt/rechnen-aufwand';
import type { AufwandswertZeile } from '@bautakt/plugin-bibliothek/typen';
import { z } from 'zod';
import type { AufwandHinweis, AufwandZeile, VorgangZeile } from '../gemeinsam/typen.js';

/** Zugriff auf die globale Bibliothek; null, wenn das Bibliothek-Plugin fehlt. */
export interface BibliothekZugriff {
  aufwandswert(id: string, version?: number): AufwandswertZeile | undefined;
  aktuelleVersion(id: string): number | null;
}

const fehler = (meldung: string) => new BautaktFehler('BEFEHL_DATEN', meldung);
const zahl = (was: string) =>
  z.number({ error: `${was} muss eine Zahl sein` }).positive(`${was} muss größer als 0 sein`);
const text = (max: number) => z.string().trim().max(max);

const eingabe = z.object({
  vorgangId: z.string().min(1),
  menge: zahl('Die Menge'),
  ak: zahl('Die Zahl der Arbeitskräfte'),
  h_je_at: zahl('Die Arbeitszeit je Tag').max(24, 'Höchstens 24 h je Tag'),
  zuschlaege: z
    .array(z.object({ name: text(100).min(1, 'Zu-/Abschlag ohne Namen'), prozent: z.number() }))
    .max(20)
    .default([]),
  wert: z.discriminatedUnion('art', [
    z.object({
      art: z.literal('bibliothek'),
      id: z.string().min(1),
      version: z.number().int().positive(),
    }),
    z.object({
      art: z.literal('eigen'),
      bezeichnung: text(200).min(1, 'Die Bezeichnung des Aufwandswerts fehlt'),
      einheit: text(30).min(1, 'Die Mengeneinheit fehlt'),
      h_je_me: zahl('Der Aufwandswert'),
      quelle: text(2000).min(1, 'Für einen eigenen Aufwandswert ist die Quelle Pflicht'),
      stand: text(50).default(''),
    }),
  ]),
});

/** Vorbelegung der Quelle/Annahme (E-54): „AW <Bezeichnung> (<Quelle>, <Stand>)“. */
export function quelleText(a: Pick<AufwandZeile, 'bezeichnung' | 'quelle' | 'stand'>): string {
  return `AW ${a.bezeichnung} (${a.quelle}${a.stand ? `, ${a.stand}` : ''})`;
}

/** Befehle des Aufwandswert-Rechners; die Bibliothek wird erst beim Ausführen geholt. */
export function aufwandBefehle(
  bibliothek: () => BibliothekZugriff | null,
): BefehlDefinition<never>[] {
  const uebernehmen: BefehlDefinition<z.infer<typeof eingabe>> = {
    name: 'aufwand.uebernehmen',
    titel: 'Dauer aus Aufwandswert übernehmen',
    schema: eingabe,
    ausfuehren(tx, d) {
      const v = tx.eins<VorgangZeile>('SELECT * FROM t_vorgang WHERE id = ?', d.vorgangId);
      if (!v) throw new BautaktFehler('NICHT_GEFUNDEN', 'Der Vorgang existiert nicht (mehr).');
      if (v.typ !== 'vorgang')
        throw fehler('Nur Einzelvorgänge haben eine Dauer aus Aufwandswerten.');

      // Wert einfrieren: Bibliotheksversion kopieren oder eigenen Wert übernehmen
      let kopie: Pick<
        AufwandZeile,
        'bib_id' | 'bib_version' | 'bezeichnung' | 'einheit' | 'h_je_me' | 'quelle' | 'stand'
      >;
      if (d.wert.art === 'bibliothek') {
        const bib = bibliothek();
        if (!bib) throw fehler('Die Bibliothek ist nicht verfügbar.');
        const w = bib.aufwandswert(d.wert.id, d.wert.version);
        if (!w) throw fehler('Der Aufwandswert ist in der Bibliothek nicht (mehr) vorhanden.');
        kopie = {
          bib_id: w.id,
          bib_version: w.version,
          bezeichnung: w.bezeichnung,
          einheit: w.einheit,
          h_je_me: w.h_je_me,
          quelle: w.quelle,
          stand: w.stand,
        };
      } else {
        const { art: _art, ...eigen } = d.wert;
        kopie = { bib_id: null, bib_version: null, ...eigen };
      }

      let ergebnis;
      try {
        ergebnis = aufwandRechnen({
          menge: d.menge,
          einheit: kopie.einheit,
          aw: kopie.h_je_me,
          ak: d.ak,
          hJeAt: d.h_je_at,
          zuschlaege: d.zuschlaege,
        });
      } catch (e) {
        if (e instanceof AufwandFehler) throw fehler(e.message);
        throw e;
      }

      const zeile = {
        ...kopie,
        vorgang_id: v.id,
        menge: d.menge,
        ak: d.ak,
        h_je_at: d.h_je_at,
        zuschlaege: JSON.stringify(d.zuschlaege),
        formel: ergebnis.formel,
        dauer: ergebnis.dauer,
      };
      const alt = tx.eins<{ id: string }>('SELECT id FROM t_aufwand WHERE vorgang_id = ?', v.id);
      const aufwandId = alt?.id ?? neueId();
      if (alt) tx.aendern('t_aufwand', aufwandId, zeile);
      else tx.einfuegen('t_aufwand', { id: aufwandId, ...zeile });

      tx.aendern('t_vorgang', v.id, {
        dauer_at: ergebnis.dauer,
        dauer_herleitung: ergebnis.formel,
        aufwand_ref: aufwandId,
        ...(v.quelle_annahme.trim() ? {} : { quelle_annahme: quelleText(kopie) }),
      });
    },
  };

  const entfernen: BefehlDefinition<{ vorgangId: string }> = {
    name: 'aufwand.entfernen',
    titel: 'Herleitung der Dauer entfernen',
    schema: z.object({ vorgangId: z.string().min(1) }),
    ausfuehren(tx, d) {
      const a = tx.eins<{ id: string }>(
        'SELECT id FROM t_aufwand WHERE vorgang_id = ?',
        d.vorgangId,
      );
      if (a) tx.loeschen('t_aufwand', a.id);
      if (tx.eins('SELECT 1 FROM t_vorgang WHERE id = ?', d.vorgangId))
        tx.aendern('t_vorgang', d.vorgangId, { dauer_herleitung: '', aufwand_ref: null });
    },
  };

  return [
    uebernehmen as unknown as BefehlDefinition<never>,
    entfernen as unknown as BefehlDefinition<never>,
  ];
}

/** Herleitungen eines Plans mit Hinweis auf neuere Bibliotheksversionen (E-54). */
export function aufwandHinweise(
  db: PluginDb,
  planId: string,
  aktuelleVersion?: (id: string) => number | null,
): Record<string, AufwandHinweis> {
  const zeilen = db.lesen<AufwandZeile>(
    `SELECT a.* FROM t_aufwand a JOIN t_vorgang v ON v.id = a.vorgang_id WHERE v.plan_id = ?`,
    planId,
  );
  const ergebnis: Record<string, AufwandHinweis> = {};
  for (const a of zeilen) {
    const aktuell = a.bib_id && aktuelleVersion ? aktuelleVersion(a.bib_id) : null;
    ergebnis[a.vorgang_id] = {
      formel: a.formel,
      dauer: a.dauer,
      bibVersion: a.bib_version,
      neuereVersion:
        aktuell !== null && a.bib_version !== null && aktuell > a.bib_version ? aktuell : null,
    };
  }
  return ergebnis;
}
