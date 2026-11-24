/**
 * IPC-Vertrag zwischen Renderer und Main (nur Typen, keine Laufzeit-Abhängigkeiten).
 * Der Preload stellt genau diese API als `window.bautakt` bereit.
 */

export interface UndoStatusDaten {
  rueckgaengig: string | null;
  wiederholen: string | null;
}

export interface ProjektStatus {
  pfad: string;
  projektname: string;
  erstellt: string;
  geaendert: string;
  schreibgeschuetzt: boolean;
  /** Beschreibung der fremden Sperre, wenn schreibgeschützt geöffnet. */
  gesperrtVon: string | null;
  undo: UndoStatusDaten;
}

/** Ergebnis jedes Aufrufs: Fehler werden als Daten übertragen, nicht geworfen. */
export type Antwort<T> = { ok: true; wert: T } | { ok: false; fehler: string; code?: string };

/** Push-Nachrichten Main → Renderer. */
export interface Meldungen {
  /** Projekt geöffnet/geschlossen/geändert; null = kein Projekt offen. */
  status: ProjektStatus | null;
  /** Daten wurden durch einen Befehl, Undo oder Redo geändert. */
  datenGeaendert: { plugin: string; tabellen: string[] };
  /** Hinweis für die Statusleiste (z. B. „Automatisch gespeichert“). */
  hinweis: { text: string; art: 'info' | 'warnung' | 'fehler' };
  /** Menüpunkt gewählt; die Oberfläche führt die Aktion aus. */
  menue: MenueAktion;
}

export type MenueAktion =
  | 'neu'
  | 'oeffnen'
  | 'speichern'
  | 'speichernUnter'
  | 'jsonExportieren'
  | 'schliessen'
  | 'rueckgaengig'
  | 'wiederholen'
  | 'hilfe';

export interface BautaktApi {
  projekt: {
    status(): Promise<ProjektStatus | null>;
    /** Öffnet Speichern-Dialog und legt ein neues Projekt an. null = abgebrochen. */
    neu(): Promise<Antwort<ProjektStatus | null>>;
    /** Öffnet Datei-Dialog. null = abgebrochen. */
    oeffnen(): Promise<Antwort<ProjektStatus | null>>;
    speichern(): Promise<Antwort<ProjektStatus | null>>;
    speichernUnter(): Promise<Antwort<ProjektStatus | null>>;
    jsonExportieren(): Promise<Antwort<string | null>>;
    schliessen(): Promise<Antwort<null>>;
  };
  befehl: {
    ausfuehren(
      plugin: string,
      name: string,
      daten: unknown,
      grund?: string,
    ): Promise<Antwort<null>>;
    rueckgaengig(): Promise<Antwort<boolean>>;
    wiederholen(): Promise<Antwort<boolean>>;
  };
  abfrage<T = unknown>(plugin: string, name: string, argumente?: unknown): Promise<Antwort<T>>;
  /** Abonniert eine Push-Nachricht; Rückgabe beendet das Abo. */
  on<K extends keyof Meldungen>(name: K, fn: (daten: Meldungen[K]) => void): () => void;
}
