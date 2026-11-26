import { KG_KATALOG, kgEbene, kostengruppe } from '@bautakt/rechnen-kosten';
import { Dialog } from '@bautakt/ui';
import { useMemo, useState } from 'react';
import type { BauteilZeile, RegelZeile } from '../gemeinsam/typen.js';
import {
  EINHEIT,
  MENGENARTEN,
  MENGENART_TEXT,
  mengeFuer,
  regelPasst,
  type Menge,
  type Mengenart,
  type Zuordnung,
} from '../gemeinsam/zuordnung.js';

/** „331 Tragende Außenwände“ */
export const kgText = (kg: number) => `${kg} ${kostengruppe(kg)?.bezeichnung ?? ''}`.trim();

const zahl = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 3 });

/** Menge mit Einheit und Herkunft (E-92). */
export function mengeText(m: Menge, art: Mengenart): string {
  if (art === 'stueck') return '1 Stk';
  const herkunft = m.herkunft === 'qto' ? `BaseQuantities ${m.name ?? ''}`.trim() : 'Geometrie';
  return `${zahl(m.wert)} ${EINHEIT[art]} · ${herkunft}`;
}

/** Kostengruppen für Bauteile: Bauwerk (300, 400) und Außenanlagen (500), 2. und 3. Ebene. */
const KG_WAHL = KG_KATALOG.filter((k) => k.kg >= 300 && k.kg < 600 && kgEbene(k.kg) > 1);

function KgAuswahl(props: {
  wert: number;
  onWahl: (kg: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={props.label ?? 'Kostengruppe'}
      disabled={props.disabled}
      value={props.wert}
      onChange={(e) => props.onWahl(Number(e.target.value))}
    >
      {[300, 400, 500].map((g) => (
        <optgroup key={g} label={kgText(g)}>
          {KG_WAHL.filter((k) => Math.floor(k.kg / 100) === g / 100).map((k) => (
            <option key={k.kg} value={k.kg}>
              {kgEbene(k.kg) === 3 ? ' ' : ''}
              {kgText(k.kg)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function MengenartAuswahl(props: {
  wert: Mengenart;
  onWahl: (a: Mengenart) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label="Mengenart"
      disabled={props.disabled}
      value={props.wert}
      onChange={(e) => props.onWahl(e.target.value as Mengenart)}
    >
      {MENGENARTEN.map((a) => (
        <option key={a} value={a}>
          {MENGENART_TEXT[a]} ({EINHEIT[a]})
        </option>
      ))}
    </select>
  );
}

/** Kostengruppe und Mengen eines Bauteils (oben in der Eigenschaften-Leiste). */
export function ZuordnungBereich(props: {
  bauteil: BauteilZeile;
  zuordnung: Zuordnung | undefined;
  nurLesen: boolean;
  onAendern: () => void;
}) {
  const z = props.zuordnung;
  const m = props.bauteil.mengen;
  return (
    <section className="bim-kg" aria-label="Kostengruppe und Mengen">
      <div className="bim-kg-kopf">
        <strong>{z?.kg ? kgText(z.kg) : 'keine Kostengruppe'}</strong>
        {!props.nurLesen && props.bauteil.klasse !== 'IfcSpace' && (
          <button onClick={props.onAendern}>Ändern …</button>
        )}
      </div>
      <div className="leise">
        {props.bauteil.klasse === 'IfcSpace'
          ? 'Räume zählen nicht zu Kostengruppen (Flächen nach DIN 277 folgen).'
          : z?.manuell
            ? 'manuell zugeordnet'
            : z?.regel !== null && z?.regel !== undefined
              ? `nach Regel ${z.regel + 1}`
              : 'keine passende Regel'}
      </div>
      {m === null ? (
        <p className="tp-warnung">
          Keine Mengen – das Modell wurde vor B2 eingelesen; bitte neu einlesen.
        </p>
      ) : (
        <table>
          <tbody>
            {(['flaeche', 'volumen', 'laenge'] as const).map((art) => {
              const menge = mengeFuer(m, art);
              return (
                <tr key={art} className={z?.mengenart === art ? 'bim-kg-zaehlt' : ''}>
                  <th>{MENGENART_TEXT[art]}</th>
                  <td>{menge ? mengeText(menge, art) : '–'}</td>
                </tr>
              );
            })}
            <tr className={z?.mengenart === 'stueck' ? 'bim-kg-zaehlt' : ''}>
              <th>Stück</th>
              <td>1 Stk</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Kostengruppe eines Bauteils überschreiben oder wieder der Regel überlassen (E-90). */
export function KgDialog(props: {
  bauteil: BauteilZeile;
  zuordnung: Zuordnung | undefined;
  onSchliessen: () => void;
  onSetzen: (kg: number | null, mengenart: Mengenart) => void;
  onRegel: () => void;
}) {
  const z = props.zuordnung;
  const [ohne, setOhne] = useState(!!z?.manuell && z.kg === null);
  const [kg, setKg] = useState(z?.kg ?? 342);
  const [art, setArt] = useState<Mengenart>(z?.mengenart ?? 'flaeche');
  return (
    <Dialog
      titel="Kostengruppe des Bauteils"
      onSchliessen={props.onSchliessen}
      breite={520}
      fuss={
        <>
          {z?.manuell && <button onClick={props.onRegel}>Wieder nach Regel</button>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button className="primaer" onClick={() => props.onSetzen(ohne ? null : kg, art)}>
            Übernehmen
          </button>
        </>
      }
    >
      <p className="leise">
        {props.bauteil.name || props.bauteil.klasse} · {props.bauteil.klasse} ·{' '}
        {props.bauteil.globalid}
      </p>
      <label className="inline">
        <input type="checkbox" checked={ohne} onChange={(e) => setOhne(e.target.checked)} />
        keiner Kostengruppe zuordnen
      </label>
      {!ohne && (
        <div className="bim-formular">
          <label>
            Kostengruppe
            <KgAuswahl wert={kg} onWahl={setKg} />
          </label>
          <label>
            Mengenart
            <MengenartAuswahl wert={art} onWahl={setArt} />
          </label>
        </div>
      )}
      <p className="dialog-erklaerung">
        Die Zuordnung gilt für dieses Bauteil statt der Regeltabelle und bleibt beim erneuten
        Einlesen über die GlobalId erhalten.
      </p>
    </Dialog>
  );
}

const JA_NEIN: { wert: string; text: string }[] = [
  { wert: '', text: 'beliebig' },
  { wert: '1', text: 'ja' },
  { wert: '0', text: 'nein' },
];

/** Regeltabelle IFC → KG des Projekts (E-90). Änderungen sofort als Befehl (Undo). */
export function RegelnDialog(props: {
  regeln: RegelZeile[];
  bauteile: BauteilZeile[];
  klassen: string[];
  nurLesen: boolean;
  onSchliessen: () => void;
  befehl: (name: string, daten: unknown) => Promise<boolean>;
}) {
  // Treffer je Regel: erste passende Regel zählt (ohne Überschreibungen)
  const treffer = useMemo(() => {
    const n = new Map<string, number>();
    let ohne = 0;
    for (const b of props.bauteile) {
      if (b.klasse === 'IfcSpace') continue;
      const r = props.regeln.find((x) => regelPasst(x, b));
      if (r) n.set(r.id, (n.get(r.id) ?? 0) + 1);
      else ohne++;
    }
    return { n, ohne };
  }, [props.regeln, props.bauteile]);
  const aendern = (r: RegelZeile, felder: Partial<RegelZeile>) =>
    void props.befehl('regel.aendern', { id: r.id, ...felder });
  const jaNein = (w: string) => (w === '' ? null : Number(w));
  const aus = props.nurLesen;
  return (
    <Dialog
      titel="Regeln IFC → Kostengruppe"
      onSchliessen={props.onSchliessen}
      breite={1220}
      fuss={
        <>
          {!aus && (
            <>
              <button
                onClick={() =>
                  void props.befehl('regel.anlegen', {
                    klasse: 'IfcWall',
                    kg: 342,
                    mengenart: 'flaeche',
                  })
                }
              >
                + Regel
              </button>
              <button onClick={() => void props.befehl('regeln.standard', {})}>
                Standardregeln wiederherstellen
              </button>
            </>
          )}
          <span className="bim-luecke" />
          <button className="primaer" onClick={props.onSchliessen}>
            Schließen
          </button>
        </>
      }
    >
      <p className="dialog-erklaerung">
        Je Bauteil gilt die erste passende Regel von oben. Leere Felder und „beliebig“ passen immer;
        die Klasse umfasst Unterklassen (IfcWall auch IfcWallStandardCase). Manuelle Zuordnungen
        einzelner Bauteile gehen vor. {treffer.ohne} Bauteil(e) ohne passende Regel.
      </p>
      <datalist id="bim-klassen">
        {props.klassen.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <div className="bim-regeln">
        <table className="tabelle">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>IFC-Klasse</th>
              <th>PredefinedType</th>
              <th>außen</th>
              <th>tragend</th>
              <th>Name/Typ enthält</th>
              <th>Kostengruppe</th>
              <th>Mengenart</th>
              <th className="zahl">Treffer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.regeln.map((r, i) => (
              <tr key={JSON.stringify(r)}>
                <td>{i + 1}</td>
                <td>
                  <input
                    list="bim-klassen"
                    aria-label="IFC-Klasse"
                    defaultValue={r.klasse}
                    disabled={aus}
                    onBlur={(e) =>
                      e.target.value !== r.klasse && aendern(r, { klasse: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="PredefinedType"
                    defaultValue={r.predefined}
                    placeholder="beliebig"
                    disabled={aus}
                    onBlur={(e) =>
                      e.target.value !== r.predefined &&
                      aendern(r, { predefined: e.target.value.toUpperCase() })
                    }
                  />
                </td>
                {(['aussen', 'tragend'] as const).map((f) => (
                  <td key={f}>
                    <select
                      aria-label={f === 'aussen' ? 'außen' : 'tragend'}
                      value={r[f] === null ? '' : String(r[f])}
                      disabled={aus}
                      onChange={(e) => aendern(r, { [f]: jaNein(e.target.value) })}
                    >
                      {JA_NEIN.map((o) => (
                        <option key={o.wert} value={o.wert}>
                          {o.text}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
                <td>
                  <input
                    aria-label="Name/Typ enthält"
                    defaultValue={r.enthaelt}
                    placeholder="beliebig"
                    disabled={aus}
                    onBlur={(e) =>
                      e.target.value !== r.enthaelt && aendern(r, { enthaelt: e.target.value })
                    }
                  />
                </td>
                <td>
                  <KgAuswahl wert={r.kg} disabled={aus} onWahl={(kg) => aendern(r, { kg })} />
                </td>
                <td>
                  <MengenartAuswahl
                    wert={r.mengenart}
                    disabled={aus}
                    onWahl={(mengenart) => aendern(r, { mengenart })}
                  />
                </td>
                <td className="zahl">{treffer.n.get(r.id) ?? 0}</td>
                <td className="aktionen">
                  {!aus && (
                    <>
                      <button
                        title="nach oben"
                        disabled={i === 0}
                        onClick={() =>
                          void props.befehl('regel.verschieben', { id: r.id, richtung: -1 })
                        }
                      >
                        ↑
                      </button>
                      <button
                        title="nach unten"
                        disabled={i === props.regeln.length - 1}
                        onClick={() =>
                          void props.befehl('regel.verschieben', { id: r.id, richtung: 1 })
                        }
                      >
                        ↓
                      </button>
                      <button
                        title="Regel löschen"
                        onClick={() => void props.befehl('regel.loeschen', { id: r.id })}
                      >
                        ×
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
