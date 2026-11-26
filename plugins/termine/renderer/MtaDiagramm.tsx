import { datumVonTag, tagVonDatum } from '@bautakt/rechnen-kalender';
import { gewerkFarbe } from '../gemeinsam/orte.js';
import { mtaPunkte, mtaZeitraum, type MtaDaten } from '../gemeinsam/mta.js';
import { datumKurz } from './daten.js';

const MONAT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const RAND = { links: 70, unten: 46, oben: 16, rechts: 210 } as const;

/** Farbe je Meilenstein (unterscheidbar, stabil über Nr.). */
export function mtaFarbe(nr: string, schnittstelle: boolean): string {
  return schnittstelle ? '#e07b00' : gewerkFarbe(`mta-${nr}`);
}

/** Monatsanfänge im Zeitraum (Achsbeschriftung). */
function monate(von: number, bis: number): { tag: number; text: string }[] {
  const liste: { tag: number; text: string }[] = [];
  for (let t = von; t <= bis; t++) {
    const iso = datumVonTag(t);
    if (iso.endsWith('-01')) {
      const m = Number(iso.slice(5, 7));
      liste.push({
        tag: t,
        text: m === 1 ? iso.slice(0, 4) : (MONAT[m - 1] ?? ''),
      });
    }
  }
  return liste;
}

/** Beschriftung nur, wenn genug Abstand (in Tagen) zur vorigen; Jahreswechsel immer. */
function beschriftbar(
  liste: { tag: number; text: string }[],
  mindestTage: number,
): { tag: number; text: string; zeigen: boolean }[] {
  const ergebnis: { tag: number; text: string; zeigen: boolean }[] = [];
  let zuletzt = -Infinity;
  for (const t of liste) {
    const zeigen = t.tag - zuletzt >= mindestTage || /^\d{4}$/.test(t.text);
    if (zeigen) zuletzt = t.tag;
    ergebnis.push({ ...t, zeigen });
  }
  return ergebnis;
}

/**
 * MTA-Diagramm (E-72): waagerecht Berichtsdatum, senkrecht Termin (später oben), gleicher
 * Maßstab beider Achsen, Diagonale Termin = Berichtsdatum.
 */
export function MtaDiagramm(props: {
  daten: MtaDaten;
  sichtbar: ReadonlySet<string>;
  mitAktuell: boolean;
  /** Seitenlänge der quadratischen Zeichenfläche in px */
  groesse: number;
  auswahl?: string | null;
  onAuswahl?: (id: string) => void;
}) {
  const { daten, sichtbar, mitAktuell, groesse } = props;
  const z = mtaZeitraum(daten, sichtbar, mitAktuell);
  const spanne = Math.max(1, z.bis - z.von);
  const px = groesse / spanne;
  const x = (iso: string) => RAND.links + (tagVonDatum(iso) - z.von) * px;
  const y = (iso: string) => RAND.oben + groesse - (tagVonDatum(iso) - z.von) * px;
  const breite = RAND.links + groesse + RAND.rechts;
  const hoehe = RAND.oben + groesse + RAND.unten;
  const ticks = beschriftbar(monate(z.von, z.bis), 30 / px);
  const linien = daten.meilensteine.filter((m) => sichtbar.has(m.id));
  // Beschriftungen rechts: nach letztem Termin sortiert, ohne Überlappung
  const marken = linien
    .map((m) => {
      const p = mtaPunkte(daten, m, mitAktuell).at(-1);
      return p ? { m, yZiel: y(p.termin) } : null;
    })
    .filter((x): x is { m: (typeof linien)[number]; yZiel: number } => x !== null)
    .sort((a, b) => a.yZiel - b.yZiel);
  let frei = -Infinity;
  for (const mk of marken) {
    const yy = Math.max(mk.yZiel, frei + 14);
    (mk as { yText?: number }).yText = yy;
    frei = yy;
  }

  return (
    <svg
      className="mta-svg"
      width={breite}
      height={hoehe}
      role="img"
      aria-label="Meilenstein-Trendanalyse"
    >
      <rect x={RAND.links} y={RAND.oben} width={groesse} height={groesse} className="mta-flaeche" />
      {/* Dreieck unterhalb der Diagonale (Vergangenheit) */}
      <path
        d={`M${RAND.links},${RAND.oben + groesse} L${RAND.links + groesse},${RAND.oben} L${RAND.links + groesse},${RAND.oben + groesse} Z`}
        className="mta-vergangen"
      />
      {ticks.map((t) => {
        const p = (t.tag - z.von) * px;
        return (
          <g key={t.tag}>
            <line
              x1={RAND.links + p}
              x2={RAND.links + p}
              y1={RAND.oben}
              y2={RAND.oben + groesse}
              className="mta-raster"
            />
            <line
              x1={RAND.links}
              x2={RAND.links + groesse}
              y1={RAND.oben + groesse - p}
              y2={RAND.oben + groesse - p}
              className="mta-raster"
            />
            <text x={RAND.links + p + 2} y={RAND.oben + groesse + 14} className="mta-achse">
              {t.zeigen ? t.text : ''}
            </text>
            <text
              x={RAND.links - 4}
              y={RAND.oben + groesse - p + 4}
              className="mta-achse"
              textAnchor="end"
            >
              {t.zeigen ? t.text : ''}
            </text>
          </g>
        );
      })}
      <line
        x1={RAND.links}
        y1={RAND.oben + groesse}
        x2={RAND.links + groesse}
        y2={RAND.oben}
        className="mta-diagonale"
      />
      <text x={RAND.links + groesse / 2} y={hoehe - 6} className="mta-titel" textAnchor="middle">
        Berichtsdatum
      </text>
      <text
        x={14}
        y={RAND.oben + groesse / 2}
        className="mta-titel"
        textAnchor="middle"
        transform={`rotate(-90 14 ${RAND.oben + groesse / 2})`}
      >
        Meilensteintermin
      </text>
      {daten.berichte.map((b) => (
        <line
          key={b.id}
          x1={x(b.berichtsdatum)}
          x2={x(b.berichtsdatum)}
          y1={RAND.oben + groesse}
          y2={RAND.oben + groesse + 5}
          className="mta-bericht"
        />
      ))}

      {linien.map((m) => {
        const punkte = mtaPunkte(daten, m, mitAktuell);
        const farbe = mtaFarbe(m.nr, m.schnittstelle);
        const fest = punkte.filter((p) => !p.aktuell);
        const akt = punkte.find((p) => p.aktuell);
        const letzterFest = fest.at(-1);
        const gewaehlt = props.auswahl === m.id;
        const mk = marken.find((k) => k.m.id === m.id) as
          { yText?: number; yZiel: number } | undefined;
        return (
          <g
            key={m.id}
            className={`mta-linie${gewaehlt ? ' gewaehlt' : ''}`}
            onMouseDown={() => props.onAuswahl?.(m.id)}
          >
            {fest.length > 1 && (
              <polyline
                points={fest.map((p) => `${x(p.datum)},${y(p.termin)}`).join(' ')}
                stroke={farbe}
                className="mta-strich"
              />
            )}
            {akt && letzterFest && (
              <line
                x1={x(letzterFest.datum)}
                y1={y(letzterFest.termin)}
                x2={x(akt.datum)}
                y2={y(akt.termin)}
                stroke={farbe}
                className="mta-strich aktuell"
              />
            )}
            {punkte.map((p) => (
              <path
                key={`${p.datum}${p.aktuell ? 'a' : ''}`}
                d={`M${x(p.datum)},${y(p.termin) - 5} l5,5 l-5,5 l-5,-5 z`}
                fill={p.erreicht ? farbe : p.aktuell ? '#fff' : farbe}
                stroke={farbe}
                className={p.erreicht ? 'mta-punkt erreicht' : 'mta-punkt'}
              >
                <title>{`${m.nr} ${m.name}: ${datumKurz(p.termin)} (Bericht ${datumKurz(p.datum)}${p.aktuell ? ', aktuell' : ''}${p.erreicht ? ', erreicht' : ''})`}</title>
              </path>
            ))}
            {mk && (
              <text
                x={RAND.links + groesse + 8}
                y={(mk.yText ?? mk.yZiel) + 4}
                className="mta-name"
                fill={farbe}
              >
                {`${m.nr} ${m.name}`.slice(0, 30)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
