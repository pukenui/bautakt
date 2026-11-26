import type { DruckProps } from '@bautakt/ui';
import { useMemo } from 'react';
import { datumKurz, sichtbareVorgaenge } from '../daten.js';
import { filterLesen, filterText, terminliste } from '../listen.js';
import { terminlisteSpalten } from '../listenSpalten.js';
import { heuteIso } from '../TerminlisteAnsicht.js';
import {
  DRUCK_TABELLENKOPF,
  DRUCK_ZEILE,
  DruckListe,
  seitenAufteilen,
  useDruckDaten,
} from './DruckListe.js';
import { FUSS_HOEHE, INNEN, KOPF_HOEHE, Plankopf, Seite } from './DruckRahmen.js';
import './druck.css';

/** Terminliste als Druckansicht (E-50): Filter und Gruppierung wie angezeigt, im Fuß genannt. */
export function DruckTerminliste({
  api,
  parameter,
  format,
  projektname,
  fertig,
  fehler,
}: DruckProps) {
  const daten = useDruckDaten(api, parameter, fertig, fehler);
  const filter = useMemo(() => filterLesen(parameter['filter']), [parameter]);
  const zugeklappt = useMemo(
    () => (Array.isArray(parameter['zugeklappt']) ? (parameter['zugeklappt'] as string[]) : []),
    [parameter],
  );
  const ersteller = String(parameter['ersteller'] ?? '');
  if (!daten || !daten.berechnung.ok) return null;
  const ber = daten.berechnung;

  const bezug = daten.plan.stichtag ?? heuteIso();
  const eintraege = terminliste(
    daten,
    sichtbareVorgaenge(daten.vorgaenge, zugeklappt),
    filter,
    bezug,
  );
  const spalten = terminlisteSpalten(daten, filter.gruppieren);
  const proSeite = Math.max(
    5,
    Math.floor((INNEN.hoehe - KOPF_HOEHE - DRUCK_TABELLENKOPF - FUSS_HOEHE - 8) / DRUCK_ZEILE),
  );
  const seiten = seitenAufteilen(eintraege, format, proSeite);
  const beschreibung = filterText(filter, bezug, datumKurz);

  return (
    <div className="druck">
      {seiten.map((liste, s) => (
        <Seite key={s} format={format}>
          <Plankopf
            projektname={projektname}
            daten={daten}
            darstellung="Terminliste"
            ersteller={ersteller}
            seite={s + 1}
            seiten={seiten.length}
          />
          <div className="druck-plan">
            <DruckListe
              spalten={spalten}
              eintraege={liste}
              einruecken={!filter.gruppieren}
              zeilenKlasse={(e) => (ber.termine[e.v.id]?.kritisch ? 'kritisch' : '')}
            />
          </div>
          <footer className="druck-fuss" style={{ minHeight: FUSS_HOEHE - 40 }}>
            <div>
              <strong>Auswahl:</strong> {beschreibung}
              {daten.plan.stichtag && (
                <> · Prognose zum Stichtag {datumKurz(daten.plan.stichtag)}</>
              )}
              {daten.vergleich && <> · Soll-Ende/Abw. gegenüber „{daten.vergleich.standName}“</>}
            </div>
            <div className="druck-hinweis">
              Rot = kritischer Weg · GP = Gesamtpuffer in AT · Abw. in AT (+ = später) · Dauer in
              Arbeitstagen (AT)
            </div>
          </footer>
        </Seite>
      ))}
    </div>
  );
}
