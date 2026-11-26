import type { BautaktApi } from '@bautakt/kern/vertrag';
import { Dialog } from '@bautakt/ui';
import { useState } from 'react';
import { bezugLaden } from './SollIstTeil.js';

const ERSTELLER = 'bautakt.ersteller';

/** Export der Kostentabelle bzw. des Soll-Ist als PDF (A3 quer) oder PNG (E-59, E-63). */
export function ExportDialog(props: {
  api: BautaktApi;
  projektname: string;
  darstellung?: 'kostentabelle' | 'sollist';
  onSchliessen: () => void;
}) {
  const [f, setF] = useState({
    darstellung: props.darstellung ?? ('kostentabelle' as 'kostentabelle' | 'sollist'),
    format: 'pdf' as 'pdf' | 'png' | 'xlsx',
    aufloesung: 2,
    ersteller: localStorage.getItem(ERSTELLER) ?? '',
    ebene: 3,
  });
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
    const a = await props.api.export.starten({
      format: f.format,
      // Excel: eine Arbeitsmappe mit allen Blättern (E-64)
      ansicht: f.format === 'xlsx' ? 'kosten.excel' : `kosten.${f.darstellung}`,
      aufloesung: f.aufloesung,
      dateiname: `${props.projektname} – ${f.format === 'xlsx' ? 'Kosten' : f.darstellung === 'sollist' ? 'Kosten Soll-Ist' : 'Kostenplanung'}`,
      parameter: {
        ersteller: f.ersteller.trim(),
        ebene: f.ebene,
        bezug: bezugLaden(),
        projektname: props.projektname,
      },
    });
    setLaeuft(false);
    if (!a.ok) setMeldung({ text: a.fehler, fehler: true });
    else if (a.wert) setMeldung({ text: `Gespeichert: ${a.wert}`, fehler: false });
  };

  return (
    <Dialog
      titel="Kosten exportieren"
      onSchliessen={props.onSchliessen}
      breite={540}
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
            disabled={f.format === 'xlsx'}
            onChange={(e) =>
              setF({ ...f, darstellung: e.target.value as 'kostentabelle' | 'sollist' })
            }
          >
            <option value="kostentabelle">Kostentabelle (Planung)</option>
            <option value="sollist">Soll-Ist (Stufen, Prognose, Abweichung)</option>
          </select>
        </label>
        <label className="feld">
          <span className="feld-label">Format</span>
          <select
            value={f.format}
            onChange={(e) => setF({ ...f, format: e.target.value as 'pdf' | 'png' | 'xlsx' })}
          >
            <option value="pdf">PDF, A3 quer (mehrseitig)</option>
            <option value="png">PNG-Bild</option>
            <option value="xlsx">Excel-Arbeitsmappe (.xlsx)</option>
          </select>
        </label>
        {f.format === 'xlsx' && (
          <p className="dialog-erklaerung breit">
            Eine Arbeitsmappe mit den Blättern Kostentabelle, Flächen DIN 277, Soll-Ist, Aufträge
            und Rechnungen; Beträge mit Formeln (nachrechenbar).
          </p>
        )}
        <label className="feld">
          <span className="feld-label">Gliederung bis</span>
          <select
            value={f.ebene}
            disabled={f.format === 'xlsx'}
            onChange={(e) => setF({ ...f, ebene: Number(e.target.value) })}
          >
            <option value={1}>1. Ebene</option>
            <option value={2}>2. Ebene</option>
            <option value={3}>3. Ebene</option>
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
          <span className="feld-label">Ersteller (im Kopf)</span>
          <input
            value={f.ersteller}
            placeholder="Name, Rolle"
            onChange={(e) => setF({ ...f, ersteller: e.target.value })}
          />
        </label>
      </div>
    </Dialog>
  );
}
