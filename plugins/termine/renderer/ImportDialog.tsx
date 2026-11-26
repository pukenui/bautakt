import type { BautaktApi } from '@bautakt/kern/vertrag';
import { Dialog } from '@bautakt/ui';
import { useState } from 'react';
import type { PlanDaten } from '../gemeinsam/typen.js';
import { setzen } from './zustand.js';

/** MS-Project-XML importieren (E-79, E-81): neuer Plan oder gewählten Plan ersetzen. */
export function ImportDialog(props: {
  api: BautaktApi;
  daten: PlanDaten;
  onSchliessen: () => void;
}) {
  const [ziel, setZiel] = useState<'neu' | 'ersetzen'>('neu');
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<{ datei: string; bericht: string[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  // erst beim Schließen auf den neuen Plan wechseln, sonst lädt die Ansicht neu und der Bericht geht verloren
  const [neuerPlan, setNeuerPlan] = useState<string | null>(null);
  const schliessen = () => {
    if (neuerPlan) setzen({ planId: neuerPlan, auswahl: null });
    props.onSchliessen();
  };

  const importieren = async () => {
    setLaeuft(true);
    setFehler(null);
    const a = await props.api.import.starten({
      plugin: 'termine',
      format: 'msproject',
      parameter: { ziel, planId: props.daten.plan.id },
    });
    setLaeuft(false);
    if (!a.ok) return setFehler(a.fehler);
    if (!a.wert) return; // abgebrochen
    setErgebnis({ datei: a.wert.datei, bericht: a.wert.bericht });
    setNeuerPlan(a.wert.eingefuegt.find((e) => e.tabelle === 't_plan')?.id ?? null);
  };

  return (
    <Dialog
      titel="MS Project importieren"
      onSchliessen={schliessen}
      breite={620}
      fuss={
        <>
          {fehler && <span className="fehler">{fehler}</span>}
          <button onClick={schliessen}>{ergebnis ? 'Schließen' : 'Abbrechen'}</button>
          {!ergebnis && (
            <button className="primaer" disabled={laeuft} onClick={() => void importieren()}>
              {laeuft ? 'Importiere …' : 'Datei wählen und importieren …'}
            </button>
          )}
        </>
      }
    >
      {ergebnis ? (
        <>
          <p className="positiv">Importiert: {ergebnis.datei}</p>
          {ergebnis.bericht.length ? (
            <>
              <h4>Bericht</h4>
              <ul className="import-bericht">
                {ergebnis.bericht.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Alles wurde ohne Rundung oder Auslassung übernommen.</p>
          )}
          <p className="leise">Rückgängig nimmt den ganzen Import zurück.</p>
        </>
      ) : (
        <>
          <div className="feld breit radio" role="radiogroup" aria-label="Ziel des Imports">
            <label className="inline">
              <input type="radio" checked={ziel === 'neu'} onChange={() => setZiel('neu')} />
              als neuer Plan
            </label>
            <label className="inline">
              <input
                type="radio"
                checked={ziel === 'ersetzen'}
                onChange={() => setZiel('ersetzen')}
              />
              Plan „{props.daten.plan.name}“ ersetzen (Vorgänge, Beziehungen, Kalender, Ist)
            </label>
          </div>
          <p className="dialog-erklaerung">
            Gelesen wird MS-Project-XML (MSPDI, in MS Project „Speichern unter → XML“). Dauern und
            Abstände werden auf ganze Tage gerundet; Ressourcen, nicht abbildbare Einschränkungen,
            Beziehungen an Sammelvorgängen und Basispläne entfallen – danach erscheint ein Bericht.
          </p>
        </>
      )}
    </Dialog>
  );
}
