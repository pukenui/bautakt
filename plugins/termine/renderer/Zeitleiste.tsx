import { tagVonDatum, type Arbeitskalender } from '@bautakt/rechnen-kalender';
import type { PlanDaten } from '../gemeinsam/typen.js';
import { datumKurz } from './daten.js';
import { spurenVerteilen, type MeilensteinEintrag } from './listen.js';
import { Zeitachse, zoomFuerMassstab } from './zeitachse.js';

const ACHSE = 36;
const SPUR = 30;
const UNTEN = 26;
const MAX_ZEICHEN = 34;

function kuerzen(text: string): string {
  return text.length > MAX_ZEICHEN ? `${text.slice(0, MAX_ZEICHEN - 1)}…` : text;
}

/** Geschätzte Breite einer Beschriftung (11 px Segoe UI). */
function beschriftungsBreite(m: MeilensteinEintrag): number {
  return Math.max(kuerzen(`${m.v.nr} ${m.v.name}`).length, 12) * 6.1 + 6;
}

/** Höhe der Zeitleiste für eine Liste von Meilensteinen (für die Seitenaufteilung im Druck). */
export function zeitleisteHoehe(spuren: number): number {
  return ACHSE + Math.max(1, spuren) * SPUR + UNTEN + 10;
}

/** Lage der Zeitleiste: Zeitachse, Punkte, Spuren und Höhe (auch für die Seitenaufteilung). */
export function zeitleisteLayout(
  daten: PlanDaten,
  eintraege: MeilensteinEintrag[],
  kal: Arbeitskalender,
  breite: number,
) {
  const b = daten.berechnung;
  const liste = eintraege.filter((m) => m.t);

  // Zeitraum: Projektstart, alle Meilensteine, Soll-Termine, Soll-Ende, Stichtag
  const tage = [tagVonDatum(kal.start)];
  for (const m of liste) {
    if (m.t) tage.push(tagVonDatum(m.t.ende));
    if (m.soll) tage.push(tagVonDatum(m.soll));
  }
  if (b.ok) tage.push(tagVonDatum(b.projektendeDatum));
  if (b.ok && b.sollEndeDatum) tage.push(tagVonDatum(b.sollEndeDatum));
  if (daten.plan.stichtag) tage.push(tagVonDatum(daten.plan.stichtag));
  const min = Math.min(...tage);
  const max = Math.max(...tage);
  const rand = Math.ceil(Math.max(14, max - min) * 0.03) + 1;
  // rechts Platz für die letzte Beschriftung lassen
  const rechts = Math.ceil(((max - min + 2 * rand) * 200) / Math.max(400, breite - 200));
  const von = min - rand;
  const bis = max + rand + rechts;
  const px = breite / (bis - von);
  const achse = new Zeitachse(von, bis, zoomFuerMassstab(px), kal, px);
  /** Meilenstein-Termin: Ende des Arbeitstags (t ≥ 1), sonst Projektbeginn. */
  const xTermin = (iso: string, t: number) => achse.xDatum(iso) + (t >= 1 ? px : 0);

  const punkte = liste.map((m) => ({
    m,
    x: m.t ? xTermin(m.t.ende, m.t.fez) : 0,
    breite: beschriftungsBreite(m),
  }));
  const spuren = spurenVerteilen(punkte);
  const anzahl = Math.max(1, ...spuren.map((s) => s + 1));
  const hoehe = zeitleisteHoehe(anzahl);
  return { achse, px, xTermin, punkte, spuren, hoehe };
}

/** Zeitleiste des Meilensteinplans (E-48): Rauten auf der Zeitachse, Beschriftungen in Spuren. */
export function Zeitleiste(props: {
  daten: PlanDaten;
  eintraege: MeilensteinEintrag[];
  kal: Arbeitskalender;
  breite: number;
  auswahl?: string | null;
  onAuswahl?: (id: string) => void;
  onOeffnen?: (id: string) => void;
  heute?: string;
}) {
  const { daten, kal, breite } = props;
  const b = daten.berechnung;
  const { achse, xTermin, punkte, spuren, hoehe } = zeitleisteLayout(
    daten,
    props.eintraege,
    kal,
    breite,
  );
  const basis = hoehe - UNTEN;
  const kopf = achse.kopf();

  const linie = (iso: string | null, klasse: string, text: string) =>
    iso &&
    achse.xDatum(iso) >= 0 &&
    achse.xDatum(iso) <= breite - 40 && (
      <g className={klasse}>
        <line x1={achse.xDatum(iso)} x2={achse.xDatum(iso)} y1={ACHSE} y2={basis + 8} />
        <text x={achse.xDatum(iso) + 3} y={hoehe - 4}>
          {text}
        </text>
      </g>
    );

  return (
    <svg
      className="ml-zeitleiste"
      width={breite}
      height={hoehe}
      role="img"
      aria-label="Zeitleiste der Meilensteine"
    >
      <rect x={0} y={0} width={breite} height={ACHSE} className="ml-achse-hg" />
      {kopf.oben.map((a) => (
        <g key={`o${a.x}`}>
          <line x1={a.x} x2={a.x} y1={0} y2={ACHSE} className="tp-kopflinie" />
          {a.breite > 30 && (
            <text x={a.x + 3} y={13} className="tp-kopftext">
              {a.text}
            </text>
          )}
        </g>
      ))}
      {kopf.unten.map((a) => (
        <g key={`u${a.x}`}>
          <line x1={a.x} x2={a.x} y1={18} y2={basis} className="ml-raster" />
          {a.breite > 16 && (
            <text x={a.x + 2} y={31} className="tp-kopftext klein">
              {a.text}
            </text>
          )}
        </g>
      ))}
      <line x1={0} x2={breite} y1={ACHSE} y2={ACHSE} className="tp-kopflinie" />
      <line x1={0} x2={breite} y1={basis} y2={basis} className="ml-basis" />
      {props.heute && linie(props.heute, 'ml-linie heute', 'heute')}
      {linie(daten.plan.stichtag, 'ml-linie stichtag', 'Stichtag')}
      {b.ok && linie(b.sollEndeDatum, 'ml-linie sollende', 'Soll-Ende')}

      {punkte.map(({ m, x }, i) => {
        const spur = spuren[i] ?? 0;
        const y = basis - 22 - spur * SPUR;
        const sollX = m.soll && m.sollFez !== null ? xTermin(m.soll, m.sollFez) : null;
        const klassen = [
          'ml-punkt',
          m.v.schnittstelle ? 'schnittstelle' : '',
          m.t?.kritisch ? 'kritisch' : '',
          m.t?.status === 'fertig' ? 'fertig' : '',
          props.auswahl === m.v.id ? 'gewaehlt' : '',
        ].join(' ');
        return (
          <g
            key={m.v.id}
            className={klassen}
            onMouseDown={() => props.onAuswahl?.(m.v.id)}
            onDoubleClick={() => props.onOeffnen?.(m.v.id)}
          >
            {sollX !== null && Math.abs(sollX - x) > 0.5 && (
              <line x1={sollX} x2={x} y1={basis} y2={basis} className="ml-verschiebung" />
            )}
            {sollX !== null && (
              <path
                d={`M${sollX},${basis - 6} l6,6 l-6,6 l-6,-6 z`}
                className="ml-soll"
                aria-label="Soll-Termin"
              />
            )}
            <line x1={x} x2={x} y1={y + 4} y2={basis - 7} className="ml-fuehrung" />
            <path d={`M${x},${basis - 7} l7,7 l-7,7 l-7,-7 z`} className="ml-raute" />
            <text x={x - 3} y={y - 9} className="ml-titel">
              {kuerzen(`${m.v.nr} ${m.v.name}`)}
            </text>
            <text x={x - 3} y={y + 2} className="ml-datum">
              {m.t ? datumKurz(m.t.ende) : ''}
              {m.abweichung ? ` (${m.abweichung > 0 ? '+' : ''}${m.abweichung} AT)` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
