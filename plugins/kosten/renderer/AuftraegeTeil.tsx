import type { BautaktApi } from '@bautakt/kern/vertrag';
import { KG_KATALOG, kostengruppe } from '@bautakt/rechnen-kosten';
import { Begriff, Dialog } from '@bautakt/ui';
import { useEffect, useState } from 'react';
import type { AuftragBerechnet, RechnungBerechnet, SollIstDaten } from '../gemeinsam/typen.js';
import { betrag, eingabeZahl } from './format.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

const datumText = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : '');
const dateiname = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Anhang als Verweis (E-62): wählen, öffnen, entfernen. */
function AnhangFeld(props: {
  api: BautaktApi;
  wert: string | null;
  gespeichert: string | null;
  fehlt: boolean;
  nurLesen: boolean;
  onAendern: (p: string | null) => void;
  onFehler: (f: string) => void;
}) {
  return (
    <div className="feld breit">
      <span className="feld-label">Anhang (Verweis auf eine Datei)</span>
      <span className="inline">
        {props.wert ? (
          <span
            title={props.wert}
            className={props.fehlt && props.wert === props.gespeichert ? 'tp-warnung' : ''}
          >
            {dateiname(props.wert)}
            {props.fehlt && props.wert === props.gespeichert && ' – Datei nicht gefunden'}
          </span>
        ) : (
          <span className="leise">kein Anhang</span>
        )}
        {!props.nurLesen && (
          <button
            type="button"
            onClick={async () => {
              const a = await props.api.anhang.waehlen();
              if (!a.ok) props.onFehler(a.fehler);
              else if (a.wert) props.onAendern(a.wert);
            }}
          >
            Datei wählen …
          </button>
        )}
        {props.wert && props.wert === props.gespeichert && !props.fehlt && (
          <button
            type="button"
            onClick={async () => {
              const a = await props.api.anhang.oeffnen(props.wert ?? '');
              if (!a.ok) props.onFehler(a.fehler);
            }}
          >
            Öffnen
          </button>
        )}
        {props.wert && !props.nurLesen && (
          <button type="button" onClick={() => props.onAendern(null)}>
            Entfernen
          </button>
        )}
      </span>
    </div>
  );
}

function KgAuswahl(props: { wert: number; onAendern: (kg: number) => void; disabled?: boolean }) {
  return (
    <select
      value={props.wert}
      disabled={props.disabled}
      onChange={(e) => props.onAendern(Number(e.target.value))}
      aria-label="Kostengruppe"
    >
      {KG_KATALOG.map((k) => (
        <option key={k.kg} value={k.kg}>
          {' '.repeat(k.ebene - 1)}
          {k.kg} {k.bezeichnung}
        </option>
      ))}
    </select>
  );
}

type Eintrag =
  | { art: 'auftrag'; zeile: AuftragBerechnet | null }
  | { art: 'rechnung'; zeile: RechnungBerechnet | null; auftragId?: string };

function EintragDialog(props: {
  api: BautaktApi;
  daten: SollIstDaten;
  eintrag: Eintrag;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const e = props.eintrag;
  const z = e.zeile;
  const istAuftrag = e.art === 'auftrag';
  const [f, setF] = useState(() => ({
    kg: z?.kg ?? 300,
    auftrag_id: e.art === 'rechnung' ? (e.zeile?.auftrag_id ?? e.auftragId ?? '') : '',
    name: z
      ? istAuftrag
        ? (z as AuftragBerechnet).auftragnehmer
        : (z as RechnungBerechnet).rechnungssteller
      : '',
    bezeichnung: istAuftrag ? ((z as AuftragBerechnet | null)?.bezeichnung ?? '') : '',
    betrag: z ? String(z.betrag_netto).replace('.', ',') : '',
    datum: z?.datum ?? '',
    beleg_nr: z?.beleg_nr ?? '',
    anhang: z?.anhang ?? null,
    anmerkung: z?.anmerkung ?? '',
  }));
  const [eigenFehler, setEigenFehler] = useState<string | null>(null);
  const setze = <K extends keyof typeof f>(k: K, w: (typeof f)[K]) =>
    setF((x) => ({ ...x, [k]: w }));
  const auftrag = props.daten.auftraege.find((a) => a.id === f.auftrag_id);

  const speichern = async () => {
    const b = eingabeZahl(f.betrag);
    if (b === null || Number.isNaN(b))
      return setEigenFehler('Bitte einen gültigen Nettobetrag eingeben.');
    setEigenFehler(null);
    const gemeinsam = {
      betrag_netto: b,
      datum: f.datum || null,
      beleg_nr: f.beleg_nr,
      anhang: f.anhang,
      anmerkung: f.anmerkung,
    };
    const daten = istAuftrag
      ? { kg: f.kg, bezeichnung: f.bezeichnung, auftragnehmer: f.name, ...gemeinsam }
      : {
          ...(f.auftrag_id ? {} : { kg: f.kg }),
          auftrag_id: f.auftrag_id || null,
          rechnungssteller: f.name,
          ...gemeinsam,
        };
    const name = `${e.art}.${z ? 'aendern' : 'anlegen'}`;
    if (await props.befehl(name, z ? { id: z.id, ...daten } : daten)) props.onSchliessen();
  };
  const loeschen = async () => {
    if (z && (await props.befehl(`${e.art}.loeschen`, { id: z.id }))) props.onSchliessen();
  };
  const fehler = eigenFehler ?? props.fehler;
  const nur = props.nurLesen;

  return (
    <Dialog
      titel={`${istAuftrag ? 'Auftrag' : 'Rechnung'} ${z ? 'bearbeiten' : 'erfassen'}`}
      onSchliessen={props.onSchliessen}
      breite={680}
      fuss={
        <>
          {fehler && <span className="fehler">{fehler}</span>}
          {z && !nur && <button onClick={() => void loeschen()}>Löschen</button>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          {!nur && (
            <button className="primaer" onClick={() => void speichern()}>
              Übernehmen
            </button>
          )}
        </>
      }
    >
      <fieldset className="formular" disabled={nur}>
        {!istAuftrag && (
          <label className="feld breit">
            <span className="feld-label">Zu Auftrag</span>
            <select value={f.auftrag_id} onChange={(ev) => setze('auftrag_id', ev.target.value)}>
              <option value="">– ohne Auftrag –</option>
              {props.daten.auftraege.map((a) => (
                <option key={a.id} value={a.id}>
                  KG {a.kg} · {a.bezeichnung || a.auftragnehmer || 'Auftrag'}{' '}
                  {a.beleg_nr && `(${a.beleg_nr})`} · {betrag(a.betrag_netto)} €
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="feld breit">
          <span className="feld-label">Kostengruppe</span>
          <KgAuswahl
            wert={auftrag?.kg ?? f.kg}
            disabled={!!auftrag}
            onAendern={(kg) => setze('kg', kg)}
          />
          {auftrag && <span className="feld-hinweis">KG des Auftrags</span>}
        </label>
        {istAuftrag && (
          <label className="feld breit">
            <span className="feld-label">Bezeichnung / Leistung</span>
            <input
              value={f.bezeichnung}
              placeholder="z. B. Rohbauarbeiten"
              onChange={(ev) => setze('bezeichnung', ev.target.value)}
            />
          </label>
        )}
        <label className="feld">
          <span className="feld-label">{istAuftrag ? 'Auftragnehmer' : 'Rechnungssteller'}</span>
          <input value={f.name} onChange={(ev) => setze('name', ev.target.value)} />
        </label>
        <label className="feld">
          <span className="feld-label">Betrag netto [€]</span>
          <input
            inputMode="decimal"
            value={f.betrag}
            onChange={(ev) => setze('betrag', ev.target.value)}
          />
        </label>
        <label className="feld">
          <span className="feld-label">Datum</span>
          <input type="date" value={f.datum} onChange={(ev) => setze('datum', ev.target.value)} />
        </label>
        <label className="feld">
          <span className="feld-label">Beleg-Nr.</span>
          <input value={f.beleg_nr} onChange={(ev) => setze('beleg_nr', ev.target.value)} />
        </label>
        <AnhangFeld
          api={props.api}
          wert={f.anhang}
          gespeichert={z?.anhang ?? null}
          fehlt={z?.anhangFehlt ?? false}
          nurLesen={nur}
          onAendern={(p) => setze('anhang', p)}
          onFehler={setEigenFehler}
        />
        <label className="feld breit">
          <span className="feld-label">Anmerkung</span>
          <textarea
            rows={2}
            value={f.anmerkung}
            onChange={(ev) => setze('anmerkung', ev.target.value)}
          />
        </label>
      </fieldset>
    </Dialog>
  );
}

/** Aufträge und Rechnungen (E-33, E-62). */
export function AuftraegeTeil(props: {
  api: BautaktApi;
  datenstand: number;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  setFehler: (f: string | null) => void;
}) {
  const [daten, setDaten] = useState<SollIstDaten | null>(null);
  const [dialog, setDialog] = useState<Eintrag | null>(null);

  useEffect(() => {
    let aktiv = true;
    void props.api.abfrage<SollIstDaten>('kosten', 'sollist').then((a) => {
      if (!aktiv) return;
      if (a.ok) setDaten(a.wert);
      else props.setFehler(a.fehler);
    });
    return () => {
      aktiv = false;
    };
  }, [props.api, props.datenstand]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!daten) return <p className="leise">Lädt …</p>;
  const nur = props.nurLesen;
  const summeA = daten.auftraege.reduce((s, a) => s + a.betrag_netto, 0);
  const summeR = daten.rechnungen.reduce((s, r) => s + r.betrag_netto, 0);
  const auftragJeId = new Map(daten.auftraege.map((a) => [a.id, a]));
  const anhangMarke = (p: string | null, fehlt: boolean) =>
    p ? (
      <span className={fehlt ? 'tp-warnung' : ''} title={fehlt ? `nicht gefunden: ${p}` : p}>
        {fehlt ? '⚠ 📎' : '📎'}
      </span>
    ) : null;
  const schliessen = () => {
    setDialog(null);
    props.setFehler(null);
  };

  return (
    <>
      {props.fehler && !dialog && (
        <div className="tp-meldung fehler" role="alert">
          {props.fehler}
        </div>
      )}
      <div className="kk-ist">
        <section>
          <div className="tp-werkzeuge">
            <h3>Aufträge (Kostenanschlag)</h3>
            {!nur && (
              <button onClick={() => setDialog({ art: 'auftrag', zeile: null })}>+ Auftrag</button>
            )}
            <span className="leise">Summe netto {betrag(summeA)} €</span>
          </div>
          <table className="tabelle kk-tabelle" aria-label="Aufträge">
            <thead>
              <tr>
                <th>
                  <Begriff k="KG" />
                </th>
                <th>Leistung</th>
                <th>Auftragnehmer</th>
                <th>Datum</th>
                <th>Beleg-Nr.</th>
                <th className="zahl">Betrag netto</th>
                <th className="zahl">abgerechnet</th>
                <th className="zahl">offen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {daten.auftraege.map((a) => (
                <tr key={a.id} onDoubleClick={() => setDialog({ art: 'auftrag', zeile: a })}>
                  <td title={kostengruppe(a.kg)?.bezeichnung}>{a.kg}</td>
                  <td>{a.bezeichnung}</td>
                  <td>{a.auftragnehmer}</td>
                  <td>{datumText(a.datum)}</td>
                  <td>{a.beleg_nr}</td>
                  <td className="zahl">{betrag(a.betrag_netto)}</td>
                  <td className="zahl">{betrag(a.abgerechnet)}</td>
                  <td className={`zahl${a.offen < 0 ? ' negativ' : ''}`}>{betrag(a.offen)}</td>
                  <td className="aktionen">
                    {anhangMarke(a.anhang, a.anhangFehlt)}
                    <button onClick={() => setDialog({ art: 'auftrag', zeile: a })}>
                      Bearbeiten
                    </button>
                    {!nur && (
                      <button
                        onClick={() => setDialog({ art: 'rechnung', zeile: null, auftragId: a.id })}
                      >
                        + Rechnung
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {daten.auftraege.length === 0 && (
                <tr>
                  <td colSpan={9} className="leise">
                    Noch keine Aufträge. Mit <strong>+ Auftrag</strong> erfassen Sie vergebene
                    Leistungen je Kostengruppe – ihre Summe ergibt den Kostenanschlag.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section>
          <div className="tp-werkzeuge">
            <h3>Rechnungen (Kostenfeststellung)</h3>
            {!nur && (
              <button onClick={() => setDialog({ art: 'rechnung', zeile: null })}>
                + Rechnung
              </button>
            )}
            <span className="leise">Summe netto {betrag(summeR)} €</span>
          </div>
          <table className="tabelle kk-tabelle" aria-label="Rechnungen">
            <thead>
              <tr>
                <th>
                  <Begriff k="KG" />
                </th>
                <th>Auftrag</th>
                <th>Rechnungssteller</th>
                <th>Datum</th>
                <th>Beleg-Nr.</th>
                <th className="zahl">Betrag netto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {daten.rechnungen.map((r) => {
                const a = r.auftrag_id ? auftragJeId.get(r.auftrag_id) : undefined;
                return (
                  <tr key={r.id} onDoubleClick={() => setDialog({ art: 'rechnung', zeile: r })}>
                    <td title={kostengruppe(r.kg)?.bezeichnung}>{r.kg}</td>
                    <td>
                      {a ? (
                        a.bezeichnung || a.beleg_nr || a.auftragnehmer
                      ) : (
                        <span className="leise">–</span>
                      )}
                    </td>
                    <td>{r.rechnungssteller}</td>
                    <td>{datumText(r.datum)}</td>
                    <td>{r.beleg_nr}</td>
                    <td className="zahl">{betrag(r.betrag_netto)}</td>
                    <td className="aktionen">
                      {anhangMarke(r.anhang, r.anhangFehlt)}
                      <button onClick={() => setDialog({ art: 'rechnung', zeile: r })}>
                        Bearbeiten
                      </button>
                    </td>
                  </tr>
                );
              })}
              {daten.rechnungen.length === 0 && (
                <tr>
                  <td colSpan={7} className="leise">
                    Noch keine Rechnungen. Erfassen Sie sie mit <strong>+ Rechnung</strong> (auch
                    direkt am Auftrag) – ihre Summe ergibt die Kostenfeststellung.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
      {dialog && (
        <EintragDialog
          key={`${dialog.art}-${dialog.zeile?.id ?? 'neu'}`}
          api={props.api}
          daten={daten}
          eintrag={dialog}
          nurLesen={nur}
          befehl={props.befehl}
          fehler={props.fehler}
          onSchliessen={schliessen}
        />
      )}
    </>
  );
}
