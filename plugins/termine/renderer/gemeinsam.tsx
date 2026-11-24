import { LeereAnsicht, zahlAnzeigen } from '@bautakt/ui';
import type { PlanDaten, PlanZeile } from '../gemeinsam/typen.js';
import { datumKurz } from './daten.js';
import { setzen } from './zustand.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

/** Planauswahl mit „Neuer Plan“ und „Planeinstellungen“ (E-14: mehrere Pläne je Projekt). */
export function PlanLeiste(props: {
  plaene: PlanZeile[];
  planId: string | null;
  nurLesen: boolean;
  befehl: Befehl;
  onEinstellungen: () => void;
}) {
  return (
    <div className="tp-gruppe">
      <label className="inline">
        Plan
        <select
          value={props.planId ?? ''}
          onChange={(e) => setzen({ planId: e.target.value, auswahl: null })}
          aria-label="Plan wählen"
        >
          {props.plaene.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={props.onEinstellungen}
        title="Projektstart, Soll-Ende, Rückwärtsrechnung, Kalender und Ruhezeiten"
      >
        Planeinstellungen …
      </button>
      {!props.nurLesen && (
        <button
          onClick={async () => {
            const ids = await props.befehl('plan.anlegen', {
              name: `Plan ${props.plaene.length + 1}`,
            });
            // Erste eingefügte Zeile ist der Kalender, die zweite der Plan
            if (ids?.[1]) setzen({ planId: ids[1], auswahl: null });
          }}
        >
          Neuer Plan
        </button>
      )}
    </div>
  );
}

/** Leere Ansicht, wenn das Projekt noch keinen Plan hat (E-29). */
export function KeinPlan(props: { nurLesen: boolean; befehl: Befehl }) {
  return (
    <LeereAnsicht titel="Noch kein Terminplan">
      <p>
        Legen Sie einen Plan an. Danach tragen Sie links Vorgänge mit Dauer und Quelle/Annahme ein
        und verknüpfen sie in der Spalte „Vorgänger“ (z. B. <code>1EA+10</code>).
      </p>
      {!props.nurLesen && (
        <div className="knoepfe">
          <button
            className="primaer"
            onClick={() => void props.befehl('plan.anlegen', { name: 'Terminplan Gesamtprojekt' })}
          >
            Terminplan anlegen
          </button>
          <button
            onClick={() =>
              void props.befehl('plan.anlegen', { name: 'Rollen-Netzplan', art: 'rollen' })
            }
          >
            Rollen-Netzplan anlegen
          </button>
        </div>
      )}
    </LeereAnsicht>
  );
}

/** Kennzahlen des Plans: Projektende, Soll-Ende, Abweichung, fehlende Quellen. */
export function Kennzahlen({ daten }: { daten: PlanDaten }) {
  const b = daten.berechnung;
  if (!b.ok)
    return <div className="tp-kennzahlen fehler">Berechnung nicht möglich: {b.fehler}</div>;
  const ohneQuelle = daten.vorgaenge.filter(
    (v) => v.typ !== 'sammel' && !v.quelle_annahme.trim(),
  ).length;
  const kritisch = Object.entries(b.termine).filter(
    ([id, t]) => t.kritisch && daten.vorgaenge.find((v) => v.id === id)?.typ !== 'sammel',
  ).length;
  return (
    <div className="tp-kennzahlen" role="status">
      <span>
        Projektende <strong>{daten.vorgaenge.length ? datumKurz(b.projektendeDatum) : '–'}</strong>{' '}
        ({zahlAnzeigen(b.projektende)} AT)
      </span>
      {b.sollEndeDatum && (
        <span>
          Soll-Ende <strong>{datumKurz(b.sollEndeDatum)}</strong>
          {b.abweichungSollEnde !== null && (
            <span className={b.abweichungSollEnde > 0 ? 'negativ' : 'positiv'}>
              {b.abweichungSollEnde > 0
                ? ` – überschritten um ${zahlAnzeigen(b.abweichungSollEnde)} AT`
                : ` – Reserve ${zahlAnzeigen(-b.abweichungSollEnde)} AT`}
            </span>
          )}
        </span>
      )}
      <span>
        kritisch: <strong>{kritisch}</strong>
        {daten.plan.rueckwaerts_von === 'soll_ende' ? ' (vom Soll-Ende gerechnet)' : ''}
      </span>
      {ohneQuelle > 0 && <span className="tp-warnung">⚠ {ohneQuelle} ohne Quelle/Annahme</span>}
    </div>
  );
}
