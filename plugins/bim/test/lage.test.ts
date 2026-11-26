import fs from 'node:fs';
import path from 'node:path';
import * as W from 'web-ifc';
import { describe, expect, it } from 'vitest';
import { ifcApi } from '../main/ifc.js';

/*
 * Fachmodelle deckungsgleich (E-88): web-ifc legt jedes Modell einzeln an den Ursprung
 * (COORDINATE_TO_ORIGIN) und meldet die Verschiebung in der Koordinationsmatrix. Der Viewer
 * rechnet Original = Punkt − Verschiebung (renderer/szene.ts) und legt alle Modelle relativ
 * zum ersten. Hier wird diese Annahme gegen web-ifc selbst geprüft.
 */
const datei = (n: string) =>
  new Uint8Array(fs.readFileSync(path.join(import.meta.dirname, 'modelle', n)));

type Punkt = [number, number, number];

/** Begrenzung der Geometrie (alle oder nur bestimmte Klassen) und Verschiebung. */
async function vermessen(name: string, zumUrsprung: boolean, nurKlasse?: number) {
  const a = await ifcApi();
  const m = a.OpenModel(datei(name), { COORDINATE_TO_ORIGIN: zumUrsprung });
  const min: Punkt = [Infinity, Infinity, Infinity];
  const max: Punkt = [-Infinity, -Infinity, -Infinity];
  const sammeln = (mesh: W.FlatMesh) => {
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const pg = mesh.geometries.get(i);
      const g = a.GetGeometry(m, pg.geometryExpressID);
      const v = a.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const t = pg.flatTransformation;
      for (let j = 0; j < v.length; j += 6) {
        const [x, y, z] = [v[j] ?? 0, v[j + 1] ?? 0, v[j + 2] ?? 0];
        for (let c = 0; c < 3; c++) {
          const p = (t[c] ?? 0) * x + (t[4 + c] ?? 0) * y + (t[8 + c] ?? 0) * z + (t[12 + c] ?? 0);
          min[c] = Math.min(min[c] ?? Infinity, p);
          max[c] = Math.max(max[c] ?? -Infinity, p);
        }
      }
      g.delete();
    }
  };
  if (nurKlasse === undefined) a.StreamAllMeshes(m, sammeln);
  else {
    const ids = a.GetLineIDsWithType(m, nurKlasse);
    const liste: number[] = [];
    for (let i = 0; i < ids.size(); i++) liste.push(ids.get(i));
    a.StreamMeshes(m, liste, sammeln);
  }
  const k = a.GetCoordinationMatrix(m);
  a.CloseModel(m);
  return { min, max, verschiebung: [k[12] ?? 0, k[13] ?? 0, k[14] ?? 0] as Punkt };
}

const zurueck = (p: Punkt, t: Punkt) => p.map((x, i) => x - (t[i] ?? 0));

describe('Lage der Modelle (E-88)', () => {
  it('Original = Punkt − Verschiebung (am BIMCraft-Haus, das web-ifc verschiebt)', async () => {
    const roh = await vermessen('bimcraft-haus.ifc', false);
    const verschoben = await vermessen('bimcraft-haus.ifc', true);
    expect(Math.hypot(...verschoben.verschiebung)).toBeGreaterThan(1);
    zurueck(verschoben.min, verschoben.verschiebung).forEach((x, i) =>
      expect(x).toBeCloseTo(roh.min[i] ?? NaN, 4),
    );
    zurueck(verschoben.max, verschoben.verschiebung).forEach((x, i) =>
      expect(x).toBeCloseTo(roh.max[i] ?? NaN, 4),
    );
  });

  it('Fachmodelle derselben Halle (mit und ohne Wände) liegen übereinander', async () => {
    const halle = await vermessen('freecad-halle.ifc', true, W.IFCCOLUMN);
    const tragwerk = await vermessen('freecad-halle-tragwerk.ifc', true, W.IFCCOLUMN);
    const a = zurueck(halle.min, halle.verschiebung);
    zurueck(tragwerk.min, tragwerk.verschiebung).forEach((x, i) =>
      expect(x).toBeCloseTo(a[i] ?? NaN, 6),
    );
  });
});
