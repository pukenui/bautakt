import type { DruckProps } from '@bautakt/ui';
import { useEffect, useState } from 'react';
import type { PlanDaten } from '../../gemeinsam/typen.js';
import { KNOTEN, netzLayout } from '../netzlayout.js';
import {
  knotenKlasse,
  NetzKantenLinie,
  NetzKnotenInhalt,
  NetzPfeilMarker,
  netzKanten,
} from '../netzgrafik.js';
import { FUSS_HOEHE, INNEN, KOPF_HOEHE, Plankopf, Seite } from './DruckRahmen.js';
import './druck.css';

/** Kleinster Maßstab, bevor der Netzplan auf mehrere Seiten verteilt wird. */
const MIN_MASSSTAB = 0.55;

/** Netzplan im Übungsformat (E-20) als Druckansicht: auf eine A3-Seite eingepasst, sonst gekachelt. */
export function DruckNetzplan({ api, parameter, format, projektname, fertig, fehler }: DruckProps) {
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const planId = String(parameter['planId'] ?? '');
  const ersteller = String(parameter['ersteller'] ?? '');

  useEffect(() => {
    void api
      .abfrage<PlanDaten>('termine', 'plan', { planId })
      .then((a) => (a.ok ? setDaten(a.wert) : fehler(a.fehler)));
  }, [api, planId, fehler]);
  useEffect(() => {
    if (!daten) return;
    if (!daten.berechnung.ok)
      fehler(`Der Plan kann nicht gerechnet werden: ${daten.berechnung.fehler}`);
    else requestAnimationFrame(() => requestAnimationFrame(fertig));
  }, [daten, fertig, fehler]);

  if (!daten || !daten.berechnung.ok) return null;
  const ber = daten.berechnung;
  const knoten = daten.vorgaenge.filter((v) => v.typ !== 'sammel');
  const lage = netzLayout(
    knoten.map((v) => ({ id: v.id, x: v.netz_x, y: v.netz_y, faz: ber.termine[v.id]?.faz ?? 0 })),
    daten.beziehungen.map((b) => ({ von: b.von_id, nach: b.nach_id })),
  );
  const pos = (id: string) => lage.get(id) ?? { x: 0, y: 0 };
  const kanten = netzKanten(daten.beziehungen, pos);
  const krit = new Set(ber.kritischeBeziehungen);

  // Zeichnungsgrenzen (inkl. Umwege unterhalb der Knoten)
  const xs = knoten.map((v) => pos(v.id).x);
  const ys = knoten.map((v) => pos(v.id).y);
  const minX = Math.min(0, ...xs) - 10;
  const minY = Math.min(0, ...ys) - 10;
  const breite = Math.max(200, ...xs.map((x) => x + KNOTEN.breite + 20)) - minX;
  const hoehe = Math.max(100, ...ys.map((y) => y + KNOTEN.hoehe + 40)) - minY;

  const verfuegbarH = INNEN.hoehe - KOPF_HOEHE - FUSS_HOEHE - 10;
  const einpassen = Math.min(1, INNEN.breite / breite, verfuegbarH / hoehe);
  const massstab =
    format === 'png' ? Math.min(1, INNEN.breite / breite) : Math.max(einpassen, MIN_MASSSTAB);
  const kachelB = INNEN.breite / massstab;
  const kachelH = (format === 'png' ? hoehe * massstab : verfuegbarH) / massstab;
  const nx = Math.max(1, Math.ceil(breite / kachelB - 0.001));
  const ny = format === 'png' ? 1 : Math.max(1, Math.ceil(hoehe / kachelH - 0.001));
  const kacheln: { x: number; y: number }[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) kacheln.push({ x: minX + i * kachelB, y: minY + j * kachelH });

  return (
    <div className="druck">
      {kacheln.map((k, s) => (
        <Seite key={s} format={format}>
          <Plankopf
            projektname={projektname}
            daten={daten}
            darstellung={`Netzplan (DIN 69900)${kacheln.length > 1 ? ` – Ausschnitt ${s + 1}` : ''}`}
            ersteller={ersteller}
            seite={s + 1}
            seiten={kacheln.length}
          />
          <svg
            width={INNEN.breite}
            height={Math.min(kachelH, hoehe) * massstab}
            viewBox={`${k.x} ${k.y} ${kachelB} ${Math.min(kachelH, hoehe)}`}
            className="druck-netz"
          >
            <NetzPfeilMarker />
            {kanten.map((kante) => (
              <g key={kante.b.id} className={`np-kante${krit.has(kante.b.id) ? ' kritisch' : ''}`}>
                <NetzKantenLinie k={kante} kritisch={krit.has(kante.b.id)} />
              </g>
            ))}
            {knoten.map((v) => {
              const p = pos(v.id);
              const t = ber.termine[v.id];
              return (
                <g key={v.id} transform={`translate(${p.x},${p.y})`} className={knotenKlasse(v, t)}>
                  <NetzKnotenInhalt v={v} t={t} rollen={daten.plan.art === 'rollen'} />
                </g>
              );
            })}
          </svg>
          <footer className="druck-fuss" style={{ minHeight: FUSS_HOEHE }}>
            <div className="druck-legende">
              <span className="np-legende-knoten">
                <span>Nr. Vorgang</span>
                <span>FAZ | D | FEZ</span>
                <span>SAZ | GP | FP | SEZ</span>
              </span>
              <span>
                Zeiten in Arbeitstagen (AT), Zeitpunkte ab 0. Am Pfeil: Beziehung und Abstand (z. B.
                +10EA). Rot und dick: kritischer Weg.
              </span>
            </div>
            {massstab < 1 && (
              <div className="druck-hinweis">Maßstab {Math.round(massstab * 100)} %</div>
            )}
          </footer>
        </Seite>
      ))}
    </div>
  );
}
