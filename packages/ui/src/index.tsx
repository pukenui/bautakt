import type { BautaktApi, ProjektStatus } from '@bautakt/kern/vertrag';
import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';

/** Modaler Dialog (Esc oder × schließt). Fokus springt beim Öffnen in den Dialog. */
export function Dialog(props: {
  titel: string;
  onSchliessen: () => void;
  children: ReactNode;
  fuss?: ReactNode;
  breite?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { onSchliessen } = props;
  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>('input, select, textarea, button:not(.schliessen)')?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onSchliessen();
      }
    };
    window.addEventListener('keydown', taste, true);
    return () => window.removeEventListener('keydown', taste, true);
  }, [onSchliessen]);
  return (
    <div
      className="dialog-hintergrund"
      onMouseDown={(e) => e.target === e.currentTarget && onSchliessen()}
    >
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={props.titel}
        style={{ width: props.breite ?? 560 }}
      >
        <header className="dialog-kopf">
          <h2>{props.titel}</h2>
          <button className="schliessen" aria-label="Schließen" onClick={onSchliessen}>
            ×
          </button>
        </header>
        <div className="dialog-inhalt">{props.children}</div>
        {props.fuss && <footer className="dialog-fuss">{props.fuss}</footer>}
      </div>
    </div>
  );
}

/** Ganze Zahl im deutschen Format (Tausenderpunkt). */
export function zahlAnzeigen(n: number): string {
  return n.toLocaleString('de-DE');
}

/** Props, die jede Plugin-Ansicht von der App-Shell erhält. */
export interface AnsichtProps {
  api: BautaktApi;
  status: ProjektStatus;
  /** Zähler, der bei jeder Datenänderung steigt → Ansicht lädt neu. */
  datenstand: number;
}

export interface Ansicht {
  id: string;
  titel: string;
  komponente: ComponentType<AnsichtProps>;
  /** Hilfetext der Ansicht (Markdown), für die Hilfe-Seitenleiste (E-29). */
  hilfe: string;
}

/** Props einer Druckansicht (Export PDF/PNG, Architektur 6). */
export interface DruckProps {
  api: BautaktApi;
  /** Vom Export-Dialog übergebene Einstellungen (z. B. planId, ersteller). */
  parameter: Record<string, unknown>;
  format: 'pdf' | 'png';
  projektname: string;
  /** Aufrufen, sobald alles gezeichnet ist – dann erzeugt der Main-Prozess die Datei. */
  fertig: () => void;
  fehler: (meldung: string) => void;
}

export interface Druckansicht {
  id: string; // z. B. "termine.balkenplan"
  titel: string;
  komponente: ComponentType<DruckProps>;
}

/** Renderer-Teil eines Plugins (Architektur 3.5, „RendererModul“). */
export interface RendererPlugin {
  id: string; // muss zur ID des Main-Teils passen
  ansichten: Ansicht[];
  druckansichten?: Druckansicht[];
}

/** Leere Ansicht: sagt, was als Nächstes zu tun ist (E-29). */
export function LeereAnsicht(props: { titel: string; children?: ReactNode }) {
  return (
    <div className="leer">
      <h2>{props.titel}</h2>
      {props.children}
    </div>
  );
}

const datumFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const zeitFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** UTC-Zeitstempel → lokales Datum TT.MM.JJJJ. */
export function datumAnzeigen(utc: string): string {
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? '' : datumFormat.format(d);
}

/** UTC-Zeitstempel → lokal „TT.MM.JJJJ, hh:mm“. */
export function zeitAnzeigen(utc: string): string {
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? '' : zeitFormat.format(d);
}

export { Markdown, zerlegen } from './markdown';
