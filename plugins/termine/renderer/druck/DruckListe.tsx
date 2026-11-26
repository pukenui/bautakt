import type { BautaktApi } from '@bautakt/kern/vertrag';
import { Arbeitskalender } from '@bautakt/rechnen-kalender';
import { useEffect, useState } from 'react';
import type { PlanDaten } from '../../gemeinsam/typen.js';
import type { ListenEintrag } from '../listen.js';
import type { ListenSpalte } from '../ListenTabelle.js';
import { INNEN } from './DruckRahmen.js';

export const DRUCK_ZEILE = 20;
export const DRUCK_TABELLENKOPF = 26;

/** Plandaten für eine Druckansicht laden; meldet `fertig`, sobald gezeichnet ist. */
export function useDruckDaten(
  api: BautaktApi,
  parameter: Record<string, unknown>,
  fertig: () => void,
  fehler: (m: string) => void,
): PlanDaten | null {
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const planId = String(parameter['planId'] ?? '');
  const sollStandId =
    typeof parameter['sollStandId'] === 'string' ? parameter['sollStandId'] : null;
  useEffect(() => {
    void api
      .abfrage<PlanDaten>('termine', 'plan', { planId, sollStandId })
      .then((a) => (a.ok ? setDaten(a.wert) : fehler(a.fehler)));
  }, [api, planId, sollStandId, fehler]);
  useEffect(() => {
    if (!daten) return;
    if (!daten.berechnung.ok)
      fehler(`Der Plan kann nicht gerechnet werden: ${daten.berechnung.fehler}`);
    else requestAnimationFrame(() => requestAnimationFrame(fertig));
  }, [daten, fertig, fehler]);
  return daten && daten.berechnung.ok ? daten : null;
}

export function druckKalender(daten: PlanDaten): Arbeitskalender {
  return new Arbeitskalender({
    start: daten.plan.projektstart ?? new Date().toISOString().slice(0, 10),
    arbeitstage: daten.kalender.arbeitstage,
    bundesland: daten.kalender.bundesland,
    ruhezeiten: daten.ruhezeiten.map((r) => ({
      von: r.von,
      bis: r.bis,
      name: r.name || 'Ruhezeit',
    })),
  });
}

/** Einträge auf Seiten verteilen (PDF); PNG = eine Seite. Erste Seite kann weniger Platz haben. */
export function seitenAufteilen<T>(
  liste: T[],
  format: 'pdf' | 'png',
  proSeite: number,
  ersteSeite = proSeite,
): T[][] {
  if (format === 'png' || liste.length === 0) return [liste];
  const seiten: T[][] = [liste.slice(0, Math.max(1, ersteSeite))];
  for (let i = Math.max(1, ersteSeite); i < liste.length; i += Math.max(1, proSeite))
    seiten.push(liste.slice(i, i + Math.max(1, proSeite)));
  return seiten;
}

/** Tabelle einer Liste im Druck: Spaltenbreiten auf die Seitenbreite gestreckt. */
export function DruckListe(props: {
  spalten: ListenSpalte[];
  eintraege: ListenEintrag[];
  zeilenKlasse?: (e: ListenEintrag & { art: 'vorgang' }) => string;
  einruecken?: boolean;
}) {
  const summe = props.spalten.reduce((s, x) => s + x.breite, 0);
  const faktor = Math.max(1, INNEN.breite / summe);
  return (
    <table
      className="druck-tabelle druck-liste"
      style={{ width: Math.min(INNEN.breite, summe * faktor) }}
    >
      <colgroup>
        {props.spalten.map((s) => (
          <col key={s.key} style={{ width: s.breite * faktor }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ height: DRUCK_TABELLENKOPF }}>
          {props.spalten.map((s) => (
            <th key={s.key} className={s.rechts ? 'rechts' : ''}>
              {s.titel}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.eintraege.map((e) =>
          e.art === 'gruppe' ? (
            <tr key={`g-${e.titel}`} className="gruppe" style={{ height: DRUCK_ZEILE }}>
              <td colSpan={props.spalten.length}>
                {e.titel} ({e.anzahl})
              </td>
            </tr>
          ) : (
            <tr
              key={e.v.id}
              style={{ height: DRUCK_ZEILE }}
              className={`${e.v.typ === 'sammel' ? 'sammel' : ''} ${props.zeilenKlasse?.(e) ?? ''}`}
            >
              {props.spalten.map((s) => (
                <td
                  key={s.key}
                  className={`${s.rechts ? 'rechts' : ''} ${s.klasse?.(e.v) ?? ''}`}
                  style={
                    s.key === 'name' && props.einruecken
                      ? { paddingLeft: 4 + e.v.ebene * 12 }
                      : undefined
                  }
                >
                  {s.key === 'name' && e.v.typ === 'meilenstein' && (
                    <span className={e.v.schnittstelle ? 'schnittstelle' : ''}>◆ </span>
                  )}
                  {s.text(e.v)}
                </td>
              ))}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
