import { zahlAnzeigen } from '@bautakt/ui';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type UIEvent,
} from 'react';
import type { PlanDaten, VorgangMitEbene } from '../gemeinsam/typen.js';
import { datumKurz, vorgaengerText } from './daten.js';
import type { Zustand } from './zustand.js';

export const ZEILE = 28;
export const KOPF = 48;

type Bearbeitbar = 'nr' | 'name' | 'dauer' | 'vorgaenger' | 'quelle' | 'rolle';

interface Spalte {
  key: Bearbeitbar | 'anfang' | 'ende' | 'gp' | 'fp' | 'fertig' | 'abw';
  titel: string;
  hinweis?: string;
  breite: number;
  rechts?: boolean;
  bearbeitbar?: (v: VorgangMitEbene) => boolean;
}

export interface TabelleProps {
  daten: PlanDaten;
  zeilen: VorgangMitEbene[];
  zustand: Zustand;
  nurLesen: boolean;
  auswahl: string | null;
  setAuswahl: (id: string) => void;
  befehl: (name: string, daten: unknown) => Promise<string[] | null>;
  onEigenschaften: (id: string) => void;
  onIst: (id: string) => void;
  onZuklappen: (id: string, zu: boolean) => void;
  onNeu: () => void;
  onLoeschen: () => void;
  onEinruecken: (rein: boolean) => void;
  risikoNr: Map<string, number>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  scrollTop: number;
  hoehe: number;
}

export function Tabelle(p: TabelleProps) {
  const { scrollRef, onScroll } = p;
  const { daten, zeilen, zustand, nurLesen, auswahl } = p;
  const at = zustand.zeitanzeige === 'at';
  const rollen = daten.plan.art === 'rollen';
  const termine = daten.berechnung.ok ? daten.berechnung.termine : {};

  const spalten: Spalte[] = [
    { key: 'nr', titel: 'Nr.', breite: 52, bearbeitbar: () => true },
    { key: 'name', titel: 'Vorgang', breite: 260, bearbeitbar: () => true },
    ...(rollen
      ? [{ key: 'rolle' as const, titel: 'Rolle', breite: 120, bearbeitbar: () => true }]
      : []),
    {
      key: 'dauer',
      titel: 'Dauer',
      hinweis: 'Dauer in Arbeitstagen (AT)',
      breite: 62,
      rechts: true,
      bearbeitbar: (v) => v.typ === 'vorgang',
    },
    {
      key: 'vorgaenger',
      titel: 'Vorgänger',
      hinweis: 'z. B. 1EA+10; 3EA+15; 4EA+30KT – ohne Einheit = AT',
      breite: zustand.vorgaengerForm === 'lang' ? 260 : 130,
      bearbeitbar: (v) => v.typ !== 'sammel',
    },
    {
      key: 'anfang',
      titel: at ? 'FAZ' : 'Anfang',
      hinweis: at ? 'Frühester Anfangszeitpunkt (AT)' : 'Frühester Anfang',
      breite: at ? 56 : 104,
      rechts: at,
    },
    {
      key: 'ende',
      titel: at ? 'FEZ' : 'Ende',
      hinweis: at ? 'Frühester Endzeitpunkt (AT)' : 'Frühestes Ende',
      breite: at ? 56 : 104,
      rechts: at,
    },
    { key: 'gp', titel: 'GP', hinweis: 'Gesamtpuffer (AT)', breite: 48, rechts: true },
    { key: 'fp', titel: 'FP', hinweis: 'Freier Puffer (AT)', breite: 48, rechts: true },
    ...(daten.plan.stichtag
      ? [
          {
            key: 'fertig' as const,
            titel: '%',
            hinweis: 'Fertigstellungsgrad laut Ist-Stand (Doppelklick: Ist erfassen)',
            breite: 48,
            rechts: true,
          },
        ]
      : []),
    ...(daten.vergleich
      ? [
          {
            key: 'abw' as const,
            titel: 'Abw.',
            hinweis: `Abweichung des Endes gegenüber „${daten.vergleich.standName}“ in AT (+ = später)`,
            breite: 52,
            rechts: true,
          },
        ]
      : []),
    {
      key: 'quelle',
      titel: 'Quelle/Annahme',
      hinweis: 'Pflichtfeld (E-13)',
      breite: 200,
      bearbeitbar: (v) => v.typ !== 'sammel',
    },
  ];
  const raster = spalten.map((s) => `${s.breite}px`).join(' ');
  const gesamtBreite = spalten.reduce((s, x) => s + x.breite, 0);

  const [spalte, setSpalte] = useState(1);
  const [edit, setEdit] = useState<{ id: string; key: Bearbeitbar; text: string } | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    editRef.current?.focus();
  }, [edit?.id, edit?.key]);

  // Auswahl sichtbar halten
  const index = zeilen.findIndex((v) => v.id === auswahl);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || index < 0) return;
    const oben = index * ZEILE;
    if (oben < el.scrollTop) el.scrollTop = oben;
    else if (oben + ZEILE > el.scrollTop + el.clientHeight - KOPF)
      el.scrollTop = oben + ZEILE - el.clientHeight + KOPF;
  }, [index, scrollRef]);

  const wert = (v: VorgangMitEbene, key: Spalte['key']): string => {
    const t = termine[v.id];
    switch (key) {
      case 'nr':
        return v.nr;
      case 'name':
        return v.name;
      case 'rolle':
        return v.rolle;
      case 'dauer':
        return v.typ === 'vorgang'
          ? String(v.dauer_at)
          : v.typ === 'meilenstein'
            ? '0'
            : t
              ? String(t.fez - t.faz)
              : '';
      case 'vorgaenger':
        return vorgaengerText(daten, v.id, zustand.vorgaengerForm);
      case 'anfang':
        return t ? (at ? zahlAnzeigen(t.faz) : datumKurz(t.anfang)) : '';
      case 'ende':
        return t ? (at ? zahlAnzeigen(t.fez) : datumKurz(t.ende)) : '';
      case 'gp':
        return t ? zahlAnzeigen(t.gp) : '';
      case 'fp':
        return t && t.fp !== null ? zahlAnzeigen(t.fp) : '';
      case 'fertig': {
        if (v.typ === 'sammel' || !t) return '';
        if (t.status === 'fertig') return '✓ 100';
        const ist = daten.ist[v.id];
        if (t.status === 'begonnen')
          return ist?.fertig_prozent != null
            ? String(ist.fertig_prozent)
            : `Rest ${ist?.restdauer_at ?? ''}`;
        return '';
      }
      case 'abw': {
        const a = daten.vergleich?.termine[v.id]?.abweichung;
        return a == null ? '' : a > 0 ? `+${zahlAnzeigen(a)}` : zahlAnzeigen(a);
      }
      case 'quelle':
        return v.quelle_annahme;
    }
  };

  const bearbeitbar = (
    v: VorgangMitEbene,
    s: Spalte | undefined,
  ): s is Spalte & { key: Bearbeitbar } => !nurLesen && !!s?.bearbeitbar?.(v);

  const beginnen = (v: VorgangMitEbene, s: Spalte | undefined, text?: string) => {
    if (!bearbeitbar(v, s)) return;
    setEdit({ id: v.id, key: s.key, text: text ?? wert(v, s.key) });
  };

  const uebernehmen = async (weiter: 'runter' | 'rechts' | null) => {
    if (!edit) return;
    const v = zeilen.find((x) => x.id === edit.id);
    if (!v) return setEdit(null);
    const text = edit.text.trim();
    let ok: unknown = true;
    if (text !== wert(v, edit.key).trim()) {
      switch (edit.key) {
        case 'vorgaenger':
          ok = await p.befehl('vorgaenger.setzen', { nachId: v.id, text });
          break;
        case 'dauer': {
          const n = Number(text.replace(/\s*(AT|Tage?)$/i, '').replace(',', '.'));
          ok = await p.befehl('vorgang.aendern', { id: v.id, felder: { dauer_at: n } });
          break;
        }
        default: {
          const feld = { nr: 'nr', name: 'name', quelle: 'quelle_annahme', rolle: 'rolle' }[
            edit.key
          ];
          ok = await p.befehl('vorgang.aendern', { id: v.id, felder: { [feld]: text } });
        }
      }
    }
    if (!ok) return; // Fehler: Editor bleibt offen
    setEdit(null);
    if (weiter === 'runter') {
      const n = zeilen[index + 1];
      if (n) p.setAuswahl(n.id);
    } else if (weiter === 'rechts') setSpalte((s) => Math.min(spalten.length - 1, s + 1));
  };

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edit) return;
    const v = zeilen[index];
    const s = spalten[spalte];
    if (e.altKey && e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      return p.onEinruecken(e.key === 'ArrowRight');
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const n =
          zeilen[
            Math.max(0, Math.min(zeilen.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))
          ];
        if (n) p.setAuswahl(n.id);
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
        if (v) beginnen(v, s);
        return;
      case 'Delete':
        if (!nurLesen && v) {
          e.preventDefault();
          p.onLoeschen();
        }
        return;
      case 'Insert':
        if (!nurLesen) {
          e.preventDefault();
          p.onNeu();
        }
        return;
    }
    if (v && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && bearbeitbar(v, s)) {
      e.preventDefault();
      beginnen(v, s, e.key);
    }
  };

  // Virtualisierung: nur sichtbare Zeilen rendern
  const erste = Math.max(0, Math.floor(p.scrollTop / ZEILE) - 10);
  const letzte = Math.min(zeilen.length, Math.ceil((p.scrollTop + p.hoehe) / ZEILE) + 10);

  return (
    <div
      className="tp-tabelle"
      ref={scrollRef}
      onScroll={onScroll}
      tabIndex={0}
      onKeyDown={taste}
      role="grid"
      aria-label="Vorgangstabelle"
      aria-rowcount={zeilen.length}
    >
      <div
        style={{ width: gesamtBreite, height: KOPF + zeilen.length * ZEILE, position: 'relative' }}
      >
        <div className="tp-kopf" style={{ gridTemplateColumns: raster, height: KOPF }} role="row">
          {spalten.map((s, i) => (
            <div
              key={s.key}
              className={`tp-kopfzelle${s.rechts ? ' rechts' : ''}${i === spalte ? ' aktiv' : ''}${i < 2 ? ' fest' : ''}`}
              style={i < 2 ? { left: i === 0 ? 0 : spalten[0]?.breite } : undefined}
              title={s.hinweis}
              role="columnheader"
            >
              {s.titel}
            </div>
          ))}
        </div>
        {zeilen.slice(erste, letzte).map((v, k) => {
          const i = erste + k;
          const t = termine[v.id];
          const gewaehlt = v.id === auswahl;
          return (
            <div
              key={v.id}
              role="row"
              aria-selected={gewaehlt}
              className={`tp-zeile${gewaehlt ? ' gewaehlt' : ''}${t?.kritisch ? ' kritisch' : ''}${v.typ === 'sammel' ? ' sammel' : ''}`}
              style={{ top: KOPF + i * ZEILE, gridTemplateColumns: raster, height: ZEILE }}
              onMouseDown={() => p.setAuswahl(v.id)}
            >
              {spalten.map((s, j) => {
                const editiert = edit && edit.id === v.id && edit.key === s.key;
                const klassen = [
                  'tp-zelle',
                  s.rechts ? 'rechts' : '',
                  gewaehlt && j === spalte ? 'fokus' : '',
                  j < 2 ? 'fest' : '',
                ];
                if (s.key === 'gp' && t && t.gp < 0) klassen.push('negativ');
                const abw = daten.vergleich?.termine[v.id]?.abweichung;
                if (s.key === 'abw' && abw != null)
                  klassen.push(abw > 0 ? 'negativ' : abw < 0 ? 'positiv' : '');
                if (s.key === 'fertig' && t?.status === 'fertig') klassen.push('positiv');
                const ohneQuelle =
                  s.key === 'quelle' && v.typ !== 'sammel' && !v.quelle_annahme.trim();
                return (
                  <div
                    key={s.key}
                    role="gridcell"
                    className={klassen.join(' ')}
                    style={j < 2 ? { left: j === 0 ? 0 : spalten[0]?.breite } : undefined}
                    onMouseDown={() => setSpalte(j)}
                    onDoubleClick={() =>
                      s.key === 'fertig'
                        ? v.typ !== 'sammel' && p.onIst(v.id)
                        : s.key === 'anfang' ||
                            s.key === 'ende' ||
                            s.key === 'gp' ||
                            s.key === 'fp' ||
                            s.key === 'abw'
                          ? p.onEigenschaften(v.id)
                          : beginnen(v, s)
                    }
                    title={ohneQuelle ? 'Quelle/Annahme fehlt (Pflichtfeld)' : undefined}
                  >
                    {editiert ? (
                      <input
                        ref={editRef}
                        className="tp-editor"
                        value={edit.text}
                        aria-label={s.titel}
                        onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void uebernehmen('runter');
                          } else if (e.key === 'Tab') {
                            e.preventDefault();
                            void uebernehmen('rechts');
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            setEdit(null);
                            scrollRef.current?.focus();
                          }
                        }}
                        onBlur={() => void uebernehmen(null)}
                      />
                    ) : s.key === 'name' ? (
                      <span className="tp-name" style={{ paddingLeft: v.ebene * 16 }}>
                        {v.hatKinder ? (
                          <button
                            className="tp-klappe"
                            aria-label={
                              zustand.zugeklappt[daten.plan.id]?.includes(v.id)
                                ? 'Aufklappen'
                                : 'Zuklappen'
                            }
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() =>
                              p.onZuklappen(
                                v.id,
                                !zustand.zugeklappt[daten.plan.id]?.includes(v.id),
                              )
                            }
                          >
                            {zustand.zugeklappt[daten.plan.id]?.includes(v.id) ? '▸' : '▾'}
                          </button>
                        ) : (
                          <span className="tp-klappe-platz" />
                        )}
                        {v.typ === 'meilenstein' && (
                          <span
                            className={`tp-raute${v.schnittstelle ? ' schnittstelle' : ''}`}
                            aria-label="Meilenstein"
                          >
                            ◆
                          </span>
                        )}
                        <span className="tp-text">{v.name}</span>
                        {p.risikoNr.has(v.id) && (
                          <span className="tp-risiko" title={v.risiko}>
                            {p.risikoNr.get(v.id)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="tp-text">
                        {ohneQuelle ? <span className="tp-warnung">⚠ fehlt</span> : wert(v, s.key)}
                      </span>
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
