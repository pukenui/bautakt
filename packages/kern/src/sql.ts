import { BautaktFehler } from './fehler.js';

/** SQLite-Werte, wie sie in Plugin-Tabellen gespeichert werden (bool als 0/1, JSON als Text). */
export type Wert = string | number | null;
export type Zeile = Record<string, Wert>;

const BEZEICHNER = /^[a-z_][a-z0-9_]*$/;

/** Prüft Tabellen-/Spaltennamen, damit sie gefahrlos in SQL eingesetzt werden können. */
export function pruefeBezeichner(name: string): string {
  if (!BEZEICHNER.test(name)) {
    throw new BautaktFehler('ZUGRIFF', `Ungültiger Bezeichner: „${name}“`);
  }
  return name;
}
