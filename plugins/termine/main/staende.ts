import { neueId, type StandHandler, type Transaktion, type Zeile } from '@bautakt/kern';
import { planDatenLaden } from './daten.js';

/** Datentabellen des Plugins, die ein Stand kopiert (Architektur 3.3). */
const TABELLEN = ['t_plan', 't_kalender', 't_ruhezeit', 't_vorgang', 't_beziehung'] as const;

/** Spalten einer Tabelle (ohne Berechnung, nur Lesen über PRAGMA). */
function spalten(tx: Transaktion, tabelle: string): string[] {
  return tx
    .lesen<{ name: string }>(`SELECT name FROM pragma_table_info('${tabelle}')`)
    .map((s) => s.name);
}

/**
 * Stände des Plugins „termine“: Kopie aller Pläne mit Vorgängen, Beziehungen, Kalendern und
 * Ruhezeiten; Vorgänge zusätzlich mit ihren Rechenergebnissen zum Zeitpunkt des Stands.
 */
export const termineStaende: StandHandler = {
  speichern(tx, standId) {
    // Rechenergebnisse je Plan einfrieren
    const ergebnisse = new Map<string, Zeile>();
    const planErgebnis = new Map<string, Zeile>();
    for (const { id } of tx.lesen<{ id: string }>('SELECT id FROM t_plan')) {
      const d = planDatenLaden(tx, id);
      if (!d.berechnung.ok) continue;
      planErgebnis.set(id, {
        projektende: d.berechnung.projektende,
        projektende_datum: d.berechnung.projektendeDatum,
      });
      for (const [vid, t] of Object.entries(d.berechnung.termine)) {
        ergebnisse.set(vid, {
          faz: t.faz,
          fez: t.fez,
          saz: t.saz,
          sez: t.sez,
          gp: t.gp,
          fp: t.fp,
          kritisch: t.kritisch ? 1 : 0,
          anfang: t.anfang,
          ende: t.ende,
        });
      }
    }

    for (const tabelle of TABELLEN) {
      const ziel = `${tabelle}_stand`;
      const erlaubt = new Set(spalten(tx, ziel));
      for (const zeile of tx.lesen<Zeile & { id: string }>(`SELECT * FROM ${tabelle}`)) {
        const { id, ...rest } = zeile;
        const kopie: Zeile & { id: string } = { id: neueId(), stand_id: standId, orig_id: id };
        for (const [k, w] of Object.entries(rest)) if (erlaubt.has(k)) kopie[k] = w;
        const extra =
          tabelle === 't_vorgang'
            ? ergebnisse.get(id)
            : tabelle === 't_plan'
              ? planErgebnis.get(id)
              : undefined;
        Object.assign(kopie, extra ?? {});
        tx.einfuegen(ziel, kopie);
      }
    }
  },

  laden(tx, standId) {
    // Aktuelle Daten entfernen …
    for (const tabelle of [...TABELLEN].reverse()) {
      for (const { id } of tx.lesen<{ id: string }>(`SELECT id FROM ${tabelle}`))
        tx.loeschen(tabelle, id);
    }
    // … und die Kopie mit den ursprünglichen IDs wiederherstellen
    for (const tabelle of TABELLEN) {
      const erlaubt = new Set(spalten(tx, tabelle));
      for (const zeile of tx.lesen<Zeile>(
        `SELECT * FROM ${tabelle}_stand WHERE stand_id = ?`,
        standId,
      )) {
        const neu: Zeile & { id: string } = { id: String(zeile['orig_id']) };
        for (const [k, w] of Object.entries(zeile)) {
          if (k !== 'id' && erlaubt.has(k)) neu[k] = w;
        }
        tx.einfuegen(tabelle, neu);
      }
    }
  },

  loeschen(tx, standId) {
    for (const tabelle of TABELLEN) {
      for (const { id } of tx.lesen<{ id: string }>(
        `SELECT id FROM ${tabelle}_stand WHERE stand_id = ?`,
        standId,
      )) {
        tx.loeschen(`${tabelle}_stand`, id);
      }
    }
  },
};
