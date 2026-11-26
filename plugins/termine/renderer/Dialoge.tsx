import { datumVonTag, tagVonDatum, WOCHENTAG_KURZ } from '@bautakt/rechnen-kalender';
import type { Art, Einheit } from '@bautakt/rechnen-termine';
import { Dialog } from '@bautakt/ui';
import { useState, type ReactNode } from 'react';
import type { BedingungTyp, PlanDaten, VorgangFelder, VorgangTyp } from '../gemeinsam/typen.js';
import { ART_TEXT, datumKurz } from './daten.js';

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

function Feld(props: { label: string; children: ReactNode; hinweis?: string; breit?: boolean }) {
  return (
    <label className={`feld${props.breit ? ' breit' : ''}`}>
      <span className="feld-label">{props.label}</span>
      {props.children}
      {props.hinweis && <span className="feld-hinweis">{props.hinweis}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------------------------
// Vorgang (E-13, E-19)

export function VorgangDialog(props: {
  daten: PlanDaten;
  vorgangId: string;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onBeziehungen: () => void;
  /** Aufwandswert-Rechner öffnen (E-24). */
  onAufwand?: () => void;
  onSchliessen: () => void;
}) {
  const v = props.daten.vorgaenge.find((x) => x.id === props.vorgangId);
  const aw = props.daten.aufwand[props.vorgangId];
  const [f, setF] = useState(() => ({
    nr: v?.nr ?? '',
    name: v?.name ?? '',
    typ: (v?.typ ?? 'vorgang') as VorgangTyp,
    dauer_at: String(v?.dauer_at ?? 0),
    quelle_annahme: v?.quelle_annahme ?? '',
    anmerkung: v?.anmerkung ?? '',
    gewerk: v?.gewerk ?? '',
    rolle: v?.rolle ?? '',
    risiko: v?.risiko ?? '',
    info_braucht: v?.info_braucht ?? '',
    info_liefert: v?.info_liefert ?? '',
    bedingung_typ: (v?.bedingung_typ ?? 'keine') as BedingungTyp,
    bedingung_datum: v?.bedingung_datum ?? '',
    schnittstelle: !!v?.schnittstelle,
  }));
  if (!v) return null;
  const t = props.daten.berechnung.ok ? props.daten.berechnung.termine[v.id] : undefined;
  const setze = <K extends keyof typeof f>(k: K, w: (typeof f)[K]) => setF({ ...f, [k]: w });

  const speichern = async () => {
    const felder: VorgangFelder = {};
    const text = [
      'nr',
      'name',
      'quelle_annahme',
      'anmerkung',
      'gewerk',
      'rolle',
      'risiko',
      'info_braucht',
      'info_liefert',
    ] as const;
    for (const k of text) if (f[k] !== v[k]) felder[k] = f[k];
    if (f.typ !== v.typ) felder.typ = f.typ;
    if (f.typ === 'vorgang' && Number(f.dauer_at) !== v.dauer_at)
      felder.dauer_at = Number(f.dauer_at.replace(',', '.'));
    if (f.bedingung_typ !== v.bedingung_typ) felder.bedingung_typ = f.bedingung_typ;
    const datum = f.bedingung_typ === 'keine' ? null : f.bedingung_datum || null;
    if (datum !== v.bedingung_datum) felder.bedingung_datum = datum;
    if (Number(f.schnittstelle) !== v.schnittstelle) felder.schnittstelle = f.schnittstelle ? 1 : 0;
    if (Object.keys(felder).length === 0) return props.onSchliessen();
    if (await props.befehl('vorgang.aendern', { id: v.id, felder })) props.onSchliessen();
  };

  const nur = props.nurLesen;
  return (
    <Dialog
      titel={`Vorgang ${v.nr} – Eigenschaften`}
      onSchliessen={props.onSchliessen}
      breite={720}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          {v.typ !== 'sammel' && <button onClick={props.onBeziehungen}>Vorgänger …</button>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          {!nur && (
            <button className="primaer" onClick={() => void speichern()}>
              Übernehmen
            </button>
          )}
        </>
      }
    >
      <fieldset disabled={nur} className="formular">
        <Feld label="Nr.">
          <input value={f.nr} onChange={(e) => setze('nr', e.target.value)} />
        </Feld>
        <Feld label="Name (Pflicht)" breit>
          <input value={f.name} onChange={(e) => setze('name', e.target.value)} />
        </Feld>
        <Feld label="Typ">
          <select value={f.typ} onChange={(e) => setze('typ', e.target.value as VorgangTyp)}>
            <option value="vorgang">Vorgang</option>
            <option value="meilenstein">Meilenstein</option>
            <option value="sammel">Sammelvorgang</option>
          </select>
        </Feld>
        <Feld
          label="Dauer [AT] (Pflicht)"
          hinweis={
            f.typ === 'sammel'
              ? 'ergibt sich aus den Unterpunkten'
              : f.typ === 'meilenstein'
                ? 'Meilensteine haben die Dauer 0'
                : undefined
          }
        >
          <span className="inline">
            <input
              inputMode="numeric"
              value={f.typ === 'vorgang' ? f.dauer_at : '0'}
              disabled={f.typ !== 'vorgang'}
              onChange={(e) => setze('dauer_at', e.target.value)}
            />
            {props.onAufwand && v.typ === 'vorgang' && (
              <button
                type="button"
                onClick={props.onAufwand}
                title="Dauer mit dem Aufwandswert-Rechner herleiten (Menge × AW ÷ Kolonne)"
              >
                Herleiten …
              </button>
            )}
          </span>
        </Feld>
        <Feld
          label="Quelle/Annahme (Pflicht)"
          breit
          hinweis={
            !f.quelle_annahme.trim() && f.typ !== 'sammel'
              ? '⚠ Bitte angeben, woher die Dauer stammt (z. B. Aufwandswert, Erfahrung, Vorgabe).'
              : undefined
          }
        >
          <input
            value={f.quelle_annahme}
            onChange={(e) => setze('quelle_annahme', e.target.value)}
          />
        </Feld>
        {v.dauer_herleitung && (
          <Feld label="Herleitung der Dauer" breit>
            <code className="formelzeile">{v.dauer_herleitung}</code>
            {aw && aw.dauer !== v.dauer_at && (
              <span className="feld-hinweis tp-warnung">
                ⚠ Die Dauer ({v.dauer_at} AT) weicht von der Herleitung ({aw.dauer} AT) ab.
              </span>
            )}
            {aw?.neuereVersion && (
              <span className="feld-hinweis tp-warnung">
                ⚠ In der Bibliothek gibt es Version {aw.neuereVersion} des Aufwandswerts (verwendet:
                Version {aw.bibVersion}). Umstellen über „Herleiten …“.
              </span>
            )}
          </Feld>
        )}
        <Feld label="Anmerkung/Begründung" breit>
          <textarea
            rows={2}
            value={f.anmerkung}
            onChange={(e) => setze('anmerkung', e.target.value)}
          />
        </Feld>
        <Feld label="Gewerk">
          <input value={f.gewerk} onChange={(e) => setze('gewerk', e.target.value)} />
        </Feld>
        <Feld label="Rolle/verantwortlich">
          <input value={f.rolle} onChange={(e) => setze('rolle', e.target.value)} />
        </Feld>
        <Feld label="braucht (Information)" breit>
          <input value={f.info_braucht} onChange={(e) => setze('info_braucht', e.target.value)} />
        </Feld>
        <Feld label="liefert (Information)" breit>
          <input value={f.info_liefert} onChange={(e) => setze('info_liefert', e.target.value)} />
        </Feld>
        <Feld label="Risiko-Kommentar (wird im Plan angezeigt)" breit>
          <textarea rows={2} value={f.risiko} onChange={(e) => setze('risiko', e.target.value)} />
        </Feld>
        {f.typ !== 'sammel' && (
          <>
            <Feld label="Bedingung">
              <select
                value={f.bedingung_typ}
                onChange={(e) => setze('bedingung_typ', e.target.value as BedingungTyp)}
              >
                <option value="keine">keine</option>
                <option value="nicht_frueher_als">nicht früher als</option>
                <option value="muss_enden_am">muss enden am</option>
              </select>
            </Feld>
            <Feld label="Datum der Bedingung">
              <input
                type="date"
                value={f.bedingung_datum}
                disabled={f.bedingung_typ === 'keine'}
                onChange={(e) => setze('bedingung_datum', e.target.value)}
              />
            </Feld>
            <label className="feld haken breit">
              <input
                type="checkbox"
                checked={f.schnittstelle}
                onChange={(e) => setze('schnittstelle', e.target.checked)}
              />
              Schnittstellentermin (im Balkenplan farbig hervorgehoben)
            </label>
          </>
        )}
      </fieldset>
      {t && (
        <table className="termintabelle">
          <tbody>
            <tr>
              <th>FAZ</th>
              <td>{t.faz}</td>
              <th>FEZ</th>
              <td>{t.fez}</td>
              <th>Anfang</th>
              <td>{datumKurz(t.anfang)}</td>
              <th>Ende</th>
              <td>{datumKurz(t.ende)}</td>
            </tr>
            <tr>
              <th>SAZ</th>
              <td>{t.saz}</td>
              <th>SEZ</th>
              <td>{t.sez}</td>
              <th>GP</th>
              <td className={t.gp < 0 ? 'negativ' : ''}>{t.gp}</td>
              <th>FP</th>
              <td>{t.fp ?? '–'}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Beziehungen in Langform (E-28)

export function BeziehungDialog(props: {
  daten: PlanDaten;
  vorgangId: string;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const { daten } = props;
  const v = daten.vorgaenge.find((x) => x.id === props.vorgangId);
  const kandidaten = daten.vorgaenge.filter((x) => x.typ !== 'sammel' && x.id !== props.vorgangId);
  const [neu, setNeu] = useState<{ von: string; art: Art; abstand: string; einheit: Einheit }>({
    von: kandidaten[0]?.id ?? '',
    art: 'EA',
    abstand: '0',
    einheit: 'AT',
  });
  if (!v) return null;
  const liste = daten.beziehungen.filter((b) => b.nach_id === v.id);
  const nameVon = (id: string) => {
    const x = daten.vorgaenge.find((y) => y.id === id);
    return x ? `${x.nr} ${x.name}` : '?';
  };
  const zahl = (s: string) => Number(s.replace('−', '-'));

  const auswahlVorgaenger = (wert: string, onChange: (id: string) => void) => (
    <select value={wert} onChange={(e) => onChange(e.target.value)} aria-label="Vorgänger">
      {kandidaten.map((k) => (
        <option key={k.id} value={k.id}>
          {k.nr} {k.name}
        </option>
      ))}
    </select>
  );
  const auswahlArt = (wert: Art, onChange: (a: Art) => void) => (
    <select value={wert} onChange={(e) => onChange(e.target.value as Art)} aria-label="Art">
      {(Object.keys(ART_TEXT) as Art[]).map((a) => (
        <option key={a} value={a}>
          {ART_TEXT[a]}
        </option>
      ))}
    </select>
  );
  const auswahlEinheit = (wert: Einheit, onChange: (e: Einheit) => void) => (
    <select value={wert} onChange={(e) => onChange(e.target.value as Einheit)} aria-label="Einheit">
      <option value="AT">Arbeitstage (AT)</option>
      <option value="KT">Kalendertage (KT)</option>
    </select>
  );

  return (
    <Dialog
      titel={`Vorgänger von ${v.nr} ${v.name}`}
      onSchliessen={props.onSchliessen}
      breite={780}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          <button className="primaer" onClick={props.onSchliessen}>
            Schließen
          </button>
        </>
      }
    >
      <p className="dialog-erklaerung">
        Jede Zeile: Der Vorgänger muss …, bevor dieser Vorgang … Abstand positiv = Wartezeit,
        negativ = Überlappung. Kalendertage laufen auch am Wochenende (z. B. Ausschalfristen).
      </p>
      <fieldset disabled={props.nurLesen} className="beziehungsliste">
        {liste.length === 0 && <p className="leise">Noch keine Vorgänger.</p>}
        {liste.map((b) => (
          <div key={b.id} className="beziehungszeile">
            {auswahlVorgaenger(
              b.von_id,
              (von) =>
                void props.befehl('beziehung.aendern', {
                  id: b.id,
                  von,
                  art: b.art,
                  abstand: b.abstand,
                  einheit: b.einheit,
                }),
            )}
            {auswahlArt(
              b.art,
              (art) =>
                void props.befehl('beziehung.aendern', {
                  id: b.id,
                  von: b.von_id,
                  art,
                  abstand: b.abstand,
                  einheit: b.einheit,
                }),
            )}
            <input
              aria-label="Abstand"
              defaultValue={String(b.abstand)}
              inputMode="numeric"
              onBlur={(e) => {
                const abstand = zahl(e.target.value);
                if (abstand !== b.abstand)
                  void props.befehl('beziehung.aendern', {
                    id: b.id,
                    von: b.von_id,
                    art: b.art,
                    abstand,
                    einheit: b.einheit,
                  });
              }}
            />
            {auswahlEinheit(
              b.einheit,
              (einheit) =>
                void props.befehl('beziehung.aendern', {
                  id: b.id,
                  von: b.von_id,
                  art: b.art,
                  abstand: b.abstand,
                  einheit,
                }),
            )}
            <button
              onClick={() => void props.befehl('beziehung.loeschen', { id: b.id })}
              title={`Beziehung zu ${nameVon(b.von_id)} entfernen`}
            >
              Entfernen
            </button>
          </div>
        ))}
        {kandidaten.length > 0 && (
          <div className="beziehungszeile neu">
            {auswahlVorgaenger(neu.von, (von) => setNeu({ ...neu, von }))}
            {auswahlArt(neu.art, (art) => setNeu({ ...neu, art }))}
            <input
              aria-label="Abstand"
              value={neu.abstand}
              inputMode="numeric"
              onChange={(e) => setNeu({ ...neu, abstand: e.target.value })}
            />
            {auswahlEinheit(neu.einheit, (einheit) => setNeu({ ...neu, einheit }))}
            <button
              className="primaer"
              onClick={async () => {
                const ok = await props.befehl('beziehung.anlegen', {
                  von: neu.von,
                  nach: v.id,
                  art: neu.art,
                  abstand: zahl(neu.abstand),
                  einheit: neu.einheit,
                });
                if (ok) setNeu({ ...neu, abstand: '0' });
              }}
            >
              Hinzufügen
            </button>
          </div>
        )}
      </fieldset>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Plan, Kalender, Ruhezeiten (E-12, E-19)

function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split('-').map(Number) as [number, number, number];
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  // Ende = Tag vor dem gleichen Kalendertag n Monate später
  const tag = Math.min(t, letzter);
  return datumVonTag(
    tagVonDatum(
      `${ziel.getUTCFullYear()}-${String(ziel.getUTCMonth() + 1).padStart(2, '0')}-${String(tag).padStart(2, '0')}`,
    ) - 1,
  );
}

export function PlanDialog(props: {
  daten: PlanDaten;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  onSchliessen: () => void;
}) {
  const { plan, kalender, ruhezeiten } = props.daten;
  const [f, setF] = useState({
    name: plan.name,
    art: plan.art,
    projektstart: plan.projektstart ?? '',
    soll_ende: plan.soll_ende ?? '',
    rueckwaerts_von: plan.rueckwaerts_von,
    monate: '15',
  });
  const [ruhe, setRuhe] = useState({ von: '', bis: '', name: '' });

  const uebernehmen = async () => {
    const d: Record<string, unknown> = { id: plan.id };
    if (f.name !== plan.name) d['name'] = f.name;
    if (f.art !== plan.art) d['art'] = f.art;
    if (f.projektstart && f.projektstart !== plan.projektstart) d['projektstart'] = f.projektstart;
    if ((f.soll_ende || null) !== plan.soll_ende) d['soll_ende'] = f.soll_ende || null;
    if (f.rueckwaerts_von !== plan.rueckwaerts_von) d['rueckwaerts_von'] = f.rueckwaerts_von;
    if (Object.keys(d).length === 1) return props.onSchliessen();
    if (await props.befehl('plan.aendern', d)) props.onSchliessen();
  };

  return (
    <Dialog
      titel="Planeinstellungen"
      onSchliessen={props.onSchliessen}
      breite={760}
      fuss={
        <>
          {props.fehler && <span className="fehler">{props.fehler}</span>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          {!props.nurLesen && (
            <button className="primaer" onClick={() => void uebernehmen()}>
              Übernehmen
            </button>
          )}
        </>
      }
    >
      <fieldset disabled={props.nurLesen} className="formular">
        <Feld label="Name des Plans" breit>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Feld>
        <Feld label="Art">
          <select value={f.art} onChange={(e) => setF({ ...f, art: e.target.value })}>
            <option value="bauablauf">Bauablauf / Terminplan</option>
            <option value="rollen">Rollen und Informationsbedarfe</option>
            <option value="frei">frei</option>
          </select>
        </Feld>
        <Feld label="Projektstart (AT 1 = erster Arbeitstag ab hier)">
          <input
            type="date"
            value={f.projektstart}
            onChange={(e) => setF({ ...f, projektstart: e.target.value })}
          />
        </Feld>
        <Feld label="Soll-Ende" hinweis="leer = kein Soll-Ende">
          <input
            type="date"
            value={f.soll_ende}
            onChange={(e) => setF({ ...f, soll_ende: e.target.value })}
          />
        </Feld>
        <div className="feld">
          <span className="feld-label">Soll-Ende aus Dauer</span>
          <span className="inline">
            Start +
            <input
              className="kurz"
              value={f.monate}
              inputMode="numeric"
              onChange={(e) => setF({ ...f, monate: e.target.value })}
              aria-label="Monate"
            />
            Monate
            <button
              type="button"
              onClick={() =>
                f.projektstart &&
                Number(f.monate) > 0 &&
                setF({ ...f, soll_ende: plusMonate(f.projektstart, Number(f.monate)) })
              }
            >
              setzen
            </button>
          </span>
        </div>
        <fieldset className="feld breit radio">
          <legend className="feld-label">Rückwärtsrechnung</legend>
          <label>
            <input
              type="radio"
              checked={f.rueckwaerts_von === 'berechnet'}
              onChange={() => setF({ ...f, rueckwaerts_von: 'berechnet' })}
            />
            vom berechneten Ende (Standard, wie in der Übung)
          </label>
          <label>
            <input
              type="radio"
              checked={f.rueckwaerts_von === 'soll_ende'}
              onChange={() => setF({ ...f, rueckwaerts_von: 'soll_ende' })}
            />
            vom Soll-Ende – zeigt negative Puffer, wenn das Soll-Ende nicht erreicht wird
          </label>
        </fieldset>
      </fieldset>

      <h3>Arbeitskalender</h3>
      <fieldset disabled={props.nurLesen} className="kalender">
        <div className="wochentage">
          {WOCHENTAG_KURZ.map((w, i) => (
            <label key={w}>
              <input
                type="checkbox"
                checked={kalender.arbeitstage[i] ?? false}
                onChange={(e) => {
                  const a = [...kalender.arbeitstage];
                  a[i] = e.target.checked;
                  void props.befehl('kalender.aendern', { id: kalender.id, arbeitstage: a });
                }}
              />
              {w}
            </label>
          ))}
          <label className="abstand-links">
            <input
              type="checkbox"
              checked={kalender.bundesland === 'NW'}
              onChange={(e) =>
                void props.befehl('kalender.aendern', {
                  id: kalender.id,
                  bundesland: e.target.checked ? 'NW' : null,
                })
              }
            />
            gesetzliche Feiertage NRW
          </label>
        </div>

        <h4>Ruhezeiten (z. B. Weihnachtspause, Winterbau)</h4>
        <table className="ruhezeiten">
          <thead>
            <tr>
              <th>von</th>
              <th>bis</th>
              <th>Bezeichnung</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ruhezeiten.map((r) => (
              <tr key={r.id}>
                <td>{datumKurz(r.von)}</td>
                <td>{datumKurz(r.bis)}</td>
                <td>{r.name}</td>
                <td>
                  <button onClick={() => void props.befehl('ruhezeit.loeschen', { id: r.id })}>
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input
                  type="date"
                  value={ruhe.von}
                  onChange={(e) => setRuhe({ ...ruhe, von: e.target.value })}
                  aria-label="Ruhezeit von"
                />
              </td>
              <td>
                <input
                  type="date"
                  value={ruhe.bis}
                  onChange={(e) => setRuhe({ ...ruhe, bis: e.target.value })}
                  aria-label="Ruhezeit bis"
                />
              </td>
              <td>
                <input
                  value={ruhe.name}
                  placeholder="Weihnachtspause"
                  onChange={(e) => setRuhe({ ...ruhe, name: e.target.value })}
                  aria-label="Bezeichnung"
                />
              </td>
              <td>
                <button
                  disabled={!ruhe.von || !ruhe.bis}
                  onClick={async () => {
                    if (
                      await props.befehl('ruhezeit.anlegen', { kalenderId: kalender.id, ...ruhe })
                    )
                      setRuhe({ von: '', bis: '', name: '' });
                  }}
                >
                  Hinzufügen
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </fieldset>
    </Dialog>
  );
}
