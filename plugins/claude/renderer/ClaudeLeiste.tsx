import type { BautaktApi } from '@bautakt/kern/vertrag';
import { Markdown, type AnsichtProps } from '@bautakt/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClaudeStatus, Eintrag, Verlauf, Vorschlag } from '../gemeinsam/typen.js';

async function frage<T>(api: BautaktApi, name: string, argumente?: unknown): Promise<T> {
  const a = await api.abfrage<T>('claude', name, argumente);
  if (!a.ok) throw new Error(a.fehler);
  return a.wert;
}

/** Seitenleiste „Claude“ (E-97–E-100). */
export function ClaudeLeiste(props: AnsichtProps & { onSchliessen: () => void }) {
  const { api } = props;
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [verlauf, setVerlauf] = useState<Verlauf>({ eintraege: [], laeuft: false });
  const [fehler, setFehler] = useState<string | null>(null);
  const [einstellungen, setEinstellungen] = useState(false);

  const laden = useCallback(
    () =>
      Promise.all([frage<ClaudeStatus>(api, 'status'), frage<Verlauf>(api, 'verlauf')]).then(
        ([s, v]) => {
          setStatus(s);
          setVerlauf(v);
        },
        (e: Error) => setFehler(e.message),
      ),
    [api],
  );

  useEffect(() => {
    let aktiv = true;
    Promise.all([frage<ClaudeStatus>(api, 'status'), frage<Verlauf>(api, 'verlauf')]).then(
      ([s, v]) => {
        if (!aktiv) return;
        setStatus(s);
        setVerlauf(v);
      },
      (e: Error) => aktiv && setFehler(e.message),
    );
    return () => {
      aktiv = false;
    };
  }, [api, props.datenstand]);

  // Während Claude arbeitet, den Verlauf nachladen
  useEffect(() => {
    if (!verlauf.laeuft) return;
    const t = setInterval(() => void laden(), 600);
    return () => clearInterval(t);
  }, [verlauf.laeuft, laden]);

  const aktion = async (name: string, argumente?: unknown) => {
    setFehler(null);
    try {
      await frage(api, name, argumente);
    } catch (e) {
      setFehler((e as Error).message);
    }
    await laden();
  };

  return (
    <div className="cl-leiste">
      <header className="cl-kopf">
        <strong>✦ Claude</strong>
        <span className="leise">
          {status?.simuliert ? 'Simulation' : (status?.modell ?? '')}
          {status?.kosten ? ` · ${status.kosten}` : ''}
        </span>
        <span className="cl-luecke" />
        {status?.schluessel && (
          <button title="Einstellungen" onClick={() => setEinstellungen((x) => !x)}>
            ⚙
          </button>
        )}
        <button className="schliessen" aria-label="Claude schließen" onClick={props.onSchliessen}>
          ×
        </button>
      </header>
      {fehler && (
        <div className="cl-fehler" role="alert">
          {fehler}
        </div>
      )}
      {!status ? (
        <p className="leise cl-rand">Lädt …</p>
      ) : !status.schluessel ? (
        <SchluesselEingabe
          status={status}
          onSpeichern={(s) => void aktion('schluesselSetzen', { schluessel: s })}
        />
      ) : einstellungen ? (
        <Einstellungen
          status={status}
          onAktion={async (name, arg) => {
            await aktion(name, arg);
            setEinstellungen(false);
          }}
        />
      ) : !status.zustimmung ? (
        <Zustimmung onJa={() => void aktion('zustimmung', { ja: true })} />
      ) : (
        <Gespraech
          api={api}
          verlauf={verlauf}
          nurLesen={props.status.schreibgeschuetzt}
          onSenden={(text) => aktion('senden', { text })}
          onAktion={aktion}
          onFehler={setFehler}
        />
      )}
    </div>
  );
}

function SchluesselEingabe(props: { status: ClaudeStatus; onSpeichern: (s: string) => void }) {
  const [s, setS] = useState('');
  return (
    <div className="cl-rand">
      <h3>Claude einrichten</h3>
      <p>
        Für den Assistenten brauchen Sie einen eigenen API-Schlüssel von Anthropic (Konsole unter
        platform.claude.com → API Keys). Er wird mit dem Schutz von Windows verschlüsselt im
        App-Datenordner gespeichert – nie in der Projektdatei.
      </p>
      {!props.status.verschluesselung ? (
        <p className="tp-warnung">
          Die Verschlüsselung von Windows ist nicht verfügbar; ohne sie speichert Bautakt keinen
          Schlüssel.
        </p>
      ) : (
        <form
          className="cl-schluessel"
          onSubmit={(e) => {
            e.preventDefault();
            if (s.trim()) props.onSpeichern(s.trim());
          }}
        >
          <input
            type="password"
            aria-label="API-Schlüssel"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={s}
            onChange={(e) => setS(e.target.value)}
          />
          <button className="primaer" type="submit" disabled={!s.trim()}>
            Speichern
          </button>
        </form>
      )}
      <p className="leise">
        Kosten entstehen bei Anthropic je nach Nutzung (Tokens und Sitzungslaufzeit, Claude Managed
        Agents).
      </p>
    </div>
  );
}

function Zustimmung(props: { onJa: () => void }) {
  return (
    <div className="cl-rand">
      <h3>Projektdaten an Anthropic übertragen?</h3>
      <p>
        Wenn Sie Claude Fragen stellen, liest der Assistent Daten dieses Projekts (Terminpläne,
        Kosten, Modelldaten) und überträgt sie an Anthropic. Der Gesprächsverlauf liegt bei
        Anthropic, bis Sie ihn löschen. Ändern kann Claude nichts selbst – Änderungen schlägt es
        vor, Sie führen sie aus oder verwerfen sie.
      </p>
      <p className="leise">
        Die Zustimmung gilt nur für dieses Projekt und ist jederzeit widerrufbar.
      </p>
      <button className="primaer" onClick={props.onJa}>
        Zustimmen und fortfahren
      </button>
    </div>
  );
}

function Einstellungen(props: {
  status: ClaudeStatus;
  onAktion: (name: string, argumente?: unknown) => Promise<void>;
}) {
  return (
    <div className="cl-rand cl-einstellungen">
      <h3>Einstellungen</h3>
      <button onClick={() => void props.onAktion('neuesGespraech')} disabled={props.status.laeuft}>
        Neues Gespräch beginnen
      </button>
      <button onClick={() => void props.onAktion('verlaufLoeschen')} disabled={props.status.laeuft}>
        Verlauf bei Anthropic löschen
      </button>
      {props.status.zustimmung && (
        <button onClick={() => void props.onAktion('zustimmung', { ja: false })}>
          Zustimmung für dieses Projekt widerrufen
        </button>
      )}
      <button onClick={() => void props.onAktion('schluesselEntfernen')}>
        API-Schlüssel entfernen
      </button>
    </div>
  );
}

function Gespraech(props: {
  api: BautaktApi;
  verlauf: Verlauf;
  nurLesen: boolean;
  onSenden: (text: string) => Promise<void>;
  onAktion: (name: string, argumente?: unknown) => Promise<void>;
  onFehler: (f: string | null) => void;
}) {
  const [text, setText] = useState('');
  const unten = useRef<HTMLDivElement>(null);
  const anzahl = props.verlauf.eintraege.length;
  useEffect(() => {
    unten.current?.scrollIntoView({ block: 'end' });
  }, [anzahl, props.verlauf.laeuft]);

  const senden = async () => {
    const t = text.trim();
    if (!t || props.verlauf.laeuft) return;
    setText('');
    await props.onSenden(t);
  };

  // Vorschlag ausführen (E-97): als normaler Befehl mit Grund im Änderungsprotokoll
  const ausfuehren = async (v: Vorschlag) => {
    props.onFehler(null);
    const a = await props.api.befehl.ausfuehren(
      v.plugin,
      v.befehl,
      v.daten,
      'Vorschlag von Claude',
    );
    if (!a.ok) {
      props.onFehler(a.fehler);
      await props.onAktion('vorschlagErledigt', {
        nr: v.nr,
        zustand: 'verworfen',
        fehler: a.fehler,
      });
      return;
    }
    await props.onAktion('vorschlagErledigt', { nr: v.nr, zustand: 'ausgefuehrt' });
  };

  return (
    <>
      <div className="cl-verlauf" aria-live="polite">
        {anzahl === 0 && (
          <div className="leise cl-rand">
            <p>Fragen Sie zum geöffneten Projekt, zum Beispiel:</p>
            <ul>
              <li>Welche Vorgänge liegen auf dem kritischen Weg?</li>
              <li>Warum wird das Soll-Ende überschritten?</li>
              <li>Welche Kostengruppen haben noch keinen Kennwert?</li>
              <li>Wie groß sind die Wandflächen im Modell je Kostengruppe?</li>
            </ul>
          </div>
        )}
        {props.verlauf.eintraege.map((e) => (
          <EintragAnzeige
            key={e.nr}
            e={e}
            nurLesen={props.nurLesen}
            onAusfuehren={(v) => void ausfuehren(v)}
            onVerwerfen={(v) =>
              void props.onAktion('vorschlagErledigt', { nr: v.nr, zustand: 'verworfen' })
            }
          />
        ))}
        {props.verlauf.laeuft && <div className="leise cl-arbeitet">Claude arbeitet …</div>}
        <div ref={unten} />
      </div>
      <div className="cl-eingabe">
        <textarea
          aria-label="Nachricht an Claude"
          placeholder="Frage oder Auftrag … (Enter sendet, Umschalt+Enter neue Zeile)"
          value={text}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void senden();
            }
          }}
        />
        <div className="cl-knoepfe">
          {props.verlauf.laeuft ? (
            <button onClick={() => void props.onAktion('abbrechen')}>Abbrechen</button>
          ) : (
            <button className="primaer" disabled={!text.trim()} onClick={() => void senden()}>
              Senden
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function EintragAnzeige(props: {
  e: Eintrag;
  nurLesen: boolean;
  onAusfuehren: (v: Vorschlag) => void;
  onVerwerfen: (v: Vorschlag) => void;
}) {
  const { e } = props;
  if (e.art === 'nutzer') return <div className="cl-nutzer">{e.text}</div>;
  if (e.art === 'claude')
    return (
      <div className="cl-claude">
        <Markdown text={e.text} />
      </div>
    );
  if (e.art === 'werkzeug') return <div className="cl-werkzeug">↳ Claude {e.text}</div>;
  if (e.art === 'fehler') return <div className="cl-fehler">{e.text}</div>;
  if (e.art === 'hinweis') return <div className="leise cl-werkzeug">{e.text}</div>;
  const v = e.vorschlag;
  if (!v) return null;
  return (
    <div className={`cl-vorschlag ${v.zustand}`}>
      <div className="cl-vorschlag-kopf">
        <strong>
          Vorschlag {v.nr}: {v.titel}
        </strong>
        {v.kiEntwurf.length > 0 && <span className="cl-ki">KI-Entwurf</span>}
      </div>
      <p>{v.beschreibung}</p>
      <details>
        <summary>
          Daten ({v.plugin}: {v.befehl})
        </summary>
        <pre>{JSON.stringify(v.daten, null, 2)}</pre>
      </details>
      {v.zustand === 'offen' ? (
        <div className="cl-knoepfe">
          <button onClick={() => props.onVerwerfen(v)}>Verwerfen</button>
          <button
            className="primaer"
            disabled={props.nurLesen}
            onClick={() => props.onAusfuehren(v)}
          >
            Ausführen
          </button>
        </div>
      ) : (
        <div className="leise">
          {v.zustand === 'ausgefuehrt' ? '✓ ausgeführt (Rückgängig mit Strg+Z)' : 'verworfen'}
        </div>
      )}
    </div>
  );
}
