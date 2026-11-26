import { BautaktFehler, neueId, type BefehlDefinition } from '@bautakt/kern';
import { tagVonDatum } from '@bautakt/rechnen-kalender';
import { z } from 'zod';
import type { BeziehungZeile, VorgangZeile } from '../gemeinsam/typen.js';
import { zugehoerigeLoeschen } from './befehle.js';
import { heuteIso, planDatenLaden, planLesen } from './daten.js';

const fehler = (m: string) => new BautaktFehler('BEFEHL_DATEN', m);
const datum = z.string().refine((d) => {
  try {
    tagVonDatum(d);
    return true;
  } catch {
    return false;
  }
}, 'Ungültiges Datum');

const schema = z.object({
  ziel: z.discriminatedUnion('art', [
    z.object({ art: z.literal('neu') }),
    z.object({ art: z.literal('ersetzen'), planId: z.string().min(1) }),
  ]),
  plan: z.object({
    name: z.string().trim().min(1).max(300),
    projektstart: datum.nullable(),
    arbeitstage: z.array(z.boolean()).length(7),
    ruhezeiten: z.array(z.object({ von: datum, bis: datum, name: z.string().max(200) })).max(5000),
    stichtag: datum.nullable(),
  }),
  vorgaenge: z
    .array(
      z.object({
        schluessel: z.string().min(1),
        parent: z.string().nullable(),
        nr: z
          .string()
          .regex(/^[\p{L}\p{N}_.]+$/u)
          .max(30),
        name: z.string().min(1).max(300),
        typ: z.enum(['vorgang', 'sammel', 'meilenstein']),
        dauer: z.number().int().min(0).max(100_000),
        quelle_annahme: z.string().max(4000),
        anmerkung: z.string().max(4000),
        gewerk: z.string().max(200),
        rolle: z.string().max(200),
        bedingung_typ: z.enum(['keine', 'nicht_frueher_als', 'muss_enden_am']),
        bedingung_datum: datum.nullable(),
      }),
    )
    .max(20_000),
  beziehungen: z
    .array(
      z.object({
        von: z.string(),
        nach: z.string(),
        art: z.enum(['EA', 'AA', 'EE', 'AE']),
        abstand: z.number().int(),
        einheit: z.enum(['AT', 'KT']),
      }),
    )
    .max(100_000),
  ist: z
    .array(
      z.object({
        vorgang: z.string(),
        ist_anfang: datum.nullable(),
        ist_ende: datum.nullable(),
        fertig_prozent: z.number().int().min(0).max(99).nullable(),
      }),
    )
    .max(20_000),
});

/** MS-Project-Import (E-79): neuer Plan oder Ersatz des gewählten Plans – ein Undo-Schritt. */
export const IMPORT_BEFEHL = {
  name: 'plan.importieren',
  titel: 'Plan aus MS Project importieren',
  schema,
  ausfuehren(tx, d) {
    let planId: string;
    let kalenderId: string;
    if (d.ziel.art === 'ersetzen') {
      const plan = planLesen(tx, d.ziel.planId);
      planId = plan.id;
      // bisherige Vorgänge (mit Ist, Herleitung, MTA-Werten) und Beziehungen entfernen
      for (const b of tx.lesen<BeziehungZeile>(
        'SELECT * FROM t_beziehung WHERE plan_id = ?',
        planId,
      ))
        tx.loeschen('t_beziehung', b.id);
      const alte = tx.lesen<VorgangZeile>('SELECT * FROM t_vorgang WHERE plan_id = ?', planId);
      for (const v of alte) zugehoerigeLoeschen(tx, v.id);
      // Kinder vor Eltern löschen
      const ebene = (v: VorgangZeile): number => {
        let n = 0;
        for (let p = v.parent_id; p; p = alte.find((x) => x.id === p)?.parent_id ?? null) n++;
        return n;
      };
      for (const v of [...alte].sort((a, b) => ebene(b) - ebene(a))) tx.loeschen('t_vorgang', v.id);
      if (plan.kalender_id) {
        kalenderId = plan.kalender_id;
        for (const r of tx.lesen<{ id: string }>(
          'SELECT id FROM t_ruhezeit WHERE kalender_id = ?',
          kalenderId,
        ))
          tx.loeschen('t_ruhezeit', r.id);
        tx.aendern('t_kalender', kalenderId, {
          arbeitstage: d.plan.arbeitstage.map((a) => (a ? '1' : '0')).join(''),
          bundesland: null,
        });
      } else {
        kalenderId = neueId();
        tx.einfuegen('t_kalender', {
          id: kalenderId,
          arbeitstage: d.plan.arbeitstage.map((a) => (a ? '1' : '0')).join(''),
          bundesland: null,
        });
      }
      tx.aendern('t_plan', planId, {
        projektstart: d.plan.projektstart ?? plan.projektstart,
        kalender_id: kalenderId,
        stichtag: d.plan.stichtag,
      });
    } else {
      kalenderId = neueId();
      // Feiertage kommen als Ausnahmen aus der Datei → kein automatischer Feiertagskalender
      tx.einfuegen('t_kalender', {
        id: kalenderId,
        arbeitstage: d.plan.arbeitstage.map((a) => (a ? '1' : '0')).join(''),
        bundesland: null,
      });
      planId = neueId();
      tx.einfuegen('t_plan', {
        id: planId,
        name: d.plan.name,
        art: 'bauablauf',
        projektstart: d.plan.projektstart ?? heuteIso(),
        kalender_id: kalenderId,
        stichtag: d.plan.stichtag,
      });
    }
    for (const r of d.plan.ruhezeiten)
      tx.einfuegen('t_ruhezeit', {
        id: neueId(),
        kalender_id: kalenderId,
        von: r.von,
        bis: r.bis,
        name: r.name,
      });

    // Vorgänge in Dateireihenfolge, Gliederung über „parent“
    const id = new Map<string, string>();
    const sortierung = new Map<string | null, number>();
    for (const v of d.vorgaenge) {
      const neu = neueId();
      id.set(v.schluessel, neu);
      const parent = v.parent ? (id.get(v.parent) ?? null) : null;
      const s = (sortierung.get(parent) ?? 0) + 1;
      sortierung.set(parent, s);
      tx.einfuegen('t_vorgang', {
        id: neu,
        plan_id: planId,
        parent_id: parent,
        sortierung: s,
        nr: v.nr,
        name: v.name,
        typ: v.typ,
        dauer_at: v.typ === 'vorgang' ? v.dauer : 0,
        quelle_annahme: v.quelle_annahme,
        anmerkung: v.anmerkung,
        gewerk: v.gewerk,
        rolle: v.rolle,
        bedingung_typ: v.bedingung_typ,
        bedingung_datum: v.bedingung_datum,
        schnittstelle: 0,
      });
    }
    for (const b of d.beziehungen) {
      const von = id.get(b.von);
      const nach = id.get(b.nach);
      if (!von || !nach) continue;
      tx.einfuegen('t_beziehung', {
        id: neueId(),
        plan_id: planId,
        von_id: von,
        nach_id: nach,
        art: b.art,
        abstand: b.abstand,
        einheit: b.einheit,
      });
    }
    if (d.plan.stichtag)
      for (const i of d.ist) {
        const v = id.get(i.vorgang);
        if (!v) continue;
        tx.einfuegen('t_ist', {
          id: neueId(),
          vorgang_id: v,
          stichtag: d.plan.stichtag,
          ist_anfang: i.ist_anfang,
          ist_ende: i.ist_ende,
          fertig_prozent: i.ist_ende ? null : i.fertig_prozent,
          restdauer_at: null,
          ursache: null,
          ursache_text: '',
        });
      }
    // Netz muss rechenbar sein (z. B. kein Zirkelbezug)
    const r = planDatenLaden(tx, planId).berechnung;
    if (!r.ok) throw fehler(`Die Datei ergibt keinen rechenbaren Plan: ${r.fehler}`);
  },
} satisfies BefehlDefinition<z.infer<typeof schema>>;
