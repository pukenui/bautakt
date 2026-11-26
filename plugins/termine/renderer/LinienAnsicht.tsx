import { tagVonDatum } from '@bautakt/rechnen-kalender';
import type { AnsichtProps } from '@bautakt/ui';
import { useCallback, useMemo, useState } from 'react';
import { blattAnzahl, gewerkFarbe, ortsBaum, ortsBereich } from '../gemeinsam/orte.js';
import { datumKurz, useBefehl, useKalender, usePlan } from './daten.js';
import { KeinPlan, Kennzahlen, PlanLeiste } from './gemeinsam.js';
import { PlanDialoge, type DialogZustand } from './PlanDialoge.js';
import { heuteIso } from './TerminlisteAnsicht.js';
import { Zeitachse, type Zoom } from './zeitachse.js';
import { setzen, useZustand } from './zustand.js';

const KOPF = 40; // Zeitachse (waagerecht) bzw. Ortsnamen (Orte waagerecht)
const BESCHRIFTUNG = 190; // Ortsnamen (Zeit waagerecht) bzw. Zeitachse (Orte waagerecht)
const ZEILE = 36; // Höhe je Ort (Zeit waagerecht)
const SPALTE = 110; // Breite je Ort (Orte waagerecht)

/** Liniendiagramm / Weg-Zeit-Diagramm (E-30, E-68) mit Taktplanung (E-69). */
export function LinienAnsicht({ api, status, datenstand }: AnsichtProps) {
  const z = useZustand();
  const { plaene, daten, ladefehler } = usePlan(api, datenstand);
  const { befehl, fehler, setFehler } = useBefehl(api);
  const kal = useKalender(daten);
  const [dialog, setDialog] = useState<DialogZustand>(null);
  const nurLesen = status.schreibgeschuetzt;
  const zeitX = z.linienAusrichtung !== 'ort-x';
  const dialogSchliessen = useCallback(() => {
    setDialog(null);
    setFehler(null);
  }, [setFehler]);

  const baum = useMemo(() => (daten ? ortsBaum(daten.orte) : []), [daten]);
  const blaetter = baum.filter((o) => !o.hatKinder);
  const n = blattAnzahl(baum);

  if (ladefehler) return <p className="fehler">{ladefehler}</p>;
  if (plaene === null) return <p className="leise">Lädt …</p>;
  if (plaene.length === 0) return <KeinPlan nurLesen={nurLesen} befehl={befehl} />;
  if (!daten || !kal) return <p className="leise">Lädt …</p>;

  const termine = daten.berechnung.ok ? daten.berechnung.termine : {};
  const auswahl = z.auswahl && daten.vorgaenge.some((v) => v.id === z.auswahl) ? z.auswahl : null;
  const gewaehlt = daten.vorgaenge.find((v) => v.id === auswahl) ?? null;
  const linien = daten.vorgaenge
    .filter((v) => v.typ !== 'sammel' && termine[v.id])
    .map((v) => ({ v, t: termine[v.id], b: ortsBereich(baum, v.ort_von, v.ort_bis) }))
    .filter((x) => x.b !== null && x.t !== undefined) as {
    v: (typeof daten.vorgaenge)[number];
    t: NonNullable<(typeof termine)[string]>;
    b: { start: number; ende: number };
  }[];
  const ohneOrt = daten.vorgaenge.filter(
    (v) => v.typ !== 'sammel' && !ortsBereich(baum, v.ort_von, v.ort_bis),
  ).length;

  // Zeitraum
  const tage = [tagVonDatum(kal.start)];
  for (const { t } of linien) tage.push(tagVonDatum(t.anfang), tagVonDatum(t.ende));
  if (daten.plan.stichtag) tage.push(tagVonDatum(daten.plan.stichtag));
  const von = Math.min(...tage) - 3;
  const bis = Math.max(...tage) + 10;
  const zoom: Zoom = z.zoom;
  const achse = new Zeitachse(von, bis, zoom, kal);

  // Koordinaten: (Zeit in px längs der Achse, Ort in Blatt-Einheiten) → Bildpunkt
  const punkt = (zeit: number, ort: number): [number, number] =>
    zeitX
      ? [BESCHRIFTUNG + zeit, KOPF + (n - ort) * ZEILE]
      : [BESCHRIFTUNG + ort * SPALTE, KOPF + zeit];
  const breite = zeitX ? BESCHRIFTUNG + achse.breite : BESCHRIFTUNG + n * SPALTE + 20;
  const hoehe = zeitX ? KOPF + n * ZEILE + 10 : KOPF + achse.breite;
  const kopf = achse.kopf();
  const zeitLinie = (iso: string, klasse: string, text: string) => {
    const p = achse.xDatum(iso);
    // nur innerhalb des dargestellten Zeitraums zeichnen
    if (p < 0 || p > achse.breite) return null;
    const [x1, y1] = punkt(p, 0);
    const [x2, y2] = punkt(p, n);
    return (
      <g className={klasse}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <text
          x={zeitX ? x1 + 3 : BESCHRIFTUNG - 4}
          y={zeitX ? KOPF - 2 : y1 - 3}
          textAnchor={zeitX ? 'start' : 'end'}
        >
          {text}
        </text>
      </g>
    );
  };
  const gewerke = [...new Set(linien.map((l) => l.v.gewerk.trim()))].sort((a, b) =>
    a.localeCompare(b, 'de'),
  );

  return (
    <div className="tp-ansicht">
      <div className="tp-werkzeuge" role="toolbar" aria-label="Liniendiagramm">
        <PlanLeiste
          plaene={plaene}
          planId={daten.plan.id}
          nurLesen={nurLesen}
          befehl={befehl}
          onEinstellungen={() => setDialog({ art: 'plan' })}
          onStaende={() => setDialog({ art: 'staende' })}
          onExport={() => setDialog({ art: 'export' })}
        />
        <div className="tp-gruppe">
          <button onClick={() => setDialog({ art: 'orte' })}>Orte …</button>
          {!nurLesen && (
            <button
              disabled={!gewaehlt || gewaehlt.typ !== 'vorgang'}
              onClick={() => gewaehlt && setDialog({ art: 'takt', id: gewaehlt.id })}
              title="Gewählten Vorgang (und folgende) über mehrere Orte vervielfältigen"
            >
              Über Takte …
            </button>
          )}
          <button
            disabled={!gewaehlt}
            onClick={() => gewaehlt && setDialog({ art: 'vorgang', id: gewaehlt.id })}
          >
            Eigenschaften …
          </button>
        </div>
        <div className="tp-gruppe">
          <select
            aria-label="Ausrichtung"
            value={zeitX ? 'zeit-x' : 'ort-x'}
            onChange={(e) => setzen({ linienAusrichtung: e.target.value as 'zeit-x' | 'ort-x' })}
          >
            <option value="zeit-x">Zeit waagerecht, Orte senkrecht</option>
            <option value="ort-x">Orte waagerecht, Zeit nach unten</option>
          </select>
          <select
            aria-label="Zeitachse"
            value={z.zoom}
            onChange={(e) => setzen({ zoom: e.target.value as Zoom })}
          >
            <option value="tag">Tage</option>
            <option value="woche">KW</option>
            <option value="monat">Monate</option>
            <option value="quartal">Quartale</option>
          </select>
        </div>
      </div>
      <Kennzahlen daten={daten} />
      {fehler && !dialog && (
        <div className="tp-meldung fehler" role="alert">
          {fehler}
        </div>
      )}

      {n === 0 ? (
        <div className="tp-leer">
          <p>
            Für das Liniendiagramm braucht das Projekt eine <strong>Ortsstruktur</strong> (z. B.
            Bauabschnitte, Geschosse, Achsen oder Stationen). Legen Sie sie unter{' '}
            <strong>Orte …</strong> an und geben Sie den Vorgängen in den Eigenschaften „Ort
            von–bis“ – oder vervielfältigen Sie einen Vorgang mit <strong>Über Takte …</strong> über
            mehrere Orte.
          </p>
          {!nurLesen && (
            <button className="primaer" onClick={() => setDialog({ art: 'orte' })}>
              Orte anlegen …
            </button>
          )}
        </div>
      ) : (
        <div className="ld-rahmen">
          <svg
            className="ld-svg"
            width={breite}
            height={hoehe}
            role="img"
            aria-label="Liniendiagramm"
          >
            {/* Ortsbänder */}
            {blaetter.map((o, i) => {
              const [x1, y1] = punkt(0, i);
              const [x2, y2] = punkt(achse.breite, i + 1);
              return (
                <g key={o.id}>
                  <rect
                    x={Math.min(x1, x2)}
                    y={Math.min(y1, y2)}
                    width={Math.abs(x2 - x1)}
                    height={Math.abs(y2 - y1)}
                    className={i % 2 ? 'ld-band' : 'ld-band ungerade'}
                  />
                  {zeitX ? (
                    <text x={8} y={(y1 + y2) / 2 + 4} className="ld-ort">
                      <title>{o.pfad}</title>
                      {o.pfad.length > 28 ? `…${o.pfad.slice(-27)}` : o.pfad}
                    </text>
                  ) : (
                    <text x={(x1 + x2) / 2} y={KOPF - 8} className="ld-ort" textAnchor="middle">
                      <title>{o.pfad}</title>
                      {o.name.length > 14 ? `${o.name.slice(0, 13)}…` : o.name}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Grenzen übergeordneter Orte */}
            {baum
              .filter((o) => o.hatKinder && o.blattVon > 0)
              .map((o) => {
                const [x1, y1] = punkt(0, o.blattVon);
                const [x2, y2] = punkt(achse.breite, o.blattVon);
                return (
                  <line
                    key={o.id}
                    x1={zeitX ? 0 : x1}
                    y1={zeitX ? y1 : 0}
                    x2={x2}
                    y2={y2}
                    className="ld-gruppe"
                  />
                );
              })}
            {/* Zeitachse */}
            {kopf.unten.map((a) => {
              const [x1, y1] = punkt(a.x, 0);
              const [x2, y2] = punkt(a.x, n);
              return (
                <g key={`u${a.x}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="ld-raster" />
                  {a.breite > 16 &&
                    (zeitX ? (
                      <text x={x1 + 2} y={KOPF - 6} className="tp-kopftext klein">
                        {a.text}
                      </text>
                    ) : (
                      <text
                        x={BESCHRIFTUNG - 6}
                        y={y2 + 12}
                        className="tp-kopftext klein"
                        textAnchor="end"
                      >
                        {a.text}
                      </text>
                    ))}
                </g>
              );
            })}
            {kopf.oben.map((a) =>
              a.breite > 30 ? (
                zeitX ? (
                  <text key={`o${a.x}`} x={BESCHRIFTUNG + a.x + 3} y={14} className="tp-kopftext">
                    {a.text}
                  </text>
                ) : (
                  <text key={`o${a.x}`} x={6} y={KOPF + a.x + 14} className="tp-kopftext">
                    {a.text}
                  </text>
                )
              ) : null,
            )}
            {zeitLinie(heuteIso(), 'ld-linie heute', 'heute')}
            {daten.plan.stichtag && zeitLinie(daten.plan.stichtag, 'ld-linie stichtag', 'Stichtag')}

            {/* Vorgänge */}
            {linien.map(({ v, t, b }) => {
              const kritisch = t.kritisch;
              const farbe = kritisch ? '#d64541' : gewerkFarbe(v.gewerk);
              const klasse = `ld-vorgang${v.id === auswahl ? ' gewaehlt' : ''}`;
              const ereignis = {
                onMouseDown: () => setzen({ auswahl: v.id }),
                onDoubleClick: () => setDialog({ art: 'vorgang', id: v.id }),
              };
              if (v.typ === 'meilenstein') {
                const [x, y] = punkt(achse.xPunkt(t.fez), (b.start + b.ende) / 2);
                return (
                  <g key={v.id} className={klasse} {...ereignis}>
                    <path d={`M${x},${y - 7} l7,7 l-7,7 l-7,-7 z`} fill={farbe} />
                    <text x={x + 9} y={y + 4} className="ld-nr">
                      {v.nr}
                    </text>
                    <title>{`${v.nr} ${v.name} · ${datumKurz(t.ende)}`}</title>
                  </g>
                );
              }
              const [x1, y1] = punkt(achse.xAnfang(t.faz), b.start);
              const [x2, y2] = punkt(achse.xEnde(t.fez), b.ende);
              return (
                <g key={v.id} className={klasse} {...ereignis}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="ld-treffer" />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={farbe} className="ld-strich" />
                  <text x={(x1 + x2) / 2 + 4} y={(y1 + y2) / 2 - 4} className="ld-nr">
                    {v.nr}
                  </text>
                  <title>{`${v.nr} ${v.name}${v.gewerk ? ` (${v.gewerk})` : ''} · ${datumKurz(t.anfang)} – ${datumKurz(t.ende)}${kritisch ? ' · kritisch' : ''}`}</title>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      {n > 0 && (
        <div className="tp-legende">
          {gewerke.map((g) => (
            <span key={g || '–'} className="tp-legende-eintrag">
              <span className="ld-farbe" style={{ background: gewerkFarbe(g) }} />{' '}
              {g || 'ohne Gewerk'}
            </span>
          ))}
          <span className="tp-legende-eintrag">
            <span className="ld-farbe" style={{ background: '#d64541' }} /> kritischer Weg
          </span>
          {ohneOrt > 0 && (
            <span className="leise">{ohneOrt} Vorgang/Vorgänge ohne Ort nicht dargestellt.</span>
          )}
        </div>
      )}

      <PlanDialoge
        dialog={dialog}
        setDialog={setDialog}
        onSchliessen={dialogSchliessen}
        api={api}
        daten={daten}
        datenstand={datenstand}
        projektname={status.projektname}
        nurLesen={nurLesen}
        befehl={befehl}
        fehler={fehler}
        darstellung="balkenplan"
      />
    </div>
  );
}
