import type { BefehlBeschreibung } from '@bautakt/kern';
import type { Vorschlag } from '../gemeinsam/typen.js';

/*
 * Werkzeuge des Assistenten (E-97): lesen über die Abfragen der Plugins, schlagen Befehle vor.
 * Sie laufen lokal im Main-Prozess; Claude erhält nur das Ergebnis als Text.
 */

/** Was die Werkzeuge vom Projekt brauchen (im Plugin aus dem MainKontext gebildet). */
export interface WerkzeugUmgebung {
  projektName(): string;
  abfrage(plugin: string, name: string, argumente?: unknown): unknown;
  befehle(): BefehlBeschreibung[];
  pruefen(
    plugin: string,
    name: string,
    daten: unknown,
  ): { ok: true } | { ok: false; fehler: string };
  vorschlagen(v: Omit<Vorschlag, 'nr' | 'zustand'>): number;
}

export interface WerkzeugErgebnis {
  text: string;
  fehler?: boolean;
}

/** Bereiche, deren Befehle Claude vorschlagen darf. */
const BEREICHE = new Set(['termine', 'kosten', 'bim']);

/** Freitextfelder, deren Inhalt als KI-Entwurf gekennzeichnet wird (E-98). */
export const FREITEXT_FELDER = new Set([
  'quelle_annahme',
  'anmerkung',
  'risiko',
  'kommentar',
  'begruendung',
  'index_begruendung',
  'notiz',
  'text',
  'quelle',
]);

export const KI_KENNZEICHEN = '[KI-Entwurf] ';

/**
 * Kennzeichnet Texte in Freitextfeldern mit „[KI-Entwurf] “ (E-98) – auch verschachtelt.
 * Liefert die Daten und die Namen der gekennzeichneten Felder.
 */
export function kiEntwuerfeKennzeichnen(daten: unknown): { daten: unknown; felder: string[] } {
  const felder: string[] = [];
  const gehen = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(gehen);
    if (x && typeof x === 'object') {
      const neu: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if (
          FREITEXT_FELDER.has(k) &&
          typeof v === 'string' &&
          v.trim() &&
          !v.startsWith(KI_KENNZEICHEN)
        ) {
          neu[k] = KI_KENNZEICHEN + v.trim();
          felder.push(k);
        } else neu[k] = gehen(v);
      }
      return neu;
    }
    return x;
  };
  return { daten: gehen(daten), felder };
}

/** Größe eines Werkzeugergebnisses begrenzen (Kontext und Kosten). */
const GRENZE = 60_000;
function json(wert: unknown): string {
  const t = JSON.stringify(wert);
  return t.length > GRENZE ? `${t.slice(0, GRENZE)} … (gekürzt, ${t.length} Zeichen)` : t;
}

async function versuchen<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

type Termine = {
  faz: number;
  fez: number;
  saz: number;
  sez: number;
  gp: number;
  fp: number | null;
  kritisch: boolean;
  anfang: string;
  ende: string;
};

export async function werkzeugAusfuehren(
  name: string,
  eingabe: unknown,
  u: WerkzeugUmgebung,
): Promise<WerkzeugErgebnis> {
  const e = (eingabe ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case 'projekt_ueberblick': {
        const plaene = await versuchen(() => u.abfrage('termine', 'plaene'));
        const kosten = (await versuchen(() => u.abfrage('kosten', 'kosten'))) as {
          gesamt?: unknown;
          bauwerk?: unknown;
          flaechen?: unknown;
          zeilen?: unknown[];
        } | null;
        const modelle = await versuchen(() => u.abfrage('bim', 'modelle'));
        return {
          text: json({
            projekt: u.projektName(),
            terminplaene: plaene,
            kosten: kosten && {
              zeilen: kosten.zeilen?.length ?? 0,
              gesamt: kosten.gesamt,
              bauwerk: kosten.bauwerk,
              flaechen: kosten.flaechen,
            },
            modelle,
          }),
        };
      }
      case 'plan_lesen': {
        const d = (await u.abfrage('termine', 'plan', { planId: String(e['plan_id'] ?? '') })) as {
          plan: unknown;
          vorgaenge: Record<string, unknown>[];
          beziehungen: Record<string, unknown>[];
          berechnung: { ok: boolean; termine?: Record<string, Termine>; fehler?: string } & Record<
            string,
            unknown
          >;
        };
        const t = d.berechnung.ok ? (d.berechnung.termine ?? {}) : {};
        const nr = new Map(d.vorgaenge.map((v) => [v['id'], v['nr']]));
        return {
          text: json({
            plan: d.plan,
            berechnung: d.berechnung.ok
              ? {
                  projektende: d.berechnung['projektendeDatum'],
                  sollEnde: d.berechnung['sollEndeDatum'],
                  abweichungSollEndeAT: d.berechnung['abweichungSollEnde'],
                }
              : { fehler: d.berechnung.fehler },
            vorgaenge: d.vorgaenge.map((v) => {
              const tv = t[String(v['id'])];
              return {
                id: v['id'],
                nr: v['nr'],
                name: v['name'],
                typ: v['typ'],
                ebene: v['ebene'],
                dauer_at: v['dauer_at'],
                quelle_annahme: v['quelle_annahme'],
                gewerk: v['gewerk'],
                risiko: v['risiko'] || undefined,
                ...(tv
                  ? {
                      faz: tv.faz,
                      fez: tv.fez,
                      saz: tv.saz,
                      sez: tv.sez,
                      gp: tv.gp,
                      fp: tv.fp,
                      kritisch: tv.kritisch,
                      anfang: tv.anfang,
                      ende: tv.ende,
                    }
                  : {}),
              };
            }),
            beziehungen: d.beziehungen.map((b) => ({
              id: b['id'],
              von: nr.get(b['von_id']),
              nach: nr.get(b['nach_id']),
              art: b['art'],
              abstand: b['abstand'],
              einheit: b['einheit'],
            })),
          }),
        };
      }
      case 'kosten_lesen': {
        const k = (await u.abfrage('kosten', 'kosten')) as {
          zeilen: Record<string, unknown>[];
        } & Record<string, unknown>;
        return {
          text: json({
            einstellung: k['einstellung'],
            flaechen: k['flaechen'],
            flaechenAusModell: k['flaechenAusModell'],
            gesamt: k['gesamt'],
            bauwerk: k['bauwerk'],
            bauwerkJeBgf: k['bauwerkJeBgf'],
            zeilen: k.zeilen.map((z) => ({
              id: z['id'],
              kg: z['kg'],
              bezeichnung: z['bezeichnung'] || z['katalogBezeichnung'],
              menge: z['mengeWirksam'],
              einheit: z['einheit'],
              menge_quelle: z['menge_quelle'],
              kkw_gewaehlt: z['kkw_gewaehlt'],
              kkw_quelle: z['kkw_quelle'],
              kkw_wirksam: z['kkwWirksam'],
              kosten: z['kosten'],
              hinweise: z['hinweise'],
            })),
          }),
        };
      }
      case 'sollist_lesen':
        return {
          text: json(await u.abfrage('kosten', 'sollist', { bezug: e['bezug'] ?? 'berechnung' })),
        };
      case 'modell_lesen': {
        const modelle = (await u.abfrage('bim', 'modelle')) as { id: string; name: string }[];
        return {
          text: json({
            modelle,
            mengenJeKostengruppe: await versuchen(() => u.abfrage('bim', 'kgUebersicht')),
            flaechenDin277: await versuchen(() => u.abfrage('bim', 'flaechen')),
          }),
        };
      }
      case 'befehle_beschreiben': {
        const plugin = String(e['plugin'] ?? '');
        if (!BEREICHE.has(plugin))
          return { text: `Unbekannter Bereich „${plugin}“.`, fehler: true };
        return {
          text: json(
            u
              .befehle()
              .filter((b) => b.plugin === plugin)
              .map((b) => ({ befehl: b.name, titel: b.titel, schema: b.schema })),
          ),
        };
      }
      case 'aenderung_vorschlagen': {
        const plugin = String(e['plugin'] ?? '');
        const befehl = String(e['befehl'] ?? '');
        if (!BEREICHE.has(plugin))
          return { text: `Befehle aus „${plugin}“ darf ich nicht vorschlagen.`, fehler: true };
        const b = u.befehle().find((x) => x.plugin === plugin && x.name === befehl);
        if (!b) return { text: `Unbekannter Befehl „${plugin}:${befehl}“.`, fehler: true };
        const { daten, felder } = kiEntwuerfeKennzeichnen(e['daten'] ?? {});
        const p = u.pruefen(plugin, befehl, daten);
        if (!p.ok) return { text: `Die Daten passen nicht zum Befehl: ${p.fehler}`, fehler: true };
        const nr = u.vorschlagen({
          plugin,
          befehl,
          titel: b.titel,
          beschreibung: String(e['beschreibung'] ?? ''),
          daten,
          kiEntwurf: felder,
        });
        return {
          text: `Vorschlag ${nr} („${b.titel}“) wird dem Nutzer angezeigt. Er führt ihn aus oder verwirft ihn; das Ergebnis erfährst du mit seiner nächsten Nachricht.${
            felder.length
              ? ` Die Felder ${felder.join(', ')} sind als [KI-Entwurf] gekennzeichnet.`
              : ''
          }`,
        };
      }
      default:
        return { text: `Unbekanntes Werkzeug „${name}“.`, fehler: true };
    }
  } catch (err) {
    return { text: `Fehler: ${(err as Error).message}`, fehler: true };
  }
}
