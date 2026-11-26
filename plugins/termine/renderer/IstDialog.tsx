import type { BautaktApi } from '@bautakt/kern/vertrag';
import { Dialog } from '@bautakt/ui';
import { useEffect, useState } from 'react';
import { URSACHEN, type IstZeile, type PlanDaten, type Ursache } from '../gemeinsam/typen.js';
import { datumKurz } from './daten.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

/**
 * Ist-Erfassung eines Vorgangs zum Stichtag (E-32): Ist-Anfang, Ist-Ende, Fertigstellungsgrad,
 * Restdauer, Abweichungsursache. Jede Meldung wird je Stichtag gespeichert (E-45).
 */
export function IstDialog(props: {
  api: BautaktApi;
  daten: PlanDaten;
  vorgangId: string;
  datenstand: number;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const { daten } = props;
  const v = daten.vorgaenge.find((x) => x.id === props.vorgangId);
  const stichtag = daten.plan.stichtag;
  const t = daten.berechnung.ok ? daten.berechnung.termine[props.vorgangId] : undefined;
  const letzte = daten.ist[props.vorgangId];
  const [verlauf, setVerlauf] = useState<IstZeile[]>([]);
  const [f, setF] = useState(() => ({
    ist_anfang: letzte?.ist_anfang ?? '',
    ist_ende: letzte?.ist_ende ?? '',
    fertig_prozent:
      letzte?.fertig_prozent != null && !letzte.ist_ende ? String(letzte.fertig_prozent) : '',
    restdauer_at: letzte?.restdauer_at != null ? String(letzte.restdauer_at) : '',
    ursache: (letzte?.ursache ?? '') as Ursache | '',
    ursache_text: letzte?.ursache_text ?? '',
  }));

  useEffect(() => {
    let aktiv = true;
    void props.api
      .abfrage<IstZeile[]>('termine', 'istVerlauf', { vorgangId: props.vorgangId })
      .then((a) => aktiv && a.ok && setVerlauf(a.wert));
    return () => {
      aktiv = false;
    };
  }, [props.api, props.vorgangId, props.datenstand]);

  if (!v) return null;
  const meilenstein = v.typ === 'meilenstein';
  const zahl = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  const speichern = async () => {
    if (!stichtag) return;
    const ok = await props.befehl('ist.setzen', {
      vorgangId: v.id,
      stichtag,
      ist_anfang: (meilenstein ? f.ist_ende : f.ist_anfang) || null,
      ist_ende: f.ist_ende || null,
      fertig_prozent: f.ist_ende ? null : zahl(f.fertig_prozent),
      restdauer_at: f.ist_ende ? null : zahl(f.restdauer_at),
      ursache: f.ursache || null,
      ursache_text: f.ursache_text,
    });
    if (ok) props.onSchliessen();
  };

  // Vorschlag: geplanter Anfang als Ist-Anfang übernehmen
  const planAnfang = t?.anfang;

  return (
    <Dialog
      titel={`Ist-Stand ${v.nr} ${v.name}`}
      onSchliessen={props.onSchliessen}
      breite={720}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          {!props.nurLesen && stichtag && (
            <button className="primaer" onClick={() => void speichern()}>
              Übernehmen
            </button>
          )}
        </>
      }
    >
      {!stichtag ? (
        <p className="tp-warnung">
          Bitte zuerst oben in der Werkzeugleiste einen <strong>Stichtag</strong> setzen.
          Ist-Meldungen gelten immer zu einem Stichtag.
        </p>
      ) : (
        <>
          <p className="dialog-erklaerung">
            Meldung zum Stichtag <strong>{datumKurz(stichtag)}</strong>. Bei begonnenen Vorgängen
            Fertigstellungsgrad oder Restdauer angeben; die Restdauer hat Vorrang (E-43). Geplante
            Dauer: {v.dauer_at} AT.
          </p>
          <fieldset disabled={props.nurLesen} className="formular">
            {!meilenstein && (
              <label className="feld">
                <span className="feld-label">Ist-Anfang</span>
                <span className="inline">
                  <input
                    type="date"
                    value={f.ist_anfang}
                    max={stichtag}
                    onChange={(e) => setF({ ...f, ist_anfang: e.target.value })}
                  />
                  {planAnfang && !f.ist_anfang && planAnfang <= stichtag && (
                    <button
                      type="button"
                      onClick={() => setF({ ...f, ist_anfang: planAnfang })}
                      title="Geplanten Anfang übernehmen"
                    >
                      = Plan
                    </button>
                  )}
                </span>
              </label>
            )}
            <label className="feld">
              <span className="feld-label">
                {meilenstein ? 'erreicht am' : 'Ist-Ende (= fertig)'}
              </span>
              <input
                type="date"
                value={f.ist_ende}
                max={stichtag}
                onChange={(e) => setF({ ...f, ist_ende: e.target.value })}
              />
            </label>
            {!meilenstein && !f.ist_ende && (
              <>
                <label className="feld">
                  <span className="feld-label">Fertigstellungsgrad [%]</span>
                  <input
                    inputMode="numeric"
                    value={f.fertig_prozent}
                    placeholder="0–99"
                    onChange={(e) => setF({ ...f, fertig_prozent: e.target.value })}
                  />
                </label>
                <label className="feld">
                  <span className="feld-label">Restdauer [AT] ab Stichtag</span>
                  <input
                    inputMode="numeric"
                    value={f.restdauer_at}
                    placeholder="hat Vorrang vor %"
                    onChange={(e) => setF({ ...f, restdauer_at: e.target.value })}
                  />
                </label>
              </>
            )}
            <label className="feld">
              <span className="feld-label">Abweichungsursache</span>
              <select
                value={f.ursache}
                onChange={(e) => setF({ ...f, ursache: e.target.value as Ursache | '' })}
              >
                <option value="">–</option>
                {(Object.keys(URSACHEN) as Ursache[]).map((u) => (
                  <option key={u} value={u}>
                    {URSACHEN[u]}
                  </option>
                ))}
              </select>
            </label>
            <label className="feld breit">
              <span className="feld-label">Erläuterung (eigener Text)</span>
              <textarea
                rows={2}
                value={f.ursache_text}
                onChange={(e) => setF({ ...f, ursache_text: e.target.value })}
              />
            </label>
          </fieldset>
        </>
      )}

      {verlauf.length > 0 && (
        <>
          <h3>Bisherige Meldungen</h3>
          <table className="tabelle ist-verlauf">
            <thead>
              <tr>
                <th>Stichtag</th>
                <th>Ist-Anfang</th>
                <th>Ist-Ende</th>
                <th>%</th>
                <th>Rest</th>
                <th>Ursache</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {verlauf.map((z) => (
                <tr key={z.id}>
                  <td>{datumKurz(z.stichtag)}</td>
                  <td>{z.ist_anfang ? datumKurz(z.ist_anfang) : '–'}</td>
                  <td>{z.ist_ende ? datumKurz(z.ist_ende) : '–'}</td>
                  <td>{z.fertig_prozent ?? '–'}</td>
                  <td>{z.restdauer_at ?? '–'}</td>
                  <td title={z.ursache_text}>{z.ursache ? URSACHEN[z.ursache] : ''}</td>
                  <td>
                    {!props.nurLesen && (
                      <button onClick={() => void props.befehl('ist.loeschen', { id: z.id })}>
                        Löschen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Dialog>
  );
}
