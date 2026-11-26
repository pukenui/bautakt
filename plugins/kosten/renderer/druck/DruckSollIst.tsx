import {
  FEST_STUFEN,
  KOSTEN_URSACHEN,
  STUFE_TEXT,
  STUFEN,
  type KostenUrsache,
  type Stufe,
} from '@bautakt/rechnen-kosten';
import type { DruckProps } from '@bautakt/ui';
import { useEffect, useState } from 'react';
import type { SollIstDaten, SollIstZeile } from '../../gemeinsam/typen.js';
import { betrag } from '../format.js';
import './druck.css';

const SEITE = { breite: 1587, hoehe: 1122, rand: 34 } as const;
const KOPF = 74;
const FUSS = 70;
const TABELLENKOPF = 30;
const ZEILE = 20;

const heute = () =>
  new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const datum = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '–';
const vorzeichen = (x: number | null) => (x === null ? '' : `${x > 0 ? '+' : ''}${betrag(x)}`);
const prozent = (x: number | null) =>
  x === null
    ? ''
    : `${x > 0 ? '+' : ''}${x.toLocaleString('de-DE', { minimumFractionDigits: 1 })} %`;

/** Soll-Ist der Kosten als Druckansicht (E-63). */
export function DruckSollIst({ api, parameter, format, projektname, fertig, fehler }: DruckProps) {
  const [daten, setDaten] = useState<SollIstDaten | null>(null);
  const ersteller = String(parameter['ersteller'] ?? '');
  const ebene = Number(parameter['ebene'] ?? 3);
  const bezug = (STUFEN as readonly string[]).includes(String(parameter['bezug']))
    ? (parameter['bezug'] as Stufe)
    : 'berechnung';

  useEffect(() => {
    void api
      .abfrage<SollIstDaten>('kosten', 'sollist', { bezug })
      .then((a) => (a.ok ? setDaten(a.wert) : fehler(a.fehler)));
  }, [api, bezug, fehler]);
  useEffect(() => {
    if (daten) requestAnimationFrame(() => requestAnimationFrame(fertig));
  }, [daten, fertig]);
  if (!daten) return null;

  const zeilen = daten.zeilen.filter((z) => z.ebene <= ebene);
  const proSeite = Math.max(
    5,
    Math.floor((SEITE.hoehe - 2 * SEITE.rand - KOPF - TABELLENKOPF - FUSS - 30) / ZEILE),
  );
  const seiten: SollIstZeile[][] = [];
  if (format === 'png' || zeilen.length === 0) seiten.push(zeilen);
  else for (let i = 0; i < zeilen.length; i += proSeite) seiten.push(zeilen.slice(i, i + proSeite));

  return (
    <div className="druck">
      {seiten.map((liste, s) => (
        <section
          key={s}
          className={`druck-seite ${format}`}
          style={
            format === 'pdf'
              ? { width: SEITE.breite, height: SEITE.hoehe, padding: SEITE.rand }
              : { width: SEITE.breite, padding: SEITE.rand }
          }
        >
          <header className="druck-kopf" style={{ height: KOPF }}>
            <div>
              <div className="druck-titel">{projektname} – Kosten Soll-Ist (DIN 276)</div>
              <div className="druck-untertitel">
                Bezugsstufe {STUFE_TEXT[bezug]} · Prognose {betrag(daten.gesamt.prognose)} € ·
                Abweichung {vorzeichen(daten.gesamt.abweichung)} € (
                {prozent(daten.gesamt.abweichungProzent)})
              </div>
            </div>
            <table className="druck-kopf-rechts">
              <tbody>
                <tr>
                  <th>Stand</th>
                  <td>{heute()}</td>
                </tr>
                <tr>
                  <th>Ersteller</th>
                  <td>{ersteller || '–'}</td>
                </tr>
                {seiten.length > 1 && (
                  <tr>
                    <th>Seite</th>
                    <td>
                      {s + 1} von {seiten.length}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </header>
          <table className="druck-tabelle kd-tabelle">
            <thead>
              <tr style={{ height: TABELLENKOPF }}>
                <th>KG</th>
                <th>Bezeichnung</th>
                {STUFEN.map((st) => (
                  <th key={st} className={`rechts${st === bezug ? ' kd-bezug' : ''}`}>
                    {STUFE_TEXT[st]}
                  </th>
                ))}
                <th className="rechts">Prognose</th>
                <th className="rechts">Abw. [€]</th>
                <th className="rechts">Abw. [%]</th>
                <th>Ursache</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((z) => (
                <tr key={z.kg} className={`kd-ebene${z.ebene}`} style={{ height: ZEILE }}>
                  <td style={{ paddingLeft: 4 + (z.ebene - 1) * 12 }}>{z.kg}</td>
                  <td>{z.bezeichnung}</td>
                  {STUFEN.map((st) => (
                    <td key={st} className={`rechts${st === bezug ? ' kd-bezug' : ''}`}>
                      {betrag(z.stufen[st])}
                      {z.vonHand.includes(st as (typeof FEST_STUFEN)[number]) ? ' ✎' : ''}
                    </td>
                  ))}
                  <td className="rechts">{betrag(z.prognose)}</td>
                  <td className={`rechts${z.abweichung && z.abweichung > 0 ? ' negativ' : ''}`}>
                    {vorzeichen(z.abweichung)}
                  </td>
                  <td className="rechts">{prozent(z.abweichungProzent)}</td>
                  <td>
                    {z.ursache ? KOSTEN_URSACHEN[z.ursache as KostenUrsache] : ''}
                    {z.ursacheText && `${z.ursache ? ': ' : ''}${z.ursacheText}`}
                  </td>
                </tr>
              ))}
            </tbody>
            {s === seiten.length - 1 && (
              <tfoot>
                <tr className="kd-massgebend">
                  <td colSpan={2}>Summe KG 100–800 netto</td>
                  {STUFEN.map((st) => (
                    <td key={st} className="rechts">
                      {betrag(daten.gesamt.stufen[st])}
                    </td>
                  ))}
                  <td className="rechts">{betrag(daten.gesamt.prognose)}</td>
                  <td className="rechts">{vorzeichen(daten.gesamt.abweichung)}</td>
                  <td className="rechts">{prozent(daten.gesamt.abweichungProzent)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          <footer className="druck-fuss" style={{ minHeight: FUSS - 20, marginTop: 'auto' }}>
            <div>
              {FEST_STUFEN.map(
                (st) => `${STUFE_TEXT[st]}: ${datum(daten.festgeschrieben[st])}`,
              ).join(' · ')}{' '}
              · Kostenanschlag = Σ Aufträge · Kostenfeststellung = Σ Rechnungen
            </div>
            <div className="druck-hinweis">
              Prognose = Aufträge bzw. Rechnungen (der höhere Wert), wo vergeben, sonst Bezugsstufe
              · Abweichung = Prognose − Bezugsstufe (+ = teurer) · Beträge netto in € · ✎ = von Hand
              korrigiert
            </div>
          </footer>
        </section>
      ))}
    </div>
  );
}
