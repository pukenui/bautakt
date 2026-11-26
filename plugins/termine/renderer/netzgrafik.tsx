import type { BeziehungZeile, VorgangMitEbene, VorgangTermine } from '../gemeinsam/typen.js';
import { KNOTEN } from './netzlayout.js';

export type Punkt = { x: number; y: number };

export interface KantenGeometrie {
  b: BeziehungZeile;
  d: string;
  lx: number;
  ly: number;
  text: string;
}

/**
 * Pfeilwege des Netzplans: rechts aus der Quelle, links in das Ziel, Ein-/Ausgänge über die
 * Knotenhöhe verteilt (Architektur 11). Wird von Bildschirm- und Druckansicht genutzt.
 */
export function netzKanten(
  beziehungen: readonly BeziehungZeile[],
  pos: (id: string) => Punkt,
): KantenGeometrie[] {
  const aus = new Map<string, BeziehungZeile[]>();
  const ein = new Map<string, BeziehungZeile[]>();
  for (const b of beziehungen) {
    aus.set(b.von_id, [...(aus.get(b.von_id) ?? []), b]);
    ein.set(b.nach_id, [...(ein.get(b.nach_id) ?? []), b]);
  }
  for (const l of aus.values()) l.sort((a, b) => pos(a.nach_id).y - pos(b.nach_id).y);
  for (const l of ein.values()) l.sort((a, b) => pos(a.von_id).y - pos(b.von_id).y);
  const anker = (liste: BeziehungZeile[] | undefined, b: BeziehungZeile) => {
    const l = liste ?? [b];
    return (KNOTEN.hoehe * (l.indexOf(b) + 1)) / (l.length + 1);
  };
  return beziehungen.map((b) => {
    const a = pos(b.von_id);
    const c = pos(b.nach_id);
    const x1 = a.x + KNOTEN.breite;
    const y1 = a.y + anker(aus.get(b.von_id), b);
    const x2 = c.x;
    const y2 = c.y + anker(ein.get(b.nach_id), b);
    let d: string;
    let lx: number;
    if (x2 - x1 >= 30) {
      d = `M${x1},${y1} H${x2 - 22} V${y2} H${x2}`;
      lx = x2 - 26;
    } else {
      // Rückwärts/übereinander: unterhalb herumführen
      const unten = Math.max(a.y, c.y) + KNOTEN.hoehe + 18;
      d = `M${x1},${y1} H${x1 + 14} V${unten} H${x2 - 14} V${y2} H${x2}`;
      lx = x2 - 18;
    }
    const abstand = b.abstand === 0 ? '' : b.abstand > 0 ? `+${b.abstand}` : String(b.abstand);
    return { b, d, lx, ly: y2 - 5, text: `${abstand}${b.art}${b.einheit === 'KT' ? ' KT' : ''}` };
  });
}

export function NetzPfeilMarker() {
  return (
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
  );
}

export function NetzKantenLinie({ k, kritisch }: { k: KantenGeometrie; kritisch: boolean }) {
  return (
    <>
      <path
        d={k.d}
        className="np-linie"
        markerEnd={kritisch ? 'url(#np-pfeil-krit)' : 'url(#np-pfeil)'}
      />
      <text x={k.lx} y={k.ly} textAnchor="end" className="np-kantentext">
        {k.text}
      </text>
    </>
  );
}

export function knotenKlasse(v: VorgangMitEbene, t: VorgangTermine | undefined): string {
  return `np-knoten${t?.kritisch ? ' kritisch' : ''}${v.typ === 'meilenstein' ? ' meilenstein' : ''}${v.schnittstelle ? ' schnittstelle' : ''}`;
}

/** Inhalt eines DIN-69900-Knotens (E-20): Nr. Name / FAZ | D | FEZ / SAZ | GP | FP | SEZ. */
export function NetzKnotenInhalt({
  v,
  t,
  rollen,
}: {
  v: VorgangMitEbene;
  t: VorgangTermine | undefined;
  rollen: boolean;
}) {
  const w = KNOTEN.breite;
  const h = KNOTEN.zeile;
  const z3 = w / 3;
  const z4 = w / 4;
  return (
    <>
      <rect width={w} height={KNOTEN.hoehe} className="np-rahmen" />
      <line x1={0} x2={w} y1={h} y2={h} />
      <line x1={0} x2={w} y1={2 * h} y2={2 * h} />
      <line x1={z3} x2={z3} y1={h} y2={2 * h} />
      <line x1={2 * z3} x2={2 * z3} y1={h} y2={2 * h} />
      <line x1={z4} x2={z4} y1={2 * h} y2={KNOTEN.hoehe} />
      <line x1={2 * z4} x2={2 * z4} y1={2 * h} y2={KNOTEN.hoehe} />
      <line x1={3 * z4} x2={3 * z4} y1={2 * h} y2={KNOTEN.hoehe} />
      <text x={6} y={15} className="np-titel">
        {kuerzen(`${v.nr} ${v.name}${rollen && v.rolle ? ` (${v.rolle})` : ''}`, 30)}
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
    </>
  );
}

function kuerzen(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
