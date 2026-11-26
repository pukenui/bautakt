import type { Antwort, MenueAktion, Meldungen, ProjektStatus } from '@bautakt/kern/vertrag';
import { BegriffErklaerung, Glossar, LeereAnsicht, Markdown, zeitAnzeigen } from '@bautakt/ui';
import hilfeAllgemein from '../../../../../hilfe/allgemein.md?raw';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RENDERER_PLUGINS } from './plugins';
import { TOUR, TOUR_MERKER, Tour } from './Tour';

const api = window.bautakt;
const ansichten = RENDERER_PLUGINS.flatMap((p) => p.ansichten);
/** Ansichten auf globale Daten (Bibliothek, E-23): auch ohne Projekt erreichbar. */
const globaleAnsichten = RENDERER_PLUGINS.flatMap((p) => p.globaleAnsichten ?? []);

type Hinweis = Meldungen['hinweis'] & { nr: number };

/** Ist das Ziel ein Eingabefeld? Dann gehören Strg+Z/Strg+Y dem Feld selbst. */
function inEingabe(ziel: EventTarget | null): boolean {
  const el = ziel as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function App() {
  const [status, setStatus] = useState<ProjektStatus | null>(null);
  const [datenstand, setDatenstand] = useState(0);
  const [globalstand, setGlobalstand] = useState(0);
  const [aktiveAnsicht, setAktiveAnsicht] = useState(ansichten[0]?.id ?? '');
  const [hinweis, setHinweis] = useState<Hinweis | null>(null);
  const [hilfeOffen, setHilfeOffen] = useState(false);
  const [hilfeTeil, setHilfeTeil] = useState<'ansicht' | 'glossar'>('ansicht');
  // Erststart-Tour (E-84): einmal automatisch, danach über die Hilfe
  const [tourOffen, setTourOffen] = useState(() => !localStorage.getItem(TOUR_MERKER));
  const tourEnde = useCallback(() => {
    localStorage.setItem(TOUR_MERKER, '1');
    setTourOffen(false);
  }, []);

  const zeigen = useCallback((h: Meldungen['hinweis']) => setHinweis({ ...h, nr: Date.now() }), []);

  const ergebnis = useCallback(
    <T,>(a: Antwort<T>) => {
      if (!a.ok) zeigen({ text: a.fehler, art: 'fehler' });
    },
    [zeigen],
  );

  const ausfuehren = useCallback(
    async (aktion: MenueAktion) => {
      switch (aktion) {
        case 'neu':
          return ergebnis(await api.projekt.neu());
        case 'oeffnen':
          return ergebnis(await api.projekt.oeffnen());
        case 'speichern':
          return ergebnis(await api.projekt.speichern());
        case 'speichernUnter':
          return ergebnis(await api.projekt.speichernUnter());
        case 'jsonExportieren': {
          const a = await api.projekt.jsonExportieren();
          ergebnis(a);
          if (a.ok && a.wert) zeigen({ text: `Exportiert: ${a.wert}`, art: 'info' });
          return;
        }
        case 'schliessen':
          return ergebnis(await api.projekt.schliessen());
        case 'rueckgaengig':
          return ergebnis(await api.befehl.rueckgaengig());
        case 'wiederholen':
          return ergebnis(await api.befehl.wiederholen());
        case 'hilfe':
          return setHilfeOffen((o) => !o);
      }
    },
    [ergebnis, zeigen],
  );

  useEffect(() => {
    void api.projekt.status().then(setStatus);
    const abos = [
      api.on('status', setStatus),
      api.on('datenGeaendert', () => setDatenstand((n) => n + 1)),
      // Projektansichten zeigen z. B. „neuere Bibliotheksversion“ → ebenfalls neu laden
      api.on('globalGeaendert', () => {
        setGlobalstand((n) => n + 1);
        setDatenstand((n) => n + 1);
      }),
      api.on('hinweis', zeigen),
      api.on('menue', (a) => void ausfuehren(a)),
    ];
    return () => abos.forEach((ab) => ab());
  }, [ausfuehren, zeigen]);

  // Tastenkürzel (im Menü angezeigt, aber hier behandelt)
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        return void ausfuehren('hilfe');
      }
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const zuordnung: Record<string, MenueAktion> = e.shiftKey
        ? { s: 'speichernUnter', z: 'wiederholen' }
        : { n: 'neu', o: 'oeffnen', s: 'speichern', z: 'rueckgaengig', y: 'wiederholen' };
      const aktion = zuordnung[k];
      if (!aktion) return;
      if ((aktion === 'rueckgaengig' || aktion === 'wiederholen') && inEingabe(e.target)) return;
      e.preventDefault();
      void ausfuehren(aktion);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [ausfuehren]);

  // Hinweise nach einigen Sekunden ausblenden (Fehler bleiben, bis man sie schließt)
  useEffect(() => {
    if (!hinweis || hinweis.art === 'fehler') return;
    const t = setTimeout(() => setHinweis(null), 4000);
    return () => clearTimeout(t);
  }, [hinweis]);

  const ansicht = useMemo(() => ansichten.find((a) => a.id === aktiveAnsicht), [aktiveAnsicht]);
  const globaleAnsicht = useMemo(
    () => globaleAnsichten.find((a) => a.id === aktiveAnsicht),
    [aktiveAnsicht],
  );
  const reiter = (id: string, titel: string) => (
    <button
      key={id}
      role="tab"
      aria-selected={id === aktiveAnsicht}
      className={id === aktiveAnsicht ? 'aktiv' : ''}
      onClick={() => setAktiveAnsicht(id)}
    >
      {titel}
    </button>
  );

  return (
    <div className="shell">
      <header className="kopf">
        <strong className="marke">Bautakt</strong>
        {status && (
          <span className="projektname" title={status.pfad}>
            {status.projektname}
          </span>
        )}
        <nav className="reiter" role="tablist">
          {status
            ? ansichten.map((a) => reiter(a.id, a.titel))
            : reiter(ansichten[0]?.id ?? '', 'Start')}
          {globaleAnsichten.length > 0 && <span className="reiter-trenner" aria-hidden="true" />}
          {globaleAnsichten.map((a) => reiter(a.id, a.titel))}
        </nav>
        {!status && (
          <div className="kopf-aktionen">
            <button data-tour="hilfe" onClick={() => void ausfuehren('hilfe')} title="Hilfe (F1)">
              ? Hilfe
            </button>
          </div>
        )}
        {status && (
          <>
            <div className="kopf-aktionen">
              <button
                data-tour="rueckgaengig"
                disabled={!status.undo.rueckgaengig || status.schreibgeschuetzt}
                title={
                  status.undo.rueckgaengig
                    ? `Rückgängig: ${status.undo.rueckgaengig} (Strg+Z)`
                    : 'Nichts rückgängig zu machen'
                }
                onClick={() => void ausfuehren('rueckgaengig')}
              >
                ↶ Rückgängig
              </button>
              <button
                disabled={!status.undo.wiederholen || status.schreibgeschuetzt}
                title={
                  status.undo.wiederholen
                    ? `Wiederholen: ${status.undo.wiederholen} (Strg+Y)`
                    : 'Nichts zu wiederholen'
                }
                onClick={() => void ausfuehren('wiederholen')}
              >
                ↷ Wiederholen
              </button>
              <button data-tour="hilfe" onClick={() => void ausfuehren('hilfe')} title="Hilfe (F1)">
                ? Hilfe
              </button>
            </div>
          </>
        )}
      </header>

      {status?.schreibgeschuetzt && (
        <div className="banner warnung" role="status">
          Schreibgeschützt: Die Datei ist bereits geöffnet ({status.gesperrtVon ?? 'unbekannt'}).
          Änderungen sind nicht möglich.
        </div>
      )}

      <div className="inhalt">
        <main className="hauptbereich">
          {globaleAnsicht ? (
            <globaleAnsicht.komponente api={api} datenstand={globalstand} />
          ) : !status ? (
            <LeereAnsicht titel="Kein Projekt geöffnet">
              <p>Legen Sie ein neues Projekt an oder öffnen Sie eine vorhandene .bautakt-Datei.</p>
              <div className="knoepfe">
                <button data-tour="neu" className="primaer" onClick={() => void ausfuehren('neu')}>
                  Neues Projekt … (Strg+N)
                </button>
                <button onClick={() => void ausfuehren('oeffnen')}>
                  Projekt öffnen … (Strg+O)
                </button>
              </div>
            </LeereAnsicht>
          ) : ansicht ? (
            <ansicht.komponente api={api} status={status} datenstand={datenstand} />
          ) : null}
        </main>
        {hilfeOffen && (
          <aside className="hilfe" aria-label="Hilfe">
            <button
              className="schliessen"
              onClick={() => setHilfeOffen(false)}
              aria-label="Hilfe schließen"
            >
              ×
            </button>
            <div className="hilfe-reiter" role="tablist" aria-label="Hilfe">
              <button
                role="tab"
                aria-selected={hilfeTeil === 'ansicht'}
                className={hilfeTeil === 'ansicht' ? 'aktiv' : ''}
                onClick={() => setHilfeTeil('ansicht')}
              >
                Hilfe
              </button>
              <button
                role="tab"
                aria-selected={hilfeTeil === 'glossar'}
                className={hilfeTeil === 'glossar' ? 'aktiv' : ''}
                onClick={() => setHilfeTeil('glossar')}
              >
                Glossar
              </button>
            </div>
            {hilfeTeil === 'glossar' ? (
              <Glossar />
            ) : (
              <>
                {globaleAnsicht ? (
                  <Markdown text={globaleAnsicht.hilfe} />
                ) : status && ansicht ? (
                  <Markdown text={ansicht.hilfe} />
                ) : (
                  <p>
                    Legen Sie ein neues Projekt an (Strg+N) oder öffnen Sie eine .bautakt-Datei
                    (Strg+O).
                  </p>
                )}
                <hr />
                <Markdown text={hilfeAllgemein} />
                <p>
                  <button onClick={() => setTourOffen(true)}>Tour starten</button>
                </p>
              </>
            )}
            <p className="leise">Bautakt {__APP_VERSION__}</p>
          </aside>
        )}
      </div>

      <footer className="fuss">
        {status ? (
          <span>
            {status.pfad} · zuletzt geändert {zeitAnzeigen(status.geaendert)}
          </span>
        ) : (
          <span>Bereit</span>
        )}
        {hinweis && (
          <span className={`hinweis ${hinweis.art}`} role="status">
            {hinweis.text}
            {hinweis.art === 'fehler' && (
              <button
                className="schliessen"
                onClick={() => setHinweis(null)}
                aria-label="Hinweis schließen"
              >
                ×
              </button>
            )}
          </span>
        )}
      </footer>
      <BegriffErklaerung />
      {tourOffen && <Tour schritte={TOUR} onEnde={tourEnde} />}
    </div>
  );
}
