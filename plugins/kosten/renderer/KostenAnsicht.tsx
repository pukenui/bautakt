import {
  FLAECHE_TEXT,
  KG_KATALOG,
  kgEbene,
  kgEltern,
  type FlaecheEingabe,
} from '@bautakt/rechnen-kosten';
import { LeereAnsicht, type AnsichtProps } from '@bautakt/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KnotenDaten, KostenDaten, ZeileBerechnet } from '../gemeinsam/typen.js';
import { EinstellungenDialog, KgDialog, ZeileDialog } from './Dialoge.js';
import { ExportDialog } from './ExportDialog.js';
import { betrag, faktor, menge, prozent, rechenweg } from './format.js';
import { AuftraegeTeil } from './AuftraegeTeil.js';
import { SollIstTeil } from './SollIstTeil.js';
import { ZahlZelle } from './ZahlZelle.js';

type DialogZustand =
  | { art: 'einstellungen' | 'export' }
  | { art: 'kg'; unter: number | null }
  | { art: 'zeile'; id: string }
  | null;

/** Flächen nach DIN 277 (E-15, R-11): Eingaben links, abgeleitete Summen fett. */
function Flaechen(props: {
  daten: KostenDaten;
  nurLesen: boolean;
  befehl: (n: string, d: unknown) => Promise<string[] | null>;
}) {
  const f = props.daten.flaechen;
  const eingabe = (k: FlaecheEingabe) => (
    <tr key={k}>
      <td title={FLAECHE_TEXT[k]}>{FLAECHE_TEXT[k]}</td>
      <td className="zahl">
        <ZahlZelle
          wert={f[k]}
          anzeige={menge(f[k])}
          darf={!props.nurLesen}
          onSpeichern={async (w) =>
            (await props.befehl('flaeche.setzen', { kategorie: k, wert_m2: w })) !== null
          }
        />
      </td>
    </tr>
  );
  const summe = (k: 'NUF' | 'NRF' | 'BGF', formel: string) => (
    <tr key={k} className="kk-summe">
      <td title={formel}>{FLAECHE_TEXT[k]}</td>
      <td className="zahl">{menge(f[k])}</td>
    </tr>
  );
  return (
    <aside className="kk-flaechen" aria-label="Flächen nach DIN 277">
      <h3>Flächen DIN 277 [m²]</h3>
      <table className="tabelle kk-flaechen-tabelle">
        <tbody>
          {(['NUF1', 'NUF2', 'NUF3', 'NUF4', 'NUF5', 'NUF6', 'NUF7'] as const).map(eingabe)}
          {summe('NUF', 'NUF = Σ NUF 1–7')}
          {eingabe('TF')}
          {eingabe('VF')}
          {summe('NRF', 'NRF = NUF + TF + VF')}
          {eingabe('KGF')}
          {summe('BGF', 'BGF = NRF + KGF')}
          {eingabe('AF')}
          {eingabe('GF')}
        </tbody>
      </table>
      <p className="leise">
        Doppelklick auf einen Wert zum Eintragen. Kostenzeilen, die an eine Fläche gekoppelt sind,
        folgen automatisch.
      </p>
    </aside>
  );
}

/** Kostenplanung (E-15, E-16, E-55–E-59): KG-Baum mit Summen, Flächen, Kennzahlen. */
function PlanungTeil({ api, status, datenstand }: AnsichtProps) {
  const [daten, setDaten] = useState<KostenDaten | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogZustand>(null);
  const [zu, setZu] = useState<Set<number>>(new Set());
  const [auswahl, setAuswahl] = useState<number | null>(null);
  const nurLesen = status.schreibgeschuetzt;

  useEffect(() => {
    let aktiv = true;
    void api.abfrage<KostenDaten>('kosten', 'kosten').then((a) => {
      if (!aktiv) return;
      if (a.ok) {
        setDaten(a.wert);
        setLadefehler(null);
      } else setLadefehler(a.fehler);
    });
    return () => {
      aktiv = false;
    };
  }, [api, datenstand]);

  const befehl = useCallback(
    async (name: string, d: unknown) => {
      const a = await api.befehl.ausfuehren('kosten', name, d);
      if (!a.ok) {
        setFehler(a.fehler);
        return null;
      }
      setFehler(null);
      return a.wert.eingefuegt.map((e) => e.id);
    },
    [api],
  );
  const schliessen = useCallback(() => {
    setDialog(null);
    setFehler(null);
  }, []);

  // Sichtbare Zeilen: Ebene 1 immer, darunter alle Knoten des Baums (zuklappbar)
  const zeilen = useMemo(() => {
    if (!daten) return [];
    const knoten = new Map(daten.baum.map((k) => [k.kg, k]));
    const liste: KnotenDaten[] = [];
    const gehe = (k: KnotenDaten) => {
      liste.push(k);
      if (!zu.has(k.kg)) for (const c of k.kinder) gehe(knoten.get(c) as KnotenDaten);
    };
    for (const k of KG_KATALOG.filter((x) => x.ebene === 1)) {
      gehe(
        knoten.get(k.kg) ?? {
          kg: k.kg,
          ebene: 1,
          bezeichnung: k.bezeichnung,
          summe: null,
          ausUnterzeilen: false,
          kinder: [],
          zeileId: null,
        },
      );
    }
    return liste;
  }, [daten, zu]);

  if (ladefehler) return <p className="fehler">{ladefehler}</p>;
  if (!daten) return <p className="leise">Lädt …</p>;

  const zeileJeId = new Map(daten.zeilen.map((z) => [z.id, z]));
  const gesamt = daten.gesamt.netto;
  const e = daten.einstellung;
  const gewaehlt = auswahl !== null ? daten.baum.find((k) => k.kg === auswahl) : undefined;
  const zeileDialog = dialog?.art === 'zeile' ? zeileJeId.get(dialog.id) : undefined;

  const aendern = (z: ZeileBerechnet, felder: Record<string, unknown>) =>
    befehl('zeile.aendern', { id: z.id, felder }).then((x) => x !== null);

  return (
    <>
      <div className="tp-werkzeuge" role="toolbar" aria-label="Kostenplanung">
        <div className="tp-gruppe">
          {!nurLesen && (
            <button
              onClick={() =>
                setDialog({
                  art: 'kg',
                  // 3. Ebene hat keine Untergruppen → deren Obergruppe vorschlagen
                  unter:
                    auswahl === null ? null : kgEbene(auswahl) === 3 ? kgEltern(auswahl) : auswahl,
                })
              }
              title="Kostengruppe aus dem DIN-276-Katalog hinzufügen"
            >
              + Kostengruppe …
            </button>
          )}
          <button
            disabled={!gewaehlt?.zeileId}
            onClick={() => gewaehlt?.zeileId && setDialog({ art: 'zeile', id: gewaehlt.zeileId })}
          >
            Bearbeiten …
          </button>
          <button onClick={() => setZu(new Set())}>alles aufklappen</button>
          <button
            onClick={() => setZu(new Set(daten.baum.filter((k) => k.ebene === 1).map((k) => k.kg)))}
          >
            nur Ebene 1
          </button>
        </div>
        <div className="tp-gruppe">
          <button
            onClick={() => setDialog({ art: 'einstellungen' })}
            title="Index, Regionalfaktor, MwSt., Vorsteuerabzug"
          >
            Einstellungen …
          </button>
          <button onClick={() => setDialog({ art: 'export' })} title="PDF (A3 quer) oder PNG">
            Export …
          </button>
        </div>
      </div>

      <div className="tp-kennzahlen" role="status">
        <span>
          Gesamt netto <strong>{betrag(daten.gesamt.netto)} €</strong>
        </span>
        <span>
          MwSt. {e.mwst_satz.toLocaleString('de-DE')} %{' '}
          <strong>{betrag(daten.gesamt.mwst)} €</strong>
        </span>
        <span>
          brutto <strong>{betrag(daten.gesamt.brutto)} €</strong>
        </span>
        <span
          title={
            e.vorsteuerabzug
              ? 'Bauherrschaft vorsteuerabzugsberechtigt'
              : 'nicht vorsteuerabzugsberechtigt'
          }
        >
          maßgebend ({e.vorsteuerabzug ? 'netto' : 'brutto'}){' '}
          <strong>{betrag(daten.gesamt.massgebend)} €</strong>
        </span>
        <span>
          Bauwerk (KG 300+400) <strong>{betrag(daten.bauwerk.netto)} €</strong>
          {daten.bauwerkJeBgf !== null && <> · {betrag(daten.bauwerkJeBgf)} €/m² BGF</>}
        </span>
        <span title={e.index_quelle}>
          Index {e.index_aktuell?.toLocaleString('de-DE') ?? '–'}
          {e.index_aktuell_stand && ` (${e.index_aktuell_stand})`} · Region{' '}
          {e.regionalfaktor.toLocaleString('de-DE')}
        </span>
      </div>
      {fehler && !dialog && (
        <div className="tp-meldung fehler" role="alert">
          {fehler}
          <button
            className="schliessen"
            onClick={() => setFehler(null)}
            aria-label="Meldung schließen"
          >
            ×
          </button>
        </div>
      )}

      <div className="kk-split">
        <div className="kk-tabelle-rahmen">
          {daten.zeilen.length === 0 ? (
            <LeereAnsicht titel="Noch keine Kostenzeilen">
              <p>
                Tragen Sie links die Flächen nach DIN 277 ein und fügen Sie mit{' '}
                <strong>+ Kostengruppe …</strong> Zeilen hinzu (z. B. KG 300 je m² BGF). Kennwerte
                übernehmen Sie aus der Bibliothek oder tragen sie mit Quelle selbst ein.
              </p>
            </LeereAnsicht>
          ) : null}
          <table className="tabelle kk-tabelle" aria-label="Kostentabelle DIN 276">
            <thead>
              <tr>
                <th>KG</th>
                <th>Bezeichnung</th>
                <th className="zahl">Menge</th>
                <th>Einheit</th>
                <th className="zahl">Von</th>
                <th className="zahl">Mittel</th>
                <th className="zahl">Bis</th>
                <th className="zahl">KKW gewählt</th>
                <th className="zahl" title="Index- × Regionalfaktor">
                  Faktor
                </th>
                <th className="zahl">KKW wirksam</th>
                <th className="zahl">Kosten netto [€]</th>
                <th className="zahl">Anteil</th>
                <th>Kommentar</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((k) => {
                const z = k.zeileId ? zeileJeId.get(k.zeileId) : undefined;
                const darf = !nurLesen && !!z;
                const klappbar = k.kinder.length > 0;
                return (
                  <tr
                    key={k.kg}
                    className={`kk-ebene${k.ebene}${auswahl === k.kg ? ' gewaehlt' : ''}${z?.hinweise.length ? ' warnung' : ''}`}
                    onMouseDown={() => setAuswahl(k.kg)}
                    onDoubleClick={(ev) => {
                      if ((ev.target as HTMLElement).closest('.kk-bearbeitbar, input')) return;
                      if (z) setDialog({ art: 'zeile', id: z.id });
                      else if (!nurLesen) setDialog({ art: 'kg', unter: k.kg });
                    }}
                  >
                    <td>
                      <span style={{ paddingLeft: (k.ebene - 1) * 14 }} className="kk-kg">
                        {klappbar ? (
                          <button
                            className="tp-klappe"
                            aria-label={zu.has(k.kg) ? 'Aufklappen' : 'Zuklappen'}
                            onClick={() =>
                              setZu((s) => {
                                const n = new Set(s);
                                if (n.has(k.kg)) n.delete(k.kg);
                                else n.add(k.kg);
                                return n;
                              })
                            }
                          >
                            {zu.has(k.kg) ? '▸' : '▾'}
                          </button>
                        ) : (
                          <span className="tp-klappe-platz" />
                        )}
                        {k.kg}
                      </span>
                    </td>
                    <td>
                      {k.bezeichnung}
                      {z && k.ausUnterzeilen && z.kosten !== null && (
                        <span className="leise" title="Unterzeilen sind maßgebend (E-15)">
                          {' '}
                          (eigener Wert {betrag(z.kosten)} € überdeckt)
                        </span>
                      )}
                    </td>
                    {z ? (
                      <>
                        <td className="zahl">
                          <ZahlZelle
                            wert={z.mengeWirksam}
                            anzeige={menge(z.mengeWirksam)}
                            darf={darf}
                            titel={
                              z.menge_quelle === 'flaeche'
                                ? `aus ${z.flaeche} – Doppelklick: von Hand eintragen`
                                : undefined
                            }
                            onSpeichern={(w) => aendern(z, { menge_quelle: 'manuell', menge: w })}
                          />
                          {z.menge_quelle === 'flaeche' && (
                            <span className="kk-marke" title={`aus Fläche ${z.flaeche}`}>
                              {' '}
                              ⇠
                            </span>
                          )}
                        </td>
                        <td>{z.einheit}</td>
                        <td className="zahl leise">{betrag(z.kkw_von)}</td>
                        <td className="zahl leise">{betrag(z.kkw_mittel)}</td>
                        <td className="zahl leise">{betrag(z.kkw_bis)}</td>
                        <td className="zahl">
                          <ZahlZelle
                            wert={z.kkw_gewaehlt}
                            anzeige={betrag(z.kkw_gewaehlt)}
                            darf={darf}
                            onSpeichern={(w) => aendern(z, { kkw_gewaehlt: w })}
                          />
                        </td>
                        <td className="zahl" title={z.index.text}>
                          {z.kkw_gewaehlt !== null ? faktor(z.index.faktor * e.regionalfaktor) : ''}
                        </td>
                        <td className="zahl">{betrag(z.kkwWirksam)}</td>
                      </>
                    ) : (
                      <td colSpan={8} />
                    )}
                    <td
                      className="zahl kk-kosten"
                      title={z ? rechenweg(z, e.regionalfaktor) : undefined}
                    >
                      {betrag(k.summe)}
                      {z?.hinweise.length ? (
                        <span className="tp-warnung" title={z.hinweise.join('\n')}>
                          {' '}
                          ⚠
                        </span>
                      ) : null}
                    </td>
                    <td className="zahl leise">{prozent(k.summe, gesamt)}</td>
                    <td className="kk-kommentar" title={z?.anmerkung || undefined}>
                      {z?.kommentar}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={10}>Summe KG 100–800 netto</td>
                <td className="zahl">{betrag(daten.gesamt.netto)}</td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={10}>MwSt. {e.mwst_satz.toLocaleString('de-DE')} %</td>
                <td className="zahl">{betrag(daten.gesamt.mwst)}</td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={10}>Summe brutto</td>
                <td className="zahl">{betrag(daten.gesamt.brutto)}</td>
                <td colSpan={2} />
              </tr>
              <tr className="kk-massgebend">
                <td colSpan={10}>
                  maßgebend ({e.vorsteuerabzug ? 'netto – vorsteuerabzugsberechtigt' : 'brutto'})
                </td>
                <td className="zahl">{betrag(daten.gesamt.massgebend)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <Flaechen daten={daten} nurLesen={nurLesen} befehl={befehl} />
      </div>

      {dialog?.art === 'einstellungen' && (
        <EinstellungenDialog
          daten={daten}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={schliessen}
        />
      )}
      {dialog?.art === 'kg' && (
        <KgDialog
          daten={daten}
          unter={dialog.unter}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={(kg) => {
            schliessen();
            if (kg !== null) setAuswahl(kg);
          }}
        />
      )}
      {zeileDialog && (
        <ZeileDialog
          // nach Übernahme/Lösen eines Kennwerts das Formular neu aufbauen
          key={`${zeileDialog.id}-${zeileDialog.kkw_ref ?? ''}-${zeileDialog.kkw_ref_version ?? ''}`}
          api={api}
          daten={daten}
          zeile={zeileDialog}
          datenstand={datenstand}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={schliessen}
        />
      )}
      {dialog?.art === 'export' && (
        <ExportDialog api={api} projektname={status.projektname} onSchliessen={schliessen} />
      )}
    </>
  );
}

type Teil = 'planung' | 'sollist' | 'ist';
const TEIL = 'bautakt.kosten.teil';

/** Reiter „Kosten“: Kostenplanung, Soll-Ist und Aufträge & Rechnungen (E-15, E-33). */
export function KostenAnsicht(props: AnsichtProps) {
  const { api } = props;
  const [teil, setTeilState] = useState<Teil>(() => {
    const t = localStorage.getItem(TEIL);
    return t === 'sollist' || t === 'ist' ? t : 'planung';
  });
  const setTeil = (t: Teil) => {
    setTeilState(t);
    try {
      localStorage.setItem(TEIL, t);
    } catch {
      // ohne Speicher
    }
  };
  const [fehler, setFehler] = useState<string | null>(null);
  const [exportOffen, setExportOffen] = useState(false);
  const befehl = useCallback(
    async (name: string, d: unknown) => {
      const a = await api.befehl.ausfuehren('kosten', name, d);
      if (!a.ok) {
        setFehler(a.fehler);
        return null;
      }
      setFehler(null);
      return a.wert.eingefuegt.map((e) => e.id);
    },
    [api],
  );
  const nurLesen = props.status.schreibgeschuetzt;
  return (
    <div className="kk-ansicht">
      <div className="bib-teile kk-teile" role="tablist" aria-label="Kosten">
        {(
          [
            ['planung', 'Kostenplanung'],
            ['sollist', 'Soll-Ist'],
            ['ist', 'Aufträge & Rechnungen'],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            role="tab"
            aria-selected={teil === k}
            className={teil === k ? 'aktiv' : ''}
            onClick={() => {
              setFehler(null);
              setTeil(k);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {teil === 'planung' && <PlanungTeil {...props} />}
      {teil === 'sollist' && (
        <SollIstTeil
          api={api}
          datenstand={props.datenstand}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          setFehler={setFehler}
          onExport={() => setExportOffen(true)}
        />
      )}
      {teil === 'ist' && (
        <AuftraegeTeil
          api={api}
          datenstand={props.datenstand}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          setFehler={setFehler}
        />
      )}
      {exportOffen && (
        <ExportDialog
          api={api}
          projektname={props.status.projektname}
          darstellung="sollist"
          onSchliessen={() => setExportOffen(false)}
        />
      )}
    </div>
  );
}
