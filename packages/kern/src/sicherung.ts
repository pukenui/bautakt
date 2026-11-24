import fs from 'node:fs';
import type { Projektdatei } from './projektdatei.js';

export const ANZAHL_SICHERUNGEN = 5;

export function sicherungsPfad(dateipfad: string, nr: number): string {
  return `${dateipfad}.bak${nr}`;
}

/**
 * Sicherungskopie beim Öffnen (E-41): bak4 → bak5, …, bak1 → bak2, dann aktuelle Datei → bak1.
 * Die Kopie wird über SQLite geschrieben (VACUUM INTO) und enthält damit auch Daten aus dem WAL.
 */
export function sicherungAnlegen(datei: Projektdatei, anzahl = ANZAHL_SICHERUNGEN): string {
  const pfad = datei.pfad;
  fs.rmSync(sicherungsPfad(pfad, anzahl), { force: true });
  for (let nr = anzahl - 1; nr >= 1; nr--) {
    const von = sicherungsPfad(pfad, nr);
    if (fs.existsSync(von)) fs.renameSync(von, sicherungsPfad(pfad, nr + 1));
  }
  const ziel = sicherungsPfad(pfad, 1);
  datei.kopieSchreiben(ziel);
  return ziel;
}
