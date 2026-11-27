import { useEffect, useMemo, useRef, useState } from 'react';
import type { BauteilZeile, GeschossZeile, ModellZeile } from '../gemeinsam/typen.js';
import { EINHEIT, kgMenge, type Zuordnung } from '../gemeinsam/zuordnung.js';
import { RAUM_KATEGORIE_TEXT, type RaumZuordnung } from '../gemeinsam/raeume.js';
import { kgText } from './Kostengruppen.js';
import { schluessel, setzen, useAnsicht, type AnsichtZustand } from './zustand.js';

export interface Struktur {
  geschosse: GeschossZeile[];
  bauteile: BauteilZeile[];
}

interface Knoten {
  key: string;
  titel: string;
  art: 'modell' | 'gruppe' | 'klasse' | 'bauteil';
  /** z. B. Menge einer KG */
  zusatz?: string;
  modellId: string;
  /** alle Bauteile unter dem Knoten */
  bauteile: BauteilZeile[];
  kinder: Knoten[];
}

/** Höchstzahl gezeigter Bauteile je Klasse, bevor „weitere“ erscheint (große Modelle). */
const SEITE = 200;

type Gliederung = AnsichtZustand['gliederung'];
type ZuordnungVon = (b: BauteilZeile) => Zuordnung | undefined;
type RaumVon = (b: BauteilZeile) => RaumZuordnung | undefined;

/** Schlüssel der Gruppe (Geschoss oder KG) eines Bauteils im Baum. */
export function gruppenSchluessel(
  b: BauteilZeile,
  g: Gliederung,
  zuordnung: ZuordnungVon,
  raum?: RaumVon,
): string {
  if (g === 'din277') return `${b.modell_id}/din:${raum?.(b)?.kategorie ?? '-'}`;
  return g === 'kg'
    ? `${b.modell_id}/kg:${zuordnung(b)?.kg ?? '-'}`
    : `${b.modell_id}/${b.geschoss_id ?? '-'}`;
}

const zahl = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** Baum Modell → Geschoss bzw. Kostengruppe → IFC-Klasse → Bauteil (E-89, E-90). */
function baum(
  modell: ModellZeile,
  s: Struktur,
  g: Gliederung,
  zuordnung: ZuordnungVon,
  raum: RaumVon,
): Knoten {
  const gruppen: { key: string; titel: string; zusatz?: string; bauteile: BauteilZeile[] }[] = [];
  if (g === 'geschoss') {
    for (const x of [...s.geschosse, { id: null, name: 'ohne Geschoss' }])
      gruppen.push({
        key: `${modell.id}/${x.id ?? '-'}`,
        titel: x.name,
        bauteile: s.bauteile.filter((b) => b.geschoss_id === x.id),
      });
  } else if (g === 'din277') {
    // nur Räume, je Kategorie mit Summe der Grundflächen (E-94)
    const raeume = s.bauteile.filter((b) => b.klasse === 'IfcSpace');
    for (const k of [...Object.keys(RAUM_KATEGORIE_TEXT), null] as (
      keyof typeof RAUM_KATEGORIE_TEXT | null
    )[]) {
      const bt = raeume.filter((b) => (raum(b)?.kategorie ?? null) === k);
      const summe = bt.reduce((x, b) => x + (b.mengen?.flaeche?.wert ?? 0), 0);
      gruppen.push({
        key: `${modell.id}/din:${k ?? '-'}`,
        titel: k ? RAUM_KATEGORIE_TEXT[k] : 'zählt nicht',
        ...(k && bt.length ? { zusatz: `${zahl(summe)} m²` } : {}),
        bauteile: bt,
      });
    }
  } else {
    const jeKg = new Map<number | null, BauteilZeile[]>();
    for (const b of s.bauteile) {
      const kg = zuordnung(b)?.kg ?? null;
      jeKg.set(kg, [...(jeKg.get(kg) ?? []), b]);
    }
    const kgs = [...jeKg.keys()].sort((x, y) => (x ?? 9999) - (y ?? 9999));
    for (const kg of kgs) {
      const bt = jeKg.get(kg) ?? [];
      const m =
        kg === null
          ? null
          : kgMenge(
              kg,
              bt.map((b) => ({
                zuordnung: zuordnung(b) ?? { kg, mengenart: null, regel: null, manuell: false },
                mengen: b.mengen ?? {},
              })),
            );
      gruppen.push({
        key: `${modell.id}/kg:${kg ?? '-'}`,
        titel: kg === null ? 'ohne Kostengruppe' : kgText(kg),
        ...(m?.menge !== null && m?.mengenart
          ? { zusatz: `${zahl(m.menge)} ${EINHEIT[m.mengenart]}` }
          : {}),
        bauteile: bt,
      });
    }
  }
  const kinder = gruppen
    .filter((x) => x.bauteile.length > 0)
    .map((x): Knoten => {
      const klassen = [...new Set(x.bauteile.map((b) => b.klasse))].sort((a, b) =>
        a.localeCompare(b),
      );
      return {
        key: x.key,
        titel: x.titel,
        ...(x.zusatz ? { zusatz: x.zusatz } : {}),
        art: 'gruppe',
        modellId: modell.id,
        bauteile: x.bauteile,
        kinder: klassen.map((k) => {
          const liste = x.bauteile.filter((b) => b.klasse === k);
          return {
            key: `${x.key}/${k}`,
            titel: k,
            art: 'klasse',
            modellId: modell.id,
            bauteile: liste,
            kinder: liste.map((b) => ({
              key: schluessel(modell.id, b.express_id),
              titel: b.name || b.typ || `#${b.express_id}`,
              art: 'bauteil' as const,
              modellId: modell.id,
              bauteile: [b],
              kinder: [],
            })),
          };
        }),
      };
    });
  return {
    key: modell.id,
    titel: modell.name,
    art: 'modell',
    modellId: modell.id,
    bauteile: g === 'din277' ? s.bauteile.filter((b) => b.klasse === 'IfcSpace') : s.bauteile,
    kinder,
  };
}

export function Bauteilliste(props: {
  modelle: ModellZeile[];
  struktur: ReadonlyMap<string, Struktur>;
  nurLesen: boolean;
  onModellAktion: (aktion: 'umbenennen' | 'entfernen' | 'neu', m: ModellZeile) => void;
  onIsolieren: (bauteile: BauteilZeile[]) => void;
  onEinpassen: (bauteile: BauteilZeile[]) => void;
  zuordnung: ZuordnungVon;
  raum: RaumVon;
}) {
  const z = useAnsicht();
  const baeume = useMemo(
    () =>
      props.modelle.flatMap((m) => {
        const s = props.struktur.get(m.id);
        return s ? [baum(m, s, z.gliederung, props.zuordnung, props.raum)] : [];
      }),
    [props.modelle, props.struktur, z.gliederung, props.zuordnung, props.raum],
  );
  const [mehr, setMehr] = useState<Record<string, number>>({});
  const auswahlKey = z.auswahl ? schluessel(z.auswahl.modellId, z.auswahl.expressId) : null;
  const liste = useRef<HTMLDivElement>(null);

  // Auswahl im Modell: zugehörigen Zweig aufklappen und Zeile zeigen
  useEffect(() => {
    if (!z.auswahl || !auswahlKey) return;
    const { modellId, expressId } = z.auswahl;
    const b = props.struktur.get(modellId)?.bauteile.find((x) => x.express_id === expressId);
    if (!b) return;
    const g = gruppenSchluessel(b, z.gliederung, props.zuordnung, props.raum);
    const pfad = [modellId, g, `${g}/${b.klasse}`];
    const offen = new Set(z.offen);
    if (pfad.some((p) => !offen.has(p))) {
      pfad.forEach((p) => offen.add(p));
      setzen({ offen });
    }
    requestAnimationFrame(() =>
      liste.current
        ?.querySelector(`[data-key="${CSS.escape(auswahlKey)}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  }, [auswahlKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sichtbar = (b: BauteilZeile) =>
    !z.modelleAus.has(b.modell_id) && !z.versteckt.has(schluessel(b.modell_id, b.express_id));

  const umschalten = (k: Knoten) => {
    if (k.art === 'modell') {
      const aus = new Set(z.modelleAus);
      if (aus.has(k.modellId)) aus.delete(k.modellId);
      else aus.add(k.modellId);
      return setzen({ modelleAus: aus });
    }
    const alleSichtbar = k.bauteile.every(sichtbar);
    const v = new Set(z.versteckt);
    for (const b of k.bauteile) {
      const s = schluessel(b.modell_id, b.express_id);
      if (alleSichtbar) v.add(s);
      else v.delete(s);
    }
    const aus = new Set(z.modelleAus);
    if (!alleSichtbar) aus.delete(k.modellId);
    setzen({ versteckt: v, modelleAus: aus });
  };

  const aufklappen = (key: string) => {
    const o = new Set(z.offen);
    if (o.has(key)) o.delete(key);
    else o.add(key);
    setzen({ offen: o });
  };

  const zeile = (k: Knoten, tiefe: number) => {
    const n = k.bauteile.filter(sichtbar).length;
    const status = k.art === 'modell' && z.modelleAus.has(k.modellId) ? 0 : n;
    const aufklappbar = k.kinder.length > 0;
    const offen = z.offen.has(k.key);
    const gewaehlt = k.key === auswahlKey;
    const bt = k.bauteile[0];
    const kinder = offen ? k.kinder.slice(0, mehr[k.key] ?? SEITE) : [];
    return (
      <div
        key={k.key}
        role="treeitem"
        aria-expanded={aufklappbar ? offen : undefined}
        aria-selected={gewaehlt}
      >
        <div
          className={`bim-zeile ${k.art}${gewaehlt ? ' gewaehlt' : ''}`}
          style={{ paddingLeft: 4 + tiefe * 14 }}
          data-key={k.key}
          onDoubleClick={() => props.onEinpassen(k.bauteile)}
        >
          {aufklappbar ? (
            <button
              className="bim-auf"
              aria-label={offen ? 'Zuklappen' : 'Aufklappen'}
              onClick={() => aufklappen(k.key)}
            >
              {offen ? '▾' : '▸'}
            </button>
          ) : (
            <span className="bim-auf" />
          )}
          <input
            type="checkbox"
            aria-label={`${k.titel} sichtbar`}
            checked={status > 0}
            ref={(el) => {
              if (el) el.indeterminate = status > 0 && status < k.bauteile.length;
            }}
            onChange={() => umschalten(k)}
          />
          <span
            className="bim-titel"
            title={
              k.art === 'bauteil' && bt ? `${bt.klasse} · ${bt.typ} · ${bt.globalid}` : k.titel
            }
            onClick={() =>
              k.art === 'bauteil' && bt
                ? setzen({ auswahl: { modellId: bt.modell_id, expressId: bt.express_id } })
                : aufklappen(k.key)
            }
          >
            {k.titel}
          </span>
          {k.zusatz && <span className="bim-zusatz">{k.zusatz}</span>}
          {k.art !== 'bauteil' && <span className="bim-anzahl">{k.bauteile.length}</span>}
          <span className="bim-knoepfe">
            <button
              title="Nur diese zeigen (isolieren)"
              onClick={() => props.onIsolieren(k.bauteile)}
            >
              ◎
            </button>
            {k.art === 'modell' && !props.nurLesen && (
              <>
                <button
                  title="Neu einlesen (geänderte IFC-Datei, mit Vorschau)"
                  onClick={() => {
                    const m = props.modelle.find((x) => x.id === k.modellId);
                    if (m) props.onModellAktion('neu', m);
                  }}
                >
                  ⟳
                </button>
                <button
                  title="Modell umbenennen"
                  onClick={() => {
                    const m = props.modelle.find((x) => x.id === k.modellId);
                    if (m) props.onModellAktion('umbenennen', m);
                  }}
                >
                  ✎
                </button>
                <button
                  title="Modell aus dem Projekt entfernen"
                  onClick={() => {
                    const m = props.modelle.find((x) => x.id === k.modellId);
                    if (m) props.onModellAktion('entfernen', m);
                  }}
                >
                  ×
                </button>
              </>
            )}
          </span>
        </div>
        {kinder.map((c) => zeile(c, tiefe + 1))}
        {offen && k.kinder.length > kinder.length && (
          <button
            className="bim-mehr"
            style={{ marginLeft: 22 + (tiefe + 1) * 14 }}
            onClick={() => setMehr({ ...mehr, [k.key]: kinder.length + SEITE })}
          >
            {k.kinder.length - kinder.length} weitere anzeigen
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="bim-liste">
      <div className="bim-liste-kopf">
        <select
          aria-label="Gliederung der Bauteilliste"
          value={z.gliederung}
          onChange={(e) => setzen({ gliederung: e.target.value as AnsichtZustand['gliederung'] })}
        >
          <option value="geschoss">nach Geschoss</option>
          <option value="kg">nach Kostengruppe</option>
          <option value="din277">Räume nach DIN 277</option>
        </select>
      </div>
      <div className="bim-baum" role="tree" aria-label="Bauteilliste" ref={liste}>
        {baeume.map((b) => zeile(b, 0))}
      </div>
    </div>
  );
}
