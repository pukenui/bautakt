import { BautaktFehler, neueId, type BefehlDefinition, type Transaktion } from '@bautakt/kern';
import type { KennwertZeile } from '@bautakt/plugin-bibliothek/typen';
import {
  bezugsflaecheVorschlag,
  FLAECHEN_EINGABE,
  kostengruppe,
  type Flaeche,
} from '@bautakt/rechnen-kosten';
import { z } from 'zod';
import type { KostenZeile } from '../gemeinsam/typen.js';
import { einstellungLesen } from './daten.js';

const fehler = (meldung: string) => new BautaktFehler('BEFEHL_DATEN', meldung);
const id = z.string().min(1);
const text = (max = 4000) => z.string().trim().max(max);
const zahl = (was: string) => z.number({ error: `${was} muss eine Zahl sein` });
const nichtNegativ = (was: string) => zahl(was).min(0, `${was} darf nicht negativ sein`);
const positiv = (was: string) => zahl(was).positive(`${was} muss größer als 0 sein`);
const FLAECHEN = ['NUF', 'NRF', 'BGF', ...FLAECHEN_EINGABE] as const;

/** Kennwert-Felder, die bei einer Bibliothekskopie eingefroren sind (E-58). */
const EINGEFROREN = [
  'kkw_von',
  'kkw_mittel',
  'kkw_bis',
  'kkw_bezeichnung',
  'kkw_quelle',
  'kkw_stand',
  'kkw_stand_index',
] as const;

function zeileLesen(tx: Transaktion, zid: string): KostenZeile {
  const z = tx.eins<KostenZeile>('SELECT * FROM k_zeile WHERE id = ?', zid);
  if (!z) throw new BautaktFehler('NICHT_GEFUNDEN', 'Die Kostenzeile existiert nicht (mehr).');
  return z;
}

/** Fläche aus einer Bezugseinheit wie „m² BGF“ erkennen. */
export function flaecheAusEinheit(einheit: string): Flaeche | null {
  const m = /\b(NUF[1-7]?|NRF|BGF|KGF|TF|VF|AF|GF)\b/.exec(einheit);
  return m ? (m[1] as Flaeche) : null;
}

type Def = BefehlDefinition<never>;
const def = <T>(d: BefehlDefinition<T>) => d as unknown as Def;

/** Befehle des Kosten-Plugins; die Bibliothek wird erst beim Ausführen geholt. */
export function kostenBefehle(
  kennwert: () => ((id: string, version?: number) => KennwertZeile | undefined) | null,
): Def[] {
  return [
    def({
      name: 'einstellung.aendern',
      titel: 'Kosteneinstellungen ändern',
      schema: z.object({
        felder: z
          .object({
            mwst_satz: nichtNegativ('Der MwSt.-Satz').max(100),
            vorsteuerabzug: z.boolean().transform((b) => (b ? 1 : 0)),
            regionalfaktor: positiv('Der Regionalfaktor').max(10),
            regionalfaktor_quelle: text(),
            index_aktuell: positiv('Der aktuelle Index').nullable(),
            index_aktuell_stand: text(100),
            index_quelle: text(),
          })
          .partial()
          .strict(),
      }),
      ausfuehren(tx, d) {
        tx.aendern('k_einstellung', einstellungLesen(tx).id, d.felder);
      },
    }),
    def({
      name: 'flaeche.setzen',
      titel: 'Fläche DIN 277 eintragen',
      schema: z.object({
        kategorie: z.enum(FLAECHEN_EINGABE),
        wert_m2: nichtNegativ('Die Fläche').nullable(),
        quelle: text().optional(),
      }),
      ausfuehren(tx, d) {
        const alt = tx.eins<{ id: string; quelle: string }>(
          'SELECT id, quelle FROM k_flaeche WHERE kategorie = ?',
          d.kategorie,
        );
        const quelle = d.quelle ?? alt?.quelle ?? '';
        if (d.wert_m2 === null && !quelle) {
          if (alt) tx.loeschen('k_flaeche', alt.id);
          return;
        }
        if (alt) tx.aendern('k_flaeche', alt.id, { wert_m2: d.wert_m2, quelle });
        else
          tx.einfuegen('k_flaeche', {
            id: neueId(),
            kategorie: d.kategorie,
            wert_m2: d.wert_m2,
            quelle,
          });
      },
    }),
    def({
      name: 'zeile.anlegen',
      titel: 'Kostengruppe hinzufügen',
      schema: z.object({ kg: z.number().int() }),
      ausfuehren(tx, d) {
        if (!kostengruppe(d.kg)) throw fehler(`Die Kostengruppe ${d.kg} gibt es im Katalog nicht.`);
        if (tx.eins('SELECT 1 FROM k_zeile WHERE kg = ?', d.kg))
          throw fehler(`Für KG ${d.kg} gibt es bereits eine Zeile (eine Zeile je KG, E-55).`);
        const flaeche = bezugsflaecheVorschlag(d.kg);
        tx.einfuegen('k_zeile', {
          id: neueId(),
          kg: d.kg,
          einheit: `m² ${flaeche}`,
          menge_quelle: 'flaeche',
          flaeche,
          index_modus: 'index',
        });
      },
    }),
    def({
      name: 'zeile.aendern',
      titel: 'Kostenzeile ändern',
      schema: z.object({
        id,
        felder: z
          .object({
            bezeichnung: text(300),
            menge: nichtNegativ('Die Menge').nullable(),
            einheit: text(30),
            menge_quelle: z.enum(['manuell', 'flaeche', 'ifc']),
            flaeche: z.enum(FLAECHEN).nullable(),
            kkw_von: nichtNegativ('Von').nullable(),
            kkw_mittel: nichtNegativ('Mittel').nullable(),
            kkw_bis: nichtNegativ('Bis').nullable(),
            kkw_gewaehlt: nichtNegativ('KKW gewählt').nullable(),
            kkw_bezeichnung: text(300),
            kkw_quelle: text(),
            kkw_stand: text(100),
            kkw_stand_index: positiv('Der Index zum Stand').nullable(),
            index_modus: z.enum(['index', 'ohne', 'eigen']),
            index_faktor: positiv('Der Indexfaktor').max(10).nullable(),
            index_begruendung: text(),
            kommentar: text(),
            anmerkung: text(),
          })
          .partial()
          .strict(),
      }),
      ausfuehren(tx, d) {
        const z0 = zeileLesen(tx, d.id);
        if (z0.kkw_ref) {
          const gesperrt = EINGEFROREN.filter((k) => k in d.felder && d.felder[k] !== z0[k]);
          if (gesperrt.length)
            throw fehler(
              'Der Kennwert stammt aus der Bibliothek und ist eingefroren – erst „vom Bibliothekswert lösen“.',
            );
        }
        const f = { ...d.felder };
        const quelle = f.menge_quelle ?? z0.menge_quelle;
        if (quelle === 'flaeche' && !(f.flaeche ?? z0.flaeche))
          throw fehler('Für die Kopplung an eine Fläche fehlt die Fläche.');
        tx.aendern('k_zeile', z0.id, f);
      },
    }),
    def({
      name: 'zeile.kennwertUebernehmen',
      titel: 'Kennwert aus der Bibliothek übernehmen',
      schema: z.object({ id, kennwertId: id, version: z.number().int().positive() }),
      ausfuehren(tx, d) {
        const z0 = zeileLesen(tx, d.id);
        const holen = kennwert();
        if (!holen) throw fehler('Die Bibliothek ist nicht verfügbar.');
        const k = holen(d.kennwertId, d.version);
        if (!k) throw fehler('Der Kennwert ist in der Bibliothek nicht (mehr) vorhanden.');
        const flaeche = flaecheAusEinheit(k.einheit);
        tx.aendern('k_zeile', z0.id, {
          kkw_ref: k.id,
          kkw_ref_version: k.version,
          kkw_bezeichnung: k.bezeichnung,
          kkw_von: k.von,
          kkw_mittel: k.mittel,
          kkw_bis: k.bis,
          kkw_quelle: k.quelle,
          kkw_stand: k.stand,
          kkw_stand_index: k.index_stand,
          einheit: k.einheit,
          // gewählt = Mittel vorbelegen (E-58), außer es war schon ein eigener Wert gesetzt
          kkw_gewaehlt: z0.kkw_gewaehlt ?? k.mittel,
          ...(flaeche && z0.menge_quelle === 'flaeche' ? { flaeche } : {}),
        });
      },
    }),
    def({
      name: 'zeile.kennwertLoesen',
      titel: 'Kennwert vom Bibliothekswert lösen',
      schema: z.object({ id }),
      ausfuehren(tx, d) {
        zeileLesen(tx, d.id);
        tx.aendern('k_zeile', d.id, { kkw_ref: null, kkw_ref_version: null });
      },
    }),
    def({
      name: 'zeile.loeschen',
      titel: 'Kostenzeile löschen',
      schema: z.object({ ids: z.array(id).min(1) }),
      ausfuehren(tx, d) {
        for (const zid of d.ids) {
          zeileLesen(tx, zid);
          tx.loeschen('k_zeile', zid);
        }
      },
    }),
  ];
}
