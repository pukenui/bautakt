import type { BautaktApi } from '@bautakt/kern/vertrag';
import { gewerkFarbe, ortsBaum, type OrtZeile } from '@bautakt/plugin-termine/orte';
import { Dialog } from '@bautakt/ui';
import { useEffect, useMemo, useState } from 'react';
import type { BauteilZeile, GeschossZeile } from '../gemeinsam/typen.js';
import {
  ortFilter,
  refSchluessel,
  refsLesen,
  tagePlus,
  vorschlag4d,
  zeitraeume,
  type Bauteil4d,
  type BauteilRef,
  type OrtZuordnung,
  type Zeitraum,
  type Zustand4d,
} from '../gemeinsam/vierd.js';
import type { Zuordnung } from '../gemeinsam/zuordnung.js';
import { lesen, setzen, useAnsicht } from './zustand.js';

/*
 * 4D (E-101–E-104): Daten aus den Terminen, Simulationsleiste, Verknüpfungsdialoge.
 */

export interface PlanKurz {
  id: string;
  name: string;
}

/** Ausschnitt der Termin-Plandaten, den 4D braucht. */
export interface Plan4d {
  plan: { id: string; name: string; projektstart: string | null };
  vorgaenge: {
    id: string;
    nr: string;
    name: string;
    typ: string;
    gewerk: string;
    ebene: number;
    ort_von: string | null;
    ort_bis: string | null;
    bauteil_refs: string;
  }[];
  orte: OrtZeile[];
  berechnung: { ok: boolean; termine?: Record<string, { anfang: string; ende: string }> };
  vergleich: {
    standName: string;
    termine: Record<string, { anfang: string; ende: string }>;
  } | null;
}

export interface VierDDaten {
  ortZuordnungen: OrtZuordnung[];
  regeln: { vorgang_id: string; kgs: number[]; klassen: string[] }[];
}

async function frage<T>(api: BautaktApi, plugin: string, name: string, argumente?: unknown) {
  const a = await api.abfrage<T>(plugin, name, argumente);
  if (!a.ok) throw new Error(a.fehler);
  return a.wert;
}

/** Pläne, Soll-Stände, Plandaten und 4D-Zuordnungen laden (nur bei eingeschaltetem 4D). */
export function use4dDaten(api: BautaktApi, datenstand: number) {
  const z = useAnsicht();
  const [plaene, setPlaene] = useState<PlanKurz[]>([]);
  const [staende, setStaende] = useState<{ id: string; name: string }[]>([]);
  const [plan, setPlan] = useState<Plan4d | null>(null);
  const [vierD, setVierD] = useState<VierDDaten>({ ortZuordnungen: [], regeln: [] });
  const [fehler, setFehler] = useState<string | null>(null);
  const { aktiv, planId, sollId } = z.vierd;
  useEffect(() => {
    if (!aktiv) return;
    let lebt = true;
    void (async () => {
      try {
        const p = await frage<PlanKurz[]>(api, 'termine', 'plaene');
        const st = (
          await frage<{ id: string; name: string; art: string }[]>(api, 'kern', 'staende')
        ).filter((s) => s.art === 'soll');
        const id = planId && p.some((x) => x.id === planId) ? planId : (p[0]?.id ?? null);
        const daten = id
          ? await frage<Plan4d>(api, 'termine', 'plan', { planId: id, sollStandId: sollId })
          : null;
        const v = await frage<VierDDaten>(api, 'bim', 'vierD');
        if (!lebt) return;
        setPlaene(p);
        setStaende(st);
        setPlan(daten);
        setVierD(v);
        setFehler(null);
        if (id !== planId) setzen({ vierd: { ...z.vierd, planId: id } });
      } catch (e) {
        if (lebt) setFehler((e as Error).message);
      }
    })();
    return () => {
      lebt = false;
    };
  }, [api, datenstand, aktiv, planId, sollId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { plaene, staende, plan, vierD, fehler };
}

/** Zeiträume je Bauteil (Plan und Soll) und der Gesamtzeitraum des Plans. */
export function useZeitraeume(plan: Plan4d | null) {
  return useMemo(() => {
    if (!plan || !plan.berechnung.ok)
      return {
        plan: new Map<string, Zeitraum>(),
        soll: new Map<string, Zeitraum>(),
        von: null,
        bis: null,
      };
    const t = plan.berechnung.termine ?? {};
    const mitTerminen = plan.vorgaenge
      .filter((v) => v.typ !== 'sammel' && t[v.id])
      .map((v) => ({ ...v, anfang: t[v.id]?.anfang ?? '', ende: t[v.id]?.ende ?? '' }));
    const soll = plan.vergleich
      ? zeitraeume(
          plan.vorgaenge
            .filter((v) => v.typ !== 'sammel' && plan.vergleich?.termine[v.id])
            .map((v) => ({
              ...v,
              anfang: plan.vergleich?.termine[v.id]?.anfang ?? '',
              ende: plan.vergleich?.termine[v.id]?.ende ?? '',
            })),
        )
      : new Map<string, Zeitraum>();
    const tage = mitTerminen.flatMap((v) => [v.anfang, v.ende]).sort();
    return {
      plan: zeitraeume(mitTerminen),
      soll,
      von: tage[0] ?? plan.plan.projektstart,
      bis: tage.at(-1) ?? plan.plan.projektstart,
    };
  }, [plan]);
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const FARBE_LAUFEND: [number, number, number] = [0.95, 0.55, 0.1];
export const FARBE_VERSPAETET: [number, number, number] = [0.85, 0.12, 0.12];

/** Zustand eines Bauteils in der Simulation → Szene-Zustand und Tönung. */
export function zustand4dSzene(
  z: Zustand4d,
  gewerk: string,
  optionen: { geist: boolean; gewerk: boolean },
): { code: 0 | 1 | 3 | 4; farbe?: [number, number, number] } {
  switch (z) {
    case 'zukunft':
      return { code: optionen.geist ? 3 : 0 };
    case 'laufend':
      return {
        code: 4,
        farbe: optionen.gewerk && gewerk.trim() ? hexRgb(gewerkFarbe(gewerk)) : FARBE_LAUFEND,
      };
    case 'verspaetet':
      return { code: 4, farbe: FARBE_VERSPAETET };
    default:
      return { code: 1 };
  }
}

export const datumDe = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '–';

const TEMPO: { wert: number; text: string }[] = [
  { wert: 1, text: '1 Tag je Sekunde' },
  { wert: 7, text: '1 Woche je Sekunde' },
  { wert: 30, text: '1 Monat je Sekunde' },
];

/** Leiste unter der 3D-Fläche: Plan, Soll, Zeitschieber, Abspielen, Optionen, Bild (E-103, E-104). */
export function SimulationsLeiste(props: {
  plaene: PlanKurz[];
  staende: { id: string; name: string }[];
  von: string | null;
  bis: string | null;
  zaehler: Record<Zustand4d, number>;
  sollAktiv: boolean;
  onVerknuepfungen: () => void;
  onBild: () => void;
}) {
  const z = useAnsicht();
  const v = z.vierd;
  const dauer =
    props.von && props.bis
      ? Math.max(1, (Date.parse(props.bis) - Date.parse(props.von)) / 864e5)
      : 0;
  const tag = Math.min(Math.floor(v.tag), Math.ceil(dauer) + 1);
  const datum = props.von ? tagePlus(props.von, tag) : null;
  // Abspielen: 4 Schritte je Sekunde
  useEffect(() => {
    if (!v.laeuft) return;
    const t = setInterval(() => {
      const a = lesen();
      const naechster = a.vierd.tag + a.vierd.tempo / 4;
      if (naechster > dauer + 1) setzen({ vierd: { ...a.vierd, tag: dauer + 1, laeuft: false } });
      else setzen({ vierd: { ...a.vierd, tag: naechster } });
    }, 250);
    return () => clearInterval(t);
  }, [v.laeuft, dauer]);
  const aendern = (teil: Partial<typeof v>) => setzen({ vierd: { ...v, ...teil } });
  return (
    <div className="bim-4d" role="toolbar" aria-label="Bauablauf-Simulation">
      <div className="bim-4d-zeile">
        <select
          aria-label="Plan"
          value={v.planId ?? ''}
          onChange={(e) => aendern({ planId: e.target.value, tag: 0 })}
        >
          {props.plaene.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Soll-Vergleich"
          value={v.sollId ?? ''}
          onChange={(e) => aendern({ sollId: e.target.value || null })}
        >
          <option value="">ohne Soll-Vergleich</option>
          {props.staende.map((s) => (
            <option key={s.id} value={s.id}>
              Soll: {s.name}
            </option>
          ))}
        </select>
        <button
          className="bim-4d-play"
          aria-label={v.laeuft ? 'Anhalten' : 'Abspielen'}
          disabled={!props.von}
          onClick={() =>
            aendern({ laeuft: !v.laeuft, tag: !v.laeuft && v.tag >= dauer + 1 ? 0 : v.tag })
          }
        >
          {v.laeuft ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          aria-label="Stichtag der Simulation"
          min={0}
          max={Math.ceil(dauer) + 1}
          step={1}
          value={tag}
          disabled={!props.von}
          onChange={(e) => aendern({ tag: Number(e.target.value), laeuft: false })}
        />
        <strong className="bim-4d-datum">{datumDe(datum)}</strong>
        <select
          aria-label="Tempo"
          value={v.tempo}
          onChange={(e) => aendern({ tempo: Number(e.target.value) })}
        >
          {TEMPO.map((t) => (
            <option key={t.wert} value={t.wert}>
              {t.text}
            </option>
          ))}
        </select>
      </div>
      <div className="bim-4d-zeile">
        <label className="inline">
          <input
            type="checkbox"
            checked={v.geist}
            onChange={(e) => aendern({ geist: e.target.checked })}
          />
          Künftiges als Geist
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={v.gewerk}
            onChange={(e) => aendern({ gewerk: e.target.checked })}
          />
          Farbe je Gewerk
        </label>
        <span className="bim-4d-legende">
          <i className="lg-zukunft" /> geplant {props.zaehler.zukunft}
          <i className="lg-laufend" /> in Arbeit {props.zaehler.laufend}
          <i className="lg-fertig" /> fertig {props.zaehler.fertig}
          {props.sollAktiv && (
            <>
              <i className="lg-verspaetet" /> verspätet {props.zaehler.verspaetet}
            </>
          )}
          <span className="leise">· ohne Vorgang {props.zaehler.ohne}</span>
        </span>
        <span className="bim-luecke" />
        <button onClick={props.onVerknuepfungen}>Verknüpfungen …</button>
        <button onClick={props.onBild} title="Aktuelle Ansicht als PNG mit Datum und Legende">
          📷 Bild
        </button>
      </div>
    </div>
  );
}

/** Bauteile mit den Angaben für Vorschläge (Geschossname, Zonen, KG). */
export function bauteile4d(
  bauteile: readonly BauteilZeile[],
  geschosse: readonly GeschossZeile[],
  zuordnung: (b: BauteilZeile) => Zuordnung | undefined,
): Bauteil4d[] {
  const name = new Map(geschosse.map((g) => [g.id, g.name]));
  return bauteile.map((b) => ({
    modell_id: b.modell_id,
    globalid: b.globalid,
    klasse: b.klasse,
    geschoss: b.geschoss_id ? (name.get(b.geschoss_id) ?? '') : '',
    zonen: b.zonen ?? [],
    kg: zuordnung(b)?.kg ?? null,
  }));
}

const liste = (t: string) =>
  t
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Dialog „Verknüpfungen“: 4D-Regeln je Vorgang und Ort ↔ Geschosse/Zonen (E-101, E-102). */
export function VerknuepfungenDialog(props: {
  plan: Plan4d;
  vierD: VierDDaten;
  teile: Bauteil4d[];
  geschossNamen: string[];
  zonenNamen: string[];
  klassen: string[];
  nurLesen: boolean;
  befehl: (plugin: string, name: string, daten: unknown) => Promise<boolean>;
  onSchliessen: () => void;
}) {
  const [reiter, setReiter] = useState<'vorgaenge' | 'orte'>('vorgaenge');
  const baum = useMemo(() => ortsBaum(props.plan.orte), [props.plan.orte]);
  const ortName = (id: string | null) => baum.find((o) => o.id === id)?.pfad ?? '';
  const vorgaenge = props.plan.vorgaenge.filter((v) => v.typ !== 'sammel');
  const regel = (id: string) =>
    props.vierD.regeln.find((r) => r.vorgang_id === id) ?? { kgs: [], klassen: [] };
  const vorschlaege = useMemo(
    () =>
      new Map(
        vorgaenge.map((v) => {
          const r = regel(v.id);
          const f = ortFilter(props.plan.orte, v.ort_von, v.ort_bis, props.vierD.ortZuordnungen);
          return [v.id, vorschlag4d(r, f, props.teile)];
        }),
      ),
    [props.plan, props.vierD, props.teile], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const aus = props.nurLesen;
  const mitVorschlag = vorgaenge.filter((v) => (vorschlaege.get(v.id)?.length ?? 0) > 0);
  const gleicheNamen = () => {
    const zu = baum
      .filter((o) => !props.vierD.ortZuordnungen.some((z) => z.ort_id === o.id))
      .map((o) => ({
        ortId: o.id,
        geschosse: props.geschossNamen.filter((g) => g.toLowerCase() === o.name.toLowerCase()),
        zonen: props.zonenNamen.filter((g) => g.toLowerCase() === o.name.toLowerCase()),
      }))
      .filter((z) => z.geschosse.length || z.zonen.length);
    if (zu.length) void props.befehl('bim', 'ortzuordnung.setzen', { zuordnungen: zu });
  };
  return (
    <Dialog
      titel="4D-Verknüpfungen"
      onSchliessen={props.onSchliessen}
      breite={1100}
      fuss={
        <>
          {!aus && reiter === 'vorgaenge' && (
            <button
              disabled={mitVorschlag.length === 0}
              onClick={() =>
                void props.befehl('termine', 'bauteile.setzen', {
                  aenderungen: mitVorschlag.map((v) => ({
                    vorgangId: v.id,
                    bauteile: vorschlaege.get(v.id),
                  })),
                })
              }
            >
              Vorschläge für alle übernehmen ({mitVorschlag.length})
            </button>
          )}
          {!aus && reiter === 'orte' && (
            <button onClick={gleicheNamen}>Gleiche Namen zuordnen</button>
          )}
          <span className="bim-luecke" />
          <button className="primaer" onClick={props.onSchliessen}>
            Schließen
          </button>
        </>
      }
    >
      <div className="hilfe-reiter" role="tablist">
        <button
          role="tab"
          aria-selected={reiter === 'vorgaenge'}
          className={reiter === 'vorgaenge' ? 'aktiv' : ''}
          onClick={() => setReiter('vorgaenge')}
        >
          Vorgänge
        </button>
        <button
          role="tab"
          aria-selected={reiter === 'orte'}
          className={reiter === 'orte' ? 'aktiv' : ''}
          onClick={() => setReiter('orte')}
        >
          Orte ↔ Geschosse/Zonen
        </button>
      </div>
      {reiter === 'vorgaenge' ? (
        <>
          <p className="dialog-erklaerung">
            4D-Regel je Vorgang: Kostengruppen (z. B. „331 333“ oder „330“ für alle Unter-KG)
            und/oder IFC-Klassen. Zusammen mit dem Ort des Vorgangs ergibt sich der Vorschlag;
            „Übernehmen“ ersetzt die Verknüpfung des Vorgangs. Von Hand verknüpfen Sie über 🔗 in
            der Bauteilliste.
          </p>
          <datalist id="bim-4d-klassen">
            {props.klassen.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <div className="bim-regeln">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Vorgang</th>
                  <th>Ort</th>
                  <th className="zahl">verknüpft</th>
                  <th>Kostengruppen</th>
                  <th>IFC-Klassen</th>
                  <th className="zahl">Vorschlag</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vorgaenge.map((v) => {
                  const r = regel(v.id);
                  const n = refsLesen(v.bauteil_refs).length;
                  const vs = vorschlaege.get(v.id) ?? [];
                  const speichern = (kgs: string, klassen: string) =>
                    void props.befehl('bim', 'regel4d.setzen', {
                      vorgangId: v.id,
                      kgs: liste(kgs).map(Number).filter(Number.isInteger),
                      klassen: liste(klassen),
                    });
                  return (
                    <tr key={`${v.id}-${JSON.stringify(r)}`}>
                      <td>{v.nr}</td>
                      <td style={{ paddingLeft: 6 + v.ebene * 10 }}>{v.name}</td>
                      <td className="leise">
                        {v.ort_von
                          ? `${ortName(v.ort_von)}${v.ort_bis && v.ort_bis !== v.ort_von ? ` – ${ortName(v.ort_bis)}` : ''}`
                          : '–'}
                      </td>
                      <td className="zahl">{n || ''}</td>
                      <td>
                        <input
                          aria-label="Kostengruppen"
                          defaultValue={r.kgs.join(' ')}
                          disabled={aus}
                          placeholder="z. B. 331 333"
                          onBlur={(e) =>
                            e.target.value !== r.kgs.join(' ') &&
                            speichern(e.target.value, r.klassen.join(' '))
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label="IFC-Klassen"
                          list="bim-4d-klassen"
                          defaultValue={r.klassen.join(' ')}
                          disabled={aus}
                          placeholder="z. B. IfcColumn"
                          onBlur={(e) =>
                            e.target.value !== r.klassen.join(' ') &&
                            speichern(r.kgs.join(' '), e.target.value)
                          }
                        />
                      </td>
                      <td className="zahl">{vs.length || ''}</td>
                      <td className="aktionen">
                        {!aus && vs.length > 0 && (
                          <button
                            onClick={() =>
                              void props.befehl('termine', 'bauteile.setzen', {
                                aenderungen: [{ vorgangId: v.id, bauteile: vs }],
                              })
                            }
                          >
                            Übernehmen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <p className="dialog-erklaerung">
            Je Ort die Geschosse und Zonen des Modells. Für einen Vorgang zählen die Orte in seinem
            Bereich „Ort von–bis“ samt übergeordneten Orten. Die Ortsstruktur pflegen Sie in den
            Terminen (Liniendiagramm → Orte …).
          </p>
          {baum.length === 0 ? (
            <p className="leise">Das Projekt hat noch keine Ortsstruktur.</p>
          ) : (
            <div className="bim-regeln">
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Ort</th>
                    <th>Geschosse</th>
                    <th>Zonen</th>
                  </tr>
                </thead>
                <tbody>
                  {baum.map((o) => {
                    const zu = props.vierD.ortZuordnungen.find((z) => z.ort_id === o.id) ?? {
                      ort_id: o.id,
                      geschosse: [],
                      zonen: [],
                    };
                    const umschalten = (art: 'geschosse' | 'zonen', name: string) => {
                      const alt = zu[art];
                      const neu = alt.includes(name)
                        ? alt.filter((x) => x !== name)
                        : [...alt, name];
                      void props.befehl('bim', 'ortzuordnung.setzen', {
                        zuordnungen: [
                          { ortId: o.id, geschosse: zu.geschosse, zonen: zu.zonen, [art]: neu },
                        ],
                      });
                    };
                    const chips = (art: 'geschosse' | 'zonen', namen: string[]) =>
                      namen.length === 0 ? (
                        <span className="leise">–</span>
                      ) : (
                        namen.map((n) => (
                          <label key={n} className="bim-chip">
                            <input
                              type="checkbox"
                              disabled={aus}
                              checked={zu[art].includes(n)}
                              onChange={() => umschalten(art, n)}
                            />
                            {n}
                          </label>
                        ))
                      );
                    return (
                      <tr key={o.id}>
                        <td style={{ paddingLeft: 6 + o.ebene * 14 }}>{o.name}</td>
                        <td>{chips('geschosse', props.geschossNamen)}</td>
                        <td>{chips('zonen', props.zonenNamen)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

/** Dialog „Mit Vorgang verknüpfen“ für ein Bauteil oder einen Zweig der Bauteilliste (E-101). */
export function VerknuepfenDialog(props: {
  titel: string;
  bauteile: BauteilRef[];
  plan: Plan4d | null;
  plaene: PlanKurz[];
  onPlan: (id: string) => void;
  onSchliessen: () => void;
  onSetzen: (vorgangId: string, modus: 'hinzufuegen' | 'ersetzen' | 'loesen') => void;
}) {
  const vorgaenge = (props.plan?.vorgaenge ?? []).filter((v) => v.typ !== 'sammel');
  const [vorgang, setVorgang] = useState(vorgaenge[0]?.id ?? '');
  const [modus, setModus] = useState<'hinzufuegen' | 'ersetzen' | 'loesen'>('hinzufuegen');
  const gewaehlt = vorgaenge.find((v) => v.id === vorgang) ?? vorgaenge[0];
  const schon = new Set(refsLesen(gewaehlt?.bauteil_refs).map(refSchluessel));
  const davonSchon = props.bauteile.filter((b) => schon.has(refSchluessel(b))).length;
  return (
    <Dialog
      titel="Mit Vorgang verknüpfen"
      onSchliessen={props.onSchliessen}
      breite={560}
      fuss={
        <>
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button
            className="primaer"
            disabled={!gewaehlt}
            onClick={() => gewaehlt && props.onSetzen(gewaehlt.id, modus)}
          >
            Übernehmen
          </button>
        </>
      }
    >
      <p>
        <strong>{props.titel}</strong> – {props.bauteile.length} Bauteil(e)
      </p>
      <div className="bim-formular">
        <label>
          Plan
          <select
            aria-label="Plan"
            value={props.plan?.plan.id ?? ''}
            onChange={(e) => props.onPlan(e.target.value)}
          >
            {props.plaene.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vorgang
          <select
            aria-label="Vorgang"
            value={gewaehlt?.id ?? ''}
            onChange={(e) => setVorgang(e.target.value)}
          >
            {vorgaenge.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nr} {v.name}
                {v.bauteil_refs && v.bauteil_refs !== '[]'
                  ? ` (${refsLesen(v.bauteil_refs).length})`
                  : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="feld breit radio" role="radiogroup" aria-label="Art">
        {(
          [
            ['hinzufuegen', 'hinzufügen'],
            ['ersetzen', 'Verknüpfung des Vorgangs ersetzen'],
            ['loesen', 'vom Vorgang lösen'],
          ] as const
        ).map(([w, t]) => (
          <label key={w} className="inline">
            <input type="radio" checked={modus === w} onChange={() => setModus(w)} />
            {t}
          </label>
        ))}
      </div>
      {gewaehlt && (
        <p className="leise">
          Der Vorgang hat {schon.size} verknüpfte(s) Bauteil(e), davon {davonSchon} aus dieser
          Auswahl.
        </p>
      )}
    </Dialog>
  );
}

/** Für die Legende: Anzahl je Zustand. */
export function zaehlen(werte: Iterable<Zustand4d>): Record<Zustand4d, number> {
  const z: Record<Zustand4d, number> = {
    ohne: 0,
    zukunft: 0,
    laufend: 0,
    fertig: 0,
    verspaetet: 0,
  };
  for (const w of werte) z[w]++;
  return z;
}
