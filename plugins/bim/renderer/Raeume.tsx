import { Dialog } from '@bautakt/ui';
import { useMemo, useState } from 'react';
import {
  RAUM_KATEGORIEN,
  RAUM_KATEGORIE_TEXT,
  raumRegelPasst,
  type RaumKategorie,
  type RaumZuordnung,
} from '../gemeinsam/raeume.js';
import type { Aenderungsbericht, BauteilZeile } from '../gemeinsam/typen.js';
import { kgText, mengeText } from './Kostengruppen.js';

export interface RaumRegelZeile {
  id: string;
  reihenfolge: number;
  enthaelt: string;
  kategorie: RaumKategorie;
}

const zahl = (x: number | null) =>
  x === null ? '–' : x.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** DIN-277-Kategorie und Grundfläche eines Raums (Eigenschaften-Leiste, E-94). */
export function RaumBereich(props: {
  raum: BauteilZeile;
  zuordnung: RaumZuordnung | undefined;
  nurLesen: boolean;
  onAendern: () => void;
}) {
  const z = props.zuordnung;
  const f = props.raum.mengen?.flaeche;
  return (
    <section className="bim-kg" aria-label="Raum nach DIN 277">
      <div className="bim-kg-kopf">
        <strong>{z?.kategorie ? RAUM_KATEGORIE_TEXT[z.kategorie] : 'zählt nicht (DIN 277)'}</strong>
        {!props.nurLesen && <button onClick={props.onAendern}>Ändern …</button>}
      </div>
      <div className="leise">
        {z?.manuell
          ? 'von Hand zugeordnet'
          : z?.regel !== null && z?.regel !== undefined
            ? `nach Raumregel ${z.regel + 1}`
            : 'keine passende Raumregel'}
        {props.raum.langname ? ` · ${props.raum.langname}` : ''}
      </div>
      <table>
        <tbody>
          <tr className="bim-kg-zaehlt">
            <th>Grundfläche</th>
            <td>{f ? mengeText(f, 'flaeche') : '–'}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** Kategorie eines Raums von Hand festlegen oder wieder der Raumregel überlassen. */
export function RaumDialog(props: {
  raum: BauteilZeile;
  zuordnung: RaumZuordnung | undefined;
  onSchliessen: () => void;
  onSetzen: (kategorie: RaumKategorie | null) => void;
  onRegel: () => void;
}) {
  const z = props.zuordnung;
  const [wert, setWert] = useState<string>(z?.kategorie ?? '');
  return (
    <Dialog
      titel="Raum nach DIN 277"
      onSchliessen={props.onSchliessen}
      breite={480}
      fuss={
        <>
          {z?.manuell && <button onClick={props.onRegel}>Wieder nach Raumregel</button>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button
            className="primaer"
            onClick={() => props.onSetzen(wert ? (wert as RaumKategorie) : null)}
          >
            Übernehmen
          </button>
        </>
      }
    >
      <p className="leise">
        Raum {props.raum.name}
        {props.raum.langname ? ` – ${props.raum.langname}` : ''} · {props.raum.globalid}
      </p>
      <label className="bim-formular">
        Kategorie
        <select
          aria-label="DIN-277-Kategorie"
          value={wert}
          onChange={(e) => setWert(e.target.value)}
        >
          {RAUM_KATEGORIEN.map((k) => (
            <option key={k} value={k}>
              {RAUM_KATEGORIE_TEXT[k]}
            </option>
          ))}
          <option value="">nicht zählen</option>
        </select>
      </label>
      <p className="dialog-erklaerung">
        Die Zuordnung gilt statt der Raumregeln und bleibt beim erneuten Einlesen über die GlobalId
        erhalten.
      </p>
    </Dialog>
  );
}

/** Raumregeln des Projekts (E-94), als Reiter im Regeln-Dialog. */
export function RaumRegelnTabelle(props: {
  regeln: RaumRegelZeile[];
  raeume: BauteilZeile[];
  nurLesen: boolean;
  befehl: (name: string, daten: unknown) => Promise<boolean>;
}) {
  const treffer = useMemo(() => {
    const n = new Map<string, number>();
    let ohne = 0;
    for (const r of props.raeume) {
      const regel = props.regeln.find((x) => raumRegelPasst(x, r));
      if (regel) n.set(regel.id, (n.get(regel.id) ?? 0) + 1);
      else ohne++;
    }
    return { n, ohne };
  }, [props.regeln, props.raeume]);
  const aus = props.nurLesen;
  return (
    <>
      <p className="dialog-erklaerung">
        Je Raum gilt die erste passende Raumregel von oben. Suchbegriffe durch Komma trennen; einer
        genügt, am Wortanfang in Name, Langname, Typ oder Eigenschaftswerten. Leer = jeder Raum.
        {` ${props.raeume.length} Raum/Räume, ${treffer.ohne} ohne passende Regel.`}
      </p>
      <div className="bim-regeln">
        <table className="tabelle">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Name/Langname/Typ/Eigenschaft enthält</th>
              <th>Kategorie</th>
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
                    className="bim-raumsuche"
                    aria-label="enthält"
                    defaultValue={r.enthaelt}
                    placeholder="jeder Raum"
                    disabled={aus}
                    onBlur={(e) =>
                      e.target.value !== r.enthaelt &&
                      void props.befehl('raumregel.aendern', { id: r.id, enthaelt: e.target.value })
                    }
                  />
                </td>
                <td>
                  <select
                    aria-label="Kategorie"
                    value={r.kategorie}
                    disabled={aus}
                    onChange={(e) =>
                      void props.befehl('raumregel.aendern', {
                        id: r.id,
                        kategorie: e.target.value,
                      })
                    }
                  >
                    {RAUM_KATEGORIEN.map((k) => (
                      <option key={k} value={k}>
                        {RAUM_KATEGORIE_TEXT[k]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="zahl">{treffer.n.get(r.id) ?? 0}</td>
                <td className="aktionen">
                  {!aus && (
                    <>
                      <button
                        title="nach oben"
                        disabled={i === 0}
                        onClick={() =>
                          void props.befehl('raumregel.verschieben', { id: r.id, richtung: -1 })
                        }
                      >
                        ↑
                      </button>
                      <button
                        title="nach unten"
                        disabled={i === props.regeln.length - 1}
                        onClick={() =>
                          void props.befehl('raumregel.verschieben', { id: r.id, richtung: 1 })
                        }
                      >
                        ↓
                      </button>
                      <button
                        title="Raumregel löschen"
                        onClick={() => void props.befehl('raumregel.loeschen', { id: r.id })}
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
    </>
  );
}

/** Änderungsbericht vor dem Übernehmen eines neu eingelesenen Modells (E-96). */
export function VorschauDialog(props: {
  bericht: Aenderungsbericht;
  zeilen: string[];
  laeuft: boolean;
  onSchliessen: () => void;
  onUebernehmen: () => void;
}) {
  const b = props.bericht;
  const liste = (
    titel: string,
    eintraege: { globalid: string; klasse: string; name: string; was?: string[] }[],
  ) =>
    eintraege.length > 0 && (
      <details open={eintraege.length <= 12}>
        <summary>
          {titel} ({eintraege.length})
        </summary>
        <ul className="bim-vorschau-liste">
          {eintraege.slice(0, 200).map((e) => (
            <li key={e.globalid}>
              {e.klasse} · {e.name || e.globalid}
              {e.was ? <span className="leise"> – {e.was.join(', ')}</span> : null}
            </li>
          ))}
          {eintraege.length > 200 && (
            <li className="leise">… und {eintraege.length - 200} weitere</li>
          )}
        </ul>
      </details>
    );
  const pfeil = (alt: number | null, neu: number | null) => (
    <span className={alt !== neu ? 'bim-anders' : ''}>
      {zahl(alt)} → {zahl(neu)}
    </span>
  );
  return (
    <Dialog
      titel={`„${b.modellName}“ neu einlesen`}
      onSchliessen={props.onSchliessen}
      breite={680}
      fuss={
        <>
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button className="primaer" disabled={props.laeuft} onClick={props.onUebernehmen}>
            Übernehmen
          </button>
        </>
      }
    >
      <p>
        <strong>{b.dateiname}</strong> · {props.zeilen.join(' ')}
      </p>
      {liste('Neu', b.neu)}
      {liste('Geändert', b.geaendert)}
      {liste('Entfernt', b.entfernt)}
      {b.neu.length + b.geaendert.length + b.entfernt.length === 0 && (
        <p className="leise">Keine Änderungen an den Bauteilen.</p>
      )}
      {(b.kosten.length > 0 || b.flaechen.length > 0) && (
        <>
          <h4>Auswirkungen</h4>
          <table className="tabelle bim-vorschau-tabelle">
            <tbody>
              {b.kosten.map((k) => (
                <tr key={`kg${k.kg}`}>
                  <td>Kosten {kgText(k.kg)}</td>
                  <td className="zahl">
                    {pfeil(k.alt, k.neu)} {k.einheit}
                  </td>
                </tr>
              ))}
              {b.flaechen.map((f) => (
                <tr key={f.kategorie}>
                  <td>Fläche {RAUM_KATEGORIE_TEXT[f.kategorie as RaumKategorie] ?? f.kategorie}</td>
                  <td className="zahl">{pfeil(f.alt, f.neu)} m²</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {b.zuordnungenOhneBauteil > 0 && (
        <p className="tp-warnung">
          {b.zuordnungenOhneBauteil} Zuordnung(en) von Hand betreffen Bauteile, die nicht mehr im
          Modell sind; sie bleiben gespeichert und greifen wieder, wenn die Bauteile zurückkehren.
        </p>
      )}
      <p className="dialog-erklaerung">
        Bauteile mit gleicher GlobalId behalten ihre Zuordnungen. Rückgängig nimmt das Neu-Einlesen
        als Ganzes zurück.
      </p>
    </Dialog>
  );
}
