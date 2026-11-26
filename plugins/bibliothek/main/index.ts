import type { BautaktPlugin } from '@bautakt/kern';
import { bibliothekGlobal } from '../global/index.js';

export type { AufwandswertZeile, BibliothekDienste, KennwertZeile } from '../gemeinsam/typen.js';

/**
 * Plugin Bibliothek (E-23, E-51, E-52, E-58): globale Aufwandswerte und Kostenkennwerte im App-Datenordner.
 * Im Projekt selbst hat es keine Tabellen – die eingefrorenen Kopien legen die nutzenden
 * Plugins bei sich ab (z. B. Termine: `t_aufwand`).
 */
export const bibliothekPlugin: BautaktPlugin = {
  id: 'bibliothek',
  name: 'Bibliothek',
  version: '0.2.0',
  tabellenPraefix: 'bib_',
  migrationen: [],
  aktivieren() {
    // keine Projektdaten
  },
  global: bibliothekGlobal,
};
