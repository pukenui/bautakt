import {
  BautaktFehler,
  jetztUtc,
  neueId,
  type BefehlDefinition,
  type Transaktion,
} from '@bautakt/kern';
import { tagVonDatum } from '@bautakt/rechnen-kalender';
import { FEST_STUFEN, KOSTEN_URSACHEN, kostengruppe } from '@bautakt/rechnen-kosten';
import { z } from 'zod';
import type { AuftragZeile } from '../gemeinsam/typen.js';
import { kostenDatenLaden, type KostenUmgebung } from './daten.js';

const fehler = (meldung: string) => new BautaktFehler('BEFEHL_DATEN', meldung);
const id = z.string().min(1);
const text = (max = 4000) => z.string().trim().max(max);
const kg = z
  .number()
  .int()
  .refine((k) => !!kostengruppe(k), 'Die Kostengruppe gibt es im Katalog nicht (E-55)');
const betrag = z
  .number({ error: 'Der Betrag muss eine Zahl sein' })
  .refine((b) => Number.isFinite(b) && Math.abs(b) < 1e12, 'Ungültiger Betrag');
const datum = z
  .string()
  .refine((d) => {
    try {
      tagVonDatum(d);
      return true;
    } catch {
      return false;
    }
  }, 'Ungültiges Datum')
  .nullable();
/** Anhang = absoluter Pfad (Verweis, E-62) */
const anhang = z
  .string()
  .trim()
  .max(4000)
  .refine((p) => /^([a-zA-Z]:[\\/]|\\\\)/.test(p), 'Der Anhang braucht einen vollständigen Pfad')
  .nullable();

const auftragFelder = z.object({
  kg,
  bezeichnung: text(300).default(''),
  auftragnehmer: text(300).default(''),
  betrag_netto: betrag,
  datum: datum.default(null),
  beleg_nr: text(100).default(''),
  anhang: anhang.default(null),
  anmerkung: text().default(''),
});
const rechnungFelder = z.object({
  kg: kg.optional(),
  auftrag_id: id.nullable().default(null),
  rechnungssteller: text(300).default(''),
  betrag_netto: betrag,
  datum: datum.default(null),
  beleg_nr: text(100).default(''),
  anhang: anhang.default(null),
  anmerkung: text().default(''),
});

function auftragLesen(tx: Transaktion, aid: string): AuftragZeile {
  const a = tx.eins<AuftragZeile>('SELECT * FROM k_auftrag WHERE id = ?', aid);
  if (!a) throw new BautaktFehler('NICHT_GEFUNDEN', 'Der Auftrag existiert nicht (mehr).');
  return a;
}

/** KG einer Rechnung: die des Auftrags, sonst die angegebene. */
function rechnungKg(
  tx: Transaktion,
  d: { kg?: number | undefined; auftrag_id: string | null },
): number {
  if (d.auftrag_id) return auftragLesen(tx, d.auftrag_id).kg;
  if (d.kg === undefined) throw fehler('Ohne Auftrag braucht die Rechnung eine Kostengruppe.');
  return d.kg;
}

type Def = BefehlDefinition<never>;
const def = <T>(d: BefehlDefinition<T>) => d as unknown as Def;

/** Befehle für Soll-Ist (E-33, E-60–E-63). */
export const sollistBefehle = (umgebung: KostenUmgebung): Def[] => [
  def({
    name: 'stufe.festschreiben',
    titel: 'Kostenstufe festschreiben',
    schema: z.object({ stufe: z.enum(FEST_STUFEN) }),
    ausfuehren(tx, d) {
      // maßgebende Zeilen der Planung: Zeilen mit Kosten, die nicht von Unterzeilen überdeckt sind
      const k = kostenDatenLaden(tx, umgebung);
      const ueberdeckt = new Set(k.baum.filter((b) => b.ausUnterzeilen).map((b) => b.kg));
      const werte = k.zeilen.filter((z) => z.kosten !== null && !ueberdeckt.has(z.kg));
      if (!werte.length) throw fehler('Die Planung enthält noch keine Kosten zum Festschreiben.');
      for (const s of tx.lesen<{ id: string }>('SELECT id FROM k_stufe WHERE stufe = ?', d.stufe))
        tx.loeschen('k_stufe', s.id);
      const zeit = jetztUtc();
      for (const z of werte)
        tx.einfuegen('k_stufe', {
          id: neueId(),
          kg: z.kg,
          stufe: d.stufe,
          betrag_netto: z.kosten,
          herkunft: 'planung',
          zeit,
        });
    },
  }),
  def({
    name: 'stufe.setzen',
    titel: 'Kostenstufe von Hand korrigieren',
    schema: z.object({ kg, stufe: z.enum(FEST_STUFEN), betrag: betrag.nullable() }),
    ausfuehren(tx, d) {
      const alt = tx.eins<{ id: string }>(
        'SELECT id FROM k_stufe WHERE kg = ? AND stufe = ?',
        d.kg,
        d.stufe,
      );
      if (d.betrag === null) {
        if (alt) tx.loeschen('k_stufe', alt.id);
        return;
      }
      const felder = { betrag_netto: d.betrag, herkunft: 'hand', zeit: jetztUtc() };
      if (alt) tx.aendern('k_stufe', alt.id, felder);
      else tx.einfuegen('k_stufe', { id: neueId(), kg: d.kg, stufe: d.stufe, ...felder });
    },
  }),
  def({
    name: 'auftrag.anlegen',
    titel: 'Auftrag erfassen',
    schema: auftragFelder,
    ausfuehren(tx, d) {
      tx.einfuegen('k_auftrag', { id: neueId(), ...d });
    },
  }),
  def({
    name: 'auftrag.aendern',
    titel: 'Auftrag ändern',
    schema: auftragFelder.extend({ id }),
    ausfuehren(tx, { id: aid, ...d }) {
      const alt = auftragLesen(tx, aid);
      tx.aendern('k_auftrag', aid, d);
      // zugeordnete Rechnungen folgen der KG des Auftrags
      if (d.kg !== alt.kg)
        for (const r of tx.lesen<{ id: string }>(
          'SELECT id FROM k_rechnung WHERE auftrag_id = ?',
          aid,
        ))
          tx.aendern('k_rechnung', r.id, { kg: d.kg });
    },
  }),
  def({
    name: 'auftrag.loeschen',
    titel: 'Auftrag löschen',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      auftragLesen(tx, d.id);
      // Rechnungen bleiben erhalten (mit ihrer KG), nur die Zuordnung entfällt
      for (const r of tx.lesen<{ id: string }>(
        'SELECT id FROM k_rechnung WHERE auftrag_id = ?',
        d.id,
      ))
        tx.aendern('k_rechnung', r.id, { auftrag_id: null });
      tx.loeschen('k_auftrag', d.id);
    },
  }),
  def({
    name: 'rechnung.anlegen',
    titel: 'Rechnung erfassen',
    schema: rechnungFelder,
    ausfuehren(tx, d) {
      tx.einfuegen('k_rechnung', { id: neueId(), ...d, kg: rechnungKg(tx, d) });
    },
  }),
  def({
    name: 'rechnung.aendern',
    titel: 'Rechnung ändern',
    schema: rechnungFelder.extend({ id }),
    ausfuehren(tx, { id: rid, ...d }) {
      if (!tx.eins('SELECT 1 FROM k_rechnung WHERE id = ?', rid))
        throw new BautaktFehler('NICHT_GEFUNDEN', 'Die Rechnung existiert nicht (mehr).');
      tx.aendern('k_rechnung', rid, { ...d, kg: rechnungKg(tx, d) });
    },
  }),
  def({
    name: 'rechnung.loeschen',
    titel: 'Rechnung löschen',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      if (!tx.eins('SELECT 1 FROM k_rechnung WHERE id = ?', d.id))
        throw new BautaktFehler('NICHT_GEFUNDEN', 'Die Rechnung existiert nicht (mehr).');
      tx.loeschen('k_rechnung', d.id);
    },
  }),
  def({
    name: 'abweichung.setzen',
    titel: 'Abweichungsursache setzen',
    schema: z.object({
      kg,
      ursache: z.enum(Object.keys(KOSTEN_URSACHEN) as [string, ...string[]]).nullable(),
      text: text(),
    }),
    ausfuehren(tx, d) {
      const alt = tx.eins<{ id: string }>('SELECT id FROM k_abweichung WHERE kg = ?', d.kg);
      if (d.ursache === null && !d.text) {
        if (alt) tx.loeschen('k_abweichung', alt.id);
        return;
      }
      if (alt) tx.aendern('k_abweichung', alt.id, { ursache: d.ursache, text: d.text });
      else
        tx.einfuegen('k_abweichung', { id: neueId(), kg: d.kg, ursache: d.ursache, text: d.text });
    },
  }),
];
