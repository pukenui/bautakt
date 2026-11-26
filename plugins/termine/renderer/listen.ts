import { datumVonTag, tagVonDatum } from '@bautakt/rechnen-kalender';
import type { PlanDaten, VorgangMitEbene, VorgangTermine } from '../gemeinsam/typen.js';

/** Filter der Terminliste (E-47). `null` = alle; `''` bei Gewerk/Rolle = ohne Eintrag. */
export interface ListenFilter {
  gewerk: string | null;
  rolle: string | null;
  /** Zeitfenster in Wochen ab Bezugstag, `frei` = von–bis, `alle` = ohne Zeitfilter. */
  zeitraum: 'alle' | '2' | '4' | '8' | 'frei';
  von: string | null;
  bis: string | null;
  gruppieren: boolean;
}

export const OHNE_FILTER: ListenFilter = {
  gewerk: null,
  rolle: null,
  zeitraum: 'alle',
  von: null,
  bis: null,
  gruppieren: false,
};

export type ListenEintrag =
  { art: 'gruppe'; titel: string; anzahl: number } | { art: 'vorgang'; v: VorgangMitEbene };

/** Zeitfenster [von, bis] (beide einschließlich) des Filters; null = kein Zeitfilter. */
export function zeitfenster(f: ListenFilter, bezug: string): { von: string; bis: string } | null {
  if (f.zeitraum === 'alle') return null;
  if (f.zeitraum === 'frei') {
    if (!f.von && !f.bis) return null;
    return { von: f.von ?? '0001-01-01', bis: f.bis ?? '9999-12-31' };
  }
  const wochen = Number(f.zeitraum);
  return { von: bezug, bis: datumVonTag(tagVonDatum(bezug) + wochen * 7 - 1) };
}

/** Berührt der Vorgang das Zeitfenster? Meilensteine zählen mit ihrem Termin. */
function imFenster(
  v: VorgangMitEbene,
  t: VorgangTermine | undefined,
  fenster: { von: string; bis: string },
): boolean {
  if (!t) return false;
  const anfang = v.typ === 'meilenstein' ? t.ende : t.anfang;
  return anfang <= fenster.bis && t.ende >= fenster.von;
}

export function filterAktiv(f: ListenFilter): boolean {
  return f.gewerk !== null || f.rolle !== null || f.zeitraum !== 'alle';
}

/**
 * Zeilen der Terminliste (E-47).
 * Ohne Gruppierung: Gliederungsreihenfolge der sichtbaren (nicht zugeklappten) Vorgänge;
 * Sammelvorgänge bleiben, wenn ein Unterpunkt passt. Mit Gruppierung: je Gewerk
 * chronologisch, ohne Sammelvorgänge, „ohne Gewerk“ zuletzt.
 */
export function terminliste(
  daten: PlanDaten,
  sichtbar: VorgangMitEbene[],
  f: ListenFilter,
  bezug: string,
): ListenEintrag[] {
  const termine = daten.berechnung.ok ? daten.berechnung.termine : {};
  const fenster = zeitfenster(f, bezug);
  const passt = (v: VorgangMitEbene) =>
    v.typ !== 'sammel' &&
    (f.gewerk === null || v.gewerk.trim() === f.gewerk) &&
    (f.rolle === null || v.rolle.trim() === f.rolle) &&
    (!fenster || imFenster(v, termine[v.id], fenster));

  if (f.gruppieren) {
    const gruppen = new Map<string, VorgangMitEbene[]>();
    for (const v of daten.vorgaenge) {
      if (!passt(v)) continue;
      const g = v.gewerk.trim();
      gruppen.set(g, [...(gruppen.get(g) ?? []), v]);
    }
    const namen = [...gruppen.keys()].sort((a, b) =>
      a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'de'),
    );
    const ergebnis: ListenEintrag[] = [];
    for (const g of namen) {
      const liste = [...(gruppen.get(g) ?? [])].sort(
        (a, b) =>
          (termine[a.id]?.faz ?? 0) - (termine[b.id]?.faz ?? 0) ||
          (termine[a.id]?.fez ?? 0) - (termine[b.id]?.fez ?? 0) ||
          a.nr.localeCompare(b.nr, 'de', { numeric: true }),
      );
      ergebnis.push({ art: 'gruppe', titel: g || 'ohne Gewerk', anzahl: liste.length });
      for (const v of liste) ergebnis.push({ art: 'vorgang', v });
    }
    return ergebnis;
  }

  if (!filterAktiv(f)) return sichtbar.map((v) => ({ art: 'vorgang', v }));

  // Sammelvorgänge mit mindestens einem passenden Unterpunkt (über alle Ebenen)
  const mitTreffer = new Set<string>();
  const kette: VorgangMitEbene[] = [];
  for (const v of daten.vorgaenge) {
    kette.length = v.ebene;
    if (passt(v)) for (const s of kette) mitTreffer.add(s.id);
    kette.push(v);
  }
  return sichtbar
    .filter((v) => (v.typ === 'sammel' ? mitTreffer.has(v.id) : passt(v)))
    .map((v) => ({ art: 'vorgang', v }));
}

/** Gewerke und Verantwortliche des Plans für die Filterauswahl (sortiert, '' = ohne). */
export function auswahlWerte(daten: PlanDaten): { gewerke: string[]; rollen: string[] } {
  const werte = (feld: 'gewerk' | 'rolle') => {
    const s = new Set<string>();
    for (const v of daten.vorgaenge) if (v.typ !== 'sammel') s.add(v[feld].trim());
    return [...s].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'de')));
  };
  return { gewerke: werte('gewerk'), rollen: werte('rolle') };
}

export interface MeilensteinEintrag {
  v: VorgangMitEbene;
  t: VorgangTermine | undefined;
  /** Soll-Termin aus dem Vergleichsstand. */
  soll: string | null;
  sollFez: number | null;
  abweichung: number | null;
}

/** Alle Meilensteine des Plans chronologisch (E-48). */
export function meilensteinliste(daten: PlanDaten): MeilensteinEintrag[] {
  const termine = daten.berechnung.ok ? daten.berechnung.termine : {};
  return daten.vorgaenge
    .filter((v) => v.typ === 'meilenstein')
    .map((v) => {
      const s = daten.vergleich?.termine[v.id];
      return {
        v,
        t: termine[v.id],
        soll: s?.ende ?? null,
        sollFez: s?.fez ?? null,
        abweichung: s?.abweichung ?? null,
      };
    })
    .sort(
      (a, b) => (a.t?.fez ?? Infinity) - (b.t?.fez ?? Infinity) || a.v.sortierung - b.v.sortierung,
    );
}

/**
 * Beschriftungen der Zeitleiste auf Spuren verteilen, damit sie sich nicht überlappen.
 * Eingabe nach x sortiert; eine Beschriftung belegt [x, x + breite]. Ergebnis: Spur je Eintrag.
 */
export function spurenVerteilen(punkte: { x: number; breite: number }[], abstand = 8): number[] {
  const belegtBis: number[] = [];
  return punkte.map((p) => {
    let spur = belegtBis.findIndex((ende) => ende + abstand <= p.x);
    if (spur < 0) spur = belegtBis.length;
    belegtBis[spur] = p.x + p.breite;
    return spur;
  });
}

/** Lesbare Beschreibung des Filters (Fuß des Exports, E-50). */
export function filterText(f: ListenFilter, bezug: string, datum: (iso: string) => string): string {
  const teile: string[] = [];
  if (f.gewerk !== null) teile.push(`Gewerk: ${f.gewerk || 'ohne'}`);
  if (f.rolle !== null) teile.push(`Verantwortlich: ${f.rolle || 'ohne'}`);
  const z = zeitfenster(f, bezug);
  if (z) {
    const von = z.von === '0001-01-01' ? '…' : datum(z.von);
    const bis = z.bis === '9999-12-31' ? '…' : datum(z.bis);
    teile.push(`Zeitraum: ${von} – ${bis}`);
  }
  if (f.gruppieren) teile.push('gruppiert nach Gewerk');
  return teile.length ? teile.join(' · ') : 'alle Vorgänge';
}

/** Filter aus unsicheren Daten (z. B. Export-Parameter) lesen. */
export function filterLesen(x: unknown): ListenFilter {
  if (!x || typeof x !== 'object') return OHNE_FILTER;
  const o = x as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : null);
  const z = s('zeitraum');
  return {
    gewerk: s('gewerk'),
    rolle: s('rolle'),
    zeitraum: z === '2' || z === '4' || z === '8' || z === 'frei' ? z : 'alle',
    von: s('von'),
    bis: s('bis'),
    gruppieren: o['gruppieren'] === true,
  };
}
