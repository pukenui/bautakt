import { Dialog } from '@bautakt/ui';
import { useMemo, useState } from 'react';
import { ortsBaum, taktDauerVorschlag } from '../gemeinsam/orte.js';
import type { PlanDaten } from '../gemeinsam/typen.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

/** Ortsstruktur pflegen (E-31, E-67): je Projekt, beliebig tief, mit Reihenfolge. */
export function OrteDialog(props: {
  daten: PlanDaten;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const baum = useMemo(() => ortsBaum(props.daten.orte), [props.daten.orte]);
  const [neu, setNeu] = useState('');
  const [unter, setUnter] = useState<string>('');
  const [bearbeitet, setBearbeitet] = useState<{ id: string; name: string } | null>(null);
  const nur = props.nurLesen;
  const verwendet = (oid: string) =>
    props.daten.vorgaenge.filter((v) => v.ort_von === oid || v.ort_bis === oid).length;

  const anlegen = async () => {
    if (!neu.trim()) return;
    if (await props.befehl('ort.anlegen', { name: neu, parentId: unter || null, mehrere: true }))
      setNeu('');
  };

  return (
    <Dialog
      titel="Ortsstruktur (für alle Pläne des Projekts)"
      onSchliessen={props.onSchliessen}
      breite={680}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          <button onClick={props.onSchliessen}>Schließen</button>
        </>
      }
    >
      {!nur && (
        <div className="formular">
          <label className="feld breit">
            <span className="feld-label">Neue Orte (mehrere mit Komma trennen)</span>
            <input
              value={neu}
              placeholder="z. B. EG, 1. OG, 2. OG oder Bauabschnitt A"
              onChange={(e) => setNeu(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void anlegen()}
            />
          </label>
          <label className="feld">
            <span className="feld-label">unter</span>
            <select value={unter} onChange={(e) => setUnter(e.target.value)}>
              <option value="">– oberste Ebene –</option>
              {baum.map((o) => (
                <option key={o.id} value={o.id}>
                  {' '.repeat(o.ebene)}
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <span className="feld">
            <span className="feld-label">&nbsp;</span>
            <button className="primaer" disabled={!neu.trim()} onClick={() => void anlegen()}>
              Hinzufügen
            </button>
          </span>
        </div>
      )}
      {baum.length === 0 ? (
        <p className="leise">
          Noch keine Orte. Legen Sie z. B. Bauabschnitte an und darunter Geschosse oder Achsen.
          Vorgänge erhalten dann im Eigenschaften-Dialog „Ort von–bis“.
        </p>
      ) : (
        <table className="tabelle orte-tabelle">
          <tbody>
            {baum.map((o) => (
              <tr key={o.id}>
                <td style={{ paddingLeft: 8 + o.ebene * 18 }}>
                  {bearbeitet?.id === o.id ? (
                    <input
                      autoFocus
                      value={bearbeitet.name}
                      onChange={(e) => setBearbeitet({ id: o.id, name: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && (await props.befehl('ort.umbenennen', bearbeitet)))
                          setBearbeitet(null);
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setBearbeitet(null);
                        }
                      }}
                    />
                  ) : (
                    <span className={o.hatKinder ? 'fett' : ''}>{o.name}</span>
                  )}
                </td>
                <td className="leise">
                  {verwendet(o.id) ? `${verwendet(o.id)} Vorgang/Vorgänge` : ''}
                </td>
                <td className="aktionen">
                  {!nur && (
                    <>
                      <button
                        aria-label="Nach oben"
                        onClick={() =>
                          void props.befehl('ort.verschieben', { id: o.id, richtung: 'hoch' })
                        }
                      >
                        ↑
                      </button>
                      <button
                        aria-label="Nach unten"
                        onClick={() =>
                          void props.befehl('ort.verschieben', { id: o.id, richtung: 'runter' })
                        }
                      >
                        ↓
                      </button>
                      <button onClick={() => setBearbeitet({ id: o.id, name: o.name })}>
                        Umbenennen
                      </button>
                      <button onClick={() => setUnter(o.id)} title="Neue Orte darunter anlegen">
                        + darunter
                      </button>
                      <button
                        onClick={() => void props.befehl('ort.loeschen', { id: o.id })}
                        title="Mit allen Unterorten löschen; Verweise der Vorgänge werden geleert"
                      >
                        Löschen
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}

/** Über Takte vervielfältigen (E-69, E-70). */
export function TaktDialog(props: {
  daten: PlanDaten;
  vorgangId: string;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const { daten } = props;
  const baum = useMemo(() => ortsBaum(daten.orte), [daten.orte]);
  const start = daten.vorgaenge.find((v) => v.id === props.vorgangId);
  // Kandidaten: der gewählte Vorgang und die direkt folgenden Einzelvorgänge derselben Ebene
  const kandidaten = useMemo(() => {
    if (!start) return [];
    const geschwister = daten.vorgaenge
      .filter((v) => v.parent_id === start.parent_id)
      .sort((a, b) => a.sortierung - b.sortierung);
    const ab = geschwister.slice(geschwister.findIndex((v) => v.id === start.id));
    const ende = ab.findIndex((v) => v.typ !== 'vorgang');
    return ende < 0 ? ab : ab.slice(0, ende);
  }, [daten.vorgaenge, start]);
  const [anzahl, setAnzahl] = useState(1);
  // Vorschlag: Unterorte des ersten Orts mit Kindern, sonst alle Blätter
  const [orte, setOrte] = useState<string[]>(() => {
    const blaetter = baum.filter((o) => !o.hatKinder);
    return blaetter.map((o) => o.id);
  });
  const [dauer, setDauer] = useState<Record<string, string>>({});
  const gewaehlt = kandidaten.slice(0, anzahl);
  const n = orte.length;
  const taktdauer = (vid: string, gesamt: number) =>
    dauer[vid] ?? String(taktDauerVorschlag(gesamt, n));

  if (!start) return null;
  const ausfuehren = async () => {
    const ok = await props.befehl('takt.vervielfaeltigen', {
      vorgaenge: gewaehlt.map((v) => ({
        id: v.id,
        taktdauer: Number(taktdauer(v.id, v.dauer_at)),
      })),
      orte: baum.filter((o) => orte.includes(o.id)).map((o) => o.id),
    });
    if (ok) props.onSchliessen();
  };

  return (
    <Dialog
      titel="Über Takte vervielfältigen (Taktzug)"
      onSchliessen={props.onSchliessen}
      breite={860}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button
            className="primaer"
            disabled={n < 2 || gewaehlt.length === 0}
            onClick={() => void ausfuehren()}
          >
            {gewaehlt.length * n} Vorgänge erzeugen
          </button>
        </>
      }
    >
      {start.typ !== 'vorgang' ? (
        <p className="tp-warnung">
          Bitte einen Einzelvorgang wählen (keinen Sammelvorgang oder Meilenstein).
        </p>
      ) : baum.length === 0 ? (
        <p className="tp-warnung">
          Es gibt noch keine Orte. Legen Sie zuerst unter <strong>Orte …</strong> die Ortsstruktur
          an.
        </p>
      ) : (
        <div className="takt-raster">
          <section>
            <h4>Vorgänge des Taktzugs</h4>
            <table className="tabelle">
              <thead>
                <tr>
                  <th />
                  <th>Nr.</th>
                  <th>Vorgang</th>
                  <th className="zahl">Dauer</th>
                  <th className="zahl">je Takt [AT]</th>
                </tr>
              </thead>
              <tbody>
                {kandidaten.map((v, i) => (
                  <tr key={v.id} className={i < anzahl ? '' : 'leise'}>
                    <td>
                      <input
                        type="checkbox"
                        checked={i < anzahl}
                        disabled={i === 0}
                        aria-label={`${v.nr} einbeziehen`}
                        onChange={(e) => setAnzahl(e.target.checked ? i + 1 : i)}
                      />
                    </td>
                    <td>{v.nr}</td>
                    <td>{v.name}</td>
                    <td className="zahl">{v.dauer_at}</td>
                    <td className="zahl">
                      <input
                        className="takt-dauer"
                        inputMode="numeric"
                        disabled={i >= anzahl}
                        value={taktdauer(v.id, v.dauer_at)}
                        onChange={(e) => setDauer({ ...dauer, [v.id]: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="leise">
              Nur direkt aufeinanderfolgende Einzelvorgänge derselben Ebene. Vorschlag je Takt:
              ⌈Dauer ÷ Anzahl Orte⌉.
            </p>
          </section>
          <section>
            <h4>Orte (Taktreihenfolge)</h4>
            <div className="takt-orte">
              {baum.map((o) => (
                <label key={o.id} className="inline" style={{ paddingLeft: o.ebene * 16 }}>
                  <input
                    type="checkbox"
                    checked={orte.includes(o.id)}
                    onChange={(e) =>
                      setOrte(e.target.checked ? [...orte, o.id] : orte.filter((x) => x !== o.id))
                    }
                  />
                  {o.name}
                </label>
              ))}
            </div>
          </section>
          <p className="dialog-erklaerung takt-breit">
            Je Ort eine Kopie (Nr. „{start.nr}.1, {start.nr}.2 …“). Gleiche Arbeit wird von Ort zu
            Ort, innerhalb eines Orts in der Reihenfolge des Taktzugs mit EA verkettet. Die
            Originale werden Sammelvorgänge; ihre Vorgänger gehen an den ersten Ort, ihre Nachfolger
            an den letzten. Rückgängig ist möglich.
          </p>
        </div>
      )}
    </Dialog>
  );
}
