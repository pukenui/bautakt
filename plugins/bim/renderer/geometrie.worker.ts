/// <reference lib="webworker" />
import { IfcAPI, LogLevel } from 'web-ifc';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import type { GeometrieAuftrag, GeometrieErgebnis, Teil } from './geometrie.js';

/*
 * Geometrie eines IFC-Modells im Worker erzeugen (Architektur 7, E-87): alle Bauteile werden zu
 * wenigen großen Puffern zusammengefasst (opak/transparent, je höchstens GRENZE Punkte). Jeder
 * Punkt trägt die express_id seines Bauteils – für Auswahl, Ein-/Ausblenden und Schnitt.
 */

const GRENZE = 250_000;
let api: Promise<IfcAPI> | undefined;

function starten(): Promise<IfcAPI> {
  api ??= (async () => {
    const a = new IfcAPI();
    await a.Init(() => wasmUrl, true);
    a.SetLogLevel(LogLevel.LOG_LEVEL_OFF);
    return a;
  })();
  return api;
}

class Sammler {
  pos: number[] = [];
  nor: number[] = [];
  farbe: number[] = [];
  ids: number[] = [];
  idx: number[] = [];
  constructor(readonly transparent: boolean) {}
  get punkte() {
    return this.pos.length / 3;
  }
  fertig(): Teil {
    return {
      transparent: this.transparent,
      positionen: new Float32Array(this.pos),
      normalen: new Float32Array(this.nor),
      farben: new Uint8Array(this.farbe),
      ids: new Uint32Array(this.ids),
      indizes: new Uint32Array(this.idx),
    };
  }
}

async function erzeugen(inhalt: Uint8Array): Promise<GeometrieErgebnis> {
  const a = await starten();
  const m = a.OpenModel(inhalt, { COORDINATE_TO_ORIGIN: true });
  const teile: Teil[] = [];
  // Bereiche je Bauteil: [express_id, teil, start, ende] (Punktindizes)
  const bereiche: number[] = [];
  const offen: Record<'opak' | 'transparent', Sammler | null> = { opak: null, transparent: null };
  const teilNr = new Map<Sammler, number>();
  const abschliessen = (s: Sammler) => {
    teile[teilNr.get(s) ?? -1] = s.fertig();
  };
  const sammler = (transparent: boolean): Sammler => {
    const k = transparent ? 'transparent' : 'opak';
    let s = offen[k];
    if (!s || s.punkte > GRENZE) {
      if (s) abschliessen(s);
      s = new Sammler(transparent);
      teilNr.set(s, teile.length);
      teile.push(null as unknown as Teil); // Platzhalter, wird beim Abschluss ersetzt
      offen[k] = s;
    }
    return s;
  };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let verschiebung: [number, number, number];
  try {
    a.StreamAllMeshes(m, (mesh) => {
      const id = mesh.expressID;
      const beginn = new Map<Sammler, number>();
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const pg = mesh.geometries.get(i);
        if (pg.geomType !== 0) continue; // nur Flächen (keine Linien/Punkte)
        const g = a.GetGeometry(m, pg.geometryExpressID);
        const v = a.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const ix = a.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        const c = pg.color;
        const s = sammler(c.w < 0.99);
        if (!beginn.has(s)) beginn.set(s, s.punkte);
        const basis = s.punkte;
        const t = pg.flatTransformation;
        const rgba = [c.x, c.y, c.z, c.w].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255));
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k] ?? 0;
          const y = v[k + 1] ?? 0;
          const z = v[k + 2] ?? 0;
          const px = (t[0] ?? 1) * x + (t[4] ?? 0) * y + (t[8] ?? 0) * z + (t[12] ?? 0);
          const py = (t[1] ?? 0) * x + (t[5] ?? 1) * y + (t[9] ?? 0) * z + (t[13] ?? 0);
          const pz = (t[2] ?? 0) * x + (t[6] ?? 0) * y + (t[10] ?? 1) * z + (t[14] ?? 0);
          s.pos.push(px, py, pz);
          if (px < (min[0] ?? 0)) min[0] = px;
          if (py < (min[1] ?? 0)) min[1] = py;
          if (pz < (min[2] ?? 0)) min[2] = pz;
          if (px > (max[0] ?? 0)) max[0] = px;
          if (py > (max[1] ?? 0)) max[1] = py;
          if (pz > (max[2] ?? 0)) max[2] = pz;
          const nx = v[k + 3] ?? 0;
          const ny = v[k + 4] ?? 0;
          const nz = v[k + 5] ?? 0;
          const qx = (t[0] ?? 1) * nx + (t[4] ?? 0) * ny + (t[8] ?? 0) * nz;
          const qy = (t[1] ?? 0) * nx + (t[5] ?? 1) * ny + (t[9] ?? 0) * nz;
          const qz = (t[2] ?? 0) * nx + (t[6] ?? 0) * ny + (t[10] ?? 1) * nz;
          const l = Math.hypot(qx, qy, qz) || 1;
          s.nor.push(qx / l, qy / l, qz / l);
          s.farbe.push(rgba[0] ?? 200, rgba[1] ?? 200, rgba[2] ?? 200, rgba[3] ?? 255);
          s.ids.push(id);
        }
        for (const j of ix) s.idx.push(basis + j);
        g.delete();
      }
      for (const [s, start] of beginn) bereiche.push(id, teilNr.get(s) ?? 0, start, s.punkte);
    });
    // Verschiebung, mit der web-ifc das Modell an den Ursprung gelegt hat (Spalte 4 der Matrix)
    const k = a.GetCoordinationMatrix(m);
    verschiebung = [k[12] ?? 0, k[13] ?? 0, k[14] ?? 0];
  } finally {
    a.CloseModel(m);
  }
  for (const s of [offen.opak, offen.transparent]) if (s) abschliessen(s);
  const leer = !Number.isFinite(min[0]);
  return {
    teile,
    bereiche: new Int32Array(bereiche),
    min: leer ? [0, 0, 0] : (min as [number, number, number]),
    max: leer ? [0, 0, 0] : (max as [number, number, number]),
    verschiebung,
  };
}

self.onmessage = async (e: MessageEvent<GeometrieAuftrag>) => {
  const { auftrag, inhalt } = e.data;
  try {
    const ergebnis = await erzeugen(new Uint8Array(inhalt));
    const puffer: Transferable[] = [ergebnis.bereiche.buffer];
    for (const t of ergebnis.teile)
      puffer.push(
        t.positionen.buffer,
        t.normalen.buffer,
        t.farben.buffer,
        t.ids.buffer,
        t.indizes.buffer,
      );
    self.postMessage({ auftrag, ok: true, ergebnis }, puffer);
  } catch (err) {
    self.postMessage({ auftrag, ok: false, fehler: (err as Error).message ?? String(err) });
  }
};
