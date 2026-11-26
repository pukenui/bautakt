import type { OrtZeile } from '../gemeinsam/orte.js';
import { aufwandHinweise } from './aufwand.js';
import { BautaktFehler, type PluginDb } from '@bautakt/kern';
import { Arbeitskalender } from '@bautakt/rechnen-kalender';
import { netzplanBerechnen, NetzplanFehler, type VorgangEingabe } from '@bautakt/rechnen-termine';
import type {
  BeziehungZeile,
  IstZeile,
  SollTermine,
  Vergleich,
  Berechnung,
  KalenderDaten,
  PlanDaten,
  PlanZeile,
  RuhezeitZeile,
  VorgangMitEbene,
  VorgangTermine,
  VorgangZeile,
} from '../gemeinsam/typen.js';

/** Lesezugriff, wie ihn `PluginDb` und `Transaktion` gemeinsam bieten. */
export type Leser = Pick<PluginDb, 'lesen' | 'eins'>;

export function planLesen(db: Leser, planId: string): PlanZeile {
  const p = db.eins<PlanZeile>('SELECT * FROM t_plan WHERE id = ?', planId);
  if (!p) throw new BautaktFehler('NICHT_GEFUNDEN', 'Der Plan existiert nicht (mehr).');
  return p;
}

export function kalenderLesen(db: Leser, kalenderId: string | null): KalenderDaten {
  const k = kalenderId
    ? db.eins<{ id: string; arbeitstage: string; bundesland: string | null }>(
        'SELECT * FROM t_kalender WHERE id = ?',
        kalenderId,
      )
    : undefined;
  return {
    id: k?.id ?? '',
    arbeitstage: [...(k?.arbeitstage ?? '1111100')].map((c) => c === '1'),
    bundesland: k ? (k.bundesland === 'NW' ? 'NW' : null) : 'NW',
  };
}

export function vorgaengeLesen(db: Leser, planId: string): VorgangZeile[] {
  return db.lesen<VorgangZeile>(
    'SELECT * FROM t_vorgang WHERE plan_id = ? ORDER BY sortierung',
    planId,
  );
}

export function beziehungenLesen(db: Leser, planId: string): BeziehungZeile[] {
  return db.lesen<BeziehungZeile>(
    'SELECT * FROM t_beziehung WHERE plan_id = ? ORDER BY id',
    planId,
  );
}

/** Vorgänge in Baumreihenfolge (Gliederung, E-14), mit Ebene. */
export function alsBaum(vorgaenge: readonly VorgangZeile[]): VorgangMitEbene[] {
  const kinder = new Map<string | null, VorgangZeile[]>();
  const ids = new Set(vorgaenge.map((v) => v.id));
  for (const v of vorgaenge) {
    const p = v.parent_id && ids.has(v.parent_id) ? v.parent_id : null;
    const l = kinder.get(p);
    if (l) l.push(v);
    else kinder.set(p, [v]);
  }
  for (const l of kinder.values()) l.sort((a, b) => a.sortierung - b.sortierung);
  const ergebnis: VorgangMitEbene[] = [];
  const besucht = new Set<string>();
  const gehe = (parent: string | null, ebene: number) => {
    for (const v of kinder.get(parent) ?? []) {
      if (besucht.has(v.id)) continue;
      besucht.add(v.id);
      ergebnis.push({ ...v, ebene, hatKinder: (kinder.get(v.id)?.length ?? 0) > 0 });
      gehe(v.id, ebene + 1);
    }
  };
  gehe(null, 0);
  return ergebnis;
}

export function arbeitskalender(plan: PlanZeile, kalender: KalenderDaten, ruhe: RuhezeitZeile[]) {
  return new Arbeitskalender({
    start: plan.projektstart ?? heuteIso(),
    arbeitstage: kalender.arbeitstage,
    bundesland: kalender.bundesland,
    ruhezeiten: ruhe.map((r) => ({ von: r.von, bis: r.bis, name: r.name || 'Ruhezeit' })),
  });
}

export function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Anzeigedatum eines Zeitpunkts für Meilensteine: Ende des Arbeitstags AT t;
 * bei t ≤ 0 (Projektstart) der Beginn des ersten Arbeitstags.
 */
export function meilensteinDatum(kal: Arbeitskalender, t: number): string {
  return t >= 1 ? kal.endeDatum(t) : kal.anfangDatum(t);
}

/**
 * Je Vorgang die jüngste Ist-Meldung bis zum Stichtag (E-45). Ohne Stichtag: keine.
 */
export function istLesen(
  db: Leser,
  planId: string,
  stichtag: string | null,
): Record<string, IstZeile> {
  if (!stichtag) return {};
  const zeilen = db.lesen<IstZeile>(
    `SELECT i.* FROM t_ist i JOIN t_vorgang v ON v.id = i.vorgang_id
     WHERE v.plan_id = ? AND i.stichtag <= ? ORDER BY i.stichtag`,
    planId,
    stichtag,
  );
  const ergebnis: Record<string, IstZeile> = {};
  for (const z of zeilen) ergebnis[z.vorgang_id] = z; // spätere überschreiben frühere
  return ergebnis;
}

/** Restdauer nach E-43: eingetragene Restdauer, sonst ⌈Dauer × (100 − %) / 100⌉. */
export function restdauer(
  dauer: number,
  ist: Pick<IstZeile, 'restdauer_at' | 'fertig_prozent'>,
): number {
  if (ist.restdauer_at != null) return ist.restdauer_at;
  return Math.ceil((dauer * (100 - (ist.fertig_prozent ?? 0))) / 100);
}

/** Liest einen Plan vollständig und rechnet ihn (Architektur 4.1: Ergebnisse werden nicht gespeichert). */
export function planDatenLaden(
  db: Leser,
  planId: string,
  sollStandId: string | null = null,
  aktuelleVersion?: (bibId: string) => number | null,
): PlanDaten {
  const plan = planLesen(db, planId);
  const kalender = kalenderLesen(db, plan.kalender_id);
  const ruhezeiten = plan.kalender_id
    ? db.lesen<RuhezeitZeile>(
        'SELECT * FROM t_ruhezeit WHERE kalender_id = ? ORDER BY von',
        plan.kalender_id,
      )
    : [];
  const vorgaenge = alsBaum(vorgaengeLesen(db, planId));
  const beziehungen = beziehungenLesen(db, planId);
  const ist = istLesen(db, planId, plan.stichtag);
  const berechnung = rechnen(plan, kalender, ruhezeiten, vorgaenge, beziehungen, ist);
  const vergleich = sollStandId
    ? vergleichLesen(db, plan, kalender, ruhezeiten, sollStandId, berechnung)
    : null;
  const aufwand = aufwandHinweise(db, planId, aktuelleVersion);
  const orte = db.lesen<OrtZeile>('SELECT * FROM t_ort ORDER BY reihenfolge');
  return {
    plan,
    kalender,
    ruhezeiten,
    vorgaenge,
    beziehungen,
    berechnung,
    ist,
    vergleich,
    aufwand,
    orte,
  };
}

/** Soll-Termine aus einem Stand und Abweichung der aktuellen Prognose (E-46). */
function vergleichLesen(
  db: Leser,
  plan: PlanZeile,
  kalender: KalenderDaten,
  ruhezeiten: RuhezeitZeile[],
  standId: string,
  berechnung: Berechnung,
): Vergleich | null {
  const stand = db.eins<{ id: string; name: string }>(
    'SELECT id, name FROM stand WHERE id = ?',
    standId,
  );
  if (!stand) return null;
  const kal = arbeitskalender(plan, kalender, ruhezeiten);
  const zeilen = db.lesen<{
    orig_id: string;
    faz: number | null;
    fez: number | null;
    anfang: string | null;
    ende: string | null;
  }>(
    'SELECT orig_id, faz, fez, anfang, ende FROM t_vorgang_stand WHERE stand_id = ? AND plan_id = ?',
    standId,
    plan.id,
  );
  const termine: Record<string, SollTermine> = {};
  for (const z of zeilen) {
    if (z.faz === null || z.fez === null || !z.anfang || !z.ende) continue;
    const jetzt = berechnung.ok ? berechnung.termine[z.orig_id] : undefined;
    termine[z.orig_id] = {
      faz: z.faz,
      fez: z.fez,
      anfang: z.anfang,
      ende: z.ende,
      // Abweichung in AT des aktuellen Kalenders: Prognose-Ende − Soll-Ende
      abweichung: jetzt ? jetzt.fez - kal.zeitpunktSpaetestensBis(z.ende) : null,
    };
  }
  const p = db.eins<{ projektende_datum: string | null }>(
    'SELECT projektende_datum FROM t_plan_stand WHERE stand_id = ? AND orig_id = ?',
    standId,
    plan.id,
  );
  const sollEnde = p?.projektende_datum ?? null;
  return {
    standId: stand.id,
    standName: stand.name,
    termine,
    projektendeDatum: sollEnde,
    abweichungProjektende:
      sollEnde && berechnung.ok
        ? berechnung.projektende - kal.zeitpunktSpaetestensBis(sollEnde)
        : null,
  };
}

function rechnen(
  plan: PlanZeile,
  kalender: KalenderDaten,
  ruhezeiten: RuhezeitZeile[],
  vorgaenge: VorgangMitEbene[],
  beziehungen: BeziehungZeile[],
  istStand: Record<string, IstZeile>,
): Berechnung {
  try {
    const kal = arbeitskalender(plan, kalender, ruhezeiten);
    const stichtag = plan.stichtag ? kal.zeitpunktSpaetestensBis(plan.stichtag) : null;
    // Ist-Meldung → Zeitpunkte (Anfang = Beginn des Tages, Ende = Ende des Tages)
    const istEingabe = (v: VorgangMitEbene): VorgangEingabe['ist'] => {
      const i = istStand[v.id];
      if (!i?.ist_anfang || v.typ === 'sammel') return null;
      if (i.ist_ende) {
        const ende = kal.zeitpunktSpaetestensBis(i.ist_ende);
        return {
          anfang:
            v.typ === 'meilenstein'
              ? ende
              : Math.min(kal.zeitpunktFruehestensAb(i.ist_anfang), ende),
          ende,
        };
      }
      return { anfang: kal.zeitpunktFruehestensAb(i.ist_anfang), rest: restdauer(v.dauer_at, i) };
    };
    const eingaben: VorgangEingabe[] = vorgaenge.map((v) => ({
      ist: istEingabe(v),
      id: v.id,
      nr: v.nr,
      typ: v.typ,
      dauer: v.typ === 'meilenstein' ? 0 : v.dauer_at,
      parent: v.parent_id,
      fruehestensAb:
        v.bedingung_typ === 'nicht_frueher_als' && v.bedingung_datum
          ? kal.zeitpunktFruehestensAb(v.bedingung_datum)
          : null,
      spaetestensBis:
        v.bedingung_typ === 'muss_enden_am' && v.bedingung_datum
          ? kal.zeitpunktSpaetestensBis(v.bedingung_datum)
          : null,
    }));
    const sollEnde = plan.soll_ende ? kal.zeitpunktSpaetestensBis(plan.soll_ende) : null;
    const e = netzplanBerechnen(
      eingaben,
      beziehungen.map((b) => ({
        id: b.id,
        von: b.von_id,
        nach: b.nach_id,
        art: b.art,
        abstand: b.abstand,
        einheit: b.einheit,
      })),
      {
        kalender: kal,
        sollEnde,
        rueckwaertsVon:
          plan.rueckwaerts_von === 'soll_ende' && sollEnde !== null ? 'soll_ende' : 'berechnet',
        stichtag,
      },
    );
    const typ = new Map(vorgaenge.map((v) => [v.id, v.typ]));
    const termine: Record<string, VorgangTermine> = {};
    for (const [id, r] of e.vorgaenge) {
      const punkt = typ.get(id) === 'meilenstein' || r.fez === r.faz;
      termine[id] = {
        ...r,
        anfang: punkt ? meilensteinDatum(kal, r.faz) : kal.anfangDatum(r.faz),
        ende: punkt ? meilensteinDatum(kal, r.fez) : kal.endeDatum(r.fez),
        spaetAnfang: punkt ? meilensteinDatum(kal, r.saz) : kal.anfangDatum(r.saz),
        spaetEnde: punkt ? meilensteinDatum(kal, r.sez) : kal.endeDatum(r.sez),
      };
    }
    return {
      ok: true,
      termine,
      kritischeBeziehungen: e.beziehungen
        .filter((b) => b.kritisch && b.id)
        .map((b) => b.id as string),
      projektende: e.projektende,
      projektendeDatum: e.projektende >= 1 ? kal.endeDatum(e.projektende) : kal.anfangDatum(0),
      sollEnde,
      sollEndeDatum: plan.soll_ende,
      abweichungSollEnde: e.abweichungSollEnde,
      minGp: e.minGp,
    };
  } catch (err) {
    if (err instanceof NetzplanFehler || err instanceof Error)
      return { ok: false, fehler: err.message };
    throw err;
  }
}
