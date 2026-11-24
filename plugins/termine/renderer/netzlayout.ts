/** Abmessungen eines DIN-69900-Knotens im Übungsformat (E-20). */
export const KNOTEN = {
  breite: 200,
  hoehe: 66,
  zeile: 22,
  spalte: 270,
  reihe: 104,
  rand: 40,
} as const;

export interface LayoutKnoten {
  id: string;
  /** gespeicherte manuelle Position (überschreibt das Auto-Layout) */
  x: number | null;
  y: number | null;
  faz: number;
}

export interface LayoutKante {
  von: string;
  nach: string;
}

/**
 * Auto-Layout (Architektur 6): Spalte = Rang (längster Weg von einem Startknoten),
 * innerhalb der Spalte zuerst nach FAZ, dann Kreuzungsminimierung per Barycenter.
 */
export function netzLayout(
  knoten: readonly LayoutKnoten[],
  kanten: readonly LayoutKante[],
): Map<string, { x: number; y: number; manuell: boolean }> {
  const ids = knoten.map((k) => k.id);
  const vor = new Map<string, string[]>(ids.map((id) => [id, []]));
  const nach = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const k of kanten) {
    if (!vor.has(k.nach) || !nach.has(k.von)) continue;
    vor.get(k.nach)?.push(k.von);
    nach.get(k.von)?.push(k.nach);
  }

  // Rang per topologischer Sortierung (Kahn); Knoten in Zyklen bekommen Rang 0
  const rang = new Map<string, number>(ids.map((id) => [id, 0]));
  const offen = new Map(ids.map((id) => [id, vor.get(id)?.length ?? 0]));
  const schlange = ids.filter((id) => offen.get(id) === 0);
  for (let i = 0; i < schlange.length; i++) {
    const id = schlange[i] as string;
    for (const n of nach.get(id) ?? []) {
      rang.set(n, Math.max(rang.get(n) ?? 0, (rang.get(id) ?? 0) + 1));
      const rest = (offen.get(n) ?? 1) - 1;
      offen.set(n, rest);
      if (rest === 0) schlange.push(n);
    }
  }

  const faz = new Map(knoten.map((k) => [k.id, k.faz]));
  const eingabe = new Map(ids.map((id, i) => [id, i]));
  const spalten: string[][] = [];
  for (const id of ids) {
    const r = rang.get(id) ?? 0;
    (spalten[r] ??= []).push(id);
  }
  for (const s of spalten) {
    s?.sort(
      (a, b) =>
        (faz.get(a) ?? 0) - (faz.get(b) ?? 0) || (eingabe.get(a) ?? 0) - (eingabe.get(b) ?? 0),
    );
  }

  const pos = new Map<string, number>();
  const nummerieren = () => spalten.forEach((s) => s?.forEach((id, i) => pos.set(id, i)));
  nummerieren();
  const mittel = (liste: string[]) =>
    liste.length ? liste.reduce((sum, x) => sum + (pos.get(x) ?? 0), 0) / liste.length : null;
  for (let runde = 0; runde < 6; runde++) {
    const vorwaerts = runde % 2 === 0;
    const reihenfolge = vorwaerts ? spalten.slice(1) : spalten.slice(0, -1).reverse();
    for (const s of reihenfolge) {
      if (!s) continue;
      const wert = new Map(
        s.map((id) => [id, mittel((vorwaerts ? vor : nach).get(id) ?? []) ?? pos.get(id) ?? 0]),
      );
      s.sort((a, b) => (wert.get(a) ?? 0) - (wert.get(b) ?? 0));
      s.forEach((id, i) => pos.set(id, i));
    }
  }

  const ergebnis = new Map<string, { x: number; y: number; manuell: boolean }>();
  const manuell = new Map(knoten.map((k) => [k.id, k]));
  spalten.forEach((s, r) =>
    s?.forEach((id, i) => {
      const k = manuell.get(id);
      if (k && k.x !== null && k.y !== null) ergebnis.set(id, { x: k.x, y: k.y, manuell: true });
      else
        ergebnis.set(id, {
          x: KNOTEN.rand + r * KNOTEN.spalte,
          y: KNOTEN.rand + i * KNOTEN.reihe,
          manuell: false,
        });
    }),
  );
  return ergebnis;
}

/** Anzahl der Kantenkreuzungen zwischen benachbarten Spalten (für Tests des Layouts). */
export function kreuzungen(
  lage: Map<string, { x: number; y: number }>,
  kanten: readonly LayoutKante[],
): number {
  let n = 0;
  const k = kanten
    .map((e) => ({ a: lage.get(e.von), b: lage.get(e.nach) }))
    .filter(
      (e): e is { a: { x: number; y: number }; b: { x: number; y: number } } => !!e.a && !!e.b,
    );
  for (let i = 0; i < k.length; i++) {
    for (let j = i + 1; j < k.length; j++) {
      const p = k[i] as (typeof k)[number];
      const q = k[j] as (typeof k)[number];
      if (p.a.x !== q.a.x || p.b.x !== q.b.x) continue;
      if ((p.a.y - q.a.y) * (p.b.y - q.b.y) < 0) n++;
    }
  }
  return n;
}
