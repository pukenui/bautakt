import type { AnsichtProps } from '@bautakt/ui';
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import type { VorgangMitEbene } from '../gemeinsam/typen.js';
import { useBefehl, usePlan } from './daten.js';
import { BeziehungDialog, PlanDialog, VorgangDialog } from './Dialoge.js';
import { KeinPlan, Kennzahlen, PlanLeiste } from './gemeinsam.js';
import { KNOTEN, netzLayout } from './netzlayout.js';
import { setzen, useZustand } from './zustand.js';

type DialogZustand = { art: 'vorgang' | 'beziehung'; id: string } | { art: 'plan' } | null;
type Punkt = { x: number; y: number };

/**
 * Netzplan im Übungsformat (E-20): Knoten „Nr. Name / FAZ | D | FEZ / SAZ | GP | FP | SEZ“,
 * Beziehung am Pfeil, kritischer Weg rot und dick, Auto-Layout, Knoten verschiebbar.
 */
export function NetzplanAnsicht({ api, status, datenstand }: AnsichtProps) {
  const z = useZustand();
  const { plaene, daten, ladefehler } = usePlan(api, datenstand);
  const { befehl, fehler, setFehler } = useBefehl(api);
  const [dialog, setDialog] = useState<DialogZustand>(null);
  const [gewaehlteBez, setGewaehlteBez] = useState<string | null>(null);
  const [verschoben, setVerschoben] = useState<Record<string, Punkt>>({});
  const [verbinden, setVerbinden] = useState<{ von: string; a: Punkt; b: Punkt } | null>(null);
  const zieh = useRef<{ id: string; start: Punkt; ursprung: Punkt; bewegt: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nurLesen = status.schreibgeschuetzt;
  const zoom = z.netzZoom;

  const knoten: VorgangMitEbene[] = useMemo(
    () => daten?.vorgaenge.filter((v) => v.typ !== 'sammel') ?? [],
    [daten],
  );
  const termine = daten?.berechnung.ok ? daten.berechnung.termine : {};
  const lage = useMemo(() => {
    const t = daten?.berechnung.ok ? daten.berechnung.termine : {};
    return netzLayout(
      knoten.map((v) => ({ id: v.id, x: v.netz_x, y: v.netz_y, faz: t[v.id]?.faz ?? 0 })),
      (daten?.beziehungen ?? []).map((b) => ({ von: b.von_id, nach: b.nach_id })),
    );
  }, [knoten, daten]);
  const pos = (id: string): Punkt => verschoben[id] ?? lage.get(id) ?? { x: 0, y: 0 };
  const kritischeBez = new Set(daten?.berechnung.ok ? daten.berechnung.kritischeBeziehungen : []);

  if (ladefehler) return <p className="fehler">{ladefehler}</p>;
  if (plaene === null) return <p className="leise">Lädt …</p>;
  if (plaene.length === 0) return <KeinPlan nurLesen={nurLesen} befehl={befehl} />;
  if (!daten) return <p className="leise">Lädt …</p>;

  const svgPunkt = (e: PointerEvent): Punkt => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: (e.clientX - (r?.left ?? 0)) / zoom, y: (e.clientY - (r?.top ?? 0)) / zoom };
  };
  const knotenBei = (p: Punkt) =>
    knoten.find((v) => {
      const q = pos(v.id);
      return p.x >= q.x && p.x <= q.x + KNOTEN.breite && p.y >= q.y && p.y <= q.y + KNOTEN.hoehe;
    });

  const breite = Math.max(800, ...knoten.map((v) => pos(v.id).x + KNOTEN.breite + KNOTEN.rand));
  const hoehe = Math.max(500, ...knoten.map((v) => pos(v.id).y + KNOTEN.hoehe + KNOTEN.rand));

  // Ein-/Ausgänge je Knoten verteilen, damit Pfeile sich nicht überdecken
  const anker = (liste: string[], id: string) => {
    const i = liste.indexOf(id);
    return (KNOTEN.hoehe * (i + 1)) / (liste.length + 1);
  };
  const aus = new Map<string, string[]>();
  const ein = new Map<string, string[]>();
  for (const b of daten.beziehungen) {
    (aus.get(b.von_id) ?? aus.set(b.von_id, []).get(b.von_id))?.push(b.id);
    (ein.get(b.nach_id) ?? ein.set(b.nach_id, []).get(b.nach_id))?.push(b.id);
  }
  for (const [m, seite] of [
    [aus, 'nach_id'],
    [ein, 'von_id'],
  ] as const) {
    for (const liste of m.values()) {
      liste.sort((a, b) => {
        const ba = daten.beziehungen.find((x) => x.id === a);
        const bb = daten.beziehungen.find((x) => x.id === b);
        return pos(ba?.[seite] ?? '').y - pos(bb?.[seite] ?? '').y;
      });
    }
  }

  return (
    <div className="tp-ansicht">
      <div className="tp-werkzeuge" role="toolbar" aria-label="Netzplan">
        <PlanLeiste
          plaene={plaene}
          planId={daten.plan.id}
          nurLesen={nurLesen}
          befehl={befehl}
          onEinstellungen={() => setDialog({ art: 'plan' })}
        />
        <div className="tp-gruppe">
          <button
            onClick={() => setzen({ netzZoom: Math.max(0.4, Math.round((zoom - 0.1) * 10) / 10) })}
            aria-label="Verkleinern"
          >
            −
          </button>
          <span className="tp-zoom">{Math.round(zoom * 100)} %</span>
          <button
            onClick={() => setzen({ netzZoom: Math.min(2, Math.round((zoom + 0.1) * 10) / 10) })}
            aria-label="Vergrößern"
          >
            +
          </button>
        </div>
        {!nurLesen && (
          <div className="tp-gruppe">
            <button
              onClick={() => {
                setVerschoben({});
                void befehl('netz.zuruecksetzen', { planId: daten.plan.id });
              }}
              title="Alle manuell verschobenen Knoten wieder automatisch anordnen"
            >
              Automatisch anordnen
            </button>
            <button
              disabled={!gewaehlteBez}
              onClick={async () => {
                if (gewaehlteBez && (await befehl('beziehung.loeschen', { id: gewaehlteBez })))
                  setGewaehlteBez(null);
              }}
              title="Gewählte Beziehung löschen (Entf)"
            >
              Beziehung löschen
            </button>
          </div>
        )}
        <span className="leise">
          Knoten ziehen = verschieben · am Punkt rechts ziehen = verbinden · Doppelklick =
          Eigenschaften
        </span>
      </div>

      <Kennzahlen daten={daten} />
      {fehler && !dialog && (
        <div className="tp-meldung fehler" role="alert">
          {fehler}
          <button
            className="schliessen"
            onClick={() => setFehler(null)}
            aria-label="Meldung schließen"
          >
            ×
          </button>
        </div>
      )}

      {knoten.length === 0 ? (
        <div className="tp-leer">
          <p>
            Noch keine Vorgänge. Legen Sie sie im Reiter „Terminplan“ an; der Netzplan entsteht
            automatisch.
          </p>
        </div>
      ) : (
        <div
          className="tp-netz"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Delete' && gewaehlteBez && !nurLesen) {
              e.preventDefault();
              void befehl('beziehung.loeschen', { id: gewaehlteBez }).then(
                (ok) => ok && setGewaehlteBez(null),
              );
            }
          }}
        >
          <svg
            ref={svgRef}
            width={breite * zoom}
            height={hoehe * zoom}
            role="img"
            aria-label="Netzplan"
            onPointerDown={() => setGewaehlteBez(null)}
            onPointerMove={(e) => {
              const p = svgPunkt(e);
              if (verbinden) return setVerbinden({ ...verbinden, b: p });
              const d = zieh.current;
              if (!d) return;
              const dx = p.x - d.start.x;
              const dy = p.y - d.start.y;
              if (!d.bewegt && Math.hypot(dx, dy) < 3) return;
              d.bewegt = true;
              setVerschoben((v) => ({
                ...v,
                [d.id]: { x: Math.max(0, d.ursprung.x + dx), y: Math.max(0, d.ursprung.y + dy) },
              }));
            }}
            onPointerUp={(e) => {
              if (verbinden) {
                const ziel = knotenBei(svgPunkt(e));
                setVerbinden(null);
                if (ziel && ziel.id !== verbinden.von)
                  void befehl('beziehung.anlegen', { von: verbinden.von, nach: ziel.id });
                return;
              }
              const d = zieh.current;
              zieh.current = null;
              if (d?.bewegt) {
                const p = verschoben[d.id];
                if (p) {
                  void befehl('netz.position', { positionen: [{ id: d.id, x: p.x, y: p.y }] }).then(
                    () =>
                      setVerschoben((v) => {
                        const { [d.id]: _weg, ...rest } = v;
                        return rest;
                      }),
                  );
                }
              }
            }}
          >
            <defs>
              <marker
                id="np-pfeil"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" className="tp-pfeilspitze" />
              </marker>
              <marker
                id="np-pfeil-krit"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" className="tp-pfeilspitze kritisch" />
              </marker>
            </defs>
            <g transform={`scale(${zoom})`}>
              {daten.beziehungen.map((b) => {
                const a = pos(b.von_id);
                const c = pos(b.nach_id);
                const x1 = a.x + KNOTEN.breite;
                const y1 = a.y + anker(aus.get(b.von_id) ?? [], b.id);
                const x2 = c.x;
                const y2 = c.y + anker(ein.get(b.nach_id) ?? [], b.id);
                const krit = kritischeBez.has(b.id);
                let d: string;
                let lx: number;
                let ly: number;
                if (x2 - x1 >= 30) {
                  const xm = x2 - 22;
                  d = `M${x1},${y1} H${xm} V${y2} H${x2}`;
                  lx = x2 - 26;
                  ly = y2 - 5;
                } else {
                  // Rückwärts/übereinander: unterhalb herumführen
                  const unten = Math.max(a.y, c.y) + KNOTEN.hoehe + 18;
                  d = `M${x1},${y1} H${x1 + 14} V${unten} H${x2 - 14} V${y2} H${x2}`;
                  lx = x2 - 18;
                  ly = y2 - 5;
                }
                const text = `${b.abstand === 0 ? '' : b.abstand > 0 ? `+${b.abstand}` : b.abstand}`;
                return (
                  <g
                    key={b.id}
                    className={`np-kante${krit ? ' kritisch' : ''}${gewaehlteBez === b.id ? ' gewaehlt' : ''}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setGewaehlteBez(b.id);
                    }}
                    onDoubleClick={() => setDialog({ art: 'beziehung', id: b.nach_id })}
                  >
                    <path d={d} className="np-trefferflaeche" />
                    <path
                      d={d}
                      className="np-linie"
                      markerEnd={krit ? 'url(#np-pfeil-krit)' : 'url(#np-pfeil)'}
                    />
                    <text x={lx} y={ly} textAnchor="end" className="np-kantentext">
                      {text}
                      {b.art}
                      {b.einheit === 'KT' ? ' KT' : ''}
                    </text>
                  </g>
                );
              })}

              {knoten.map((v) => {
                const p = pos(v.id);
                const t = termine[v.id];
                const w = KNOTEN.breite;
                const h = KNOTEN.zeile;
                const z3 = w / 3;
                const z4 = w / 4;
                const krit = t?.kritisch;
                return (
                  <g
                    key={v.id}
                    transform={`translate(${p.x},${p.y})`}
                    className={`np-knoten${krit ? ' kritisch' : ''}${z.auswahl === v.id ? ' gewaehlt' : ''}${v.typ === 'meilenstein' ? ' meilenstein' : ''}${v.schnittstelle ? ' schnittstelle' : ''}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setzen({ auswahl: v.id });
                      if (nurLesen) return;
                      svgRef.current?.setPointerCapture(e.pointerId);
                      zieh.current = {
                        id: v.id,
                        start: svgPunkt(e),
                        ursprung: pos(v.id),
                        bewegt: false,
                      };
                    }}
                    onDoubleClick={() => setDialog({ art: 'vorgang', id: v.id })}
                  >
                    <title>
                      {`${v.nr} ${v.name}${v.rolle ? `\nRolle: ${v.rolle}` : ''}${v.info_braucht ? `\nbraucht: ${v.info_braucht}` : ''}${v.info_liefert ? `\nliefert: ${v.info_liefert}` : ''}${v.quelle_annahme ? `\nQuelle/Annahme: ${v.quelle_annahme}` : ''}`}
                    </title>
                    <rect width={w} height={KNOTEN.hoehe} className="np-rahmen" />
                    <line x1={0} x2={w} y1={h} y2={h} />
                    <line x1={0} x2={w} y1={2 * h} y2={2 * h} />
                    <line x1={z3} x2={z3} y1={h} y2={2 * h} />
                    <line x1={2 * z3} x2={2 * z3} y1={h} y2={2 * h} />
                    <line x1={z4} x2={z4} y1={2 * h} y2={KNOTEN.hoehe} />
                    <line x1={2 * z4} x2={2 * z4} y1={2 * h} y2={KNOTEN.hoehe} />
                    <line x1={3 * z4} x2={3 * z4} y1={2 * h} y2={KNOTEN.hoehe} />
                    <text x={6} y={15} className="np-titel">
                      {kuerzen(
                        `${v.nr} ${v.name}${daten.plan.art === 'rollen' && v.rolle ? ` (${v.rolle})` : ''}`,
                        30,
                      )}
                    </text>
                    {t && (
                      <>
                        <text x={z3 / 2} y={h + 15} textAnchor="middle">
                          {t.faz}
                        </text>
                        <text x={z3 * 1.5} y={h + 15} textAnchor="middle">
                          {t.fez - t.faz}
                        </text>
                        <text x={z3 * 2.5} y={h + 15} textAnchor="middle">
                          {t.fez}
                        </text>
                        <text x={z4 / 2} y={2 * h + 15} textAnchor="middle">
                          {t.saz}
                        </text>
                        <text
                          x={z4 * 1.5}
                          y={2 * h + 15}
                          textAnchor="middle"
                          className={t.gp < 0 ? 'negativ' : ''}
                        >
                          {t.gp}
                        </text>
                        <text x={z4 * 2.5} y={2 * h + 15} textAnchor="middle">
                          {t.fp ?? ''}
                        </text>
                        <text x={z4 * 3.5} y={2 * h + 15} textAnchor="middle">
                          {t.sez}
                        </text>
                      </>
                    )}
                    {!nurLesen && (
                      <circle
                        cx={w}
                        cy={KNOTEN.hoehe / 2}
                        r={6}
                        className="tp-griff"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          svgRef.current?.setPointerCapture(e.pointerId);
                          const a = { x: p.x + w, y: p.y + KNOTEN.hoehe / 2 };
                          setVerbinden({ von: v.id, a, b: a });
                        }}
                      >
                        <title>Ziehen, um eine Beziehung (EA) anzulegen</title>
                      </circle>
                    )}
                  </g>
                );
              })}
              {verbinden && (
                <line
                  x1={verbinden.a.x}
                  y1={verbinden.a.y}
                  x2={verbinden.b.x}
                  y2={verbinden.b.y}
                  className="tp-ziehlinie"
                />
              )}
            </g>
          </svg>
        </div>
      )}

      <div className="tp-legende">
        <span className="np-legende-knoten">
          <span>Nr. Vorgang</span>
          <span>FAZ | D | FEZ</span>
          <span>SAZ | GP | FP | SEZ</span>
        </span>
        <span className="leise">
          Zeiten in AT, Zeitpunkte ab 0 (DIN 69900). Rot = kritischer Weg.
        </span>
      </div>

      {dialog?.art === 'vorgang' && (
        <VorgangDialog
          daten={daten}
          vorgangId={dialog.id}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onBeziehungen={() => setDialog({ art: 'beziehung', id: dialog.id })}
          onSchliessen={() => {
            setDialog(null);
            setFehler(null);
          }}
        />
      )}
      {dialog?.art === 'beziehung' && (
        <BeziehungDialog
          daten={daten}
          vorgangId={dialog.id}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={() => {
            setDialog(null);
            setFehler(null);
          }}
        />
      )}
      {dialog?.art === 'plan' && (
        <PlanDialog
          daten={daten}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={() => {
            setDialog(null);
            setFehler(null);
          }}
        />
      )}
    </div>
  );
}

function kuerzen(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
