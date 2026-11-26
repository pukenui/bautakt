import type { BautaktApi } from '@bautakt/kern/vertrag';
import type { AufwandswertZeile } from '@bautakt/plugin-bibliothek/typen';
import {
  aufwandRechnen,
  ZUSCHLAG_VORSCHLAEGE,
  zahlDeutsch,
  zahlLesen,
  type AufwandErgebnis,
} from '@bautakt/rechnen-aufwand';
import { Dialog } from '@bautakt/ui';
import { useEffect, useMemo, useState } from 'react';
import type { AufwandZeile, AufwandZuschlag, PlanDaten } from '../gemeinsam/typen.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

const KOLONNE = 'bautakt.termine.kolonne';

/** Zuletzt genutzte Kolonne (AK, h/AT) als Vorschlag; Übung: 4 AK × 8 h. */
function kolonneLaden(): { ak: string; h: string } {
  try {
    const k = JSON.parse(localStorage.getItem(KOLONNE) ?? '') as { ak: string; h: string };
    if (k.ak && k.h) return k;
  } catch {
    // Standard
  }
  return { ak: '4', h: '8' };
}

const awText = (h: number, einheit: string) => `${zahlDeutsch(h, 2, 3)} h/${einheit}`;

/**
 * Aufwandswert-Rechner (E-24, E-53, E-54): Dauer aus Menge, Aufwandswert, Kolonne und
 * Zu-/Abschlägen. Gespeichert werden Formelzeile, Eingaben und die eingefrorene Kopie.
 */
export function AufwandDialog(props: {
  api: BautaktApi;
  daten: PlanDaten;
  vorgangId: string;
  datenstand: number;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const v = props.daten.vorgaenge.find((x) => x.id === props.vorgangId);
  const [geladen, setGeladen] = useState(false);
  const [alt, setAlt] = useState<AufwandZeile | null>(null);
  const [bibliothek, setBibliothek] = useState<AufwandswertZeile[] | null>(null);
  const [suche, setSuche] = useState('');
  const [eigenFehler, setEigenFehler] = useState<string | null>(null);
  const kolonne = useMemo(() => kolonneLaden(), []);
  const [f, setF] = useState({
    art: 'bibliothek' as 'bibliothek' | 'eigen',
    bibId: '',
    bibVersion: 0,
    bezeichnung: '',
    einheit: 'm²',
    aw: '',
    quelle: '',
    stand: '',
    inBibliothek: false,
    menge: '',
    ak: kolonne.ak,
    h: kolonne.h,
    zuschlaege: [] as { name: string; prozent: string }[],
  });
  const setze = <K extends keyof typeof f>(k: K, w: (typeof f)[K]) =>
    setF((x) => ({ ...x, [k]: w }));

  // vorhandene Herleitung und Bibliothek laden
  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const [a, b] = await Promise.all([
        props.api.abfrage<{ aufwand: AufwandZeile | null; aktuelleVersion: number | null }>(
          'termine',
          'aufwand',
          { vorgangId: props.vorgangId },
        ),
        props.api.global.abfrage<AufwandswertZeile[]>('bibliothek', 'aufwandswerte'),
      ]);
      if (!aktiv) return;
      setBibliothek(b.ok ? b.wert : null);
      const z = a.ok ? a.wert.aufwand : null;
      if (z && !geladen) {
        setAlt(z);
        const zuschlaege = JSON.parse(z.zuschlaege) as AufwandZuschlag[];
        setF((x) => ({
          ...x,
          art: z.bib_id ? 'bibliothek' : 'eigen',
          bibId: z.bib_id ?? '',
          bibVersion: z.bib_version ?? 0,
          bezeichnung: z.bezeichnung,
          einheit: z.einheit,
          aw: zahlDeutsch(z.h_je_me, 0, 4),
          quelle: z.quelle,
          stand: z.stand,
          menge: zahlDeutsch(z.menge, 0, 4).replace(/\./g, ''),
          ak: zahlDeutsch(z.ak, 0, 2),
          h: zahlDeutsch(z.h_je_at, 0, 2),
          zuschlaege: zuschlaege.map((s) => ({ name: s.name, prozent: zahlDeutsch(s.prozent) })),
        }));
      } else if (!z && !b.ok) setF((x) => ({ ...x, art: 'eigen' }));
      setGeladen(true);
    })();
    return () => {
      aktiv = false;
    };
    // nur beim Öffnen bzw. nach Datenänderung laden
  }, [props.api, props.vorgangId, props.datenstand]); // eslint-disable-line react-hooks/exhaustive-deps

  // gewählter Bibliothekswert: eingefrorene Kopie (gleiche Version) oder aktuelle Version
  const bibWert = useMemo(() => {
    if (f.art !== 'bibliothek' || !f.bibId) return null;
    if (alt && alt.bib_id === f.bibId && alt.bib_version === f.bibVersion)
      return {
        bezeichnung: alt.bezeichnung,
        einheit: alt.einheit,
        h_je_me: alt.h_je_me,
        quelle: alt.quelle,
        stand: alt.stand,
        version: f.bibVersion,
      };
    const w = bibliothek?.find((x) => x.id === f.bibId);
    return w ? { ...w } : null;
  }, [f.art, f.bibId, f.bibVersion, alt, bibliothek]);
  const neueste = bibliothek?.find((x) => x.id === f.bibId);

  const einheit = f.art === 'bibliothek' ? (bibWert?.einheit ?? 'ME') : f.einheit || 'ME';
  const aw = f.art === 'bibliothek' ? (bibWert?.h_je_me ?? Number.NaN) : zahlLesen(f.aw);
  const zuschlaege: AufwandZuschlag[] = f.zuschlaege
    .filter((z) => z.name.trim() || z.prozent.trim())
    .map((z) => ({ name: z.name.trim(), prozent: zahlLesen(z.prozent) }));

  let ergebnis: AufwandErgebnis | null = null;
  let rechenfehler: string | null = null;
  if (f.art === 'bibliothek' && !bibWert) rechenfehler = 'Bitte einen Aufwandswert wählen.';
  else if (!f.menge.trim()) rechenfehler = 'Bitte die Menge eingeben.';
  else {
    try {
      ergebnis = aufwandRechnen({
        menge: zahlLesen(f.menge),
        einheit,
        aw,
        ak: zahlLesen(f.ak),
        hJeAt: zahlLesen(f.h),
        zuschlaege,
      });
    } catch (e) {
      rechenfehler = (e as Error).message;
    }
  }

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return (bibliothek ?? []).filter(
      (w) => !s || `${w.bezeichnung} ${w.gewerk} ${w.quelle}`.toLowerCase().includes(s),
    );
  }, [bibliothek, suche]);

  if (!v) return null;

  const uebernehmen = async () => {
    if (!ergebnis) return;
    try {
      localStorage.setItem(KOLONNE, JSON.stringify({ ak: f.ak, h: f.h }));
    } catch {
      // ohne Speicher geht es trotzdem
    }
    setEigenFehler(null);
    let wert: unknown;
    if (f.art === 'bibliothek') wert = { art: 'bibliothek', id: f.bibId, version: f.bibVersion };
    else if (f.inBibliothek) {
      // eigenen Wert zuerst in die Bibliothek aufnehmen, dann mit Bezug übernehmen
      const a = await props.api.global.aktion<{ id: string; version: number }>(
        'bibliothek',
        'aufwandswert.anlegen',
        {
          bezeichnung: f.bezeichnung,
          gewerk: v.gewerk,
          einheit: f.einheit,
          h_je_me: aw,
          quelle: f.quelle,
          stand: f.stand,
        },
      );
      if (!a.ok) return setEigenFehler(a.fehler);
      wert = { art: 'bibliothek', id: a.wert.id, version: a.wert.version };
    } else
      wert = {
        art: 'eigen',
        bezeichnung: f.bezeichnung,
        einheit: f.einheit,
        h_je_me: aw,
        quelle: f.quelle,
        stand: f.stand,
      };
    const ok = await props.befehl('aufwand.uebernehmen', {
      vorgangId: v.id,
      menge: zahlLesen(f.menge),
      ak: zahlLesen(f.ak),
      h_je_at: zahlLesen(f.h),
      zuschlaege,
      wert,
    });
    if (ok) props.onSchliessen();
  };

  const entfernen = async () => {
    if (await props.befehl('aufwand.entfernen', { vorgangId: v.id })) props.onSchliessen();
  };

  const nur = props.nurLesen;
  return (
    <Dialog
      titel={`Aufwandswert-Rechner – ${v.nr} ${v.name}`}
      onSchliessen={props.onSchliessen}
      breite={780}
      fuss={
        <>
          {(eigenFehler ?? props.fehler) && (
            <span className="fehler">{eigenFehler ?? props.fehler}</span>
          )}
          {alt && !nur && (
            <button
              onClick={() => void entfernen()}
              title="Formelzeile und Eingaben entfernen; die Dauer bleibt"
            >
              Herleitung entfernen
            </button>
          )}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          {!nur && (
            <button className="primaer" disabled={!ergebnis} onClick={() => void uebernehmen()}>
              {ergebnis ? `Dauer ${ergebnis.dauer} AT übernehmen` : 'Dauer übernehmen'}
            </button>
          )}
        </>
      }
    >
      {v.typ !== 'vorgang' ? (
        <p className="tp-warnung">Nur Einzelvorgänge haben eine Dauer aus Aufwandswerten.</p>
      ) : (
        <fieldset disabled={nur} className="formular aw-formular">
          <div
            className="feld breit radio"
            role="radiogroup"
            aria-label="Herkunft des Aufwandswerts"
          >
            <label className="inline">
              <input
                type="radio"
                checked={f.art === 'bibliothek'}
                disabled={!bibliothek}
                onChange={() => setze('art', 'bibliothek')}
              />
              aus der Bibliothek
            </label>
            <label className="inline">
              <input
                type="radio"
                checked={f.art === 'eigen'}
                onChange={() => setze('art', 'eigen')}
              />
              eigener Wert
            </label>
          </div>

          {f.art === 'bibliothek' ? (
            <div className="feld breit">
              <span className="feld-label">Aufwandswert</span>
              {bibliothek && bibliothek.length === 0 ? (
                <span className="leise">
                  Die Bibliothek ist noch leer – Werte im Reiter <strong>Bibliothek</strong> anlegen
                  oder einen eigenen Wert eingeben.
                </span>
              ) : (
                <>
                  <input
                    type="search"
                    placeholder="Suchen …"
                    aria-label="Aufwandswert suchen"
                    value={suche}
                    onChange={(e) => setSuche(e.target.value)}
                  />
                  <select
                    size={Math.min(6, Math.max(2, treffer.length))}
                    aria-label="Aufwandswert wählen"
                    value={f.bibId}
                    onChange={(e) => {
                      const w = bibliothek?.find((x) => x.id === e.target.value);
                      if (w) setF((x) => ({ ...x, bibId: w.id, bibVersion: w.version }));
                    }}
                  >
                    {treffer.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.bezeichnung} – {awText(w.h_je_me, w.einheit)} ({w.quelle}
                        {w.stand ? `, ${w.stand}` : ''})
                      </option>
                    ))}
                  </select>
                </>
              )}
              {bibWert && (
                <span className="feld-hinweis">
                  Verwendet: <strong>{awText(bibWert.h_je_me, bibWert.einheit)}</strong>, Version{' '}
                  {bibWert.version} – {bibWert.quelle}
                  {bibWert.stand ? `, ${bibWert.stand}` : ''}
                  {alt?.bib_id === f.bibId && alt.bib_version === f.bibVersion && ' (eingefroren)'}
                </span>
              )}
              {neueste && neueste.version > f.bibVersion && (
                <span className="aw-hinweis">
                  In der Bibliothek gibt es Version {neueste.version} (
                  {awText(neueste.h_je_me, neueste.einheit)}).{' '}
                  <button
                    type="button"
                    onClick={() => setF((x) => ({ ...x, bibVersion: neueste.version }))}
                  >
                    Auf Version {neueste.version} umstellen
                  </button>
                </span>
              )}
              {!neueste && alt?.bib_id === f.bibId && f.bibId && (
                <span className="feld-hinweis">
                  Der Eintrag ist in der Bibliothek gelöscht oder nicht verfügbar; die eingefrorene
                  Kopie bleibt gültig.
                </span>
              )}
            </div>
          ) : (
            <>
              <label className="feld breit">
                <span className="feld-label">Bezeichnung</span>
                <input
                  value={f.bezeichnung}
                  placeholder="z. B. Montage Fertigteilstützen"
                  onChange={(e) => setze('bezeichnung', e.target.value)}
                />
              </label>
              <label className="feld">
                <span className="feld-label">Aufwandswert [h/{f.einheit || 'ME'}]</span>
                <input
                  inputMode="decimal"
                  value={f.aw}
                  placeholder="z. B. 2,0"
                  onChange={(e) => setze('aw', e.target.value)}
                />
              </label>
              <label className="feld">
                <span className="feld-label">Mengeneinheit</span>
                <input
                  list="aw-einheiten"
                  value={f.einheit}
                  onChange={(e) => setze('einheit', e.target.value)}
                />
                <datalist id="aw-einheiten">
                  {['m²', 'm³', 'm', 'Stk', 't', 'kg'].map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>
              <label className="feld">
                <span className="feld-label">Quelle (Pflicht)</span>
                <input value={f.quelle} onChange={(e) => setze('quelle', e.target.value)} />
              </label>
              <label className="feld">
                <span className="feld-label">Stand</span>
                <input value={f.stand} onChange={(e) => setze('stand', e.target.value)} />
              </label>
              {bibliothek && (
                <label className="feld haken breit">
                  <input
                    type="checkbox"
                    checked={f.inBibliothek}
                    onChange={(e) => setze('inBibliothek', e.target.checked)}
                  />
                  auch in die Bibliothek aufnehmen
                </label>
              )}
            </>
          )}

          <label className="feld">
            <span className="feld-label">Menge [{einheit}]</span>
            <input
              inputMode="decimal"
              autoFocus
              value={f.menge}
              onChange={(e) => setze('menge', e.target.value)}
            />
          </label>
          <label className="feld">
            <span className="feld-label">Arbeitskräfte (AK)</span>
            <input inputMode="decimal" value={f.ak} onChange={(e) => setze('ak', e.target.value)} />
          </label>
          <label className="feld">
            <span className="feld-label">Arbeitszeit [h/AT]</span>
            <input inputMode="decimal" value={f.h} onChange={(e) => setze('h', e.target.value)} />
          </label>

          <div className="feld breit">
            <span className="feld-label">Zu-/Abschläge [%] (werden addiert; Abschlag negativ)</span>
            {f.zuschlaege.map((z, i) => (
              <span className="inline aw-zuschlag" key={i}>
                <input
                  list="aw-zuschlaege"
                  aria-label="Bezeichnung des Zu-/Abschlags"
                  value={z.name}
                  placeholder="z. B. Winterbau"
                  onChange={(e) =>
                    setze(
                      'zuschlaege',
                      f.zuschlaege.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <input
                  inputMode="decimal"
                  aria-label="Prozent"
                  className="aw-prozent"
                  value={z.prozent}
                  placeholder="+15 / −5"
                  onChange={(e) =>
                    setze(
                      'zuschlaege',
                      f.zuschlaege.map((x, j) => (j === i ? { ...x, prozent: e.target.value } : x)),
                    )
                  }
                />
                %
                <button
                  type="button"
                  aria-label="Zu-/Abschlag entfernen"
                  onClick={() =>
                    setze(
                      'zuschlaege',
                      f.zuschlaege.filter((_, j) => j !== i),
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <datalist id="aw-zuschlaege">
              {ZUSCHLAG_VORSCHLAEGE.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
            <span>
              <button
                type="button"
                onClick={() => setze('zuschlaege', [...f.zuschlaege, { name: '', prozent: '' }])}
              >
                + Zu-/Abschlag
              </button>
            </span>
          </div>

          <div className="feld breit">
            <span className="feld-label">Rechenweg</span>
            {ergebnis ? (
              <code className="formelzeile">{ergebnis.formel}</code>
            ) : (
              <span className="leise">{rechenfehler}</span>
            )}
            {ergebnis && ergebnis.dauer !== v.dauer_at && (
              <span className="feld-hinweis">
                Aktuelle Dauer des Vorgangs: {v.dauer_at} AT → wird {ergebnis.dauer} AT.
              </span>
            )}
          </div>
        </fieldset>
      )}
    </Dialog>
  );
}
