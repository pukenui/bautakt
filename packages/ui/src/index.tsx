import type { BautaktApi, ProjektStatus } from '@bautakt/kern/vertrag';
import type { ComponentType, ReactNode } from 'react';

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

/** Renderer-Teil eines Plugins (Architektur 3.5, „RendererModul“). */
export interface RendererPlugin {
  id: string; // muss zur ID des Main-Teils passen
  ansichten: Ansicht[];
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
