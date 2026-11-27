/** Datentypen des Claude-Plugins (E-97–E-100), gemeinsam für Main und Renderer. */

/** Änderungsvorschlag von Claude: ein Befehl, der erst nach Bestätigung läuft (E-97). */
export interface Vorschlag {
  nr: number;
  plugin: string;
  befehl: string;
  /** Titel des Befehls, z. B. „Vorgang ändern“ */
  titel: string;
  beschreibung: string;
  daten: unknown;
  /** Freitextfelder mit KI-Entwurf (E-98) */
  kiEntwurf: string[];
  zustand: 'offen' | 'ausgefuehrt' | 'verworfen';
}

export interface Eintrag {
  nr: number;
  art: 'nutzer' | 'claude' | 'werkzeug' | 'vorschlag' | 'fehler' | 'hinweis';
  text: string;
  /** UTC */
  zeit: string;
  vorschlag?: Vorschlag;
}

export interface ClaudeStatus {
  /** Verschlüsselung des Betriebssystems verfügbar (für den API-Schlüssel) */
  verschluesselung: boolean;
  schluessel: boolean;
  zustimmung: boolean;
  laeuft: boolean;
  sitzung: boolean;
  modell: string;
  /** Kosten der Sitzung zu Listenpreisen, falls gemeldet, z. B. „0,42 USD“ */
  kosten: string | null;
  /** Simulierte Sitzung (nur Tests und Entwicklung) */
  simuliert: boolean;
}

export interface Verlauf {
  eintraege: Eintrag[];
  laeuft: boolean;
}
