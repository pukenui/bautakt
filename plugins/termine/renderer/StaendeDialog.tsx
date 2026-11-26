import type { BautaktApi, StandZeile } from '@bautakt/kern/vertrag';
import { Dialog, zeitAnzeigen } from '@bautakt/ui';
import { useCallback, useEffect, useState } from 'react';

/**
 * Benannte Soll-Stände (E-22, E-32): speichern, umbenennen, löschen und zurückspringen.
 * Ein Stand umfasst alle Pläne des Projekts. Vor jedem Rücksprung legt Bautakt automatisch
 * eine Sicherung des aktuellen Zustands an.
 */
export function StaendeDialog(props: {
  api: BautaktApi;
  datenstand: number;
  nurLesen: boolean;
  onSchliessen: () => void;
}) {
  const { api } = props;
  const [liste, setListe] = useState<StandZeile[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const heute = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const [neu, setNeu] = useState({ name: `Stand ${heute}`, notiz: '' });
  const [rueck, setRueck] = useState<string | null>(null);
  const [umbenennen, setUmbenennen] = useState<{ id: string; name: string } | null>(null);
  const [zeigeSicherungen, setZeigeSicherungen] = useState(false);

  useEffect(() => {
    let aktiv = true;
    void api.abfrage<StandZeile[]>('kern', 'staende').then((a) => {
      if (!aktiv) return;
      if (a.ok) setListe(a.wert);
      else setFehler(a.fehler);
    });
    return () => {
      aktiv = false;
    };
  }, [api, props.datenstand]);

  const befehl = useCallback(
    async (name: string, daten: unknown) => {
      const a = await api.befehl.ausfuehren('kern', name, daten);
      setFehler(a.ok ? null : a.fehler);
      return a.ok;
    },
    [api],
  );

  const sichtbar = liste.filter((s) => zeigeSicherungen || s.art === 'soll');
  const anzahlSicherungen = liste.filter((s) => s.art === 'sicherung').length;

  return (
    <Dialog
      titel="Soll-Stände"
      onSchliessen={props.onSchliessen}
      breite={760}
      fuss={
        <>
          {fehler && <span className="fehler">{fehler}</span>}
          <button className="primaer" onClick={props.onSchliessen}>
            Schließen
          </button>
        </>
      }
    >
      <p className="dialog-erklaerung">
        Ein Stand friert alle Pläne mit Vorgängen, Beziehungen, Kalendern und berechneten Terminen
        ein (z. B. „Soll Vertrag“, „Stand Sprechstunde 26.11.“). Beim Zurückspringen wird der
        aktuelle Zustand vorher automatisch gesichert; Strg+Z macht den Rücksprung rückgängig.
      </p>
      {!props.nurLesen && (
        <div className="stand-neu">
          <input
            aria-label="Name des Stands"
            value={neu.name}
            onChange={(e) => setNeu({ ...neu, name: e.target.value })}
          />
          <input
            aria-label="Notiz"
            placeholder="Notiz (optional)"
            value={neu.notiz}
            onChange={(e) => setNeu({ ...neu, notiz: e.target.value })}
          />
          <button
            className="primaer"
            disabled={!neu.name.trim()}
            onClick={async () => {
              if (await befehl('stand.speichern', { name: neu.name, notiz: neu.notiz })) {
                setNeu({ name: `Stand ${heute}`, notiz: '' });
              }
            }}
          >
            Stand speichern
          </button>
        </div>
      )}
      {sichtbar.length === 0 ? (
        <p className="leise">Noch kein Stand gespeichert.</p>
      ) : (
        <table className="tabelle staende">
          <thead>
            <tr>
              <th>Name</th>
              <th>gespeichert</th>
              <th>Notiz</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sichtbar.map((s) => (
              <tr key={s.id} className={s.art === 'sicherung' ? 'leise' : ''}>
                <td>
                  {umbenennen?.id === s.id ? (
                    <input
                      autoFocus
                      aria-label="Neuer Name"
                      value={umbenennen.name}
                      onChange={(e) => setUmbenennen({ id: s.id, name: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === 'Escape') setUmbenennen(null);
                        if (e.key === 'Enter' && (await befehl('stand.umbenennen', umbenennen)))
                          setUmbenennen(null);
                      }}
                    />
                  ) : (
                    <>
                      {s.name}
                      {s.art === 'sicherung' && (
                        <span className="stand-art"> (automatische Sicherung)</span>
                      )}
                    </>
                  )}
                </td>
                <td>{zeitAnzeigen(s.zeit)}</td>
                <td>{s.notiz}</td>
                <td className="aktionen">
                  {!props.nurLesen &&
                    (rueck === s.id ? (
                      <>
                        <button
                          className="primaer"
                          onClick={async () => {
                            if (await befehl('stand.laden', { id: s.id })) setRueck(null);
                          }}
                        >
                          Wirklich zurückspringen
                        </button>
                        <button onClick={() => setRueck(null)}>Abbrechen</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setRueck(s.id)}
                          title="Alle Pläne auf diesen Stand zurücksetzen"
                        >
                          Zurückspringen …
                        </button>
                        <button onClick={() => setUmbenennen({ id: s.id, name: s.name })}>
                          Umbenennen
                        </button>
                        <button onClick={() => void befehl('stand.loeschen', { id: s.id })}>
                          Löschen
                        </button>
                      </>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {anzahlSicherungen > 0 && (
        <label className="feld haken">
          <input
            type="checkbox"
            checked={zeigeSicherungen}
            onChange={(e) => setZeigeSicherungen(e.target.checked)}
          />
          automatische Sicherungen anzeigen ({anzahlSicherungen})
        </label>
      )}
    </Dialog>
  );
}
