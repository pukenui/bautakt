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

/** Exportauftrag an den Main-Prozess (Architektur 6). */
export interface ExportAuftragDaten {
  format: 'pdf' | 'png';
  /** ID der Druckansicht, z. B. "termine.balkenplan" */
  ansicht: string;
  parameter: Record<string, unknown>;
  /** PNG: Auflösungsfaktor 1–4 (Standard 2) */
  aufloesung?: number;
  /** Vorschlag für den Dateinamen ohne Endung */
  dateiname?: string;
}

/** Benannter Stand (Soll/Baseline oder automatische Sicherung), Abfrage `kern:staende`. */
export interface StandZeile {
  id: string;
  name: string;
  zeit: string; // UTC
  art: 'soll' | 'sicherung';
  notiz: string | null;
}

/** Ergebnis jedes Aufrufs: Fehler werden als Daten übertragen, nicht geworfen. */
export type Antwort<T> = { ok: true; wert: T } | { ok: false; fehler: string; code?: string };

/** Ergebnis eines Befehls für die Oberfläche: neu angelegte Zeilen (z. B. zum Auswählen). */
export interface BefehlAntwort {
  befehlId: string;
  eingefuegt: { tabelle: string; id: string }[];
}

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
  /** Globale Daten eines Plugins (z. B. Bibliothek) wurden geändert. */
  globalGeaendert: { plugin: string };
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
    ): Promise<Antwort<BefehlAntwort>>;
    rueckgaengig(): Promise<Antwort<boolean>>;
    wiederholen(): Promise<Antwort<boolean>>;
  };
  export: {
    /** Öffnet den Speichern-Dialog und erzeugt PDF/PNG aus einer Druckansicht. null = abgebrochen. */
    starten(auftrag: ExportAuftragDaten): Promise<Antwort<string | null>>;
  };
  abfrage<T = unknown>(plugin: string, name: string, argumente?: unknown): Promise<Antwort<T>>;
  /** Anhänge als Verweis auf Dateien (E-62). */
  anhang: {
    /** Datei-Dialog; liefert den gewählten Pfad oder null. */
    waehlen(): Promise<Antwort<string | null>>;
    /** Öffnet eine im Projekt eingetragene Dokument-/Bilddatei mit dem Standardprogramm. */
    oeffnen(pfad: string): Promise<Antwort<null>>;
  };
  /** Globale Daten im App-Datenordner (E-23), auch ohne geöffnetes Projekt. */
  global: {
    abfrage<T = unknown>(plugin: string, name: string, argumente?: unknown): Promise<Antwort<T>>;
    /** Änderung (versioniert, ohne Undo, E-51). */
    aktion<T = unknown>(plugin: string, name: string, daten: unknown): Promise<Antwort<T>>;
  };
  /** Abonniert eine Push-Nachricht; Rückgabe beendet das Abo. */
  on<K extends keyof Meldungen>(name: K, fn: (daten: Meldungen[K]) => void): () => void;
}
