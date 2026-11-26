import { tagVonDatum, type Arbeitskalender } from '@bautakt/rechnen-kalender';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
  type UIEvent,
} from 'react';
import type { PlanDaten, VorgangMitEbene } from '../gemeinsam/typen.js';
import { datumKurz } from './daten.js';
import { KOPF, ZEILE } from './Tabelle.js';
import { pfeilWeg, Zeitachse, type Zoom } from './zeitachse.js';

export interface BalkenplanProps {
  daten: PlanDaten;
  zeilen: VorgangMitEbene[];
  kal: Arbeitskalender;
  zoom: Zoom;
  nurLesen: boolean;
  auswahl: string | null;
  setAuswahl: (id: string) => void;
  onEigenschaften: (id: string) => void;
  onVerbinden: (von: string, nach: string) => void;
  risikoNr: Map<string, number>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  scrollTop: number;
  hoehe: number;
}

const RAND: Record<Zoom, number> = { tag: 3, woche: 14, monat: 31, quartal: 92 };

function heuteTag(): number {
  const d = new Date();
  return tagVonDatum(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  );
}

export function Balkenplan(p: BalkenplanProps) {
  const { scrollRef, onScroll } = p;
  const { daten, zeilen, kal, zoom } = p;
  const ber = daten.berechnung.ok ? daten.berechnung : null;

  const achse = useMemo(() => {
    const tage = [tagVonDatum(kal.start)];
    if (ber) {
      for (const t of Object.values(ber.termine)) {
        tage.push(
          tagVonDatum(t.anfang),
          tagVonDatum(t.ende),
          tagVonDatum(t.spaetAnfang),
          tagVonDatum(t.spaetEnde),
        );
      }
      if (ber.sollEndeDatum) tage.push(tagVonDatum(ber.sollEndeDatum));
    }
    let von = Math.min(...tage) - RAND[zoom];
    const bis = Math.max(...tage) + RAND[zoom] * 2 + 1;
    // auf Wochenanfang (Montag; Tag 4 = Mo 05.01.1970) ausrichten
    von -= (((von - 4) % 7) + 7) % 7;
    return new Zeitachse(von, Math.max(bis, von + 60), zoom, kal);
  }, [kal, zoom, ber]);

  const kopf = useMemo(() => achse.kopf(), [achse]);
  const streifen = useMemo(() => achse.freieStreifen(), [achse]);
  const zeileVon = useMemo(() => new Map(zeilen.map((v, i) => [v.id, i])), [zeilen]);
  const kritischeBez = useMemo(() => new Set(ber?.kritischeBeziehungen ?? []), [ber]);

  // Beim Wechsel des Plans/Zooms zum Projektbeginn scrollen
  const plan = daten.plan.id;
  const hScroll = useRef<{ plan: string; zoom: Zoom } | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || (hScroll.current?.plan === plan && hScroll.current.zoom === zoom)) return;
    hScroll.current = { plan, zoom };
    el.scrollLeft = Math.max(0, achse.xDatum(kal.start) - 40);
  }, [plan, zoom, achse, kal, scrollRef]);

  // Verbinden per Maus: von einem Balkenende auf einen anderen Vorgang ziehen
  const [ziehen, setZiehen] = useState<{
    von: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const svgPunkt = (e: PointerEvent<SVGElement>) => {
    const r = (
      e.currentTarget.ownerSVGElement ?? (e.currentTarget as SVGSVGElement)
    ).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const erste = Math.max(0, Math.floor(p.scrollTop / ZEILE) - 10);
  const letzte = Math.min(zeilen.length, Math.ceil((p.scrollTop + p.hoehe) / ZEILE) + 10);
  const hoehe = zeilen.length * ZEILE;
  const mitte = (i: number) => i * ZEILE + ZEILE / 2;
  const heute = achse.xTag(heuteTag());

  return (
    <div className="tp-balken" ref={scrollRef} onScroll={onScroll}>
      <div className="tp-balken-kopf" style={{ width: achse.breite, height: KOPF }}>
        <svg width={achse.breite} height={KOPF} aria-hidden="true">
          {kopf.oben.map((a) => (
            <g key={`o${a.x}`}>
              <line x1={a.x} x2={a.x} y1={0} y2={KOPF / 2} className="tp-kopflinie" />
              <text x={a.x + 4} y={16} className="tp-kopftext">
                {a.breite > a.text.length * 6.5 + 6 ? a.text : ''}
              </text>
            </g>
          ))}
          {kopf.unten.map((a) => (
            <g key={`u${a.x}`}>
              <line x1={a.x} x2={a.x} y1={KOPF / 2} y2={KOPF} className="tp-kopflinie" />
              <text
                x={a.x + a.breite / 2}
                y={KOPF - 8}
                textAnchor="middle"
                className="tp-kopftext klein"
              >
                {a.breite >= 14 ? a.text : ''}
              </text>
            </g>
          ))}
          <line x1={0} x2={achse.breite} y1={KOPF / 2} y2={KOPF / 2} className="tp-kopflinie" />
        </svg>
      </div>
      <svg
        width={achse.breite}
        height={Math.max(hoehe, p.hoehe - KOPF)}
        className="tp-balken-svg"
        role="img"
        aria-label="Balkenplan"
        onPointerMove={(e) => {
          if (!ziehen) return;
          const pt = svgPunkt(e);
          setZiehen({ ...ziehen, x2: pt.x, y2: pt.y });
        }}
        onPointerUp={(e) => {
          if (!ziehen) return;
          const nach = zeilen[Math.floor(svgPunkt(e).y / ZEILE)];
          setZiehen(null);
          if (nach && nach.id !== ziehen.von && nach.typ !== 'sammel')
            p.onVerbinden(ziehen.von, nach.id);
        }}
      >
        <defs>
          <pattern
            id="tp-schraffur"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" className="tp-schraffur" />
          </pattern>
          <marker
            id="tp-pfeil"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" className="tp-pfeilspitze" />
          </marker>
          <marker
            id="tp-pfeil-krit"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 z" className="tp-pfeilspitze kritisch" />
          </marker>
        </defs>

        {/* arbeitsfreie Zeit: Ruhezeiten immer, Wochenenden/Feiertage bei Tag/KW */}
        {streifen
          .filter((s) => s.art === 'ruhezeit' || zoom === 'tag' || zoom === 'woche')
          .map((s) => (
            <rect
              key={`f${s.x}`}
              x={s.x}
              y={0}
              width={s.breite}
              height={Math.max(hoehe, p.hoehe)}
              className={`tp-frei ${s.art}`}
            >
              {s.text && <title>{s.text}</title>}
            </rect>
          ))}

        {zeilen.slice(erste, letzte).map((v, k) => {
          const i = erste + k;
          return (
            <rect
              key={`z${v.id}`}
              x={0}
              y={i * ZEILE}
              width={achse.breite}
              height={ZEILE}
              className={`tp-zeilenhg${v.id === p.auswahl ? ' gewaehlt' : ''}`}
              onPointerDown={() => p.setAuswahl(v.id)}
            />
          );
        })}

        {/* Linien: Heute und Soll-Ende */}
        <line x1={heute} x2={heute} y1={0} y2={Math.max(hoehe, p.hoehe)} className="tp-heute">
          <title>Heute</title>
        </line>
        {ber?.sollEnde != null && (
          <g>
            <line
              x1={achse.xEnde(ber.sollEnde)}
              x2={achse.xEnde(ber.sollEnde)}
              y1={0}
              y2={Math.max(hoehe, p.hoehe)}
              className="tp-sollende"
            />
            <text x={achse.xEnde(ber.sollEnde) + 4} y={12} className="tp-sollende-text">
              Soll-Ende {ber.sollEndeDatum ? datumKurz(ber.sollEndeDatum) : ''}
            </text>
          </g>
        )}

        {/* Anordnungsbeziehungen (vernetzter Balkenplan) */}
        {ber &&
          daten.beziehungen.map((b) => {
            const iv = zeileVon.get(b.von_id);
            const in_ = zeileVon.get(b.nach_id);
            const tv = ber.termine[b.von_id];
            const tn = ber.termine[b.nach_id];
            if (iv === undefined || in_ === undefined || !tv || !tn) return null;
            if (Math.max(iv, in_) < erste || Math.min(iv, in_) > letzte) return null;
            const quelleEnde = b.art === 'EA' || b.art === 'EE';
            const zielAnfang = b.art === 'EA' || b.art === 'AA';
            const punkt = (t: { faz: number; fez: number }, ende: boolean) =>
              t.faz === t.fez
                ? achse.xPunkt(t.faz)
                : ende
                  ? achse.xEnde(t.fez)
                  : achse.xAnfang(t.faz);
            const x1 = punkt(tv, quelleEnde);
            const x2 = punkt(tn, !zielAnfang);
            const krit = kritischeBez.has(b.id);
            const zwischen = (Math.min(iv, in_) + 1) * ZEILE;
            return (
              <path
                key={b.id}
                d={pfeilWeg(x1, mitte(iv), x2, mitte(in_), quelleEnde, zielAnfang, 6, zwischen)}
                className={`tp-pfeil${krit ? ' kritisch' : ''}`}
                markerEnd={krit ? 'url(#tp-pfeil-krit)' : 'url(#tp-pfeil)'}
              />
            );
          })}

        {/* Balken */}
        {ber &&
          zeilen.slice(erste, letzte).map((v, k) => {
            const i = erste + k;
            const t = ber.termine[v.id];
            if (!t) return null;
            const y = mitte(i);
            const titel = `${v.nr} ${v.name}\n${datumKurz(t.anfang)} – ${datumKurz(t.ende)} · GP ${t.gp} AT${v.quelle_annahme ? `\nQuelle/Annahme: ${v.quelle_annahme}` : ''}`;
            const risiko = p.risikoNr.get(v.id);
            const klick = {
              onPointerDown: (e: PointerEvent<SVGElement>) => {
                e.stopPropagation();
                p.setAuswahl(v.id);
              },
              onDoubleClick: () => p.onEigenschaften(v.id),
            };
            if (v.typ === 'sammel') {
              const x1 = achse.xAnfang(t.faz);
              const x2 = achse.xEnde(t.fez);
              return (
                <g key={v.id} className={`tp-sammel${t.kritisch ? ' kritisch' : ''}`} {...klick}>
                  <title>{titel}</title>
                  <path
                    d={`M${x1},${y + 6} V${y - 4} H${x2} V${y + 6} L${x2 - 5},${y} H${x1 + 5} Z`}
                  />
                </g>
              );
            }
            if (v.typ === 'meilenstein' || t.faz === t.fez) {
              const x = achse.xPunkt(t.faz);
              return (
                <g
                  key={v.id}
                  className={`tp-meilenstein${t.kritisch ? ' kritisch' : ''}${v.schnittstelle ? ' schnittstelle' : ''}`}
                  {...klick}
                >
                  <title>{titel}</title>
                  <path d={`M${x},${y - 8} L${x + 8},${y} L${x},${y + 8} L${x - 8},${y} Z`} />
                  <text x={x + 12} y={y + 4} className="tp-balkentext">
                    {v.name}
                  </text>
                  {risiko && <RisikoMarke x={x + 16 + v.name.length * 6} y={y} nr={risiko} />}
                </g>
              );
            }
            const x1 = achse.xAnfang(t.faz);
            const x2 = achse.xEnde(t.fez);
            const xs = achse.xEnde(t.sez);
            return (
              <g key={v.id} {...klick}>
                <title>{titel}</title>
                {t.gp > 0 && (
                  <rect
                    x={x2}
                    y={y - 4}
                    width={Math.max(0, xs - x2)}
                    height={8}
                    className="tp-puffer"
                    fill="url(#tp-schraffur)"
                  />
                )}
                {t.gp < 0 && (
                  <rect
                    x={xs}
                    y={y + 7}
                    width={Math.max(0, x2 - xs)}
                    height={3}
                    className="tp-negativ"
                  />
                )}
                <rect
                  x={x1}
                  y={y - 7}
                  width={Math.max(2, x2 - x1)}
                  height={14}
                  rx={2}
                  className={`tp-balken-rect${t.kritisch ? ' kritisch' : ''}`}
                />
                {risiko && (
                  <RisikoMarke x={Math.max(x2, t.gp > 0 ? xs : x2) + 10} y={y} nr={risiko} />
                )}
                {!p.nurLesen && (
                  <circle
                    cx={x2}
                    cy={y}
                    r={5}
                    className="tp-griff"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(
                        e.pointerId,
                      );
                      setZiehen({ von: v.id, x1: x2, y1: y, x2, y2: y });
                    }}
                  >
                    <title>Ziehen, um eine Beziehung (EA) zu einem anderen Vorgang anzulegen</title>
                  </circle>
                )}
              </g>
            );
          })}

        {ziehen && (
          <line
            x1={ziehen.x1}
            y1={ziehen.y1}
            x2={ziehen.x2}
            y2={ziehen.y2}
            className="tp-ziehlinie"
          />
        )}
      </svg>
    </div>
  );
}

function RisikoMarke({ x, y, nr }: { x: number; y: number; nr: number }) {
  return (
    <g className="tp-risikomarke">
      <circle cx={x} cy={y} r={8} />
      <text x={x} y={y + 4} textAnchor="middle">
        {nr}
      </text>
    </g>
  );
}
