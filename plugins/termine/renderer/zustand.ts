import { useSyncExternalStore } from 'react';

/** Anzeigezustand des Plugins, geteilt zwischen den Ansichten (nicht Teil der Projektdaten). */
export interface Zustand {
  planId: string | null;
  /** Termine als Datum oder als AT-Zeitpunkte (E-12). */
  zeitanzeige: 'datum' | 'at';
  /** Vorgänger-Spalte kurz (`1EA+10`) oder lang (`1 Ende-Anfang +10 Arbeitstage`), E-28. */
  vorgaengerForm: 'kurz' | 'lang';
  zoom: 'tag' | 'woche' | 'monat' | 'quartal';
  /** Zugeklappte Sammelvorgänge je Plan (Rahmenterminplan durch Zuklappen, E-14). */
  zugeklappt: Record<string, string[]>;
  netzZoom: number;
  auswahl: string | null;
  /** Soll-Vergleich je Plan: Stand-ID, null = aus; fehlt = jüngster Soll-Stand (E-46). */
  vergleich: Record<string, string | null>;
}

const SPEICHER = 'bautakt.termine.anzeige';

function laden(): Zustand {
  const standard: Zustand = {
    planId: null,
    zeitanzeige: 'datum',
    vorgaengerForm: 'kurz',
    zoom: 'woche',
    zugeklappt: {},
    netzZoom: 1,
    auswahl: null,
    vergleich: {},
  };
  try {
    const gespeichert = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Partial<Zustand>;
    return { ...standard, ...gespeichert, auswahl: null };
  } catch {
    return standard;
  }
}

let zustand: Zustand = laden();
const hoerer = new Set<() => void>();

export function setzen(teil: Partial<Zustand> | ((z: Zustand) => Partial<Zustand>)): void {
  zustand = { ...zustand, ...(typeof teil === 'function' ? teil(zustand) : teil) };
  const { auswahl: _a, ...dauerhaft } = zustand;
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(dauerhaft));
  } catch {
    // Speicher nicht verfügbar – Anzeige funktioniert trotzdem
  }
  hoerer.forEach((h) => h());
}

export function useZustand(): Zustand {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h);
      return () => hoerer.delete(h);
    },
    () => zustand,
  );
}

export function zuklappen(planId: string, vorgangId: string, zu: boolean): void {
  setzen((z) => {
    const liste = new Set(z.zugeklappt[planId] ?? []);
    if (zu) liste.add(vorgangId);
    else liste.delete(vorgangId);
    return { zugeklappt: { ...z.zugeklappt, [planId]: [...liste] } };
  });
}
