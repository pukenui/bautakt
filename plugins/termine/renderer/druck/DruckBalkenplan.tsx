import { Arbeitskalender, tagVonDatum } from '@bautakt/rechnen-kalender';
import type { DruckProps } from '@bautakt/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PlanDaten, VorgangMitEbene } from '../../gemeinsam/typen.js';
import { datumKurz, sichtbareVorgaenge } from '../daten.js';
import { pfeilWeg, Zeitachse, zoomFuerMassstab } from '../zeitachse.js';
import { FUSS_HOEHE, INNEN, KOPF_HOEHE, Plankopf, Seite } from './DruckRahmen.js';
import './druck.css';

const ZEILE = 20;
const ACHSE = 40;
const SPALTEN = [
  { titel: 'Nr.', breite: 40 },
  { titel: 'Vorgang', breite: 260 },
  { titel: 'Dauer', breite: 44 },
  { titel: 'Anfang', breite: 76 },
  { titel: 'Ende', breite: 76 },
] as const;
const TABELLE = SPALTEN.reduce((s, x) => s + x.breite, 0);
const GANTT = INNEN.breite - TABELLE;

/** Balkenplan für die Bauherrschaft (E-21) als Druckansicht: A3 quer, Kopf und Legende je Seite. */
export function DruckBalkenplan({
  api,
  parameter,
  format,
  projektname,
  fertig,
  fehler,
}: DruckProps) {
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const planId = String(parameter['planId'] ?? '');
  const zugeklappt = useMemo(
    () => (Array.isArray(parameter['zugeklappt']) ? (parameter['zugeklappt'] as string[]) : []),
    [parameter],
  );
  const ersteller = String(parameter['ersteller'] ?? '');
  const sollStandId =
    typeof parameter['sollStandId'] === 'string' ? parameter['sollStandId'] : null;

  useEffect(() => {
    void api
      .abfrage<PlanDaten>('termine', 'plan', { planId, sollStandId })
      .then((a) => (a.ok ? setDaten(a.wert) : fehler(a.fehler)));
  }, [api, planId, sollStandId, fehler]);

  useEffect(() => {
    if (!daten) return;
    if (!daten.berechnung.ok)
      fehler(`Der Plan kann nicht gerechnet werden: ${daten.berechnung.fehler}`);
    else requestAnimationFrame(() => requestAnimationFrame(fertig));
  }, [daten, fertig, fehler]);

  if (!daten || !daten.berechnung.ok) return null;
  const ber = daten.berechnung;
  const zeilen = sichtbareVorgaenge(daten.vorgaenge, zugeklappt).filter((v) => ber.termine[v.id]);
  const kal = new Arbeitskalender({
    start: daten.plan.projektstart ?? new Date().toISOString().slice(0, 10),
    arbeitstage: daten.kalender.arbeitstage,
    bundesland: daten.kalender.bundesland,
    ruhezeiten: daten.ruhezeiten.map((r) => ({
      von: r.von,
      bis: r.bis,
      name: r.name || 'Ruhezeit',
    })),
  });

  // Zeitraum: alle Termine, Soll-Ende, Projektstart; Plan passt auf die Seitenbreite
  const tage = [tagVonDatum(kal.start)];
  for (const t of Object.values(ber.termine))
    tage.push(tagVonDatum(t.anfang), tagVonDatum(t.ende), tagVonDatum(t.spaetEnde));
  if (ber.sollEndeDatum) tage.push(tagVonDatum(ber.sollEndeDatum));
  const spanne = Math.max(14, Math.max(...tage) - Math.min(...tage) + 1);
  const rand = Math.ceil(spanne * 0.02) + 1;
  const von = Math.min(...tage) - rand;
  const bis = Math.max(...tage) + rand + 1;
  const px = GANTT / (bis - von);
  const achse = new Zeitachse(von, bis, zoomFuerMassstab(px), kal, px);

  // Seiten aufteilen (PDF); PNG = eine durchgehende Seite
  const proSeite = Math.max(
    5,
    Math.floor((INNEN.hoehe - KOPF_HOEHE - ACHSE - FUSS_HOEHE - 8) / ZEILE),
  );
  const seiten: VorgangMitEbene[][] = [];
  if (format === 'png') seiten.push(zeilen);
  else
    for (let i = 0; i < Math.max(1, zeilen.length); i += proSeite)
      seiten.push(zeilen.slice(i, i + proSeite));

  const risikoNr = new Map<string, number>();
  for (const v of daten.vorgaenge) if (v.risiko.trim()) risikoNr.set(v.id, risikoNr.size + 1);

  return (
    <div className="druck">
      {seiten.map((liste, s) => (
        <Seite key={s} format={format}>
          <Plankopf
            projektname={projektname}
            daten={daten}
            darstellung="Balkenplan"
            ersteller={ersteller}
            seite={s + 1}
            seiten={seiten.length}
          />
          <div className="druck-plan">
            <TabellenTeil zeilen={liste} daten={daten} risikoNr={risikoNr} />
            <GanttTeil zeilen={liste} daten={daten} achse={achse} risikoNr={risikoNr} />
          </div>
          <Legende
            daten={daten}
            risiken={liste.filter((v) => risikoNr.has(v.id))}
            risikoNr={risikoNr}
          />
        </Seite>
      ))}
    </div>
  );
}

function TabellenTeil({
  zeilen,
  daten,
  risikoNr,
}: {
  zeilen: VorgangMitEbene[];
  daten: PlanDaten;
  risikoNr: Map<string, number>;
}) {
  const ber = daten.berechnung.ok ? daten.berechnung : null;
  return (
    <table className="druck-tabelle" style={{ width: TABELLE }}>
      <colgroup>
        {SPALTEN.map((s) => (
          <col key={s.titel} style={{ width: s.breite }} />
        ))}
      </colgroup>
      <thead style={{ height: ACHSE }}>
        <tr>
          {SPALTEN.map((s) => (
            <th key={s.titel}>{s.titel}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {zeilen.map((v) => {
          const t = ber?.termine[v.id];
          return (
            <tr
              key={v.id}
              style={{ height: ZEILE }}
              className={`${t?.kritisch ? 'kritisch' : ''} ${v.typ}`}
            >
              <td>{v.nr}</td>
              <td style={{ paddingLeft: 4 + v.ebene * 12 }}>
                {v.typ === 'meilenstein' && (
                  <span className={v.schnittstelle ? 'schnittstelle' : ''}>◆ </span>
                )}
                {v.name}
                {risikoNr.has(v.id) && <span className="druck-risiko">{risikoNr.get(v.id)}</span>}
              </td>
              <td className="rechts">{t ? t.fez - t.faz : ''}</td>
              <td>{t ? datumKurz(t.anfang) : ''}</td>
              <td>{t ? datumKurz(t.ende) : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GanttTeil({
  zeilen,
  daten,
  achse,
  risikoNr,
}: {
  zeilen: VorgangMitEbene[];
  daten: PlanDaten;
  achse: Zeitachse;
  risikoNr: Map<string, number>;
}) {
  const ber = daten.berechnung.ok ? daten.berechnung : null;
  if (!ber) return null;
  const hoehe = ACHSE + zeilen.length * ZEILE;
  const kopf = achse.kopf();
  const zeileVon = new Map(zeilen.map((v, i) => [v.id, i]));
  const y = (i: number) => ACHSE + i * ZEILE + ZEILE / 2;
  const krit = new Set(ber.kritischeBeziehungen);
  const heute = new Date();
  const heuteX = achse.xDatum(
    `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`,
  );
  return (
    <svg width={GANTT} height={hoehe} className="druck-gantt">
      <defs>
        <pattern
          id="dr-schraffur"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="5" className="tp-schraffur" />
        </pattern>
        <marker
          id="dr-pfeil"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" className="tp-pfeilspitze" />
        </marker>
        <marker
          id="dr-pfeil-krit"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" className="tp-pfeilspitze kritisch" />
        </marker>
      </defs>
      {achse
        .freieStreifen()
        .filter((s) => s.art === 'ruhezeit' || achse.zoom === 'tag')
        .map((s) => (
          <rect
            key={`f${s.x}`}
            x={s.x}
            y={ACHSE}
            width={s.breite}
            height={hoehe - ACHSE}
            className={`tp-frei ${s.art}`}
          />
        ))}
      {kopf.oben.map((a) => (
        <g key={`o${a.x}`}>
          <line x1={a.x} x2={a.x} y1={0} y2={hoehe} className="druck-raster grob" />
          <text x={a.x + 3} y={14} className="tp-kopftext">
            {a.breite > a.text.length * 6 + 6 ? a.text : ''}
          </text>
        </g>
      ))}
      {kopf.unten.map((a) => (
        <g key={`u${a.x}`}>
          <line x1={a.x} x2={a.x} y1={ACHSE / 2} y2={ACHSE} className="druck-raster" />
          <text
            x={a.x + a.breite / 2}
            y={ACHSE - 6}
            textAnchor="middle"
            className="tp-kopftext klein"
          >
            {a.breite >= 14 ? a.text : ''}
          </text>
        </g>
      ))}
      <line x1={0} x2={GANTT} y1={ACHSE} y2={ACHSE} className="druck-raster grob" />
      <line x1={0} x2={GANTT} y1={ACHSE / 2} y2={ACHSE / 2} className="druck-raster" />
      {zeilen.map((_, i) => (
        <line
          key={`z${i}`}
          x1={0}
          x2={GANTT}
          y1={ACHSE + (i + 1) * ZEILE}
          y2={ACHSE + (i + 1) * ZEILE}
          className="druck-zeilenlinie"
        />
      ))}
      {heuteX >= 0 && heuteX <= GANTT && (
        <line x1={heuteX} x2={heuteX} y1={ACHSE} y2={hoehe} className="tp-heute" />
      )}
      {daten.plan.stichtag && (
        <line
          x1={achse.xTag(tagVonDatum(daten.plan.stichtag) + 1)}
          x2={achse.xTag(tagVonDatum(daten.plan.stichtag) + 1)}
          y1={ACHSE}
          y2={hoehe}
          className="tp-stichtag"
        />
      )}
      {ber.sollEnde !== null && (
        <line
          x1={achse.xEnde(ber.sollEnde)}
          x2={achse.xEnde(ber.sollEnde)}
          y1={ACHSE}
          y2={hoehe}
          className="tp-sollende"
        />
      )}

      {daten.beziehungen.map((b) => {
        const iv = zeileVon.get(b.von_id);
        const in_ = zeileVon.get(b.nach_id);
        const tv = ber.termine[b.von_id];
        const tn = ber.termine[b.nach_id];
        if (iv === undefined || in_ === undefined || !tv || !tn) return null;
        const quelleEnde = b.art === 'EA' || b.art === 'EE';
        const zielAnfang = b.art === 'EA' || b.art === 'AA';
        const punkt = (t: { faz: number; fez: number }, ende: boolean) =>
          t.faz === t.fez ? achse.xPunkt(t.faz) : ende ? achse.xEnde(t.fez) : achse.xAnfang(t.faz);
        const k = krit.has(b.id);
        return (
          <path
            key={b.id}
            d={pfeilWeg(
              punkt(tv, quelleEnde),
              y(iv),
              punkt(tn, !zielAnfang),
              y(in_),
              quelleEnde,
              zielAnfang,
              5,
              ACHSE + (Math.min(iv, in_) + 1) * ZEILE,
            )}
            className={`tp-pfeil${k ? ' kritisch' : ''}`}
            markerEnd={k ? 'url(#dr-pfeil-krit)' : 'url(#dr-pfeil)'}
          />
        );
      })}

      {zeilen.map((v, i) => {
        const t = ber.termine[v.id];
        if (!t) return null;
        const ym = y(i);
        const nr = risikoNr.get(v.id);
        if (v.typ === 'sammel') {
          const x1 = achse.xAnfang(t.faz);
          const x2 = achse.xEnde(t.fez);
          return (
            <g key={v.id} className={`tp-sammel${t.kritisch ? ' kritisch' : ''}`}>
              <path
                d={`M${x1},${ym + 5} V${ym - 3} H${x2} V${ym + 5} L${x2 - 4},${ym} H${x1 + 4} Z`}
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
            >
              <path d={`M${x},${ym - 7} L${x + 7},${ym} L${x},${ym + 7} L${x - 7},${ym} Z`} />
              {/* Beschriftung links vom Meilenstein, wenn rechts kein Platz ist */}
              <text
                x={x + 90 > GANTT ? x - 10 : x + 10}
                y={ym + 4}
                textAnchor={x + 90 > GANTT ? 'end' : 'start'}
                className="druck-balkentext"
              >
                {datumKurz(t.ende)}
              </text>
              {nr && <RisikoMarke x={x + 90 > GANTT ? x - 82 : x + 76} y={ym} nr={nr} />}
            </g>
          );
        }
        const x1 = achse.xAnfang(t.faz);
        const x2 = achse.xEnde(t.fez);
        const xs = achse.xEnde(t.sez);
        const soll = daten.vergleich?.termine[v.id];
        return (
          <g key={v.id}>
            {t.gp > 0 && (
              <rect
                x={x2}
                y={ym - 3}
                width={Math.max(0, xs - x2)}
                height={6}
                className="tp-puffer"
                fill="url(#dr-schraffur)"
              />
            )}
            {t.gp < 0 && (
              <rect
                x={xs}
                y={ym + 5}
                width={Math.max(0, x2 - xs)}
                height={2.5}
                className="tp-negativ"
              />
            )}
            {soll && (
              <rect
                x={achse.xDatum(soll.anfang)}
                y={ym + 4}
                width={Math.max(
                  1.5,
                  achse.xTag(tagVonDatum(soll.ende) + 1) - achse.xDatum(soll.anfang),
                )}
                height={3}
                className="tp-soll"
              />
            )}
            <rect
              x={x1}
              y={soll ? ym - 6 : ym - 5}
              width={Math.max(1.5, x2 - x1)}
              height={soll ? 9 : 10}
              rx={1.5}
              className={`tp-balken-rect${t.kritisch ? ' kritisch' : ''}${t.status === 'fertig' ? ' fertig' : ''}`}
            />
            {t.status === 'begonnen' && daten.plan.stichtag && (
              <rect
                x={x1}
                y={ym - 3}
                width={Math.max(
                  0,
                  Math.min(achse.xTag(tagVonDatum(daten.plan.stichtag) + 1), x2) - x1,
                )}
                height={3}
                className="tp-fortschritt"
              />
            )}
            {nr && <RisikoMarke x={Math.max(x2, t.gp > 0 ? xs : x2) + 9} y={ym} nr={nr} />}
          </g>
        );
      })}
    </svg>
  );
}

function RisikoMarke({ x, y, nr }: { x: number; y: number; nr: number }) {
  return (
    <g className="tp-risikomarke">
      <circle cx={x} cy={y} r={7} />
      <text x={x} y={y + 3.5} textAnchor="middle">
        {nr}
      </text>
    </g>
  );
}

function Legende({
  daten,
  risiken,
  risikoNr,
}: {
  daten: PlanDaten;
  risiken: VorgangMitEbene[];
  risikoNr: Map<string, number>;
}) {
  return (
    <footer className="druck-fuss" style={{ minHeight: FUSS_HOEHE }}>
      <div className="druck-legende">
        <Symbol>
          <rect x={2} y={5} width={26} height={8} className="tp-balken-rect" />
        </Symbol>
        Vorgang
        <Symbol>
          <rect x={2} y={5} width={26} height={8} className="tp-balken-rect kritisch" />
        </Symbol>
        kritischer Weg
        <Symbol>
          <rect x={2} y={6} width={26} height={6} className="tp-puffer" fill="url(#dr-schraffur)" />
        </Symbol>
        Gesamtpuffer
        <Symbol>
          <rect x={2} y={8} width={26} height={2.5} className="tp-negativ" />
        </Symbol>
        negativer Puffer
        <Symbol>
          <path d="M15,2 L22,9 L15,16 L8,9 Z" className="tp-meilenstein-symbol" />
        </Symbol>
        Meilenstein
        <Symbol>
          <path d="M15,2 L22,9 L15,16 L8,9 Z" className="tp-meilenstein-symbol schnittstelle" />
        </Symbol>
        Schnittstellentermin
        <Symbol>
          <path d="M2,13 V5 H28 V13 L24,9 H6 Z" className="tp-sammel-symbol" />
        </Symbol>
        Sammelvorgang
        <Symbol>
          <rect x={2} y={1} width={26} height={16} className="tp-frei ruhezeit" />
        </Symbol>
        Ruhezeit
        {daten.plan.soll_ende && (
          <>
            <Symbol>
              <line x1={15} x2={15} y1={0} y2={18} className="tp-sollende" />
            </Symbol>
            Soll-Ende
          </>
        )}
        <Symbol>
          <line x1={15} x2={15} y1={0} y2={18} className="tp-heute" />
        </Symbol>
        Stand (heute)
        {daten.plan.stichtag && (
          <>
            <Symbol>
              <rect x={2} y={4} width={26} height={9} className="tp-balken-rect" />
              <rect x={2} y={7} width={14} height={3} className="tp-fortschritt" />
            </Symbol>
            erledigt (Ist)
            <Symbol>
              <line x1={15} x2={15} y1={0} y2={18} className="tp-stichtag" />
            </Symbol>
            Stichtag {datumKurz(daten.plan.stichtag)}
          </>
        )}
        {daten.vergleich && (
          <>
            <Symbol>
              <rect x={2} y={8} width={26} height={3} className="tp-soll" />
            </Symbol>
            Soll „{daten.vergleich.standName}“
          </>
        )}
      </div>
      {risiken.length > 0 && (
        <div className="druck-risiken">
          <strong>Risiken:</strong>
          {risiken.map((v) => (
            <span key={v.id}>
              <span className="druck-risiko">{risikoNr.get(v.id)}</span> {v.nr} {v.name}: {v.risiko}
            </span>
          ))}
        </div>
      )}
      <div className="druck-hinweis">
        Dauern in Arbeitstagen (AT); Kalender:{' '}
        {daten.kalender.bundesland === 'NW' ? 'gesetzliche Feiertage NRW' : 'ohne Feiertage'}
        {daten.ruhezeiten.length > 0 &&
          `; Ruhezeiten: ${daten.ruhezeiten.map((r) => `${r.name || 'Ruhezeit'} ${datumKurz(r.von)} – ${datumKurz(r.bis)}`).join(', ')}`}
      </div>
    </footer>
  );
}

function Symbol({ children }: { children: ReactNode }) {
  return (
    <svg width={30} height={18} className="druck-symbol">
      {children}
    </svg>
  );
}
