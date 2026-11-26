/** Geometrie aus dem Worker: zusammengefasste Puffer je Modell (E-87). */
export interface Teil {
  transparent: boolean;
  positionen: Float32Array;
  normalen: Float32Array;
  /** RGBA, 0–255 */
  farben: Uint8Array;
  /** express_id je Punkt */
  ids: Uint32Array;
  indizes: Uint32Array;
}

export interface GeometrieErgebnis {
  teile: Teil[];
  /** je Bauteil und Teil: express_id, teil, start, ende (Punktindizes, ende exklusiv) */
  bereiche: Int32Array;
  min: [number, number, number];
  max: [number, number, number];
  /**
   * Verschiebung (m), die web-ifc beim Einlesen angewendet hat (Modell an den Ursprung).
   * Original = Punkt − verschiebung; die Szene legt so mehrere Modelle deckungsgleich.
   */
  verschiebung: [number, number, number];
}

export interface GeometrieAuftrag {
  auftrag: number;
  inhalt: ArrayBuffer;
}

type Antwort =
  | { auftrag: number; ok: true; ergebnis: GeometrieErgebnis }
  | { auftrag: number; ok: false; fehler: string };

let worker: Worker | undefined;
let naechster = 1;
const wartend = new Map<number, (a: Antwort) => void>();
/** Fertige Geometrie je Datei-Hash – ein Reiterwechsel rechnet nicht neu. */
const zwischenspeicher = new Map<string, Promise<GeometrieErgebnis>>();

function holeWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./geometrie.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Antwort>) => {
      wartend.get(e.data.auftrag)?.(e.data);
      wartend.delete(e.data.auftrag);
    };
  }
  return worker;
}

/** Geometrie eines Modells (einmal je Hash erzeugen). `laden` liefert die IFC-Datei. */
export function geometrie(
  hash: string,
  laden: () => Promise<Uint8Array>,
): Promise<GeometrieErgebnis> {
  let p = zwischenspeicher.get(hash);
  if (!p) {
    p = laden().then(
      (inhalt) =>
        new Promise<GeometrieErgebnis>((ok, fehler) => {
          const auftrag = naechster++;
          wartend.set(auftrag, (a) => (a.ok ? ok(a.ergebnis) : fehler(new Error(a.fehler))));
          // Kopie übertragen: der Puffer gehört danach dem Worker
          const kopie = inhalt.slice().buffer;
          holeWorker().postMessage({ auftrag, inhalt: kopie } satisfies GeometrieAuftrag, [kopie]);
        }),
    );
    zwischenspeicher.set(hash, p);
    p.catch(() => zwischenspeicher.delete(hash));
  }
  return p;
}
