import { useSyncExternalStore } from 'react';

/** Ansichtszustand des Viewers (E-89: nicht im Projekt gespeichert, übersteht aber Reiterwechsel). */
export type Schnitt =
  | { art: 'aus' }
  | { art: 'geschoss'; modellId: string; geschossId: string }
  | { art: 'frei'; achse: 'x' | 'y' | 'z'; lage: number; umkehren: boolean };

export interface Auswahl {
  modellId: string;
  expressId: number;
}

export interface AnsichtZustand {
  /** ausgeblendete Bauteile: `${modellId}:${expressId}` */
  versteckt: ReadonlySet<string>;
  /** ausgeblendete Modelle */
  modelleAus: ReadonlySet<string>;
  auswahl: Auswahl | null;
  /** aufgeklappte Knoten der Bauteilliste */
  offen: ReadonlySet<string>;
  schnitt: Schnitt;
  messen: boolean;
  /** Bauteilliste nach Geschoss oder nach Kostengruppe (B2) */
  gliederung: 'geschoss' | 'kg';
}

export const schluessel = (modellId: string, expressId: number) => `${modellId}:${expressId}`;

let zustand: AnsichtZustand = {
  versteckt: new Set(),
  modelleAus: new Set(),
  auswahl: null,
  offen: new Set(),
  schnitt: { art: 'aus' },
  messen: false,
  gliederung: 'geschoss',
};
const abonnenten = new Set<() => void>();

export function setzen(teil: Partial<AnsichtZustand>): void {
  zustand = { ...zustand, ...teil };
  abonnenten.forEach((f) => f());
}

export function lesen(): AnsichtZustand {
  return zustand;
}

function abonnieren(f: () => void) {
  abonnenten.add(f);
  return () => void abonnenten.delete(f);
}

export function useAnsicht(): AnsichtZustand {
  return useSyncExternalStore(abonnieren, lesen);
}
