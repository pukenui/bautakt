import type { DruckProps } from '@bautakt/ui';
import { useEffect, useMemo, useState } from 'react';
import type { MtaDaten } from '../../gemeinsam/mta.js';
import { MtaTabelle } from '../MtaAnsicht.js';
import { MtaDiagramm } from '../MtaDiagramm.js';
import { useDruckDaten } from './DruckListe.js';
import { FUSS_HOEHE, Plankopf, Seite } from './DruckRahmen.js';
import './druck.css';

/** Meilenstein-Trendanalyse als Druckansicht (E-73): Diagramm und Tabelle auf einer Seite. */
export function DruckMta({ api, parameter, format, projektname, fertig, fehler }: DruckProps) {
  const [mta, setMta] = useState<MtaDaten | null>(null);
  // Plandaten (Plankopf) laden; „fertig“ erst melden, wenn auch die MTA da ist
  const daten = useDruckDaten(api, parameter, () => undefined, fehler);
  const planId = String(parameter['planId'] ?? '');
  const ersteller = String(parameter['ersteller'] ?? '');
  const ausgeblendet = useMemo(
    () =>
      new Set(
        Array.isArray(parameter['mtaAusgeblendet'])
          ? (parameter['mtaAusgeblendet'] as string[])
          : [],
      ),
    [parameter],
  );
  const mitAktuell = parameter['mtaAktuell'] !== false;

  useEffect(() => {
    void api
      .abfrage<MtaDaten>('termine', 'mta', { planId })
      .then((a) => (a.ok ? setMta(a.wert) : fehler(a.fehler)));
  }, [api, planId, fehler]);
  useEffect(() => {
    if (daten && mta) requestAnimationFrame(() => requestAnimationFrame(fertig));
  }, [daten, mta, fertig]);
  if (!daten || !mta) return null;

  const sichtbar = new Set(
    mta.meilensteine.filter((m) => !ausgeblendet.has(m.id)).map((m) => m.id),
  );
  return (
    <div className="druck">
      <Seite format={format}>
        <Plankopf
          projektname={projektname}
          daten={daten}
          darstellung="Meilenstein-Trendanalyse"
          ersteller={ersteller}
          seite={1}
          seiten={1}
        />
        <div className="druck-mta">
          <MtaDiagramm daten={mta} sichtbar={sichtbar} mitAktuell={mitAktuell} groesse={620} />
          <div className="druck-mta-tabelle">
            <MtaTabelle daten={mta} sichtbar={sichtbar} mitAktuell={mitAktuell} />
          </div>
        </div>
        <footer className="druck-fuss" style={{ minHeight: FUSS_HOEHE - 50 }}>
          <div className="druck-hinweis">
            Waagerecht Berichtsdatum, senkrecht Meilensteintermin (gleicher Maßstab); Diagonale =
            Termin gleich Berichtsdatum · steigende Linie = Verschiebung nach hinten · gefüllte
            Raute = erreicht
            {mitAktuell && ' · gestrichelt = aktueller, nicht festgehaltener Stand'} · Verschiebung
            in Kalendertagen gegenüber dem ersten Bericht
          </div>
        </footer>
      </Seite>
    </div>
  );
}
