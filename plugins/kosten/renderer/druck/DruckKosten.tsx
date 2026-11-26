import { FLAECHE_TEXT, type Flaeche } from '@bautakt/rechnen-kosten';
import type { DruckProps } from '@bautakt/ui';
import { useEffect, useState } from 'react';
import type { KnotenDaten, KostenDaten } from '../../gemeinsam/typen.js';
import { betrag, faktor, menge, prozent } from '../format.js';
import './druck.css';

/** A3 quer bei 96 dpi (420 × 297 mm), wie die Terminpläne. */
const SEITE = { breite: 1587, hoehe: 1122, rand: 34 } as const;
const INNEN_HOEHE = SEITE.hoehe - 2 * SEITE.rand;
const KOPF = 74;
const FUSS = 70;
const TABELLENKOPF = 26;
const ZEILE = 20;
const FLAECHEN: Flaeche[] = ['NUF', 'TF', 'VF', 'NRF', 'KGF', 'BGF', 'AF', 'GF'];

const heute = () =>
  new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Kostentabelle als Druckansicht (E-59): KG-Baum, Flächen, Summen, Einstellungen. */
export function DruckKosten({ api, parameter, format, projektname, fertig, fehler }: DruckProps) {
  const [daten, setDaten] = useState<KostenDaten | null>(null);
  const ersteller = String(parameter['ersteller'] ?? '');
  const ebene = Number(parameter['ebene'] ?? 3);

  useEffect(() => {
    void api
      .abfrage<KostenDaten>('kosten', 'kosten')
      .then((a) => (a.ok ? setDaten(a.wert) : fehler(a.fehler)));
  }, [api, fehler]);
  useEffect(() => {
    if (daten) requestAnimationFrame(() => requestAnimationFrame(fertig));
  }, [daten, fertig]);
  if (!daten) return null;

  const e = daten.einstellung;
  const zeileJeId = new Map(daten.zeilen.map((z) => [z.id, z]));
  const knoten = new Map(daten.baum.map((k) => [k.kg, k]));
  const zeilen: KnotenDaten[] = [];
  const gehe = (k: KnotenDaten) => {
    if (k.ebene > ebene) return;
    zeilen.push(k);
    for (const c of k.kinder) gehe(knoten.get(c) as KnotenDaten);
  };
  for (const k of daten.baum) if (k.ebene === 1) gehe(k);

  const proSeite = Math.max(5, Math.floor((INNEN_HOEHE - KOPF - TABELLENKOPF - FUSS - 8) / ZEILE));
  const seiten: KnotenDaten[][] = [];
  if (format === 'png' || zeilen.length === 0) seiten.push(zeilen);
  else for (let i = 0; i < zeilen.length; i += proSeite) seiten.push(zeilen.slice(i, i + proSeite));
  const gesamt = daten.gesamt.netto;

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
              <div className="druck-titel">{projektname} – Kostenplanung (DIN 276)</div>
              <div className="druck-untertitel">
                Gesamt netto {betrag(daten.gesamt.netto)} € · Bauwerk (KG 300+400){' '}
                {betrag(daten.bauwerk.netto)} €
                {daten.bauwerkJeBgf !== null && ` · ${betrag(daten.bauwerkJeBgf)} €/m² BGF`}
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
          <div className="kd-inhalt">
            <table className="druck-tabelle kd-tabelle">
              <thead>
                <tr style={{ height: TABELLENKOPF }}>
                  <th>KG</th>
                  <th>Bezeichnung</th>
                  <th className="rechts">Menge</th>
                  <th>Einheit</th>
                  <th className="rechts">KKW gewählt</th>
                  <th className="rechts">Faktor</th>
                  <th className="rechts">KKW wirksam</th>
                  <th className="rechts">Kosten netto [€]</th>
                  <th className="rechts">Anteil</th>
                  <th>Quelle / Stand</th>
                  <th>Kommentar</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((k) => {
                  // Überdeckte eigene Werte (Unterzeilen maßgebend) im Druck nicht zeigen
                  const z = k.zeileId && !k.ausUnterzeilen ? zeileJeId.get(k.zeileId) : undefined;
                  return (
                    <tr key={k.kg} className={`kd-ebene${k.ebene}`} style={{ height: ZEILE }}>
                      <td style={{ paddingLeft: 4 + (k.ebene - 1) * 12 }}>{k.kg}</td>
                      <td>{k.bezeichnung}</td>
                      <td className="rechts">{z ? menge(z.mengeWirksam) : ''}</td>
                      <td>{z?.einheit}</td>
                      <td className="rechts">{z ? betrag(z.kkw_gewaehlt) : ''}</td>
                      <td className="rechts" title={z?.index.text}>
                        {z && z.kkw_gewaehlt !== null
                          ? faktor(z.index.faktor * e.regionalfaktor)
                          : ''}
                      </td>
                      <td className="rechts">{z ? betrag(z.kkwWirksam) : ''}</td>
                      <td className="rechts kd-kosten">
                        {betrag(k.summe)}
                        {z?.hinweise.length ? ' ⚠' : ''}
                      </td>
                      <td className="rechts">{prozent(k.summe, gesamt)}</td>
                      <td>
                        {z && (z.kkw_quelle || z.kkw_stand)
                          ? `${z.kkw_quelle}${z.kkw_stand ? `, ${z.kkw_stand}` : ''}`
                          : ''}
                      </td>
                      <td>{z?.kommentar}</td>
                    </tr>
                  );
                })}
              </tbody>
              {s === seiten.length - 1 && (
                <tfoot>
                  <tr>
                    <td colSpan={7}>Summe KG 100–800 netto</td>
                    <td className="rechts">{betrag(daten.gesamt.netto)}</td>
                    <td colSpan={3} />
                  </tr>
                  <tr>
                    <td colSpan={7}>MwSt. {e.mwst_satz.toLocaleString('de-DE')} %</td>
                    <td className="rechts">{betrag(daten.gesamt.mwst)}</td>
                    <td colSpan={3} />
                  </tr>
                  <tr>
                    <td colSpan={7}>Summe brutto</td>
                    <td className="rechts">{betrag(daten.gesamt.brutto)}</td>
                    <td colSpan={3} />
                  </tr>
                  <tr className="kd-massgebend">
                    <td colSpan={7}>
                      maßgebend ({e.vorsteuerabzug ? 'netto, vorsteuerabzugsberechtigt' : 'brutto'})
                    </td>
                    <td className="rechts">{betrag(daten.gesamt.massgebend)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
            {s === 0 && (
              <table className="druck-tabelle kd-flaechen">
                <thead>
                  <tr style={{ height: TABELLENKOPF }}>
                    <th>Fläche DIN 277</th>
                    <th className="rechts">m²</th>
                  </tr>
                </thead>
                <tbody>
                  {FLAECHEN.map((f) => (
                    <tr
                      key={f}
                      className={['NRF', 'BGF'].includes(f) ? 'kd-ebene1' : ''}
                      style={{ height: ZEILE }}
                    >
                      <td>{FLAECHE_TEXT[f]}</td>
                      <td className="rechts">{menge(daten.flaechen[f]) || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <footer className="druck-fuss" style={{ minHeight: FUSS - 20 }}>
            <div>
              Baupreisindex aktuell {e.index_aktuell?.toLocaleString('de-DE') ?? '–'}
              {e.index_aktuell_stand && ` (${e.index_aktuell_stand})`}
              {e.index_quelle && `, Quelle: ${e.index_quelle}`} · Regionalfaktor{' '}
              {e.regionalfaktor.toLocaleString('de-DE')}
              {e.regionalfaktor_quelle && ` (${e.regionalfaktor_quelle})`} · MwSt.{' '}
              {e.mwst_satz.toLocaleString('de-DE')} %
            </div>
            <div className="druck-hinweis">
              KKW wirksam = KKW gewählt × Indexfaktor × Regionalfaktor, auf Cent gerundet · Kosten =
              Menge × KKW wirksam · Summen aus den Unterzeilen (DIN 276) · ⚠ = Hinweis in der Zeile
            </div>
          </footer>
        </section>
      ))}
    </div>
  );
}
