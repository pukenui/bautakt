import type { AnsichtProps } from '@bautakt/ui';
import { useCallback, useMemo, useState } from 'react';
import type { VorgangMitEbene } from '../gemeinsam/typen.js';
import { sichtbareVorgaenge, useBefehl, usePlan } from './daten.js';
import { KeinPlan, Kennzahlen, PlanLeiste } from './gemeinsam.js';
import { ListenTabelle } from './ListenTabelle.js';
import {
  auswahlWerte,
  filterAktiv,
  OHNE_FILTER,
  terminliste,
  type ListenFilter,
} from './listen.js';
import { terminlisteSpalten } from './listenSpalten.js';
import { PlanDialoge, type DialogZustand } from './PlanDialoge.js';
import { SollIstLeiste } from './SollIstLeiste.js';
import { setzen, useZustand } from './zustand.js';

export function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fehlermeldung eines Befehls über der Liste. */
export function Meldung(props: { fehler: string | null; onSchliessen: () => void }) {
  if (!props.fehler) return null;
  return (
    <div className="tp-meldung fehler" role="alert">
      {props.fehler}
      <button className="schliessen" onClick={props.onSchliessen} aria-label="Meldung schließen">
        ×
      </button>
    </div>
  );
}

/** Terminliste (E-47, E-49): bearbeitbare Liste mit Filter nach Gewerk, Verantwortlich, Zeitraum. */
export function TerminlisteAnsicht({ api, status, datenstand }: AnsichtProps) {
  const z = useZustand();
  const { plaene, staende, daten, ladefehler } = usePlan(api, datenstand);
  const { befehl, fehler, setFehler } = useBefehl(api);
  const [dialog, setDialog] = useState<DialogZustand>(null);
  const nurLesen = status.schreibgeschuetzt;
  const f = z.listeFilter;
  const filter = (teil: Partial<ListenFilter>) =>
    setzen((s) => ({ listeFilter: { ...s.listeFilter, ...teil } }));
  const bezug = daten?.plan.stichtag ?? heuteIso();

  const eintraege = useMemo(() => {
    if (!daten) return [];
    const sichtbar = sichtbareVorgaenge(daten.vorgaenge, z.zugeklappt[daten.plan.id] ?? []);
    return terminliste(daten, sichtbar, f, bezug);
  }, [daten, z.zugeklappt, f, bezug]);
  const werte = useMemo(() => (daten ? auswahlWerte(daten) : { gewerke: [], rollen: [] }), [daten]);
  const spalten = useMemo(
    () => (daten ? terminlisteSpalten(daten, f.gruppieren, befehl) : []),
    [daten, f.gruppieren, befehl],
  );

  const auswahl = z.auswahl && daten?.vorgaenge.some((v) => v.id === z.auswahl) ? z.auswahl : null;
  const gewaehlt = daten?.vorgaenge.find((v) => v.id === auswahl) ?? null;
  const setAuswahl = useCallback((id: string) => setzen({ auswahl: id }), []);
  const dialogSchliessen = useCallback(() => {
    setDialog(null);
    setFehler(null);
  }, [setFehler]);
  const zeilenKlasse = useCallback(
    (v: VorgangMitEbene) =>
      daten?.berechnung.ok && daten.berechnung.termine[v.id]?.kritisch ? 'kritisch' : '',
    [daten],
  );

  if (ladefehler) return <p className="fehler">{ladefehler}</p>;
  if (plaene === null) return <p className="leise">Lädt …</p>;
  if (plaene.length === 0) return <KeinPlan nurLesen={nurLesen} befehl={befehl} />;
  if (!daten) return <p className="leise">Lädt …</p>;

  const auswahlFeld = (
    label: string,
    wert: string | null,
    liste: string[],
    setzenAuf: (w: string | null) => void,
  ) => (
    <label className="inline">
      {label}
      <select
        value={wert === null ? '*' : `=${wert}`}
        onChange={(e) => setzenAuf(e.target.value === '*' ? null : e.target.value.slice(1))}
      >
        <option value="*">alle</option>
        {liste.map((g) => (
          <option key={g || '–'} value={`=${g}`}>
            {g || '(ohne)'}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="tp-ansicht">
      <div className="tp-werkzeuge" role="toolbar" aria-label="Terminliste">
        <PlanLeiste
          plaene={plaene}
          planId={daten.plan.id}
          nurLesen={nurLesen}
          befehl={befehl}
          onEinstellungen={() => setDialog({ art: 'plan' })}
          onStaende={() => setDialog({ art: 'staende' })}
          onExport={() => setDialog({ art: 'export' })}
        />
        <div className="tp-gruppe" role="group" aria-label="Filter">
          {auswahlFeld('Gewerk', f.gewerk, werte.gewerke, (gewerk) => filter({ gewerk }))}
          {auswahlFeld('Verantwortlich', f.rolle, werte.rollen, (rolle) => filter({ rolle }))}
          <label
            className="inline"
            title="Ab Stichtag bzw. heute; ein Vorgang passt, wenn er den Zeitraum berührt"
          >
            Zeitraum
            <select
              value={f.zeitraum}
              onChange={(e) => filter({ zeitraum: e.target.value as ListenFilter['zeitraum'] })}
            >
              <option value="alle">alle</option>
              <option value="2">nächste 2 Wochen</option>
              <option value="4">nächste 4 Wochen</option>
              <option value="8">nächste 8 Wochen</option>
              <option value="frei">von – bis</option>
            </select>
          </label>
          {f.zeitraum === 'frei' && (
            <>
              <input
                type="date"
                aria-label="Zeitraum von"
                value={f.von ?? ''}
                onChange={(e) => filter({ von: e.target.value || null })}
              />
              –
              <input
                type="date"
                aria-label="Zeitraum bis"
                value={f.bis ?? ''}
                onChange={(e) => filter({ bis: e.target.value || null })}
              />
            </>
          )}
          <label className="inline">
            <input
              type="checkbox"
              checked={f.gruppieren}
              onChange={(e) => filter({ gruppieren: e.target.checked })}
            />
            nach Gewerk gruppieren
          </label>
          {(filterAktiv(f) || f.gruppieren) && (
            <button onClick={() => setzen({ listeFilter: OHNE_FILTER })}>
              Filter zurücksetzen
            </button>
          )}
        </div>
        <div className="tp-gruppe">
          <button
            disabled={!gewaehlt}
            onClick={() => gewaehlt && setDialog({ art: 'vorgang', id: gewaehlt.id })}
            title="Alle Eigenschaften (Doppelklick auf eine Terminspalte)"
          >
            Eigenschaften …
          </button>
        </div>
        <SollIstLeiste
          daten={daten}
          staende={staende}
          nurLesen={nurLesen}
          befehl={befehl}
          istMoeglich={!!gewaehlt && gewaehlt.typ !== 'sammel'}
          onIst={() => gewaehlt && setDialog({ art: 'ist', id: gewaehlt.id })}
        />
      </div>

      <Kennzahlen daten={daten} />
      {!dialog && <Meldung fehler={fehler} onSchliessen={() => setFehler(null)} />}

      {daten.vorgaenge.length === 0 ? (
        <div className="tp-leer">
          <p>
            Noch keine Vorgänge. Vorgänge legen Sie im <strong>Terminplan</strong> an; hier
            erscheinen sie als Liste mit Terminen, filterbar nach Gewerk, Verantwortlichem und
            Zeitraum.
          </p>
        </div>
      ) : eintraege.length === 0 ? (
        <div className="tp-leer">
          <p>Kein Vorgang passt zum Filter.</p>
        </div>
      ) : (
        <ListenTabelle
          eintraege={eintraege}
          spalten={spalten}
          nurLesen={nurLesen}
          auswahl={auswahl}
          setAuswahl={setAuswahl}
          onEigenschaften={(id) => setDialog({ art: 'vorgang', id })}
          zeilenKlasse={zeilenKlasse}
          label="Terminliste"
        />
      )}
      {!f.gruppieren && (z.zugeklappt[daten.plan.id]?.length ?? 0) > 0 && (
        <div className="leise">Zugeklappte Sammelvorgänge (Terminplan) bleiben auch hier zu.</div>
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
        darstellung="terminliste"
      />
    </div>
  );
}
