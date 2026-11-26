import type { BautaktApi } from '@bautakt/kern/vertrag';
import { Dialog } from '@bautakt/ui';
import { useState } from 'react';
import type { PlanDaten } from '../gemeinsam/typen.js';
import { filterAktiv, OHNE_FILTER, type ListenFilter } from './listen.js';

export type Darstellung = 'balkenplan' | 'netzplan' | 'terminliste' | 'meilensteinplan';

const TITEL: Record<Darstellung, string> = {
  balkenplan: 'Balkenplan',
  netzplan: 'Netzplan',
  terminliste: 'Terminliste',
  meilensteinplan: 'Meilensteinplan',
};

const ERSTELLER = 'bautakt.ersteller';

/** Export als PDF (A3 quer) oder PNG mit Plankopf, Legende und Risiko-Hinweisen (E-11, E-21, E-50). */
export function ExportDialog(props: {
  api: BautaktApi;
  daten: PlanDaten;
  projektname: string;
  zugeklappt: string[];
  /** Filter der Terminliste (E-47); wird beim Export der Terminliste übernommen. */
  listeFilter?: ListenFilter;
  darstellung: Darstellung;
  onSchliessen: () => void;
}) {
  const [f, setF] = useState({
    darstellung: props.darstellung,
    format: 'pdf' as 'pdf' | 'png',
    aufloesung: 2,
    ersteller: localStorage.getItem(ERSTELLER) ?? '',
    gliederungUebernehmen: true,
    filterUebernehmen: true,
  });
  const listeFilter = props.listeFilter ?? OHNE_FILTER;
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);

  const exportieren = async () => {
    try {
      localStorage.setItem(ERSTELLER, f.ersteller);
    } catch {
      // ohne Speicher geht der Export trotzdem
    }
    setLaeuft(true);
    setMeldung(null);
    const titel = TITEL[f.darstellung];
    const a = await props.api.export.starten({
      format: f.format,
      ansicht: `termine.${f.darstellung}`,
      aufloesung: f.aufloesung,
      dateiname: `${props.projektname} – ${props.daten.plan.name} – ${titel}`,
      parameter: {
        planId: props.daten.plan.id,
        ersteller: f.ersteller.trim(),
        zugeklappt: f.gliederungUebernehmen ? props.zugeklappt : [],
        sollStandId: props.daten.vergleich?.standId ?? null,
        filter: f.filterUebernehmen ? listeFilter : OHNE_FILTER,
      },
    });
    setLaeuft(false);
    if (!a.ok) setMeldung({ text: a.fehler, fehler: true });
    else if (a.wert) setMeldung({ text: `Gespeichert: ${a.wert}`, fehler: false });
  };

  return (
    <Dialog
      titel="Exportieren"
      onSchliessen={props.onSchliessen}
      breite={560}
      fuss={
        <>
          {meldung && <span className={meldung.fehler ? 'fehler' : 'positiv'}>{meldung.text}</span>}
          <button onClick={props.onSchliessen}>Schließen</button>
          <button className="primaer" disabled={laeuft} onClick={() => void exportieren()}>
            {laeuft ? 'Exportiere …' : 'Exportieren …'}
          </button>
        </>
      }
    >
      <div className="formular">
        <label className="feld">
          <span className="feld-label">Darstellung</span>
          <select
            value={f.darstellung}
            onChange={(e) => setF({ ...f, darstellung: e.target.value as typeof f.darstellung })}
          >
            <option value="balkenplan">Balkenplan (für die Bauherrschaft)</option>
            <option value="netzplan">Netzplan (DIN 69900)</option>
            <option value="terminliste">Terminliste</option>
            <option value="meilensteinplan">Meilensteinplan</option>
          </select>
        </label>
        <label className="feld">
          <span className="feld-label">Format</span>
          <select
            value={f.format}
            onChange={(e) => setF({ ...f, format: e.target.value as 'pdf' | 'png' })}
          >
            <option value="pdf">PDF, A3 quer (mehrseitig)</option>
            <option value="png">PNG-Bild</option>
          </select>
        </label>
        {f.format === 'png' && (
          <label className="feld">
            <span className="feld-label">Auflösung</span>
            <select
              value={f.aufloesung}
              onChange={(e) => setF({ ...f, aufloesung: Number(e.target.value) })}
            >
              <option value={1}>normal (96 dpi)</option>
              <option value={2}>hoch (192 dpi)</option>
              <option value={3}>sehr hoch (288 dpi)</option>
            </select>
          </label>
        )}
        <label className="feld">
          <span className="feld-label">Ersteller (im Plankopf)</span>
          <input
            value={f.ersteller}
            placeholder="Name, Rolle"
            onChange={(e) => setF({ ...f, ersteller: e.target.value })}
          />
        </label>
        {f.darstellung === 'terminliste' &&
          (filterAktiv(listeFilter) || listeFilter.gruppieren) && (
            <label className="feld haken breit">
              <input
                type="checkbox"
                checked={f.filterUebernehmen}
                onChange={(e) => setF({ ...f, filterUebernehmen: e.target.checked })}
              />
              Filter und Gruppierung wie angezeigt übernehmen
            </label>
          )}
        {(f.darstellung === 'balkenplan' || f.darstellung === 'terminliste') && (
          <label className="feld haken breit">
            <input
              type="checkbox"
              checked={f.gliederungUebernehmen}
              onChange={(e) => setF({ ...f, gliederungUebernehmen: e.target.checked })}
            />
            Gliederung wie angezeigt (zugeklappte Sammelvorgänge bleiben zu – Rahmenterminplan)
          </label>
        )}
      </div>
    </Dialog>
  );
}
