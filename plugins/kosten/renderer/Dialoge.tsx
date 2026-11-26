import type { BautaktApi } from '@bautakt/kern/vertrag';
import type { KennwertZeile } from '@bautakt/plugin-bibliothek/typen';
import {
  FLAECHE_TEXT,
  KG_KATALOG,
  kgUnter,
  type Flaeche,
  type IndexModus,
} from '@bautakt/rechnen-kosten';
import { Dialog } from '@bautakt/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { KostenDaten, ZeileBerechnet } from '../gemeinsam/typen.js';
import { betrag, eingabeZahl, rechenweg } from './format.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

const ALLE_FLAECHEN: Flaeche[] = [
  'BGF',
  'NRF',
  'NUF',
  'NUF1',
  'NUF2',
  'NUF3',
  'NUF4',
  'NUF5',
  'NUF6',
  'NUF7',
  'TF',
  'VF',
  'KGF',
  'AF',
  'GF',
];

function Feld(props: { label: string; children: ReactNode; breit?: boolean; hinweis?: ReactNode }) {
  return (
    <label className={`feld${props.breit ? ' breit' : ''}`}>
      <span className="feld-label">{props.label}</span>
      {props.children}
      {props.hinweis && <span className="feld-hinweis">{props.hinweis}</span>}
    </label>
  );
}

const zahlText = (x: number | null) =>
  x === null ? '' : x.toLocaleString('de-DE', { maximumFractionDigits: 4, useGrouping: false });

// ---------------------------------------------------------------------------------------------
// Einstellungen (E-16)

export function EinstellungenDialog(props: {
  daten: KostenDaten;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const e = props.daten.einstellung;
  const [f, setF] = useState({
    index_aktuell: zahlText(e.index_aktuell),
    index_aktuell_stand: e.index_aktuell_stand,
    index_quelle: e.index_quelle,
    regionalfaktor: zahlText(e.regionalfaktor),
    regionalfaktor_quelle: e.regionalfaktor_quelle,
    mwst_satz: zahlText(e.mwst_satz),
    vorsteuerabzug: e.vorsteuerabzug === 1,
  });
  const setze = <K extends keyof typeof f>(k: K, w: (typeof f)[K]) => setF({ ...f, [k]: w });
  const speichern = async () => {
    const ok = await props.befehl('einstellung.aendern', {
      felder: {
        index_aktuell: eingabeZahl(f.index_aktuell),
        index_aktuell_stand: f.index_aktuell_stand,
        index_quelle: f.index_quelle,
        regionalfaktor: eingabeZahl(f.regionalfaktor) ?? 1,
        regionalfaktor_quelle: f.regionalfaktor_quelle,
        mwst_satz: eingabeZahl(f.mwst_satz) ?? 0,
        vorsteuerabzug: f.vorsteuerabzug,
      },
    });
    if (ok) props.onSchliessen();
  };
  return (
    <Dialog
      titel="Kosteneinstellungen"
      onSchliessen={props.onSchliessen}
      breite={640}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          {!props.nurLesen && (
            <button className="primaer" onClick={() => void speichern()}>
              Übernehmen
            </button>
          )}
        </>
      }
    >
      <fieldset className="formular" disabled={props.nurLesen}>
        <Feld label="Baupreisindex aktuell" hinweis="in v1 von Hand mit Quelle (Destatis)">
          <input
            value={f.index_aktuell}
            placeholder="z. B. 132,0"
            onChange={(ev) => setze('index_aktuell', ev.target.value)}
          />
        </Feld>
        <Feld label="Stand des Index">
          <input
            value={f.index_aktuell_stand}
            placeholder="z. B. 2026, Q3"
            onChange={(ev) => setze('index_aktuell_stand', ev.target.value)}
          />
        </Feld>
        <Feld label="Quelle des Index" breit>
          <input value={f.index_quelle} onChange={(ev) => setze('index_quelle', ev.target.value)} />
        </Feld>
        <Feld label="Regionalfaktor">
          <input
            value={f.regionalfaktor}
            placeholder="z. B. 1,05"
            onChange={(ev) => setze('regionalfaktor', ev.target.value)}
          />
        </Feld>
        <Feld label="Quelle des Regionalfaktors">
          <input
            value={f.regionalfaktor_quelle}
            placeholder="z. B. Aachen, eigene Quelle"
            onChange={(ev) => setze('regionalfaktor_quelle', ev.target.value)}
          />
        </Feld>
        <Feld label="MwSt.-Satz [%]">
          <input value={f.mwst_satz} onChange={(ev) => setze('mwst_satz', ev.target.value)} />
        </Feld>
        <label className="feld haken">
          <input
            type="checkbox"
            checked={f.vorsteuerabzug}
            onChange={(ev) => setze('vorsteuerabzug', ev.target.checked)}
          />
          Bauherrschaft vorsteuerabzugsberechtigt (netto maßgebend)
        </label>
      </fieldset>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Kostengruppe hinzufügen (E-55)

export function KgDialog(props: {
  daten: KostenDaten;
  /** Vorauswahl: nur Untergruppen dieser KG zeigen */
  unter: number | null;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: (kg: number | null) => void;
}) {
  const [suche, setSuche] = useState('');
  const [nurUnter, setNurUnter] = useState(props.unter !== null);
  const vorhanden = useMemo(() => new Set(props.daten.zeilen.map((z) => z.kg)), [props.daten]);
  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return KG_KATALOG.filter(
      (k) =>
        (!nurUnter || props.unter === null || kgUnter(k.kg, props.unter)) &&
        (!s || `${k.kg} ${k.bezeichnung}`.toLowerCase().includes(s)),
    );
  }, [suche, nurUnter, props.unter]);
  const [wahl, setWahl] = useState<number | null>(null);
  const anlegen = async (kg: number) => {
    if (vorhanden.has(kg)) return;
    if (await props.befehl('zeile.anlegen', { kg })) props.onSchliessen(kg);
  };
  return (
    <Dialog
      titel="Kostengruppe hinzufügen"
      onSchliessen={() => props.onSchliessen(null)}
      breite={640}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          <button onClick={() => props.onSchliessen(null)}>Abbrechen</button>
          <button
            className="primaer"
            disabled={wahl === null || vorhanden.has(wahl)}
            onClick={() => wahl !== null && void anlegen(wahl)}
          >
            Hinzufügen
          </button>
        </>
      }
    >
      <div className="formular">
        <Feld label="Suche (Nummer oder Bezeichnung)" breit>
          <input
            type="search"
            value={suche}
            placeholder="z. B. 331 oder Außenwand"
            onChange={(e) => setSuche(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && treffer.length === 1 && treffer[0])
                void anlegen(treffer[0].kg);
            }}
          />
        </Feld>
        {props.unter !== null && (
          <label className="feld haken breit">
            <input
              type="checkbox"
              checked={nurUnter}
              onChange={(e) => setNurUnter(e.target.checked)}
            />
            nur Untergruppen von KG {props.unter}
          </label>
        )}
        <select
          className="kg-liste breit"
          size={14}
          aria-label="Kostengruppe wählen"
          value={wahl ?? ''}
          onChange={(e) => setWahl(Number(e.target.value))}
          onDoubleClick={() => wahl !== null && void anlegen(wahl)}
        >
          {treffer.map((k) => (
            <option key={k.kg} value={k.kg} disabled={vorhanden.has(k.kg)}>
              {' '.repeat(k.ebene - 1)}
              {k.kg} {k.bezeichnung}
              {vorhanden.has(k.kg) ? ' (vorhanden)' : ''}
            </option>
          ))}
        </select>
      </div>
      <p className="dialog-erklaerung">
        Eine Zeile je Kostengruppe. Übergeordnete Gruppen entstehen automatisch und summieren; gibt
        es Untergruppen, sind diese maßgebend.
      </p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Kostenzeile (E-15, E-16, E-56, E-58)

export function ZeileDialog(props: {
  api: BautaktApi;
  daten: KostenDaten;
  zeile: ZeileBerechnet;
  datenstand: number;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const z = props.zeile;
  const nur = props.nurLesen;
  const eingefroren = !!z.kkw_ref;
  const [f, setF] = useState(() => ({
    bezeichnung: z.bezeichnung,
    menge_quelle: z.menge_quelle === 'flaeche' ? 'flaeche' : 'manuell',
    flaeche: (z.flaeche ?? 'BGF') as Flaeche,
    menge: zahlText(z.menge),
    einheit: z.einheit,
    kkw_von: zahlText(z.kkw_von),
    kkw_mittel: zahlText(z.kkw_mittel),
    kkw_bis: zahlText(z.kkw_bis),
    kkw_gewaehlt: zahlText(z.kkw_gewaehlt),
    kkw_bezeichnung: z.kkw_bezeichnung,
    kkw_quelle: z.kkw_quelle,
    kkw_stand: z.kkw_stand,
    kkw_stand_index: zahlText(z.kkw_stand_index),
    index_modus: z.index_modus as IndexModus,
    index_faktor: zahlText(z.index_faktor),
    index_begruendung: z.index_begruendung,
    kommentar: z.kommentar,
    anmerkung: z.anmerkung,
  }));
  const setze = <K extends keyof typeof f>(k: K, w: (typeof f)[K]) =>
    setF((x) => ({ ...x, [k]: w }));

  // Bibliothek: Kennwerte dieser KG zuerst
  const [kennwerte, setKennwerte] = useState<KennwertZeile[] | null>(null);
  const [kwWahl, setKwWahl] = useState('');
  useEffect(() => {
    void props.api.global
      .abfrage<KennwertZeile[]>('bibliothek', 'kennwerte')
      .then((a) => setKennwerte(a.ok ? a.wert : null));
  }, [props.api, props.datenstand]);
  const passend = useMemo(
    () =>
      [...(kennwerte ?? [])].sort(
        (a, b) =>
          Number(b.kg === z.kg) - Number(a.kg === z.kg) ||
          Number(kgUnter(z.kg, b.kg)) - Number(kgUnter(z.kg, a.kg)) ||
          a.kg - b.kg,
      ),
    [kennwerte, z.kg],
  );

  const felder = () => {
    const g: Record<string, unknown> = {
      bezeichnung: f.bezeichnung,
      menge_quelle: f.menge_quelle,
      einheit: f.einheit,
      kkw_gewaehlt: eingabeZahl(f.kkw_gewaehlt),
      index_modus: f.index_modus,
      index_faktor: f.index_modus === 'eigen' ? eingabeZahl(f.index_faktor) : null,
      index_begruendung: f.index_begruendung,
      kommentar: f.kommentar,
      anmerkung: f.anmerkung,
    };
    if (f.menge_quelle === 'flaeche') g['flaeche'] = f.flaeche;
    else g['menge'] = eingabeZahl(f.menge);
    if (!eingefroren) {
      Object.assign(g, {
        kkw_von: eingabeZahl(f.kkw_von),
        kkw_mittel: eingabeZahl(f.kkw_mittel),
        kkw_bis: eingabeZahl(f.kkw_bis),
        kkw_bezeichnung: f.kkw_bezeichnung,
        kkw_quelle: f.kkw_quelle,
        kkw_stand: f.kkw_stand,
        kkw_stand_index: eingabeZahl(f.kkw_stand_index),
      });
    }
    for (const [k, w] of Object.entries(g))
      if (typeof w === 'number' && Number.isNaN(w)) throw new Error(`Ungültige Zahl im Feld ${k}.`);
    return g;
  };
  const [eigenFehler, setEigenFehler] = useState<string | null>(null);
  const speichern = async () => {
    try {
      setEigenFehler(null);
      if (await props.befehl('zeile.aendern', { id: z.id, felder: felder() })) props.onSchliessen();
    } catch (e) {
      setEigenFehler((e as Error).message);
    }
  };
  const loeschen = async () => {
    if (await props.befehl('zeile.loeschen', { ids: [z.id] })) props.onSchliessen();
  };
  const uebernehmen = async () => {
    const k = kennwerte?.find((x) => x.id === kwWahl);
    if (k)
      await props.befehl('zeile.kennwertUebernehmen', {
        id: z.id,
        kennwertId: k.id,
        version: k.version,
      });
  };
  const neueste = z.kkw_ref ? kennwerte?.find((x) => x.id === z.kkw_ref) : undefined;
  const fehlerText = eigenFehler ?? props.fehler;

  return (
    <Dialog
      titel={`KG ${z.kg} ${z.bezeichnung || z.katalogBezeichnung}`}
      onSchliessen={props.onSchliessen}
      breite={820}
      fuss={
        <>
          {fehlerText && <span className="fehler">{fehlerText}</span>}
          {!nur && <button onClick={() => void loeschen()}>Zeile löschen</button>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          {!nur && (
            <button className="primaer" onClick={() => void speichern()}>
              Übernehmen
            </button>
          )}
        </>
      }
    >
      <fieldset className="formular" disabled={nur}>
        <Feld label="Bezeichnung" breit hinweis={`Katalog: ${z.katalogBezeichnung}`}>
          <input
            value={f.bezeichnung}
            placeholder={z.katalogBezeichnung}
            onChange={(e) => setze('bezeichnung', e.target.value)}
          />
        </Feld>

        <h4 className="breit">Menge</h4>
        <div className="feld breit radio" role="radiogroup" aria-label="Herkunft der Menge">
          <label className="inline">
            <input
              type="radio"
              checked={f.menge_quelle === 'flaeche'}
              onChange={() => setze('menge_quelle', 'flaeche')}
            />
            aus Fläche (DIN 277)
          </label>
          <label className="inline">
            <input
              type="radio"
              checked={f.menge_quelle === 'manuell'}
              onChange={() => setze('menge_quelle', 'manuell')}
            />
            von Hand
          </label>
        </div>
        {f.menge_quelle === 'flaeche' ? (
          <Feld label="Fläche" hinweis={`aktuell ${props.daten.flaechen[f.flaeche] ?? '–'} m²`}>
            <select value={f.flaeche} onChange={(e) => setze('flaeche', e.target.value as Flaeche)}>
              {ALLE_FLAECHEN.map((k) => (
                <option key={k} value={k}>
                  {FLAECHE_TEXT[k]}
                </option>
              ))}
            </select>
          </Feld>
        ) : (
          <Feld label="Menge">
            <input
              inputMode="decimal"
              value={f.menge}
              onChange={(e) => setze('menge', e.target.value)}
            />
          </Feld>
        )}
        <Feld label="Einheit">
          <input value={f.einheit} onChange={(e) => setze('einheit', e.target.value)} />
        </Feld>

        <h4 className="breit">Kostenkennwert (KKW)</h4>
        {kennwerte && kennwerte.length > 0 && !nur && (
          <div className="feld breit">
            <span className="feld-label">
              Aus der Bibliothek übernehmen (friert Werte, Quelle, Stand und Index ein)
            </span>
            <span className="inline">
              <select
                value={kwWahl}
                onChange={(e) => setKwWahl(e.target.value)}
                aria-label="Kennwert wählen"
              >
                <option value="">– Kennwert wählen –</option>
                {passend.map((k) => (
                  <option key={k.id} value={k.id}>
                    KG {k.kg} · {k.bezeichnung} · {betrag(k.mittel)} €/{k.einheit} ({k.quelle}
                    {k.stand ? `, ${k.stand}` : ''})
                  </option>
                ))}
              </select>
              <button type="button" disabled={!kwWahl} onClick={() => void uebernehmen()}>
                Übernehmen
              </button>
            </span>
          </div>
        )}
        {eingefroren && (
          <div className="feld breit kk-eingefroren">
            <span>
              Eingefroren aus der Bibliothek: <strong>{z.kkw_bezeichnung}</strong>, Version{' '}
              {z.kkw_ref_version}
              {neueste && neueste.version > (z.kkw_ref_version ?? 0) && (
                <>
                  {' '}
                  – <strong>Version {neueste.version}</strong> verfügbar (Mittel{' '}
                  {betrag(neueste.mittel)} €).{' '}
                  <button
                    type="button"
                    onClick={() =>
                      void props.befehl('zeile.kennwertUebernehmen', {
                        id: z.id,
                        kennwertId: neueste.id,
                        version: neueste.version,
                      })
                    }
                  >
                    Auf Version {neueste.version} umstellen
                  </button>
                </>
              )}
            </span>
            {!nur && (
              <button
                type="button"
                onClick={() => void props.befehl('zeile.kennwertLoesen', { id: z.id })}
              >
                vom Bibliothekswert lösen
              </button>
            )}
          </div>
        )}
        <fieldset className="formular breit kk-kennwert" disabled={eingefroren || nur}>
          <Feld label="Von [€]">
            <input value={f.kkw_von} onChange={(e) => setze('kkw_von', e.target.value)} />
          </Feld>
          <Feld label="Mittel [€]">
            <input value={f.kkw_mittel} onChange={(e) => setze('kkw_mittel', e.target.value)} />
          </Feld>
          <Feld label="Bis [€]">
            <input value={f.kkw_bis} onChange={(e) => setze('kkw_bis', e.target.value)} />
          </Feld>
          <Feld label="Index zum Stand">
            <input
              value={f.kkw_stand_index}
              placeholder="z. B. 120,0"
              onChange={(e) => setze('kkw_stand_index', e.target.value)}
            />
          </Feld>
          <Feld label="Stand">
            <input value={f.kkw_stand} onChange={(e) => setze('kkw_stand', e.target.value)} />
          </Feld>
          <Feld label="Quelle">
            <input value={f.kkw_quelle} onChange={(e) => setze('kkw_quelle', e.target.value)} />
          </Feld>
        </fieldset>
        <Feld label="KKW gewählt [€/Einheit]" hinweis="mit „Mittel“ vorbelegt, frei wählbar">
          <input
            inputMode="decimal"
            value={f.kkw_gewaehlt}
            onChange={(e) => setze('kkw_gewaehlt', e.target.value)}
          />
        </Feld>

        <h4 className="breit">Indexierung</h4>
        <div className="feld breit radio" role="radiogroup" aria-label="Indexierung">
          {(
            [
              ['index', 'mit Baupreisindex'],
              ['ohne', 'ohne Indexierung'],
              ['eigen', 'eigener Faktor'],
            ] as const
          ).map(([k, t]) => (
            <label className="inline" key={k}>
              <input
                type="radio"
                checked={f.index_modus === k}
                onChange={() => setze('index_modus', k)}
              />
              {t}
            </label>
          ))}
        </div>
        {f.index_modus === 'eigen' && (
          <Feld label="Eigener Faktor">
            <input
              value={f.index_faktor}
              placeholder="z. B. 1,08"
              onChange={(e) => setze('index_faktor', e.target.value)}
            />
          </Feld>
        )}
        {f.index_modus !== 'index' && (
          <Feld label="Begründung (Pflicht, E-56)" breit>
            <input
              value={f.index_begruendung}
              onChange={(e) => setze('index_begruendung', e.target.value)}
            />
          </Feld>
        )}

        <Feld label="Kommentar (erscheint in der Tabelle)" breit>
          <input value={f.kommentar} onChange={(e) => setze('kommentar', e.target.value)} />
        </Feld>
        <Feld label="Anmerkung/Begründung" breit>
          <textarea
            rows={2}
            value={f.anmerkung}
            onChange={(e) => setze('anmerkung', e.target.value)}
          />
        </Feld>

        <div className="feld breit">
          <span className="feld-label">Rechenweg (gespeicherter Stand)</span>
          <code className="formelzeile">
            {rechenweg(z, props.daten.einstellung.regionalfaktor)}
          </code>
          {z.hinweise.map((h) => (
            <span key={h} className="feld-hinweis tp-warnung">
              ⚠ {h}
            </span>
          ))}
        </div>
      </fieldset>
    </Dialog>
  );
}
