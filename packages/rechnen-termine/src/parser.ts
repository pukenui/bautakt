import type { Art, BeziehungEingabe, Einheit } from './typen.js';

/**
 * Parser der Vorgänger-Spalte (Architektur 5.6, E-18, E-28):
 *
 *   Eintrag   := Bezug { ";" Bezug }
 *   Bezug     := Nr [Art] [Abstand]
 *   Art       := EA | AA | EE | AE | Ende-Anfang | Anfang-Anfang | Ende-Ende | Anfang-Ende   (Standard EA)
 *   Abstand   := ("+" | "-") Zahl [Einheit]
 *   Einheit   := AT | KT | Tage | Arbeitstage | Kalendertage                              (Standard AT; Tage = AT)
 *
 * Leerzeichen und Groß-/Kleinschreibung sind egal. Nr ist eine Zahl (auch 1.2.3) oder ein
 * Kürzel aus Buchstaben/Ziffern; nach einem Kürzel muss vor der Art ein Leerzeichen stehen.
 */

export interface Bezug {
  nr: string;
  art: Art;
  abstand: number;
  einheit: Einheit;
  /** Position des Bezugs im Text (1-basiert), für Fehlermeldungen beim Auflösen. */
  position: number;
}

export interface ParserFehler {
  /** 1-basierte Zeichenposition. */
  position: number;
  meldung: string;
}

export type ParseErgebnis = { ok: true; bezuege: Bezug[] } | { ok: false; fehler: ParserFehler };

const ARTEN_TEXT: readonly [string, Art][] = [
  ['ende-anfang', 'EA'],
  ['anfang-anfang', 'AA'],
  ['ende-ende', 'EE'],
  ['anfang-ende', 'AE'],
  ['ea', 'EA'],
  ['aa', 'AA'],
  ['ee', 'EE'],
  ['ae', 'AE'],
];

const EINHEITEN_TEXT: readonly [string, Einheit][] = [
  ['kalendertage', 'KT'],
  ['arbeitstage', 'AT'],
  ['tage', 'AT'],
  ['at', 'AT'],
  ['kt', 'KT'],
];

const BUCHSTABE = /[\p{L}]/u;
const ZIFFER = /[0-9]/;
const KUERZEL = /[\p{L}\p{N}_]/u;
const MINUS = new Set(['-', '−', '–']);

class Fehler {
  constructor(
    readonly position: number,
    readonly meldung: string,
  ) {}
}

export function vorgaengerParsen(text: string): ParseErgebnis {
  let i = 0;
  const zeichen = () => text[i] ?? '';
  const leer = () => {
    while (/\s/.test(zeichen())) i++;
  };
  const wort = (liste: readonly [string, string][]): [string, string] | undefined => {
    const rest = text.slice(i).toLowerCase();
    // Wortgrenze: danach darf kein Buchstabe folgen (Ziffern schon, z. B. „1EA10“ → Vorzeichen fehlt)
    return liste.find(([w]) => rest.startsWith(w) && !BUCHSTABE.test(rest[w.length] ?? ''));
  };

  const bezuege: Bezug[] = [];
  try {
    for (;;) {
      leer();
      if (i >= text.length) break;
      if (zeichen() === ';') {
        i++;
        continue; // leere Einträge überspringen
      }
      const start = i;

      // Nr
      let nr: string;
      if (ZIFFER.test(zeichen())) {
        const m = /^\d+(?:\.\d+)*/.exec(text.slice(i)) as RegExpExecArray;
        nr = m[0];
        i += nr.length;
      } else if (BUCHSTABE.test(zeichen())) {
        while (KUERZEL.test(zeichen())) i++;
        nr = text.slice(start, i);
      } else {
        throw new Fehler(i + 1, 'Vorgangsnummer erwartet');
      }
      leer();

      // Art
      let art: Art = 'EA';
      if (BUCHSTABE.test(zeichen())) {
        const treffer = wort(ARTEN_TEXT);
        if (!treffer) throw new Fehler(i + 1, 'unbekannte Beziehungsart (erlaubt: EA, AA, EE, AE)');
        art = treffer[1] as Art;
        i += treffer[0].length;
        leer();
      }

      // Abstand
      let abstand = 0;
      let einheit: Einheit = 'AT';
      if (zeichen() === '+' || MINUS.has(zeichen())) {
        const negativ = zeichen() !== '+';
        i++;
        leer();
        const m = /^\d+/.exec(text.slice(i));
        if (!m) throw new Fehler(i + 1, 'Zahl für den Abstand erwartet');
        i += m[0].length;
        if ((zeichen() === ',' || zeichen() === '.') && ZIFFER.test(text[i + 1] ?? '')) {
          throw new Fehler(i + 1, 'Der Abstand muss eine ganze Zahl sein');
        }
        abstand = negativ ? -Number(m[0]) : Number(m[0]);
        if (Object.is(abstand, -0)) abstand = 0;
        leer();
        if (BUCHSTABE.test(zeichen())) {
          const treffer = wort(EINHEITEN_TEXT);
          if (!treffer) throw new Fehler(i + 1, 'unbekannte Einheit (erlaubt: AT, KT, Tage)');
          einheit = treffer[1] as Einheit;
          i += treffer[0].length;
          leer();
        }
      } else if (ZIFFER.test(zeichen())) {
        throw new Fehler(i + 1, 'Vorzeichen + oder − vor dem Abstand erwartet');
      }

      if (i < text.length && zeichen() !== ';') {
        throw new Fehler(i + 1, `unerwartetes Zeichen „${zeichen()}“`);
      }
      bezuege.push({ nr, art, abstand, einheit, position: start + 1 });
    }
  } catch (e) {
    if (e instanceof Fehler)
      return { ok: false, fehler: { position: e.position, meldung: e.meldung } };
    throw e;
  }
  return { ok: true, bezuege };
}

export type AufloeseErgebnis =
  { ok: true; beziehungen: BeziehungEingabe[] } | { ok: false; fehler: ParserFehler };

/**
 * Löst Nr. in Vorgangs-IDs auf und erzeugt Beziehungen zum Nachfolger `nachId`.
 * Nr. werden ohne Beachtung von Groß-/Kleinschreibung verglichen.
 */
export function bezuegeAufloesen(
  bezuege: readonly Bezug[],
  vorgaenge: readonly { id: string; nr: string }[],
  nachId: string,
): AufloeseErgebnis {
  const nachNr = new Map(vorgaenge.map((v) => [v.nr.trim().toLowerCase(), v.id]));
  const beziehungen: BeziehungEingabe[] = [];
  for (const b of bezuege) {
    const von = nachNr.get(b.nr.toLowerCase());
    if (!von)
      return {
        ok: false,
        fehler: { position: b.position, meldung: `Vorgang ${b.nr} existiert nicht` },
      };
    if (von === nachId) {
      return {
        ok: false,
        fehler: {
          position: b.position,
          meldung: 'Ein Vorgang kann nicht sein eigener Vorgänger sein',
        },
      };
    }
    beziehungen.push({ von, nach: nachId, art: b.art, abstand: b.abstand, einheit: b.einheit });
  }
  return { ok: true, beziehungen };
}

const ART_LANG: Record<Art, string> = {
  EA: 'Ende-Anfang',
  AA: 'Anfang-Anfang',
  EE: 'Ende-Ende',
  AE: 'Anfang-Ende',
};

/** Anzeige eines Bezugs: kurz `1EA+10`, `4EA+30KT`, `A EE+2` oder lang `3 Ende-Anfang +15 Arbeitstage`. */
export function bezugFormatieren(
  b: Pick<Bezug, 'nr' | 'art' | 'abstand' | 'einheit'>,
  form: 'kurz' | 'lang' = 'kurz',
): string {
  const vorzeichen = b.abstand < 0 ? '-' : '+';
  const betrag = Math.abs(b.abstand);
  if (form === 'lang') {
    const abstand =
      b.abstand === 0 && b.einheit === 'AT'
        ? ''
        : ` ${vorzeichen}${betrag} ${b.einheit === 'KT' ? 'Kalendertage' : 'Arbeitstage'}`;
    return `${b.nr} ${ART_LANG[b.art]}${abstand}`;
  }
  const trenner = ZIFFER.test(b.nr[0] ?? '') ? '' : ' ';
  const abstand =
    b.abstand === 0 && b.einheit === 'AT'
      ? ''
      : `${vorzeichen}${betrag}${b.einheit === 'KT' ? 'KT' : ''}`;
  return `${b.nr}${trenner}${b.art}${abstand}`;
}

/** Ganze Vorgänger-Spalte formatieren (Einträge mit „; “ getrennt). */
export function vorgaengerFormatieren(
  bezuege: readonly Pick<Bezug, 'nr' | 'art' | 'abstand' | 'einheit'>[],
  form: 'kurz' | 'lang' = 'kurz',
): string {
  return bezuege.map((b) => bezugFormatieren(b, form)).join('; ');
}
