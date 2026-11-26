import type { AnsichtProps } from '@bautakt/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { mtaVerschiebung, type MtaDaten } from '../gemeinsam/mta.js';
import { datumKurz, useBefehl, usePlan } from './daten.js';
import { KeinPlan, PlanLeiste } from './gemeinsam.js';
import { MtaDiagramm, mtaFarbe } from './MtaDiagramm.js';
import { PlanDialoge, type DialogZustand } from './PlanDialoge.js';
import { SollIstLeiste } from './SollIstLeiste.js';
import { setzen, useZustand } from './zustand.js';

/** Tabelle der Termine je Bericht mit Verschiebung (E-72); auch im Druck. */
export function MtaTabelle(props: {
  daten: MtaDaten;
  sichtbar: ReadonlySet<string>;
  mitAktuell: boolean;
  onLoeschen?: (id: string) => void;
}) {
  const { daten, sichtbar, mitAktuell } = props;
  const zeigeAktuell =
    mitAktuell && !daten.berichte.some((b) => b.berichtsdatum === daten.aktuellesDatum);
  return (
    <table className="tabelle mta-tabelle">
      <thead>
        <tr>
          <th>Meilenstein</th>
          {daten.berichte.map((b) => (
            <th key={b.id} className="zahl" title={b.notiz || undefined}>
              {datumKurz(b.berichtsdatum)}
              {props.onLoeschen && (
                <button
                  className="mta-loeschen"
                  aria-label={`Bericht ${datumKurz(b.berichtsdatum)} löschen`}
                  title="Bericht löschen"
                  onClick={() => props.onLoeschen?.(b.id)}
                >
                  ×
                </button>
              )}
              {b.notiz && <div className="leise mta-notiz">{b.notiz}</div>}
            </th>
          ))}
          {zeigeAktuell && (
            <th className="zahl leise">aktuell {datumKurz(daten.aktuellesDatum)}</th>
          )}
          <th className="zahl" title="gegenüber dem ersten Bericht, in Kalendertagen (+ = später)">
            Verschiebung
          </th>
        </tr>
      </thead>
      <tbody>
        {daten.meilensteine
          .filter((m) => sichtbar.has(m.id))
          .map((m) => {
            const v = mtaVerschiebung(daten, m, mitAktuell);
            return (
              <tr key={m.id}>
                <td>
                  <span
                    className="mta-farbe"
                    style={{ background: mtaFarbe(m.nr, m.schnittstelle) }}
                  />{' '}
                  {m.nr} {m.name}
                </td>
                {daten.berichte.map((b) => {
                  const w = m.werte[b.id];
                  return (
                    <td key={b.id} className="zahl">
                      {w ? `${datumKurz(w.termin)}${w.erreicht ? ' ✓' : ''}` : '–'}
                    </td>
                  );
                })}
                {zeigeAktuell && (
                  <td className="zahl leise">
                    {m.aktuell
                      ? `${datumKurz(m.aktuell.termin)}${m.aktuell.erreicht ? ' ✓' : ''}`
                      : '–'}
                  </td>
                )}
                <td className={`zahl ${v && v > 0 ? 'negativ' : v && v < 0 ? 'positiv' : ''}`}>
                  {v === null ? '' : v === 0 ? '±0 KT' : `${v > 0 ? '+' : ''}${v} KT`}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

/** Meilenstein-Trendanalyse (E-30, E-71–E-73). */
export function MtaAnsicht({ api, status, datenstand }: AnsichtProps) {
  const z = useZustand();
  const { plaene, staende, daten, ladefehler } = usePlan(api, datenstand);
  const { befehl, fehler, setFehler } = useBefehl(api);
  const [mta, setMta] = useState<MtaDaten | null>(null);
  const [dialog, setDialog] = useState<DialogZustand>(null);
  const [notiz, setNotiz] = useState('');
  const nurLesen = status.schreibgeschuetzt;
  const planId = daten?.plan.id ?? null;

  useEffect(() => {
    if (!planId) return;
    let aktiv = true;
    void api.abfrage<MtaDaten>('termine', 'mta', { planId }).then((a) => {
      if (aktiv && a.ok) setMta(a.wert);
    });
    return () => {
      aktiv = false;
    };
  }, [api, planId, datenstand]);

  const ausgeblendet = useMemo(
    () => new Set(planId ? (z.mtaAusgeblendet[planId] ?? []) : []),
    [z.mtaAusgeblendet, planId],
  );
  const sichtbar = useMemo(
    () =>
      new Set((mta?.meilensteine ?? []).filter((m) => !ausgeblendet.has(m.id)).map((m) => m.id)),
    [mta, ausgeblendet],
  );
  const dialogSchliessen = useCallback(() => {
    setDialog(null);
    setFehler(null);
  }, [setFehler]);

  if (ladefehler) return <p className="fehler">{ladefehler}</p>;
  if (plaene === null) return <p className="leise">Lädt …</p>;
  if (plaene.length === 0) return <KeinPlan nurLesen={nurLesen} befehl={befehl} />;
  if (!daten || !mta) return <p className="leise">Lädt …</p>;

  const umschalten = (id: string) =>
    setzen((s) => {
      const liste = new Set(s.mtaAusgeblendet[daten.plan.id] ?? []);
      if (liste.has(id)) liste.delete(id);
      else liste.add(id);
      return { mtaAusgeblendet: { ...s.mtaAusgeblendet, [daten.plan.id]: [...liste] } };
    });
  const festhalten = async () => {
    if (await befehl('mta.festhalten', { planId: daten.plan.id, notiz })) setNotiz('');
  };
  const vorhanden = mta.berichte.find((b) => b.berichtsdatum === mta.aktuellesDatum);

  return (
    <div className="tp-ansicht">
      <div className="tp-werkzeuge" role="toolbar" aria-label="Meilenstein-Trendanalyse">
        <PlanLeiste
          plaene={plaene}
          planId={daten.plan.id}
          nurLesen={nurLesen}
          befehl={befehl}
          onEinstellungen={() => setDialog({ art: 'plan' })}
          onStaende={() => setDialog({ art: 'staende' })}
          onExport={() => setDialog({ art: 'export' })}
        />
        {!nurLesen && (
          <div className="tp-gruppe">
            <input
              aria-label="Notiz zum Bericht"
              placeholder="Notiz, z. B. Jour fixe 3"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
            />
            <button
              className="primaer"
              onClick={() => void festhalten()}
              title={
                vorhanden
                  ? `Es gibt schon einen Bericht zum ${datumKurz(mta.aktuellesDatum)} – er wird ersetzt.`
                  : 'Aktuelle Prognose aller Meilensteine als Bericht speichern'
              }
            >
              Berichtsstand {datumKurz(mta.aktuellesDatum)} festhalten
            </button>
          </div>
        )}
        <SollIstLeiste
          daten={daten}
          staende={staende}
          nurLesen={nurLesen}
          befehl={befehl}
          istMoeglich={false}
          onIst={() => undefined}
        />
        <label className="inline">
          <input
            type="checkbox"
            checked={z.mtaAktuell}
            onChange={(e) => setzen({ mtaAktuell: e.target.checked })}
          />
          aktuellen Stand zeigen
        </label>
      </div>
      {fehler && !dialog && (
        <div className="tp-meldung fehler" role="alert">
          {fehler}
        </div>
      )}

      {mta.meilensteine.length === 0 ? (
        <div className="tp-leer">
          <p>
            Der Plan enthält keine Meilensteine. Legen Sie im Terminplan oder im Meilensteinplan
            Meilensteine an – die MTA verfolgt deren prognostizierte Termine über die Berichte.
          </p>
        </div>
      ) : (
        <div className="mta-rahmen">
          <div className="mta-oben">
            <MtaDiagramm
              daten={mta}
              sichtbar={sichtbar}
              mitAktuell={z.mtaAktuell}
              groesse={460}
              auswahl={z.auswahl}
              onAuswahl={(id) => setzen({ auswahl: id })}
            />
            <div className="mta-auswahl">
              <strong>Meilensteine</strong>
              {mta.meilensteine.map((m) => (
                <label key={m.id} className="inline">
                  <input
                    type="checkbox"
                    checked={sichtbar.has(m.id)}
                    onChange={() => umschalten(m.id)}
                  />
                  <span
                    className="mta-farbe"
                    style={{ background: mtaFarbe(m.nr, m.schnittstelle) }}
                  />
                  {m.nr} {m.name}
                </label>
              ))}
              {mta.berichte.length === 0 && (
                <p className="leise">
                  Noch kein Bericht. Mit <strong>Berichtsstand festhalten</strong> speichern Sie die
                  aktuelle Prognose (z. B. zu jedem Jour fixe). Gestrichelt: aktueller Stand.
                </p>
              )}
            </div>
          </div>
          <MtaTabelle
            daten={mta}
            sichtbar={sichtbar}
            mitAktuell={z.mtaAktuell}
            {...(nurLesen
              ? {}
              : { onLoeschen: (id: string) => void befehl('mta.loeschen', { id }) })}
          />
          <p className="leise">
            Waagerechte Linie = Termin stabil, steigend = verschiebt sich nach hinten, fallend =
            früher. Gefüllte Raute = erreicht (✓ in der Tabelle); leere Raute = aktueller, noch
            nicht festgehaltener Stand.
          </p>
        </div>
      )}

      <PlanDialoge
        dialog={dialog}
        setDialog={setDialog}
        onSchliessen={dialogSchliessen}
        api={api}
        daten={daten}
        datenstand={datenstand}
        projektname={status.projektname}
        nurLesen={nurLesen}
        befehl={befehl}
        fehler={fehler}
        darstellung="mta"
      />
    </div>
  );
}
