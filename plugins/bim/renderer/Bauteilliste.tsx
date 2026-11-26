import { useEffect, useMemo, useRef, useState } from 'react';
import type { BauteilZeile, GeschossZeile, ModellZeile } from '../gemeinsam/typen.js';
import { schluessel, setzen, useAnsicht } from './zustand.js';

export interface Struktur {
  geschosse: GeschossZeile[];
  bauteile: BauteilZeile[];
}

interface Knoten {
  key: string;
  titel: string;
  art: 'modell' | 'geschoss' | 'klasse' | 'bauteil';
  modellId: string;
  /** alle Bauteile unter dem Knoten */
  bauteile: BauteilZeile[];
  kinder: Knoten[];
}

/** Höchstzahl gezeigter Bauteile je Klasse, bevor „weitere“ erscheint (große Modelle). */
const SEITE = 200;

/** Baum Modell → Geschoss → IFC-Klasse → Bauteil (E-89). */
function baum(modell: ModellZeile, s: Struktur): Knoten {
  const geschosse = [
    ...s.geschosse.map((g) => ({ id: g.id, name: g.name })),
    { id: null, name: 'ohne Geschoss' },
  ];
  const kinder = geschosse
    .map((g): Knoten => {
      const bt = s.bauteile.filter((b) => b.geschoss_id === g.id);
      const klassen = [...new Set(bt.map((b) => b.klasse))].sort((a, b) => a.localeCompare(b));
      const gKey = `${modell.id}/${g.id ?? '-'}`;
      return {
        key: gKey,
        titel: g.name,
        art: 'geschoss',
        modellId: modell.id,
        bauteile: bt,
        kinder: klassen.map((k) => {
          const liste = bt.filter((b) => b.klasse === k);
          return {
            key: `${gKey}/${k}`,
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
    })
    .filter((k) => k.bauteile.length > 0);
  return {
    key: modell.id,
    titel: modell.name,
    art: 'modell',
    modellId: modell.id,
    bauteile: s.bauteile,
    kinder,
  };
}

export function Bauteilliste(props: {
  modelle: ModellZeile[];
  struktur: ReadonlyMap<string, Struktur>;
  nurLesen: boolean;
  onModellAktion: (aktion: 'umbenennen' | 'entfernen', m: ModellZeile) => void;
  onIsolieren: (bauteile: BauteilZeile[]) => void;
  onEinpassen: (bauteile: BauteilZeile[]) => void;
}) {
  const z = useAnsicht();
  const baeume = useMemo(
    () =>
      props.modelle.flatMap((m) => {
        const s = props.struktur.get(m.id);
        return s ? [baum(m, s)] : [];
      }),
    [props.modelle, props.struktur],
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
    const g = `${modellId}/${b.geschoss_id ?? '-'}`;
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
    <div className="bim-liste" role="tree" aria-label="Bauteilliste" ref={liste}>
      {baeume.map((b) => zeile(b, 0))}
    </div>
  );
}
