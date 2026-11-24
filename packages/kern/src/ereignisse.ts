import type { Aenderung, BefehlAktion } from './befehle.js';

/** Ereignisse des Kerns. Plugins können eigene Ereignisse (z. B. „vorgang.geaendert“) ergänzen. */
export interface KernEreignisse {
  'befehl.ausgefuehrt': {
    befehlId: string;
    plugin: string;
    befehl: string;
    aktion: BefehlAktion;
    aenderungen: readonly Aenderung[];
  };
  'projekt.gespeichert': { pfad: string; automatisch: boolean };
}

type Abo = (daten: never) => void;

/** Typisierter Ereignisbus. Fehler einzelner Abonnenten stoppen die anderen nicht. */
export class Ereignisbus<E extends object = KernEreignisse & Record<string, unknown>> {
  private readonly abos = new Map<keyof E, Set<Abo>>();

  constructor(private readonly fehler: (e: unknown) => void = (e) => console.error(e)) {}

  on<K extends keyof E>(name: K, fn: (daten: E[K]) => void): () => void {
    let set = this.abos.get(name);
    if (!set) this.abos.set(name, (set = new Set()));
    set.add(fn as Abo);
    return () => set.delete(fn as Abo);
  }

  emit<K extends keyof E>(name: K, daten: E[K]): void {
    for (const fn of [...(this.abos.get(name) ?? [])]) {
      try {
        (fn as (d: E[K]) => void)(daten);
      } catch (e) {
        this.fehler(e);
      }
    }
  }

  leeren(): void {
    this.abos.clear();
  }
}
