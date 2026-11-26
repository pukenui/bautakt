import type { AnsichtProps } from '@bautakt/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { Balkenplan } from './Balkenplan.js';
import { sichtbareVorgaenge, useBefehl, useKalender, usePlan } from './daten.js';
import { SollIstLeiste } from './SollIstLeiste.js';
import { KeinPlan, Kennzahlen, PlanLeiste } from './gemeinsam.js';
import { PlanDialoge, type DialogZustand } from './PlanDialoge.js';
import { Tabelle } from './Tabelle.js';
import { setzen, useZustand, zuklappen } from './zustand.js';

/** Hauptansicht (E-18): links Vorgangstabelle, rechts vernetzter Balkenplan. */
export function TerminplanAnsicht({ api, status, datenstand }: AnsichtProps) {
  const z = useZustand();
  const { plaene, staende, daten, ladefehler } = usePlan(api, datenstand);
  const { befehl, fehler, setFehler } = useBefehl(api);
  const kal = useKalender(daten);
  const [dialog, setDialog] = useState<DialogZustand>(null);
  const nurLesen = status.schreibgeschuetzt;

  // gemeinsames vertikales Scrollen von Tabelle und Balkenplan
  const tabRef = useRef<HTMLDivElement>(null);
  const balkenRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [hoehe, setHoehe] = useState(600);
  const sync = useCallback((e: UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    for (const el of [tabRef.current, balkenRef.current])
      if (el && el !== e.currentTarget && el.scrollTop !== top) el.scrollTop = top;
    setScrollTop(top);
  }, []);
  useEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHoehe(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [daten !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const zeilen = useMemo(
    () => (daten ? sichtbareVorgaenge(daten.vorgaenge, z.zugeklappt[daten.plan.id] ?? []) : []),
    [daten, z.zugeklappt],
  );
  const risikoNr = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of daten?.vorgaenge ?? []) if (v.risiko.trim()) m.set(v.id, m.size + 1);
    return m;
  }, [daten]);

  const auswahl = z.auswahl && daten?.vorgaenge.some((v) => v.id === z.auswahl) ? z.auswahl : null;
  const gewaehlt = daten?.vorgaenge.find((v) => v.id === auswahl) ?? null;
  const setAuswahl = useCallback((id: string) => setzen({ auswahl: id }), []);

  const neu = async (typ: 'vorgang' | 'meilenstein' | 'sammel') => {
    if (!daten) return;
    const ids = await befehl('vorgang.anlegen', {
      planId: daten.plan.id,
      typ,
      ...(auswahl ? { nachId: auswahl } : {}),
    });
    if (ids?.[0]) setzen({ auswahl: ids[0] });
    tabRef.current?.focus();
  };
  const loeschen = async () => {
    if (!gewaehlt || !daten) return;
    const i = zeilen.findIndex((v) => v.id === gewaehlt.id);
    if (await befehl('vorgang.loeschen', { ids: [gewaehlt.id] })) {
      const n = zeilen[i + 1] ?? zeilen[i - 1];
      setzen({ auswahl: n && n.id !== gewaehlt.id ? n.id : null });
    }
  };
  const einruecken = (rein: boolean) =>
    gewaehlt &&
    void befehl(rein ? 'vorgang.einruecken' : 'vorgang.ausruecken', { id: gewaehlt.id });
  const dialogSchliessen = useCallback(() => {
    setDialog(null);
    setFehler(null);
  }, [setFehler]);

  if (ladefehler) return <p className="fehler">{ladefehler}</p>;
  if (plaene === null) return <p className="leise">Lädt …</p>;
  if (plaene.length === 0) return <KeinPlan nurLesen={nurLesen} befehl={befehl} />;
  if (!daten || !kal) return <p className="leise">Lädt …</p>;

  const zu = z.zugeklappt[daten.plan.id] ?? [];
  const risiken = daten.vorgaenge.filter((v) => risikoNr.has(v.id));

  return (
    <div className="tp-ansicht">
      <div className="tp-werkzeuge" role="toolbar" aria-label="Terminplan">
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
            <button
              onClick={() => void neu('vorgang')}
              title="Neuer Vorgang unter der Auswahl (Einfg)"
            >
              + Vorgang
            </button>
            <button onClick={() => void neu('meilenstein')} title="Neuer Meilenstein">
              + ◆ Meilenstein
            </button>
            <button onClick={() => void neu('sammel')} title="Neuer Sammelvorgang">
              + Sammelvorgang
            </button>
          </div>
        )}
        {!nurLesen && (
          <div className="tp-gruppe">
            <button
              disabled={!gewaehlt}
              onClick={() => einruecken(false)}
              title="Ausrücken (Alt+Umschalt+←)"
              aria-label="Ausrücken"
            >
              ⇤
            </button>
            <button
              disabled={!gewaehlt}
              onClick={() => einruecken(true)}
              title="Einrücken – Vorgang darüber wird Sammelvorgang (Alt+Umschalt+→)"
              aria-label="Einrücken"
            >
              ⇥
            </button>
            <button
              disabled={!gewaehlt}
              onClick={() =>
                gewaehlt &&
                void befehl('vorgang.verschieben', { id: gewaehlt.id, richtung: 'hoch' })
              }
              aria-label="Nach oben"
              title="Nach oben"
            >
              ↑
            </button>
            <button
              disabled={!gewaehlt}
              onClick={() =>
                gewaehlt &&
                void befehl('vorgang.verschieben', { id: gewaehlt.id, richtung: 'runter' })
              }
              aria-label="Nach unten"
              title="Nach unten"
            >
              ↓
            </button>
            <button
              disabled={!gewaehlt}
              onClick={() => void loeschen()}
              title="Vorgang löschen (Entf)"
            >
              Löschen
            </button>
          </div>
        )}
        <div className="tp-gruppe">
          <button
            disabled={!gewaehlt}
            onClick={() => gewaehlt && setDialog({ art: 'vorgang', id: gewaehlt.id })}
            title="Alle Eigenschaften (Doppelklick)"
          >
            Eigenschaften …
          </button>
          <button
            disabled={!gewaehlt || gewaehlt.typ === 'sammel'}
            onClick={() => gewaehlt && setDialog({ art: 'beziehung', id: gewaehlt.id })}
            title="Vorgänger in Langform bearbeiten"
          >
            Vorgänger …
          </button>
          <button
            disabled={!gewaehlt || gewaehlt.typ !== 'vorgang'}
            onClick={() => gewaehlt && setDialog({ art: 'aufwand', id: gewaehlt.id })}
            title="Dauer aus Menge, Aufwandswert und Kolonne herleiten (E-24)"
          >
            Aufwandswert …
          </button>
          <button
            onClick={() => setDialog({ art: 'orte' })}
            title="Ortsstruktur des Projekts (Bauabschnitte, Geschosse …)"
          >
            Orte …
          </button>
          {!nurLesen && (
            <button
              disabled={!gewaehlt || gewaehlt.typ !== 'vorgang'}
              onClick={() => gewaehlt && setDialog({ art: 'takt', id: gewaehlt.id })}
              title="Gewählten Vorgang (und folgende) über mehrere Orte vervielfältigen (Taktzug)"
            >
              Über Takte …
            </button>
          )}
        </div>
        <SollIstLeiste
          daten={daten}
          staende={staende}
          nurLesen={nurLesen}
          befehl={befehl}
          istMoeglich={!!gewaehlt && gewaehlt.typ !== 'sammel'}
          onIst={() => gewaehlt && setDialog({ art: 'ist', id: gewaehlt.id })}
        />
        <div className="tp-gruppe">
          <select
            aria-label="Gliederung"
            value=""
            onChange={(e) => {
              const ebene = Number(e.target.value);
              const sammel = daten.vorgaenge.filter((v) => v.hatKinder);
              setzen((s) => ({
                zugeklappt: {
                  ...s.zugeklappt,
                  [daten.plan.id]:
                    ebene < 0 ? [] : sammel.filter((v) => v.ebene >= ebene).map((v) => v.id),
                },
              }));
            }}
          >
            <option value="" disabled>
              Gliederung …
            </option>
            <option value="-1">alles aufklappen</option>
            <option value="0">nur Ebene 1 (Rahmenterminplan)</option>
            <option value="1">bis Ebene 2</option>
          </select>
          <select
            aria-label="Zeitanzeige"
            value={z.zeitanzeige}
            onChange={(e) => setzen({ zeitanzeige: e.target.value as 'datum' | 'at' })}
          >
            <option value="datum">Datum</option>
            <option value="at">AT (FAZ/FEZ)</option>
          </select>
          <select
            aria-label="Vorgänger-Schreibweise"
            value={z.vorgaengerForm}
            onChange={(e) => setzen({ vorgaengerForm: e.target.value as 'kurz' | 'lang' })}
          >
            <option value="kurz">Vorgänger kurz</option>
            <option value="lang">Vorgänger lang</option>
          </select>
          <select
            aria-label="Zeitachse"
            value={z.zoom}
            onChange={(e) => setzen({ zoom: e.target.value as typeof z.zoom })}
          >
            <option value="tag">Tage</option>
            <option value="woche">KW</option>
            <option value="monat">Monate</option>
            <option value="quartal">Quartale</option>
          </select>
        </div>
      </div>

      <Kennzahlen daten={daten} />
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

      {daten.vorgaenge.length === 0 ? (
        <div className="tp-leer">
          <p>
            Noch keine Vorgänge. Mit <strong>+ Vorgang</strong> (oder Taste Einfg) anlegen, dann
            Name, Dauer und Quelle/Annahme eintragen. In der Spalte <strong>Vorgänger</strong>{' '}
            verknüpfen Sie Vorgänge, z. B. <code>1EA+10; 3EA</code>.
          </p>
        </div>
      ) : (
        <div className="tp-split" ref={splitRef}>
          <Tabelle
            daten={daten}
            zeilen={zeilen}
            zustand={z}
            nurLesen={nurLesen}
            auswahl={auswahl}
            setAuswahl={setAuswahl}
            befehl={befehl}
            onEigenschaften={(id) => setDialog({ art: 'vorgang', id })}
            onIst={(id) => setDialog({ art: 'ist', id })}
            onZuklappen={(id, zuklappenJa) => zuklappen(daten.plan.id, id, zuklappenJa)}
            onNeu={() => void neu('vorgang')}
            onLoeschen={() => void loeschen()}
            onEinruecken={einruecken}
            risikoNr={risikoNr}
            scrollRef={tabRef}
            onScroll={sync}
            scrollTop={scrollTop}
            hoehe={hoehe}
          />
          <Balkenplan
            daten={daten}
            zeilen={zeilen}
            kal={kal}
            zoom={z.zoom}
            nurLesen={nurLesen}
            auswahl={auswahl}
            setAuswahl={setAuswahl}
            onEigenschaften={(id) => setDialog({ art: 'vorgang', id })}
            onVerbinden={(von, nach) => void befehl('beziehung.anlegen', { von, nach })}
            risikoNr={risikoNr}
            scrollRef={balkenRef}
            onScroll={sync}
            scrollTop={scrollTop}
            hoehe={hoehe}
          />
        </div>
      )}

      {(risiken.length > 0 || zu.length > 0) && (
        <div className="tp-legende">
          {risiken.length > 0 && (
            <div>
              <strong>Risiken:</strong>
              {risiken.map((v) => (
                <span key={v.id} className="tp-legende-eintrag">
                  <span className="tp-risiko">{risikoNr.get(v.id)}</span> {v.nr} {v.name}:{' '}
                  {v.risiko}
                </span>
              ))}
            </div>
          )}
          {zu.length > 0 && (
            <div className="leise">
              {zu.length} Sammelvorgang/-vorgänge zugeklappt (Rahmenterminplan).
            </div>
          )}
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
        darstellung="balkenplan"
      />
    </div>
  );
}
