import { neueId, type StandHandler, type Transaktion, type Zeile } from '@bautakt/kern';
import { kostenDatenLaden, type KostenUmgebung } from './daten.js';

const TABELLEN = [
  'k_einstellung',
  'k_flaeche',
  'k_zeile',
  'k_stufe',
  'k_auftrag',
  'k_rechnung',
  'k_abweichung',
] as const;

function spalten(tx: Transaktion, tabelle: string): Set<string> {
  return new Set(
    tx
      .lesen<{ name: string }>(`SELECT name FROM pragma_table_info('${tabelle}')`)
      .map((s) => s.name),
  );
}

/**
 * Stände des Plugins „kosten“ (Architektur 3.3): Kopie von Einstellungen, Flächen,
 * Kostenzeilen (mit Kosten zum Zeitpunkt des Stands), Stufen, Aufträgen, Rechnungen und Ursachen.
 */
export const kostenStaende = (umgebung: KostenUmgebung): StandHandler => ({
  speichern(tx, standId) {
    // Menge und Kosten zum Zeitpunkt des Stands festhalten (auch Modellmengen, E-93)
    const k = kostenDatenLaden(tx, umgebung).zeilen;
    const kosten = new Map(k.map((z) => [z.id, z.kosten]));
    const menge = new Map(k.map((z) => [z.id, z.mengeWirksam]));
    const flaechen = kostenDatenLaden(tx, umgebung).flaechen;
    for (const tabelle of TABELLEN) {
      const erlaubt = spalten(tx, `${tabelle}_stand`);
      for (const zeile of tx.lesen<Zeile & { id: string }>(`SELECT * FROM ${tabelle}`)) {
        const { id, ...rest } = zeile;
        const kopie: Zeile & { id: string } = { id: neueId(), stand_id: standId, orig_id: id };
        for (const [k, w] of Object.entries(rest)) if (erlaubt.has(k)) kopie[k] = w;
        if (tabelle === 'k_zeile') {
          kopie['kosten'] = kosten.get(id) ?? null;
          if (rest['menge_quelle'] === 'ifc') kopie['menge'] = menge.get(id) ?? null;
        }
        // Flächen aus dem Modell mit dem Wert zum Zeitpunkt des Stands (E-95)
        if (tabelle === 'k_flaeche' && rest['aus_modell'] === 1)
          kopie['wert_m2'] = flaechen[rest['kategorie'] as keyof typeof flaechen] ?? null;
        tx.einfuegen(`${tabelle}_stand`, kopie);
      }
    }
  },

  laden(tx, standId) {
    // Stände von vor dem Kosten-Plugin enthalten keine Kostendaten → Kosten unverändert lassen
    if (!tx.eins('SELECT 1 FROM k_einstellung_stand WHERE stand_id = ?', standId)) return;
    for (const tabelle of [...TABELLEN].reverse())
      for (const { id } of tx.lesen<{ id: string }>(`SELECT id FROM ${tabelle}`))
        tx.loeschen(tabelle, id);
    for (const tabelle of TABELLEN) {
      const erlaubt = spalten(tx, tabelle);
      for (const zeile of tx.lesen<Zeile>(
        `SELECT * FROM ${tabelle}_stand WHERE stand_id = ?`,
        standId,
      )) {
        const neu: Zeile & { id: string } = { id: String(zeile['orig_id']) };
        for (const [k, w] of Object.entries(zeile)) if (k !== 'id' && erlaubt.has(k)) neu[k] = w;
        tx.einfuegen(tabelle, neu);
      }
    }
  },

  loeschen(tx, standId) {
    for (const tabelle of TABELLEN)
      for (const { id } of tx.lesen<{ id: string }>(
        `SELECT id FROM ${tabelle}_stand WHERE stand_id = ?`,
        standId,
      ))
        tx.loeschen(`${tabelle}_stand`, id);
  },
});
