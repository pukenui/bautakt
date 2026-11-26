import type { StandZeile } from '@bautakt/kern/vertrag';
import type { PlanDaten } from '../gemeinsam/typen.js';
import { vergleichsStand } from './daten.js';
import { setzen, useZustand } from './zustand.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Soll-Ist (E-32): Stichtag der Prognose, Vergleichsstand (E-46) und Ist-Erfassung des
 * ausgewählten Vorgangs.
 */
export function SollIstLeiste(props: {
  daten: PlanDaten;
  staende: StandZeile[];
  nurLesen: boolean;
  befehl: Befehl;
  istMoeglich: boolean;
  onIst: () => void;
}) {
  const z = useZustand();
  const planId = props.daten.plan.id;
  const stichtag = props.daten.plan.stichtag;
  const aktiv = vergleichsStand(props.staende, z.vergleich[planId]);
  const soll = props.staende.filter((s) => s.art === 'soll');
  return (
    <div className="tp-gruppe" role="group" aria-label="Soll-Ist">
      <label
        className="inline"
        title="Stand der Ist-Meldungen; ab hier wird prognostiziert (leer = reiner Plan)"
      >
        Stichtag
        <input
          type="date"
          value={stichtag ?? ''}
          disabled={props.nurLesen}
          onChange={(e) =>
            void props.befehl('plan.aendern', { id: planId, stichtag: e.target.value || null })
          }
        />
      </label>
      {!stichtag && !props.nurLesen && (
        <button
          onClick={() => void props.befehl('plan.aendern', { id: planId, stichtag: heuteIso() })}
        >
          heute
        </button>
      )}
      <button
        disabled={!props.istMoeglich}
        onClick={props.onIst}
        title="Ist-Anfang, Ist-Ende, Fertigstellungsgrad, Restdauer, Ursache"
      >
        Ist erfassen …
      </button>
      <label className="inline" title="Soll-Balken und Abweichung gegen diesen Stand">
        Vergleich
        <select
          value={aktiv ?? ''}
          onChange={(e) =>
            setzen((s) => ({ vergleich: { ...s.vergleich, [planId]: e.target.value || null } }))
          }
        >
          <option value="">kein Soll-Vergleich</option>
          {soll.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
