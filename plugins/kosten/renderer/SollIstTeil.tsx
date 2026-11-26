import type { BautaktApi } from '@bautakt/kern/vertrag';
import {
  FEST_STUFEN,
  KOSTEN_URSACHEN,
  STUFE_TEXT,
  STUFEN,
  type FestStufe,
  type KostenUrsache,
  type Stufe,
} from '@bautakt/rechnen-kosten';
import { Dialog, LeereAnsicht, zeitAnzeigen } from '@bautakt/ui';
import { useEffect, useState } from 'react';
import type { SollIstDaten, SollIstZeile } from '../gemeinsam/typen.js';
import { betrag } from './format.js';
import { ZahlZelle } from './ZahlZelle.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

const BEZUG = 'bautakt.kosten.bezug';

const STUFE_KURZ: Record<Stufe, string> = {
  rahmen: 'Rahmen',
  schaetzung: 'Schätzung',
  berechnung: 'Berechnung',
  anschlag: 'Anschlag',
  feststellung: 'Feststellung',
};

export function bezugLaden(): Stufe {
  const b = localStorage.getItem(BEZUG);
  return (STUFEN as readonly string[]).includes(b ?? '') ? (b as Stufe) : 'berechnung';
}

const vorzeichen = (x: number | null) => (x === null ? '' : `${x > 0 ? '+' : ''}${betrag(x)}`);
const prozentText = (x: number | null) =>
  x === null
    ? ''
    : `${x > 0 ? '+' : ''}${x.toLocaleString('de-DE', { minimumFractionDigits: 1 })} %`;

function UrsacheDialog(props: {
  zeile: SollIstZeile;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const [ursache, setUrsache] = useState<KostenUrsache | ''>(
    (props.zeile.ursache ?? '') as KostenUrsache | '',
  );
  const [text, setText] = useState(props.zeile.ursacheText);
  const speichern = async () => {
    if (
      await props.befehl('abweichung.setzen', {
        kg: props.zeile.kg,
        ursache: ursache || null,
        text,
      })
    )
      props.onSchliessen();
  };
  return (
    <Dialog
      titel={`Abweichung KG ${props.zeile.kg} ${props.zeile.bezeichnung}`}
      onSchliessen={props.onSchliessen}
      breite={560}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          {!props.nurLesen && (
            <button className="primaer" onClick={() => void speichern()}>
              Übernehmen
            </button>
          )}
        </>
      }
    >
      <fieldset className="formular" disabled={props.nurLesen}>
        <p className="dialog-erklaerung breit">
          Abweichung {vorzeichen(props.zeile.abweichung)} € (
          {prozentText(props.zeile.abweichungProzent)})
        </p>
        <label className="feld breit">
          <span className="feld-label">Ursache</span>
          <select
            value={ursache}
            onChange={(e) => setUrsache(e.target.value as KostenUrsache | '')}
          >
            <option value="">–</option>
            {(Object.keys(KOSTEN_URSACHEN) as KostenUrsache[]).map((k) => (
              <option key={k} value={k}>
                {KOSTEN_URSACHEN[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="feld breit">
          <span className="feld-label">Erläuterung (eigener Text)</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </fieldset>
    </Dialog>
  );
}

/** Soll-Ist der Kosten (E-33, E-60–E-63): Stufen nebeneinander, Prognose, Abweichung, Ursache. */
export function SollIstTeil(props: {
  api: BautaktApi;
  datenstand: number;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  setFehler: (f: string | null) => void;
  onExport: () => void;
}) {
  const [bezug, setBezugState] = useState<Stufe>(bezugLaden);
  const [daten, setDaten] = useState<SollIstDaten | null>(null);
  const [ursache, setUrsache] = useState<number | null>(null);
  const [festStufe, setFestStufe] = useState<FestStufe>('berechnung');
  const [bestaetigen, setBestaetigen] = useState(false);
  const setBezug = (b: Stufe) => {
    setBezugState(b);
    try {
      localStorage.setItem(BEZUG, b);
    } catch {
      // ohne Speicher
    }
  };

  useEffect(() => {
    let aktiv = true;
    void props.api.abfrage<SollIstDaten>('kosten', 'sollist', { bezug }).then((a) => {
      if (!aktiv) return;
      if (a.ok) setDaten(a.wert);
      else props.setFehler(a.fehler);
    });
    return () => {
      aktiv = false;
    };
  }, [props.api, props.datenstand, bezug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!daten) return <p className="leise">Lädt …</p>;
  const nur = props.nurLesen;
  const zeile = ursache !== null ? daten.zeilen.find((z) => z.kg === ursache) : undefined;
  const festschreiben = async () => {
    if (await props.befehl('stufe.festschreiben', { stufe: festStufe })) setBestaetigen(false);
  };

  return (
    <>
      <div className="tp-werkzeuge" role="toolbar" aria-label="Soll-Ist">
        {!nur && (
          <div className="tp-gruppe">
            <label className="inline">
              Planung festschreiben als
              <select value={festStufe} onChange={(e) => setFestStufe(e.target.value as FestStufe)}>
                {FEST_STUFEN.map((s) => (
                  <option key={s} value={s}>
                    {STUFE_TEXT[s]}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setBestaetigen(true)}>Festschreiben …</button>
          </div>
        )}
        <div className="tp-gruppe">
          <label
            className="inline"
            title="Prognose und Abweichung werden gegen diese Stufe gerechnet"
          >
            Bezugsstufe
            <select value={bezug} onChange={(e) => setBezug(e.target.value as Stufe)}>
              {STUFEN.map((s) => (
                <option key={s} value={s}>
                  {STUFE_TEXT[s]}
                </option>
              ))}
            </select>
          </label>
          <button onClick={props.onExport}>Export …</button>
        </div>
      </div>
      <div className="tp-kennzahlen" role="status">
        {FEST_STUFEN.map((s) => (
          <span key={s}>
            {STUFE_TEXT[s]}:{' '}
            {daten.festgeschrieben[s] ? (
              <>festgeschrieben {zeitAnzeigen(daten.festgeschrieben[s])}</>
            ) : (
              <span className="leise">noch nicht festgeschrieben</span>
            )}
          </span>
        ))}
        <span>
          Prognose <strong>{betrag(daten.gesamt.prognose)} €</strong>
          {daten.gesamt.abweichung !== null && (
            <span className={daten.gesamt.abweichung > 0 ? 'negativ' : 'positiv'}>
              {' '}
              ({vorzeichen(daten.gesamt.abweichung)} €,{' '}
              {prozentText(daten.gesamt.abweichungProzent)})
            </span>
          )}
        </span>
      </div>
      {props.fehler && !bestaetigen && ursache === null && (
        <div className="tp-meldung fehler" role="alert">
          {props.fehler}
        </div>
      )}
      <div className="kk-tabelle-rahmen">
        {daten.zeilen.length === 0 ? (
          <LeereAnsicht titel="Noch kein Soll-Ist">
            <p>
              Schreiben Sie die aktuelle Kostenplanung als <strong>Kostenrahmen</strong>,{' '}
              <strong>Kostenschätzung</strong> oder <strong>Kostenberechnung</strong> fest und
              erfassen Sie unter „Aufträge & Rechnungen“ das Ist. Kostenanschlag und
              Kostenfeststellung ergeben sich aus Aufträgen und Rechnungen.
            </p>
          </LeereAnsicht>
        ) : (
          <table className="tabelle kk-tabelle kk-sollist" aria-label="Soll-Ist nach DIN 276">
            <thead>
              <tr>
                <th>KG</th>
                <th>Bezeichnung</th>
                {STUFEN.map((s) => (
                  <th key={s} className={`zahl${s === bezug ? ' kk-bezug' : ''}`}>
                    {STUFE_KURZ[s]}
                    {s === 'anschlag' && <div className="leise">Σ Aufträge</div>}
                    {s === 'feststellung' && <div className="leise">Σ Rechnungen</div>}
                  </th>
                ))}
                <th className="zahl">Prognose</th>
                <th className="zahl">Abw. [€]</th>
                <th className="zahl">Abw. [%]</th>
                <th>Ursache</th>
              </tr>
            </thead>
            <tbody>
              {daten.zeilen.map((z) => (
                <tr key={z.kg} className={`kk-ebene${z.ebene}`}>
                  <td style={{ paddingLeft: 8 + (z.ebene - 1) * 14 }}>{z.kg}</td>
                  <td>{z.bezeichnung}</td>
                  {STUFEN.map((s) => (
                    <td key={s} className={`zahl${s === bezug ? ' kk-bezug' : ''}`}>
                      {(FEST_STUFEN as readonly string[]).includes(s) ? (
                        <ZahlZelle
                          wert={z.stufen[s]}
                          anzeige={betrag(z.stufen[s])}
                          darf={!nur}
                          titel={
                            z.vonHand.includes(s as FestStufe)
                              ? 'von Hand korrigiert – Doppelklick zum Ändern, leer = entfernen'
                              : 'Doppelklick: von Hand korrigieren'
                          }
                          onSpeichern={async (w) =>
                            (await props.befehl('stufe.setzen', {
                              kg: z.kg,
                              stufe: s,
                              betrag: w,
                            })) !== null
                          }
                        />
                      ) : (
                        betrag(z.stufen[s])
                      )}
                      {z.vonHand.includes(s as FestStufe) && <span className="kk-marke"> ✎</span>}
                    </td>
                  ))}
                  <td className="zahl">{betrag(z.prognose)}</td>
                  <td
                    className={`zahl ${z.abweichung !== null && z.abweichung > 0 ? 'negativ' : z.abweichung ? 'positiv' : ''}`}
                  >
                    {vorzeichen(z.abweichung)}
                  </td>
                  <td className="zahl">{prozentText(z.abweichungProzent)}</td>
                  <td>
                    <button
                      className="kk-ursache"
                      onClick={() => setUrsache(z.kg)}
                      title={z.ursacheText || undefined}
                    >
                      {z.ursache
                        ? KOSTEN_URSACHEN[z.ursache as KostenUrsache]
                        : z.ursacheText
                          ? 'Text'
                          : nur
                            ? ''
                            : '…'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="kk-massgebend">
                <td colSpan={2}>Summe KG 100–800 netto</td>
                {STUFEN.map((s) => (
                  <td key={s} className={`zahl${s === bezug ? ' kk-bezug' : ''}`}>
                    {betrag(daten.gesamt.stufen[s])}
                  </td>
                ))}
                <td className="zahl">{betrag(daten.gesamt.prognose)}</td>
                <td className="zahl">{vorzeichen(daten.gesamt.abweichung)}</td>
                <td className="zahl">{prozentText(daten.gesamt.abweichungProzent)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="leise kk-erklaerung">
        Prognose = Aufträge bzw. Rechnungen (der höhere Wert), wo vergeben, sonst Bezugsstufe ·
        Abweichung = Prognose − Bezugsstufe (+ = teurer) · ✎ = von Hand korrigiert.
      </p>

      {bestaetigen && (
        <Dialog
          titel={`${STUFE_TEXT[festStufe]} festschreiben`}
          onSchliessen={() => setBestaetigen(false)}
          breite={520}
          fuss={
            <>
              {props.fehler && <span className="fehler">{props.fehler}</span>}
              <button onClick={() => setBestaetigen(false)}>Abbrechen</button>
              <button className="primaer" onClick={() => void festschreiben()}>
                Festschreiben
              </button>
            </>
          }
        >
          <p>
            Die maßgebenden Kosten der aktuellen Planung werden als{' '}
            <strong>{STUFE_TEXT[festStufe]}</strong> übernommen.
            {daten.festgeschrieben[festStufe] &&
              ` Die bisherige ${STUFE_TEXT[festStufe]} (${zeitAnzeigen(daten.festgeschrieben[festStufe])}) wird ersetzt – auch von Hand korrigierte Werte.`}{' '}
            Rückgängig ist möglich.
          </p>
        </Dialog>
      )}
      {zeile && (
        <UrsacheDialog
          zeile={zeile}
          nurLesen={nur}
          befehl={props.befehl}
          fehler={props.fehler}
          onSchliessen={() => {
            setUrsache(null);
            props.setFehler(null);
          }}
        />
      )}
    </>
  );
}
