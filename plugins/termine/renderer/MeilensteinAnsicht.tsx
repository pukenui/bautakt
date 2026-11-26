import type { AnsichtProps } from '@bautakt/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VorgangMitEbene } from '../gemeinsam/typen.js';
import { useBefehl, useKalender, usePlan } from './daten.js';
import { KeinPlan, Kennzahlen, PlanLeiste } from './gemeinsam.js';
import { ListenTabelle } from './ListenTabelle.js';
import { meilensteinliste } from './listen.js';
import { meilensteinSpalten } from './listenSpalten.js';
import { PlanDialoge, type DialogZustand } from './PlanDialoge.js';
import { SollIstLeiste } from './SollIstLeiste.js';
import { heuteIso, Meldung } from './TerminlisteAnsicht.js';
import { Zeitleiste } from './Zeitleiste.js';
import { setzen, useZustand } from './zustand.js';

/** Meilensteinplan (E-48, E-49): Zeitleiste mit Rauten und bearbeitbare Meilenstein-Tabelle. */
export function MeilensteinAnsicht({ api, status, datenstand }: AnsichtProps) {
  const z = useZustand();
  const { plaene, staende, daten, ladefehler } = usePlan(api, datenstand);
  const { befehl, fehler, setFehler } = useBefehl(api);
  const kal = useKalender(daten);
  const [dialog, setDialog] = useState<DialogZustand>(null);
  const nurLesen = status.schreibgeschuetzt;

  const liste = useMemo(() => (daten ? meilensteinliste(daten) : []), [daten]);
  const leiste = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(900);
  useEffect(() => {
    const el = leiste.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBreite(Math.max(400, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [liste.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const eintraege = useMemo(() => liste.map((m) => ({ art: 'vorgang' as const, v: m.v })), [liste]);
  const spalten = useMemo(() => (daten ? meilensteinSpalten(daten, befehl) : []), [daten, befehl]);

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
  if (!daten || !kal) return <p className="leise">Lädt …</p>;

  const neu = async () => {
    // neuer Meilenstein hinter der Auswahl (gleiche Ebene) bzw. am Ende des Plans
    const ids = await befehl('vorgang.anlegen', {
      planId: daten.plan.id,
      typ: 'meilenstein',
      ...(gewaehlt ? { nachId: gewaehlt.id } : {}),
    });
    if (ids?.[0]) setzen({ auswahl: ids[0] });
  };
  const loeschen = async () => {
    if (!gewaehlt) return;
    const i = liste.findIndex((m) => m.v.id === gewaehlt.id);
    if (await befehl('vorgang.loeschen', { ids: [gewaehlt.id] })) {
      const n = liste[i + 1] ?? liste[i - 1];
      setzen({ auswahl: n && n.v.id !== gewaehlt.id ? n.v.id : null });
    }
  };
  const istMeilenstein = gewaehlt?.typ === 'meilenstein';

  return (
    <div className="tp-ansicht">
      <div className="tp-werkzeuge" role="toolbar" aria-label="Meilensteinplan">
        <PlanLeiste
          plaene={plaene}
          planId={daten.plan.id}
          nurLesen={nurLesen}
          befehl={befehl}
          onEinstellungen={() => setDialog({ art: 'plan' })}
          onStaende={() => setDialog({ art: 'staende' })}
          onExport={() => setDialog({ art: 'export' })}
        />
        <div className="tp-gruppe">
          {!nurLesen && (
            <button onClick={() => void neu()} title="Neuer Meilenstein hinter der Auswahl">
              + ◆ Meilenstein
            </button>
          )}
          <button
            disabled={!istMeilenstein}
            onClick={() => gewaehlt && setDialog({ art: 'vorgang', id: gewaehlt.id })}
          >
            Eigenschaften …
          </button>
          <button
            disabled={!istMeilenstein}
            onClick={() => gewaehlt && setDialog({ art: 'beziehung', id: gewaehlt.id })}
            title="Vorgänger des Meilensteins"
          >
            Vorgänger …
          </button>
          {!nurLesen && (
            <button disabled={!istMeilenstein} onClick={() => void loeschen()}>
              Löschen
            </button>
          )}
        </div>
        <SollIstLeiste
          daten={daten}
          staende={staende}
          nurLesen={nurLesen}
          befehl={befehl}
          istMoeglich={istMeilenstein}
          onIst={() => gewaehlt && setDialog({ art: 'ist', id: gewaehlt.id })}
        />
      </div>

      <Kennzahlen daten={daten} />
      {!dialog && <Meldung fehler={fehler} onSchliessen={() => setFehler(null)} />}

      {liste.length === 0 ? (
        <div className="tp-leer">
          <p>
            Noch keine Meilensteine. Mit <strong>+ ◆ Meilenstein</strong> anlegen und über{' '}
            <strong>Vorgänger …</strong> anbinden. Schnittstellentermine (z. B. „Übergabe des freien
            Baufelds“) bekommen eine Bedingung „nicht früher als“ oder „muss enden am“.
          </p>
        </div>
      ) : (
        <>
          <div className="ml-leiste" ref={leiste}>
            <Zeitleiste
              daten={daten}
              eintraege={liste}
              kal={kal}
              breite={breite}
              auswahl={auswahl}
              onAuswahl={setAuswahl}
              onOeffnen={(id) => setDialog({ art: 'vorgang', id })}
              heute={heuteIso()}
            />
          </div>
          <ListenTabelle
            eintraege={eintraege}
            spalten={spalten}
            nurLesen={nurLesen}
            auswahl={auswahl}
            setAuswahl={setAuswahl}
            onEigenschaften={(id) => setDialog({ art: 'vorgang', id })}
            zeilenKlasse={zeilenKlasse}
            label="Meilensteine"
          />
          <div className="tp-legende leise">
            ◆ schwarz = Meilenstein, rot = kritisch, orange = Schnittstellentermin, grün = erreicht;
            ◇ grau = Soll-Termin aus dem Vergleichsstand.
          </div>
        </>
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
        darstellung="meilensteinplan"
      />
    </div>
  );
}
