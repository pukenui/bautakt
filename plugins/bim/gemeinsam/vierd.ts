import { ortsBaum, ortsBereich, type OrtZeile } from '@bautakt/plugin-termine/orte';
import { inKg } from './zuordnung.js';

/*
 * 4D (E-101–E-103): Vorschläge für die Verknüpfung Vorgang ↔ Bauteile und Zustände der
 * Bauteile an einem Stichtag. Reine Funktionen, gemeinsam für Renderer und Tests.
 */

/** Verweis auf ein Bauteil am Vorgang (wie `t_vorgang.bauteil_refs`). */
export interface BauteilRef {
  m: string;
  g: string;
}

export const refSchluessel = (r: BauteilRef) => `${r.m}:${r.g}`;

export function refsLesen(json: string | null | undefined): BauteilRef[] {
  try {
    const a = JSON.parse(json || '[]') as unknown;
    return Array.isArray(a)
      ? a.filter((x): x is BauteilRef => !!x && typeof x.m === 'string' && typeof x.g === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Zuordnung eines Orts zu Geschoss- und Zonennamen (E-102). */
export interface OrtZuordnung {
  ort_id: string;
  geschosse: string[];
  zonen: string[];
}

/** 4D-Regel eines Vorgangs (E-101): Kostengruppen und/oder IFC-Klassen. */
export interface Regel4d {
  kgs: number[];
  klassen: string[];
}

/** Ortsfilter eines Vorgangs; null = kein Filter (Vorgang ohne Ort). */
export interface OrtFilter {
  geschosse: ReadonlySet<string> | null;
  zonen: ReadonlySet<string> | null;
}

/**
 * Orte im Bereich „Ort von–bis“ samt übergeordneten Orten (alle, deren Blätter den Bereich
 * überdecken) → Geschoss- und Zonennamen (E-102).
 */
export function ortFilter(
  orte: readonly OrtZeile[],
  vonId: string | null,
  bisId: string | null,
  zuordnungen: readonly OrtZuordnung[],
): OrtFilter | null {
  if (!vonId && !bisId) return null;
  const baum = ortsBaum(orte);
  const b = ortsBereich(baum, vonId, bisId);
  if (!b) return null;
  const lo = Math.min(b.start, b.ende);
  const hi = Math.max(b.start, b.ende); // Blätter [lo, hi)
  const imBereich = baum.filter((o) => o.blattVon < hi && o.blattBis >= lo);
  const g = new Set<string>();
  const z = new Set<string>();
  for (const o of imBereich) {
    const zu = zuordnungen.find((x) => x.ort_id === o.id);
    zu?.geschosse.forEach((n) => g.add(n));
    zu?.zonen.forEach((n) => z.add(n));
  }
  return { geschosse: g.size ? g : null, zonen: z.size ? z : null };
}

/** Was der Vorschlag von einem Bauteil braucht. */
export interface Bauteil4d {
  modell_id: string;
  globalid: string;
  klasse: string;
  /** Name des Geschosses ('' ohne) */
  geschoss: string;
  zonen: readonly string[];
  /** Kostengruppe aus Regeln/Zuordnung (B2) oder null */
  kg: number | null;
}

export function passtOrt(b: Bauteil4d, f: OrtFilter | null): boolean {
  if (!f) return true;
  if (f.geschosse && !f.geschosse.has(b.geschoss)) return false;
  if (f.zonen && !b.zonen.some((z) => f.zonen?.has(z))) return false;
  return true;
}

function klassePasst(regel: string, klasse: string): boolean {
  const r = regel.trim().toLowerCase();
  const k = klasse.toLowerCase();
  return (
    !!r &&
    (k === r ||
      (k.startsWith(r) && /^(standardcase|elementedcase|flight|part)/.test(k.slice(r.length))))
  );
}

/** Vorschlag (E-101): Bauteile, die zur 4D-Regel passen und im Ort des Vorgangs liegen. */
export function vorschlag4d(
  regel: Regel4d,
  filter: OrtFilter | null,
  bauteile: readonly Bauteil4d[],
): BauteilRef[] {
  if (regel.kgs.length === 0 && regel.klassen.length === 0) return [];
  return bauteile
    .filter(
      (b) =>
        (regel.kgs.some((kg) => b.kg !== null && inKg(b.kg, kg)) ||
          regel.klassen.some((k) => klassePasst(k, b.klasse))) &&
        passtOrt(b, filter),
    )
    .map((b) => ({ m: b.modell_id, g: b.globalid }));
}

// --- Simulation (E-103) -------------------------------------------------------------------

export interface Zeitraum {
  /** JJJJ-MM-TT */
  anfang: string;
  ende: string;
  /** Gewerk des frühesten Vorgangs (für die Farbe) */
  gewerk: string;
}

/** Zeitraum je Bauteil aus allen verknüpften Vorgängen: frühester Anfang, spätestes Ende. */
export function zeitraeume(
  vorgaenge: readonly { bauteil_refs: string; anfang: string; ende: string; gewerk: string }[],
): Map<string, Zeitraum> {
  const m = new Map<string, Zeitraum>();
  for (const v of vorgaenge)
    for (const r of refsLesen(v.bauteil_refs)) {
      const k = refSchluessel(r);
      const z = m.get(k);
      if (!z) m.set(k, { anfang: v.anfang, ende: v.ende, gewerk: v.gewerk });
      else
        m.set(k, {
          anfang: v.anfang < z.anfang ? v.anfang : z.anfang,
          ende: v.ende > z.ende ? v.ende : z.ende,
          gewerk: v.anfang < z.anfang ? v.gewerk : z.gewerk,
        });
    }
  return m;
}

export type Zustand4d = 'ohne' | 'zukunft' | 'laufend' | 'fertig' | 'verspaetet';

/**
 * Zustand am Tag `datum` (JJJJ-MM-TT, Ende einschließlich). Mit Soll-Zeitraum: rot
 * („verspätet“), wenn laut Soll schon fertig, im Plan aber noch nicht.
 */
export function zustandAm(datum: string, plan: Zeitraum | undefined, soll?: Zeitraum): Zustand4d {
  if (!plan) return 'ohne';
  const z: Zustand4d = datum < plan.anfang ? 'zukunft' : datum > plan.ende ? 'fertig' : 'laufend';
  if (soll && datum > soll.ende && z !== 'fertig') return 'verspaetet';
  return z;
}

/** Datum ± Tage (JJJJ-MM-TT, UTC). */
export function tagePlus(datum: string, tage: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
