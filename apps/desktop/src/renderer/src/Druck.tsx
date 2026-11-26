import { useCallback, useEffect, useState } from 'react';
import { RENDERER_PLUGINS } from './plugins';

const api = window.bautakt;

interface DruckAuftrag {
  ansicht: string;
  format: 'pdf' | 'png';
  parameter: Record<string, unknown>;
}

/** Liest den Druckauftrag aus dem Adress-Hash (`#druck=…`), sonst null. */
export function druckAuftrag(): DruckAuftrag | null {
  const h = window.location.hash;
  if (!h.startsWith('#druck=')) return null;
  try {
    return JSON.parse(decodeURIComponent(h.slice('#druck='.length))) as DruckAuftrag;
  } catch {
    return null;
  }
}

/**
 * Druckmodus (Export, Architektur 6): rendert nur die Druckansicht eines Plugins. Der
 * Main-Prozess wartet auf `data-druck-fertig` und erzeugt dann PDF bzw. PNG.
 */
export function Druck({ auftrag }: { auftrag: DruckAuftrag }) {
  const [projektname, setProjektname] = useState<string | null>(null);
  const ansicht = RENDERER_PLUGINS.flatMap((p) => p.druckansichten ?? []).find(
    (a) => a.id === auftrag.ansicht,
  );

  const fertig = useCallback(() => {
    document.body.dataset['druckFertig'] = '1';
  }, []);
  const fehler = useCallback((meldung: string) => {
    document.body.dataset['druckFehler'] = meldung;
  }, []);

  useEffect(() => {
    document.body.classList.add('druckmodus');
    void api.projekt.status().then((s) => setProjektname(s?.projektname ?? ''));
  }, []);
  useEffect(() => {
    if (!ansicht) fehler(`Unbekannte Druckansicht „${auftrag.ansicht}“.`);
  }, [ansicht, auftrag.ansicht, fehler]);

  if (!ansicht || projektname === null) return null;
  const K = ansicht.komponente;
  return (
    <K
      api={api}
      parameter={auftrag.parameter}
      format={auftrag.format}
      projektname={projektname}
      fertig={fertig}
      fehler={fehler}
    />
  );
}
