import { Begriff, glossarEintrag } from '@bautakt/ui';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { VorgangMitEbene } from '../gemeinsam/typen.js';
import type { ListenEintrag } from './listen.js';

/** Bearbeitung einer Zelle; `speichern` liefert false bei Fehler (Editor bleibt offen). */
export type Bearbeitung =
  | { art: 'text' | 'datum'; speichern: (v: VorgangMitEbene, wert: string) => Promise<boolean> }
  | {
      art: 'auswahl';
      optionen: { wert: string; text: string }[];
      speichern: (v: VorgangMitEbene, wert: string) => Promise<boolean>;
    }
  | { art: 'haken'; speichern: (v: VorgangMitEbene, wert: boolean) => Promise<boolean> };

export interface ListenSpalte {
  key: string;
  titel: string;
  hinweis?: string;
  breite: number;
  rechts?: boolean;
  /** Anzeige; `text` ist zugleich der Startwert beim Bearbeiten. */
  text: (v: VorgangMitEbene) => string;
  anzeige?: (v: VorgangMitEbene) => ReactNode;
  klasse?: (v: VorgangMitEbene) => string;
  bearbeitung?: Bearbeitung;
  darf?: (v: VorgangMitEbene) => boolean;
}

/**
 * Bearbeitbare Liste (Terminliste, Meilensteinplan; E-49): Pfeiltasten wählen die Zelle,
 * Eingabe/F2 oder Lostippen bearbeitet, Esc verwirft, Leertaste schaltet Haken um.
 * Doppelklick auf eine nicht bearbeitbare Zelle öffnet die Eigenschaften.
 */
export function ListenTabelle(props: {
  eintraege: ListenEintrag[];
  spalten: ListenSpalte[];
  nurLesen: boolean;
  auswahl: string | null;
  setAuswahl: (id: string) => void;
  onEigenschaften: (id: string) => void;
  zeilenKlasse?: (v: VorgangMitEbene) => string;
  label: string;
}) {
  const { eintraege, spalten, nurLesen, auswahl } = props;
  const [spalte, setSpalte] = useState(1);
  const [edit, setEdit] = useState<{ id: string; key: string; text: string } | null>(null);
  const wurzel = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const zeilen = eintraege.flatMap((e) => (e.art === 'vorgang' ? [e.v] : []));
  const index = zeilen.findIndex((v) => v.id === auswahl);

  useLayoutEffect(() => {
    editRef.current?.focus();
  }, [edit?.id, edit?.key]);

  useEffect(() => {
    if (!auswahl) return;
    wurzel.current
      ?.querySelector(`[data-id="${CSS.escape(auswahl)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [auswahl]);

  const darf = (v: VorgangMitEbene, s: ListenSpalte | undefined): s is ListenSpalte =>
    !nurLesen && !!s?.bearbeitung && (s.darf?.(v) ?? true);

  const beginnen = (v: VorgangMitEbene, s: ListenSpalte | undefined, text?: string) => {
    if (!darf(v, s) || !s.bearbeitung) return;
    if (s.bearbeitung.art === 'haken') {
      void s.bearbeitung.speichern(v, s.text(v) !== '✓');
      return;
    }
    setEdit({ id: v.id, key: s.key, text: text ?? s.text(v) });
  };

  const fertig = () => {
    setEdit(null);
    wurzel.current?.focus();
  };

  const uebernehmen = async (weiter: 'runter' | 'rechts' | null, wert?: string) => {
    if (!edit) return;
    const v = zeilen.find((x) => x.id === edit.id);
    const s = spalten.find((x) => x.key === edit.key);
    if (!v || !s?.bearbeitung || s.bearbeitung.art === 'haken') return setEdit(null);
    const text = (wert ?? edit.text).trim();
    if (text !== s.text(v).trim() && !(await s.bearbeitung.speichern(v, text))) return;
    fertig();
    if (weiter === 'runter') {
      const n = zeilen[index + 1];
      if (n) props.setAuswahl(n.id);
    } else if (weiter === 'rechts') setSpalte((x) => Math.min(spalten.length - 1, x + 1));
  };

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edit) return;
    const v = zeilen[index];
    const s = spalten[spalte];
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const n =
          zeilen[
            Math.max(0, Math.min(zeilen.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))
          ];
        if (n) props.setAuswahl(n.id);
        return;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        return setSpalte((x) =>
          Math.max(0, Math.min(spalten.length - 1, x + (e.key === 'ArrowRight' ? 1 : -1))),
        );
      case 'Enter':
      case 'F2':
        e.preventDefault();
        if (v && darf(v, s)) beginnen(v, s);
        else if (v) props.onEigenschaften(v.id);
        return;
      case ' ':
        if (v && s?.bearbeitung?.art === 'haken') {
          e.preventDefault();
          beginnen(v, s);
        }
        return;
    }
    if (
      v &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      darf(v, s) &&
      s.bearbeitung?.art === 'text'
    ) {
      e.preventDefault();
      beginnen(v, s, e.key);
    }
  };

  const editor = (s: ListenSpalte, b: Bearbeitung) => {
    if (!edit) return null;
    const tasten = (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void uebernehmen('runter');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        void uebernehmen('rechts');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        fertig();
      }
    };
    if (b.art === 'auswahl')
      return (
        <select
          ref={editRef}
          className="tp-editor"
          aria-label={s.titel}
          value={edit.text}
          onChange={(e) => void uebernehmen(null, e.target.value)}
          onKeyDown={tasten}
          onBlur={() => setEdit(null)}
        >
          {b.optionen.map((o) => (
            <option key={o.wert} value={o.wert}>
              {o.text}
            </option>
          ))}
        </select>
      );
    return (
      <input
        ref={editRef}
        className="tp-editor"
        type={b.art === 'datum' ? 'date' : 'text'}
        aria-label={s.titel}
        value={edit.text}
        onChange={(e) => setEdit({ ...edit, text: e.target.value })}
        onKeyDown={tasten}
        onBlur={() => void uebernehmen(null)}
      />
    );
  };

  const raster = spalten.map((s) => `${s.breite}px`).join(' ');
  const breite = spalten.reduce((x, s) => x + s.breite, 0);

  return (
    <div
      className="tl-tabelle"
      ref={wurzel}
      tabIndex={0}
      onKeyDown={taste}
      role="grid"
      aria-label={props.label}
      aria-rowcount={zeilen.length}
    >
      <div style={{ width: breite }}>
        <div className="tl-kopf" role="row" style={{ gridTemplateColumns: raster }}>
          {spalten.map((s, i) => (
            <div
              key={s.key}
              role="columnheader"
              className={`tp-kopfzelle${s.rechts ? ' rechts' : ''}${i === spalte ? ' aktiv' : ''}`}
              title={glossarEintrag(s.titel) ? undefined : s.hinweis}
            >
              <Begriff k={s.titel} />
            </div>
          ))}
        </div>
        {eintraege.map((e) => {
          if (e.art === 'gruppe')
            return (
              <div key={`g-${e.titel}`} className="tl-gruppe" role="row">
                <span role="gridcell">
                  {e.titel} <span className="leise">({e.anzahl})</span>
                </span>
              </div>
            );
          const v = e.v;
          const gewaehlt = v.id === auswahl;
          return (
            <div
              key={v.id}
              data-id={v.id}
              role="row"
              aria-selected={gewaehlt}
              className={`tl-zeile${gewaehlt ? ' gewaehlt' : ''}${v.typ === 'sammel' ? ' sammel' : ''} ${props.zeilenKlasse?.(v) ?? ''}`}
              style={{ gridTemplateColumns: raster }}
              onMouseDown={() => props.setAuswahl(v.id)}
            >
              {spalten.map((s, j) => {
                const editiert = edit?.id === v.id && edit.key === s.key && s.bearbeitung;
                const haken = s.bearbeitung?.art === 'haken';
                return (
                  <div
                    key={s.key}
                    role="gridcell"
                    className={[
                      'tp-zelle',
                      s.rechts ? 'rechts' : '',
                      gewaehlt && j === spalte ? 'fokus' : '',
                      s.klasse?.(v) ?? '',
                    ].join(' ')}
                    onMouseDown={() => setSpalte(j)}
                    onClick={() => haken && beginnen(v, s)}
                    onDoubleClick={() =>
                      haken ? undefined : darf(v, s) ? beginnen(v, s) : props.onEigenschaften(v.id)
                    }
                  >
                    {editiert && s.bearbeitung ? (
                      editor(s, s.bearbeitung)
                    ) : (
                      <span className="tp-text">{s.anzeige ? s.anzeige(v) : s.text(v)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
