import { createHash } from 'node:crypto';
import type { AgentKonfig } from './api.js';

/** Modell des Assistenten (E-99). */
export const MODELL = 'claude-opus-5-5';

const SYSTEM = `Du bist der Assistent in Bautakt, einer Windows-App für Termin- und Kostenplanung von Bauprojekten (Netzplan nach DIN 69900, Balkenpläne, Kosten nach DIN 276/277, Soll-Ist, IFC-Modelle). Du hilfst Bauingenieurinnen und Bauingenieuren mit dem gerade geöffneten Projekt.

So arbeitest du:
- Antworte auf Deutsch, knapp und fachlich. Fachbegriffe nach Norm: FAZ, FEZ, SAZ, SEZ, GP, FP, EA/AA/EE/AE, AT/KT, KG, BGF, NUF, NRF, TF, VF, KGF, AF, GF, KKW. Zahlen und Datum im deutschen Format (1.234,56 €; TT.MM.JJJJ).
- Lies die Projektdaten mit den Werkzeugen, bevor du Aussagen über das Projekt machst. Rate keine Werte; sag, wenn etwas fehlt.
- Rechenwege zeigst du als Formelzeile, z. B. „650 m² × 0,50 h/m² = 325 h ÷ (4 × 8 h) = 10,2 → 11 AT“.
- Du änderst nie selbst etwas. Änderungen schlägst du mit „aenderung_vorschlagen“ vor: Hole dir vorher mit „befehle_beschreiben“ den passenden Befehl und sein Schema und verwende IDs aus den gelesenen Daten. Der Nutzer sieht den Vorschlag und führt ihn aus oder verwirft ihn; du erfährst das mit seiner nächsten Nachricht. Schlage zusammengehörige Änderungen als einzelne Vorschläge in sinnvoller Reihenfolge vor.
- Texte für Freitextfelder (Quelle/Annahme, Anmerkung, Begründung, Risiko, Kommentar) schlägst du nur vor, wenn der Nutzer ausdrücklich darum bittet. Sie werden als „[KI-Entwurf]“ gekennzeichnet; der Nutzer prüft und überarbeitet sie selbst. Schreibe sie sachlich und kurz, ohne erfundene Quellen.
- Gib keine Normtexte (DIN-Wortlaut) wieder und erfinde keine Kennwerte oder BKI-Daten; Kennwerte trägt der Nutzer mit Quelle ein.`;

const objekt = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});

/** Eigene Werkzeuge: Bautakt führt sie lokal aus (E-97). */
export const WERKZEUGE: AgentKonfig['tools'] = [
  {
    type: 'custom',
    name: 'projekt_ueberblick',
    description:
      'Überblick über das geöffnete Projekt: Name, Terminpläne (IDs, Projektstart, Soll-Ende), Kostensummen, IFC-Modelle. Zuerst aufrufen.',
    input_schema: objekt({}),
  },
  {
    type: 'custom',
    name: 'plan_lesen',
    description:
      'Einen Terminplan lesen: Vorgänge mit Nr., Name, Typ, Dauer (AT), Gliederungsebene, Quelle/Annahme, Gewerk, berechneten Terminen (FAZ, FEZ, SAZ, SEZ, GP, FP, Anfang, Ende, kritisch) und Beziehungen (EA/AA/EE/AE mit Abstand).',
    input_schema: objekt(
      { plan_id: { type: 'string', description: 'ID aus projekt_ueberblick' } },
      ['plan_id'],
    ),
  },
  {
    type: 'custom',
    name: 'kosten_lesen',
    description:
      'Kostenplanung lesen: Kostenzeilen je KG (Menge, Einheit, Mengenquelle, KKW, Faktor, Kosten, Hinweise), Flächen nach DIN 277, Summen netto/brutto.',
    input_schema: objekt({}),
  },
  {
    type: 'custom',
    name: 'sollist_lesen',
    description:
      'Kosten-Soll-Ist lesen: Stufen, Aufträge, Rechnungen, Prognose und Abweichung je KG.',
    input_schema: objekt({
      bezug: {
        type: 'string',
        enum: ['rahmen', 'schaetzung', 'berechnung', 'anschlag', 'feststellung'],
        description: 'Bezugsstufe, Standard berechnung',
      },
    }),
  },
  {
    type: 'custom',
    name: 'modell_lesen',
    description:
      'IFC-Modelle lesen: Modelle, Bauteile je Klasse, Mengen je Kostengruppe (aus Regeln und Zuordnungen) und Flächen je DIN-277-Kategorie aus den Räumen.',
    input_schema: objekt({}),
  },
  {
    type: 'custom',
    name: 'befehle_beschreiben',
    description:
      'Liste der Befehle eines Bereichs mit Titel und JSON-Schema der Daten – nötig, bevor du eine Änderung vorschlägst.',
    input_schema: objekt(
      { plugin: { type: 'string', enum: ['termine', 'kosten', 'bim'], description: 'Bereich' } },
      ['plugin'],
    ),
  },
  {
    type: 'custom',
    name: 'aenderung_vorschlagen',
    description:
      'Eine Änderung als Befehl vorschlagen. Bautakt prüft die Daten gegen das Schema und zeigt den Vorschlag dem Nutzer; ausgeführt wird erst nach seiner Bestätigung.',
    input_schema: objekt(
      {
        plugin: { type: 'string', enum: ['termine', 'kosten', 'bim'] },
        befehl: { type: 'string', description: 'Name des Befehls, z. B. vorgang.aendern' },
        daten: { type: 'object', description: 'Daten nach dem Schema des Befehls' },
        beschreibung: {
          type: 'string',
          description: 'Ein Satz für den Nutzer: was ändert sich und warum',
        },
      },
      ['plugin', 'befehl', 'daten', 'beschreibung'],
    ),
  },
];

export const AGENT_KONFIG: AgentKonfig = {
  name: 'Bautakt-Assistent',
  model: MODELL,
  system: SYSTEM,
  tools: WERKZEUGE,
};

/** Fingerabdruck der Konfiguration: ändert sie sich, wird der Agent aktualisiert (neue Version). */
export const KONFIG_HASH = createHash('sha256')
  .update(JSON.stringify(AGENT_KONFIG))
  .digest('hex')
  .slice(0, 16);
