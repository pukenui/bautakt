import { zahlAnzeigen } from '@bautakt/ui';
import type { ReactNode } from 'react';
import type { PlanDaten } from '../../gemeinsam/typen.js';
import { datumKurz } from '../daten.js';

/** Seitenmaße A3 quer bei 96 dpi (420 × 297 mm). */
export const SEITE = { breite: 1587, hoehe: 1122, rand: 34 } as const;
export const INNEN = {
  breite: SEITE.breite - 2 * SEITE.rand,
  hoehe: SEITE.hoehe - 2 * SEITE.rand,
} as const;
export const KOPF_HOEHE = 74;
export const FUSS_HOEHE = 96;

export function heuteDeutsch(): string {
  return new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Plankopf (E-21): Projekt, Plan, Stand, Ersteller, Kennzahlen, Seite. */
export function Plankopf(props: {
  projektname: string;
  daten: PlanDaten;
  darstellung: string;
  ersteller: string;
  seite: number;
  seiten: number;
}) {
  const b = props.daten.berechnung;
  return (
    <header className="druck-kopf" style={{ height: KOPF_HOEHE }}>
      <div>
        <div className="druck-titel">
          {props.projektname} – {props.daten.plan.name}
        </div>
        <div className="druck-untertitel">
          {props.darstellung}
          {b.ok && (
            <>
              {' · '}Projektstart{' '}
              {props.daten.plan.projektstart ? datumKurz(props.daten.plan.projektstart) : '–'}
              {' · '}Projektende {datumKurz(b.projektendeDatum)} ({zahlAnzeigen(b.projektende)} AT)
              {b.sollEndeDatum && (
                <>
                  {' · '}Soll-Ende {datumKurz(b.sollEndeDatum)}
                  {b.abweichungSollEnde !== null &&
                    (b.abweichungSollEnde > 0 ? (
                      <span className="negativ">
                        {' '}
                        (überschritten um {zahlAnzeigen(b.abweichungSollEnde)} AT)
                      </span>
                    ) : (
                      ` (Reserve ${zahlAnzeigen(-b.abweichungSollEnde)} AT)`
                    ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <table className="druck-kopf-rechts">
        <tbody>
          <tr>
            <th>Stand</th>
            <td>{heuteDeutsch()}</td>
          </tr>
          <tr>
            <th>Ersteller</th>
            <td>{props.ersteller || '–'}</td>
          </tr>
          {props.seiten > 1 && (
            <tr>
              <th>Seite</th>
              <td>
                {props.seite} von {props.seiten}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </header>
  );
}

/** Seite mit festem A3-Format (PDF) bzw. frei wachsend (PNG). */
export function Seite(props: { format: 'pdf' | 'png'; children: ReactNode }) {
  return (
    <section
      className={`druck-seite ${props.format}`}
      style={
        props.format === 'pdf'
          ? { width: SEITE.breite, height: SEITE.hoehe, padding: SEITE.rand }
          : { width: SEITE.breite, padding: SEITE.rand }
      }
    >
      {props.children}
    </section>
  );
}
