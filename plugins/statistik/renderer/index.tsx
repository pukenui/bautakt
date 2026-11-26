import type { BautaktApi, ProjektStatus } from '@bautakt/kern/vertrag';
import type { AufwandswertZeile, KennwertZeile } from '@bautakt/plugin-bibliothek/typen';
import { MINDEST_N, type Gruppe, type IstBasis } from '@bautakt/rechnen-statistik';
import {
  Begriff,
  Dialog,
  type GlobaleAnsichtProps,
  type RendererPlugin,
  zeitAnzeigen,
} from '@bautakt/ui';
import { useCallback, useEffect, useState } from 'react';
import {
  SCHLUESSEL_JE_ART,
  type Art,
  type Auswertung,
  type AuswertungsFilter,
  type Erhebung,
  type ErfahrungsProjekt,
  type ProjektMerkmale,
  type Schluessel,
  type Vorschlag,
} from '../gemeinsam/typen.js';
import hilfeStatistik from '../hilfe/statistik.md?raw';
import './statistik.css';

const ART_TEXT: Record<Art, string> = {
  dauer: 'Dauern (Termine)',
  kosten: 'Kosten je KG',
  kkw: 'Kostenkennwerte (KKW)',
};
const SCHLUESSEL_TEXT: Record<Schluessel, string> = {
  aufwandswert: 'Aufwandswert (Bibliothek)',
  gewerk: 'Gewerk',
  ursache: 'Abweichungsursache',
  kg: 'Kostengruppe',
  kennwert: 'Kennwert (Bibliothek)',
};

const zahl = (x: number | null | undefined, stellen = 2) =>
  x == null
    ? ''
    : x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const zahlLesen = (t: string) => {
  const s = t.trim();
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return n === '' ? Number.NaN : Number(n);
};

/** Bereich „Aktuelles Projekt“: Merkmale, Übertragen (E-76). */
function ProjektTeil(props: {
  api: BautaktApi;
  status: ProjektStatus;
  onUebertragen: () => void;
  vorschlagListen: { gebaeudearten: string[]; bauweisen: string[] };
}) {
  const { api } = props;
  const [m, setM] = useState<ProjektMerkmale | null>(null);
  const [erhebung, setErhebung] = useState<Erhebung | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  const [stand, setStand] = useState(0);
  const nur = props.status.schreibgeschuetzt;

  useEffect(() => {
    void (async () => {
      const a = await api.abfrage<ProjektMerkmale>('statistik', 'merkmale');
      if (a.ok) setM(a.wert);
      const e = await api.abfrage<Erhebung>('statistik', 'erhebung');
      if (e.ok) setErhebung(e.wert);
    })();
  }, [api, stand, props.status.geaendert]);

  const aendern = async (felder: Record<string, unknown>) => {
    const a = await api.befehl.ausfuehren('statistik', 'merkmale.aendern', { felder });
    if (!a.ok) setMeldung({ text: a.fehler, fehler: true });
    setStand((n) => n + 1);
  };
  const uebertragen = async (abschliessen: boolean) => {
    setMeldung(null);
    const e = await api.abfrage<Erhebung>('statistik', 'erhebung', { abschliessen });
    if (!e.ok) return setMeldung({ text: e.fehler, fehler: true });
    const a = await api.global.aktion<{ beobachtungen: number }>(
      'statistik',
      'uebertragen',
      e.wert,
    );
    if (!a.ok) return setMeldung({ text: a.fehler, fehler: true });
    await api.befehl.ausfuehren('statistik', 'uebertragung.vermerken', {
      abgeschlossen: abschliessen,
    });
    setMeldung({
      text: `${a.wert.beobachtungen} Beobachtungen übertragen${e.wert.projekt.zaehlt ? '' : ' (zählt nicht in der Statistik)'}.`,
      fehler: false,
    });
    setStand((n) => n + 1);
    props.onUebertragen();
  };
  if (!m || !erhebung) return <p className="leise">Lädt …</p>;
  return (
    <section className="st-karte">
      <h3>Aktuelles Projekt: {props.status.projektname}</h3>
      <div className="formular st-merkmale">
        <label className="feld haken">
          <input
            type="checkbox"
            checked={m.zaehlt === 1}
            disabled={nur}
            onChange={(e) => void aendern({ zaehlt: e.target.checked })}
          />
          zählt in Statistik
        </label>
        <label className="feld">
          <span className="feld-label">Gebäudeart</span>
          <input
            list="st-gebaeudearten"
            defaultValue={m.gebaeudeart}
            disabled={nur}
            key={`g${m.gebaeudeart}`}
            placeholder="z. B. Halle"
            onBlur={(e) =>
              e.target.value.trim() !== m.gebaeudeart &&
              void aendern({ gebaeudeart: e.target.value })
            }
          />
          <datalist id="st-gebaeudearten">
            {props.vorschlagListen.gebaeudearten.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <label className="feld">
          <span className="feld-label">Bauweise</span>
          <input
            list="st-bauweisen"
            defaultValue={m.bauweise}
            disabled={nur}
            key={`b${m.bauweise}`}
            placeholder="z. B. Stahlbeton-Fertigteil"
            onBlur={(e) =>
              e.target.value.trim() !== m.bauweise && void aendern({ bauweise: e.target.value })
            }
          />
          <datalist id="st-bauweisen">
            {props.vorschlagListen.bauweisen.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <span className="feld">
          <span className="feld-label">BGF (aus den Kosten)</span>
          <span>{erhebung.projekt.bgf ? `${zahl(erhebung.projekt.bgf, 0)} m²` : '–'}</span>
        </span>
      </div>
      <p className="leise">
        Bereit zum Übertragen: {erhebung.dauer.length} fertige Vorgänge, {erhebung.kosten.length}{' '}
        Kostengruppen, {erhebung.kkw.length} Kennwerte.{' '}
        {m.uebertragen
          ? `Zuletzt übertragen ${zeitAnzeigen(m.uebertragen)}${m.abgeschlossen ? ' (abgeschlossen)' : ''}.`
          : 'Noch nicht übertragen.'}
      </p>
      {!nur && (
        <div className="knoepfe">
          <button onClick={() => void uebertragen(false)}>Projekt übertragen</button>
          <button
            className="primaer"
            onClick={() => void uebertragen(true)}
            title="Projekt als abgeschlossen vermerken und übertragen"
          >
            Abschließen und übertragen
          </button>
        </div>
      )}
      {meldung && <p className={meldung.fehler ? 'fehler' : 'positiv'}>{meldung.text}</p>}
    </section>
  );
}

/** Diagramm: mittlerer Faktor je Schlüssel mit Spanne Min–Max und Median (E-77). */
function FaktorDiagramm({ gruppen }: { gruppen: Gruppe[] }) {
  const mit = gruppen.filter((g) => g.faktor);
  if (!mit.length) return null;
  const ZEILE = 26;
  const LINKS = 230;
  const BREITE = 460;
  const lo = Math.min(0.5, ...mit.map((g) => g.faktor?.min ?? 1)) - 0.05;
  const hi = Math.max(1.5, ...mit.map((g) => g.faktor?.max ?? 1)) + 0.05;
  const x = (f: number) => LINKS + ((f - lo) / (hi - lo)) * BREITE;
  const hoehe = 30 + mit.length * ZEILE;
  const marken = [0.5, 0.75, 1, 1.25, 1.5, 2].filter((m) => m >= lo && m <= hi);
  return (
    <svg
      className="st-diagramm"
      width={LINKS + BREITE + 30}
      height={hoehe}
      role="img"
      aria-label="Ist/Soll-Faktor je Schlüssel"
    >
      {marken.map((m) => (
        <g key={m}>
          <line
            x1={x(m)}
            x2={x(m)}
            y1={14}
            y2={hoehe - 4}
            className={m === 1 ? 'st-eins' : 'st-raster'}
          />
          <text x={x(m)} y={10} textAnchor="middle" className="st-achse">
            {zahl(m, 2)}
          </text>
        </g>
      ))}
      {mit.map((g, i) => {
        const f = g.faktor as NonNullable<Gruppe['faktor']>;
        const y = 24 + i * ZEILE;
        const schlecht = Math.abs(f.mittel - 1) >= 0.05;
        return (
          <g key={g.schluessel}>
            <text x={LINKS - 8} y={y + 4} textAnchor="end" className="st-name">
              {g.bezeichnung.length > 34 ? `${g.bezeichnung.slice(0, 33)}…` : g.bezeichnung} (n ={' '}
              {g.n})
            </text>
            <line x1={x(f.min)} x2={x(f.max)} y1={y} y2={y} className="st-spanne" />
            <line x1={x(f.median)} x2={x(f.median)} y1={y - 6} y2={y + 6} className="st-median" />
            <circle
              cx={x(f.mittel)}
              cy={y}
              r={5}
              className={schlecht ? 'st-mittel abweichend' : 'st-mittel'}
            />
            <title>{`Mittel ${zahl(f.mittel, 3)} · Median ${zahl(f.median, 3)} · Spanne ${zahl(f.min, 3)}–${zahl(f.max, 3)}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** Vorschlag übernehmen (E-78): nur auf Klick, als neue Bibliotheksversion. */
function VorschlagDialog(props: {
  api: BautaktApi;
  vorschlag: Vorschlag;
  onSchliessen: () => void;
}) {
  const { api, vorschlag: v } = props;
  const [eintrag, setEintrag] = useState<AufwandswertZeile | KennwertZeile | null>(null);
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    void api.global
      .abfrage<AufwandswertZeile | KennwertZeile | null>('bibliothek', v.art, { id: v.id })
      .then((a) => {
        if (!a.ok || !a.wert)
          return setFehler('Der Bibliothekseintrag ist nicht (mehr) vorhanden.');
        setEintrag(a.wert);
        const f = v.faktor;
        if (v.art === 'aufwandswert')
          setWerte({ h_je_me: zahl((a.wert as AufwandswertZeile).h_je_me * f, 3) });
        else {
          const k = a.wert as KennwertZeile;
          setWerte({
            von: k.von === null ? '' : zahl(k.von * f),
            mittel: zahl(k.mittel * f),
            bis: k.bis === null ? '' : zahl(k.bis * f),
          });
        }
      });
  }, [api, v]);

  const speichern = async () => {
    if (!eintrag) return;
    const {
      id,
      version: _v,
      ausgeblendet: _a,
      erstellt: _e,
      ...felder
    } = eintrag as AufwandswertZeile & KennwertZeile;
    const neu: Record<string, unknown> = { ...felder };
    for (const [k, t] of Object.entries(werte)) neu[k] = t.trim() === '' ? null : zahlLesen(t);
    neu['anmerkung'] =
      `${(felder as { anmerkung: string }).anmerkung}${(felder as { anmerkung: string }).anmerkung ? ' · ' : ''}angepasst nach Statistik (Faktor ${zahl(v.faktor, 3)})`;
    const a = await api.global.aktion('bibliothek', `${v.art}.aendern`, { id, ...neu });
    if (a.ok) props.onSchliessen();
    else setFehler(a.fehler);
  };
  const aw = v.art === 'aufwandswert';
  return (
    <Dialog
      titel="Bibliothekswert anpassen"
      onSchliessen={props.onSchliessen}
      breite={560}
      fuss={
        <>
          {fehler && <span className="fehler">{fehler}</span>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button className="primaer" disabled={!eintrag} onClick={() => void speichern()}>
            Als neue Version speichern
          </button>
        </>
      }
    >
      <p>{v.text}</p>
      {eintrag && (
        <div className="formular">
          {(aw ? ['h_je_me'] : ['von', 'mittel', 'bis']).map((k) => (
            <label key={k} className="feld">
              <span className="feld-label">
                {aw
                  ? `Aufwandswert [h/${(eintrag as AufwandswertZeile).einheit}]`
                  : `${k === 'mittel' ? 'Mittel' : k === 'von' ? 'Von' : 'Bis'} [€/${(eintrag as KennwertZeile).einheit}]`}
              </span>
              <input
                value={werte[k] ?? ''}
                onChange={(e) => setWerte({ ...werte, [k]: e.target.value })}
              />
              <span className="feld-hinweis">
                bisher{' '}
                {zahl((eintrag as unknown as Record<string, number | null>)[k] ?? null, aw ? 3 : 2)}{' '}
                × Faktor {zahl(v.faktor, 3)}
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="dialog-erklaerung">
        Gespeichert wird eine neue Version in der Bibliothek. Projekte behalten ihre eingefrorenen
        Werte und zeigen einen Hinweis auf die neue Version.
      </p>
    </Dialog>
  );
}

/** Reiter „Statistik“ (E-34, E-74–E-78): auch ohne geöffnetes Projekt. */
function StatistikAnsicht({ api, datenstand }: GlobaleAnsichtProps) {
  const [status, setStatus] = useState<ProjektStatus | null>(null);
  const [art, setArt] = useState<Art>('dauer');
  const [schluessel, setSchluessel] = useState<Schluessel>('aufwandswert');
  const [basis, setBasis] = useState<IstBasis>('ist');
  const [filter, setFilter] = useState<AuswertungsFilter>({});
  const [auswertung, setAuswertung] = useState<Auswertung | null>(null);
  const [projekte, setProjekte] = useState<ErfahrungsProjekt[]>([]);
  const [listen, setListen] = useState({
    gebaeudearten: [] as string[],
    bauweisen: [] as string[],
  });
  const [vorschlag, setVorschlag] = useState<Vorschlag | null>(null);
  const [entfernen, setEntfernen] = useState<ErfahrungsProjekt | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [stand, setStand] = useState(0);
  const neu = useCallback(() => setStand((n) => n + 1), []);

  useEffect(() => {
    void api.projekt.status().then(setStatus);
    return api.on('status', setStatus);
  }, [api]);
  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const [a, p, m] = await Promise.all([
        api.global.abfrage<Auswertung>('statistik', 'auswertung', {
          art,
          schluessel,
          basis,
          filter,
        }),
        api.global.abfrage<ErfahrungsProjekt[]>('statistik', 'projekte'),
        api.global.abfrage<{ gebaeudearten: string[]; bauweisen: string[] }>(
          'statistik',
          'merkmale',
        ),
      ]);
      if (!aktiv) return;
      if (a.ok) setAuswertung(a.wert);
      else setFehler(a.fehler);
      if (p.ok) setProjekte(p.wert);
      if (m.ok) setListen(m.wert);
    })();
    return () => {
      aktiv = false;
    };
  }, [api, datenstand, stand, art, schluessel, basis, filter]);

  const artWaehlen = (a: Art) => {
    setArt(a);
    setSchluessel(SCHLUESSEL_JE_ART[a][0] as Schluessel);
  };
  const aktion = async (name: string, daten: unknown) => {
    const a = await api.global.aktion('statistik', name, daten);
    setFehler(a.ok ? null : a.fehler);
    neu();
  };

  return (
    <div className="ansicht st-ansicht">
      {status && (
        <ProjektTeil api={api} status={status} onUebertragen={neu} vorschlagListen={listen} />
      )}

      <section className="st-karte">
        <h3>Auswertung</h3>
        <div className="werkzeugleiste st-werkzeuge">
          <label className="inline">
            Bereich
            <select value={art} onChange={(e) => artWaehlen(e.target.value as Art)}>
              {(Object.keys(ART_TEXT) as Art[]).map((a) => (
                <option key={a} value={a}>
                  {ART_TEXT[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            je
            <select
              value={schluessel}
              onChange={(e) => setSchluessel(e.target.value as Schluessel)}
            >
              {SCHLUESSEL_JE_ART[art].map((s) => (
                <option key={s} value={s}>
                  {SCHLUESSEL_TEXT[s]}
                </option>
              ))}
            </select>
          </label>
          {art !== 'dauer' && (
            <label className="inline">
              Ist
              <select value={basis} onChange={(e) => setBasis(e.target.value as IstBasis)}>
                <option value="ist">Kostenfeststellung (Rechnungen)</option>
                <option value="prognose">Prognose (Aufträge/Rechnungen)</option>
              </select>
            </label>
          )}
          <label className="inline">
            Gebäudeart
            <select
              value={filter.gebaeudeart ?? ''}
              onChange={(e) => setFilter({ ...filter, gebaeudeart: e.target.value || null })}
            >
              <option value="">alle</option>
              {listen.gebaeudearten.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="inline">
            Bauweise
            <select
              value={filter.bauweise ?? ''}
              onChange={(e) => setFilter({ ...filter, bauweise: e.target.value || null })}
            >
              <option value="">alle</option>
              {listen.bauweisen.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="inline">
            BGF von
            <input
              className="st-zahl"
              inputMode="numeric"
              placeholder="m²"
              onBlur={(e) =>
                setFilter({ ...filter, bgfVon: e.target.value ? zahlLesen(e.target.value) : null })
              }
            />
            bis
            <input
              className="st-zahl"
              inputMode="numeric"
              placeholder="m²"
              onBlur={(e) =>
                setFilter({ ...filter, bgfBis: e.target.value ? zahlLesen(e.target.value) : null })
              }
            />
          </label>
        </div>
        {fehler && <p className="fehler">{fehler}</p>}
        {auswertung && (
          <>
            <p className="leise">
              {auswertung.projekte} zählende Projekte · Faktor = Ist ÷ Soll (
              {art === 'dauer'
                ? 'Ist-Dauer ÷ Dauer im Soll-Stand'
                : art === 'kosten'
                  ? 'Ist-Kosten ÷ Kostenberechnung'
                  : 'Ist-KKW ÷ KKW wirksam'}
              ) · Kennzahlen ab n ≥ {MINDEST_N}
            </p>
            {auswertung.vorschlaege.map((v) => (
              <div key={v.id} className="st-vorschlag">
                <span>💡 {v.text}</span>
                <button onClick={() => setVorschlag(v)}>Anpassen …</button>
              </div>
            ))}
            {auswertung.gruppen.length === 0 ? (
              <p className="leise">
                Noch keine Beobachtungen für diese Auswahl. Übertragen Sie Projekte mit fertigen
                Vorgängen bzw. Rechnungen in die Erfahrungsdatenbank.
              </p>
            ) : (
              <>
                <FaktorDiagramm gruppen={auswertung.gruppen} />
                <table className="tabelle st-tabelle">
                  <thead>
                    <tr>
                      <th>{SCHLUESSEL_TEXT[schluessel]}</th>
                      <th className="zahl">n</th>
                      <th className="zahl">Projekte</th>
                      <th className="zahl">Mittel</th>
                      <th className="zahl">
                        <Begriff k="Median" />
                      </th>
                      <th className="zahl">
                        <Begriff k="Streuung" />
                      </th>
                      <th className="zahl">Min</th>
                      <th className="zahl">Max</th>
                      <th className="zahl">Soll Ø</th>
                      <th className="zahl">Ist Ø</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auswertung.gruppen.map((g) => (
                      <tr key={g.schluessel}>
                        <td>{g.bezeichnung}</td>
                        <td className="zahl">{g.n}</td>
                        <td className="zahl">{g.projekte}</td>
                        {g.faktor ? (
                          <>
                            <td
                              className={`zahl ${Math.abs(g.faktor.mittel - 1) >= 0.05 ? (g.faktor.mittel > 1 ? 'negativ' : 'positiv') : ''}`}
                            >
                              {zahl(g.faktor.mittel, 3)}
                            </td>
                            <td className="zahl">{zahl(g.faktor.median, 3)}</td>
                            <td className="zahl">{zahl(g.faktor.streuung, 3)}</td>
                            <td className="zahl">{zahl(g.faktor.min, 3)}</td>
                            <td className="zahl">{zahl(g.faktor.max, 3)}</td>
                          </>
                        ) : (
                          <td colSpan={5} className="leise">
                            n &lt; {MINDEST_N} – noch keine Kennzahlen
                          </td>
                        )}
                        <td className="zahl">{zahl(g.sollMittel)}</td>
                        <td className="zahl">{zahl(g.istMittel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </section>

      <section className="st-karte">
        <h3>Projekte in der Erfahrungsdatenbank</h3>
        {projekte.length === 0 ? (
          <p className="leise">
            Noch keine Projekte übertragen. Öffnen Sie ein Projekt und wählen Sie oben „Projekt
            übertragen“.
          </p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Projekt</th>
                <th>Gebäudeart</th>
                <th>Bauweise</th>
                <th className="zahl">BGF [m²]</th>
                <th className="zahl">Beobachtungen</th>
                <th>übertragen</th>
                <th>zählt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projekte.map((p) => (
                <tr key={p.projekt_id}>
                  <td>
                    {p.projektname}
                    {p.abgeschlossen ? <span className="leise"> (abgeschlossen)</span> : null}
                  </td>
                  <td>{p.gebaeudeart}</td>
                  <td>{p.bauweise}</td>
                  <td className="zahl">{zahl(p.bgf, 0)}</td>
                  <td className="zahl">{p.beobachtungen}</td>
                  <td>{zeitAnzeigen(p.uebertragen)}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label="zählt in Statistik"
                      checked={p.zaehlt === 1}
                      onChange={(e) =>
                        void aktion('projekt.zaehlt', {
                          projekt_id: p.projekt_id,
                          zaehlt: e.target.checked,
                        })
                      }
                    />
                  </td>
                  <td className="aktionen">
                    <button onClick={() => setEntfernen(p)}>Entfernen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {vorschlag && (
        <VorschlagDialog
          api={api}
          vorschlag={vorschlag}
          onSchliessen={() => {
            setVorschlag(null);
            neu();
          }}
        />
      )}
      {entfernen && (
        <Dialog
          titel="Projekt aus der Erfahrungsdatenbank entfernen"
          onSchliessen={() => setEntfernen(null)}
          breite={500}
          fuss={
            <>
              <button onClick={() => setEntfernen(null)}>Abbrechen</button>
              <button
                className="primaer"
                onClick={() => {
                  void aktion('projekt.entfernen', { projekt_id: entfernen.projekt_id });
                  setEntfernen(null);
                }}
              >
                Entfernen
              </button>
            </>
          }
        >
          <p>
            „{entfernen.projektname}“ und seine {entfernen.beobachtungen} Beobachtungen werden aus
            der Erfahrungsdatenbank gelöscht. Das lässt sich nicht rückgängig machen; die
            Projektdatei selbst bleibt unverändert und kann erneut übertragen werden.
          </p>
        </Dialog>
      )}
    </div>
  );
}

export const statistikRenderer: RendererPlugin = {
  id: 'statistik',
  ansichten: [],
  globaleAnsichten: [
    {
      id: 'statistik.auswertung',
      titel: 'Statistik',
      komponente: StatistikAnsicht,
      hilfe: hilfeStatistik,
    },
  ],
};
