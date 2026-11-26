import { zahlAnzeigen } from '@bautakt/ui';
import type {
  BedingungTyp,
  PlanDaten,
  VorgangFelder,
  VorgangMitEbene,
} from '../gemeinsam/typen.js';
import { datumKurz } from './daten.js';
import type { ListenSpalte } from './ListenTabelle.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

export const BEDINGUNG_TEXT: Record<BedingungTyp, string> = {
  keine: '–',
  nicht_frueher_als: 'nicht früher als',
  muss_enden_am: 'muss enden am',
};

const vorzeichen = (a: number | null | undefined) =>
  a == null ? '' : a > 0 ? `+${zahlAnzeigen(a)}` : zahlAnzeigen(a);
const abwKlasse = (a: number | null | undefined) =>
  a == null || a === 0 ? '' : a > 0 ? 'negativ' : 'positiv';

/** Gemeinsame Bausteine beider Listen; `befehl` fehlt im Druck (nur Anzeige). */
function bausteine(daten: PlanDaten, befehl?: Befehl) {
  const termine = daten.berechnung.ok ? daten.berechnung.termine : {};
  const aendern = async (v: VorgangMitEbene, felder: VorgangFelder) =>
    !!befehl && (await befehl('vorgang.aendern', { id: v.id, felder })) !== null;
  const textFeld = (feld: 'nr' | 'name' | 'gewerk' | 'rolle' | 'quelle_annahme') =>
    befehl
      ? {
          art: 'text' as const,
          speichern: (v: VorgangMitEbene, wert: string) => aendern(v, { [feld]: wert }),
        }
      : undefined;
  const nichtSammel = (v: VorgangMitEbene) => v.typ !== 'sammel';

  const nr: ListenSpalte = {
    key: 'nr',
    titel: 'Nr.',
    breite: 52,
    text: (v) => v.nr,
    bearbeitung: textFeld('nr'),
  };
  const name = (einruecken: boolean, titel = 'Vorgang'): ListenSpalte => ({
    key: 'name',
    titel,
    breite: 280,
    text: (v) => v.name,
    anzeige: (v) => (
      <span className="tp-name" style={{ paddingLeft: einruecken ? v.ebene * 16 : 0 }}>
        {v.typ === 'meilenstein' && (
          <span className={`tp-raute${v.schnittstelle ? ' schnittstelle' : ''}`}>◆</span>
        )}
        <span className="tp-text">{v.name}</span>
      </span>
    ),
    klasse: (v) => (termine[v.id]?.kritisch ? 'kritisch-text' : ''),
    bearbeitung: textFeld('name'),
  });
  const rolle: ListenSpalte = {
    key: 'rolle',
    titel: 'Verantwortlich',
    breite: 130,
    text: (v) => v.rolle,
    bearbeitung: textFeld('rolle'),
    darf: nichtSammel,
  };
  const gp: ListenSpalte = {
    key: 'gp',
    titel: 'GP',
    hinweis: 'Gesamtpuffer (AT)',
    breite: 48,
    rechts: true,
    text: (v) => (termine[v.id] ? zahlAnzeigen(termine[v.id]?.gp ?? 0) : ''),
    klasse: (v) => ((termine[v.id]?.gp ?? 0) < 0 ? 'negativ' : ''),
  };
  const soll = (titel: string): ListenSpalte[] =>
    daten.vergleich
      ? [
          {
            key: 'soll',
            titel,
            hinweis: `Termin laut Stand „${daten.vergleich.standName}“`,
            breite: 104,
            text: (v) => {
              const s = daten.vergleich?.termine[v.id];
              return s ? datumKurz(s.ende) : '';
            },
          },
          {
            key: 'abw',
            titel: 'Abw.',
            hinweis: `Abweichung gegenüber „${daten.vergleich.standName}“ in AT (+ = später)`,
            breite: 52,
            rechts: true,
            text: (v) => vorzeichen(daten.vergleich?.termine[v.id]?.abweichung),
            klasse: (v) => abwKlasse(daten.vergleich?.termine[v.id]?.abweichung),
          },
        ]
      : [];
  return { termine, aendern, textFeld, nichtSammel, nr, name, rolle, gp, soll };
}

/** Spalten der Terminliste (E-47). */
export function terminlisteSpalten(
  daten: PlanDaten,
  gruppiert: boolean,
  befehl?: Befehl,
): ListenSpalte[] {
  const b = bausteine(daten, befehl);
  const { termine } = b;
  return [
    b.nr,
    b.name(!gruppiert),
    {
      key: 'gewerk',
      titel: 'Gewerk',
      breite: 130,
      text: (v) => v.gewerk,
      bearbeitung: b.textFeld('gewerk'),
      darf: b.nichtSammel,
    },
    b.rolle,
    {
      key: 'dauer',
      titel: 'Dauer',
      hinweis: 'Dauer in Arbeitstagen (AT)',
      breite: 62,
      rechts: true,
      text: (v) => {
        const t = termine[v.id];
        if (v.typ === 'vorgang') return String(v.dauer_at);
        if (v.typ === 'meilenstein') return '0';
        return t ? String(t.fez - t.faz) : '';
      },
      bearbeitung: befehl
        ? {
            art: 'text',
            speichern: (v, wert) =>
              b.aendern(v, {
                dauer_at: Number(wert.replace(/\s*(AT|Tage?)$/i, '').replace(',', '.')),
              }),
          }
        : undefined,
      darf: (v) => v.typ === 'vorgang',
    },
    {
      key: 'anfang',
      titel: 'Anfang',
      breite: 104,
      text: (v) => {
        const t = termine[v.id];
        return t && v.typ !== 'meilenstein' ? datumKurz(t.anfang) : '';
      },
    },
    {
      key: 'ende',
      titel: 'Ende',
      breite: 104,
      text: (v) => {
        const t = termine[v.id];
        return t ? datumKurz(t.ende) : '';
      },
    },
    b.gp,
    ...(daten.plan.stichtag
      ? [
          {
            key: 'fertig',
            titel: '%',
            hinweis: 'Fertigstellungsgrad laut Ist-Stand',
            breite: 52,
            rechts: true,
            text: (v: VorgangMitEbene) => {
              const t = termine[v.id];
              if (v.typ === 'sammel' || !t) return '';
              if (t.status === 'fertig') return '✓ 100';
              const ist = daten.ist[v.id];
              if (t.status === 'begonnen')
                return ist?.fertig_prozent != null
                  ? String(ist.fertig_prozent)
                  : `Rest ${ist?.restdauer_at ?? ''}`;
              return '';
            },
            klasse: (v: VorgangMitEbene) => (termine[v.id]?.status === 'fertig' ? 'positiv' : ''),
          },
        ]
      : []),
    ...b.soll('Soll-Ende'),
    {
      key: 'quelle',
      titel: 'Quelle/Annahme',
      hinweis: 'Pflichtfeld (E-13)',
      breite: 220,
      // im Druck (ohne Befehl) fehlende Angabe sichtbar machen
      text: (v) =>
        !befehl && v.typ !== 'sammel' && !v.quelle_annahme.trim() ? '⚠ fehlt' : v.quelle_annahme,
      anzeige: (v) =>
        v.typ !== 'sammel' && !v.quelle_annahme.trim() ? (
          <span className="tp-warnung">⚠ fehlt</span>
        ) : (
          v.quelle_annahme
        ),
      bearbeitung: b.textFeld('quelle_annahme'),
      darf: b.nichtSammel,
    },
  ];
}

/** Spalten der Meilenstein-Tabelle (E-48). */
export function meilensteinSpalten(daten: PlanDaten, befehl?: Befehl): ListenSpalte[] {
  const b = bausteine(daten, befehl);
  const { termine } = b;
  const vorbelegung = (v: VorgangMitEbene) =>
    v.bedingung_datum ??
    termine[v.id]?.ende ??
    daten.plan.projektstart ??
    new Date().toISOString().slice(0, 10);
  return [
    b.nr,
    b.name(false, 'Meilenstein'),
    {
      key: 'termin',
      titel: 'Termin',
      hinweis: daten.plan.stichtag ? 'Prognose zum Stichtag' : 'Frühester Termin',
      breite: 104,
      text: (v) => {
        const t = termine[v.id];
        return t ? datumKurz(t.ende) : '';
      },
    },
    b.gp,
    ...b.soll('Soll-Termin'),
    {
      key: 'bedingung',
      titel: 'Bedingung',
      hinweis: 'Schnittstellentermin: nicht früher als / muss enden am (E-19)',
      breite: 130,
      text: (v) => (befehl ? v.bedingung_typ : BEDINGUNG_TEXT[v.bedingung_typ]),
      anzeige: (v) => BEDINGUNG_TEXT[v.bedingung_typ],
      bearbeitung: befehl
        ? {
            art: 'auswahl',
            optionen: (Object.keys(BEDINGUNG_TEXT) as BedingungTyp[]).map((k) => ({
              wert: k,
              text: k === 'keine' ? 'keine' : BEDINGUNG_TEXT[k],
            })),
            speichern: (v, wert) =>
              b.aendern(v, {
                bedingung_typ: wert as BedingungTyp,
                ...(wert !== 'keine' ? { bedingung_datum: vorbelegung(v) } : {}),
              }),
          }
        : undefined,
    },
    {
      key: 'bedingung_datum',
      titel: 'Datum',
      hinweis: 'Datum der Bedingung',
      breite: 104,
      text: (v) =>
        befehl ? (v.bedingung_datum ?? '') : v.bedingung_datum ? datumKurz(v.bedingung_datum) : '',
      anzeige: (v) => (v.bedingung_datum ? datumKurz(v.bedingung_datum) : ''),
      bearbeitung: befehl
        ? {
            art: 'datum',
            speichern: (v, wert) =>
              wert ? b.aendern(v, { bedingung_datum: wert }) : Promise.resolve(false),
          }
        : undefined,
      darf: (v) => v.bedingung_typ !== 'keine',
    },
    {
      key: 'schnittstelle',
      titel: 'Schnittstelle',
      hinweis: 'Schnittstellentermin (orange hervorgehoben); Klick schaltet um',
      breite: 90,
      text: (v) => (v.schnittstelle ? '✓' : ''),
      bearbeitung: befehl
        ? { art: 'haken', speichern: (v, wert) => b.aendern(v, { schnittstelle: wert ? 1 : 0 }) }
        : undefined,
    },
    b.rolle,
    ...(daten.plan.stichtag
      ? [
          {
            key: 'status',
            titel: 'Ist',
            hinweis: 'Ist-Stand zum Stichtag',
            breite: 110,
            text: (v: VorgangMitEbene) => {
              const ist = daten.ist[v.id];
              return termine[v.id]?.status === 'fertig' && ist?.ist_ende
                ? `✓ ${datumKurz(ist.ist_ende)}`
                : 'offen';
            },
            klasse: (v: VorgangMitEbene) => (termine[v.id]?.status === 'fertig' ? 'positiv' : ''),
          },
        ]
      : []),
  ];
}
