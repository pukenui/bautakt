import type { BautaktApi } from '@bautakt/kern/vertrag';
import {
  Dialog,
  LeereAnsicht,
  zeitAnzeigen,
  type GlobaleAnsichtProps,
  type RendererPlugin,
} from '@bautakt/ui';
import { useEffect, useMemo, useState } from 'react';
import { zahlLesen } from '@bautakt/rechnen-aufwand';
import type { AufwandswertFelder, AufwandswertZeile } from '../gemeinsam/typen.js';
import hilfeBibliothek from '../hilfe/bibliothek.md?raw';
import './bibliothek.css';
import { KennwerteTeil } from './kennwerte.js';

export function awText(w: Pick<AufwandswertZeile, 'h_je_me' | 'einheit'>): string {
  return `${w.h_je_me.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} h/${w.einheit}`;
}

const LEER: AufwandswertFelder = {
  bezeichnung: '',
  gewerk: '',
  einheit: 'm²',
  h_je_me: 0,
  quelle: '',
  stand: '',
  anmerkung: '',
};

/** Anlegen bzw. Ändern (= neue Version, E-51). */
function EintragDialog(props: {
  api: BautaktApi;
  eintrag: AufwandswertZeile | null;
  gewerke: string[];
  onSchliessen: () => void;
}) {
  const e = props.eintrag;
  const [f, setF] = useState(() => ({
    ...(e ?? LEER),
    h_je_me: e ? String(e.h_je_me).replace('.', ',') : '',
  }));
  const [fehler, setFehler] = useState<string | null>(null);
  const setze = <K extends keyof typeof f>(k: K, w: (typeof f)[K]) => setF({ ...f, [k]: w });

  const speichern = async () => {
    const daten = {
      bezeichnung: f.bezeichnung,
      gewerk: f.gewerk,
      einheit: f.einheit,
      h_je_me: zahlLesen(f.h_je_me),
      quelle: f.quelle,
      stand: f.stand,
      anmerkung: f.anmerkung,
    };
    const a = await props.api.global.aktion(
      'bibliothek',
      e ? 'aufwandswert.aendern' : 'aufwandswert.anlegen',
      e ? { id: e.id, ...daten } : daten,
    );
    if (a.ok) props.onSchliessen();
    else setFehler(a.fehler);
  };

  return (
    <Dialog
      titel={e ? `Aufwandswert ändern (wird Version ${e.version + 1})` : 'Neuer Aufwandswert'}
      onSchliessen={props.onSchliessen}
      breite={640}
      fuss={
        <>
          {fehler && <span className="fehler">{fehler}</span>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button className="primaer" onClick={() => void speichern()}>
            Speichern
          </button>
        </>
      }
    >
      <div className="formular">
        <label className="feld breit">
          <span className="feld-label">Bezeichnung (Pflicht)</span>
          <input
            autoFocus
            value={f.bezeichnung}
            placeholder="z. B. Schalung Ortbetonwände"
            onChange={(ev) => setze('bezeichnung', ev.target.value)}
          />
        </label>
        <label className="feld">
          <span className="feld-label">Gewerk</span>
          <input
            list="bib-gewerke"
            value={f.gewerk}
            onChange={(ev) => setze('gewerk', ev.target.value)}
          />
          <datalist id="bib-gewerke">
            {props.gewerke.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <label className="feld">
          <span className="feld-label">Mengeneinheit (ME)</span>
          <input
            list="bib-einheiten"
            value={f.einheit}
            onChange={(ev) => setze('einheit', ev.target.value)}
          />
          <datalist id="bib-einheiten">
            {['m²', 'm³', 'm', 'Stk', 't', 'kg', 'psch'].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <label className="feld">
          <span className="feld-label">Aufwandswert [h/{f.einheit || 'ME'}]</span>
          <input
            inputMode="decimal"
            value={f.h_je_me}
            placeholder="z. B. 0,50"
            onChange={(ev) => setze('h_je_me', ev.target.value)}
          />
        </label>
        <label className="feld">
          <span className="feld-label">Stand</span>
          <input
            value={f.stand}
            placeholder="z. B. 2024"
            onChange={(ev) => setze('stand', ev.target.value)}
          />
        </label>
        <label className="feld breit">
          <span className="feld-label">Quelle (Pflicht)</span>
          <input
            value={f.quelle}
            placeholder="z. B. UE 05, Folie 21 / eigene Nachkalkulation Projekt X"
            onChange={(ev) => setze('quelle', ev.target.value)}
          />
        </label>
        <label className="feld breit">
          <span className="feld-label">Anmerkung</span>
          <textarea
            rows={2}
            value={f.anmerkung}
            onChange={(ev) => setze('anmerkung', ev.target.value)}
          />
        </label>
      </div>
      {e && (
        <p className="dialog-erklaerung">
          Projekte, die Version {e.version} verwenden, behalten ihre eingefrorene Kopie und zeigen
          einen Hinweis auf die neue Version.
        </p>
      )}
    </Dialog>
  );
}

function VersionenDialog(props: { api: BautaktApi; id: string; onSchliessen: () => void }) {
  const [liste, setListe] = useState<AufwandswertZeile[]>([]);
  useEffect(() => {
    void props.api.global
      .abfrage<AufwandswertZeile[]>('bibliothek', 'versionen', { id: props.id })
      .then((a) => a.ok && setListe(a.wert));
  }, [props.api, props.id]);
  return (
    <Dialog
      titel={`Versionen: ${liste[0]?.bezeichnung ?? ''}`}
      onSchliessen={props.onSchliessen}
      breite={860}
      fuss={<button onClick={props.onSchliessen}>Schließen</button>}
    >
      <table className="tabelle">
        <thead>
          <tr>
            <th>Version</th>
            <th>Geändert</th>
            <th>Bezeichnung</th>
            <th>AW</th>
            <th>Quelle</th>
            <th>Stand</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {liste.map((v) => (
            <tr key={v.version}>
              <td>{v.version}</td>
              <td>{zeitAnzeigen(v.erstellt)}</td>
              <td>{v.bezeichnung}</td>
              <td className="zahl">{awText(v)}</td>
              <td>{v.quelle}</td>
              <td>{v.stand}</td>
              <td>{v.ausgeblendet ? 'gelöscht' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

/** Aufwandswerte der Bibliothek (E-23, E-51). */
function AufwandswerteTeil({ api, datenstand }: GlobaleAnsichtProps) {
  const [liste, setListe] = useState<AufwandswertZeile[] | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [gewerk, setGewerk] = useState<string | null>(null);
  const [geloeschte, setGeloeschte] = useState(false);
  const [dialog, setDialog] = useState<
    { art: 'eintrag'; eintrag: AufwandswertZeile | null } | { art: 'versionen'; id: string } | null
  >(null);

  useEffect(() => {
    let aktiv = true;
    void api.global
      .abfrage<AufwandswertZeile[]>('bibliothek', 'aufwandswerte', {
        mitAusgeblendeten: geloeschte,
      })
      .then((a) => {
        if (!aktiv) return;
        if (a.ok) {
          setListe(a.wert);
          setLadefehler(null);
        } else setLadefehler(a.fehler);
      });
    return () => {
      aktiv = false;
    };
  }, [api, datenstand, geloeschte]);

  const gewerke = useMemo(
    () =>
      [...new Set((liste ?? []).map((w) => w.gewerk).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'de'),
      ),
    [liste],
  );
  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return (liste ?? []).filter(
      (w) =>
        (gewerk === null || w.gewerk === gewerk) &&
        (!s || `${w.bezeichnung} ${w.gewerk} ${w.quelle} ${w.anmerkung}`.toLowerCase().includes(s)),
    );
  }, [liste, suche, gewerk]);

  const aktion = async (name: string, id: string) => {
    const a = await api.global.aktion('bibliothek', name, { id });
    setFehler(a.ok ? null : a.fehler);
  };

  if (ladefehler) return <p className="fehler">{ladefehler}</p>;
  if (!liste) return <p className="leise">Lädt …</p>;

  return (
    <>
      <div className="werkzeugleiste">
        <button className="primaer" onClick={() => setDialog({ art: 'eintrag', eintrag: null })}>
          + Aufwandswert
        </button>
        <input
          type="search"
          aria-label="Suche"
          placeholder="Suchen …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        <label className="inline">
          Gewerk
          <select
            value={gewerk ?? '*'}
            onChange={(e) => setGewerk(e.target.value === '*' ? null : e.target.value)}
          >
            <option value="*">alle</option>
            {gewerke.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={geloeschte}
            onChange={(e) => setGeloeschte(e.target.checked)}
          />
          gelöschte anzeigen
        </label>
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
      {liste.length === 0 && !geloeschte ? (
        <LeereAnsicht titel="Noch keine Aufwandswerte">
          <p>
            Legen Sie Aufwandswerte mit Quelle an, z. B. „Schalung Ortbetonwände, 0,50 h/m², Quelle
            UE 05“. Im Terminplan rechnen Sie damit über <strong>Aufwandswert …</strong> die Dauer
            eines Vorgangs aus.
          </p>
          <div className="knoepfe">
            <button
              className="primaer"
              onClick={() => setDialog({ art: 'eintrag', eintrag: null })}
            >
              Ersten Aufwandswert anlegen
            </button>
          </div>
        </LeereAnsicht>
      ) : (
        <table className="tabelle bib-tabelle">
          <thead>
            <tr>
              <th>Bezeichnung</th>
              <th>Gewerk</th>
              <th className="zahl">Aufwandswert</th>
              <th>Quelle</th>
              <th>Stand</th>
              <th className="zahl" title="Versionsnummer">
                Vers.
              </th>
              <th>Geändert</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((w) => (
              <tr key={w.id} className={w.ausgeblendet ? 'geloescht' : ''}>
                <td title={w.anmerkung || undefined}>{w.bezeichnung}</td>
                <td>{w.gewerk}</td>
                <td className="zahl">{awText(w)}</td>
                <td>{w.quelle}</td>
                <td>{w.stand}</td>
                <td className="zahl">{w.version}</td>
                <td>{zeitAnzeigen(w.erstellt)}</td>
                <td className="aktionen">
                  {w.ausgeblendet ? (
                    <button onClick={() => void aktion('aufwandswert.einblenden', w.id)}>
                      Wiederherstellen
                    </button>
                  ) : (
                    <>
                      <button onClick={() => setDialog({ art: 'eintrag', eintrag: w })}>
                        Bearbeiten
                      </button>
                      <button onClick={() => void aktion('aufwandswert.ausblenden', w.id)}>
                        Löschen
                      </button>
                    </>
                  )}
                  {w.version > 1 && (
                    <button onClick={() => setDialog({ art: 'versionen', id: w.id })}>
                      Versionen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog?.art === 'eintrag' && (
        <EintragDialog
          api={api}
          eintrag={dialog.eintrag}
          gewerke={gewerke}
          onSchliessen={() => setDialog(null)}
        />
      )}
      {dialog?.art === 'versionen' && (
        <VersionenDialog api={api} id={dialog.id} onSchliessen={() => setDialog(null)} />
      )}
    </>
  );
}

/** Reiter „Bibliothek“ (E-23): Aufwandswerte und Kostenkennwerte, auch ohne geöffnetes Projekt. */
function BibliothekAnsicht(props: GlobaleAnsichtProps) {
  const [teil, setTeil] = useState<'aufwand' | 'kennwert'>('aufwand');
  return (
    <div className="ansicht bib-ansicht">
      <div className="bib-teile" role="tablist" aria-label="Bibliothek">
        {(
          [
            ['aufwand', 'Aufwandswerte'],
            ['kennwert', 'Kostenkennwerte'],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            role="tab"
            aria-selected={teil === k}
            className={teil === k ? 'aktiv' : ''}
            onClick={() => setTeil(k)}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="leise bib-hinweis">
        Die Bibliothek gilt für alle Projekte (App-Datenordner). Jede Änderung legt eine neue
        Version an; Projekte behalten die Version, mit der gerechnet wurde.
      </p>
      {teil === 'aufwand' ? <AufwandswerteTeil {...props} /> : <KennwerteTeil {...props} />}
    </div>
  );
}

export const bibliothekRenderer: RendererPlugin = {
  id: 'bibliothek',
  ansichten: [],
  globaleAnsichten: [
    {
      id: 'bibliothek.aufwandswerte',
      titel: 'Bibliothek',
      komponente: BibliothekAnsicht,
      hilfe: hilfeBibliothek,
    },
  ],
};
