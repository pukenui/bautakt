import type { DruckProps } from '@bautakt/ui';
import { datumKurz } from '../daten.js';
import { meilensteinliste } from '../listen.js';
import { meilensteinSpalten } from '../listenSpalten.js';
import { Zeitleiste, zeitleisteLayout } from '../Zeitleiste.js';
import {
  DRUCK_TABELLENKOPF,
  DRUCK_ZEILE,
  DruckListe,
  druckKalender,
  seitenAufteilen,
  useDruckDaten,
} from './DruckListe.js';
import { FUSS_HOEHE, INNEN, KOPF_HOEHE, Plankopf, Seite } from './DruckRahmen.js';
import './druck.css';

/** Meilensteinplan als Druckansicht (E-48, E-50): Zeitleiste auf Seite 1, darunter die Tabelle. */
export function DruckMeilensteinplan({
  api,
  parameter,
  format,
  projektname,
  fertig,
  fehler,
}: DruckProps) {
  const daten = useDruckDaten(api, parameter, fertig, fehler);
  const ersteller = String(parameter['ersteller'] ?? '');
  if (!daten || !daten.berechnung.ok) return null;
  const ber = daten.berechnung;
  const kal = druckKalender(daten);
  const liste = meilensteinliste(daten);
  const eintraege = liste.map((m) => ({ art: 'vorgang' as const, v: m.v }));
  const spalten = meilensteinSpalten(daten);

  const leiste = <Zeitleiste daten={daten} eintraege={liste} kal={kal} breite={INNEN.breite} />;
  const leisteHoehe = liste.length
    ? zeitleisteLayout(daten, liste, kal, INNEN.breite).hoehe + 10
    : 0;
  const platz = INNEN.hoehe - KOPF_HOEHE - DRUCK_TABELLENKOPF - FUSS_HOEHE - 8;
  const proSeite = Math.max(5, Math.floor(platz / DRUCK_ZEILE));
  const ersteSeite = Math.max(3, Math.floor((platz - leisteHoehe) / DRUCK_ZEILE));
  const seiten = seitenAufteilen(eintraege, format, proSeite, ersteSeite);

  return (
    <div className="druck">
      {seiten.map((teil, s) => (
        <Seite key={s} format={format}>
          <Plankopf
            projektname={projektname}
            daten={daten}
            darstellung="Meilensteinplan"
            ersteller={ersteller}
            seite={s + 1}
            seiten={seiten.length}
          />
          {s === 0 && liste.length > 0 && <div className="druck-zeitleiste">{leiste}</div>}
          <div className="druck-plan">
            {liste.length === 0 ? (
              <p>Der Plan enthält keine Meilensteine.</p>
            ) : (
              <DruckListe
                spalten={spalten}
                eintraege={teil}
                zeilenKlasse={(e) => (ber.termine[e.v.id]?.kritisch ? 'kritisch' : '')}
              />
            )}
          </div>
          <footer className="druck-fuss" style={{ minHeight: FUSS_HOEHE - 40 }}>
            <div className="druck-hinweis">
              ◆ schwarz = Meilenstein · rot = kritisch · orange = Schnittstellentermin · grün =
              erreicht · ◇ grau = Soll-Termin
              {daten.vergleich && <> („{daten.vergleich.standName}“)</>}
              {daten.plan.stichtag && (
                <> · Prognose zum Stichtag {datumKurz(daten.plan.stichtag)}</>
              )}{' '}
              · GP und Abw. in AT (+ = später)
            </div>
          </footer>
        </Seite>
      ))}
    </div>
  );
}
